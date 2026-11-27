#!/usr/bin/env python3
"""从候选稿 11（米白底黑点叠层卡片）生成应用图标与两种托盘图标。

依赖 Pillow。源图在 resources/icon-candidates/11-stacked-cards-cream-black.png，
即用户手绘叠层卡片稿去橙点、改黑点后的 959x921 位图。
"""
from pathlib import Path
import math

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'resources'
SRC = RES / 'icon-candidates' / '11-stacked-cards-cream-black.png'

CREAM = (247, 240, 230, 255)
DARK = (31, 32, 34, 255)


def rounded_mask(size: int, radius_ratio: float = 0.12, ss: int = 4) -> Image.Image:
    """抗锯齿圆角矩形遮罩。"""
    s = size * ss
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(radius_ratio * s), fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def app_icon() -> None:
    """1024² 应用图标：裁米白方块 → 拉伸 → 圆角透明。"""
    im = Image.open(SRC).convert('RGBA').crop((55, 33, 909, 878))
    im = im.resize((1024, 1024), Image.LANCZOS)
    im.putalpha(rounded_mask(1024))
    im.save(RES / 'icon.png')


def tray_windows() -> None:
    """32² Windows 托盘：简化版（米白底 + 单张黑卡片 + 白波浪 + 黑点）。"""
    s = 128
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((4, 4, s - 4, s - 4), radius=26, fill=CREAM)
    card = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle((22, 34, 100, 98), radius=12, fill=DARK)
    img.alpha_composite(card.rotate(-6, resample=Image.BICUBIC))
    d = ImageDraw.Draw(img)
    pts = [(26 + i * (76 / 60), 72 - 8 * math.sin(i / 60.0 * 2 * math.pi)) for i in range(61)]
    d.line(pts, fill=CREAM, width=7, joint='curve')
    for x, y in pts[::6]:
        d.ellipse((x - 3.5, y - 3.5, x + 3.5, y + 3.5), fill=CREAM)
    d.ellipse((100, 20, 120, 40), fill=DARK)
    img.resize((32, 32), Image.LANCZOS).save(RES / 'trayWindows.png')


def tray_template() -> None:
    """44² macOS 托盘模板：深色图形剪影，纯黑 + alpha，系统自动反色。"""
    import numpy as np
    im = Image.open(SRC).convert('RGB').crop((55, 33, 909, 878))
    small = np.asarray(im.resize((44, 44), Image.LANCZOS)).astype(float)
    alpha = np.clip((180.0 - small.mean(axis=2)) / 90.0, 0.0, 1.0)
    out = np.zeros((44, 44, 4), dtype=np.uint8)
    out[:, :, 3] = (alpha * 255).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(RES / 'trayTemplate.png')


if __name__ == '__main__':
    app_icon()
    tray_windows()
    tray_template()
    print('icons written')
