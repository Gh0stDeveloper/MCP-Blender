from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any, Literal

import uvicorn
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import Image, MCPServer
from mcp.types import ToolAnnotations
from pydantic import AnyHttpUrl
from starlette.requests import Request
from starlette.responses import JSONResponse

from .audit import AuditLogger
from .auth import IntrospectionTokenVerifier
from .bridge import BlenderBridgeClient, BlenderBridgeError
from .config import get_settings
from .security import BearerTokenMiddleware

logger = logging.getLogger("nexora_forge_mcp")

settings = get_settings()
audit = AuditLogger(settings.audit_log)
bridge = BlenderBridgeClient(
    base_url=settings.bridge_url,
    secret=settings.bridge_secret,
    timeout_seconds=settings.request_timeout_seconds,
)

def _create_mcp() -> Any:
    common = {
        "title": "Nexora Forge MCP",
        "description": "Secure AI-native Blender production gateway",
        "version": "0.2.0",
        "instructions": (
            "Use structured Blender tools first. Prefer batch_execute for multi-step edits. "
            "Inspect the scene before destructive changes and save checkpoints during long jobs. "
            "Unrestricted Python execution is an explicit opt-in capability."
        ),
    }
    if settings.auth_mode == "oauth":
        return MCPServer(
            "Nexora Forge MCP",
            token_verifier=IntrospectionTokenVerifier(settings),
            auth=AuthSettings(
                issuer_url=AnyHttpUrl(settings.oauth_issuer_url),
                resource_server_url=AnyHttpUrl(settings.oauth_resource_url),
                required_scopes=settings.oauth_scope_list(),
                validate_token_resource=True,
            ),
            **common,
        )
    return MCPServer("Nexora Forge MCP", **common)


mcp = _create_mcp()

READ_ONLY = ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
WRITE_TOOL = ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
DESTRUCTIVE_TOOL = ToolAnnotations(read_only_hint=False, destructive_hint=True, idempotent_hint=False, open_world_hint=False)
UNRESTRICTED_TOOL = ToolAnnotations(read_only_hint=False, destructive_hint=True, idempotent_hint=False, open_world_hint=True)


def _assert_permission(*, mutating: bool = False, unrestricted: bool = False) -> None:
    profile = settings.permission_profile
    if mutating and profile == "safe":
        raise PermissionError("This operation is disabled by the safe permission profile")
    if unrestricted and profile != "unrestricted":
        raise PermissionError("This operation requires NEXORA_PERMISSION_PROFILE=unrestricted")
    if unrestricted and not settings.allow_python_exec:
        raise PermissionError("Set NEXORA_ALLOW_PYTHON_EXEC=true to enable Python execution")

    if settings.auth_mode == "oauth":
        token = get_access_token()
        if token is None:
            raise PermissionError("Authenticated OAuth context is required")
        scopes = set(token.scopes)
        needed = "blender:write" if mutating else "blender:read"
        if needed not in scopes:
            raise PermissionError(f"OAuth token is missing required scope: {needed}")
        if unrestricted and "blender:python" not in scopes:
            raise PermissionError("OAuth token is missing required scope: blender:python")


def _guard_workspace_path(raw_path: str) -> str:
    root = settings.resolved_workspace_root
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    candidate = candidate.resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise PermissionError(f"Path must stay inside workspace: {root}") from exc
    return str(candidate)


async def _call(
    operation: str,
    params: dict[str, Any] | None = None,
    *,
    mutating: bool = False,
    unrestricted: bool = False,
) -> dict[str, Any]:
    _assert_permission(mutating=mutating, unrestricted=unrestricted)
    request_id = str(uuid.uuid4())
    payload = params or {}
    try:
        result = await bridge.execute(
            operation=operation,
            params=payload,
            request_id=request_id,
        )
    except Exception as exc:
        audit.write(
            request_id=request_id,
            operation=operation,
            params=payload,
            status="error",
            detail=str(exc),
        )
        raise
    audit.write(
        request_id=request_id,
        operation=operation,
        params=payload,
        status="ok",
    )
    return {"request_id": request_id, **result}


@mcp.custom_route("/health", methods=["GET"])  # type: ignore[untyped-decorator]
async def health(_: Request) -> JSONResponse:
    try:
        blender = await bridge.health()
        bridge_status = "online"
    except BlenderBridgeError as exc:
        blender = {"error": str(exc)}
        bridge_status = "offline"
    public_blender = (
        {"blender_version": blender.get("blender_version")}
        if bridge_status == "online"
        else {"error": "bridge_unavailable"}
    )
    return JSONResponse(
        {
            "service": "Nexora Forge MCP",
            "version": "0.2.0",
            "status": "ok",
            "auth_mode": settings.auth_mode,
            "bridge_status": bridge_status,
            "blender": public_blender,
        }
    )


@mcp.tool(annotations=READ_ONLY)
async def blender_status() -> dict[str, Any]:
    """Return Blender bridge status, Blender version, current file and scene metadata."""
    return await _call("system.status")


@mcp.tool(annotations=READ_ONLY)
async def scene_snapshot(
    include_objects: bool = True,
    include_materials: bool = True,
    include_collections: bool = True,
) -> dict[str, Any]:
    """Inspect the active scene before planning edits."""
    return await _call(
        "scene.snapshot",
        {
            "include_objects": include_objects,
            "include_materials": include_materials,
            "include_collections": include_collections,
        },
    )


@mcp.tool(annotations=WRITE_TOOL)
async def scene_save(path: str | None = None) -> dict[str, Any]:
    """Save the Blender project; optional paths are restricted to the configured workspace."""
    params: dict[str, Any] = {}
    if path:
        params["path"] = _guard_workspace_path(path)
    return await _call("scene.save", params, mutating=True)


@mcp.tool(annotations=DESTRUCTIVE_TOOL)
async def scene_new(confirm: bool = False) -> dict[str, Any]:
    """Start a clean scene. confirm must be true because this is destructive."""
    if not confirm:
        raise ValueError("confirm=true is required")
    return await _call("scene.new", {"confirm": True}, mutating=True)


@mcp.tool(annotations=WRITE_TOOL)
async def create_primitive(
    kind: Literal["cube", "sphere", "uv_sphere", "ico_sphere", "cylinder", "cone", "plane", "torus"],
    name: str,
    location: list[float] | None = None,
    rotation: list[float] | None = None,
    scale: list[float] | None = None,
    size: float = 2.0,
) -> dict[str, Any]:
    """Create a mesh primitive with transform data."""
    return await _call(
        "object.create_primitive",
        {
            "kind": kind,
            "name": name,
            "location": location or [0.0, 0.0, 0.0],
            "rotation": rotation or [0.0, 0.0, 0.0],
            "scale": scale or [1.0, 1.0, 1.0],
            "size": size,
        },
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def transform_object(
    name: str,
    location: list[float] | None = None,
    rotation: list[float] | None = None,
    scale: list[float] | None = None,
) -> dict[str, Any]:
    """Set location, Euler rotation and/or scale for an object."""
    return await _call(
        "object.transform",
        {"name": name, "location": location, "rotation": rotation, "scale": scale},
        mutating=True,
    )


@mcp.tool(annotations=DESTRUCTIVE_TOOL)
async def delete_object(name: str, confirm: bool = False) -> dict[str, Any]:
    """Delete one Blender object by name."""
    if not confirm:
        raise ValueError("confirm=true is required")
    return await _call("object.delete", {"name": name}, mutating=True)


@mcp.tool(annotations=WRITE_TOOL)
async def duplicate_object(name: str, new_name: str) -> dict[str, Any]:
    """Duplicate an object and its mesh datablock."""
    return await _call(
        "object.duplicate",
        {"name": name, "new_name": new_name},
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def create_material(
    name: str,
    base_color: list[float] | None = None,
    metallic: float = 0.0,
    roughness: float = 0.5,
) -> dict[str, Any]:
    """Create or update a Principled BSDF material."""
    return await _call(
        "material.create",
        {
            "name": name,
            "base_color": base_color or [0.8, 0.8, 0.8, 1.0],
            "metallic": metallic,
            "roughness": roughness,
        },
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def assign_material(object_name: str, material_name: str) -> dict[str, Any]:
    """Assign an existing material to an object."""
    return await _call(
        "material.assign",
        {"object_name": object_name, "material_name": material_name},
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def add_modifier(
    object_name: str,
    modifier_type: str,
    name: str | None = None,
    settings_map: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Add a Blender modifier and set supported writable properties."""
    return await _call(
        "modifier.add",
        {
            "object_name": object_name,
            "modifier_type": modifier_type,
            "name": name,
            "settings": settings_map or {},
        },
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def create_light(
    name: str,
    light_type: Literal["POINT", "SUN", "SPOT", "AREA"] = "AREA",
    energy: float = 1000.0,
    location: list[float] | None = None,
    rotation: list[float] | None = None,
) -> dict[str, Any]:
    """Create a production light."""
    return await _call(
        "light.create",
        {
            "name": name,
            "light_type": light_type,
            "energy": energy,
            "location": location or [0.0, 0.0, 5.0],
            "rotation": rotation or [0.0, 0.0, 0.0],
        },
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def create_camera(
    name: str = "Camera",
    location: list[float] | None = None,
    rotation: list[float] | None = None,
    lens_mm: float = 50.0,
    make_active: bool = True,
) -> dict[str, Any]:
    """Create and optionally activate a camera."""
    return await _call(
        "camera.create",
        {
            "name": name,
            "location": location or [7.0, -7.0, 5.0],
            "rotation": rotation or [1.1, 0.0, 0.78],
            "lens_mm": lens_mm,
            "make_active": make_active,
        },
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def keyframe_insert(
    object_name: str,
    frame: int,
    data_path: Literal["location", "rotation_euler", "scale"],
    values: list[float],
) -> dict[str, Any]:
    """Set transform values and insert a keyframe for animation."""
    return await _call(
        "animation.keyframe_insert",
        {
            "object_name": object_name,
            "frame": frame,
            "data_path": data_path,
            "values": values,
        },
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def render_preview(
    filename: str = "preview.png",
    resolution_x: int = 768,
    resolution_y: int = 768,
    samples: int = 32,
) -> dict[str, Any]:
    """Render a preview image into the configured workspace."""
    output_path = _guard_workspace_path(filename)
    return await _call(
        "render.preview",
        {
            "path": output_path,
            "resolution_x": resolution_x,
            "resolution_y": resolution_y,
            "samples": samples,
        },
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def render_preview_image(
    filename: str = "preview.png",
    resolution_x: int = 768,
    resolution_y: int = 768,
    samples: int = 32,
) -> Image:
    """Render a preview and return it as native MCP image content for visual inspection."""
    output_path = _guard_workspace_path(filename)
    payload = await _call(
        "render.preview",
        {
            "path": output_path,
            "resolution_x": resolution_x,
            "resolution_y": resolution_y,
            "samples": samples,
        },
        mutating=True,
    )
    result = payload.get("result")
    if not isinstance(result, dict):
        raise RuntimeError("Blender bridge did not return render metadata")
    rendered_path = result.get("path")
    if not isinstance(rendered_path, str):
        raise RuntimeError("Blender bridge did not return a render path")
    return Image(path=rendered_path)


@mcp.tool(annotations=WRITE_TOOL)
async def import_asset(path: str) -> dict[str, Any]:
    """Import a supported FBX, OBJ, glTF/GLB or STL asset from the workspace."""
    return await _call(
        "io.import",
        {"path": _guard_workspace_path(path)},
        mutating=True,
    )


@mcp.tool(annotations=DESTRUCTIVE_TOOL)
async def export_asset(
    path: str,
    object_names: list[str] | None = None,
) -> dict[str, Any]:
    """Export selected named objects to FBX, OBJ, GLB/GLTF or STL inside the workspace."""
    return await _call(
        "io.export",
        {
            "path": _guard_workspace_path(path),
            "object_names": object_names or [],
        },
        mutating=True,
    )


@mcp.tool(annotations=DESTRUCTIVE_TOOL)
async def batch_execute(steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Execute multiple structured Blender operations in order with one bridge round-trip."""
    if len(steps) > 100:
        raise ValueError("A batch may contain at most 100 steps")
    forbidden = {"python.execute", "scene.open"}
    for step in steps:
        operation = str(step.get("operation", ""))
        if operation in forbidden:
            raise PermissionError(f"{operation} is not allowed inside batch_execute")
    return await _call("batch.execute", {"steps": steps}, mutating=True)


@mcp.tool(annotations=UNRESTRICTED_TOOL)
async def blender_execute_python(code: str) -> dict[str, Any]:
    """Execute Blender Python. Requires unrestricted profile and explicit opt-in."""
    if len(code) > 100_000:
        raise ValueError("Python payload is too large")
    return await _call(
        "python.execute",
        {"code": code},
        mutating=True,
        unrestricted=True,
    )


@mcp.tool(annotations=READ_ONLY)
async def nexora_capabilities() -> dict[str, Any]:
    """Describe server permission mode and supported workflow categories."""
    return {
        "name": "Nexora Forge MCP",
        "version": "0.2.0",
        "auth_mode": settings.auth_mode,
        "permission_profile": settings.permission_profile,
        "python_exec_enabled": (
            settings.permission_profile == "unrestricted" and settings.allow_python_exec
        ),
        "categories": [
            "scene",
            "objects",
            "materials",
            "modifiers",
            "lighting",
            "cameras",
            "animation",
            "rendering",
            "import_export",
            "batch",
            "optional_python",
        ],
        "workspace_root": ("<configured>" if settings.auth_mode == "oauth" else str(settings.resolved_workspace_root)),
    }



@mcp.tool(annotations=WRITE_TOOL)
async def create_mesh(
    name: str,
    vertices: list[list[float]],
    faces: list[list[int]],
) -> dict[str, Any]:
    """Create an arbitrary mesh from vertices and polygon indices."""
    if len(vertices) > 2_000_000 or len(faces) > 2_000_000:
        raise ValueError("Mesh payload exceeds the safety limit")
    return await _call(
        "mesh.create",
        {"name": name, "vertices": vertices, "faces": faces},
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def smart_uv_project(
    object_name: str,
    angle_limit: float = 1.1519173063162575,
) -> dict[str, Any]:
    """Generate a Smart UV Project for a mesh object."""
    return await _call(
        "uv.smart_project",
        {"object_name": object_name, "angle_limit": angle_limit},
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def create_armature(
    name: str = "Armature",
    location: list[float] | None = None,
) -> dict[str, Any]:
    """Create an armature object for character, creature or prop rigging."""
    return await _call(
        "armature.create",
        {"name": name, "location": location or [0.0, 0.0, 0.0]},
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def add_bone(
    armature_name: str,
    bone_name: str,
    head: list[float],
    tail: list[float],
    parent: str | None = None,
    connected: bool = False,
) -> dict[str, Any]:
    """Add a bone to an armature with optional parenting."""
    return await _call(
        "armature.add_bone",
        {
            "armature_name": armature_name,
            "bone_name": bone_name,
            "head": head,
            "tail": tail,
            "parent": parent,
            "connected": connected,
        },
        mutating=True,
    )


@mcp.tool(annotations=WRITE_TOOL)
async def parent_with_auto_weights(
    mesh_name: str,
    armature_name: str,
) -> dict[str, Any]:
    """Parent a mesh to an armature using Blender automatic weights."""
    return await _call(
        "rig.parent_auto_weights",
        {"mesh_name": mesh_name, "armature_name": armature_name},
        mutating=True,
    )


@mcp.tool(annotations=DESTRUCTIVE_TOOL)
async def structured_blender_operation(
    operation: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Call an allowlisted structured bridge operation not covered by a dedicated tool."""
    allowed = {
        "system.status",
        "scene.snapshot",
        "scene.save",
        "object.create_primitive",
        "object.transform",
        "object.delete",
        "object.duplicate",
        "material.create",
        "material.assign",
        "modifier.add",
        "light.create",
        "camera.create",
        "animation.keyframe_insert",
        "render.preview",
        "io.import",
        "io.export",
        "mesh.create",
        "uv.smart_project",
        "armature.create",
        "armature.add_bone",
        "rig.parent_auto_weights",
    }
    if operation not in allowed:
        raise PermissionError(f"Operation is not exposed through structured_blender_operation: {operation}")
    read_only = {"system.status", "scene.snapshot"}
    return await _call(operation, params or {}, mutating=operation not in read_only)

def build_app() -> Any:
    raw_app = mcp.streamable_http_app(
        host=settings.gateway_host,
        json_response=True,
        stateless_http=True,
        max_request_body_size=8 * 1024 * 1024,
        transport_security=settings.transport_security(),
    )
    if settings.auth_mode == "static":
        return BearerTokenMiddleware(
            raw_app,
            token=settings.public_token,
            exempt_paths={"/health"},
        )
    return raw_app


app = build_app()


def main() -> None:
    settings.validate_runtime()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logger.info("Starting Nexora Forge MCP on %s:%s", settings.gateway_host, settings.gateway_port)
    uvicorn.run(
        app,
        host=settings.gateway_host,
        port=settings.gateway_port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
