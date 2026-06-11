from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import fitz

PDF_PATH = Path(__file__).with_name("color.pdf")
OUTPUT_PATH = Path(__file__).with_name("colors.json")
CODE_PATTERN = re.compile(r"[A-HM]\d+")


def rgb_from_fill(fill: tuple[float, float, float]) -> list[int]:
    return [max(0, min(255, round(channel * 255))) for channel in fill]


def is_black(fill: tuple[float, float, float] | None) -> bool:
    if fill is None:
        return True
    return all(channel <= 0.01 for channel in fill)


def extract_code_spans(page: fitz.Page) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span["text"].strip()
                if not CODE_PATTERN.fullmatch(text):
                    continue
                x0, y0, x1, y1 = span["bbox"]
                spans.append(
                    {
                        "code": text,
                        "center": [(x0 + x1) / 2, (y0 + y1) / 2],
                        "bbox": [x0, y0, x1, y1],
                    }
                )
    return spans


def extract_color_shapes(page: fitz.Page) -> list[dict[str, Any]]:
    drawings: list[dict[str, Any]] = []
    for drawing in page.get_drawings():
        fill = drawing.get("fill")
        rect = drawing.get("rect")
        if rect is None or fill is None:
            continue
        drawings.append(
            {
                "rect": [rect.x0, rect.y0, rect.x1, rect.y1],
                "rgb": rgb_from_fill(fill),
                "isBlack": is_black(fill),
            }
        )
    return [drawings[index] for index in range(0, len(drawings), 2)]


def contains(rect: list[float], point: list[float]) -> bool:
    x0, y0, x1, y1 = rect
    x, y = point
    return x0 <= x <= x1 and y0 <= y <= y1


def rect_center(rect: list[float]) -> list[float]:
    x0, y0, x1, y1 = rect
    return [(x0 + x1) / 2, (y0 + y1) / 2]


def distance(left: list[float], right: list[float]) -> float:
    return ((left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2) ** 0.5


def find_shape_for_span(shapes: list[dict[str, Any]], span: dict[str, Any]) -> dict[str, Any]:
    matches = [shape for shape in shapes if contains(shape["rect"], span["center"])]
    if len(matches) == 1:
        return matches[0]
    return min(shapes, key=lambda shape: distance(rect_center(shape["rect"]), span["center"]))


def extract_page(page: fitz.Page, bead_type: str) -> list[dict[str, Any]]:
    shapes = extract_color_shapes(page)
    spans = extract_code_spans(page)
    if len(shapes) != len(spans):
        raise RuntimeError(f"Expected shape count to match code count, got {len(shapes)} and {len(spans)}")

    colors: list[dict[str, Any]] = []

    for span, shape in zip(spans, shapes):
        colors.append(
            {
                "code": span["code"],
                "name": span["code"],
                "rgb": shape["rgb"],
                "enabled": True,
                "beadType": bead_type,
                "sourcePage": 1 if bead_type == "round" else 2,
            }
        )

    return colors


def main() -> None:
    doc = fitz.open(PDF_PATH)
    if doc.page_count < 2:
        raise RuntimeError("Expected color.pdf to contain at least two pages")

    payload = {
        "source": str(PDF_PATH.name),
        "version": "color-pdf-v1",
        "palettes": {
            "round": extract_page(doc[0], "round"),
            "square": extract_page(doc[1], "square"),
        },
    }

    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved {OUTPUT_PATH}")
    print(f"round colors: {len(payload['palettes']['round'])}")
    print(f"square colors: {len(payload['palettes']['square'])}")


if __name__ == "__main__":
    main()
