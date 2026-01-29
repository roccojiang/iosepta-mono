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

    # Determine theme from output filename
    basename = os.path.basename(out_path)
    if ".dark." in basename:
        theme = config["themes"]["dark"]
    else:
        theme = config["themes"]["light"]

    hot_chars = set(config["hotChars"].get(slope, []))
    text_grid = config["textGrid"]
    font_size = config["fontSize"]
    line_height_ratio = config["lineHeight"]

    # Load font with fonttools for glyph outlines
    tt_font = TTFont(font_path)
    glyph_set = tt_font.getGlyphSet()
    upem = tt_font["head"].unitsPerEm

    # Load font with HarfBuzz for shaping
    blob = hb.Blob.from_file_path(font_path)
    face = hb.Face(blob)
    hb_font = hb.Font(face)

    scale = font_size / upem
    line_height = font_size * line_height_ratio
    pad_x = 40
    pad_y = 40

    # Compute SVG dimensions based on actual shaping
    # First pass: shape all lines to find max width
    max_width = 0
    shaped_lines = []
    for line_text in text_grid:
        shaped = shape_line(hb_font, line_text, config.get("features", []))
        shaped_lines.append((line_text, shaped))
        line_width = sum(info["x_advance"] for info in shaped) * scale
        max_width = max(max_width, line_width)

    width = max_width + pad_x * 2
    height = len(text_grid) * line_height + pad_y * 2

    # Build SVG
    svg_ns = "http://www.w3.org/2000/svg"
    ET.register_namespace("", svg_ns)
    svg = ET.Element(
        "svg",
        xmlns=svg_ns,
        width=str(round(width)),
        height=str(round(height)),
        viewBox=f"0 0 {round(width)} {round(height)}",
    )

    # Background
    ET.SubElement(
        svg,
        "rect",
        width="100%",
        height="100%",
        fill=theme["background"],
    )

    # Render each line
    for line_idx, (line_text, shaped) in enumerate(shaped_lines):
        # Center line block vertically
        baseline_y = pad_y + (line_idx + 0.75) * line_height

        cursor_x = pad_x
        char_idx = 0
        for info in shaped:
            # Map back to source character
            ch = line_text[info["cluster"]] if info["cluster"] < len(line_text) else ""
            is_hot = ch in hot_chars
            color = theme["stress"] if is_hot else theme["body"]

            glyph_name = info["glyph_name"]
            x_advance = info["x_advance"] * scale
            x_offset = info["x_offset"] * scale
            y_offset = info["y_offset"] * scale

            if glyph_name in glyph_set:
                glyph = glyph_set[glyph_name]
                pen = SVGPathPen(glyph_set)
                glyph.draw(pen)
                path_data = pen.getCommands()
                if path_data:
                    # Transform: translate to position, flip Y (font coords are Y-up)
                    tx = cursor_x + x_offset
                    ty = baseline_y - y_offset
                    ET.SubElement(
                        svg,
                        "path",
                        d=path_data,
                        fill=color,
                        transform=f"translate({tx:.1f},{ty:.1f}) scale({scale:.6f},{-scale:.6f})",
                    )

            cursor_x += x_advance
            char_idx += 1

    tree = ET.ElementTree(svg)
    ET.indent(tree, space="  ")
    tree.write(out_path, xml_declaration=True, encoding="unicode")
    print(f"Wrote {out_path}")


def shape_line(hb_font, text, features):
    """Shape a line of text with HarfBuzz and return glyph info."""
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()

    # Apply OpenType features as dict: {tag: True}
    feature_dict = {feat: True for feat in features}

    hb.shape(hb_font, buf, feature_dict)

    infos = buf.glyph_infos
    positions = buf.glyph_positions
    result = []
    for info, pos in zip(infos, positions):
        glyph_name = hb_font.glyph_to_string(info.codepoint)
        result.append(
            {
                "glyph_name": glyph_name,
                "cluster": info.cluster,
                "x_advance": pos.x_advance,
                "y_advance": pos.y_advance,
                "x_offset": pos.x_offset,
                "y_offset": pos.y_offset,
            }
        )
    return result


if __name__ == "__main__":
    main()
