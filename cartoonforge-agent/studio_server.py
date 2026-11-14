#!/usr/bin/env python3
"""CartoonForge one-click studio with free shared-cloud LTX video and optional local renderer."""
from __future__ import annotations
import argparse, json, mimetypes, os, shutil, threading, time, uuid, re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from typing import Any
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent / "site" / "cartoonforge" / "studio.html"
CONFIG_DIR = Path.home() / ".cartoonforge"
CONFIG_FILE = CONFIG_DIR / "config.json"
OUTPUT_DIR = CONFIG_DIR / "outputs"
JOBS: dict[str, dict[str, Any]] = {}
LOCK = threading.Lock()
HF_SPACE = "https://lightricks-ltx-video-distilled.hf.space"
HF_API = "text_to_video"

def loopback_url(value: str, label: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError(f"{label} must use a loopback address (127.0.0.1 or localhost)")
    return value.rstrip("/")

def load_config() -> dict[str, Any]:
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    return {"provider": "huggingface_ltx"}

def save_config(config: dict[str, Any]) -> None:
    provider = config.get("provider", "huggingface_ltx")
    if provider == "huggingface_ltx":
        clean = {"provider": provider, "hf_token": str(config.get("hf_token", "")).strip(),
                 "width": 704, "height": 512, "duration": 3.0}
    elif provider == "comfyui_local":
        if not isinstance(config.get("workflow"), dict) or not config["workflow"]:
            raise ValueError("Upload a ComfyUI API-format workflow JSON file.")
        if not config.get("model", "").strip() or not str(config.get("positive_node", "")).strip():
            raise ValueError("Enter the installed Ollama model and positive prompt node ID.")
        clean = dict(config)
        clean["ollama"] = loopback_url(config.get("ollama", "http://127.0.0.1:11434"), "Ollama URL")
        clean["comfyui"] = loopback_url(config.get("comfyui", "http://127.0.0.1:8188"), "ComfyUI URL")
    else:
        raise ValueError("Unsupported generation provider.")
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(clean, indent=2), encoding="utf-8")

def dependency_status(config: dict[str, Any]) -> dict[str, Any]:
    provider = config.get("provider", "huggingface_ltx")
    result = {"provider": provider, "ffmpeg": shutil.which(config.get("ffmpeg", "ffmpeg")) is not None,
              "cloud": provider == "huggingface_ltx", "configured": provider == "huggingface_ltx"}
    if provider == "comfyui_local":
        result.update({"ollama": False, "comfyui": False, "model": False})
        for key, endpoint in (("ollama", config.get("ollama", "http://127.0.0.1:11434")),
                              ("comfyui", config.get("comfyui", "http://127.0.0.1:8188"))):
            try:
                with urllib.request.urlopen(endpoint + ("/api/tags" if key == "ollama" else "/system_stats"), timeout=2) as response:
                    result[key] = response.status == 200
                    if key == "ollama" and result[key]:
                        data = json.loads(response.read().decode())
                        result["model"] = any(x.get("name") == config.get("model") or x.get("model") == config.get("model") for x in data.get("models", []))
            except Exception:
                pass
        result["configured"] = bool(config.get("workflow") and config.get("positive_node") and config.get("model"))
    return result

def split_script(script: str, max_scenes: int) -> list[str]:
    """Split a script into ordered, readable beats without requiring a local LLM."""
    blocks = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n+", script) if p.strip()]
    if not blocks:
        blocks = [re.sub(r"\\s+", " ", script).strip()]
    sentences = []
    for block in blocks:
        sentences.extend(x.strip() for x in re.split(r"(?<=[.!?])\s+, block) if x.strip())
    if len(sentences) <= max_scenes:
        return sentences
    size = (len(sentences) + max_scenes - 1) // max_scenes
    return [" ".join(sentences[i:i+size]) for i in range(0, len(sentences), size)][:max_scenes]

def cloud_video(prompt: str, destination: Path, config: dict[str, Any], seed: int) -> None:
    """Call the public LTX ZeroGPU Gradio Space and download its generated clip."""
    import urllib.parse
    headers = {"Content-Type": "application/json"}
    token = config.get("hf_token", "").strip()
    if token:
        headers["Authorization"] = "Bearer " + token
    data = [prompt, "blurry, distorted, malformed anatomy, text, watermark, logo",
            "", "", int(config.get("height", 512)), int(config.get("width", 704)),
            "text-to-video", float(config.get("duration", 3.0)), 9, seed, True, 1.0, True]
    req = urllib.request.Request(HF_SPACE + "/gradio_api/call/" + HF_API,
        data=json.dumps({"data": data}).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            event_id = json.loads(response.read().decode()).get("event_id")
        if not event_id:
            raise RuntimeError("Cloud video service did not return a job ID.")
        poll = urllib.request.Request(HF_SPACE + "/gradio_api/call/" + HF_API + "/" + event_id, headers=headers)
        with urllib.request.urlopen(poll, timeout=600) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise RuntimeError("The shared cloud video Space denied the request. It may require a free Hugging Face account token, or may be temporarily restricted.") from exc
        if exc.code in (429, 503):
            raise RuntimeError("The free shared video queue is busy or rate-limited. Please retry later.") from exc
        raise RuntimeError(f"Cloud video request failed (HTTP {exc.code}).") from exc
    result = None
    blocks = raw.split("\n\n")
    for block in reversed(blocks):
        event = re.search(r"^event:\s*(\S+)", block, re.M)
        match = re.search(r"^data:\s*(.+)$", block, re.M)
        if not event or not match:
            continue
        if event.group(1) == "error":
            raise RuntimeError("The cloud video model reported an error: " + match.group(1)[:500])
        if event.group(1) == "complete":
            result = json.loads(match.group(1))
            break
    if not result:
        raise RuntimeError("The cloud video queue ended without a completed result.")
    video_url = None
    if isinstance(result, list) and result:
        item = result[0]
        if isinstance(item, dict):
            video_url = (item.get("video") or {}).get("url") or item.get("url")
    if not video_url and isinstance(result, dict):
        video_url = (result.get("video") or {}).get("url")
    parsed = urlparse(video_url or "")
    if parsed.scheme != "https" or not parsed.hostname:
        raise RuntimeError("Cloud service returned an invalid video URL.")
    with urllib.request.urlopen(video_url, timeout=180) as response:
        destination.write_bytes(response.read())
    if not destination.exists() or destination.stat().st_size < 1024:
        raise RuntimeError("Cloud service returned an empty video file.")

def make_job(payload: dict[str, Any]) -> str:
    config = load_config()
    status = dependency_status(config)
    if not status.get("ffmpeg"):
        raise RuntimeError("FFmpeg is required to assemble the final MP4. Install FFmpeg and add it to PATH.")
    if config.get("provider", "huggingface_ltx") == "comfyui_local":
        missing = [name for name in ("ollama", "comfyui", "model", "configured") if not status.get(name)]
        if missing:
            raise RuntimeError("Local setup is not ready: " + ", ".join(missing))
    script = payload.get("script")
    if not isinstance(script, str) or not 20 <= len(script.strip()) <= 50000:
        raise ValueError("Script must contain 20 to 50,000 characters.")
    if not isinstance(payload.get("character"), dict):
        raise ValueError("Character details are required.")
    job_id = uuid.uuid4().hex
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    with LOCK:
        JOBS[job_id] = {"id": job_id, "state": "queued", "stage": "Queued", "progress": 0, "created": time.time()}
    threading.Thread(target=run_job, args=(job_id, payload, config, job_dir), daemon=True).start()
    return job_id

def run_cloud_job(job_id: str, payload: dict[str, Any], config: dict[str, Any], job_dir: Path, update: Any) -> Path:
    import subprocess
    beats = split_script(payload["script"], max(1, min(int(payload.get("max_scenes", 4)), 6)))
    character = payload["character"]
    identity = (f"Main character: {character.get('name','hero')}, {character.get('species','cartoon character')}, "
        f"{character.get('color','distinctive colours')}; face {character.get('face','expressive')}; "
        f"fur/hair {character.get('hair_or_fur','distinctive')}; outfit {character.get('outfit','signature outfit')}; "
        f"markings {character.get('markings','consistent markings')}. Keep the same design and proportions.")
    clips = []
    for i, beat in enumerate(beats, 1):
        update(stage=f"Cloud rendering scene {i}/{len(beats)}", progress=int((i-1)*85/len(beats)))
        prompt = (f"Create a polished {payload.get('genre','2D animated cartoon')} short animated film scene, "
            f"widescreen cinematic composition. {identity} Scene action: {beat}. "
            "Clear readable action, coherent background, expressive character acting, consistent art direction, "
            "smooth natural motion, no captions, text, logos or watermark.")
        source = job_dir / f"scene-{i:02d}-cloud.mp4"
        cloud_video(prompt, source, config, 41000 + i)
        clip = job_dir / f"scene-{i:02d}.mp4"
        subprocess.run([config.get("ffmpeg","ffmpeg"), "-y", "-i", str(source), "-an",
            "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p",
            "-c:v","libx264","-preset","veryfast","-crf","23","-movflags","+faststart",str(clip)],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        clips.append(clip)
        update(stage=f"Scene {i}/{len(beats)} ready", progress=int(i*85/len(beats)))
    concat = job_dir / "concat.txt"
    concat.write_text("".join("file '"+p.as_posix()+"'\\n" for p in clips), encoding="utf-8")
    final = job_dir / "cartoonforge-final.mp4"
    update(stage="Assembling final MP4", progress=92)
    subprocess.run([config.get("ffmpeg","ffmpeg"), "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
        "-c:v","libx264","-preset","veryfast","-crf","23","-pix_fmt","yuv420p","-movflags","+faststart",str(final)],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return final

def run_job(job_id: str, payload: dict[str, Any], config: dict[str, Any], job_dir: Path) -> None:
    def update(**values: Any) -> None:
        with LOCK:
            JOBS[job_id].update(values)
    try:
        if config.get("provider", "huggingface_ltx") == "huggingface_ltx":
            final = run_cloud_job(job_id, payload, config, job_dir, update)
        else:
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
            args.project = str(project_path); args.workflow = str(job_dir / "workflow-api.json")
            Path(args.workflow).write_text(json.dumps(config["workflow"]), encoding="utf-8")
            args.positive_node = str(config["positive_node"]); args.negative_node = str(config.get("negative_node") or "") or None
            args.seed_node = str(config.get("seed_node") or "") or None; args.reference_image_node = None
            args.reference_image = None; args.comfyui = config.get("comfyui", "http://127.0.0.1:8188")
            args.output = str(job_dir / "render"); args.seed = int(config.get("seed", 24681357))
            args.duration = float(config.get("duration", 6)); args.timeout = int(config.get("timeout", 1800))
            args.ffmpeg = config.get("ffmpeg", "ffmpeg"); args.piper = config.get("piper", "piper")
            args.piper_model = config.get("piper_model") or None; args.require_video = bool(config.get("require_video", True))
            final = render_project(args, progress_callback=lambda done,total,title: update(
                stage=f"Rendering scene {done}/{total}: {title}", progress=8+int(88*done/total)))
        rel = final.relative_to(CONFIG_DIR).as_posix()
        update(state="completed", stage="Video ready", progress=100, output="/outputs/" + rel)
    except Exception as exc:
        update(state="failed", stage="Generation failed", error=str(exc), progress=0)

class Handler(BaseHTTPRequestHandler):
    server_version = "CartoonForge/2.0"
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
            self.send_json({"status": dependency_status(config), "config": {"provider":config.get("provider","huggingface_ltx")}})
            return
        if path.startswith("/api/job/"):
            with LOCK: job = JOBS.get(path.rsplit("/",1)[-1])
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
        if length <= 0 or length > 60*1024*1024: self.send_json({"error":"Invalid request size"},413); return
        try: payload=json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception: self.send_json({"error":"Request must be valid JSON"},400); return
        try:
            if self.path == "/api/config": save_config(payload); self.send_json({"saved":True}); return
            if self.path == "/api/generate": self.send_json({"job_id":make_job(payload)},202); return
            self.send_json({"error":"Not found"},404)
        except (ValueError,RuntimeError,OSError) as exc: self.send_json({"error":str(exc)},400)

def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--host",default="127.0.0.1"); parser.add_argument("--port",type=int,default=8765)
    args=parser.parse_args()
    if args.host not in ("127.0.0.1","localhost","::1"): parser.error("For safety, CartoonForge only binds to loopback.")
    print(f"CartoonForge Studio: http://127.0.0.1:{args.port}")
    ThreadingHTTPServer((args.host,args.port),Handler).serve_forever()

if __name__ == "__main__": main()
