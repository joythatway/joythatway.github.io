#!/usr/bin/env python3
"""合成 JOYROOM 的房间背景音乐 —— 一段 25 秒、可无缝循环的 lo-fi / chiptune。

输出：
    direction-02-room/assets/room-theme.wav
    direction-02-room/assets/room-theme.mp3

音乐设定：
    · 76 BPM，A 小调，8 小节 = 25.26 秒
    · 和弦：Am9 → Fmaj7 → Cmaj7 → G6（每个 2 小节）
    · 乐器：暖 pad + 八音盒琶音 + 低频贝斯 + 很轻的鼓刷
    · 质感：黑胶底噪、磁带高频衰减、轻微立体声延迟
    · 循环：所有音符 / 延迟 / 尾音都按循环长度取模，首尾无缝

这个脚本只依赖 numpy + scipy + ffmpeg，运行：
    python3 tools/synth-room-theme.py
"""

from pathlib import Path
import subprocess
import wave

import numpy as np
from scipy.signal import butter, sosfiltfilt

SR = 44100
BPM = 76
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BARS = 8
LOOP_SECONDS = BARS * BAR
N = int(round(LOOP_SECONDS * SR))
rng = np.random.default_rng(20261117)

left = np.zeros(N, dtype=np.float64)
right = np.zeros(N, dtype=np.float64)


def midi_hz(m):
    return 440.0 * (2.0 ** ((m - 69) / 12.0))


def add(signal, start_seconds, gain=1.0, pan=0.0):
    """把一段信号按循环取模叠加进立体声总线。pan: -1 左 / 0 中 / +1 右。"""
    n = len(signal)
    i0 = int(round(start_seconds * SR))
    idx = (np.arange(n) + i0) % N
    # 等功率声像
    theta = (np.clip(pan, -1.0, 1.0) + 1.0) * np.pi / 4.0
    gl = np.cos(theta) * gain
    gr = np.sin(theta) * gain
    np.add.at(left, idx, signal * gl)
    np.add.at(right, idx, signal * gr)


def adsr(n, attack, decay, sustain=0.7, release=0.0):
    """简化 ADSR（秒）。"""
    t = np.arange(n) / SR
    a = int(attack * SR)
    d = int(decay * SR)
    env = np.ones(n)
    if a > 0:
        env[:a] = np.linspace(0, 1, a)
    if d > 0:
        d = min(d, n - a)
        env[a:a + d] = np.linspace(1, sustain, d)
    env[a + d:] = sustain
    r = int(release * SR)
    if r > 0 and r < n:
        env[-r:] *= np.linspace(1, 0, r) ** 1.6
    return env


def pluck_env(n, attack=0.004, decay=0.9):
    t = np.arange(n) / SR
    return (1 - np.exp(-t / max(attack, 1e-4))) * np.exp(-t / decay)


def tri(freq, t, phase=0.0):
    return (2.0 / np.pi) * np.arcsin(np.sin(2 * np.pi * freq * t + phase))


def soft_tone(t, freq, kind="tri"):
    if kind == "tri":
        return 0.7 * tri(freq, t) + 0.3 * np.sin(2 * np.pi * freq * t)
    if kind == "pad":
        return (
            0.52 * np.sin(2 * np.pi * freq * t)
            + 0.24 * np.sin(2 * np.pi * freq * 2.0 * t + 0.7)
            + 0.13 * np.sin(2 * np.pi * freq * 3.0 * t + 1.9)
            + 0.08 * np.sin(2 * np.pi * freq * 4.0 * t + 0.2)
        )
    if kind == "bass":
        return 0.72 * np.sin(2 * np.pi * freq * t) + 0.28 * tri(freq, t)
    return np.sin(2 * np.pi * freq * t)


# ---------------------------------------------------------------------------
# 和弦 / 编曲
# ---------------------------------------------------------------------------
# midi 音高：Am9 / Fmaj7 / Cmaj7 / G6
CHORDS = [
    {"name": "Am9", "pad": [57, 60, 64, 67, 71], "arp": [57, 64, 67, 72], "bass": 45},
    {"name": "Fmaj7", "pad": [53, 57, 60, 64], "arp": [53, 60, 64, 69], "bass": 41},
    {"name": "Cmaj7", "pad": [48, 55, 59, 64], "arp": [48, 55, 64, 67], "bass": 36},
    {"name": "G6", "pad": [55, 59, 62, 64], "arp": [55, 62, 64, 67], "bass": 43},
]
CHORD_BARS = 2

# 1. 暖 pad：每个和弦 2 小节，慢起音，尾音环绕
for ci, chord in enumerate(CHORDS):
    start = ci * CHORD_BARS * BAR
    dur = CHORD_BARS * BAR + 0.55
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = adsr(n, attack=0.9, decay=1.6, sustain=0.62, release=1.4)
    for j, m in enumerate(chord["pad"]):
        freq = midi_hz(m)
        detune = 1.0 + (j - 2) * 0.0009
        sig = soft_tone(t, freq * detune, "pad") * env
        # 轻微左右铺开
        pan = np.linspace(-0.55, 0.55, len(chord["pad"]))[j]
        add(sig, start, gain=0.052, pan=pan)

# 2. 八音盒琶音：每小节 8 个八分音符，一个很轻的旋律骨架
ARP_PATTERN = [0, 1, 2, 3, 2, 1, 2, 3]
for ci, chord in enumerate(CHORDS):
    for bar in range(CHORD_BARS):
        bar_start = ci * CHORD_BARS * BAR + bar * BAR
        for step in range(8):
            if bar == 1 and step in (6, 7):
                continue  # 留一点呼吸
            note = chord["arp"][ARP_PATTERN[step]] + 12
            start = bar_start + step * (BEAT / 2)
            dur = BEAT * 0.95
            n = int(dur * SR)
            t = np.arange(n) / SR
            env = pluck_env(n, attack=0.005, decay=0.42)
            sig = soft_tone(t, midi_hz(note), "tri") * env
            add(sig, start, gain=0.036, pan=0.2 if step % 2 else -0.2)
            # 一个很轻的八分延迟
            if step in (0, 3, 5):
                add(sig * 0.35, start + BEAT * 0.75, gain=0.02, pan=-0.35)

# 3. 主旋律：A 小调五声音阶，稀疏、留白
MELODY = [
    (0 * BAR + 2 * BEAT, 76, 0.62),
    (0 * BAR + 3.25 * BEAT, 74, 0.38),
    (1 * BAR + 1.5 * BEAT, 72, 0.7),
    (1 * BAR + 3.5 * BEAT, 69, 0.55),
    (2 * BAR + 2 * BEAT, 72, 0.5),
    (2 * BAR + 3.5 * BEAT, 74, 0.42),
    (3 * BAR + 2 * BEAT, 79, 0.85),
    (4 * BAR + 1.5 * BEAT, 76, 0.55),
    (4 * BAR + 3 * BEAT, 74, 0.45),
    (5 * BAR + 2.5 * BEAT, 72, 0.55),
    (5 * BAR + 4 * BEAT, 69, 0.42),
    (6 * BAR + 2 * BEAT, 76, 0.5),
    (6 * BAR + 3.5 * BEAT, 72, 0.55),
    (7 * BAR + 1.5 * BEAT, 69, 1.1),
]
for start, m, dur in MELODY:
    n = int(dur * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.003 * np.sin(2 * np.pi * 4.6 * t)
    env = pluck_env(n, attack=0.02, decay=0.95)
    sig = soft_tone(t, midi_hz(m) * vib, "tri") * env
    add(sig, start, gain=0.075, pan=0.12)
    # 立体声延迟
    add(sig * 0.33, start + BEAT * 0.66, gain=0.042, pan=-0.45)
    add(sig * 0.16, start + BEAT * 1.32, gain=0.028, pan=0.55)

# 4. 贝斯：每小节根音 + 第五音，短促
for ci, chord in enumerate(CHORDS):
    root = chord["bass"]
    for bar in range(CHORD_BARS):
        bar_start = ci * CHORD_BARS * BAR + bar * BAR
        for off, note, dur in ((0.0, root, 0.55), (2.5 * BEAT, root + 7, 0.3)):
            n = int(dur * SR)
            t = np.arange(n) / SR
            env = pluck_env(n, attack=0.01, decay=0.32)
            sig = soft_tone(t, midi_hz(note), "bass") * env
            add(sig, bar_start + off, gain=0.16, pan=0.0)

# 5. 很轻的鼓：软 kick + 刷子 hi-hat + 偶尔的 rim
def kick(n):
    t = np.arange(n) / SR
    freq = 72 * np.exp(-t * 9) + 42
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 11)


for bar in range(BARS):
    b0 = bar * BAR
    # kick：每小节第 1、3 拍
    for off in (0.0, 2 * BEAT):
        n = int(0.3 * SR)
        add(kick(n), b0 + off, gain=0.075)
    # hat：八分音符的后半拍
    for step in range(8):
        n = int(0.06 * SR)
        noise = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.012 * SR))
        noise -= np.convolve(noise, np.ones(9) / 9, mode="same")  # 粗糙高通
        pan = 0.25 if step % 2 else -0.25
        add(noise, b0 + step * (BEAT / 2) + 0.01, gain=0.007, pan=pan)
    # rim：第 4 拍，隔一小节
    if bar % 2 == 1:
        n = int(0.09 * SR)
        t = np.arange(n) / SR
        rim = (np.sin(2 * np.pi * 1650 * t) * 0.5 + rng.standard_normal(n) * 0.5)
        rim *= np.exp(-t / 0.02)
        add(rim, b0 + 3 * BEAT, gain=0.014, pan=0.05)

# 6. 黑胶底噪 + 爆豆
crackle = np.zeros(N)
# 很轻的宽带底噪
bed = rng.standard_normal(N) * 0.0035
bed -= np.convolve(bed, np.ones(15) / 15, mode="same")  # 粗糙高通
crackle += bed
# 随机爆豆
for _ in range(160):
    pos = int(rng.random() * (N - 100))
    amp = 0.006 + rng.random() * 0.02
    length = 8 + int(rng.random() * 30)
    burst = rng.standard_normal(length) * np.exp(-np.arange(length) / 6.0)
    crackle[pos:pos + length] += burst * amp
# 循环边界不要有半截爆豆
crackle[-64:] *= np.linspace(1, 0, 64)
crackle[:64] *= np.linspace(0, 1, 64)
# 底噪单独再两端收一下
bed_env = np.ones(N)
fade = int(0.01 * SR)
bed_env[:fade] = np.linspace(0, 1, fade)
bed_env[-fade:] = np.linspace(1, 0, fade)
crackle *= bed_env
add(crackle, 0.0, gain=0.55, pan=0.0)

# 7. 空间感：给整体加几个极轻的延迟抽头（不做递归，避免爆音）
def tapped(source, taps, gain=1.0):
    out = np.zeros_like(source)
    for delay, g in taps:
        d = int(delay * SR)
        out[d:] += source[:-d] * g if d < N else 0
    return out * gain


for bus, pan in ((left, -0.7), (right, 0.7)):
    wet = tapped(bus, [(0.28, 0.12), (0.56, 0.06), (0.84, 0.03)], gain=1.0)
    if pan < 0:
        left += wet * 0.8
    else:
        right += wet * 0.8

# ---------------------------------------------------------------------------
# 母线处理
# ---------------------------------------------------------------------------
def hp_lp(sig, hp=32, lp=6200):
    sos_hp = butter(2, hp / (SR / 2), btype="highpass", output="sos")
    sos_lp = butter(2, lp / (SR / 2), btype="lowpass", output="sos")
    return sosfiltfilt(sos_lp, sosfiltfilt(sos_hp, sig))


left = hp_lp(left)
right = hp_lp(right)

# 轻微软压缩 / 饱和，再标准化
peak = max(np.max(np.abs(left)), np.max(np.abs(right)), 1e-9)
left = np.tanh(left / peak * 1.35) / np.tanh(1.35) * 0.88
right = np.tanh(right / peak * 1.35) / np.tanh(1.35) * 0.88

# 最后再夹到 0.89，防止 MP3 编码爆音
mix = np.stack([left, right], axis=1)
mix = np.clip(mix, -0.89, 0.89)
pcm = (mix * 32767).astype(np.int16)

out_dir = Path(__file__).resolve().parents[1] / "direction-02-room" / "assets"
out_dir.mkdir(parents=True, exist_ok=True)
wav_path = out_dir / "room-theme.wav"
with wave.open(str(wav_path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

mp3_path = out_dir / "room-theme.mp3"
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
     "-codec:a", "libmp3lame", "-b:a", "160k", "-ar", "44100", str(mp3_path)],
    check=True,
)
wav_path.unlink()  # 页面只用 mp3，wav 不保留

print(f"loop: {LOOP_SECONDS:.2f}s @ {BPM} BPM, {BARS} bars")
print(f"peak: {np.max(np.abs(mix)):.3f}")
print(f"wrote: {mp3_path} ({mp3_path.stat().st_size / 1024:.0f} KB)")
