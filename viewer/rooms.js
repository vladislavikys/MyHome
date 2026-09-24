// Помещения определяются по стенам: пол этажа растеризуется сеткой 5 см,
// стены (и «виртуальные» разделители открытых зон) — препятствия,
// от точки подписи комнаты заливается замкнутая область.

export const CELL = 0.05;

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Возвращает { regions, rooms }:
 *   regions[id] = { runs: [[x0, x1, y]], area, rooms: [индексы комнат] }
 *   rooms[i]    = { region: id | null, area: число | null }
 */
export function computeRooms(floor) {
  const outline = floor.outline;
  const rooms = (floor.rooms ?? []).map(() => ({ region: null, area: null }));
  if (!outline) return { regions: [], rooms };

  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const nx = Math.ceil((Math.max(...xs) - x0) / CELL);
  const ny = Math.ceil((Math.max(...ys) - y0) / CELL);
  const blocked = new Uint8Array(nx * ny);
  const cx = i => x0 + (i + 0.5) * CELL;
  const cy = j => y0 + (j + 0.5) * CELL;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!pointInPolygon(cx(i), cy(j), outline)) blocked[j * nx + i] = 1;
    }
  }

  // проёмы в перекрытии (лестница) — не пол
  for (const hole of floor.holes ?? []) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (pointInPolygon(cx(i), cy(j), hole)) blocked[j * nx + i] = 1;
      }
    }
  }

  for (const w of floor.walls) {
    const [ax, ay] = w.from, [bx, by] = w.to;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) continue;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const half = Math.max((w.thickness ?? 0.3) / 2, CELL) + 0.02;
    const ext = Math.max((w.thickness ?? 0.3) / 2, CELL);
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - half - ext - x0) / CELL));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + half + ext - x0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - half - ext - y0) / CELL));
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by) + half + ext - y0) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = cx(i) - ax, py = cy(j) - ay;
        const along = px * ux + py * uy;
        if (along < -ext || along > len + ext) continue;
        if (Math.abs(px * uy - py * ux) <= half) blocked[j * nx + i] = 1;
      }
    }
  }

  const region = new Int32Array(nx * ny).fill(-1);
  const regions = [];
  const stack = [];

  const seedCell = (x, y) => {
    const i = Math.floor((x - x0) / CELL), j = Math.floor((y - y0) / CELL);
    for (let r = 0; r <= 8; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const ii = i + di, jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && !blocked[jj * nx + ii]) return jj * nx + ii;
        }
      }
    }
    return -1;
  };

  (floor.rooms ?? []).forEach((room, k) => {
    const at = room.at;
    if (!at || at[0] < x0 || at[1] < y0 || at[0] > x0 + nx * CELL || at[1] > y0 + ny * CELL) return;
    if (!pointInPolygon(at[0], at[1], outline)) return;
    const start = seedCell(at[0], at[1]);
    if (start < 0) return;
    if (region[start] >= 0) {
      rooms[k].region = region[start];
      regions[region[start]].rooms.push(k);
      return;
    }
    const id = regions.length;
    let count = 0;
    region[start] = id;
    stack.push(start);
    while (stack.length) {
      const c = stack.pop();
      count++;
      const i = c % nx, j = (c - i) / nx;
      for (const [ii, jj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const n = jj * nx + ii;
        if (!blocked[n] && region[n] < 0) { region[n] = id; stack.push(n); }
      }
    }
    regions.push({ runs: [], area: count * CELL * CELL, rooms: [k] });
    rooms[k].region = id;
  });

  // Горизонтальные полосы ячеек каждой области — для заливки пола.
  for (let j = 0; j < ny; j++) {
    let i = 0;
    while (i < nx) {
      const id = region[j * nx + i];
      if (id < 0) { i++; continue; }
      let e = i;
      while (e + 1 < nx && region[j * nx + e + 1] === id) e++;
      regions[id].runs.push([x0 + i * CELL, x0 + (e + 1) * CELL, y0 + j * CELL]);
      i = e + 1;
    }
  }

  rooms.forEach(r => { if (r.region !== null) r.area = regions[r.region].area; });
  return { regions, rooms };
}
