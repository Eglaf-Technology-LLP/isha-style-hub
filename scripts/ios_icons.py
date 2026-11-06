"""iOS app icon + launch logo from the AB monogram in assets/logo.png.

Run: npm run ios:icons   (re-run after the logo changes)

Matches Android: maroon AB mark on ivory (ic_launcher), and the launch
screen's 180pt mark (drawable/launch_screen.xml + splash_logo.png).
"""
import json
import os

from PIL import Image, ImageChops

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
IVORY = (0xFC, 0xFB, 0xF8)
MAROON = (0x4E, 0x1D, 0x13)  # ink of the Android ic_launcher / splash_logo
os.chdir(ROOT)


def bbox_ratio(path, bg):
    """Share of the canvas the mark spans (w, h) in an Android image."""
    im = Image.open(path).convert("RGBA")
    if bg is None:  # transparent background: use alpha
        box = im.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
    else:
        flat = Image.new("RGBA", im.size, bg + (255,))
        flat.alpha_composite(im)
        diff = ImageChops.difference(flat.convert("RGB"), Image.new("RGB", im.size, bg))
        box = diff.convert("L").point(lambda v: 255 if v > 40 else 0).getbbox()
    w, h = im.size
    return (box[2] - box[0]) / w, (box[3] - box[1]) / h, box


# 1. The monogram, as an alpha mask, from the black-on-white wordmark logo.
logo = Image.open("assets/logo.png").convert("RGBA").getchannel("A")  # ink = alpha
W, H = logo.size
dark = logo.point(lambda v: 255 if v > 128 else 0)
cols = [dark.crop((x, 0, x + 1, H)).getbbox() is not None for x in range(W)]
# first run of 12+ empty columns after the mark starts = gap before "AllBoutiqs"
start = cols.index(True)
x, gap_at = start, None
while x < W:
    if not any(cols[x:x + 12]):
        gap_at = x
        break
    x += 1
assert gap_at and gap_at < W * 0.45, gap_at
region = logo.crop((0, 0, gap_at, H))
# alpha = coverage; drop faint specks
alpha = region.point(lambda v: 0 if v < 12 else v)
mbox = alpha.getbbox()
alpha = alpha.crop(mbox)
print("monogram from logo.png:", mbox, "size", alpha.size)

# Upscale the mask once (high quality) and reuse it for every size.
MASTER = 2048
scale = MASTER / max(alpha.size)
master = alpha.resize((round(alpha.size[0] * scale), round(alpha.size[1] * scale)), Image.LANCZOS)


def mark_on(canvas_px, width_ratio, bg):
    """Monogram centred on a square canvas, mark width = width_ratio * canvas."""
    mw = round(canvas_px * width_ratio)
    mh = round(mw * master.size[1] / master.size[0])
    mask = master.resize((mw, mh), Image.LANCZOS)
    if bg is None:
        out = Image.new("RGBA", (canvas_px, canvas_px), MAROON + (0,))
        layer = Image.new("RGBA", (mw, mh), MAROON + (255,))
        layer.putalpha(mask)
        out.alpha_composite(layer, ((canvas_px - mw) // 2, (canvas_px - mh) // 2))
        return out
    out = Image.new("RGB", (canvas_px, canvas_px), bg)
    out.paste(Image.new("RGB", (mw, mh), MAROON), ((canvas_px - mw) // 2, (canvas_px - mh) // 2), mask)
    return out  # RGB: App Store rejects app icons with an alpha channel


# 2. Same proportions as Android.
icon_w, icon_h, icon_box = bbox_ratio("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", IVORY)
splash_w, splash_h, splash_box = bbox_ratio("android/app/src/main/res/drawable/splash_logo.png", None)
print(f"android ic_launcher mark: {icon_w:.3f} x {icon_h:.3f} {icon_box}")
print(f"android splash_logo mark: {splash_w:.3f} x {splash_h:.3f} {splash_box}")

# 3. App icon set (every slot in the existing Contents.json gets its own file).
icon_dir = "ios/AllBoutiqs/Images.xcassets/AppIcon.appiconset"
contents = json.load(open(f"{icon_dir}/Contents.json"))
big = mark_on(1024, icon_w, IVORY)
for img in contents["images"]:
    pt = float(img["size"].split("x")[0])
    sc = int(img["scale"].rstrip("x"))
    px = round(pt * sc)
    name = f"icon-{img['size'].split('x')[0]}@{sc}x.png"
    (big if px == 1024 else big.resize((px, px), Image.LANCZOS)).save(f"{icon_dir}/{name}", optimize=True)
    img["filename"] = name
json.dump(contents, open(f"{icon_dir}/Contents.json", "w"), indent=2)

# 4. Launch logo: 180pt square, transparent, like splash_logo.png on Android.
launch_dir = "ios/AllBoutiqs/Images.xcassets/LaunchLogo.imageset"
os.makedirs(launch_dir, exist_ok=True)
images = []
for sc in (1, 2, 3):
    name = f"launch-logo@{sc}x.png"
    mark_on(180 * sc, splash_w, None).save(f"{launch_dir}/{name}", optimize=True)
    images.append({"idiom": "universal", "filename": name, "scale": f"{sc}x"})
json.dump({"images": images, "info": {"author": "xcode", "version": 1}}, open(f"{launch_dir}/Contents.json", "w"), indent=2)

print("ok", [i["filename"] for i in contents["images"]])
