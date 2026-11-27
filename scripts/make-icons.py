#!/usr/bin/env python3
"""Generate the app icon (1024²) and the macOS tray template (44²) without any image library."""
import struct
import zlib
from math import hypot


def write_png(path, width, height, pixels):
    raw = b''.join(b'\x00' + bytes(pixels[y * width * 4:(y + 1) * width * 4]) for y in range(height))

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as fh:
        fh.write(png)


def coverage(distance, radius, feather=1.0):
    """Anti-aliased 0..1 coverage for a filled disc edge."""
    return max(0.0, min(1.0, (radius - distance) / feather + 0.5))


def rounded_rect_alpha(x, y, size, radius, feather=1.0):
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    d = hypot(x - cx, y - cy)
    return max(0.0, min(1.0, (radius - d) / feather + 0.5))


def app_icon(path, size=1024):
    radius = size * 0.22
    dots = [(0.33, 0.67, 0.085), (0.50, 0.50, 0.062), (0.67, 0.33, 0.040)]
    px = bytearray(size * size * 4)
    for y in range(size):
        t = y / (size - 1)
        bg = (int(31 + 40 * t), int(111 + 20 * t), int(235 + 10 * t))
        for x in range(size):
            a = rounded_rect_alpha(x + 0.5, y + 0.5, size, radius)
            if a <= 0:
                continue
            r, g, b = bg
            for dx, dy, dr in dots:
                c = coverage(hypot(x + 0.5 - dx * size, y + 0.5 - dy * size), dr * size)
                if c > 0:
                    r = int(r + (255 - r) * c)
                    g = int(g + (255 - g) * c)
                    b = int(b + (255 - b) * c)
            i = (y * size + x) * 4
            px[i:i + 4] = bytes((r, g, b, int(a * 255)))
    write_png(path, size, size, px)


def tray_template(path, size=44):
    dots = [(0.32, 0.68, 0.105), (0.50, 0.50, 0.078), (0.68, 0.32, 0.052)]
    px = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            alpha = 0.0
            for dx, dy, dr in dots:
                alpha = max(alpha, coverage(hypot(x + 0.5 - dx * size, y + 0.5 - dy * size), dr * size))
            i = (y * size + x) * 4
            px[i:i + 4] = bytes((0, 0, 0, int(alpha * 255)))
    write_png(path, size, size, px)


def tray_windows(path, size=32):
    """Windows 托盘图标：蓝色圆底 + 白点，浅色/深色任务栏都清晰（macOS 仍用模板图）。"""
    dots = [(0.32, 0.68, 0.105), (0.50, 0.50, 0.078), (0.68, 0.32, 0.052)]
    px = bytearray(size * size * 4)
    for y in range(size):
        t = y / (size - 1)
        bg = (int(31 + 40 * t), int(111 + 20 * t), int(235 + 10 * t))
        for x in range(size):
            a = coverage(hypot(x + 0.5 - size / 2, y + 0.5 - size / 2), size * 0.48, 1.0)
            if a <= 0:
                continue
            r, g, b = bg
            for dx, dy, dr in dots:
                c = coverage(hypot(x + 0.5 - dx * size, y + 0.5 - dy * size), dr * size)
                if c > 0:
                    r = int(r + (255 - r) * c)
                    g = int(g + (255 - g) * c)
                    b = int(b + (255 - b) * c)
            i = (y * size + x) * 4
            px[i:i + 4] = bytes((r, g, b, int(a * 255)))
    write_png(path, size, size, px)


if __name__ == '__main__':
    app_icon('resources/icon.png')
    tray_template('resources/trayTemplate.png')
    tray_windows('resources/trayWindows.png')
    print('icons written')
