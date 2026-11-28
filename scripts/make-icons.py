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
    """macOS 菜单栏托盘模板：18pt 画布 + 同名 @2x 高清版。

    菜单栏图标的标准高度是 18pt。早先出的是 44²，系统按 44pt 去画，图标会顶出菜单栏、
    还会把相邻的状态项挤开。这里按 18/36 各出一张（Electron 认同目录的 @2x），图形取候选稿
    的深色剪影，并抹掉右上角那颗小圆点——18pt 下它只会变成一粒脏点。
    """
    ink = Image.open(SRC).convert('RGB').crop((55, 33, 909, 878))
    # 亮度 → alpha：米白底与细描边归零，只有卡片本身的深色留下（模板图只看 alpha）
    mask = ink.convert('L').point(lambda v: 255 if v <= 60 else max(0, int((215 - v) / 155 * 255)))
    mask.paste(0, (700, 230, 810, 330))  # 右上角独立圆点（原图坐标 775,276-851,348）
    glyph = mask.crop(mask.getbbox())

    def render(size: int, content: int, path: Path, boost: bool) -> None:
        gw, gh = glyph.size
        scale = content / max(gw, gh)
        w, h = max(1, round(gw * scale)), max(1, round(gh * scale))
        # 先在 4 倍尺寸上缩放再落回目标像素，边缘更干净
        small = glyph.resize((w * 4, h * 4), Image.LANCZOS).resize((w, h), Image.LANCZOS)
        if boost:
            # 1x 下卡片之间的细描边会糊成灰雾，提一档对比保住层次
            small = small.point(lambda v: 0 if v < 45 else (255 if v > 165 else int((v - 45) * 255 / 120)))
        plate = Image.new('L', (size, size), 0)
        plate.paste(small, ((size - w) // 2, (size - h) // 2))
        Image.merge('RGBA', [Image.new('L', plate.size, 0)] * 3 + [plate]).save(path)

    render(18, 18, RES / 'trayTemplate.png', True)
    render(36, 36, RES / 'trayTemplate@2x.png', False)


if __name__ == '__main__':
    app_icon()
    tray_windows()
    tray_template()
    print('icons written')
