from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import bpy
import mathutils


@dataclass(frozen=True)
class OperationContext:
    workspace_root: Path
    allow_python_exec: bool


def _vec(value: Any, *, default: tuple[float, float, float]) -> tuple[float, float, float]:
    if value is None:
        return default
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError("Expected a 3-element vector")
    return (float(value[0]), float(value[1]), float(value[2]))


def _object(name: str) -> bpy.types.Object:
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise ValueError(f"Object not found: {name}")
    return obj


def _material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        raise ValueError(f"Material not found: {name}")
    return material


def _safe_path(raw: str, context: OperationContext) -> Path:
    root = context.workspace_root.expanduser().resolve()
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = root / path
    path = path.resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise PermissionError(f"Path must stay inside workspace: {root}") from exc
    return path


def _select_only(objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def op_system_status(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    return {
        "blender_version": bpy.app.version_string,
        "file": bpy.data.filepath,
        "scene": bpy.context.scene.name,
        "object_count": len(bpy.data.objects),
        "workspace_root": str(context.workspace_root),
        "python_exec_enabled": context.allow_python_exec,
    }


def op_scene_snapshot(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    scene = bpy.context.scene
    payload: dict[str, Any] = {
        "scene": scene.name,
        "frame": scene.frame_current,
        "frame_start": scene.frame_start,
        "frame_end": scene.frame_end,
        "active_object": bpy.context.active_object.name if bpy.context.active_object else None,
        "camera": scene.camera.name if scene.camera else None,
    }
    if params.get("include_objects", True):
        payload["objects"] = [
            {
                "name": obj.name,
                "type": obj.type,
                "location": list(obj.location),
                "rotation_euler": list(obj.rotation_euler),
                "scale": list(obj.scale),
                "visible": not obj.hide_viewport,
                "collection_names": [c.name for c in obj.users_collection],
            }
            for obj in scene.objects
        ]
    if params.get("include_materials", True):
        payload["materials"] = [
            {"name": material.name, "use_nodes": material.use_nodes}
            for material in bpy.data.materials
        ]
    if params.get("include_collections", True):
        payload["collections"] = [collection.name for collection in bpy.data.collections]
    return payload


def op_scene_save(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    raw_path = params.get("path")
    if raw_path:
        path = _safe_path(str(raw_path), context)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix.lower() != ".blend":
            path = path.with_suffix(".blend")
        bpy.ops.wm.save_as_mainfile(filepath=str(path))
    else:
        if not bpy.data.filepath:
            raise ValueError("Current scene has no path; provide a workspace .blend path")
        bpy.ops.wm.save_as_mainfile()
    return {"file": bpy.data.filepath}


def op_scene_new(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    if not params.get("confirm"):
        raise ValueError("confirm=true is required")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return {"scene": bpy.context.scene.name}


def op_create_primitive(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    kind = str(params["kind"]).lower()
    size = float(params.get("size", 2.0))
    location = _vec(params.get("location"), default=(0.0, 0.0, 0.0))
    rotation = _vec(params.get("rotation"), default=(0.0, 0.0, 0.0))
    scale = _vec(params.get("scale"), default=(1.0, 1.0, 1.0))

    operators: dict[str, Callable[..., Any]] = {
        "cube": bpy.ops.mesh.primitive_cube_add,
        "sphere": bpy.ops.mesh.primitive_uv_sphere_add,
        "uv_sphere": bpy.ops.mesh.primitive_uv_sphere_add,
        "ico_sphere": bpy.ops.mesh.primitive_ico_sphere_add,
        "cylinder": bpy.ops.mesh.primitive_cylinder_add,
        "cone": bpy.ops.mesh.primitive_cone_add,
        "plane": bpy.ops.mesh.primitive_plane_add,
        "torus": bpy.ops.mesh.primitive_torus_add,
    }
    operator = operators.get(kind)
    if operator is None:
        raise ValueError(f"Unsupported primitive: {kind}")

    if kind == "torus":
        operator(location=location, rotation=rotation)
        obj = bpy.context.active_object
        obj.scale = tuple(component * size / 2.0 for component in scale)
    else:
        operator(size=size, location=location, rotation=rotation)
        obj = bpy.context.active_object
        obj.scale = scale

    obj.name = str(params["name"])
    return {"name": obj.name, "type": obj.type}


def op_transform(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    obj = _object(str(params["name"]))
    if params.get("location") is not None:
        obj.location = _vec(params["location"], default=tuple(obj.location))
    if params.get("rotation") is not None:
        obj.rotation_euler = _vec(params["rotation"], default=tuple(obj.rotation_euler))
    if params.get("scale") is not None:
        obj.scale = _vec(params["scale"], default=tuple(obj.scale))
    return {
        "name": obj.name,
        "location": list(obj.location),
        "rotation_euler": list(obj.rotation_euler),
        "scale": list(obj.scale),
    }


def op_delete(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    obj = _object(str(params["name"]))
    name = obj.name
    bpy.data.objects.remove(obj, do_unlink=True)
    return {"deleted": name}


def op_duplicate(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    source = _object(str(params["name"]))
    copy = source.copy()
    if source.data is not None:
        copy.data = source.data.copy()
    copy.name = str(params["new_name"])
    target_collection = source.users_collection[0] if source.users_collection else bpy.context.collection
    target_collection.objects.link(copy)
    return {"name": copy.name, "source": source.name}


def op_material_create(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    name = str(params["name"])
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    node = material.node_tree.nodes.get("Principled BSDF") if material.node_tree else None
    if node is not None:
        color = params.get("base_color", [0.8, 0.8, 0.8, 1.0])
        if len(color) != 4:
            raise ValueError("base_color must contain 4 values")
        node.inputs["Base Color"].default_value = tuple(float(v) for v in color)
        node.inputs["Metallic"].default_value = float(params.get("metallic", 0.0))
        node.inputs["Roughness"].default_value = float(params.get("roughness", 0.5))
    return {"name": material.name}


def op_material_assign(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    obj = _object(str(params["object_name"]))
    material = _material(str(params["material_name"]))
    if not hasattr(obj.data, "materials"):
        raise ValueError(f"Object {obj.name} does not support materials")
    obj.data.materials.append(material)
    return {"object": obj.name, "material": material.name}


def op_modifier_add(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    obj = _object(str(params["object_name"]))
    modifier_type = str(params["modifier_type"]).upper()
    name = str(params.get("name") or modifier_type.title())
    modifier = obj.modifiers.new(name=name, type=modifier_type)
    for key, value in dict(params.get("settings") or {}).items():
        if key.startswith("_") or not hasattr(modifier, key):
            continue
        try:
            setattr(modifier, key, value)
        except (AttributeError, TypeError, ValueError):
            continue
    return {"object": obj.name, "modifier": modifier.name, "type": modifier.type}


def op_light_create(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    name = str(params["name"])
    light_type = str(params.get("light_type", "AREA")).upper()
    data = bpy.data.lights.new(name=f"{name}Data", type=light_type)
    data.energy = float(params.get("energy", 1000.0))
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = _vec(params.get("location"), default=(0.0, 0.0, 5.0))
    obj.rotation_euler = _vec(params.get("rotation"), default=(0.0, 0.0, 0.0))
    return {"name": obj.name, "type": data.type, "energy": data.energy}


def op_camera_create(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    name = str(params.get("name", "Camera"))
    data = bpy.data.cameras.new(name=f"{name}Data")
    data.lens = float(params.get("lens_mm", 50.0))
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = _vec(params.get("location"), default=(7.0, -7.0, 5.0))
    obj.rotation_euler = _vec(params.get("rotation"), default=(math.radians(63), 0.0, math.radians(45)))
    if params.get("make_active", True):
        bpy.context.scene.camera = obj
    return {"name": obj.name, "lens_mm": data.lens}


def op_keyframe_insert(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    obj = _object(str(params["object_name"]))
    frame = int(params["frame"])
    data_path = str(params["data_path"])
    values = _vec(params["values"], default=(0.0, 0.0, 0.0))
    if data_path == "location":
        obj.location = values
    elif data_path == "rotation_euler":
        obj.rotation_euler = values
    elif data_path == "scale":
        obj.scale = values
    else:
        raise ValueError(f"Unsupported data_path: {data_path}")
    obj.keyframe_insert(data_path=data_path, frame=frame)
    return {"object": obj.name, "frame": frame, "data_path": data_path}


def op_render_preview(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    path = _safe_path(str(params["path"]), context)
    path.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    old_path = scene.render.filepath
    old_x = scene.render.resolution_x
    old_y = scene.render.resolution_y
    old_percentage = scene.render.resolution_percentage
    try:
        scene.render.filepath = str(path)
        scene.render.resolution_x = int(params.get("resolution_x", 768))
        scene.render.resolution_y = int(params.get("resolution_y", 768))
        scene.render.resolution_percentage = 100
        if hasattr(scene, "cycles"):
            scene.cycles.samples = int(params.get("samples", 32))
        bpy.ops.render.render(write_still=True)
    finally:
        scene.render.filepath = old_path
        scene.render.resolution_x = old_x
        scene.render.resolution_y = old_y
        scene.render.resolution_percentage = old_percentage
    return {"path": str(path)}


def op_import(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    path = _safe_path(str(params["path"]), context)
    if not path.exists():
        raise FileNotFoundError(path)
    suffix = path.suffix.lower()
    before = set(bpy.data.objects.keys())

    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".fbx":
        if hasattr(bpy.ops.wm, "fbx_import"):
            bpy.ops.wm.fbx_import(filepath=str(path))
        else:
            bpy.ops.import_scene.fbx(filepath=str(path))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    elif suffix == ".stl":
        bpy.ops.wm.stl_import(filepath=str(path))
    else:
        raise ValueError(f"Unsupported import format: {suffix}")

    created = sorted(set(bpy.data.objects.keys()) - before)
    return {"path": str(path), "objects": created}


def op_export(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    path = _safe_path(str(params["path"]), context)
    path.parent.mkdir(parents=True, exist_ok=True)
    names = [str(v) for v in params.get("object_names", [])]
    objects = [_object(name) for name in names] if names else list(bpy.context.selected_objects)
    if not objects:
        raise ValueError("No objects selected for export")
    _select_only(objects)
    suffix = path.suffix.lower()

    if suffix == ".fbx":
        bpy.ops.export_scene.fbx(filepath=str(path), use_selection=True)
    elif suffix in {".glb", ".gltf"}:
        export_format = "GLB" if suffix == ".glb" else "GLTF_SEPARATE"
        bpy.ops.export_scene.gltf(
            filepath=str(path),
            export_format=export_format,
            use_selection=True,
        )
    elif suffix == ".obj":
        bpy.ops.wm.obj_export(filepath=str(path), export_selected_objects=True)
    elif suffix == ".stl":
        bpy.ops.wm.stl_export(filepath=str(path), export_selected_objects=True)
    else:
        raise ValueError(f"Unsupported export format: {suffix}")
    return {"path": str(path), "objects": [obj.name for obj in objects]}


def op_mesh_create(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    name = str(params["name"])
    vertices = [tuple(float(x) for x in vertex) for vertex in params.get("vertices", [])]
    faces = [tuple(int(x) for x in face) for face in params.get("faces", [])]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return {"name": obj.name, "vertices": len(vertices), "faces": len(faces)}


def op_uv_smart_project(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    obj = _object(str(params["object_name"]))
    if obj.type != "MESH":
        raise ValueError("UV projection requires a mesh")
    _select_only([obj])
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=float(params.get("angle_limit", math.radians(66))))
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
    return {"object": obj.name, "uv_layers": len(obj.data.uv_layers)}


def op_armature_create(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    name = str(params.get("name", "Armature"))
    bpy.ops.object.armature_add(
        enter_editmode=False,
        location=_vec(params.get("location"), default=(0.0, 0.0, 0.0)),
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = f"{name}Data"
    return {"name": obj.name}


def op_armature_add_bone(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    armature = _object(str(params["armature_name"]))
    if armature.type != "ARMATURE":
        raise ValueError("Target object is not an armature")
    _select_only([armature])
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bone = armature.data.edit_bones.new(str(params["bone_name"]))
        bone.head = _vec(params.get("head"), default=(0.0, 0.0, 0.0))
        bone.tail = _vec(params.get("tail"), default=(0.0, 0.0, 1.0))
        parent_name = params.get("parent")
        if parent_name:
            parent = armature.data.edit_bones.get(str(parent_name))
            if parent is None:
                raise ValueError(f"Parent bone not found: {parent_name}")
            bone.parent = parent
            bone.use_connect = bool(params.get("connected", False))
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
    return {"armature": armature.name, "bone": str(params["bone_name"])}


def op_parent_auto_weights(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    mesh = _object(str(params["mesh_name"]))
    armature = _object(str(params["armature_name"]))
    if mesh.type != "MESH" or armature.type != "ARMATURE":
        raise ValueError("Expected mesh and armature objects")
    _select_only([mesh, armature])
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    return {"mesh": mesh.name, "armature": armature.name}


def op_python_execute(params: dict[str, Any], context: OperationContext) -> dict[str, Any]:
    if not context.allow_python_exec:
        raise PermissionError("Python execution is disabled in Blender preferences")
    code = str(params.get("code", ""))
    namespace: dict[str, Any] = {
        "__name__": "__nexora_forge_exec__",
        "bpy": bpy,
        "mathutils": mathutils,
        "workspace_root": context.workspace_root,
    }
    exec(compile(code, "<nexora-forge-mcp>", "exec"), namespace, namespace)
    result = namespace.get("result")
    if isinstance(result, (str, int, float, bool, type(None), list, dict, tuple)):
        return {"result": result}
    return {"result": repr(result)}


OPERATIONS: dict[str, Callable[[dict[str, Any], OperationContext], dict[str, Any]]] = {
    "system.status": op_system_status,
    "scene.snapshot": op_scene_snapshot,
    "scene.save": op_scene_save,
    "scene.new": op_scene_new,
    "object.create_primitive": op_create_primitive,
    "object.transform": op_transform,
    "object.delete": op_delete,
    "object.duplicate": op_duplicate,
    "material.create": op_material_create,
    "material.assign": op_material_assign,
    "modifier.add": op_modifier_add,
    "light.create": op_light_create,
    "camera.create": op_camera_create,
    "animation.keyframe_insert": op_keyframe_insert,
    "render.preview": op_render_preview,
    "io.import": op_import,
    "io.export": op_export,
    "mesh.create": op_mesh_create,
    "uv.smart_project": op_uv_smart_project,
    "armature.create": op_armature_create,
    "armature.add_bone": op_armature_add_bone,
    "rig.parent_auto_weights": op_parent_auto_weights,
    "python.execute": op_python_execute,
}


def dispatch_operation(
    operation: str,
    params: dict[str, Any],
    context: OperationContext,
) -> dict[str, Any]:
    if operation == "batch.execute":
        steps = params.get("steps", [])
        if not isinstance(steps, list) or len(steps) > 100:
            raise ValueError("Invalid batch")
        results: list[dict[str, Any]] = []
        for index, step in enumerate(steps):
            if not isinstance(step, dict):
                raise ValueError(f"Batch step {index} must be an object")
            nested_operation = str(step.get("operation", ""))
            if nested_operation in {"batch.execute", "python.execute"}:
                raise PermissionError(f"{nested_operation} is not allowed inside a batch")
            nested_params = step.get("params", {})
            if not isinstance(nested_params, dict):
                raise ValueError(f"Batch step {index} params must be an object")
            results.append(
                {
                    "index": index,
                    "operation": nested_operation,
                    "result": dispatch_operation(nested_operation, nested_params, context),
                }
            )
        return {"steps": results}

    handler = OPERATIONS.get(operation)
    if handler is None:
        raise ValueError(f"Unknown operation: {operation}")
    return handler(params, context)
