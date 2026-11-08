#!/usr/bin/env python3
"""CartoonForge one-click local studio: script -> Ollama storyboard -> ComfyUI scenes -> narrated MP4."""
from __future__ import annotations
import argparse, base64, json, mimetypes, os, shutil, socket, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from typing import Any

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent / "site" / "cartoonforge" / "studio.html"
CONFIG_DIR = Path.home() / ".cartoonforge"
CONFIG_FILE = CONFIG_DIR / "config.json"
OUTPUT_DIR = CONFIG_DIR / "outputs"
JOBS: dict[str, dict[str, Any]] = {}
LOCK = threading.Lock()

def loopback_url(value: str, label: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError(f"{label} must use a loopback address (127.0.0.1 or localhost)")
    return value.rstrip("/")

def load_config() -> dict[str, Any]:
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    return {}

def save_config(config: dict[str, Any]) -> None:
    if not isinstance(config.get("workflow"), dict) or not config["workflow"]:
        raise ValueError("Upload a ComfyUI API-format workflow JSON file.")
    config["ollama"] = loopback_url(config.get("ollama", "http://127.0.0.1:11434"), "Ollama URL")
    config["comfyui"] = loopback_url(config.get("comfyui", "http://127.0.0.1:8188"), "ComfyUI URL")
    if not config.get("model", "").strip():
        raise ValueError("Enter an installed Ollama model name.")
    if not str(config.get("positive_node", "")).strip():
        raise ValueError("Enter the positive prompt node ID from the ComfyUI workflow.")
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2), encoding="utf-8")

def dependency_status(config: dict[str, Any]) -> dict[str, Any]:
    import urllib.request
    result = {"python": True, "ffmpeg": shutil.which(config.get("ffmpeg", "ffmpeg")) is not None,
              "ollama": False, "comfyui": False, "model": False}
    for key, endpoint in (("ollama", config.get("ollama", "http://127.0.0.1:11434")),
                          ("comfyui", config.get("comfyui", "http://127.0.0.1:8188"))):
        try:
            with urllib.request.urlopen(endpoint + ("/api/tags" if key == "ollama" else "/system_stats"), timeout=2) as response:
                result[key] = response.status == 200
                if key == "ollama" and result[key]:
                    data = json.loads(response.read().decode())
                    result["model"] = any(x.get("name") == config.get("model") or x.get("model") == config.get("model")
                                          for x in data.get("models", []))
        except Exception:
            pass
    result["configured"] = bool(config.get("workflow") and config.get("positive_node") and config.get("model"))
    return result

def make_job(payload: dict[str, Any]) -> str:
    config = load_config()
    status = dependency_status(config)
    missing = [name for name in ("ffmpeg", "ollama", "comfyui", "model", "configured") if not status.get(name)]
    if missing:
        raise RuntimeError("Local setup is not ready: " + ", ".join(missing) + ". Complete setup and start Ollama and ComfyUI.")
    script = payload.get("script")
    if not isinstance(script, str) or not 20 <= len(script.strip()) <= 50000:
        raise ValueError("Script must contain 20 to 50,000 characters.")
    job_id = uuid.uuid4().hex
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    with LOCK:
        JOBS[job_id] = {"id": job_id, "state": "queued", "stage": "Queued", "progress": 0, "created": time.time()}
    thread = threading.Thread(target=run_job, args=(job_id, payload, config, job_dir), daemon=True)
    thread.start()
    return job_id

def run_job(job_id: str, payload: dict[str, Any], config: dict[str, Any], job_dir: Path) -> None:
    def update(**values: Any) -> None:
        with LOCK:
            JOBS[job_id].update(values)
    try:
        from script_agent import generate_storyboard
        from render_agent import render_project
        update(state="running", stage="Writing storyboard", progress=2)
        project = generate_storyboard(payload["script"], payload["character"], config["model"],
            config.get("ollama", "http://127.0.0.1:11434"), payload.get("title", "My Cartoon"),
            payload.get("genre", "Whimsical adventure"), int(payload.get("max_scenes", 10)), 900)
        project_path = job_dir / "project.json"
        project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding="utf-8")
        update(stage="Storyboard ready · rendering scenes", progress=8, scene_count=len(project["scenes"]))
        class Args: pass
        args = Args()
        args.project = str(project_path)
        args.workflow = str(job_dir / "workflow-api.json")
        Path(args.workflow).write_text(json.dumps(config["workflow"]), encoding="utf-8")
        args.positive_node = str(config["positive_node"])
        args.negative_node = str(config.get("negative_node") or "") or None
        args.seed_node = str(config.get("seed_node") or "") or None
        args.reference_image_node = str(config.get("reference_image_node") or "") or None
        args.reference_image = None
        args.comfyui = config.get("comfyui", "http://127.0.0.1:8188")
        args.output = str(job_dir / "render")
        args.seed = int(config.get("seed", 24681357))
        args.duration = float(config.get("duration", 6))
        args.timeout = int(config.get("timeout", 1800))
        args.ffmpeg = config.get("ffmpeg", "ffmpeg")
        args.piper = config.get("piper", "piper")
        args.piper_model = config.get("piper_model") or None
        args.require_video = bool(config.get("require_video", True))
        def on_scene(done: int, total: int, title: str) -> None:
            update(stage=f"Rendering scene {done}/{total}: {title}", progress=8 + int(88 * done / total))
        final = render_project(args, progress_callback=on_scene)
        rel = final.relative_to(CONFIG_DIR).as_posix()
        update(state="completed", stage="Video ready", progress=100, output="/outputs/" + rel)
    except Exception as exc:
        update(state="failed", stage="Generation failed", error=str(exc), progress=0)

class Handler(BaseHTTPRequestHandler):
    server_version = "CartoonForgeLocal/1.0"
    def log_message(self, *_: Any) -> None: pass
    def send_json(self, data: dict[str, Any], code: int = 200) -> None:
        body = json.dumps(data).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store")
        self.end_headers(); self.wfile.write(body)
    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/":
            if not SITE.exists(): self.send_error(404); return
            body = SITE.read_bytes(); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if path == "/api/status":
            config = load_config()
            self.send_json({"status": dependency_status(config), "config": {k: config.get(k) for k in
                ("model","ollama","comfyui","positive_node","negative_node","seed_node","piper_model","require_video")}})
            return
        if path.startswith("/api/job/"):
            job_id = path.rsplit("/",1)[-1]
            with LOCK: job = JOBS.get(job_id)
            self.send_json(job or {"error":"Job not found"}, 200 if job else 404); return
        if path.startswith("/outputs/"):
            target = (CONFIG_DIR / path.removeprefix("/outputs/")).resolve()
            if CONFIG_DIR.resolve() not in target.parents or not target.is_file(): self.send_error(404); return
            body = target.read_bytes(); self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(body))); self.send_header("Content-Disposition", f'attachment; filename="{target.name}"')
            self.end_headers(); self.wfile.write(body); return
        self.send_error(404)
    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 60 * 1024 * 1024: self.send_json({"error":"Invalid request size"}, 413); return
        try: payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception: self.send_json({"error":"Request must be valid JSON"}, 400); return
        try:
            if self.path == "/api/config":
                save_config(payload); self.send_json({"saved":True}); return
            if self.path == "/api/generate":
                job_id = make_job(payload); self.send_json({"job_id":job_id}, 202); return
            self.send_json({"error":"Not found"}, 404)
        except (ValueError, RuntimeError, OSError) as exc:
            self.send_json({"error":str(exc)}, 400)

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        parser.error("For safety, CartoonForge only binds to loopback.")
    print(f"CartoonForge Studio: http://127.0.0.1:{args.port}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()

if __name__ == "__main__": main()
