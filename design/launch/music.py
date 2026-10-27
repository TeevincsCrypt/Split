"""Original 30 s, 128 BPM track for the Split launch video (synthesized, no samples)."""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 128
BEAT = 60 / BPM            # 0.46875 s
BAR = 4 * BEAT             # 1.875 s
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)


def t_(d):
    return np.arange(int(SR * d)) / SR


def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    s = sig[: N - i] * gain
    L[i:i + len(s)] += s * np.sqrt((1 - pan) / 2) * 1.414
    R[i:i + len(s)] += s * np.sqrt((1 + pan) / 2) * 1.414


def lp(x, f, order=2):
    if np.isscalar(f):
        return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)
    # time-varying cutoff: filter in 128-sample blocks, carrying filter state
    from scipy.signal import sosfilt_zi
    out = np.empty_like(x)
    zi = None
    for s in range(0, len(x), 128):
        fc = float(np.clip(f[s], 30, SR / 2 - 500))
        sos = butter(order, fc, 'low', fs=SR, output='sos')
        if zi is None:
            zi = sosfilt_zi(sos) * 0
        out[s:s + 128], zi = sosfilt(sos, x[s:s + 128], zi=zi)
    return out


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def note(n):  # midi -> Hz
    return 440 * 2 ** ((n - 69) / 12)


def saw(f, d, detune=0.0):
    t = t_(d)
    out = np.zeros_like(t)
    for dt in (-detune, 0, detune) if detune else (0,):
        ph = (t * f * (1 + dt)) % 1.0
        out += 2 * ph - 1
    return out / (3 if detune else 1)


# ---- drums -------------------------------------------------------------
def kick():
    t = t_(0.42)
    f = 46 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 300) * 0.35
    return np.tanh((body + click) * 1.6)


def clap():
    t = t_(0.28)
    n = rng.standard_normal(len(t))
    env = np.zeros_like(t)
    for k, o in enumerate((0, 0.011, 0.022)):
        m = t >= o
        env[m] += np.exp(-(t[m] - o) * (90 if k < 2 else 18))
    return bp(n, 900, 4200) * env * 0.9


def hat(open_=False):
    d = 0.22 if open_ else 0.05
    t = t_(d)
    return hp(rng.standard_normal(len(t)), 7500) * np.exp(-t * (14 if open_ else 70))


def impact():
    t = t_(2.2)
    f = 38 + 60 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    crash = hp(rng.standard_normal(len(t)), 4000) * np.exp(-t * 2.6) * 0.45
    return np.tanh(boom * 1.4) + crash


def riser(d):
    t = t_(d)
    noise = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    seg = 2048
    for s in range(0, len(t), seg):
        frac = s / len(t)
        lo = 300 + 6000 * frac ** 2
        out[s:s + seg] = bp(noise[s:s + seg], lo, min(lo * 2.2, 19000))
    tone = np.sin(2 * np.pi * np.cumsum(220 + 880 * (t / d) ** 2) / SR) * 0.25
    return (out * 0.6 + tone) * (t / d) ** 2


def reverse_cymbal(d):
    return riser(d)[::-1][::-1] * 0.8


# ---- harmony -----------------------------------------------------------
# Am  F  C  G  (one chord per bar)
PROG = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]


def bass_note(midi, d):
    s = saw(note(midi - 12), d, 0.004) + 0.6 * np.sin(2 * np.pi * note(midi - 24) * t_(d))
    t = t_(d)
    return lp(s, 260 + 900 * np.exp(-t * 18)) * np.minimum(1, t * 300) * np.exp(-t * 2.5)


def pluck(midi, d=0.22, bright=1.0):
    t = t_(d)
    s = saw(note(midi), d, 0.006)
    return lp(s, 900 + 5200 * bright * np.exp(-t * 22)) * np.exp(-t * 11) * np.minimum(1, t * 800)


def pad(chord, d, cutoff=1600):
    t = t_(d)
    s = sum(saw(note(m), d, 0.008) for m in chord) / len(chord)
    env = np.minimum(1, t / 0.25) * np.minimum(1, (d - t) / 0.3)
    return lp(s, cutoff, 2) * env


# ---- arrangement -------------------------------------------------------
def bar_t(b):
    return b * BAR


kicks = []
add(impact(), 0.0, 0.9)
# Intro bars 0-1: filtered pad + building hats, sparse kick at bar 1
for b in range(2):
    root, ch = PROG[b % 4]
    add(pad(ch, BAR, 700 + 500 * b), bar_t(b), 0.5)
    for s in range(16):
        add(hat(), bar_t(b) + s * BEAT / 4, 0.05 + 0.1 * (s / 16), pan=0.3 if s % 2 else -0.3)
for k in range(4):
    kicks.append(bar_t(1) + k * BEAT)
# Tension bars 2-3: kick + offbeat bass, rising
for b in (2, 3):
    root, ch = PROG[b % 4]
    add(pad(ch, BAR, 1100), bar_t(b), 0.35)
    for k in range(4):
        kicks.append(bar_t(b) + k * BEAT)
        add(bass_note(root, BEAT / 2), bar_t(b) + k * BEAT + BEAT / 2, 0.7)
        add(hat(True), bar_t(b) + k * BEAT + BEAT / 2, 0.12, pan=0.2)
    for s in range(16):
        add(hat(), bar_t(b) + s * BEAT / 4, 0.09, pan=-0.25)
# snare roll + riser into the drop at bar 4 (7.5 s)
add(riser(BAR), bar_t(3), 0.55)
for i in range(16):
    add(clap(), bar_t(3) + BAR / 2 + i * BAR / 32, 0.15 + 0.5 * i / 16)
add(impact(), bar_t(4), 1.0)

# Main groove bars 4-12
for b in range(4, 13):
    root, ch = PROG[b % 4]
    add(pad(ch, BAR, 2400), bar_t(b), 0.28)
    for k in range(4):
        kicks.append(bar_t(b) + k * BEAT)
        add(hat(True), bar_t(b) + k * BEAT + BEAT / 2, 0.16, pan=0.25)
        if k in (1, 3):
            add(clap(), bar_t(b) + k * BEAT, 0.6)
        for e in range(2):
            add(bass_note(root + (12 if (k == 3 and e == 1) else 0), BEAT / 2),
                bar_t(b) + k * BEAT + e * BEAT / 2, 0.75)
    for s in range(16):
        add(hat(), bar_t(b) + s * BEAT / 4, 0.07 + (0.05 if s % 4 == 2 else 0), pan=-0.3)
    # 16th arp over chord tones, two octaves
    arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24, ch[2] + 12, ch[0] + 24, ch[1] + 12, ch[2] + 24]
    for s in range(16):
        m = arp[s % 8]
        st = bar_t(b) + s * BEAT / 4
        add(pluck(m, 0.2, 0.6 + 0.4 * ((b - 4) / 8)), st, 0.2, pan=-0.35)
        add(pluck(m, 0.2, 0.5), st + 3 * BEAT / 4, 0.09, pan=0.45)  # dotted-8th echo

# Breakdown into the end card: riser over bar 13, hit at bar 14 (26.25 s)
root, ch = PROG[13 % 4]
add(pad(ch, BAR, 3000), bar_t(13), 0.35)
add(riser(BAR), bar_t(13), 0.6)
for k in range(4):
    kicks.append(bar_t(13) + k * BEAT * (1 if k < 2 else 1))
add(impact(), bar_t(14), 1.0)
# End card: big Am chord stab + pad tail
add(pad([57, 60, 64, 69, 72], 2 * BAR, 2600), bar_t(14), 0.55)
add(bass_note(57, 1.5), bar_t(14), 0.9)

# sidechain pump on everything except kicks: rebuild by ducking around kick times
duck = np.ones(N)
for k in kicks:
    i = int(k * SR)
    seg = np.arange(int(0.22 * SR))
    env = 1 - 0.55 * np.exp(-seg / (0.06 * SR))
    j = min(N, i + len(seg))
    duck[i:j] = np.minimum(duck[i:j], env[: j - i])
kick_track = np.zeros(N)
for k in kicks:
    i = int(k * SR)
    s = kick()[: N - i] * 0.95
    kick_track[i:i + len(s)] += s
Lm = L * duck + kick_track
Rm = R * duck + kick_track

# master: gentle low-cut, fade out, soft clip, normalise
fade = np.ones(N)
fo = int(1.6 * SR)
fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
mix = np.stack([hp(Lm, 28), hp(Rm, 28)], axis=1) * fade[:, None]
mix = np.tanh(mix * 1.15)
mix /= np.max(np.abs(mix)) / 0.95
wavfile.write(__import__('sys').argv[1], SR, (mix * 32767).astype(np.int16))
print('ok', mix.shape)
