#!/usr/bin/env python3
"""Local CartoonForge render agent: ComfyUI keyframes + FFmpeg motion + optional Piper narration."""
from __future__ import annotations
import argparse, json, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path
from typing import Any

def build_scene_prompt(project: dict[str, Any], scene: dict[str, Any]) -> str:
    character = project.get("character") or {}
    return (
        "High-quality original 3D animated family-film frame, widescreen 16:9. "
        f"Character bible: {character.get('name', 'main character')}, a {character.get('species', 'cartoon character')}, "
        f"signature palette {character.get('color', 'consistent colours')}; "
        f"face shape {character.get('face', 'consistent face shape')}; "
        f"eyes {character.get('eyes', 'consistent eye design')}; "
        f"hair or fur {character.get('hair_or_fur', 'consistent hair or fur')}; "
        f"body proportions {character.get('proportions', 'consistent proportions')}; "
        f"costume {character.get('outfit', 'same signature outfit')}; "
        f"distinctive markings {character.get('markings', 'same distinctive markings')}; "
        f"accessories {character.get('accessories', 'same accessories')}. "
        "Treat this character bible and supplied reference image as identity constraints: preserve the same face, "
        "silhouette, palette, costume, markings and accessories in every shot. "
        f"Art direction: {project.get('genre', 'cinematic animated adventure')}. "
        f"Story: {project.get('title', project.get('story', ''))}. "
        f"Shot {scene.get('number', '')}: {scene.get('title', 'Untitled scene')}. "
        f"Visual direction: {scene.get('visual', scene.get('beat', ''))}. "
        "Expressive acting, coherent environment, cinematic composition, detailed lighting, polished materials. "
        "No lettering, subtitles, logos or watermarks."
    )

def apply_workflow_inputs(template: dict[str, Any], prompt: str, seed: int,
                          positive_node: str, negative_node: str | None = None,
                          seed_node: str | None = None,
                          reference_image_node: str | None = None,
                          reference_image_name: str | None = None) -> dict[str, Any]:
    workflow = json.loads(json.dumps(template))
    def inputs_for(node_id: str) -> dict[str, Any]:
        if node_id not in workflow or not isinstance(workflow[node_id].get("inputs"), dict):
            raise ValueError(f"Workflow node {node_id!r} is missing or malformed")
        return workflow[node_id]["inputs"]
    positive = inputs_for(positive_node)
    if "text" not in positive:
        raise ValueError(f"Positive node {positive_node!r} must have inputs.text")
    positive["text"] = prompt
    if negative_node:
        negative = inputs_for(negative_node)
        if "text" not in negative:
            raise ValueError(f"Negative node {negative_node!r} must have inputs.text")
        negative["text"] = "text, watermark, logo, malformed anatomy, extra limbs, inconsistent character"
    if seed_node:
        seed_inputs = inputs_for(seed_node)
        field = "noise_seed" if "noise_seed" in seed_inputs else "seed" if "seed" in seed_inputs else None
        if not field:
            raise ValueError(f"Seed node {seed_node!r} needs inputs.noise_seed or inputs.seed")
        seed_inputs[field] = seed
    if reference_image_node:
        if not reference_image_name:
            raise ValueError("A reference image node requires an uploaded reference image")
        reference_inputs = inputs_for(reference_image_node)
        if "image" not in reference_inputs:
            raise ValueError(f"Reference image node {reference_image_node!r} must have inputs.image")
        reference_inputs["image"] = reference_image_name
    elif reference_image_name:
        raise ValueError("Reference image uploaded but --reference-image-node was not provided")
    return workflow

def request_json(url: str, payload: dict[str, Any] | None = None, timeout: int = 30) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(url, data=data,
        headers={"Content-Type": "application/json"} if data is not None else {},
        method="POST" if data is not None else "GET")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode())

def render_comfyui(base_url: str, workflow: dict[str, Any], timeout_seconds: int) -> dict[str, Any]:
    base_url = base_url.rstrip("/")
    submitted = request_json(base_url + "/prompt", {"prompt": workflow})
    prompt_id = submitted.get("prompt_id")
    if not prompt_id:
        raise RuntimeError(f"ComfyUI did not return prompt_id: {submitted}")
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        history = request_json(base_url + "/history/" + urllib.parse.quote(prompt_id))
        record = history.get(prompt_id)
        if record and record.get("outputs"):
            return record
        time.sleep(2)
    raise TimeoutError(f"ComfyUI render timed out for prompt {prompt_id}")

def select_output_asset(history: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    """Prefer a true video output; fall back to an image keyframe."""
    for output in history.get("outputs", {}).values():
        if not isinstance(output, dict):
            continue
        for key in ("videos", "gifs"):
            assets = output.get(key, [])
            if assets:
                return "video", assets[0]
    for output in history.get("outputs", {}).values():
        if isinstance(output, dict) and output.get("images"):
            return "image", output["images"][0]
    return None

def download_asset(base_url: str, history: dict[str, Any], destination: Path) -> tuple[str, Path]:
    selected = select_output_asset(history)
    if not selected:
        raise RuntimeError("ComfyUI completed but returned no image or video output; check workflow output nodes")
    asset_type, asset = selected
    suffix = Path(asset.get("filename", "")).suffix or (".mp4" if asset_type == "video" else ".png")
    destination = destination.with_suffix(suffix)
    query = urllib.parse.urlencode({"filename": asset["filename"],
        "subfolder": asset.get("subfolder", ""), "type": asset.get("type", "output")})
    with urllib.request.urlopen(base_url.rstrip("/") + "/view?" + query, timeout=120) as response:
        destination.write_bytes(response.read())
    return asset_type, destination

def run(command: list[str], stdin_text: str | None = None) -> None:
    subprocess.run(command, input=None if stdin_text is None else stdin_text.encode(),
                   check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def build_scene_timeline(scenes: list[dict[str, Any]], default_duration: float) -> list[dict[str, Any]]:
    """Validate scene durations and create a deterministic per-scene narration timeline."""
    if not isinstance(default_duration, (int, float)) or not 0 < default_duration <= 300:
        raise ValueError("Default scene duration must be greater than 0 and no more than 300 seconds")
    timeline, cursor = [], 0.0
    for index, scene in enumerate(scenes, 1):
        if not isinstance(scene, dict):
            raise ValueError(f"Scene {index} must be an object")
        raw_duration = scene.get("duration", default_duration)
        if isinstance(raw_duration, bool) or not isinstance(raw_duration, (int, float)) or not 0 < raw_duration <= 300:
            raise ValueError(f"Scene {index} duration must be greater than 0 and no more than 300 seconds")
        dialogue = scene.get("dialogue", "")
        narration = scene.get("narration", "")
        beat = scene.get("beat", "")
        text = narration or dialogue or beat or ""
        if not isinstance(text, str):
            raise ValueError(f"Scene {index} dialogue/narration/beat must be text")
        if len(text) > 10_000:
            raise ValueError(f"Scene {index} narration exceeds 10000 characters")
        duration = float(raw_duration)
        timeline.append({"scene": index, "start_seconds": cursor, "end_seconds": cursor + duration,
                         "duration_seconds": duration, "text": text})
        cursor += duration
    return timeline
def render_clip(image: Path, clip: Path, duration: float, ffmpeg: str) -> None:
    frames = round(duration * 24)
    video_filter = ("scale=2200:1238:force_original_aspect_ratio=increase,crop=2200:1238,"
        "zoompan=z='min(zoom+0.00035,1.08)':d=1:s=1920x1080:fps=24,format=yuv420p")
    run([ffmpeg, "-y", "-loop", "1", "-framerate", "24", "-i", str(image),
         "-frames:v", str(frames), "-vf", video_filter, "-r", "24",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", str(clip)])

def normalise_video_clip(source: Path, clip: Path, ffmpeg: str, duration: float) -> None:
    """Normalise a ComfyUI-generated video/GIF for reliable concatenation."""
    video_filter = ("scale=2200:1238:force_original_aspect_ratio=increase,crop=2200:1238,"
        "fps=24,scale=1920:1080,format=yuv420p")
    run([ffmpeg, "-y", "-i", str(source), "-an", "-vf", video_filter,
         "-r", "24", "-t", str(duration), "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-movflags", "+faststart", str(clip)])


def upload_reference_image(base_url: str, image_path: Path) -> str:
    """Upload a local reference image to ComfyUI's input directory and return its server filename."""
    import mimetypes, uuid
    image_path = image_path.resolve()
    if not image_path.is_file():
        raise FileNotFoundError(f"Reference image does not exist: {image_path}")
    if image_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise ValueError("Reference image must be PNG, JPG, JPEG or WEBP")
    payload = image_path.read_bytes()
    if not payload or len(payload) > 25 * 1024 * 1024:
        raise ValueError("Reference image must be non-empty and no larger than 25 MB")
    boundary = "----CartoonForge" + uuid.uuid4().hex
    mime = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{image_path.name}\"\r\nContent-Type: {mime}\r\n\r\n".encode(),
        payload,
        f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{boundary}--\r\n".encode()
    ]
    request = urllib.request.Request(
        base_url.rstrip("/") + "/upload/image", data=b"".join(parts),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}, method="POST")
    with urllib.request.urlopen(request, timeout=120) as response:
        result = json.loads(response.read().decode())
    name = result.get("name")
    if not name:
        raise RuntimeError(f"ComfyUI did not confirm reference image upload: {result}")
    return name

def build_concat_file_list(assets: list[dict[str, Any]], output_dir: Path) -> str:
    """Build FFmpeg's concat list from actual rendered clips, including muxed audio."""
    root = output_dir.resolve()
    entries = []
    for index, asset in enumerate(assets, 1):
        clip_name = asset.get("clip")
        if not isinstance(clip_name, str) or not clip_name:
            raise ValueError(f"Rendered asset {index} is missing its clip filename")
        clip_path = (root / clip_name).resolve()
        if clip_path.parent != root:
            raise ValueError(f"Rendered asset {index} clip must be inside the output directory")
        entries.append(f"file '{clip_path.as_posix()}'\n")
    return "".join(entries)


def render_project(args: argparse.Namespace, progress_callback: Any | None = None) -> Path:
    project_path, workflow_path = Path(args.project).resolve(), Path(args.workflow).resolve()
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    project = json.loads(project_path.read_text(encoding="utf-8"))
    template = json.loads(workflow_path.read_text(encoding="utf-8"))
    reference_image_name = None
    if args.reference_image:
        if not args.reference_image_node:
            raise ValueError("--reference-image-node is required when --reference-image is supplied")
        reference_image_name = upload_reference_image(args.comfyui, Path(args.reference_image))
    elif args.reference_image_node:
        raise ValueError("--reference-image requires --reference-image-node")
    scenes = project.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("Project JSON must contain a non-empty scenes array")
    timeline = build_scene_timeline(scenes, args.duration)
    manifest = {"renderer": "CartoonForge local render agent", "comfyui": args.comfyui,
        "frame_size": "1920x1080", "fps": 24, "scene_count": len(scenes), "assets": [],
        "character_bible": project.get("character") or {},
        "reference_image": {"enabled": bool(reference_image_name), "comfyui_filename": reference_image_name,
            "conditioning_node": args.reference_image_node} if reference_image_name else {"enabled": False},
        "audio_timeline": timeline,
        "audio": {"engine": "Piper per-scene TTS" if args.piper_model else "disabled",
            "model": Path(args.piper_model).name if args.piper_model else None, "lip_sync": "not implemented"},
        "limitations": ["Quality and character consistency depend on the selected local model/workflow.",
        "A video-capable ComfyUI workflow can produce full-motion scene clips; image workflows fall back to keyframes with camera motion.",
        "No hosted AI service is used. ComfyUI, model weights and FFmpeg must be installed locally."]}
    for index, scene in enumerate(scenes, 1):
        scene_timing = timeline[index - 1]
        scene_duration = scene_timing["duration_seconds"]
        prompt = build_scene_prompt(project, {**scene, "number": index})
        workflow = apply_workflow_inputs(template, prompt, args.seed + index - 1,
            args.positive_node, args.negative_node, args.seed_node,
            args.reference_image_node, reference_image_name)
        history = render_comfyui(args.comfyui, workflow, args.timeout)
        asset_type, source_asset = download_asset(args.comfyui, history, output_dir / f"scene-{index:03d}-source")
        clip = output_dir / f"scene-{index:03d}.mp4"
        if asset_type == "video":
            normalise_video_clip(source_asset, clip, args.ffmpeg, scene_duration)
        elif args.require_video:
            raise RuntimeError(f"Scene {index} returned an image, but --require-video was set. Use a ComfyUI video workflow with a video output node.")
        else:
            render_clip(source_asset, clip, scene_duration, args.ffmpeg)
        audio_asset = None
        if args.piper_model:
            audio_asset = output_dir / f"scene-{index:03d}-voice.wav"
            if scene_timing["text"].strip():
                run([args.piper, "--model", args.piper_model, "--output_file", str(audio_asset)], scene_timing["text"])
            else:
                run([args.ffmpeg, "-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono",
                     "-t", str(scene_duration), "-c:a", "pcm_s16le", str(audio_asset)])
            muxed = output_dir / f"scene-{index:03d}-with-audio.mp4"
            run([args.ffmpeg, "-y", "-i", str(clip), "-i", str(audio_asset),
                 "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
                 "-af", "apad", "-t", str(scene_duration), "-movflags", "+faststart", str(muxed)])
            clip = muxed
        manifest["assets"].append({"scene": index, "title": scene.get("title", f"Scene {index}"),
            "start_seconds": scene_timing["start_seconds"], "duration_seconds": scene_duration,
            "narration_text": scene_timing["text"] if args.piper_model else None,
            "voice_asset": audio_asset.name if audio_asset else None,
            "prompt": prompt, "source_type": asset_type, "source_asset": source_asset.name, "clip": clip.name})
        print(f"[{index}/{len(scenes)}] Rendered {scene.get('title', f'Scene {index}')}")
        if progress_callback is not None:
            progress_callback(index, len(scenes), scene.get("title", f"Scene {index}"))
    concat = output_dir / "concat.txt"
    concat.write_text(build_concat_file_list(manifest["assets"], output_dir), encoding="utf-8")
    silent = output_dir / "cartoon-silent.mp4"
    run([args.ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(silent)])
    final = output_dir / "cartoonforge-final.mp4"
    silent.replace(final)
    if args.piper_model:
        manifest["voice"] = {"engine": "Piper", "mode": "per-scene narration/dialogue",
            "model": Path(args.piper_model).name,
            "timing": "Each scene has its own audio clip; short speech is padded with silence to scene duration. No lip-sync."}
    manifest["output"] = final.name
    (output_dir / "render_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Finished: {final}")
    return final

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render CartoonForge project JSON locally with ComfyUI and FFmpeg.")
    parser.add_argument("--project", required=True, help="CartoonForge JSON export")
    parser.add_argument("--workflow", required=True, help="ComfyUI API-format workflow JSON")
    parser.add_argument("--positive-node", required=True, help="Positive text-encoder node ID")
    parser.add_argument("--negative-node", help="Optional negative text-encoder node ID")
    parser.add_argument("--seed-node", help="Optional sampler node ID")
    parser.add_argument("--reference-image", help="Optional local character reference image (PNG/JPG/WEBP)")
    parser.add_argument("--reference-image-node", help="ComfyUI LoadImage/IP-Adapter image input node ID")
    parser.add_argument("--comfyui", default="http://127.0.0.1:8188")
    parser.add_argument("--output", default="cartoonforge-output")
    parser.add_argument("--seed", type=int, default=24681357)
    parser.add_argument("--duration", type=float, default=6.0)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--piper", default="piper")
    parser.add_argument("--piper-model", help="Optional local Piper ONNX voice model")
    parser.add_argument("--require-video", action="store_true", help="Fail if a scene workflow returns an image instead of a video clip")
    args = parser.parse_args(argv)
    if args.duration <= 0 or args.timeout <= 0:
        parser.error("--duration and --timeout must be positive")
    return args

if __name__ == "__main__":
    try:
        render_project(parse_args())
    except (OSError, ValueError, RuntimeError, TimeoutError, subprocess.CalledProcessError) as error:
        print(f"CartoonForge render failed: {error}", file=sys.stderr)
        sys.exit(1)
