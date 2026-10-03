from __future__ import annotations

import os

import bpy
from bpy.props import BoolProperty, IntProperty, StringProperty
from bpy.types import AddonPreferences, Operator, Panel

from .bridge import bridge_runtime

bl_info = {
    "name": "Nexora Forge MCP",
    "author": "Ghost Developer",
    "version": (0, 2, 0),
    "blender": (4, 5, 0),
    "location": "View3D > Sidebar > Nexora Forge",
    "description": "Secure local bridge for AI-driven Blender automation",
    "category": "Development",
}


class NEXORA_Preferences(AddonPreferences):
    bl_idname = __package__ or "blender_extension"

    port: IntProperty(name="Bridge Port", default=9876, min=1024, max=65535)
    bridge_secret: StringProperty(
        name="Bridge Secret",
        subtype="PASSWORD",
        default=os.getenv("NEXORA_BRIDGE_SECRET", ""),
    )
    workspace_root: StringProperty(
        name="Workspace",
        subtype="DIR_PATH",
        default=os.getenv("NEXORA_WORKSPACE_ROOT", "//NexoraForgeWorkspace"),
    )
    allow_python_exec: BoolProperty(
        name="Allow unrestricted Blender Python",
        default=False,
        description="Powerful and unsafe. Enable only when you intentionally need full bpy automation.",
    )

    def draw(self, context: bpy.types.Context) -> None:
        layout = self.layout
        layout.prop(self, "port")
        layout.prop(self, "bridge_secret")
        layout.prop(self, "workspace_root")
        layout.prop(self, "allow_python_exec")
        layout.label(text="Bridge host is fixed to 127.0.0.1 for security.")


class NEXORA_OT_StartBridge(Operator):
    bl_idname = "nexora.start_bridge"
    bl_label = "Start Nexora Bridge"
    bl_description = "Start the localhost bridge for the MCP gateway"

    def execute(self, context: bpy.types.Context):
        prefs = context.preferences.addons[__package__].preferences
        if len(prefs.bridge_secret) < 32:
            self.report({"ERROR"}, "Bridge secret must contain at least 32 characters")
            return {"CANCELLED"}
        try:
            bridge_runtime.start(
                port=prefs.port,
                secret=prefs.bridge_secret,
                workspace_root=prefs.workspace_root,
                allow_python_exec=prefs.allow_python_exec,
            )
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}
        self.report({"INFO"}, f"Nexora bridge listening on 127.0.0.1:{prefs.port}")
        return {"FINISHED"}


class NEXORA_OT_StopBridge(Operator):
    bl_idname = "nexora.stop_bridge"
    bl_label = "Stop Nexora Bridge"

    def execute(self, context: bpy.types.Context):
        bridge_runtime.stop()
        self.report({"INFO"}, "Nexora bridge stopped")
        return {"FINISHED"}


class NEXORA_PT_BridgePanel(Panel):
    bl_label = "Nexora Forge MCP"
    bl_idname = "NEXORA_PT_bridge"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Nexora Forge"

    def draw(self, context: bpy.types.Context) -> None:
        layout = self.layout
        state = bridge_runtime.status()
        layout.label(text=f"Status: {state['status']}")
        if state.get("port"):
            layout.label(text=f"127.0.0.1:{state['port']}")
        row = layout.row(align=True)
        row.operator("nexora.start_bridge", icon="PLAY")
        row.operator("nexora.stop_bridge", icon="PAUSE")
        layout.separator()
        layout.label(text="Settings: Edit > Preferences > Add-ons")


classes = (
    NEXORA_Preferences,
    NEXORA_OT_StartBridge,
    NEXORA_OT_StopBridge,
    NEXORA_PT_BridgePanel,
)


def register() -> None:
    for cls in classes:
        bpy.utils.register_class(cls)
    bridge_runtime.install_timer()


def unregister() -> None:
    bridge_runtime.stop()
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
