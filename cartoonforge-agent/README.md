# CartoonForge Local Render Agent

CartoonForge's browser MVP exports a storyboard JSON file. This companion agent turns that export into scene assets and an MP4 using a **local ComfyUI instance** and FFmpeg. It supports true video clips from compatible ComfyUI video workflows (preferred) and image-keyframe fallback. Optional narration uses a local Piper voice model.

## One-click local video studio (Windows and macOS/Linux)

The new local studio joins the complete pipeline behind one **Generate full video** button. After the one-time local setup, paste a script, define the character and click once. The studio then:
1. Generates a scene-by-scene storyboard with your local Ollama model.
2. Submits each scene to your saved ComfyUI API workflow.
3. Produces full-motion clips when the workflow is video-capable (or rejects still-image fallback when configured to require video).
4. Adds optional local Piper narration.
5. Assembles the final MP4 with FFmpeg and provides a download link.

### Start the studio

- **Windows:** double-click `Start-CartoonForge.bat`.
- **macOS/Linux:** run `./start-cartoonforge.sh` from this folder (Python 3.10+ required).

Open `http://127.0.0.1:8765` if it does not open automatically. The server binds to loopback only and stores its configuration and outputs in `~/.cartoonforge/` (on Windows, your user home folder).

### One-time setup

1. Install and start Ollama; pull a model that fits your hardware (for example, a small instruct model). Enter its exact installed name in the studio.
2. Install and start ComfyUI with a compatible video-diffusion workflow and all required custom nodes/model weights. A standard image workflow is not a full-motion video generator.
3. Install FFmpeg and ensure `ffmpeg` is available on PATH.
4. In ComfyUI, save the workflow in **API format**. Upload that JSON once in the local studio and enter the positive text prompt node ID. Add optional negative-prompt and sampler node IDs if the workflow uses them.
5. Save setup. The studio remembers the workflow and settings on this computer.

After setup, the per-video workflow is one click. Model downloads and initial engine installation are not instantaneous and are not bundled; large video models can require substantial GPU memory and disk space. For narration, optionally add a local Piper ONNX voice model path. The default mode requires true video output so it will stop rather than silently create a slideshow if the workflow only returns still images.

**Privacy:** scripts are sent only to the Ollama server on loopback. Scene prompts and render jobs are sent only to the local ComfyUI instance. The studio does not use a hosted generation API. Do not expose either local service to the public internet.

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

## Generate a storyboard directly in the browser

The hosted CartoonForge studio now includes a **Local AI Script Studio**. It calls the Ollama server on your own computer from the browser, validates the returned scene JSON, and loads the scenes into the existing editor. The full script is not sent to a hosted inference API by this feature.

1. Install and start Ollama, then pull a model that supports structured JSON output and fits your computer's memory. Confirm it appears in `ollama list`.
2. Allow only the GitHub Pages site origin in Ollama's CORS allow-list. The studio origin is `https://kevilshah22-max.github.io`; set `OLLAMA_ORIGINS` to that exact origin (not a wildcard), then restart Ollama.
   - **Windows:** open *Edit environment variables for your account*, create/update user variable `OLLAMA_ORIGINS` with value `https://kevilshah22-max.github.io`, save, quit Ollama from the system tray and start it again.
   - **macOS:** run `launchctl setenv OLLAMA_ORIGINS "https://kevilshah22-max.github.io"`, then restart the Ollama app.
   - **Linux systemd:** run `sudo systemctl edit ollama.service`, add `Environment="OLLAMA_ORIGINS=https://kevilshah22-max.github.io"` under `[Service]`, then run `sudo systemctl daemon-reload && sudo systemctl restart ollama`.
3. Keep Ollama bound to its default loopback address. Do not expose port 11434 to the public network or use a wildcard CORS origin.
4. Open the [CartoonForge studio](https://kevilshah22-max.github.io/apps/cartoonforge/), paste a script, enter the exact installed model name and click **Generate with local AI**. The default endpoint is `http://127.0.0.1:11434`.
5. Inspect the scenes, character identity, dialogue and durations. Edit any incorrect scene, then export the project JSON and use the render agent below.

If the browser reports a network/CORS error, verify Ollama is running, that the origin value is saved, and that Ollama was fully restarted. The studio does not download models or silently fall back to a hosted provider.

## Local AI script-to-storyboard agent

The companion `script_agent.py` converts a text script into the same project JSON format consumed by the render agent. It uses a model already installed in **local Ollama**; the script is sent to your configured local Ollama server, not a hosted paid API.

1. Install Ollama and download a model that fits your computer's memory.
2. Start the local Ollama service and verify the model is available.
3. Save your character bible as JSON, for example:

```json
{
  "name": "Pip",
  "species": "fox",
  "color": "#ff9d55",
  "face": "heart-shaped",
  "eyes": "large green eyes",
  "hair_or_fur": "soft orange fur",
  "proportions": "small round body",
  "outfit": "blue scarf",
  "markings": "white tail tip",
  "accessories": "brass star pendant"
}
```

```bash
python cartoonforge-agent/script_agent.py \
  --script ./story.txt \
  --character-json ./character.json \
  --model YOUR_LOCAL_OLLAMA_MODEL \
  --title "The Moon Garden" \
  --genre "Whimsical adventure" \
  --max-scenes 12 \
  --output ./cartoonforge-project.json
```

4. Review the generated scene visuals, beats, dialogue and durations against the original script. The agent cannot guarantee perfect story fidelity.
5. Pass the generated JSON to `render_agent.py` using the ComfyUI and FFmpeg instructions below.

The output includes a generation record identifying the local model and source-script character count. The agent validates the returned JSON and rejects missing visuals, invalid durations or excessive scene counts. Local model quality and hardware determine the result; no model weights are bundled.

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
