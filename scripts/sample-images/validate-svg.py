#!/usr/bin/env python3
"""Validates that an SVG file exists and has reasonable size."""

import os
import sys

if len(sys.argv) < 2:
    print("Usage: validate-svg.py <file.svg>", file=sys.stderr)
    sys.exit(1)

svg_path = sys.argv[1]

if not os.path.isfile(svg_path):
    print(f"File not found: {svg_path}", file=sys.stderr)
    sys.exit(1)

size = os.path.getsize(svg_path)
if size < 200:
    print(f"SVG too small ({size} bytes): {svg_path}", file=sys.stderr)
    sys.exit(1)

print(f"SVG valid: {svg_path} ({size} bytes)")
