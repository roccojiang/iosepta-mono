#!/usr/bin/env python3
"""Renders outline SVGs from a sample config JSON and a TTF font.

Usage: render-outline-svg.py <config.json> <font.ttf> <slope> <out.svg>
Theme is selected by output filename: '.light.svg' or '.dark.svg'.
"""

import json
import os
import sys
import xml.etree.ElementTree as ET

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont


def shape_run(hb_font, text, features):
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, features)
    glyphs = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        glyph_name = hb_font.glyph_to_string(info.codepoint)
        glyphs.append(
            {
                "glyph_name": glyph_name,
                "x_advance": pos.x_advance,
                "x_offset": pos.x_offset,
                "y_offset": pos.y_offset,
            }
        )
    return glyphs


def split_runs(line, hot_set):
    runs = []
    cur = ""
    cur_hot = None
    for ch in line:
        is_hot = ch in hot_set
        if cur_hot is None or cur_hot == is_hot:
            cur_hot = is_hot
            cur += ch
        else:
            runs.append((cur, cur_hot))
            cur = ch
            cur_hot = is_hot
    if cur:
        runs.append((cur, cur_hot))
    return runs


def main():
    if len(sys.argv) != 5:
        print(
            "Usage: render-outline-svg.py <config.json> <font.ttf> <slope> <out.svg>",
            file=sys.stderr,
        )
        sys.exit(1)

    config_path, font_path, slope, out_path = sys.argv[1:5]

    with open(config_path) as f:
        config = json.load(f)

    basename = os.path.basename(out_path)
    theme = config["themes"]["dark"] if ".dark." in basename else config["themes"]["light"]

    hot_chars = set(config["hotChars"].get(slope, []))
    text_grid = config["textGrid"]
    lines = [row[0] + "    " + row[1] for row in text_grid]

    font_size = config["fontSize"]
    line_height_ratio = config["lineHeight"]

    tt_font = TTFont(font_path)
    glyph_set = tt_font.getGlyphSet()
    upem = tt_font["head"].unitsPerEm
    ascent = tt_font["hhea"].ascent

    blob = hb.Blob.from_file_path(font_path)
    face = hb.Face(blob)
    hb_font = hb.Font(face)

    scale = font_size / upem
    line_height = font_size * line_height_ratio

    features_hot = {**config.get("features", {}), "calt": 1}
    features_base = {"calt": 1}

    line_widths = []
    for line in lines:
        width = 0
        for text, is_hot in split_runs(line, hot_chars):
            feats = features_hot if is_hot else features_base
            glyphs = shape_run(hb_font, text, feats)
            width += sum(g["x_advance"] for g in glyphs) * scale
        line_widths.append(width)

    width = config["width"]
    height = config["height"]

    block_height = len(lines) * line_height
    y = (height - block_height) / 2 + ascent * scale

    svg_ns = "http://www.w3.org/2000/svg"
    ET.register_namespace("", svg_ns)
    svg = ET.Element(
        "svg",
        xmlns=svg_ns,
        width=str(width),
        height=str(height),
        viewBox=f"0 0 {width} {height}",
    )

    for i, line in enumerate(lines):
        x = (width - line_widths[i]) / 2
        for text, is_hot in split_runs(line, hot_chars):
            feats = features_hot if is_hot else features_base
            glyphs = shape_run(hb_font, text, feats)
            color = theme["stress"] if is_hot else theme["body"]
            for g in glyphs:
                name = g["glyph_name"]
                if name in glyph_set:
                    pen = SVGPathPen(glyph_set)
                    glyph_set[name].draw(pen)
                    if hasattr(pen, "getSVGPath"):
                        d = pen.getSVGPath()
                    else:
                        d = pen.getCommands()
                    if d:
                        tx = x + g["x_offset"] * scale
                        ty = y - g["y_offset"] * scale
                        ET.SubElement(
                            svg,
                            "path",
                            d=d,
                            fill=color,
                            transform=(
                                f"translate({tx:.3f},{ty:.3f}) "
                                f"scale({scale:.6f},{-scale:.6f})"
                            ),
                        )
                x += g["x_advance"] * scale
        y += line_height

    tree = ET.ElementTree(svg)
    ET.indent(tree, space="  ")
    tree.write(out_path, xml_declaration=True, encoding="unicode")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
