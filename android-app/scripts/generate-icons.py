#!/usr/bin/env python3
import argparse
import io
import re
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def logo_url_from_html(html_path):
    try:
        html = Path(html_path).read_text(encoding="utf-8")
    except Exception as exc:
        print("Could not read built HTML to locate Ethvelle logo:", exc)
        return None
    # splashLogoImg is the canonical logo element. applyBrandLogo() assigns the same image to .home-brand-logo-only.
    tag = re.search(r'<img\b[^>]*\bid=["\']splashLogoImg["\'][^>]*>', html, re.IGNORECASE | re.DOTALL)
    if not tag:
        print("Canonical splashLogoImg element was not found; using fallback icon.")
        return None
    src = re.search(r'\bsrc=["\'](https://[^"\']+)["\']', tag.group(0), re.IGNORECASE)
    if not src:
        print("Canonical logo element has no HTTPS image source; using fallback icon.")
        return None
    return src.group(1)

def load_logo(html_path):
    url = logo_url_from_html(html_path)
    if not url:
        return None
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "Ethvelle-Android-Build/1.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            return Image.open(io.BytesIO(response.read())).convert("RGBA")
    except Exception as exc:
        print("Logo download failed; using clean lettermark fallback:", exc)
        return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--res", required=True)
    parser.add_argument("--html", default="www/index.html", help="Built HTML containing the canonical splashLogoImg element")
    args = parser.parse_args()
    res = Path(args.res)
    res.mkdir(parents=True, exist_ok=True)
    logo = load_logo(args.html)

    size = 432
    foreground = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if logo:
        logo.thumbnail((size * 0.70, size * 0.70), Image.Resampling.LANCZOS)
        foreground.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    else:
        draw = ImageDraw.Draw(foreground)
        draw.rounded_rectangle((52, 52, 380, 380), radius=88, fill=(47, 92, 232, 255))
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 250)
        except Exception:
            font = ImageFont.load_default()
        bounds = draw.textbbox((0, 0), "E", font=font)
        width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
        draw.text(((size - width) / 2 - bounds[0], (size - height) / 2 - bounds[1] - 8),
                  "E", font=font, fill=(255, 255, 255, 255))

    density = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for name, pixels in density.items():
        folder = res / ("mipmap-" + name)
        folder.mkdir(parents=True, exist_ok=True)
        icon = foreground.resize((pixels, pixels), Image.Resampling.LANCZOS)
        background = Image.new("RGBA", (pixels, pixels), (8, 11, 18, 255))
        background.alpha_composite(icon)
        background.save(folder / "ic_launcher.png", optimize=True)
        background.save(folder / "ic_launcher_round.png", optimize=True)

    foreground.save(res / "mipmap-xxxhdpi/ic_launcher_foreground.png", optimize=True)
    adaptive = res / "mipmap-anydpi-v26"
    adaptive.mkdir(parents=True, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        (adaptive / name).write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '  <background android:drawable="@color/ethvelle_icon_bg" />\n'
            '  <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
            '</adaptive-icon>\n', encoding="utf-8")
    values = res / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "ethvelle_colors.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources><color name="ethvelle_icon_bg">#080B12</color></resources>\n',
        encoding="utf-8")
    print("Generated Ethvelle legacy + adaptive launcher icons using the v404 HTML logo source (or the clean E fallback).")

if __name__ == "__main__":
    main()
