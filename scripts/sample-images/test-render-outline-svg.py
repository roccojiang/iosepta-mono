#!/usr/bin/env python3
"""Regression test for per-run feature shaping in SVG renderer."""

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import uharfbuzz as hb
from fontTools.ttLib import TTFont


def parse_translate_x(transform):
    match = re.search(r"translate\(([-0-9.]+),([-0-9.]+)\)", transform)
    if not match:
        raise AssertionError(f"Missing translate() in transform: {transform}")
    return float(match.group(1))


def shape_advance(font_path, text, features):
    blob = hb.Blob.from_file_path(str(font_path))
    face = hb.Face(blob)
    hb_font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, features)
    return buf.glyph_positions[0].x_advance


def main():
    repo_root = Path(__file__).resolve().parents[2]
    script_path = repo_root / "scripts/sample-images/render-outline-svg.py"
    font_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")

    if not font_path.exists():
        raise AssertionError("Missing DejaVuSans.ttf in /usr/share/fonts/truetype")

    config = {
        "width": 500,
        "height": 200,
        "fontSize": 100,
        "lineHeight": 1.0,
        "textGrid": [["AV", ""]],
        "features": {"kern": 0},
        "hotChars": {"upright": ["A", "V"]},
        "themes": {
            "light": {"background": "#ffffff", "body": "#111111", "stress": "#ff0000"},
            "dark": {"background": "#000000", "body": "#eeeeee", "stress": "#ff0000"},
        },
    }

    with tempfile.TemporaryDirectory() as tempdir:
        tempdir_path = Path(tempdir)
        config_path = tempdir_path / "config.json"
        out_path = tempdir_path / "out.light.svg"
        config_path.write_text(json.dumps(config), encoding="utf-8")

        result = subprocess.run(
            [
                sys.executable,
                str(script_path),
                str(config_path),
                str(font_path),
                "upright",
                str(out_path),
            ],
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, (
            "Renderer failed:\n"
            f"stdout: {result.stdout}\n"
            f"stderr: {result.stderr}"
        )

        import xml.etree.ElementTree as ET

        tree = ET.parse(out_path)
        root = tree.getroot()
        if root.tag.startswith("{"):
            ns_uri = root.tag.split("}")[0][1:]
            paths = root.findall(f".//{{{ns_uri}}}path")
        else:
            paths = root.findall(".//path")

        assert len(paths) >= 2, "Expected at least two glyph paths"
        x0 = parse_translate_x(paths[0].attrib.get("transform", ""))
        x1 = parse_translate_x(paths[1].attrib.get("transform", ""))
        delta = x1 - x0

        upem = TTFont(str(font_path))["head"].unitsPerEm
        scale = config["fontSize"] / upem
        expected_advance = shape_advance(font_path, "AV", {"kern": 0, "calt": 1}) * scale

        assert abs(delta - expected_advance) < 0.01, (
            f"Expected advance {expected_advance:.3f}, got {delta:.3f}"
        )


if __name__ == "__main__":
    main()
