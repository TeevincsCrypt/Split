"""Edit the raw screen recording into the Split walkthrough (voiceover, captions, music).

Usage: python3 build.py <recording.mp4> <kokoro-model-dir> <work-dir> <out.mp4>

Each segment is a range of the recording plus the sentences narrated over it. A segment's
length is set by its narration; the footage is sped up to fit (never beyond `maxspeed`), and
the last frame is held if the narration is longer than the footage.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SRC, KOKORO, WORK, OUT = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4]
HERE = Path(__file__).resolve().parent
WORK.mkdir(parents=True, exist_ok=True)
FPS = 30
LEAD, GAP, TAIL = 0.45, 0.35, 0.6  # seconds of air before, between and after sentences

# (caption, spoken) — spoken differs only where TTS needs help with pronunciation.
def s(caption, spoken=None):
    return (caption, spoken or caption.replace('USDC', 'U S D C'))

SEGMENTS = [
    dict(card='title', label='', dur=0, lines=[
        s('This is Split.'),
        s('One transaction that pays your whole team in USDC.'),
        s('Built in Arc Studio, and live on Arc mainnet.')]),
    dict(src=(29, 60), maxspeed=2.0, label='Connect', lines=[
        s('Split is live at paywsplit.vercel.app.', 'Split is live at pay w split dot vercel dot app.'),
        s("I'll connect my Rabby wallet on Arc mainnet.")]),
    dict(src=(62, 73), maxspeed=1.5, label='Dashboard', lines=[
        s("The dashboard reads straight from the chain: my USDC balance, the network, and every split I've sent.")]),
    dict(src=(73, 175), maxspeed=3.5, label='Create a split', lines=[
        s('To pay a team, I create a split.'),
        s("I give it a name and a total, then add each recipient's wallet and their share."),
        s('Shares are set by percentage, or split evenly with one click.'),
        s('The math uses exact integers, so every unit of USDC is accounted for.')]),
    dict(src=(175, 185), maxspeed=2.0, label='Save as team', lines=[
        s('I can save this group as a team, to reuse next payday.')]),
    dict(src=(185, 190), maxspeed=1.0, label='Review', lines=[
        s('Before anything is signed, I review every address and exact amount.')]),
    dict(src=(190, 227), maxspeed=2.0, label='Approve and distribute', lines=[
        s('Then I approve exactly the amount being paid. Never an unlimited allowance.'),
        s('And distribute. One transaction pulls the USDC and pays everyone at once.'),
        s('Everyone gets paid, or nobody does.')]),
    dict(src=(227, 240), maxspeed=1.3, label='Receipt', lines=[
        s('The receipt shows the block, the time, and what each person received.')]),
    dict(src=(263, 276), maxspeed=1.3, label='Arc explorer', lines=[
        s("It's verifiable on the Arc explorer: one transaction, three USDC transfers.")]),
    dict(src=(280, 330), maxspeed=2.2, label='Schedule a payment', lines=[
        s('Split can also schedule payments, like salaries.'),
        s('I load the saved team, pick a date and time, and choose one-off or repeating.')]),
    dict(src=(330, 370), maxspeed=2.2, label='Lock the deposit', lines=[
        s('The deposit is held by the ScheduledSplit contract, never by us.', 'The deposit is held by the Scheduled Split contract, never by us.'),
        s('I approve it, and create the schedule.')]),
    dict(src=(372, 382), maxspeed=1.3, label='Schedule page', lines=[
        s('Every schedule gets a public page, with its recipients and payment timeline.')]),
    dict(src=(382, 395), maxspeed=1.3, label='Activity', lines=[
        s('Activity lists every payout, instant and scheduled, read directly from onchain events.',
          'Activity lists every payout, instant and scheduled, read directly from on-chain events.')]),
    dict(src=(395, 405), maxspeed=1.3, label='Recipients', lines=[
        s('Saved contacts and teams stay in my browser, and can be exported.')]),
    dict(src=(405, 420), maxspeed=1.6, label='Schedules', lines=[
        s("The Schedules page shows what's upcoming, and what's already been paid.")]),
    dict(src=(420, 446), maxspeed=2.6, label='How it works · Deploy', lines=[
        s('How it works explains the approval model, rounding and limits.'),
        s('The Deploy page is how I deployed both contracts to Arc mainnet, from my own wallet.')]),
    dict(src=(471, 486), maxspeed=1.3, label='Mainnet contract', lines=[
        s("Here's the SplitDistributor contract on the Arc mainnet explorer.",
          "Here's the Split Distributor contract on the Arc mainnet explorer.")]),
    dict(src=(486, 563), maxspeed=10.0, label='Waiting for the due time', lines=[
        s("Now the scheduled payment. I don't press anything."),
        s("When the due time passes, Split's keeper bot calls execute on its own.")]),
    dict(src=(568, 582), maxspeed=1.3, label='Paid automatically', lines=[
        s('And there it is. Completed, and paid automatically, on schedule.')]),
    dict(src=(588, 603), maxspeed=1.3, label='Onchain proof', lines=[
        s('On the explorer: executed by the keeper bot, with USDC sent to every recipient.')]),
    dict(card='end', label='', dur=0, lines=[
        s('Split. Built in Arc Studio, live on Arc mainnet.'),
        s('Pay everyone, in one move.')]),
]


def run(*cmd):
    subprocess.run(cmd, check=True)


# 1. Voiceover, one clip per sentence.
from kokoro_onnx import Kokoro  # noqa: E402
tts = Kokoro(str(KOKORO / 'kokoro-v1.0.onnx'), str(KOKORO / 'voices-v1.0.bin'))
SR = 24000
for i, seg in enumerate(SEGMENTS):
    seg['clips'] = []
    for j, (cap, spoken) in enumerate(seg['lines']):
        a, SR = tts.create(spoken, voice='af_heart', speed=1.0, lang='en-us')
        idx = np.where(np.abs(a) > 0.01)[0]
        a = a[max(0, idx[0] - 200): idx[-1] + 800]
        p = WORK / f'vo_{i:02d}_{j}.wav'
        sf.write(p, a, SR)
        seg['clips'].append((cap, p, len(a) / SR))

# 2. Timeline.
t = 0.0
for seg in SEGMENTS:
    vo = sum(c[2] for c in seg['clips']) + GAP * (len(seg['clips']) - 1)
    need = LEAD + vo + TAIL + (1.2 if 'card' in seg else 0)
    if 'src' in seg:
        a, b = seg['src']
        natural = (b - a) / seg['maxspeed']
        seg['dur'] = round(max(need, natural), 2)
        seg['speed'] = max(1.0, (b - a) / seg['dur'])
    else:
        seg['dur'] = round(need, 2)
    seg['start'] = t
    cur = t + LEAD
    seg['cues'] = []
    for cap, p, d in seg['clips']:
        seg['cues'].append((cap, p, cur, d))
        cur += d + GAP
    t += seg['dur']
TOTAL = t
print(f'total {TOTAL:.1f}s')
assert TOTAL <= 300, 'over 5 minutes'

# 3. Video segments (1920x1080, 30 fps).
parts = []
for i, seg in enumerate(SEGMENTS):
    out = WORK / f'seg_{i:02d}.mp4'
    if 'card' in seg:
        d = seg['dur']
        run('ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', str(FPS), '-t', f'{d}', '-i', str(WORK / f"{seg['card']}.png"),
            '-vf', f'fade=in:st=0:d=0.5:color=0xEFE9E3,fade=out:st={d - 0.6}:d=0.6:color=0xEFE9E3,format=yuv420p',
            '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-r', str(FPS), str(out))
    else:
        a, b = seg['src']
        sp, d = seg['speed'], seg['dur']
        hold = max(0.0, d - (b - a) / sp) + 0.2
        vf = (f'[0:v]crop=1280:582:0:40,setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},scale=1760:800:flags=lanczos,'
              f'tpad=stop_mode=clone:stop_duration={hold:.2f},trim=duration={d}[v];'
              f'[1][v]overlay=80:30:shortest=1[b];[b][2]overlay=0:0:shortest=1,format=yuv420p')
        run('ffmpeg', '-v', 'error', '-y', '-ss', f'{a}', '-to', f'{b}', '-i', SRC,
            '-loop', '1', '-framerate', str(FPS), '-i', str(WORK / 'bg.png'),
            '-loop', '1', '-framerate', str(FPS), '-i', str(WORK / 'frame.png'),
            '-filter_complex', vf, '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-r', str(FPS), '-t', f'{d}', str(out))
    parts.append(out)
(WORK / 'parts.txt').write_text(''.join(f"file '{p}'\n" for p in parts))
run('ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(WORK / 'parts.txt'), '-c', 'copy', str(WORK / 'video.mp4'))


# 4. Captions (ASS): a chapter label and the narration, in the strip under the window.
def ts(x):
    h, r = divmod(x, 3600)
    m, s_ = divmod(r, 60)
    return f'{int(h)}:{int(m):02d}:{s_:05.2f}'


ass = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', 'WrapStyle: 0', '',
       '[V4+ Styles]',
       'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, '
       'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
       # colours are &HAABBGGRR
       'Style: Cap,Inter,46,&H001B1324,&H001B1324,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,8,170,170,0,1',
       'Style: Label,Inter,25,&H00321564,&H00321564,&H00000000,&H00000000,-1,0,0,0,100,100,5,0,1,0,0,8,0,0,0,1',
       '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
for seg in SEGMENTS:
    st, en = seg['start'], seg['start'] + seg['dur']
    if 'card' not in seg:
        label = seg['label'].upper() + (f"  ·  {seg['speed']:.0f}× SPEED" if seg['speed'] >= 2.5 else '')
        ass.append(f"Dialogue: 0,{ts(st + 0.15)},{ts(en - 0.05)},Label,,0,0,0,,{{\\pos(960,862)\\fad(200,150)}}{label}")
    for k, (cap, p, c0, d) in enumerate(seg['cues']):
        nxt = seg['cues'][k + 1][2] if k + 1 < len(seg['cues']) else en - 0.1
        y = 905 if 'card' not in seg else 960
        ass.append(f"Dialogue: 0,{ts(c0 - 0.1)},{ts(max(c0 + d + 0.2, nxt - 0.05))},Cap,,0,0,0,,{{\\pos(960,{y})\\fad(120,120)}}{cap}")
(WORK / 'captions.ass').write_text('\n'.join(ass) + '\n')

# 5. Audio: voice track, music bed ducked under it, then loudness to -14 LUFS.
voice = np.zeros(int((TOTAL + 1) * SR), dtype=np.float32)
for seg in SEGMENTS:
    for cap, p, c0, d in seg['cues']:
        a, _ = sf.read(p, dtype='float32')
        i = int(c0 * SR)
        voice[i:i + len(a)] += a
sf.write(WORK / 'voice.wav', voice, SR)
run('python3', str(HERE / 'music3.py'), str(WORK / 'music.wav'), f'{TOTAL + 0.5:.2f}')
run('ffmpeg', '-v', 'error', '-y', '-i', str(WORK / 'voice.wav'), '-i', str(WORK / 'music.wav'), '-filter_complex',
    '[0:a]aresample=48000,pan=stereo|c0=c0|c1=c0,asplit=2[vo][sc];'
    '[1:a]aresample=48000,volume=0.32[mu];'
    '[mu][sc]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=450[duck];'
    '[vo][duck]amix=inputs=2:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.5:LRA=11[a]',
    '-map', '[a]', '-ar', '48000', str(WORK / 'mix.wav'))

# 6. Final: burn captions, mux audio.
run('ffmpeg', '-v', 'error', '-y', '-i', str(WORK / 'video.mp4'), '-i', str(WORK / 'mix.wav'),
    '-vf', f"ass={WORK / 'captions.ass'}:fontsdir=/usr/share/fonts/opentype/inter",
    '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', OUT)
json.dump([{k: v for k, v in seg.items() if k in ('label', 'start', 'dur', 'speed', 'src')} for seg in SEGMENTS],
          open(WORK / 'timeline.json', 'w'), indent=1)
print('done', OUT)
