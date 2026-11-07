# CartoonForge Local Render Agent

CartoonForge's browser MVP exports a storyboard JSON file. This companion agent turns that export into scene assets and an MP4 using a **local ComfyUI instance** and FFmpeg. It supports true video clips from compatible ComfyUI video workflows (preferred) and image-keyframe fallback. Optional narration uses a local Piper voice model.

## What it does

1. Reads the CartoonForge project JSON export.
2. Builds a reusable character bible (face, eyes, fur/hair, proportions, outfit, markings and accessories) into every scene prompt.
3. Injects each scene prompt and a deterministic seed into a ComfyUI API-format workflow.
4. Submits each shot to ComfyUI and downloads a generated video clip when the workflow exposes a video output; otherwise it downloads an image keyframe.
5. Normalises true video clips to 1920×1080/24 fps, or creates a subtle camera-motion clip from an image keyframe.
6. Uses each scene's optional `duration` field (or the default duration) to create a cumulative production timeline.
7. Optionally generates per-scene narration/dialogue with Piper and aligns each audio clip to its scene; short speech is padded with silence to the scene duration.
8. Joins the timed scene clips into `cartoonforge-final.mp4` and writes a render manifest containing prompts, assets, audio timing and limitations.

This is a local render pipeline, not a hosted AI service. It does not transmit scripts to a third-party provider.

## Requirements

- Python 3.10 or newer (standard library only; no pip packages required).
- ComfyUI running locally, normally at `http://127.0.0.1:8188`.
- A ComfyUI model and a working **API-format** workflow. Image workflows produce keyframes; video-diffusion workflows with a video output node produce full-motion clips.
- FFmpeg installed and available as `ffmpeg`.
- Optional: Piper TTS and a compatible local ONNX voice model.

A GPU and suitable model are strongly recommended for practical render times. The model weights are not included in this repository; check the model's licence and usage terms before downloading or publishing outputs.

## Setup

1. Open CartoonForge in the browser: `https://kevilshah22-max.github.io/apps/cartoonforge/`.
2. Create a story and export **Project JSON**.
3. Start ComfyUI locally and load an image-generation workflow.
4. In ComfyUI, save the workflow in **API format** (not the normal UI workflow format).
5. Identify the node ID for the positive CLIP text encoder. Optionally identify the negative text encoder and sampler node. For reference conditioning, add a LoadImage or compatible IP-Adapter/reference-image node to the workflow and identify its `inputs.image` node ID.
6. Save the API workflow JSON locally, for example as `workflow-api.json`.

## Render

```bash
python cartoonforge-agent/render_agent.py \
  --project cartoonforge-project.json \
  --workflow workflow-api.json \
  --positive-node 6 \
  --negative-node 7 \
  --seed-node 3 \
  --output ./cartoon-output
```

Node IDs above are examples only: use the IDs from your own workflow. Omit `--negative-node` or `--seed-node` if your workflow does not have those nodes. `--reference-image` is optional; when supplied, `--reference-image-node` is required and must point to a node with an `inputs.image` field. The agent uploads PNG/JPG/JPEG/WEBP references (maximum 25 MB) to the local ComfyUI input folder and injects the returned filename into the workflow. The selected workflow must actually use that image as a conditioning input (for example, through an IP-Adapter/reference-image chain); a LoadImage node alone does not guarantee identity conditioning. Use `--require-video` with a ComfyUI video-diffusion workflow to reject image-only outputs; without it, the agent accepts true video clips and falls back to camera-motion keyframes. You can change the ComfyUI address with `--comfyui`, shot duration with `--duration`, and render wait limit with `--timeout`.

Optional local per-scene narration/dialogue:

Each exported scene may include `duration` (seconds), `dialogue`, and/or `narration`. `narration` takes precedence over `dialogue`; `beat` is used as a fallback. If `duration` is omitted, `--duration` is used. The timeline is cumulative and recorded in `render_manifest.json`.

```bash
python cartoonforge-agent/render_agent.py \
  --project cartoonforge-project.json \
  --workflow workflow-api.json \
  --positive-node 6 \
  --negative-node 7 \
  --seed-node 3 \
  --piper-model ./voices/en_US-voice-medium.onnx \
  --output ./cartoon-output
```

The Piper executable must be on PATH (or specify `--piper`). Voice model licensing is separate from the code licence.

## Output

- `scene-001-source.mp4` (or another workflow output extension) — generated video clip, when the workflow supports video.
- `scene-001-source.png` — generated keyframe when the workflow is image-only.
- `scene-001.mp4`, ... — normalised video scene clips; keyframe clips use subtle camera motion.
- `cartoonforge-final.mp4` — joined 1080p video.
- `scene-001-voice.wav`, ... — optional per-scene Piper narration/dialogue assets.
- `render_manifest.json` — includes scene start/end times, duration, narration text and voice asset names.
- `render_manifest.json` — prompts, asset names and run limitations.

## Important limitations

- Full-motion generation requires a compatible ComfyUI video-diffusion workflow and its local model/custom nodes. Use `--require-video` to ensure every scene is a true video output rather than an image fallback.
- Character consistency is encouraged by a structured prompt bible and optional reference-image upload/injection. The workflow must connect the reference image to a compatible IP-Adapter/reference-image/character-LoRA conditioning path; simply loading an image is not enough. Identity consistency remains model- and workflow-dependent and is not guaranteed.
- Output quality, speed, model memory requirements and permissible use depend on the model and custom nodes selected by the operator.
- This pipeline does not include music, sound effects, subtitles, lip-sync, speaker diarisation, emotion-controlled acting, or a commercial voice catalogue. Per-scene TTS timing is not phoneme-level lip-sync.
- No model weights, paid API keys, copyrighted characters, or third-party assets are bundled.

## Tests

```bash
python -m unittest discover -s tests -p 'test_render_agent.py' -v
python -m py_compile cartoonforge-agent/render_agent.py
```
