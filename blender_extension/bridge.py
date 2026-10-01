from __future__ import annotations

import hmac
import json
import queue
import threading
import time
import uuid
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import bpy

from .operations import OperationContext, dispatch_operation


@dataclass
class Job:
    operation: str
    params: dict[str, Any]
    request_id: str
    event: threading.Event = field(default_factory=threading.Event)
    result: dict[str, Any] | None = None
    error: str | None = None


class BridgeRuntime:
    def __init__(self) -> None:
        self._queue: queue.Queue[Job] = queue.Queue()
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self._secret = ""
        self._port: int | None = None
        self._workspace_root = Path.cwd()
        self._allow_python_exec = False
        self._lock = threading.RLock()
        self._timer_installed = False

    def install_timer(self) -> None:
        with self._lock:
            if self._timer_installed:
                return
            bpy.app.timers.register(self._process_queue, first_interval=0.1, persistent=True)
            self._timer_installed = True

    def _process_queue(self) -> float:
        for _ in range(20):
            try:
                job = self._queue.get_nowait()
            except queue.Empty:
                break

            try:
                context = OperationContext(
                    workspace_root=self._workspace_root,
                    allow_python_exec=self._allow_python_exec,
                )
                job.result = dispatch_operation(job.operation, job.params, context)
            except Exception as exc:
                job.error = f"{type(exc).__name__}: {exc}"
            finally:
                job.event.set()
                self._queue.task_done()
        return 0.05

    def start(
        self,
        *,
        port: int,
        secret: str,
        workspace_root: str,
        allow_python_exec: bool,
    ) -> None:
        with self._lock:
            self.install_timer()
            if self._server is not None:
                if self._port == port and hmac.compare_digest(self._secret, secret):
                    self._allow_python_exec = allow_python_exec
                    self._workspace_root = self._resolve_workspace(workspace_root)
                    return
                self.stop()

            self._secret = secret
            self._port = port
            self._workspace_root = self._resolve_workspace(workspace_root)
            self._workspace_root.mkdir(parents=True, exist_ok=True)
            self._allow_python_exec = allow_python_exec

            runtime = self

            class Handler(BaseHTTPRequestHandler):
                server_version = "NexoraForgeBridge/0.1"

                def log_message(self, format: str, *args: Any) -> None:
                    print(f"[Nexora Forge] {format % args}")

                def _send_json(self, status: int, payload: dict[str, Any]) -> None:
                    body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
                    self.send_response(status)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(body)

                def do_GET(self) -> None:
                    if self.path != "/health":
                        self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                        return
                    self._send_json(
                        HTTPStatus.OK,
                        {
                            "status": "ok",
                            "service": "Nexora Forge Blender Bridge",
                            "blender_version": bpy.app.version_string,
                            "file": bpy.data.filepath,
                            "python_exec_enabled": runtime._allow_python_exec,
                        },
                    )

                def do_POST(self) -> None:
                    if self.path != "/v1/execute":
                        self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                        return

                    provided = self.headers.get("X-Nexora-Bridge-Secret", "")
                    if not runtime._secret or not hmac.compare_digest(provided, runtime._secret):
                        self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
                        return

                    try:
                        length = int(self.headers.get("Content-Length", "0"))
                    except ValueError:
                        self._send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_content_length"})
                        return
                    if length <= 0 or length > 4 * 1024 * 1024:
                        self._send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "invalid_body_size"})
                        return

                    try:
                        payload = json.loads(self.rfile.read(length).decode("utf-8"))
                    except Exception:
                        self._send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_json"})
                        return

                    operation = str(payload.get("operation", "")).strip()
                    params = payload.get("params", {})
                    request_id = str(payload.get("request_id") or uuid.uuid4())
                    if not operation or not isinstance(params, dict):
                        self._send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_request"})
                        return

                    job = Job(operation=operation, params=params, request_id=request_id)
                    runtime._queue.put(job)
                    if not job.event.wait(timeout=300):
                        self._send_json(
                            HTTPStatus.GATEWAY_TIMEOUT,
                            {"error": "blender_operation_timeout", "request_id": request_id},
                        )
                        return
                    if job.error:
                        self._send_json(
                            HTTPStatus.BAD_REQUEST,
                            {"error": job.error, "request_id": request_id},
                        )
                        return
                    self._send_json(
                        HTTPStatus.OK,
                        {"ok": True, "request_id": request_id, "result": job.result},
                    )

            self._server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            self._thread = threading.Thread(
                target=self._server.serve_forever,
                name="NexoraForgeBridge",
                daemon=True,
            )
            self._thread.start()

    def stop(self) -> None:
        with self._lock:
            server = self._server
            self._server = None
            self._thread = None
            self._port = None
            if server is not None:
                server.shutdown()
                server.server_close()

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "status": "running" if self._server is not None else "stopped",
                "port": self._port,
                "queue_size": self._queue.qsize(),
                "python_exec_enabled": self._allow_python_exec,
            }

    @staticmethod
    def _resolve_workspace(value: str) -> Path:
        if value.startswith("//"):
            base = Path(bpy.path.abspath("//"))
            return (base / value[2:]).expanduser().resolve()
        return Path(bpy.path.abspath(value)).expanduser().resolve()


bridge_runtime = BridgeRuntime()
