"""Draw original, logo-free square sneaker/watch product art with Pillow."""

from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


OUT = Path("app/assets/catalog")
SIZE = 1024

SNEAKERS = [
    ("nike-dunk-low-panda.jpg", "Panda", (238, 238, 231), (35, 38, 45), (235, 235, 225), False),
    ("jordan-1-mid-chicago.jpg", "Chicago", (193, 38, 50), (244, 239, 222), (39, 42, 49), True),
    ("jordan-4-military-black.jpg", "Military", (238, 239, 230), (31, 34, 40), (180, 190, 162), True),
    ("nike-dunk-low-travis-scott.jpg", "Earth", (176, 143, 105), (83, 65, 54), (183, 166, 127), False),
    ("jordan-1-high-lost-and-found.jpg", "Heritage", (180, 42, 47), (239, 226, 198), (59, 51, 48), True),
]

WATCHES = [
    ("casio-g-shock-ga2100.jpg", "Carbon", (35, 39, 44), (18, 21, 26), (117, 184, 155), "sport"),
    ("seiko-alpinist-spb121.jpg", "Alpine", (35, 88, 70), (197, 151, 83), (235, 226, 193), "leather"),
    ("hamilton-khaki-field.jpg", "Field", (57, 72, 55), (173, 139, 91), (232, 218, 180), "fabric"),
    ("tissot-prx-powermatic-80.jpg", "Prism", (33, 73, 126), (174, 184, 193), (232, 236, 235), "steel"),
    ("longines-hydroconquest.jpg", "Bluewater", (34, 79, 134), (172, 185, 194), (232, 239, 241), "steel"),
]


def background(accent: tuple[int, int, int]) -> Image.Image:
    image = Image.new("RGB", (SIZE, SIZE))
    pixels = image.load()
    for y in range(SIZE):
        for x in range(SIZE):
            dx, dy = (x - 512) / 720, (y - 410) / 720
            glow = max(0, 1 - (dx * dx + dy * dy) ** 0.5) * 0.20
            base = (16, 20, 27)
            pixels[x, y] = tuple(int(base[i] * (1 - glow) + accent[i] * glow) for i in range(3))
    return image


def sneaker_art(filename: str, name: str, base, panel, sole, high: bool) -> None:
    image = background((96, 69, 44))
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((100, 260, 950, 870), fill=(211, 157, 89, 55))
    image = Image.alpha_composite(image.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(95)))
    draw = ImageDraw.Draw(image)
    # Soft oval contact shadow and low display plinth.
    draw.ellipse((125, 700, 910, 860), fill=(0, 0, 0, 100))
    draw.ellipse((170, 746, 875, 835), fill=(43, 47, 54, 255), outline=(112, 99, 79, 255), width=3)

    # Full shoe silhouette, held inside broad tile-safe margins.
    ankle = 500 if high else 555
    body = [(232, 637), (265, 589), (355, 568), (414, ankle), (482, ankle - 82), (552, 556), (610, 592), (710, 615), (805, 658), (858, 704), (843, 730), (745, 738), (632, 727), (514, 750), (388, 735), (290, 710)]
    draw.polygon([(x + 9, y + 18) for x, y in body], fill=(0, 0, 0, 95))
    draw.polygon(body, fill=base + (255,), outline=(232, 221, 197, 255))

    # Toe, quarter and heel panels.
    draw.polygon([(234, 638), (340, 614), (390, 702), (300, 709), (258, 687)], fill=panel + (255,))
    draw.polygon([(391, 612), (495, ankle - 68), (552, 574), (596, 694), (514, 725), (390, 704)], fill=base + (255,))
    draw.polygon([(556, 581), (610, 602), (707, 618), (735, 699), (625, 716), (596, 690)], fill=panel + (255,))
    draw.polygon([(713, 622), (806, 662), (847, 703), (741, 709)], fill=base + (255,))
    draw.line([(300, 704), (415, 720), (524, 733), (638, 710), (744, 721), (842, 710)], fill=(246, 239, 221, 255), width=11)
    draw.line([(302, 731), (420, 747), (525, 759), (644, 738), (749, 749), (840, 737)], fill=sole + (255,), width=25)
    draw.line([(321, 778), (488, 795), (647, 774), (800, 782)], fill=(211, 190, 149, 255), width=4)

    # Collar and tongue with stitched edge.
    tongue_top = 430 if high else 500
    draw.polygon([(403, 604), (418, tongue_top), (480, tongue_top - 29), (543, 582)], fill=panel + (255,), outline=(241, 232, 211, 255))
    draw.line([(430, tongue_top + 34), (474, tongue_top + 14), (520, 582)], fill=(236, 224, 199, 255), width=5)
    # Laces and eyelets.
    for idx in range(5):
        yy = tongue_top + 55 + idx * 25
        xx = 430 + idx * 13
        draw.ellipse((xx - 5, yy - 5, xx + 5, yy + 5), fill=(222, 197, 157, 255))
        draw.line([(xx, yy), (xx + 48, yy + 19)], fill=(249, 242, 222, 255), width=7)
        draw.line([(xx + 4, yy + 20), (xx + 49, yy + 1)], fill=(239, 229, 205, 255), width=6)

    # Sole stitching and accent seam provide product detail at thumbnail scale.
    draw.line([(328, 686), (401, 694), (480, 683)], fill=(103, 91, 77, 255), width=3)
    draw.line([(622, 675), (690, 670), (756, 685)], fill=(245, 235, 214, 255), width=4)
    save(image, filename)


def watch_art(filename: str, name: str, case_color, band_color, dial_color, band_kind: str) -> None:
    image = background((40, 73, 94))
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((180, 70, 850, 950), fill=(81, 143, 171, 55))
    image = Image.alpha_composite(image.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(100)))
    draw = ImageDraw.Draw(image)
    # Vertical strap stays wholly within the safe square frame.
    if band_kind in ("steel", "sport"):
        draw.rounded_rectangle((407, 86, 617, 939), radius=86, fill=band_color + (255,), outline=(220, 226, 227, 255), width=7)
        for y in range(110, 920, 29):
            draw.line((425, y, 599, y), fill=tuple(min(255, c + 28) for c in band_color) + (255,), width=3)
        if band_kind == "sport":
            for y in range(780, 880, 30):
                draw.rounded_rectangle((478, y, 546, y + 12), radius=6, fill=(13, 16, 20, 255))
    else:
        draw.rounded_rectangle((430, 85, 594, 940), radius=66, fill=band_color + (255,), outline=(215, 194, 160, 255), width=5)
        for y in range(118, 922, 31):
            draw.line((446, y, 578, y), fill=tuple(min(255, c + 22) for c in band_color) + (255,), width=2)
        if band_kind == "fabric":
            for y in range(130, 900, 18):
                draw.line((440, y, 584, y), fill=(221, 206, 169, 100), width=1)

    # Case, stepped bezel and clear dial.
    draw.ellipse((273, 264, 758, 749), fill=(8, 10, 14, 105))
    draw.ellipse((265, 244, 759, 738), fill=case_color + (255,), outline=(226, 220, 201, 255), width=8)
    draw.ellipse((292, 271, 732, 711), fill=(27, 31, 37, 255), outline=(107, 119, 125, 255), width=4)
    draw.ellipse((316, 295, 708, 687), fill=dial_color + (255,), outline=(231, 219, 190, 255), width=4)

    cx, cy = 512, 491
    # Minute track, applied indices and twelve distinct hour markers.
    for i in range(60):
        angle = (i / 60) * 2 * pi - pi / 2
        inner = 164 if i % 5 == 0 else 174
        outer = 185
        color = (232, 221, 193, 255) if i % 5 == 0 else (201, 205, 199, 210)
        draw.line((cx + cos(angle) * inner, cy + sin(angle) * inner, cx + cos(angle) * outer, cy + sin(angle) * outer), fill=color, width=5 if i % 5 == 0 else 2)
    for i in range(12):
        angle = (i / 12) * 2 * pi - pi / 2
        x, y = cx + cos(angle) * 145, cy + sin(angle) * 145
        draw.rounded_rectangle((x - 7, y - 17, x + 7, y + 17), radius=5, fill=(240, 229, 201, 255))

    # Hands set to a clean, readable time; no logos or lettering.
    draw.line((cx, cy, cx - 63, cy - 72), fill=(246, 238, 215, 255), width=12)
    draw.line((cx, cy, cx + 101, cy + 38), fill=(246, 238, 215, 255), width=9)
    draw.line((cx - 5, cy + 13, cx + 67, cy - 123), fill=(211, 65, 61, 255), width=4)
    draw.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill=(226, 191, 118, 255), outline=(25, 29, 34, 255), width=3)

    # Crown and shoulders.
    draw.rounded_rectangle((751, 438, 800, 541), radius=17, fill=case_color + (255,), outline=(229, 217, 192, 255), width=4)
    draw.line((771, 451, 771, 526), fill=(238, 226, 199, 255), width=3)
    save(image, filename)


def save(image: Image.Image, filename: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(OUT / filename, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"{OUT / filename}: {image.width}x{image.height}")


for sneaker in SNEAKERS:
    sneaker_art(*sneaker)
for watch in WATCHES:
    watch_art(*watch)
