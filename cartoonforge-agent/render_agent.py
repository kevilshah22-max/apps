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
        f"signature palette {character.get('color', 'consistent colours')}; preserve identical face, proportions, markings "
        "and costume across every shot. "
        f"Art direction: {project.get('genre', 'cinematic animated adventure')}. "
        f"Story: {project.get('title', project.get('story', ''))}. "
        f"Shot {scene.get('number', '')}: {scene.get('title', 'Untitled scene')}. "
        f"Visual direction: {scene.get('visual', scene.get('beat', ''))}. "
        "Expressive acting, coherent environment, cinematic composition, detailed lighting, polished materials. "
        "No lettering, subtitles, logos or watermarks."
    )

def apply_workflow_inputs(template: dict[str, Any], prompt: str, seed: int,
                          positive_node: str, negative_node: str | None = None,
                          seed_node: str | None = None) -> dict[str, Any]:
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

def download_image(base_url: str, history: dict[str, Any], destination: Path) -> None:
    for output in history.get("outputs", {}).values():
        images = output.get("images", []) if isinstance(output, dict) else []
        if images:
            image = images[0]
            query = urllib.parse.urlencode({"filename": image["filename"],
                "subfolder": image.get("subfolder", ""), "type": image.get("type", "output")})
            with urllib.request.urlopen(base_url.rstrip("/") + "/view?" + query, timeout=60) as response:
                destination.write_bytes(response.read())
            return
    raise RuntimeError("ComfyUI completed but returned no image output; check workflow output nodes")

def run(command: list[str], stdin_text: str | None = None) -> None:
    subprocess.run(command, input=None if stdin_text is None else stdin_text.encode(),
                   check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def render_clip(image: Path, clip: Path, duration: float, ffmpeg: str) -> None:
    frames = round(duration * 24)
    video_filter = ("scale=2200:1238:force_original_aspect_ratio=increase,crop=2200:1238,"
        "zoompan=z='min(zoom+0.00035,1.08)':d=1:s=1920x1080:fps=24,format=yuv420p")
    run([ffmpeg, "-y", "-loop", "1", "-framerate", "24", "-i", str(image),
         "-frames:v", str(frames), "-vf", video_filter, "-r", "24",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", str(clip)])

def render_project(args: argparse.Namespace) -> Path:
    project_path, workflow_path = Path(args.project).resolve(), Path(args.workflow).resolve()
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    project = json.loads(project_path.read_text(encoding="utf-8"))
    template = json.loads(workflow_path.read_text(encoding="utf-8"))
    scenes = project.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("Project JSON must contain a non-empty scenes array")
    manifest = {"renderer": "CartoonForge local render agent", "comfyui": args.comfyui,
        "frame_size": "1920x1080", "fps": 24, "scene_count": len(scenes), "assets": [],
        "limitations": ["Quality and character consistency depend on the selected local model/workflow.",
        "Generated keyframes receive camera motion; this is not full character-motion animation.",
        "No hosted AI service is used. ComfyUI, model weights and FFmpeg must be installed locally."]}
    for index, scene in enumerate(scenes, 1):
        prompt = build_scene_prompt(project, {**scene, "number": index})
        workflow = apply_workflow_inputs(template, prompt, args.seed + index - 1,
            args.positive_node, args.negative_node, args.seed_node)
        history = render_comfyui(args.comfyui, workflow, args.timeout)
        image = output_dir / f"scene-{index:03d}.png"
        download_image(args.comfyui, history, image)
        clip = output_dir / f"scene-{index:03d}.mp4"
        render_clip(image, clip, args.duration, args.ffmpeg)
        manifest["assets"].append({"scene": index, "title": scene.get("title", f"Scene {index}"),
            "prompt": prompt, "image": image.name, "clip": clip.name})
        print(f"[{index}/{len(scenes)}] Rendered {scene.get('title', f'Scene {index}')}")
    concat = output_dir / "concat.txt"
    concat.write_text("".join(f"file '{(output_dir / f'scene-{i:03d}.mp4').as_posix()}'\n"
        for i in range(1, len(scenes) + 1)), encoding="utf-8")
    silent = output_dir / "cartoon-silent.mp4"
    run([args.ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(silent)])
    final = output_dir / "cartoonforge-final.mp4"
    if args.piper_model:
        character = (project.get("character") or {}).get("name", "Narrator")
        narration = "\n".join(f"{character}. Scene {i}. " +
            str(s.get("dialogue") or s.get("beat") or s.get("visual") or "")
            for i, s in enumerate(scenes, 1))
        voice = output_dir / "voice.wav"
        run([args.piper, "--model", args.piper_model, "--output_file", str(voice)], narration)
        run([args.ffmpeg, "-y", "-i", str(silent), "-i", str(voice), "-map", "0:v:0", "-map", "1:a:0",
             "-c:v", "copy", "-c:a", "aac", "-af", "apad", "-shortest", str(final)])
        manifest["voice"] = {"engine": "Piper", "model": Path(args.piper_model).name, "file": voice.name}
    else:
        silent.replace(final)
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
    parser.add_argument("--comfyui", default="http://127.0.0.1:8188")
    parser.add_argument("--output", default="cartoonforge-output")
    parser.add_argument("--seed", type=int, default=24681357)
    parser.add_argument("--duration", type=float, default=6.0)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--piper", default="piper")
    parser.add_argument("--piper-model", help="Optional local Piper ONNX voice model")
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
