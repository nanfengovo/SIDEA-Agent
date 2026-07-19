#!/usr/bin/env python3
"""Generate a README hero GIF for the AMR digital-twin dashboard demo."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "screenshots" / "demo-amr-dashboard.gif"


def font(size: int):
    for name in (
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def round_rect(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_frame(t: float) -> Image.Image:
    W, H = 960, 560
    img = Image.new("RGB", (W, H), "#070b16")
    d = ImageDraw.Draw(img, "RGBA")
    f_title = font(22)
    f_small = font(13)
    f_tiny = font(11)

    # Header
    round_rect(d, (16, 12, W - 16, 56), 10, "#0f172a", outline="#1e293b")
    d.text((28, 24), "SIDEA · RCS AMR 任务执行监控大屏", fill="#e2e8f0", font=f_title)
    d.text((W - 210, 28), "SIMULATED · DEMO", fill="#22d3ee", font=f_small)

    # Hero map panel
    map_box = (16, 70, 620, 420)
    round_rect(d, map_box, 12, "#0b1220", outline="#22d3ee")
    d.text((28, 80), "AMR 厂区实时仿真地图", fill="#67e8f9", font=f_small)

    zones = [
        ((30, 110, 250, 280), "存储区 A", "#22d3ee"),
        ((270, 110, 490, 280), "接驳区 B", "#3b82f6"),
        ((510, 110, 600, 200), "充电区", "#10b981"),
        ((510, 220, 600, 400), "缓存区", "#a855f7"),
    ]
    for (x1, y1, x2, y2), name, color in zones:
        fill = color + "22"
        # approximate translucent via dark mix
        d.rectangle((x1, y1, x2, y2), fill="#111827", outline=color)
        d.text((x1 + 8, y1 + 8), name, fill=color, font=f_tiny)

    # Paths
    routes = [
        [(60, 160), (180, 200), (320, 180), (450, 240)],
        [(90, 240), (220, 250), (360, 300), (540, 340)],
        [(140, 140), (280, 160), (400, 220), (560, 160)],
    ]
    for pts in routes:
        # animate dash offset
        for i in range(len(pts) - 1):
            d.line([pts[i], pts[i + 1]], fill="#22d3ee88", width=2)
        # moving arrow blob
        total = len(pts) - 1
        seg = int((t * 3) % total)
        a, b = pts[seg], pts[seg + 1]
        local = (t * 3) % 1.0
        x = a[0] + (b[0] - a[0]) * local
        y = a[1] + (b[1] - a[1]) * local
        d.ellipse((x - 4, y - 4, x + 4, y + 4), fill="#67e8f9")

    robots = [
        ("AMR-01", 80, 180, "#10b981"),
        ("AMR-02", 200, 230, "#10b981"),
        ("AMR-03", 340, 170, "#3b82f6"),
        ("AMR-04", 420, 260, "#ef4444"),
        ("AMR-05", 540, 150, "#fbbf24"),
        ("AMR-06", 300, 320, "#10b981"),
        ("AMR-07", 150, 300, "#3b82f6"),
        ("AMR-08", 480, 360, "#10b981"),
    ]
    for i, (name, x, y, color) in enumerate(robots):
        ox = 8 * math.sin(t * 2 + i)
        oy = 6 * math.cos(t * 2.2 + i * 0.7)
        cx, cy = x + ox, y + oy
        # ripple
        r = 8 + 6 * abs(math.sin(t * 3 + i))
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color)
        d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=color)
        d.text((cx - 14, cy - 18), name, fill="#e2e8f0", font=f_tiny)

    # Right KPI gauges
    round_rect(d, (640, 70, 944, 230), 12, "#0b1220", outline="#334155")
    d.text((656, 82), "稼动率 / 自动化率", fill="#e2e8f0", font=f_small)
    for idx, (label, value, color) in enumerate(
        [("OEE", 0.82 + 0.03 * math.sin(t), "#34d399"), ("Automation", 0.86 + 0.02 * math.cos(t), "#22d3ee")]
    ):
        cx = 720 + idx * 140
        cy = 160
        d.arc((cx - 40, cy - 40, cx + 40, cy + 40), start=140, end=400, fill="#1e293b", width=10)
        end = 140 + int(260 * value)
        d.arc((cx - 40, cy - 40, cx + 40, cy + 40), start=140, end=end, fill=color, width=10)
        d.text((cx - 18, cy - 8), f"{int(value * 100)}%", fill="#e2e8f0", font=f_small)
        d.text((cx - 28, cy + 30), label, fill="#94a3b8", font=f_tiny)

    # Bottom charts
    round_rect(d, (16, 436, 470, 544), 12, "#0b1220", outline="#334155")
    d.text((28, 446), "任务效率趋势", fill="#e2e8f0", font=f_small)
    base_y = 520
    for i in range(8):
        h = 20 + 18 * abs(math.sin(t + i * 0.5))
        x0 = 40 + i * 50
        d.rectangle((x0, base_y - h, x0 + 24, base_y), fill="#3b82f6")
        d.line([(x0 + 12, base_y - h - 8), (x0 + 62, base_y - 30 - 10 * math.sin(t + i))], fill="#22d3ee", width=2)

    round_rect(d, (490, 436, 944, 544), 12, "#0b1220", outline="#334155")
    d.text((506, 446), "机器人状态", fill="#e2e8f0", font=f_small)
    # donut
    cx, cy = 580, 500
    d.ellipse((cx - 36, cy - 36, cx + 36, cy + 36), fill="#10b981")
    d.pieslice((cx - 36, cy - 36, cx + 36, cy + 36), 0, 80, fill="#3b82f6")
    d.pieslice((cx - 36, cy - 36, cx + 36, cy + 36), 80, 120, fill="#fbbf24")
    d.pieslice((cx - 36, cy - 36, cx + 36, cy + 36), 120, 145, fill="#ef4444")
    d.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), fill="#0b1220")
    d.text((640, 472), "运行 18  待机 6", fill="#94a3b8", font=f_tiny)
    d.text((640, 492), "充电 3   故障 1", fill="#94a3b8", font=f_tiny)
    d.text((640, 512), "异常：AMR-04 / 库区C超载", fill="#f87171", font=f_tiny)

    # Activity toast
    alpha = int(180 + 50 * math.sin(t * 4))
    round_rect(d, (640, 250, 944, 410), 12, "#0b1220", outline="#22d3ee")
    d.text((656, 262), "执行链路", fill="#67e8f9", font=f_small)
    steps = [
        "① 识别 RCS / AMR 主题",
        "② 模拟任务 / 车辆 / 负载",
        "③ 导出 ECharts 大屏",
        "④ 输出业务异常解读",
    ]
    for i, s in enumerate(steps):
        active = int((t * 2) % 4) == i
        color = "#22d3ee" if active else "#94a3b8"
        d.text((670, 292 + i * 24), ("▶ " if active else "✓ ") + s, fill=color, font=f_tiny)

    return img.convert("P", palette=Image.ADAPTIVE)


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    frames = [draw_frame(i / 12) for i in range(24)]
    frames[0].save(
        OUT,
        save_all=True,
        append_images=frames[1:],
        duration=90,
        loop=0,
        optimize=True,
    )
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
