#!/usr/bin/env python3
"""Local script-to-storyboard agent using an Ollama model on the user's machine."""
from __future__ import annotations
import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

STORYBOARD_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["scenes"],
    "properties": {
        "scenes": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["title", "visual", "beat", "dialogue", "narration", "duration", "shot"],
                "properties": {
                    "title": {"type": "string"},
                    "visual": {"type": "string"},
                    "beat": {"type": "string"},
                    "dialogue": {"type": "string"},
                    "narration": {"type": "string"},
                    "duration": {"type": "number"},
                    "shot": {"type": "string"}
                }
            }
        }
    }
}

def validate_script(script: str, max_scenes: int) -> None:
    if not isinstance(script, str) or len(script.strip()) < 20:
        raise ValueError("Script must contain at least 20 non-whitespace characters")
    if len(script) > 50_000:
        raise ValueError("Script exceeds the 50000-character local processing limit")
    if not isinstance(max_scenes, int) or isinstance(max_scenes, bool) or not 1 <= max_scenes <= 30:
        raise ValueError("max_scenes must be an integer from 1 to 30")

def validate_character(character: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(character, dict):
        raise TypeError("Character bible must be a JSON object")
    for key in ("name", "species", "color"):
        if not isinstance(character.get(key), str) or not character[key].strip():
            raise ValueError(f"Character bible requires a non-empty {key}")
    return character

def validate_scenes(payload: dict[str, Any], max_scenes: int) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("scenes"), list):
        raise ValueError("Local model response must contain a scenes array")
    scenes = payload["scenes"]
    if not 1 <= len(scenes) <= max_scenes:
        raise ValueError(f"Model returned {len(scenes)} scenes; expected 1 to {max_scenes}")
    clean = []
    for index, scene in enumerate(scenes, 1):
        if not isinstance(scene, dict):
            raise ValueError(f"Scene {index} must be an object")
        item = {}
        for key in ("title", "visual", "beat", "dialogue", "narration", "shot"):
            value = scene.get(key, "")
            if not isinstance(value, str):
                raise ValueError(f"Scene {index} {key} must be text")
            if key in ("title", "visual", "beat") and not value.strip():
                raise ValueError(f"Scene {index} {key} cannot be empty")
            if len(value) > 5000:
                raise ValueError(f"Scene {index} {key} exceeds 5000 characters")
            item[key] = value.strip()
        duration = scene.get("duration")
        if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not 1 <= duration <= 60:
            raise ValueError(f"Scene {index} duration must be between 1 and 60 seconds")
        item["number"] = index
        item["duration"] = float(duration)
        clean.append(item)
    return clean

def generate_storyboard(script: str, character: dict[str, Any], model: str,
                        base_url: str = "http://127.0.0.1:11434",
                        title: str = "Untitled cartoon", genre: str = "cinematic animated adventure",
                        max_scenes: int = 12, timeout: int = 600) -> dict[str, Any]:
    validate_script(script, max_scenes)
    character = validate_character(character)
    if not isinstance(model, str) or not model.strip():
        raise ValueError("An installed local Ollama model name is required")
    if not isinstance(timeout, int) or timeout <= 0:
        raise ValueError("timeout must be a positive integer")
    system_prompt = (
        "You are a professional animation screenwriter and storyboard director. Convert the supplied script "
        "into a production-ready scene breakdown. Preserve the source story's chronology, core events, tone, "
        "and character intent. Do not invent named characters, subplots, locations or outcomes absent from the "
        "script. Keep every scene visually filmable and distinct. Maintain the exact character identity described "
        "in the character bible. Do not add text, logos or subtitles inside images. Return only the requested JSON."
    )
    user_prompt = {
        "title": title, "genre": genre, "max_scenes": max_scenes,
        "character_bible": character,
        "script": script,
        "instructions": [
            "Divide the script into coherent sequential scenes, merging beats that do not need separate shots.",
            "Each visual field must describe a concrete image-generation composition, setting, lighting and action.",
            "Each beat must summarise the story action without changing its meaning.",
            "Keep dialogue faithful to the script; do not fabricate quotations. Use an empty string if none is present.",
            "Use narration only for source narration or a concise faithful narration bridge; otherwise use an empty string.",
            "Choose a practical scene duration from 3 to 15 seconds unless the source requires otherwise.",
            "The shot field should describe framing or camera movement in plain language.",
            "Return no more than the requested number of scenes."
        ]
    }
    request_payload = {
        "model": model,
        "stream": False,
        "format": STORYBOARD_SCHEMA,
        "options": {"temperature": 0.2},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)}
        ]
    }
    request = urllib.request.Request(
        base_url.rstrip("/") + "/api/chat",
        data=json.dumps(request_payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as error:
        raise RuntimeError(
            f"Could not reach local Ollama at {base_url}. Start Ollama and verify the model is installed. Details: {error}"
        ) from error
    message = result.get("message") if isinstance(result, dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Ollama returned no storyboard content; check model and local server logs")
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as error:
        raise ValueError(f"Local model did not return valid JSON: {error}") from error
    scenes = validate_scenes(parsed, max_scenes)
    return {
        "title": title,
        "genre": genre,
        "character": character,
        "scenes": scenes,
        "generation": {
            "provider": "local Ollama",
            "model": model,
            "source_script_characters": len(script),
            "scene_count": len(scenes),
            "mode": "local inference; source script is sent only to the configured local Ollama server"
        },
        "limitations": [
            "Review every scene against the original script; local language models can omit, distort or invent details.",
            "Character consistency depends on the character bible, reference conditioning and selected image/video model.",
            "Storyboard generation does not itself generate images, animation, voice or lip-sync."
        ]
    }

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Turn a script into CartoonForge project JSON using local Ollama.")
    parser.add_argument("--script", required=True, help="UTF-8 text script file")
    parser.add_argument("--character-json", required=True, help="Character bible JSON file")
    parser.add_argument("--model", required=True, help="Installed local Ollama model name")
    parser.add_argument("--ollama", default="http://127.0.0.1:11434")
    parser.add_argument("--title", default="Untitled cartoon")
    parser.add_argument("--genre", default="cinematic animated adventure")
    parser.add_argument("--max-scenes", type=int, default=12)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--output", default="cartoonforge-project.json")
    return parser.parse_args(argv)

if __name__ == "__main__":
    try:
        args = parse_args()
        script = Path(args.script).read_text(encoding="utf-8")
        character = json.loads(Path(args.character_json).read_text(encoding="utf-8"))
        project = generate_storyboard(script, character, args.model, args.ollama,
            args.title, args.genre, args.max_scenes, args.timeout)
        Path(args.output).write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Created {args.output} with {len(project['scenes'])} scenes.")
    except (OSError, ValueError, TypeError, RuntimeError) as error:
        print(f"CartoonForge script agent failed: {error}", file=sys.stderr)
        sys.exit(1)
