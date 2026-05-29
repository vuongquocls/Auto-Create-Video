#!/usr/bin/env python3
"""Generate one Supertonic TTS WAV file for Auto-Create-Video."""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Supertonic local TTS wrapper")
    parser.add_argument("--text-file", required=True, help="UTF-8 text file to synthesize")
    parser.add_argument("--out", required=True, help="Output WAV path")
    parser.add_argument("--voice", default="M4", help="Supertonic voice preset, e.g. M1 or F1")
    parser.add_argument("--lang", default="vi", help="Language code, e.g. vi or en")
    parser.add_argument("--speed", type=float, default=1.05, help="Speech speed")
    args = parser.parse_args()

    try:
        from supertonic import TTS
    except ImportError as exc:
        raise SystemExit(
            "Missing Python package 'supertonic'. Install it with: "
            "python3 -m pip install supertonic"
        ) from exc

    text = Path(args.text_file).read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit("Input text is empty")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    tts = TTS(auto_download=True)
    style = tts.get_voice_style(voice_name=args.voice)
    wav, _duration = tts.synthesize(
        text,
        voice_style=style,
        lang=args.lang,
        speed=args.speed,
    )
    tts.save_audio(wav, str(out))


if __name__ == "__main__":
    main()
