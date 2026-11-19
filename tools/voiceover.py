#!/usr/bin/env python3
"""Record the British voice-over for the AI Harness video.

Reads every narrated line from the transcript in
reference/ai-quality-architecture.html, speaks it in a British English voice
with Kokoro-82M (open weights, Apache-2.0) and writes one MP3 per line to
assets/audio/harness/<scene>-<line>.mp3. Each line's length is stored back on
the transcript as data-ms, so the video's timeline follows the narration.

Run it again whenever you edit the transcript.

Setup, once:
    python3 -m venv .venv && . .venv/bin/activate
    pip install kokoro-onnx soundfile
    # From https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX download
    # onnx/model.onnx and voices/bf_emma.bin into one folder, e.g. ~/kokoro
    # ffmpeg and ffprobe must be on PATH

Run:
    python3 tools/voiceover.py --model-dir ~/kokoro
    python3 tools/voiceover.py --model-dir ~/kokoro --voice bm_george   # a male British voice
"""
import argparse
import html
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / 'reference' / 'ai-quality-architecture.html'
OUT = ROOT / 'assets' / 'audio' / 'harness'

# How the narrator should say things that are written for readers.
SPOKEN = [
    (re.compile(r'\$3,600'), 'three thousand six hundred dollars'),
    (re.compile(r'\bevals\b'), 'e-vals'),
]

SCENE = re.compile(r'<li data-scene="([^"]+)"(.*?)</li>', re.S)
LINE = re.compile(r'<p data-seg([^>]*)>(.*?)</p>', re.S)


def spoken(text):
    for pattern, replacement in SPOKEN:
        text = pattern.sub(replacement, text)
    return text


def tidy(audio, sr, lead=0.06, tail=0.12, floor=0.02):
    """Trim silence around the line, then level it so every line sounds equally loud."""
    loud = np.flatnonzero(np.abs(audio) > floor * np.abs(audio).max())
    start = max(0, loud[0] - int(lead * sr))
    end = min(len(audio), loud[-1] + int(tail * sr))
    audio = audio[start:end].astype(np.float32)
    rms = float(np.sqrt(np.mean(audio ** 2))) or 1.0
    gain = min(0.1 / rms, 0.89 / float(np.abs(audio).max()))  # -20 dBFS RMS, peaks below -1 dBFS
    return audio * gain


def encode(audio, sr, target):
    with tempfile.NamedTemporaryFile(suffix='.wav') as wav:
        sf.write(wav.name, audio, sr)
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav.name,
                        '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', str(target)], check=True)
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(target)],
                           check=True, capture_output=True, text=True)
    return round(float(probe.stdout) * 1000)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--model-dir', required=True, type=Path, help='folder holding model.onnx and voices/<voice>.bin')
    parser.add_argument('--voice', default='bf_emma', help='British voices: bf_emma, bf_isabella, bm_george, bm_fable, ...')
    parser.add_argument('--speed', type=float, default=0.9)
    args = parser.parse_args()

    voice_file = args.model_dir / 'voices' / f'{args.voice}.bin'
    voices = args.model_dir / 'voices.npz'
    np.savez(voices, **{args.voice: np.fromfile(voice_file, dtype=np.float32).reshape(-1, 1, 256)})
    kokoro = Kokoro(str(args.model_dir / 'model.onnx'), str(voices))

    page = PAGE.read_text(encoding='utf-8')
    start = page.index('<ol class="hx-script" id="hx-script">')
    end = page.index('</ol>', start)
    script = page[start:end]
    OUT.mkdir(parents=True, exist_ok=True)

    def record_scene(scene_match):
        scene = scene_match.group(1)
        count = 0

        def record_line(line_match):
            nonlocal count
            count += 1
            attrs = re.sub(r'\s*data-ms="\d+"', '', line_match.group(1))
            text = html.unescape(re.sub(r'<[^>]+>', '', line_match.group(2))).strip()
            audio, sr = kokoro.create(spoken(text), voice=args.voice, speed=args.speed, lang='en-gb')
            ms = encode(tidy(audio, sr), sr, OUT / f'{scene}-{count}.mp3')
            print(f'{scene}-{count}.mp3  {ms / 1000:5.2f}s  {text}')
            return f'<p data-seg{attrs} data-ms="{ms}">{line_match.group(2)}</p>'

        return f'<li data-scene="{scene}"' + LINE.sub(record_line, scene_match.group(2)) + '</li>'

    PAGE.write_text(page[:start] + SCENE.sub(record_scene, script) + page[end:], encoding='utf-8')


if __name__ == '__main__':
    main()
