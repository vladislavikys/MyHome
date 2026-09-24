// Геометрия лестниц: марши и забежные ступени → многоугольники ступеней на плане с отметками.
//
// house.stairs[] = {
//   h: [низ, верх], risers: число подъёмов, thickness: толщина проступи,
//   parts: [
//     { flight:  { start: [x, y] (середина передней кромки первой ступени), dir: [dx, dy], width, count, depth } },
//     { winders: { pivot: [x, y] (внутренний угол поворота), rect: [x0, y0, x1, y1], from: угол°, to: угол°, count } },
//     { landing: { rect: [x0, y0, x1, y1], lead: [[x, y], [x, y]] (кромка, куда приходит марш) } },
//   ]
// }
// Углы на плане: 0° — вдоль +x, −90° — к −y (к оси В).

function rayToRect(p, ang, [x0, y0, x1, y1]) {
  const c = Math.cos(ang), s = Math.sin(ang);
  let t = Infinity;
  if (c > 1e-9) t = Math.min(t, (x1 - p[0]) / c);
  if (c < -1e-9) t = Math.min(t, (x0 - p[0]) / c);
  if (s > 1e-9) t = Math.min(t, (y1 - p[1]) / s);
  if (s < -1e-9) t = Math.min(t, (y0 - p[1]) / s);
  return [p[0] + c * t, p[1] + s * t];
}

export function stairSteps(stair) {
  const steps = [];
  for (const part of stair.parts ?? []) {
    if (part.flight) {
      const { start, dir, width, count, depth } = part.flight;
      const len = Math.hypot(dir[0], dir[1]);
      const d = [dir[0] / len, dir[1] / len], n = [-d[1], d[0]];
      for (let i = 0; i < count; i++) {
        const a = [start[0] + d[0] * depth * i, start[1] + d[1] * depth * i];
        const b = [a[0] + d[0] * depth, a[1] + d[1] * depth];
        const w = width / 2;
        const poly = [
          [a[0] + n[0] * w, a[1] + n[1] * w], [b[0] + n[0] * w, b[1] + n[1] * w],
          [b[0] - n[0] * w, b[1] - n[1] * w], [a[0] - n[0] * w, a[1] - n[1] * w],
        ];
        steps.push({ poly, lead: [poly[0], poly[3]] });
      }
    } else if (part.landing) {
      // промежуточная площадка — одна «ступень» по прямоугольнику
      const [x0, y0, x1, y1] = part.landing.rect;
      const poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const lead = part.landing.lead ?? [poly[3], poly[2]];
      steps.push({ poly, lead, landing: true });
    } else if (part.winders) {
      const { pivot, rect, from, to, count } = part.winders;
      const [x0, y0, x1, y1] = rect;
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const rad = v => (v * Math.PI) / 180;
      for (let i = 0; i < count; i++) {
        const a0 = rad(from + ((to - from) * i) / count), a1 = rad(from + ((to - from) * (i + 1)) / count);
        const poly = [pivot, rayToRect(pivot, a0, rect)];
        // углы прямоугольника, попавшие внутрь сектора
        const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
        const inside = corners
          .map(c => ({ c, a: Math.atan2(c[1] - pivot[1], c[0] - pivot[0]) }))
          .filter(({ c, a }) => a > lo + 1e-6 && a < hi - 1e-6 && Math.hypot(c[0] - pivot[0], c[1] - pivot[1]) > 1e-6)
          .sort((p, q) => (a1 > a0 ? p.a - q.a : q.a - p.a));
        for (const { c } of inside) poly.push(c);
        poly.push(rayToRect(pivot, a1, rect));
        steps.push({ poly, lead: [poly[0], poly[1]] });
      }
    }
  }
  const [h0, h1] = stair.h;
  const r = (h1 - h0) / (stair.risers ?? steps.length + 1);
  // lead — передняя кромка ступени (по ней ставится подступенок)
  return steps.map((st, i) => ({ ...st, top: h0 + r * (i + 1) }));
}
