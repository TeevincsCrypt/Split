# Launch videos

| File | Description |
|---|---|
| `split-launch-voiceover.mp4` (gitignored) | 30 s, 1920×1080, light scenes, voiceover + captions (current) |
| `split-launch.mp4` (gitignored) | 30 s, 1920×1080, high-energy dark cut, music only (v1) |

## Rebuild the voiceover version
1. Voice: `python3 voiceover.py <dir-with-kokoro-model> af_heart 1.0` (Kokoro TTS, `af_heart` voice; model files from the kokoro-onnx GitHub releases).
2. Music: `python3 music2.py bed.wav` (original synthesized track, 100 BPM).
3. Mix: place the clips at the cue times in `launch2.html` (`SUBS`), duck the bed under the voice (ffmpeg `sidechaincompress`), loudness −14 LUFS.
4. Frames: `node render2.js <dir>` renders `launch2.html` frame by frame; encode with ffmpeg (H.264 CRF 16, AAC 256k, `+faststart`).

All visuals, music and the voice are original or generated; no third-party footage or music is used.
