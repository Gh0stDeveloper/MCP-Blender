from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, cast


INSTALL_VERSION = 1
DEFAULT_WEB_PORT = 3000
DEFAULT_DB_PORT = 55432


def project_root() -> Path:
    configured = os.environ.get("NEXORA_FORGE_ROOT")
    if configured:
        root = Path(configured).expanduser().resolve()
        if (root / "pyproject.toml").is_file():
            return root
    current = Path.cwd().resolve()
    for candidate in (current, *current.parents):
        if (candidate / "pyproject.toml").is_file() and (candidate / "apps" / "web").is_dir():
            return candidate
    raise SystemExit(
        "Run nexora-forge from the Nexora Forge source directory "
        "or set NEXORA_FORGE_ROOT."
    )


def state_dir(root: Path) -> Path:
    path = root / ".nexora"
    path.mkdir(parents=True, exist_ok=True)
    (path / "pids").mkdir(exist_ok=True)
    (path / "logs").mkdir(exist_ok=True)
    return path


def config_path(root: Path) -> Path:
    return state_dir(root) / "install.json"


def load_config(root: Path) -> dict[str, Any]:
    path = config_path(root)
    if not path.is_file():
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SystemExit("Invalid .nexora/install.json")
    return cast(dict[str, Any], value)


def save_config(root: Path, value: dict[str, Any]) -> None:
    config_path(root).write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def read_env(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not path.is_file():
        return result
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def write_env(path: Path, values: dict[str, str]) -> None:
    lines = [f"{key}={value}" for key, value in values.items()]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def merged_process_env(root: Path) -> dict[str, str]:
    env = dict(os.environ)
    env.update(read_env(root / ".env"))
    config = load_config(root)
    if isinstance(config.get("member_token"), str):
        env["NEXORA_MEMBER_TOKEN"] = cast(str, config["member_token"])
    if isinstance(config.get("device_token"), str):
        env["NEXORA_DEVICE_TOKEN"] = cast(str, config["device_token"])
    if isinstance(config.get("cloud_url"), str):
        env["NEXORA_CLOUD_URL"] = cast(str, config["cloud_url"])
    return env


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def run(
    args: list[str],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
    input_text: str | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        env=env,
        input=input_text,
        text=True,
        check=check,
    )


def slug(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in value.strip())
    return "-".join(part for part in cleaned.split("-") if part) or "nexora-project"


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def require_commands(names: list[str]) -> None:
    missing = [name for name in names if not command_exists(name)]
    if missing:
        raise SystemExit("Missing required commands: " + ", ".join(missing))


def base_env(root: Path) -> dict[str, str]:
    workspace = Path("~/NexoraForgeWorkspace").expanduser()
    workspace.mkdir(parents=True, exist_ok=True)
    return {
        "NEXORA_AUTH_MODE": "static",
        "NEXORA_GATEWAY_HOST": "127.0.0.1",
        "NEXORA_GATEWAY_PORT": "8765",
        "NEXORA_PUBLIC_TOKEN": secrets.token_urlsafe(48),
        "NEXORA_OAUTH_ISSUER_URL": "",
        "NEXORA_OAUTH_RESOURCE_URL": "",
        "NEXORA_OAUTH_INTROSPECTION_URL": "",
        "NEXORA_OAUTH_CLIENT_ID": "",
        "NEXORA_OAUTH_CLIENT_SECRET": "",
        "NEXORA_OAUTH_INTROSPECTION_AUTH_METHOD": "basic",
        "NEXORA_OAUTH_REQUIRED_SCOPES": "blender:read,blender:write",
        "NEXORA_OAUTH_EXPECTED_AUDIENCE": "",
        "NEXORA_OAUTH_VALIDATE_AUDIENCE": "true",
        "NEXORA_OAUTH_TIMEOUT_SECONDS": "10",
        "NEXORA_ALLOWED_HOSTS": "127.0.0.1:*,localhost:*,[::1]:*",
        "NEXORA_ALLOWED_ORIGINS": "http://127.0.0.1:*,http://localhost:*,http://[::1]:*",
        "NEXORA_BRIDGE_URL": "http://127.0.0.1:9876",
        "NEXORA_BRIDGE_SECRET": secrets.token_urlsafe(48),
        "NEXORA_REQUEST_TIMEOUT_SECONDS": "120",
        "NEXORA_PERMISSION_PROFILE": "standard",
        "NEXORA_ALLOW_PYTHON_EXEC": "false",
        "NEXORA_WORKSPACE_ROOT": str(workspace),
        "NEXORA_AUDIT_LOG": str(root / "var" / "audit.jsonl"),
        "NEXORA_LOG_LEVEL": "INFO",
    }


def choose_mode(explicit: str | None) -> str:
    if explicit:
        return explicit
    print("How do you want to use Nexora Forge?")
    print("  1) Individual")
    print("  2) Team Host")
    print("  3) Join Team")
    selected = input("Select [1-3]: ").strip()
    return {"1": "individual", "2": "team-host", "3": "join-team"}.get(selected, "")


def setup_python(root: Path) -> None:
    require_commands(["uv"])
    print("[setup] Installing Python dependencies...")
    run(["uv", "sync", "--all-extras"], cwd=root)


def compose_args(root: Path) -> list[str]:
    return ["docker", "compose", "-f", str(root / "deploy" / "local" / "docker-compose.yml")]


def start_postgres(root: Path, env: dict[str, str]) -> None:
    require_commands(["docker"])
    run([*compose_args(root), "up", "-d", "postgres"], cwd=root, env=env)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        probe = run(
            [*compose_args(root), "exec", "-T", "postgres", "pg_isready", "-U", "nexora", "-d", "nexora_forge"],
            cwd=root,
            env=env,
            check=False,
        )
        if probe.returncode == 0:
            return
        time.sleep(2)
    raise SystemExit("PostgreSQL did not become ready within 60 seconds.")


def apply_migrations(root: Path, env: dict[str, str]) -> None:
    print("[setup] Applying PostgreSQL migrations...")
    for migration in sorted((root / "deploy" / "postgres").glob("*.sql")):
        sql = migration.read_text(encoding="utf-8")
        completed = run(
            [
                *compose_args(root),
                "exec",
                "-T",
                "postgres",
                "psql",
                "-v",
                "ON_ERROR_STOP=1",
                "-U",
                "nexora",
                "-d",
                "nexora_forge",
            ],
            cwd=root,
            env=env,
            input_text=sql,
            check=False,
        )
        if completed.returncode != 0:
            raise SystemExit(f"Migration failed: {migration.name}")


def seed_team_host(
    root: Path,
    env: dict[str, str],
    *,
    owner_name: str,
    organization_name: str,
    project_name: str,
) -> dict[str, str]:
    organization_id = str(uuid.uuid4())
    owner_user_id = str(uuid.uuid4())
    project_id = str(uuid.uuid4())
    owner_token = "nfu_" + secrets.token_urlsafe(36)
    owner_hash = hashlib.sha256(owner_token.encode("utf-8")).hexdigest()
    org_slug = slug(organization_name)
    project_slug = slug(project_name)

    sql = f"""
insert into organizations (id, slug, name)
values ({sql_string(organization_id)}::uuid, {sql_string(org_slug)}, {sql_string(organization_name)})
on conflict (slug) do update set name=excluded.name;

insert into organization_members (
  organization_id, user_id, role, display_name, auth_token_hash, token_created_at
) values (
  {sql_string(organization_id)}::uuid,
  {sql_string(owner_user_id)}::uuid,
  'owner',
  {sql_string(owner_name)},
  {sql_string(owner_hash)},
  now()
)
on conflict (organization_id,user_id) do update
set role='owner', display_name=excluded.display_name,
    auth_token_hash=excluded.auth_token_hash, token_created_at=now();

insert into projects (id, organization_id, name, slug, created_by)
values (
  {sql_string(project_id)}::uuid,
  {sql_string(organization_id)}::uuid,
  {sql_string(project_name)},
  {sql_string(project_slug)},
  {sql_string(owner_user_id)}::uuid
)
on conflict (organization_id,slug) do update set name=excluded.name;
"""
    completed = run(
        [
            *compose_args(root),
            "exec",
            "-T",
            "postgres",
            "psql",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "nexora",
            "-d",
            "nexora_forge",
        ],
        cwd=root,
        env=env,
        input_text=sql,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit("Could not initialize the local team workspace.")
    return {
        "organization_id": organization_id,
        "user_id": owner_user_id,
        "project_id": project_id,
        "member_token": owner_token,
    }


def build_web(root: Path, env: dict[str, str]) -> None:
    require_commands(["node", "npm"])
    web = root / "apps" / "web"
    print("[setup] Installing web dependencies...")
    run(["npm", "install"], cwd=web, env=env)
    print("[setup] Building local control center...")
    run(["npm", "run", "build"], cwd=web, env=env)


def setup_individual(root: Path, args: argparse.Namespace) -> None:
    setup_python(root)
    env = base_env(root)
    if (root / ".env").exists() and not args.force:
        raise SystemExit(".env already exists. Re-run with --force to replace it.")
    write_env(root / ".env", env)
    save_config(root, {
        "version": INSTALL_VERSION,
        "mode": "individual",
        "created_at": int(time.time()),
    })
    print("\nNexora Forge individual setup is ready.")
    print("Next:")
    print("  1. Install blender_extension in Blender.")
    print("  2. Copy NEXORA_BRIDGE_SECRET from .env into the Blender extension.")
    print("  3. Run: nexora-forge start")
    print("  4. Run: nexora-forge doctor")


def setup_team_host(root: Path, args: argparse.Namespace) -> None:
    require_commands(["docker", "node", "npm", "uv"])
    setup_python(root)
    owner_name = args.owner_name or input("Owner display name [Ghost Developer]: ").strip() or "Ghost Developer"
    organization_name = (
        args.organization
        or input("Team / organization name [Nexora Team]: ").strip()
        or "Nexora Team"
    )
    project_name = args.project or input("Initial project name [Main Project]: ").strip() or "Main Project"

    env = base_env(root)
    postgres_password = secrets.token_urlsafe(32)
    env.update({
        "NEXORA_CLOUD_API_TOKEN": secrets.token_urlsafe(48),
        "NEXORA_POSTGRES_PASSWORD": postgres_password,
        "DATABASE_URL": f"postgresql://nexora:{postgres_password}@127.0.0.1:{DEFAULT_DB_PORT}/nexora_forge",
        "NEXORA_DB_SSL": "false",
        "NEXORA_DB_POOL_MAX": "10",
        "NEXORA_JOB_LEASE_SECONDS": "900",
        "NEXORA_REVIEW_LOCK_SECONDS": "86400",
        "NEXORA_MAX_ARTIFACT_BYTES": str(100 * 1024 * 1024),
        "NEXORA_STORAGE_DRIVER": "local",
        "NEXORA_STORAGE_ROOT": str(root / ".nexora-storage"),
        "NEXORA_WEB_HOST": "0.0.0.0",
        "NEXORA_WEB_PORT": str(DEFAULT_WEB_PORT),
    })
    if (root / ".env").exists() and not args.force:
        raise SystemExit(".env already exists. Re-run with --force to replace it.")
    write_env(root / ".env", env)
    process_env = merged_process_env(root)
    start_postgres(root, process_env)
    apply_migrations(root, process_env)
    seeded = seed_team_host(
        root,
        process_env,
        owner_name=owner_name,
        organization_name=organization_name,
        project_name=project_name,
    )
    build_web(root, process_env)

    config: dict[str, Any] = {
        "version": INSTALL_VERSION,
        "mode": "team-host",
        "created_at": int(time.time()),
        "cloud_url": f"http://127.0.0.1:{DEFAULT_WEB_PORT}",
        "organization_name": organization_name,
        "project_name": project_name,
        **seeded,
    }
    save_config(root, config)
    print("\nTeam Host setup is ready.")
    print(f"Organization: {organization_name}")
    print(f"Project: {project_name}")
    print("Run: nexora-forge start")
    print("Then create a device pairing code with: nexora-forge pair")
    print("Other members can join with: nexora-forge setup --mode join-team")


def json_request(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    token: str | None = None,
    timeout: float = 15.0,
) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise SystemExit(f"Server returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Could not reach {url}: {exc}") from exc
    parsed = json.loads(raw.decode("utf-8")) if raw else {}
    if not isinstance(parsed, dict):
        raise SystemExit("Server returned an unexpected response.")
    return cast(dict[str, Any], parsed)


def setup_join_team(root: Path, args: argparse.Namespace) -> None:
    setup_python(root)
    server = args.server or input("Team server URL: ").strip()
    code = args.code or input("Pairing code (NXR-....): ").strip()
    device_name = args.device_name or socket.gethostname()
    if not server or not code:
        raise SystemExit("Team server URL and pairing code are required.")

    result = json_request(
        server.rstrip("/") + "/api/cloud/pairing/redeem",
        method="POST",
        payload={"code": code, "deviceName": device_name},
    )
    device_token = result.get("token")
    owner_user_id = result.get("ownerUserId")
    organization_id = result.get("organizationId")
    if not all(isinstance(value, str) for value in (device_token, owner_user_id, organization_id)):
        raise SystemExit("Pairing response did not contain the expected credentials.")

    env = base_env(root)
    env["NEXORA_CLOUD_URL"] = server.rstrip("/")
    env["NEXORA_DEVICE_TOKEN"] = cast(str, device_token)
    if (root / ".env").exists() and not args.force:
        current = read_env(root / ".env")
        current.update(env)
        env = current
    write_env(root / ".env", env)
    save_config(root, {
        "version": INSTALL_VERSION,
        "mode": "join-team",
        "created_at": int(time.time()),
        "cloud_url": server.rstrip("/"),
        "organization_id": organization_id,
        "user_id": owner_user_id,
        "device_token": device_token,
        "device_name": device_name,
    })
    print("\nThis workstation is paired with the team.")
    print("Install/configure the Blender extension with NEXORA_BRIDGE_SECRET from .env.")
    print("Then run: nexora-forge start")


def cmd_setup(args: argparse.Namespace) -> None:
    root = project_root()
    state_dir(root)
    mode = choose_mode(args.mode)
    if mode == "individual":
        setup_individual(root, args)
    elif mode == "team-host":
        setup_team_host(root, args)
    elif mode == "join-team":
        setup_join_team(root, args)
    else:
        raise SystemExit("Invalid setup mode.")


def pid_path(root: Path, name: str) -> Path:
    return state_dir(root) / "pids" / f"{name}.pid"


def process_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        if os.name == "nt":
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                capture_output=True,
                text=True,
                check=False,
            )
            return str(pid) in result.stdout
        os.kill(pid, 0)
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def start_background(
    root: Path,
    name: str,
    args: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
) -> int:
    pp = pid_path(root, name)
    if pp.is_file():
        try:
            existing = int(pp.read_text(encoding="utf-8").strip())
        except ValueError:
            existing = 0
        if process_alive(existing):
            print(f"[start] {name} is already running (PID {existing})")
            return existing
        pp.unlink(missing_ok=True)

    log_path = state_dir(root) / "logs" / f"{name}.log"
    log_file = log_path.open("a", encoding="utf-8")
    creationflags = 0
    start_new_session = False
    if os.name == "nt":
        creationflags = (
            getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            | getattr(subprocess, "DETACHED_PROCESS", 0)
        )
    else:
        start_new_session = True

    process = subprocess.Popen(
        args,
        cwd=cwd,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
        creationflags=creationflags,
        start_new_session=start_new_session,
    )
    log_file.close()
    pp.write_text(str(process.pid), encoding="utf-8")
    print(f"[start] {name}: PID {process.pid} · log {log_path}")
    return process.pid


def start_gateway(root: Path, env: dict[str, str]) -> None:
    start_background(
        root,
        "gateway",
        ["uv", "run", "nexora-forge-mcp"],
        cwd=root,
        env=env,
    )


def start_web(root: Path, env: dict[str, str]) -> None:
    port = env.get("NEXORA_WEB_PORT", str(DEFAULT_WEB_PORT))
    host = env.get("NEXORA_WEB_HOST", "0.0.0.0")
    start_background(
        root,
        "web",
        ["npm", "run", "start", "--", "-H", host, "-p", port],
        cwd=root / "apps" / "web",
        env=env,
    )


def start_agent(root: Path, env: dict[str, str]) -> None:
    if not env.get("NEXORA_DEVICE_TOKEN"):
        print("[start] Device Agent skipped: this workstation has not been paired yet.")
        return
    start_background(
        root,
        "device-agent",
        ["uv", "run", "python", "device_agent/nexora_forge_agent.py"],
        cwd=root,
        env=env,
    )


def cmd_start(args: argparse.Namespace) -> None:
    root = project_root()
    config = load_config(root)
    if not config:
        raise SystemExit("Run nexora-forge setup first.")
    env = merged_process_env(root)
    require_commands(["uv"])

    component = args.component
    mode = str(config.get("mode", "individual"))
    if mode == "team-host":
        start_postgres(root, env)
    if component in ("all", "gateway"):
        start_gateway(root, env)
    if mode == "team-host" and component in ("all", "web"):
        start_web(root, env)
    if mode in ("team-host", "join-team") and component in ("all", "agent"):
        start_agent(root, env)
    time.sleep(1)
    cmd_status(argparse.Namespace())


def stop_pid(root: Path, name: str) -> None:
    pp = pid_path(root, name)
    if not pp.is_file():
        print(f"[stop] {name}: not running")
        return
    try:
        pid = int(pp.read_text(encoding="utf-8").strip())
    except ValueError:
        pp.unlink(missing_ok=True)
        print(f"[stop] {name}: stale PID file removed")
        return
    if process_alive(pid):
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False)
        else:
            try:
                os.killpg(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        print(f"[stop] {name}: stopped PID {pid}")
    pp.unlink(missing_ok=True)


def cmd_stop(args: argparse.Namespace) -> None:
    root = project_root()
    for name in ("device-agent", "web", "gateway"):
        stop_pid(root, name)
    if getattr(args, "postgres", False):
        env = merged_process_env(root)
        if command_exists("docker"):
            run([*compose_args(root), "stop", "postgres"], cwd=root, env=env, check=False)


def service_status(root: Path, name: str) -> str:
    pp = pid_path(root, name)
    if not pp.is_file():
        return "stopped"
    try:
        pid = int(pp.read_text(encoding="utf-8").strip())
    except ValueError:
        return "stale"
    return f"running (PID {pid})" if process_alive(pid) else "stale"


def http_ok(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return 200 <= response.status < 500
    except (urllib.error.URLError, TimeoutError):
        return False


def cmd_status(_args: argparse.Namespace) -> None:
    root = project_root()
    config = load_config(root)
    mode = config.get("mode", "not configured")
    print(f"Nexora Forge mode: {mode}")
    for name in ("gateway", "web", "device-agent"):
        print(f"  {name:12} {service_status(root, name)}")
    print(f"  MCP health    {'ok' if http_ok('http://127.0.0.1:8765/health') else 'offline'}")
    print(f"  Blender       {'ok' if http_ok('http://127.0.0.1:9876/health') else 'offline'}")
    if mode == "team-host":
        port = read_env(root / ".env").get("NEXORA_WEB_PORT", str(DEFAULT_WEB_PORT))
        print(f"  Forge Cloud   {'ok' if http_ok(f'http://127.0.0.1:{port}') else 'offline'}")


def doctor_item(label: str, ok: bool, detail: str = "") -> bool:
    mark = "OK" if ok else "FAIL"
    suffix = f" · {detail}" if detail else ""
    print(f"[{mark:4}] {label}{suffix}")
    return ok


def cmd_doctor(_args: argparse.Namespace) -> None:
    root = project_root()
    config = load_config(root)
    mode = str(config.get("mode", ""))
    checks: list[bool] = []
    checks.append(doctor_item("Python 3.11+", sys.version_info >= (3, 11), sys.version.split()[0]))
    checks.append(doctor_item("uv", command_exists("uv")))
    checks.append(doctor_item(".env", (root / ".env").is_file()))
    checks.append(doctor_item("Install config", bool(config), mode or "not configured"))
    checks.append(doctor_item("MCP gateway", http_ok("http://127.0.0.1:8765/health")))
    checks.append(doctor_item("Blender bridge", http_ok("http://127.0.0.1:9876/health"), "start Blender + extension if offline"))

    if mode == "team-host":
        checks.append(doctor_item("Node.js", command_exists("node")))
        checks.append(doctor_item("npm", command_exists("npm")))
        checks.append(doctor_item("Docker", command_exists("docker")))
        env = merged_process_env(root)
        db = run(
            [*compose_args(root), "exec", "-T", "postgres", "pg_isready", "-U", "nexora", "-d", "nexora_forge"],
            cwd=root,
            env=env,
            check=False,
        ) if command_exists("docker") else None
        checks.append(doctor_item("PostgreSQL", bool(db and db.returncode == 0)))
        port = env.get("NEXORA_WEB_PORT", str(DEFAULT_WEB_PORT))
        checks.append(doctor_item("Forge Cloud", http_ok(f"http://127.0.0.1:{port}")))

    if mode in ("team-host", "join-team"):
        checks.append(doctor_item("Device pairing", bool(config.get("device_token")) or mode == "team-host"))

    if all(checks):
        print("\nNexora Forge diagnostics passed.")
        return
    raise SystemExit("\nOne or more checks need attention.")


def cmd_update(_args: argparse.Namespace) -> None:
    root = project_root()
    config = load_config(root)
    require_commands(["git", "uv"])
    print("[update] Pulling latest source...")
    run(["git", "pull", "--ff-only"], cwd=root)
    print("[update] Syncing Python dependencies...")
    run(["uv", "sync", "--all-extras"], cwd=root)
    if config.get("mode") == "team-host":
        env = merged_process_env(root)
        start_postgres(root, env)
        apply_migrations(root, env)
        build_web(root, env)
    print("[update] Nexora Forge is up to date.")


def cmd_pair(args: argparse.Namespace) -> None:
    root = project_root()
    config = load_config(root)
    token = config.get("member_token")
    cloud_url = config.get("cloud_url")
    if not isinstance(token, str) or not isinstance(cloud_url, str):
        raise SystemExit("This installation does not have an owner/member token.")
    payload: dict[str, Any] = {"ttlSeconds": args.ttl}
    result = json_request(
        cloud_url.rstrip("/") + "/api/cloud/pairing",
        method="POST",
        payload=payload,
        token=token,
    )
    code = result.get("code")
    expires = result.get("expiresAt")
    print("\nDevice pairing code:")
    print(f"  {code}")
    print(f"Expires: {expires}")
    print("\nOn the other workstation run:")
    print(f"  nexora-forge setup --mode join-team --server {cloud_url} --code {code}")


def cmd_member_add(args: argparse.Namespace) -> None:
    root = project_root()
    config = load_config(root)
    token = config.get("member_token")
    cloud_url = config.get("cloud_url")
    if not isinstance(token, str) or not isinstance(cloud_url, str):
        raise SystemExit("This installation does not have an owner/admin member token.")
    result = json_request(
        cloud_url.rstrip("/") + "/api/cloud/team/members",
        method="POST",
        token=token,
        payload={"displayName": args.name, "role": args.role},
    )
    print(f"Member created: {result.get('userId')} · role {result.get('role')}")
    print("Private member token (shown once):")
    print(f"  {result.get('token')}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="nexora-forge",
        description="Local installer and lifecycle manager for Nexora Forge.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    setup = sub.add_parser("setup", help="Configure Individual, Team Host or Join Team mode.")
    setup.add_argument("--mode", choices=["individual", "team-host", "join-team"])
    setup.add_argument("--force", action="store_true", help="Replace the current local configuration.")
    setup.add_argument("--owner-name")
    setup.add_argument("--organization")
    setup.add_argument("--project")
    setup.add_argument("--server")
    setup.add_argument("--code")
    setup.add_argument("--device-name")
    setup.set_defaults(func=cmd_setup)

    start = sub.add_parser("start", help="Start local Nexora Forge services.")
    start.add_argument("component", nargs="?", default="all", choices=["all", "gateway", "web", "agent"])
    start.set_defaults(func=cmd_start)

    stop = sub.add_parser("stop", help="Stop locally managed Nexora Forge processes.")
    stop.add_argument("--postgres", action="store_true", help="Also stop the Team Host PostgreSQL container.")
    stop.set_defaults(func=cmd_stop)

    status = sub.add_parser("status", help="Show local service status.")
    status.set_defaults(func=cmd_status)

    doctor = sub.add_parser("doctor", help="Run installation and connectivity diagnostics.")
    doctor.set_defaults(func=cmd_doctor)

    update = sub.add_parser("update", help="Update source, dependencies, migrations and web build.")
    update.set_defaults(func=cmd_update)

    pair = sub.add_parser("pair", help="Create a short-lived Device Agent pairing code.")
    pair.add_argument("--ttl", type=int, default=600, help="Pairing code lifetime in seconds.")
    pair.set_defaults(func=cmd_pair)

    member = sub.add_parser("member", help="Manage local team members.")
    member_sub = member.add_subparsers(dest="member_command", required=True)
    member_add = member_sub.add_parser("add", help="Create a team member and private access token.")
    member_add.add_argument("--name", required=True)
    member_add.add_argument(
        "--role",
        required=True,
        choices=["admin", "lead", "artist", "reviewer", "viewer"],
    )
    member_add.set_defaults(func=cmd_member_add)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    function = cast(Any, args.func)
    function(args)


if __name__ == "__main__":
    main()
