from __future__ import annotations

from typing import Any

import httpx


class BlenderBridgeError(RuntimeError):
    pass


class BlenderBridgeClient:
    def __init__(
        self,
        *,
        base_url: str,
        secret: str,
        timeout_seconds: float,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.secret = secret
        self.timeout_seconds = timeout_seconds

    async def health(self) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/health")
                response.raise_for_status()
                return dict(response.json())
        except (httpx.HTTPError, ValueError) as exc:
            raise BlenderBridgeError(f"Blender bridge unavailable: {exc}") from exc

    async def execute(
        self,
        *,
        operation: str,
        params: dict[str, Any],
        request_id: str,
    ) -> dict[str, Any]:
        headers = {
            "X-Nexora-Bridge-Secret": self.secret,
            "X-Request-ID": request_id,
        }
        payload = {
            "operation": operation,
            "params": params,
            "request_id": request_id,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/v1/execute",
                    headers=headers,
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise BlenderBridgeError(f"Bridge request failed: {exc}") from exc

        try:
            body = response.json()
        except ValueError as exc:
            raise BlenderBridgeError(
                f"Bridge returned non-JSON response ({response.status_code})"
            ) from exc

        if response.is_error:
            message = body.get("error", "unknown bridge error") if isinstance(body, dict) else body
            raise BlenderBridgeError(f"Bridge error {response.status_code}: {message}")

        if not isinstance(body, dict):
            raise BlenderBridgeError("Bridge response must be a JSON object")
        return body
