"""Original calm 100 BPM bed for the Split walkthrough (synthesized). Usage: music3.py out.wav seconds"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
BEAT = 0.6
BAR = 2.4
DUR = float(sys.argv[2])
N = int(SR * DUR)
rng = np.random.default_rng(3)
L = np.zeros(N)
R = np.zeros(N)
DRUMS = np.zeros(N)


def t_(d):
    return np.arange(int(SR * d)) / SR


def lp(x, f):
    return sosfilt(butter(2, f, 'low', fs=SR, output='sos'), x)


def hp(x, f):
    return sosfilt(butter(2, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def add(sig, start, gain=1.0, pan=0.0, bus=None):
    i = int(start * SR)
    if i >= N or start < 0:
        return
    s = sig[: N - i] * gain
    if bus is not None:
        bus[i:i + len(s)] += s
        return
    L[i:i + len(s)] += s * np.sqrt((1 - pan) / 2) * 1.414
    R[i:i + len(s)] += s * np.sqrt((1 + pan) / 2) * 1.414


def epiano(m, d):
    t = t_(d)
    f = hz(m)
    mod = np.sin(2 * np.pi * f * 2 * t) * 1.2 * np.exp(-t * 6)
    tone = np.sin(2 * np.pi * f * t + mod) + 0.25 * np.sin(2 * np.pi * f * 3 * t) * np.exp(-t * 5)
    env = np.exp(-t * 1.6) * np.minimum(1, t * 400) * np.minimum(1, (d - t) / 0.08)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * t)
    return tone * env * trem


def pad(chord, d, cut=1800):
    t = t_(d)
    s = np.zeros_like(t)
    for m in chord:
        for dt in (-0.006, 0.0, 0.006):
            ph = (t * hz(m) * (1 + dt)) % 1
            s += 2 * ph - 1
    s /= len(chord) * 3
    env = np.minimum(1, t / 0.8) * np.minimum(1, (d - t) / 0.8)
    return lp(s, cut) * env


def sub(m, d):
    t = t_(d)
    return np.sin(2 * np.pi * hz(m - 24) * t) * np.minimum(1, t * 200) * np.exp(-t * 1.2) * np.minimum(1, (d - t) / 0.05)


def kick():
    t = t_(0.35)
    f = 50 + 70 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)


def shaker():
    t = t_(0.08)
    return hp(rng.standard_normal(len(t)), 6000) * np.exp(-t * 45) * np.minimum(1, t * 600)


def rim():
    t = t_(0.12)
    return bp(rng.standard_normal(len(t)), 1500, 5000) * np.exp(-t * 60) + np.sin(2 * np.pi * 820 * t) * np.exp(-t * 50) * 0.4


def swell(d):
    t = t_(d)
    n = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    for s in range(0, len(t), 2048):
        fr = s / len(t)
        lo = 400 + 5000 * fr ** 2
        out[s:s + 2048] = bp(n[s:s + 2048], lo, min(lo * 2, 18000))
    return out * (t / d) ** 2.5


def chime(m):
    t = t_(2.5)
    return (np.sin(2 * np.pi * hz(m) * t) + 0.3 * np.sin(2 * np.pi * hz(m) * 4.01 * t) * np.exp(-t * 4)) * np.exp(-t * 1.8)


# Fmaj9 - Am7 - Dm9 - Bbmaj9, one chord per bar
PROG = [(53, [65, 69, 72, 76, 79]), (57, [64, 67, 69, 72, 76]), (50, [62, 65, 69, 72, 76]), (46, [62, 65, 69, 70, 74])]
bars = int(np.ceil(DUR / BAR))
def drums_on(b):
    # intro 2 bars, a 4-bar breakdown every 20 bars, and a drumless outro
    return 2 <= b < bars - 3 and (b % 20) < 16
kick_times = []
for b in range(bars):
    st = b * BAR
    root, ch = PROG[b % 4]
    add(pad([n - 12 for n in ch[:4]], BAR + 0.6, 1300 if not drums_on(b) else 1900), st, 0.30)
    for n_ in ch[:4]:
        add(epiano(n_, 1.4), st, 0.09, pan=rng.uniform(-0.4, 0.4))
    for k, n_ in enumerate([ch[2], ch[3], ch[4], ch[1]]):
        add(epiano(n_ + 12 if k == 2 else n_, 0.7), st + BEAT * (k + 0.5), 0.055, pan=0.5 if k % 2 else -0.5)
    if b >= 1:
        add(sub(root, BAR), st, 0.5)
    if drums_on(b):
        for k in range(4):
            add(kick(), st + k * BEAT, 0.55, bus=DRUMS)
            kick_times.append(st + k * BEAT)
            add(shaker(), st + k * BEAT + BEAT / 2, 0.14, pan=0.3)
            add(shaker(), st + k * BEAT + BEAT * 0.75, 0.06, pan=-0.3)
            if k in (1, 3):
                add(rim(), st + k * BEAT, 0.16, pan=-0.1)
add(chime(81), max(0, DUR - 6.5), 0.2, pan=-0.2)
add(chime(88), max(0, DUR - 6.2), 0.12, pan=0.3)

duck = np.ones(N)
for kt in kick_times:
    i = int(kt * SR)
    seg = np.arange(int(0.3 * SR))
    env = 1 - 0.25 * np.exp(-seg / (0.09 * SR))
    j = min(N, i + len(seg))
    if i < N:
        duck[i:j] = np.minimum(duck[i:j], env[: j - i])
mixL = L * duck + DRUMS
mixR = R * duck + DRUMS
fade = np.ones(N)
fi = int(1.5 * SR)
fade[:fi] = np.linspace(0, 1, fi)
fo = int(4.0 * SR)
fade[-fo:] = np.linspace(1, 0, fo) ** 1.6
mix = np.stack([hp(mixL, 30), hp(mixR, 30)], axis=1) * fade[:, None]
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) / 0.9
wavfile.write(sys.argv[1], SR, (mix * 32767).astype(np.int16))
print('ok')
