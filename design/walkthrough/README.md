# Walkthrough video

`split-walkthrough.mp4` (gitignored): 4:37, 1920×1080. It opens with the Arc Studio project (`record-studio.cjs`), then the owner's mainnet screen recording, edited,
with voiceover, captions and background music.

Rebuild: `python3 build.py <recording.mp4> <kokoro-model-dir> <work-dir> <out.mp4>`
- `cards.html` + `render-cards.cjs`: canvas, window frame, title and end cards (`node render-cards.cjs <work-dir>`, run first).
- `build.py`: the cut list (source ranges, speed limits, narration), Kokoro TTS voice (`af_heart`), ASS captions, final mix at −14 LUFS.
- `music3.py`: original synthesized music bed.

All footage is the owner's own recording. The voice and music are generated; nothing third-party is used.
