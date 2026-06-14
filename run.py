"""
Entry point — starts both the FastAPI backend and the Next.js frontend.

Usage:
    python run.py          # production (next start)
    python run.py --dev    # dev mode (next dev, uvicorn with reload)
"""

import json
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR    = Path(__file__).parent
FRONTEND_DIR = BASE_DIR / "frontend"
NEXT_BIN    = FRONTEND_DIR / "node_modules" / ".bin" / "next.cmd"

HOST           = os.getenv("HOST", "0.0.0.0")
BACKEND_PORT   = int(os.getenv("PORT", "8001"))
FRONTEND_PORT  = int(os.getenv("FRONTEND_PORT", "3000"))

DEV_MODE = "--dev" in sys.argv

# ---------------------------------------------------------------------------
# On Windows, every subprocess.Popen / subprocess.run gets this flag so
# that no extra CMD console windows pop up on the taskbar.
# ---------------------------------------------------------------------------
_POPEN_KW: dict = {}
if sys.platform == "win32":
    _POPEN_KW["creationflags"] = subprocess.CREATE_NO_WINDOW


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def stream_output(proc: subprocess.Popen, prefix: str) -> None:
    """Forward a process's stdout+stderr to our stdout with a tag prefix."""
    assert proc.stdout is not None
    for line in proc.stdout:
        print(f"[{prefix}] {line}", end="", flush=True)


def _build_is_stale() -> bool:
    """
    Return True if the .next build is missing or the routes manifest does not
    include all page routes that exist on disk.
    """
    routes_manifest = FRONTEND_DIR / ".next" / "app-path-routes-manifest.json"
    if not routes_manifest.exists():
        return True

    try:
        built_routes: set[str] = set(
            json.loads(routes_manifest.read_text()).keys()
        )
    except Exception:
        return True

    for page_file in (FRONTEND_DIR / "app").rglob("page.tsx"):
        rel       = page_file.relative_to(FRONTEND_DIR / "app")
        route_key = "/" + "/".join(rel.parts).replace(".tsx", "")
        if route_key not in built_routes:
            print(f"[runner] Stale build — missing route: {route_key}")
            return True

    return False


# ---------------------------------------------------------------------------
# Processes
# ---------------------------------------------------------------------------

def start_backend() -> subprocess.Popen:
    cmd = [
        sys.executable, "-m", "uvicorn",
        "backend.main:app",
        "--host", HOST,
        "--port", str(BACKEND_PORT),
        "--log-level", "info",
    ]
    if DEV_MODE:
        cmd += ["--reload"]

    proc = subprocess.Popen(
        cmd,
        cwd=str(BASE_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        **_POPEN_KW,
    )
    threading.Thread(target=stream_output, args=(proc, "backend"), daemon=True).start()
    return proc


def start_frontend() -> subprocess.Popen:
    if not NEXT_BIN.exists():
        print(f"[runner] ERROR: next binary not found at {NEXT_BIN}")
        print("[runner] Run:  cd frontend && npm install")
        sys.exit(1)

    if DEV_MODE:
        cmd = [str(NEXT_BIN), "dev", "-p", str(FRONTEND_PORT)]
    else:
        if _build_is_stale():
            print("[runner] Building frontend (this takes ~30 s)…")
            result = subprocess.run(
                [str(NEXT_BIN), "build"],
                cwd=str(FRONTEND_DIR),
                **_POPEN_KW,
            )
            if result.returncode != 0:
                print("[runner] Frontend build failed. Exiting.")
                sys.exit(1)

        cmd = [str(NEXT_BIN), "start", "-p", str(FRONTEND_PORT)]

    proc = subprocess.Popen(
        cmd,
        cwd=str(FRONTEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        **_POPEN_KW,
    )
    threading.Thread(target=stream_output, args=(proc, "frontend"), daemon=True).start()
    return proc


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    mode = "DEV" if DEV_MODE else "PRODUCTION"
    print(f"[runner] Starting Bot Detection Lab ({mode})")
    print(f"[runner]  Backend  → http://localhost:{BACKEND_PORT}")
    print(f"[runner]  Frontend → http://localhost:{FRONTEND_PORT}")
    print(f"[runner] Press Ctrl+C to stop both servers.\n")

    backend  = start_backend()
    time.sleep(1)          # let backend bind before frontend starts
    frontend = start_frontend()

    processes = [backend, frontend]

    def shutdown(sig, frame):
        print("\n[runner] Shutting down…")
        for p in processes:
            if p.poll() is None:
                p.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    while True:
        time.sleep(2)
        for p in processes:
            if p.poll() is not None:
                name = "backend" if p is backend else "frontend"
                print(f"[runner] {name} exited with code {p.returncode}. Stopping.")
                shutdown(None, None)


if __name__ == "__main__":
    main()
