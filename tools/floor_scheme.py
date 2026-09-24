"""Схема этажа из viewer/house.json в SVG — чтобы рисовать поверх от руки.

python3 tools/floor_scheme.py 1 out.svg [--blank]
  1        — индекс этажа (0 = первый)
  --blank  — без текущих перегородок
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
house = json.loads((ROOT / 'viewer' / 'house.json').read_text())

args = [a for a in sys.argv[1:] if not a.startswith('--')]
floor_idx, out = int(args[0]), Path(args[1])
blank = '--blank' in sys.argv
floor = house['floors'][floor_idx]

S = 70           # px на метр
OX, OY = 130, 290  # положение точки [0, 0]
W, H = 1400, 1080
AXES_X = [('1', 0), ('2', 3.1), ('3', 7.1), ('4', 11.5), ('5', 15.6)]
AXES_Y = [('В', 0), ('Б', 8.1), ('А', 9.1)]


def P(x, y):
    return OX + x * S, OY + y * S


el = []
add = el.append


def line(x1, y1, x2, y2, **kw):
    a, b = P(x1, y1), P(x2, y2)
    attrs = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    add(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" {attrs}/>')


def text(x, y, s, size=14, anchor='middle', **kw):
    px, py = P(x, y)
    attrs = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    add(f'<text x="{px:.1f}" y="{py:.1f}" font-size="{size}" text-anchor="{anchor}" {attrs}>{s}</text>')


def poly(pts, **kw):
    attrs = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    d = ' '.join(f'{P(x, y)[0]:.1f},{P(x, y)[1]:.1f}' for x, y in pts)
    add(f'<polygon points="{d}" {attrs}/>')


# Сетка 1 м
for i in range(-1, 18):
    line(i, -1.2, i, 10, stroke='#e3e8ee', stroke_width=1)
for j in range(-1, 11):
    line(-0.6, j, 16.6, j, stroke='#e3e8ee', stroke_width=1)

# Оси
for name, x in AXES_X:
    line(x, -1.6, x, 9.9, stroke='#9aa7b4', stroke_width=1, stroke_dasharray='14 4 2 4')
    cx, cy = P(x, 10.35)
    add(f'<circle cx="{cx}" cy="{cy}" r="15" fill="#fff" stroke="#566"/>')
    text(x, 10.35 + 5 / S, name, 16)
for name, y in AXES_Y:
    line(-1.2, y, 16.3, y, stroke='#9aa7b4', stroke_width=1, stroke_dasharray='14 4 2 4')
    cx, cy = P(-1.5, y)
    add(f'<circle cx="{cx}" cy="{cy}" r="15" fill="#fff" stroke="#566"/>')
    text(-1.5, y + 5 / S, name, 16)

# Размеры между осями (снизу)
for (_, a), (_, b) in zip(AXES_X, AXES_X[1:]):
    line(a, 9.75, b, 9.75, stroke='#566', stroke_width=1)
    text((a + b) / 2, 9.68, f'{round((b - a) * 1000)}', 13, fill='#344')

# Линии высоты мансарды: где потолок (низ кровли) = 2,2 м от пола
h22 = 0
for roof in house.get('roofs', []):
    if roof.get('clip') != 'main':
        continue
    (x0, ry, rh), (x1, _, _), (_, ey, eh), _ = roof['corners']
    target = floor['elevation'] + 2.2
    if not min(rh, eh) <= target <= max(rh, eh):
        continue
    y = ry + (ey - ry) * (rh - target) / (rh - eh)
    h22 += 1
    line(max(x0, 3.1), y, min(x1, 15.6), y, stroke='#d08a2a', stroke_width=1.5, stroke_dasharray='6 5')
    text(min(x1, 15.6) + 0.1, y + 0.1, 'h=2,2', 12, anchor='start', fill='#b06f10')

# Проём лестницы
for hole in floor.get('holes', []):
    poly(hole, fill='url(#hatch)', stroke='#6b7785', stroke_width=1.2)
    xs = [p[0] for p in hole]
    ys = [p[1] for p in hole]
    text(sum(xs) / len(xs), sum(ys) / len(ys), 'лестница', 13, fill='#445',
         transform=f'rotate(-90 {P(sum(xs) / len(xs), sum(ys) / len(ys))[0]} {P(sum(xs) / len(xs), sum(ys) / len(ys))[1]})')

# Дымоход (сечение на уровне пола этажа)
for s in house.get('solids', []):
    if 'Дымоход' in s.get('name', '') and 'top' in s:
        b, t = s['bottom'], s['top']
        k = (floor['elevation'] - b['h']) / (t['h'] - b['h'])
        r = [bv + (tv - bv) * k for bv, tv in zip(b['rect'], t['rect'])]
        poly([(r[0], r[2]), (r[1], r[2]), (r[1], r[3]), (r[0], r[3])], fill='#9b9186', stroke='#555')

# Стены
openings = floor.get('openings', [])
win_no = 0
door_no = 0
for w in floor['walls']:
    if w.get('virtual'):
        continue
    glass = w.get('material') == 'glass'
    if glass:
        w = {**w, 'thickness': 0.08}
    exterior = w.get('thickness', 0.3) >= 0.25 or glass
    if blank and not exterior:
        continue
    (x1, y1), (x2, y2) = w['from'], w['to']
    L = math.hypot(x2 - x1, y2 - y1)
    ux, uy = (x2 - x1) / L, (y2 - y1) / L
    t = w.get('thickness', 0.3)
    ext = t / 2 if exterior else 0
    ops = sorted((o for o in openings if o['wall'] == w.get('id')), key=lambda o: o['offset'])
    cuts, cur = [], -ext
    for o in ops:
        cuts.append((cur, o['offset']))
        cur = o['offset'] + o['width']
    cuts.append((cur, L + ext))
    color = '#7fb3e0' if glass else '#1d2733' if exterior else '#8c97a3'
    width = t * S
    for a, b in cuts:
        if b - a > 1e-3:
            line(x1 + ux * a, y1 + uy * a, x1 + ux * b, y1 + uy * b,
                 stroke=color, stroke_width=f'{width:.1f}', stroke_linecap='butt',
                 **({} if exterior else {'stroke_dasharray': '10 5'}))
    for o in ops:
        a, b = o['offset'], o['offset'] + o['width']
        ax, ay, bx, by = x1 + ux * a, y1 + uy * a, x1 + ux * b, y1 + uy * b
        nx, ny = -uy, ux  # нормаль
        mx, my = (ax + bx) / 2, (ay + by) / 2
        if o['type'] == 'door' and not exterior:
            if blank:
                continue
            line(ax, ay, bx, by, stroke='#8c97a3', stroke_width=2)
            continue
        if o['type'] == 'door':
            door_no += 1
            line(ax, ay, bx, by, stroke='#a0692e', stroke_width=f'{max(width, 6):.1f}', stroke_linecap='butt')
            off = 0.5
            side = 1 if (mx + nx * off - 9) ** 2 + (my + ny * off - 4) ** 2 > (mx - 9) ** 2 + (my - 4) ** 2 else -1
            text(mx + nx * off * side, my + ny * off * side + 0.08, f'Д{door_no}', 15, fill='#8a5a2b', font_weight='bold')
            text(mx + nx * off * side, my + ny * off * side + 0.34, f'{round(o["width"] * 1000)}', 11, fill='#8a5a2b')
            continue
        win_no += 1
        line(ax, ay, bx, by, stroke='#2a7fc9', stroke_width=f'{max(width, 6):.1f}', stroke_linecap='butt')
        line(ax, ay, bx, by, stroke='#fff', stroke_width=2)
        off = 0.55 if (mx < 5 or mx > 14) else 0.45
        side = 1 if (mx + nx * off - 9) ** 2 + (my + ny * off - 4) ** 2 > (mx - 9) ** 2 + (my - 4) ** 2 else -1
        if my + ny * off * side > 9.3:  # не залезать на размерную линию
            side = -side
        text(mx + nx * off * side, my + ny * off * side + 0.08, f'О{win_no}', 15, fill='#1d5f99', font_weight='bold')
        text(mx + nx * off * side, my + ny * off * side + 0.34,
             f'{round(o["width"] * 1000)}', 11, fill='#1d5f99')

# Мансардные окна (проекция на план)
sky = 0
is_top = floor_idx == len(house['floors']) - 1
for roof in house.get('roofs', []) if is_top else []:
    for wnd in roof.get('windows', []):
        sky += 1
        (a, b), (c, d) = wnd['x'], wnd['y']
        poly([(a, c), (b, c), (b, d), (a, d)], fill='none', stroke='#2a7fc9', stroke_width=1.5, stroke_dasharray='5 3')
        text((a + b) / 2, (c + d) / 2 + 0.08, f'М{sky}', 13, fill='#1d5f99', font_weight='bold')

# Подписи помещений
if not blank:
    for r in floor.get('rooms', []):
        if 'at' in r:
            cx, cy = r['at']
        else:
            cx, cy = r.get('label') or [sum(p[0] for p in r['polygon']) / len(r['polygon']),
                                        sum(p[1] for p in r['polygon']) / len(r['polygon'])]
        text(cx, cy, r['name'], 14, fill='#556')

title = f'{floor["name"]} — {"пустая схема" if blank else "текущие перегородки (пунктир)"}'
legend = [
    ('#1d2733', 'наружные стены 300 мм'),
    ('#2a7fc9', 'окна и витражи (О)' + (', мансардные окна (М, пунктир)' if floor_idx == len(house['floors']) - 1 else '')),
    ('#a0692e', 'наружные двери (Д)'),
]
if h22:
    legend.append(('#d08a2a', 'линия высоты 2,2 м под скатом крыши'))
if not blank:
    legend.insert(1, ('#8c97a3', 'перегородки сейчас — можно зачеркнуть и нарисовать свои'))

svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="DejaVu Sans, Arial, sans-serif">',
       '<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
       '<line x1="0" y1="0" x2="0" y2="8" stroke="#9aa7b4" stroke-width="2"/></pattern></defs>',
       f'<rect width="{W}" height="{H}" fill="#fff"/>',
       f'<text x="{OX}" y="48" font-size="26" font-weight="bold" fill="#1d2733">{title}</text>',
       f'<text x="{OX}" y="78" font-size="15" fill="#556">Сетка 1 м · размеры в мм · север (ось В) сверху</text>']
for i, (c, s) in enumerate(legend):
    y = 108 + i * 22
    svg.append(f'<rect x="{OX}" y="{y - 11}" width="26" height="8" fill="{c}"/>')
    svg.append(f'<text x="{OX + 36}" y="{y - 3}" font-size="14" fill="#334">{s}</text>')
svg += el + ['</svg>']
out.write_text('\n'.join(svg))
print(out, f'windows={win_no} doors={door_no} skylights={sky}')
