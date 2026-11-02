"""Gera efeitos originais em PCM WAV. Rode apenas para recriar os placeholders.

Substitua qualquer arquivo em sounds/sfx mantendo seu nome para usar outro áudio.
"""
from pathlib import Path
from math import pi, sin
import random
import struct
import wave

RATE = 44100
OUT = Path(__file__).resolve().parents[1] / "sounds" / "sfx"
OUT.mkdir(parents=True, exist_ok=True)

# Nome estável, duração, frequência inicial/final, ruído, sequência de estalos.
PRESETS = {
    "dice_launch.wav": (0.38, 180, 440, 0.55, (0.04, 0.11, 0.20)),
    "dice_surface.wav": (0.19, 155, 62, 0.75, (0.01, 0.055)),
    "dice_collision.wav": (0.12, 340, 110, 0.65, (0.01,)),
    "dice_tumble.wav": (0.10, 260, 120, 0.55, (0.01, 0.045)),
    "dice_settle.wav": (0.17, 430, 265, 0.20, (0.02,)),
    "attack_whoosh.wav": (0.42, 150, 620, 0.80, ()),
    "attack_impact.wav": (0.29, 100, 42, 0.88, (0.01, 0.05)),
    "attack_defend.wav": (0.32, 730, 390, 0.25, (0.01, 0.08)),
    "attack_draw.wav": (0.37, 440, 290, 0.30, (0.01, 0.18)),
    "room_reveal.wav": (0.73, 150, 310, 0.38, (0.04, 0.27)),
    "enemy_reveal.wav": (0.66, 270, 95, 0.58, (0.03, 0.23)),
    "reward_gain.wav": (0.61, 520, 900, 0.12, (0.03, 0.18, 0.32)),
    "heal_gain.wav": (0.60, 330, 760, 0.08, (0.03, 0.21)),
}

for index, (name, (duration, start, end, noise_amount, clicks)) in enumerate(PRESETS.items()):
    rng = random.Random(88421 + index)
    samples = []
    phase = 0.0
    filtered_noise = 0.0
    count = int(duration * RATE)
    for sample_index in range(count):
        t = sample_index / RATE
        progress = t / duration
        freq = start + (end - start) * progress
        phase += 2 * pi * freq / RATE
        filtered_noise = filtered_noise * 0.72 + rng.uniform(-1, 1) * 0.28
        envelope = min(1, t / 0.014) * (1 - progress) ** 2.2
        click = sum(max(0, 1 - abs(t - when) / 0.014) ** 2 for when in clicks)
        tone = sin(phase) * 0.58 + sin(phase * 1.997) * 0.13
        signal = (tone * (1 - noise_amount) + filtered_noise * noise_amount + filtered_noise * click * 0.8) * envelope
        samples.append(max(-1, min(1, signal * 0.52)))
    with wave.open(str(OUT / name), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(b"".join(struct.pack("<h", round(value * 32767)) for value in samples))
