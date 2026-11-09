"""Create a looping ocean-and-glass ambient track with standard-library synthesis."""

import math
import random
import struct
import subprocess
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "site/audio/ocean-glass.mp3"
INTERMEDIATE = ROOT / "site/audio/ocean-glass.wav"
RATE = 22050
DURATION = 24
SAMPLES = RATE * DURATION
TAU = 2 * math.pi
randomizer = random.Random(2026)
noise = [randomizer.uniform(-1, 1) for _ in range(4096)]


def smooth_noise(phase):
    position = phase % len(noise)
    start = int(position)
    blend = position - start
    blend = blend * blend * (3 - 2 * blend)
    return noise[start] * (1 - blend) + noise[(start + 1) % len(noise)] * blend


def bell(time, position, frequency):
    elapsed = time - position
    if elapsed < 0 or elapsed > 4:
        return 0
    envelope = (1 - math.exp(-elapsed * 18)) * math.exp(-elapsed * 1.25)
    return envelope * (
        math.sin(TAU * frequency * elapsed)
        + 0.23 * math.sin(TAU * frequency * 2.01 * elapsed)
        + 0.08 * math.sin(TAU * frequency * 3.9 * elapsed)
    )


with wave.open(str(INTERMEDIATE), "wb") as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(RATE)
    buffer = bytearray()

    for index in range(SAMPLES):
        time = index / RATE
        phase = time / DURATION
        swell = 0.48 + 0.22 * math.sin(TAU * phase * 3 - 0.5)
        swell += 0.12 * math.sin(TAU * phase * 5 + 1.3)

        # Four periodic noise layers create moving water without a hard loop seam.
        spray = (
            smooth_noise(phase * 4096 * 41) * 0.22
            + smooth_noise(phase * 4096 * 107) * 0.11
            + smooth_noise(phase * 4096 * 239) * 0.065
        ) * swell
        undertow = smooth_noise(phase * 4096 * 5) * 0.075

        # D minor with a suspended ninth: warm glass harmonics over low surf.
        drone = (
            math.sin(TAU * 3524 * phase) * 0.055
            + math.sin(TAU * 5280 * phase + 0.7) * 0.035
            + math.sin(TAU * 8382 * phase + 1.2) * 0.021
            + math.sin(TAU * 5874 * phase + 2.3) * 0.018
        )
        pulse = math.sin(TAU * 4 * phase) ** 2
        drone *= 0.7 + 0.3 * pulse

        chimes = (
            bell(time, 3.6, 587.3) * 0.032
            + bell(time, 10.2, 440) * 0.024
            + bell(time, 16.8, 698.5) * 0.023
            + bell(time, 21.0, 523.25) * 0.02
        )
        pan = 0.08 * math.sin(TAU * phase * 2)
        left = spray * (1 + pan) + undertow + drone + chimes
        right = spray * (1 - pan) + undertow * 0.8 + drone * 0.85 + chimes * 0.67
        # Cross-fade the one-shot chime tails at the loop boundary.
        fade = min(1, time / 0.2, (DURATION - time) / 0.2)
        buffer.extend(struct.pack("<hh", int(max(-1, min(1, left * fade)) * 32767), int(max(-1, min(1, right * fade)) * 32767)))

        if len(buffer) >= RATE * 4:
            output.writeframesraw(buffer)
            buffer.clear()

    output.writeframes(buffer)

try:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(INTERMEDIATE), "-codec:a", "libmp3lame", "-b:a", "128k", str(OUTPUT)],
        check=True,
    )
finally:
    INTERMEDIATE.unlink(missing_ok=True)
