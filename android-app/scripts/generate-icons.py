#!/usr/bin/env python3
import argparse
import io
import os
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

LOGO_URL = "https://i.ibb.co.com/pBy7qxjG/file-0000000097ac8211b2cf9825ab2e845f.png"

def load_logo(path):
    if path and Path(path).exists():
        return Image.open(path).convert("RGBA")
    try:
        req = urllib.request.Request(LOGO_URL, headers={"User-Agent": "Ethvelle-Android-Build/1.0"})
        with urllib.request.urlopen(req, timeout=25) as response:
            return Image.open(io.BytesIO(response.read())).convert("RGBA")
    except Exception as exc:
        print("Logo fetch failed; using clean lettermark fallback:", exc)
        return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--res", required=True)
    ap.add_argument("--logo")
    args = ap.parse_args()
    res = Path(args.res)
    res.mkdir(parents=True, exist_ok=True)
    logo = load_logo(args.logo)

    size = 432
    fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if logo:
        logo.thumbnail((size * 0.70, size * 0.70), Image.Resampling.LANCZOS)
        # Preserve transparent pixels and keep the brand mark clear inside Android's adaptive safe zone.
        x = (size - logo.width) // 2
        y = (size - logo.height) // 2
        fg.alpha_composite(logo, (x, y))
    else:
        # Fallback only if the exact brand image URL is unavailable in the runner.
        draw = ImageDraw.Draw(fg)
        draw.rounded_rectangle((52, 52, 380, 380), radius=88, fill=(47, 92, 232, 255))
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 250)
        except Exception:
            font = ImageFont.load_default()
        bbox = draw.textbbox((0, 0), "E", font=font, stroke_width=0)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1] - 8), "E", font=font, fill=(255,255,255,255))

    density = {"mdpi":48, "hdpi":72, "xhdpi":96, "xxhdpi":144, "xxxhdpi":192}
    for name, px in density.items():
        folder = res / ("mipmap-" + name)
        folder.mkdir(parents=True, exist_ok=True)
        icon = fg.resize((px, px), Image.Resampling.LANCZOS)
        # Legacy launcher icon receives a solid deep-blue backing.
        base = Image.new("RGBA", (px, px), (8, 11, 18, 255))
        base.alpha_composite(icon)
        base.save(folder / "ic_launcher.png", optimize=True)
        base.save(folder / "ic_launcher_round.png", optimize=True)
    hdpi = res / "mipmap-xxxhdpi"
    fg.save(hdpi / "ic_launcher_foreground.png", optimize=True)
    (res / "mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)
    (res / "mipmap-anydpi-v26/ic_launcher.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '  <background android:drawable="@color/ethvelle_icon_bg" />\n'
        '  <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '</adaptive-icon>\n', encoding="utf-8")
    (res / "mipmap-anydpi-v26/ic_launcher_round.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '  <background android:drawable="@color/ethvelle_icon_bg" />\n'
        '  <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '</adaptive-icon>\n', encoding="utf-8")
    values = res / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "ethvelle_colors.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources><color name="ethvelle_icon_bg">#080B12</color></resources>\n', encoding="utf-8")
    print("Generated Ethvelle legacy + adaptive launcher icon resources.")

if __name__ == "__main__":
    main()
