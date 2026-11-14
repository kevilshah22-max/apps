#!/usr/bin/env python3
"""GitHub Actions runner for CartoonForge cloud video generation."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from studio_server import cloud_video, split_script  # noqa: E402


def scene_prompt(genre: str, character: dict[str, str], beat: str) -> str:
    identity = (
        f"Main character: {character.get('name', 'hero')}, "
        f"{character.get('species', 'cartoon character')}, "
        f"{character.get('color', 'distinctive colours')}; "
        f"face {character.get('face', 'expressive')}; "
        f"hair or fur {character.get('hair_or_fur', 'distinctive')}; "
        f"outfit {character.get('outfit', 'signature outfit')}; "
        f"markings {character.get('markings', 'consistent markings')}. "
        "Keep the same design and proportions."
    )
    return (
        f"Create a polished {genre} short animated film scene, "
        f"widescreen cinematic composition. {identity} Scene action: {beat}. "
        "Clear readable action, coherent background, expressive character acting, "
        "consistent art direction, smooth natural motion, no captions, text, "
        "logos or watermark."
    )


def read_inputs() -> tuple[str, str, int, dict[str, str]]:
    script = os.environ.get("CARTOON_SCRIPT", "").strip()
    if not 20 <= len(script) <= 50000:
        raise ValueError("Enter a script between 20 and 50,000 characters.")
    genre = os.environ.get("CARTOON_GENRE", "2D hand-drawn cartoon").strip()[:120]
    scenes = int(os.environ.get("CARTOON_SCENES", "3"))
    if not 1 <= scenes <= 6:
        raise ValueError("Scene count must be between 1 and 6.")
    character = {
        "name": os.environ.get("CHARACTER_NAME", "Pip")[:80],
        "species": os.environ.get("CHARACTER_SPECIES", "fox")[:80],
        "color": os.environ.get("CHARACTER_COLOR", "warm orange")[:80],
        "face": os.environ.get("CHARACTER_FACE", "expressive face, large eyes")[:120],
        "hair_or_fur": os.environ.get("CHARACTER_FUR", "soft orange fur")[:120],
        "outfit": os.environ.get("CHARACTER_OUTFIT", "blue scarf")[:120],
        "markings": os.environ.get("CHARACTER_MARKS", "white tail tip")[:120],
    }
    return script, genre, scenes, character


def main() -> int:
    try:
        script, genre, max_scenes, character = read_inputs()
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("FFmpeg was not found on the GitHub runner.")
        output_dir = Path(os.environ.get("CARTOON_OUTPUT_DIR", "cartoonforge-output"))
        output_dir.mkdir(parents=True, exist_ok=True)
        config: dict[str, Any] = {
            "provider": "huggingface_ltx",
            "hf_token": os.environ.get("HF_TOKEN", "").strip(),
            "width": 704,
            "height": 512,
            "duration": 3.0,
            "ffmpeg": ffmpeg,
        }
        beats = split_script(script, max_scenes)
        clips: list[Path] = []
        for index, beat in enumerate(beats, start=1):
            print(f"Generating scene {index}/{len(beats)}...", flush=True)
            source = output_dir / f"scene-{index:02d}-source.mp4"
            cloud_video(scene_prompt(genre, character, beat), source, config, 41000 + index)
            clip = output_dir / f"scene-{index:02d}.mp4"
            subprocess.run(
                [ffmpeg, "-y", "-i", str(source), "-an", "-vf",
                 "scale=1280:720:force_original_aspect_ratio=decrease,"
                 "pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                 "-movflags", "+faststart", str(clip)],
                check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            clips.append(clip)
        concat = output_dir / "concat.txt"
        concat.write_text(
            "".join("file '" + p.resolve().as_posix().replace("'", "'\\''") + "'\n" for p in clips),
            encoding="utf-8",
        )
        final = output_dir / "cartoonforge-final.mp4"
        print("Assembling final MP4...", flush=True)
        subprocess.run(
            [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
             "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(final)],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        manifest = {
            "title": os.environ.get("CARTOON_TITLE", "My Cartoon")[:100],
            "genre": genre,
            "scenes": beats,
            "character": character,
            "output": final.name,
            "note": "Cloud video output; generated scenes may vary in identity and fidelity.",
        }
        (output_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"VIDEO_READY={final}", flush=True)
        return 0
    except Exception as exc:
        print(f"CartoonForge failed: {exc}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
