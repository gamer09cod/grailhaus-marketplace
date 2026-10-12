"""Recompress bundled catalog JPEGs for a smaller mobile APK.

Targets phone retina frames (reveal face ~268x376). Keeps aspect ratio.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "app" / "assets" / "catalog"

# Long-edge caps: cards display ~268x376; 2.5–3× retina is ample.
MAX_EDGE = {
    "card": 900,
    "product": 768,
    "pack": 900,
}
QUALITY = 74


def kind(name: str) -> str:
    if name.startswith("pack-"):
        return "pack"
    shoe_watch = (
        "jordan-",
        "nike-",
        "casio-",
        "seiko-",
        "hamilton-",
        "tissot-",
        "longines-",
    )
    if name.startswith(shoe_watch):
        return "product"
    return "card"


def main() -> None:
    before = 0
    after = 0
    count = 0
    for path in sorted(CATALOG.glob("*.jpg")):
        before += path.stat().st_size
        image = Image.open(path).convert("RGB")
        edge = MAX_EDGE[kind(path.name)]
        w, h = image.size
        long_edge = max(w, h)
        if long_edge > edge:
            scale = edge / long_edge
            image = image.resize(
                (max(1, round(w * scale)), max(1, round(h * scale))),
                Image.Resampling.LANCZOS,
            )
        image.save(
            path,
            "JPEG",
            quality=QUALITY,
            optimize=True,
            progressive=True,
        )
        after += path.stat().st_size
        count += 1
        print(f"{path.name}: {w}x{h} -> {image.size[0]}x{image.size[1]}")

    print(
        f"Compressed {count} JPEGs: {before / 1024 / 1024:.2f} MiB -> "
        f"{after / 1024 / 1024:.2f} MiB "
        f"({(1 - after / before) * 100:.0f}% smaller)"
    )


if __name__ == "__main__":
    main()
