from __future__ import annotations

import json
import mimetypes
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


AGENT_VERSION = "0.1.0"


class AgentError(RuntimeError):
    pass


class NexoraDeviceAgent:
    def __init__(self) -> None:
        self.cloud_url = os.environ["NEXORA_CLOUD_URL"].rstrip("/")
        self.device_token = os.environ["NEXORA_DEVICE_TOKEN"]
        self.bridge_url = os.environ.get("NEXORA_BRIDGE_URL", "http://127.0.0.1:9876").rstrip("/")
        self.bridge_secret = os.environ["NEXORA_BRIDGE_SECRET"]
        self.poll_seconds = max(2.0, float(os.environ.get("NEXORA_DEVICE_POLL_SECONDS", "5")))
        self.http_timeout = max(5.0, float(os.environ.get("NEXORA_DEVICE_HTTP_TIMEOUT", "180")))

    def _json_request(
        self,
        url: str,
        *,
        method: str = "GET",
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        device_auth: bool = False,
    ) -> dict[str, Any]:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request_headers = {"Accept": "application/json", **(headers or {})}
        if data is not None:
            request_headers["Content-Type"] = "application/json"
        if device_auth:
            request_headers["Authorization"] = f"Bearer {self.device_token}"
        req = urllib.request.Request(url, data=data, headers=request_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.http_timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:1000]
            raise AgentError(f"HTTP {exc.code} from {url}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise AgentError(f"Cannot reach {url}: {exc}") from exc
        if not raw:
            return {}
        parsed = json.loads(raw.decode("utf-8"))
        if not isinstance(parsed, dict):
            raise AgentError(f"Unexpected JSON response from {url}")
        return parsed

    def bridge_health(self) -> dict[str, Any]:
        return self._json_request(f"{self.bridge_url}/health")

    def lease_job(self) -> dict[str, Any] | None:
        health: dict[str, Any]
        try:
            health = self.bridge_health()
        except Exception as exc:
            health = {"status": "offline", "error": str(exc)}
        response = self._json_request(
            f"{self.cloud_url}/api/cloud/device/lease",
            method="POST",
            payload={
                "capabilities": {
                    "agentVersion": AGENT_VERSION,
                    "platform": sys.platform,
                    "python": sys.version.split()[0],
                    "bridge": health,
                }
            },
            device_auth=True,
        )
        job = response.get("job")
        return job if isinstance(job, dict) else None

    def bridge_execute(
        self,
        operation: str,
        params: dict[str, Any],
        request_id: str,
    ) -> dict[str, Any]:
        return self._json_request(
            f"{self.bridge_url}/v1/execute",
            method="POST",
            payload={"operation": operation, "params": params, "request_id": request_id},
            headers={"X-Nexora-Bridge-Secret": self.bridge_secret},
        )

    def heartbeat(self, job_id: str, lease_token: str) -> None:
        self._json_request(
            f"{self.cloud_url}/api/cloud/device/jobs/{job_id}/heartbeat",
            method="POST",
            payload={"leaseToken": lease_token},
            device_auth=True,
        )

    def upload_artifact(
        self,
        job_id: str,
        lease_token: str,
        path: Path,
        kind: str,
    ) -> dict[str, Any]:
        if not path.is_file():
            raise AgentError(f"Artifact does not exist: {path}")
        max_bytes = int(os.environ.get("NEXORA_DEVICE_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))
        size = path.stat().st_size
        if size <= 0 or size > max_bytes:
            raise AgentError(f"Artifact size is outside configured limit: {path} ({size} bytes)")
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        headers = {
            "Authorization": f"Bearer {self.device_token}",
            "X-Nexora-Lease-Token": lease_token,
            "X-Nexora-Artifact-Kind": kind,
            "X-Nexora-Filename": path.name,
            "Content-Type": content_type,
            "Content-Length": str(size),
        }
        req = urllib.request.Request(
            f"{self.cloud_url}/api/cloud/device/jobs/{job_id}/artifacts",
            data=path.read_bytes(),
            headers=headers,
            method="PUT",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.http_timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:1000]
            raise AgentError(f"Artifact upload failed ({exc.code}): {detail}") from exc
        if not isinstance(payload, dict):
            raise AgentError("Artifact upload returned invalid JSON")
        return payload

    def complete(
        self,
        job_id: str,
        lease_token: str,
        results: list[dict[str, Any]],
    ) -> None:
        self._json_request(
            f"{self.cloud_url}/api/cloud/device/jobs/{job_id}/complete",
            method="POST",
            payload={
                "leaseToken": lease_token,
                "summary": f"Executed {len(results)} Blender operations with Device Agent {AGENT_VERSION}.",
                "operationResults": results,
            },
            device_auth=True,
        )

    def fail(self, job_id: str, lease_token: str, error: str) -> None:
        try:
            self._json_request(
                f"{self.cloud_url}/api/cloud/device/jobs/{job_id}/fail",
                method="POST",
                payload={"leaseToken": lease_token, "error": error[:4000]},
                device_auth=True,
            )
        except Exception as exc:
            print(f"[Forge Agent] Could not report job failure: {exc}", file=sys.stderr)

    @staticmethod
    def _result_path(result: dict[str, Any]) -> Path | None:
        payload = result.get("result")
        if not isinstance(payload, dict):
            return None
        raw = payload.get("path") or payload.get("file")
        if not isinstance(raw, str) or not raw:
            return None
        return Path(raw)

    @staticmethod
    def _kind_for(path: Path, operation: str) -> str | None:
        suffix = path.suffix.lower()
        if operation == "render.preview" or suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            return "preview"
        if suffix == ".blend":
            return "blend"
        if suffix in {".glb", ".gltf", ".fbx", ".obj", ".stl"}:
            return "export"
        return None

    def _heartbeat_loop(
        self,
        stop: threading.Event,
        job_id: str,
        lease_token: str,
        interval: float,
    ) -> None:
        while not stop.wait(interval):
            try:
                self.heartbeat(job_id, lease_token)
            except Exception as exc:
                print(f"[Forge Agent] Lease heartbeat warning: {exc}", file=sys.stderr)

    def execute_job(self, job: dict[str, Any]) -> None:
        job_id = str(job["id"])
        lease_token = str(job["leaseToken"])
        steps = job.get("executionPlan")
        if not isinstance(steps, list):
            raise AgentError("Leased job has no executionPlan")

        lease_seconds = max(60, int(job.get("leaseSeconds", 900)))
        stop = threading.Event()
        heartbeat_thread = threading.Thread(
            target=self._heartbeat_loop,
            args=(stop, job_id, lease_token, max(20.0, lease_seconds / 3)),
            daemon=True,
            name=f"NexoraLease-{job_id}",
        )
        heartbeat_thread.start()

        results: list[dict[str, Any]] = []
        artifact_candidates: list[tuple[Path, str]] = []
        try:
            for index, raw_step in enumerate(steps):
                if not isinstance(raw_step, dict):
                    raise AgentError(f"Invalid step at index {index}")
                operation = str(raw_step.get("operation", ""))
                params = raw_step.get("params") if isinstance(raw_step.get("params"), dict) else {}
                result = self.bridge_execute(operation, params, f"{job_id}:{index}")
                results.append({"operation": operation, "response": result})
                path = self._result_path(result)
                if path:
                    kind = self._kind_for(path, operation)
                    if kind:
                        artifact_candidates.append((path, kind))

            # Always save a reproducible Blender checkpoint for human review/versioning.
            save = self.bridge_execute(
                "scene.save",
                {"path": f"cloud/jobs/{job_id}/scene.blend"},
                f"{job_id}:checkpoint",
            )
            results.append({"operation": "scene.save", "response": save})
            save_path = self._result_path(save)
            if save_path:
                artifact_candidates.append((save_path, "blend"))

            # Create a review preview unless the execution plan already produced one.
            if not any(kind == "preview" for _, kind in artifact_candidates):
                preview = self.bridge_execute(
                    "render.preview",
                    {
                        "path": f"cloud/jobs/{job_id}/preview.png",
                        "resolution_x": 768,
                        "resolution_y": 768,
                        "samples": 32,
                    },
                    f"{job_id}:preview",
                )
                results.append({"operation": "render.preview", "response": preview})
                preview_path = self._result_path(preview)
                if preview_path:
                    artifact_candidates.append((preview_path, "preview"))

            seen: set[tuple[str, str]] = set()
            for path, kind in artifact_candidates:
                key = (str(path.resolve()), kind)
                if key in seen:
                    continue
                seen.add(key)
                self.upload_artifact(job_id, lease_token, path, kind)

            self.complete(job_id, lease_token, results)
            print(f"[Forge Agent] Job {job_id} is awaiting human approval.")
        except Exception as exc:
            self.fail(job_id, lease_token, f"{type(exc).__name__}: {exc}")
            raise
        finally:
            stop.set()
            heartbeat_thread.join(timeout=2)

    def run_forever(self) -> None:
        print(f"[Forge Agent] v{AGENT_VERSION} connected to {self.cloud_url}")
        while True:
            try:
                job = self.lease_job()
                if job:
                    print(f"[Forge Agent] Leased job {job.get('id')}: {job.get('task')}")
                    self.execute_job(job)
                else:
                    time.sleep(self.poll_seconds)
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"[Forge Agent] {type(exc).__name__}: {exc}", file=sys.stderr)
                time.sleep(self.poll_seconds)


def main() -> None:
    required = ["NEXORA_CLOUD_URL", "NEXORA_DEVICE_TOKEN", "NEXORA_BRIDGE_SECRET"]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise SystemExit("Missing environment variables: " + ", ".join(missing))
    NexoraDeviceAgent().run_forever()


if __name__ == "__main__":
    main()
