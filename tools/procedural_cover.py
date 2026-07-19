"""离线程序化封面生成器（无需任何生图模型）。

用 Pillow 程序化绘制"深色工业科幻风"封面：渐变背景、透视网格地面、
全息圆环、机械臂剪影、HUD 数据面板、辉光与噪点，最后叠加标题文字。
供 generate_image 在无网络/无生图服务时降级使用。
"""
from __future__ import annotations

import math
import random
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SANDBOX_DIR = Path(__file__).parent.parent / "sandbox_workspace"

# 深色工业科幻配色
BG_TOP = (6, 10, 22)
BG_BOTTOM = (10, 22, 44)
ACCENT = (64, 180, 255)      # 全息蓝
ACCENT_DIM = (30, 90, 160)
STEEL_DARK = (18, 24, 34)
STEEL_MID = (34, 44, 60)
STEEL_EDGE = (70, 90, 115)

_CJK_FONTS = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]
_LATIN_FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _load_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _vertical_gradient(w: int, h: int, top: tuple, bottom: tuple) -> Image.Image:
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def _draw_perspective_grid(draw: ImageDraw.ImageDraw, w: int, h: int, horizon: int):
    """地面透视网格：从地平线向下发散"""
    vpx = w // 2
    for i in range(-14, 15):
        x_far = vpx + i * 60
        x_near = vpx + i * 300
        draw.line([(x_far, horizon), (x_near, h)], fill=(*ACCENT_DIM, 60), width=1)
    y = horizon
    step = 6
    while y < h:
        alpha = int(20 + 60 * (y - horizon) / max(h - horizon, 1))
        draw.line([(0, y), (w, y)], fill=(*ACCENT_DIM, alpha), width=1)
        step *= 1.35
        y += int(step)


def _glow_ellipse(base: Image.Image, xy: tuple, color: tuple, blur: int, width: int = 4):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(xy, outline=(*color, 220), width=width)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(layer)
    d2 = ImageDraw.Draw(base)
    d2.ellipse(xy, outline=(*color, 255), width=max(1, width // 2))


def _draw_hologram(base: Image.Image, cx: int, cy: int, r: int):
    """同心全息圆环 + 刻度 + 中心光柱"""
    draw = ImageDraw.Draw(base)
    # 底部光晕
    halo = Image.new("RGBA", base.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse([cx - r, cy - r // 3, cx + r, cy + r // 3], fill=(*ACCENT, 70))
    halo = halo.filter(ImageFilter.GaussianBlur(40))
    base.alpha_composite(halo)

    # 椭圆环（透视压扁）
    for k, (rr, wl) in enumerate([(r, 4), (int(r * 0.72), 3), (int(r * 0.45), 2)]):
        _glow_ellipse(base, [cx - rr, cy - rr // 3, cx + rr, cy + rr // 3], ACCENT, 8 - 2 * k, wl)

    # 刻度
    for a in range(0, 360, 12):
        rad = math.radians(a)
        x1 = cx + math.cos(rad) * r * 0.95
        y1 = cy + math.sin(rad) * r * 0.95 / 3
        x2 = cx + math.cos(rad) * r * 1.05
        y2 = cy + math.sin(rad) * r * 1.05 / 3
        draw.line([(x1, y1), (x2, y2)], fill=(*ACCENT, 160), width=2)

    # 中心光柱
    beam = Image.new("RGBA", base.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(beam)
    bh = int(r * 1.9)
    bd.polygon(
        [(cx - r * 0.34, cy), (cx + r * 0.34, cy), (cx + r * 0.14, cy - bh), (cx - r * 0.14, cy - bh)],
        fill=(*ACCENT, 60),
    )
    beam = beam.filter(ImageFilter.GaussianBlur(14))
    base.alpha_composite(beam)

    # 悬浮核心（六边形）
    core_r = r * 0.34
    core_y = cy - int(r * 1.05)
    # 核心光晕
    cglow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    cgd = ImageDraw.Draw(cglow)
    cgd.ellipse([cx - core_r * 1.5, core_y - core_r * 1.5, cx + core_r * 1.5, core_y + core_r * 1.5],
                fill=(*ACCENT, 80))
    cglow = cglow.filter(ImageFilter.GaussianBlur(24))
    base.alpha_composite(cglow)
    pts = []
    for a in range(0, 360, 60):
        rad = math.radians(a + 30)
        pts.append((cx + math.cos(rad) * core_r, core_y + math.sin(rad) * core_r))
    core = Image.new("RGBA", base.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(core)
    cd.polygon(pts, outline=(*ACCENT, 255), fill=(*ACCENT, 60))
    core = core.filter(ImageFilter.GaussianBlur(1))
    base.alpha_composite(core)
    d = ImageDraw.Draw(base)
    d.polygon(pts, outline=(200, 235, 255, 255), width=2)
    for a in range(0, 360, 60):
        rad = math.radians(a + 30)
        d.line(
            [(cx, core_y), (cx + math.cos(rad) * core_r, core_y + math.sin(rad) * core_r)],
            fill=(*ACCENT, 200), width=2,
        )


def _rot(p, c, ang):
    s, co = math.sin(ang), math.cos(ang)
    return (c[0] + (p[0] - c[0]) * co - (p[1] - c[1]) * s,
            c[1] + (p[0] - c[0]) * s + (p[1] - c[1]) * co)


def _draw_arm_segment(draw, p1, p2, w1, w2, fill, edge):
    """从 p1 到 p2 的锥形臂节"""
    ang = math.atan2(p2[1] - p1[1], p2[0] - p1[0]) + math.pi / 2
    dx1, dy1 = math.cos(ang) * w1, math.sin(ang) * w1
    dx2, dy2 = math.cos(ang) * w2, math.sin(ang) * w2
    poly = [(p1[0] + dx1, p1[1] + dy1), (p2[0] + dx2, p2[1] + dy2),
            (p2[0] - dx2, p2[1] - dy2), (p1[0] - dx1, p1[1] - dy1)]
    draw.polygon(poly, fill=fill, outline=edge)


def _draw_robot_arm(base: Image.Image, ox: int, oy: int, scale: float, target: tuple):
    """右侧大型机械臂剪影，末端指向 target"""
    draw = ImageDraw.Draw(base)
    fill = (*STEEL_MID, 255)
    dark = (*STEEL_DARK, 255)
    edge = (*STEEL_EDGE, 255)

    # 底座
    bw = int(150 * scale)
    draw.polygon(
        [(ox - bw, oy), (ox + bw, oy), (ox + int(bw * 0.7), oy - int(60 * scale)),
         (ox - int(bw * 0.7), oy - int(60 * scale))],
        fill=dark, outline=edge,
    )
    j0 = (ox, oy - int(90 * scale))
    draw.ellipse([j0[0] - 46 * scale, j0[1] - 46 * scale, j0[0] + 46 * scale, j0[1] + 46 * scale],
                 fill=fill, outline=edge, width=2)

    # 大臂（向上向左）
    j1 = (ox - int(190 * scale), oy - int(420 * scale))
    _draw_arm_segment(draw, j0, j1, 40 * scale, 30 * scale, fill, edge)
    draw.ellipse([j1[0] - 36 * scale, j1[1] - 36 * scale, j1[0] + 36 * scale, j1[1] + 36 * scale],
                 fill=dark, outline=edge, width=2)

    # 小臂（伸向目标上方）
    j2 = (target[0] + int(130 * scale), target[1] - int(260 * scale))
    _draw_arm_segment(draw, j1, j2, 26 * scale, 18 * scale, fill, edge)
    draw.ellipse([j2[0] - 24 * scale, j2[1] - 24 * scale, j2[0] + 24 * scale, j2[1] + 24 * scale],
                 fill=fill, outline=edge, width=2)

    # 腕部 + 夹爪（指向全息核心）
    j3 = (target[0] + int(30 * scale), target[1] - int(150 * scale))
    _draw_arm_segment(draw, j2, j3, 14 * scale, 10 * scale, dark, edge)
    claw_l = (j3[0] - 26 * scale, j3[1] + 44 * scale)
    claw_r = (j3[0] + 30 * scale, j3[1] + 40 * scale)
    draw.line([j3, claw_l], fill=edge, width=max(2, int(6 * scale)))
    draw.line([j3, claw_r], fill=edge, width=max(2, int(6 * scale)))

    # 液压管线
    draw.line([(j0[0] + 24 * scale, j0[1]), (j1[0] + 20 * scale, j1[1] + 10 * scale)],
              fill=(*ACCENT_DIM, 200), width=max(2, int(4 * scale)))
    draw.line([(j1[0], j1[1] - 20 * scale), (j2[0], j2[1] - 12 * scale)],
              fill=(*ACCENT_DIM, 200), width=max(1, int(3 * scale)))

    # 关节警示灯
    for j in (j0, j1, j2):
        draw.ellipse([j[0] - 6, j[1] - 6, j[0] + 6, j[1] + 6], fill=(*ACCENT, 255))

    # 末端工作光点
    tip = Image.new("RGBA", base.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(tip)
    td.ellipse([j3[0] - 18, j3[1] + 30, j3[0] + 18, j3[1] + 66], fill=(*ACCENT, 200))
    tip = tip.filter(ImageFilter.GaussianBlur(10))
    base.alpha_composite(tip)


def _draw_hud_panel(base: Image.Image, x: int, y: int, w: int, h: int, seed: int):
    """左侧半透明 HUD 数据面板"""
    rng = random.Random(seed)
    panel = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle([x, y, x + w, y + h], radius=10, fill=(*ACCENT, 26), outline=(*ACCENT, 140), width=2)
    # 角标
    for cx, cy, dx, dy in [(x, y, 1, 1), (x + w, y, -1, 1), (x, y + h, 1, -1), (x + w, y + h, -1, -1)]:
        d.line([(cx, cy), (cx + dx * 22, cy)], fill=(*ACCENT, 255), width=3)
        d.line([(cx, cy), (cx, cy + dy * 22)], fill=(*ACCENT, 255), width=3)
    # 环形仪表
    gx, gy, gr = x + 70, y + 80, 42
    d.arc([gx - gr, gy - gr, gx + gr, gy + gr], 90, 90 + int(rng.uniform(180, 320)), fill=(*ACCENT, 230), width=6)
    d.arc([gx - gr + 12, gy - gr + 12, gx + gr - 12, gy + gr - 12], 0, 360, fill=(*ACCENT, 90), width=2)
    # 迷你柱状图
    bx = x + 150
    for i in range(8):
        bh = int(rng.uniform(12, 66))
        d.rectangle([bx + i * 22, y + 120 - bh, bx + i * 22 + 12, y + 120], fill=(*ACCENT, 150 + rng.randint(0, 100)))
    # 数据行
    for i in range(4):
        ly = y + 150 + i * 22
        d.line([(x + 24, ly), (x + 24 + int(rng.uniform(80, w - 60)), ly)], fill=(*ACCENT, 90), width=6)
    panel = panel.filter(ImageFilter.GaussianBlur(0.6))
    base.alpha_composite(panel)


def _add_particles(base: Image.Image, n: int, seed: int, horizon: int):
    rng = random.Random(seed)
    d = ImageDraw.Draw(base)
    w, h = base.size
    for _ in range(n):
        x, y = rng.uniform(0, w), rng.uniform(0, horizon * 1.2)
        r = rng.uniform(0.5, 2.2)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(*ACCENT, rng.randint(40, 160)))


def _vignette(img: Image.Image) -> Image.Image:
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([-w * 0.35, -h * 0.35, w * 1.35, h * 1.35], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(150))
    black = Image.new("RGB", (w, h), (0, 0, 0))
    return Image.composite(img, black, mask)


def generate_cover(
    title_zh: str,
    title_en: str = "",
    subtitle: str = "",
    width: int = 1536,
    height: int = 1024,
    seed: int | None = None,
) -> str:
    """程序化生成深色工业科幻封面，返回相对路径 sandbox_workspace/xxx.png"""
    seed = seed if seed is not None else int(time.time())
    horizon = int(height * 0.62)

    bg = _vertical_gradient(width, height, BG_TOP, BG_BOTTOM).convert("RGBA")
    draw = ImageDraw.Draw(bg)

    # 远景厂房剪影
    rng = random.Random(seed)
    x = -40
    while x < width:
        bw = int(rng.uniform(90, 220))
        bh = int(rng.uniform(30, 130))
        draw.rectangle([x, horizon - bh, x + bw, horizon], fill=(*STEEL_DARK, 255))
        if rng.random() < 0.5:  # 塔吊/烟囱
            tx = x + bw // 2
            draw.rectangle([tx - 4, horizon - bh - int(rng.uniform(20, 60)), tx + 4, horizon - bh],
                           fill=(*STEEL_DARK, 255))
        # 零星窗灯
        for _ in range(int(bw * bh / 900)):
            wx, wy = rng.uniform(x + 6, x + bw - 8), rng.uniform(horizon - bh + 6, horizon - 8)
            draw.rectangle([wx, wy, wx + 3, wy + 3], fill=(*ACCENT, rng.randint(60, 150)))
        x += bw + int(rng.uniform(10, 60))

    _draw_perspective_grid(draw, width, height, horizon)

    # 全息核心（中偏左）
    holo_cx, holo_cy = int(width * 0.42), int(height * 0.80)
    holo_r = int(height * 0.22)
    _draw_hologram(bg, holo_cx, holo_cy, holo_r)

    # 机械臂（右侧，末端对准悬浮核心）
    core_pos = (holo_cx, holo_cy - int(holo_r * 1.05))
    _draw_robot_arm(bg, int(width * 0.88), height, height / 1024.0, core_pos)

    # HUD 面板（左侧）
    _draw_hud_panel(bg, int(width * 0.045), int(height * 0.30), int(width * 0.24), int(height * 0.26), seed)

    _add_particles(bg, 90, seed, horizon)

    # 顶部横向扫描光带
    band = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bd.rectangle([0, int(height * 0.055), width, int(height * 0.06)], fill=(*ACCENT, 60))
    band = band.filter(ImageFilter.GaussianBlur(3))
    bg.alpha_composite(band)

    # ---- 标题文字 ----
    d = ImageDraw.Draw(bg)
    t_size = max(40, int(width / max(len(title_zh), 8) * 0.95))
    t_size = min(t_size, int(height * 0.085))
    f_zh = _load_font(_CJK_FONTS, t_size)
    tw = d.textlength(title_zh, font=f_zh)
    tx, ty = (width - tw) / 2, int(height * 0.10)
    # 文字辉光
    glow = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.text((tx, ty), title_zh, font=f_zh, fill=(*ACCENT, 190))
    glow = glow.filter(ImageFilter.GaussianBlur(10))
    bg.alpha_composite(glow)
    d.text((tx, ty), title_zh, font=f_zh, fill=(235, 246, 255, 255))

    y_cursor = ty + t_size + int(height * 0.015)
    if title_en:
        f_en = _load_font(_LATIN_FONTS, int(t_size * 0.38))
        ew = d.textlength(title_en.upper(), font=f_en)
        d.text(((width - ew) / 2, y_cursor), title_en.upper(), font=f_en, fill=(*ACCENT, 230))
        y_cursor += int(t_size * 0.55)

    # 标题两侧装饰线
    line_y = y_cursor + 8
    lw = int(width * 0.16)
    for sx in (int(width / 2 - lw - 30), int(width / 2 + 30)):
        d.line([(sx, line_y), (sx + lw, line_y)], fill=(*ACCENT, 180), width=2)
        d.polygon([(sx + lw if sx < width / 2 else sx, line_y - 4),
                   (sx + lw + 8 if sx < width / 2 else sx - 8, line_y),
                   (sx + lw if sx < width / 2 else sx, line_y + 4)], fill=(*ACCENT, 220))

    if subtitle:
        f_sub = _load_font(_CJK_FONTS, int(t_size * 0.30))
        sw = d.textlength(subtitle, font=f_sub)
        d.text(((width - sw) / 2, line_y + 16), subtitle, font=f_sub, fill=(170, 200, 230, 220))

    out = _vignette(bg.convert("RGB"))

    SANDBOX_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"cover_{int(time.time() * 1000)}.png"
    out.save(SANDBOX_DIR / filename, "PNG")
    return f"sandbox_workspace/{filename}"
