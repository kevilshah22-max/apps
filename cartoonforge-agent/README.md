# CartoonForge Local Render Agent

CartoonForge's browser MVP exports a storyboard JSON file. This companion agent turns that export into scene assets and an MP4 using a **local ComfyUI instance** and FFmpeg. It supports true video clips from compatible ComfyUI video workflows (preferred) and image-keyframe fallback. Optional narration uses a local Piper voice model.

## What it does

1. Reads the CartoonForge project JSON export.
2. Builds a reusable character bible into every scene prompt to improve character consistency.
3. Injects each scene prompt and a deterministic seed into a ComfyUI API-format workflow.
4. Submits each shot to ComfyUI and downloads a generated video clip when the workflow exposes a video output; otherwise it downloads an image keyframe.
5. Normalises true video clips to 1920×1080/24 fps, or creates a subtle camera-motion clip from an image keyframe.
6. Joins the scene clips into `cartoonforge-final.mp4`.
7. Optionally generates a narration track with Piper and muxes it into the video.
8. Writes a render manifest containing prompts, assets and limitations.

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
5. Identify the node ID for the positive CLIP text encoder. Optionally identify the negative text encoder and sampler node.
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

Node IDs above are examples only: use the IDs from your own workflow. Omit `--negative-node` or `--seed-node` if your workflow does not have those nodes. Use `--require-video` with a ComfyUI video-diffusion workflow to reject image-only outputs; without it, the agent accepts true video clips and falls back to camera-motion keyframes. You can change the ComfyUI address with `--comfyui`, shot duration with `--duration`, and render wait limit with `--timeout`.

Optional local narration:

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
- `voice.wav` — optional Piper narration.
- `render_manifest.json` — prompts, asset names and run limitations.

## Important limitations

- Full-motion generation requires a compatible ComfyUI video-diffusion workflow and its local model/custom nodes. Use `--require-video` to ensure every scene is a true video output rather than an image fallback.
- Character consistency is encouraged by a shared prompt bible and fixed seed progression, but is not guaranteed. Stronger consistency requires reference-image/IP-Adapter or character-LoRA support in the chosen ComfyUI workflow.
- Output quality, speed, model memory requirements and permissible use depend on the model and custom nodes selected by the operator.
- This pipeline does not include music, sound effects, subtitles, lip-sync, multi-character dialogue timing, or a commercial voice catalogue.
- No model weights, paid API keys, copyrighted characters, or third-party assets are bundled.

## Tests

```bash
python -m unittest discover -s tests -p 'test_render_agent.py' -v
python -m py_compile cartoonforge-agent/render_agent.py
```
