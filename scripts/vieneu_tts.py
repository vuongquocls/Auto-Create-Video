#!/usr/bin/env python3
"""
VieNeu-TTS bridge script for Auto-Create-Video pipeline.

Reads text from a file and synthesises speech using the VieNeu SDK.
Supports standard, turbo, and remote modes with optional voice cloning.

Usage:
  python3 scripts/vieneu_tts.py \
    --text-file input.txt --out voice.wav \
    --mode standard --emotion storytelling \
    [--ref-audio ref.wav] [--ref-text "transcript"] \
    [--api-base http://host:23333/v1] [--model pnnbao-ump/VieNeu-TTS-v2]
"""
import argparse
import sys


def main():
    parser = argparse.ArgumentParser(description="VieNeu-TTS bridge for Auto-Create-Video")
    parser.add_argument("--text-file", required=True, help="Path to text file to synthesise")
    parser.add_argument("--out", required=True, help="Output WAV path")
    parser.add_argument("--mode", default="standard", choices=["standard", "turbo", "remote"])
    parser.add_argument("--emotion", default="natural", choices=["natural", "storytelling"])
    parser.add_argument("--ref-audio", help="Reference audio for voice cloning (3-5s)")
    parser.add_argument("--ref-text", help="Transcript of reference audio (Standard mode)")
    parser.add_argument("--api-base", help="Remote API base URL")
    parser.add_argument("--model", help="Remote model name")
    args = parser.parse_args()

    with open(args.text_file, "r", encoding="utf-8") as f:
        text = f.read().strip()

    if not text:
        print("Error: empty text input", file=sys.stderr)
        sys.exit(1)

    try:
        from vieneu import Vieneu
    except ImportError:
        print(
            "Error: vieneu package not found. Install with:\n"
            "  pip install vieneu\n"
            "Or for macOS Apple Silicon with Metal acceleration:\n"
            "  pip install vieneu --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/metal/",
            file=sys.stderr,
        )
        sys.exit(1)

    # Initialise the TTS engine
    init_kwargs = {"emotion": args.emotion}
    if args.mode == "turbo":
        init_kwargs["mode"] = "turbo"
    elif args.mode == "remote":
        init_kwargs["mode"] = "remote"
        if args.api_base:
            init_kwargs["api_base"] = args.api_base
        if args.model:
            init_kwargs["model_name"] = args.model

    tts = Vieneu(**init_kwargs)

    # Build inference kwargs
    infer_kwargs = {"text": text}

    # Voice cloning
    if args.ref_audio:
        if args.mode == "turbo":
            # Turbo mode: encode_reference (no ref_text needed)
            voice = tts.encode_reference(args.ref_audio)
            infer_kwargs["voice"] = voice
        elif args.mode == "remote":
            # Remote mode: pass ref_audio directly
            infer_kwargs["ref_audio"] = args.ref_audio
            if args.ref_text:
                infer_kwargs["ref_text"] = args.ref_text
        else:
            # Standard mode: encode + optionally pass ref_text for accuracy
            voice = tts.encode_reference(args.ref_audio)
            infer_kwargs["voice"] = voice

    # Synthesise
    audio = tts.infer(**infer_kwargs)

    # Save
    tts.save(audio, args.out)
    print(f"Saved: {args.out}")


if __name__ == "__main__":
    main()
