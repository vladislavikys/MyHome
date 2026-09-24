// 2D-редактор плана этажа: стены, проёмы, мансардные окна, подписи комнат.
// Работает мышью и пальцем. Меняет объект house на месте и сообщает об изменениях.

import { computeRooms } from './rooms.js';

const SNAP = 0.05;
const HIT_PX = 12;
const NS = 'http://www.w3.org/2000/svg';

const TOOLS = [
  ['select', 'Выбор', 'Нажмите на стену, окно или подпись. Тяните стену, чтобы сдвинуть её; тяните кружок на конце, чтобы изменить длину.'],
  ['wall', 'Стена', 'Нажмите в начале и в конце новой стены (или проведите пальцем). Концы прилипают к другим стенам.'],
  ['window', 'Окно', 'Нажмите на стену там, где нужно окно.'],
  ['door', 'Дверь', 'Нажмите на стену там, где нужна дверь.'],
  ['skylight', 'Мансардное', 'Нажмите на скат крыши (только верхний этаж), чтобы добавить мансардное окно.'],
  ['room', 'Подпись', 'Нажмите внутри помещения, чтобы подписать его. Площадь посчитается по стенам.'],
];

const TYPE_NAMES = { window: 'Окно', door: 'Дверь', glassdoor: 'Витражная дверь' };

const snap = v => Math.round(v / SNAP) * SNAP;
const r2 = v => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const uid = p => p + Math.random().toString(36).slice(2, 7);

function wallGeom(w) {
  const [ax, ay] = w.from, [bx, by] = w.to;
  const len = Math.hypot(bx - ax, by - ay) || 1e-9;
  const u = [(bx - ax) / len, (by - ay) / len];
  return { a: w.from, b: w.to, len, u, n: [-u[1], u[0]] };
}

function projectOnWall(w, p) {
  const g = wallGeom(w);
  const t = (p[0] - g.a[0]) * g.u[0] + (p[1] - g.a[1]) * g.u[1];
  const tc = Math.max(0, Math.min(g.len, t));
  const q = [g.a[0] + g.u[0] * tc, g.a[1] + g.u[1] * tc];
  return { t, tc, q, d: dist(p, q), g };
}

export function createEditor(root, { onChange, onFloor }) {
  let house = null;
  let floorIdx = 0;
  let tool = 'select';
  let sel = null;        // {kind:'wall'|'opening'|'skylight'|'room', ...}
  let draft = null;      // новая стена в процессе
  let drag = null;
  let rooms = { regions: [], rooms: [] };
  let view = null;       // {x, y, w} — viewBox в метрах
  const undoStack = [];
  let pending = null;
  const pointers = new Map();

  root.innerHTML = `
    <div class="ed-head">
      <div class="ed-row">
        <div class="ed-seg" id="ed-floors" role="group" aria-label="Этаж"></div>
        <div class="ed-actions">
          <button type="button" id="ed-undo" title="Отменить (Ctrl+Z)">Отменить</button>
          <button type="button" id="ed-fit" title="Показать весь этаж">Весь план</button>
          <button type="button" id="ed-close" class="ed-close" aria-label="Закрыть редактор">✕</button>
        </div>
      </div>
      <div class="ed-tools" id="ed-tools" role="group" aria-label="Инструмент"></div>
    </div>
    <div class="ed-canvas" id="ed-canvas"><svg id="ed-svg" aria-label="План этажа"></svg></div>
    <div class="ed-props" id="ed-props"></div>
    <div class="ed-foot">
      <span class="ed-status" id="ed-status"></span>
      <button type="button" id="ed-reset">Вернуть проект</button>
      <button type="button" id="ed-download">Скачать house.json</button>
    </div>`;

  const $ = id => root.querySelector('#' + id);
  const svg = $('ed-svg');
  const props = $('ed-props');

  for (const [key, label] of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tool = key;
    b.textContent = label;
    b.onclick = () => setTool(key);
    $('ed-tools').append(b);
  }

  const floor = () => house.floors[floorIdx];
  const isTop = () => floorIdx === house.floors.length - 1;
  const walls = () => floor().walls;
  const openings = () => (floor().openings ??= []);

  // ---------- история ----------
  function begin() { if (!pending) pending = JSON.stringify(house); }
  function commit() {
    if (!pending) return;
    const now = JSON.stringify(house);
    if (now !== pending) {
      undoStack.push(pending);
      if (undoStack.length > 80) undoStack.shift();
      rooms = computeRooms(floor());
      onChange(house);
    }
    pending = null;
    render();
  }
  function undo() {
    if (!undoStack.length) return;
    const prev = JSON.parse(undoStack.pop());
    replaceHouse(prev);
    sel = null;
    rooms = computeRooms(floor());
    onChange(house);
    render();
  }
  function replaceHouse(next) {
    for (const k of Object.keys(house)) delete house[k];
    Object.assign(house, next);
  }

  // ---------- вид ----------
  function fit() {
    if (!svg.getBoundingClientRect().width) return;
    const pts = [...(floor().outline ?? []), ...walls().flatMap(w => [w.from, w.to])];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const pad = 1.0;
    const bx = Math.min(...xs) - pad, by = Math.min(...ys) - pad;
    const bw = Math.max(...xs) - Math.min(...xs) + 2 * pad;
    const bh = Math.max(...ys) - Math.min(...ys) + 2 * pad;
    const { width, height } = svg.getBoundingClientRect();
    const aspect = height > 0 ? width / height : 1.6;
    const w = Math.max(bw, bh * aspect);
    view = { x: bx - (w - bw) / 2, y: by - (w / aspect - bh) / 2, w };
    render();
  }
  function aspect() {
    const { width, height } = svg.getBoundingClientRect();
    return height > 0 ? width / height : 1.6;
  }
  const pxPerM = () => svg.getBoundingClientRect().width / view.w;
  function toWorld(ev) {
    const r = svg.getBoundingClientRect();
    return [view.x + ((ev.clientX - r.left) / r.width) * view.w,
            view.y + ((ev.clientY - r.top) / r.height) * (view.w / aspect())];
  }
  function zoomAt(p, k) {
    const nw = Math.min(60, Math.max(2, view.w * k));
    const f = nw / view.w;
    view = { x: p[0] - (p[0] - view.x) * f, y: p[1] - (p[1] - view.y) * f, w: nw };
  }

  // ---------- привязка ----------
  function snapPoint(p, { exclude = [], ortho = null } = {}) {
    const tol = 12 / pxPerM();
    let best = null, bestD = tol;
    for (const w of walls()) {
      if (exclude.includes(w)) continue;
      for (const e of [w.from, w.to]) {
        const d = dist(p, e);
        if (d < bestD) { bestD = d; best = [...e]; }
      }
    }
    if (best) return best;
    let q = [snap(p[0]), snap(p[1])];
    if (ortho) {
      if (Math.abs(q[0] - ortho[0]) < 0.25) q[0] = ortho[0];
      else if (Math.abs(q[1] - ortho[1]) < 0.25) q[1] = ortho[1];
    }
    // прилипание к линии стены (Т-примыкание)
    for (const w of walls()) {
      if (exclude.includes(w) || w.virtual) continue;
      const pr = projectOnWall(w, q);
      if (pr.d < tol && pr.t > 0 && pr.t < pr.g.len) {
        const face = (w.thickness ?? 0.3) / 2;
        if (ortho) {
          // встаём на грань стены со стороны начала новой стены
          const side = Math.sign((ortho[0] - pr.q[0]) * pr.g.n[0] + (ortho[1] - pr.q[1]) * pr.g.n[1]) || 1;
          q = [r2(pr.q[0] + pr.g.n[0] * face * side), r2(pr.q[1] + pr.g.n[1] * face * side)];
        } else {
          q = [r2(pr.q[0]), r2(pr.q[1])];
        }
        break;
      }
    }
    return q;
  }

  // Перемещение конца стены с сохранением абсолютного положения её проёмов.
  function setEnd(w, end, p) {
    const old = wallGeom(w);
    if (end === 'from') {
      const shift = (p[0] - w.from[0]) * old.u[0] + (p[1] - w.from[1]) * old.u[1];
      for (const o of openings()) if (o.wall === w.id) o.offset = r2(o.offset - shift);
      w.from = [r2(p[0]), r2(p[1])];
    } else {
      w.to = [r2(p[0]), r2(p[1])];
    }
    const len = wallGeom(w).len;
    for (const o of openings()) {
      if (o.wall !== w.id) continue;
      o.offset = r2(Math.max(0, Math.min(len - o.width, o.offset)));
    }
  }

  function connectedEnds(pt, except) {
    const res = [];
    for (const w of walls()) {
      if (w === except) continue;
      for (const end of ['from', 'to']) if (dist(w[end], pt) < 0.03) res.push({ w, end, orig: [...w[end]] });
    }
    return res;
  }

  // ---------- попадание ----------
  function skylights() {
    if (!isTop()) return [];
    const res = [];
    (house.roofs ?? []).forEach((roof, ri) => (roof.windows ?? []).forEach((win, wi) => res.push({ roof, ri, win, wi })));
    return res;
  }

  function hit(p) {
    const tol = HIT_PX / pxPerM();
    if (sel?.kind === 'wall') {
      const w = sel.wall;
      for (const end of ['from', 'to']) if (dist(p, w[end]) < tol * 1.3) return { kind: 'handle', wall: w, end };
    }
    for (const o of openings()) {
      const w = walls().find(x => x.id === o.wall);
      if (!w) continue;
      const pr = projectOnWall(w, p);
      if (pr.t >= o.offset - tol / 2 && pr.t <= o.offset + o.width + tol / 2 && pr.d < Math.max((w.thickness ?? 0.3) / 2, tol)) {
        return { kind: 'opening', opening: o, wall: w };
      }
    }
    for (const [k, room] of (floor().rooms ?? []).entries()) {
      if (room.at && Math.abs(p[0] - room.at[0]) < 0.9 && Math.abs(p[1] - room.at[1]) < 0.35) return { kind: 'room', room, index: k };
    }
    let best = null, bestD = Infinity;
    for (const w of walls()) {
      const pr = projectOnWall(w, p);
      const lim = Math.max((w.thickness ?? 0.3) / 2, tol);
      if (pr.t >= -0.1 && pr.t <= pr.g.len + 0.1 && pr.d < lim && pr.d < bestD) { best = w; bestD = pr.d; }
    }
    if (best) return { kind: 'wall', wall: best };
    for (const s of skylights()) {
      const [a, b] = s.win.x, [c, d] = s.win.y;
      if (p[0] >= a && p[0] <= b && p[1] >= c && p[1] <= d) return { kind: 'skylight', ...s };
    }
    return null;
  }

  // ---------- действия ----------
  function setTool(t) {
    tool = t;
    draft = null;
    root.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
    render();
  }

  function deleteSelected() {
    if (!sel) return;
    begin();
    const f = floor();
    if (sel.kind === 'wall') {
      f.walls = f.walls.filter(w => w !== sel.wall);
      f.openings = openings().filter(o => o.wall !== sel.wall.id);
    } else if (sel.kind === 'opening') {
      f.openings = openings().filter(o => o !== sel.opening);
    } else if (sel.kind === 'skylight') {
      sel.roof.windows = sel.roof.windows.filter(w => w !== sel.win);
    } else if (sel.kind === 'room') {
      f.rooms = f.rooms.filter(r => r !== sel.room);
    }
    sel = null;
    commit();
  }

  function addOpening(p, type) {
    let best = null;
    for (const w of walls()) {
      if (w.virtual) continue;
      const pr = projectOnWall(w, p);
      if (pr.d < 0.5 && pr.t >= 0 && pr.t <= pr.g.len && (!best || pr.d < best.pr.d)) best = { w, pr };
    }
    if (!best) return;
    const { w, pr } = best;
    const top = floorIdx > 0;
    const o = type === 'door'
      ? { wall: w.id, type: 'door', width: 0.8, height: 2.1 }
      : { wall: w.id, type: 'window', width: top ? 1.0 : 1.2, height: top ? 1.45 : 1.5, sill: top ? 0.95 : 0.9 };
    o.width = Math.min(o.width, r2(pr.g.len));
    o.offset = r2(Math.max(0, Math.min(pr.g.len - o.width, snap(pr.t - o.width / 2))));
    begin();
    if (!w.id) w.id = uid('w');
    o.wall = w.id;
    openings().push(o);
    sel = { kind: 'opening', opening: o, wall: w };
    commit();
  }

  function addSkylight(p) {
    if (!isTop()) return;
    for (const roof of house.roofs ?? []) {
      if (roof.material === 'glass') continue;
      const xs = roof.corners.map(c => c[0]), ys = roof.corners.map(c => c[1]);
      if (p[0] < Math.min(...xs) || p[0] > Math.max(...xs) || p[1] < Math.min(...ys) || p[1] > Math.max(...ys)) continue;
      const x0 = snap(p[0] - 0.4), y0 = snap(p[1] - 0.425);
      const win = { x: [r2(x0), r2(x0 + 0.8)], y: [r2(y0), r2(y0 + 0.85)] };
      begin();
      (roof.windows ??= []).push(win);
      sel = { kind: 'skylight', roof, win };
      commit();
      return;
    }
  }

  function addRoom(p) {
    begin();
    const room = { name: 'Помещение', at: [r2(p[0]), r2(p[1])], color: '#d9c9a8' };
    (floor().rooms ??= []).push(room);
    sel = { kind: 'room', room };
    commit();
    setTimeout(() => props.querySelector('#ed-room-name')?.select(), 0);
  }

  function finishWall() {
    if (!draft || dist(draft.from, draft.to) < 0.2) { draft = null; render(); return; }
    begin();
    const w = { id: uid('w'), from: draft.from, to: draft.to, thickness: 0.1, height: 2.7 };
    walls().push(w);
    draft = null;
    sel = { kind: 'wall', wall: w };
    commit();
  }

  // ---------- указатель ----------
  svg.addEventListener('pointerdown', ev => {
    svg.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      drag = { kind: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), view0: { ...view } };
      draft = null;
      return;
    }
    const p = toWorld(ev);

    if (tool === 'wall') {
      if (!draft) draft = { from: snapPoint(p), to: snapPoint(p), pointer: ev.pointerId, t0: performance.now() };
      else { draft.to = snapPoint(p, { ortho: draft.from }); finishWall(); }
      render();
      return;
    }
    if (tool === 'window' || tool === 'door') { addOpening(p, tool); return; }
    if (tool === 'skylight') { addSkylight(p); return; }
    if (tool === 'room') { addRoom(p); return; }

    const h = hit(p);
    if (!h) {
      sel = null;
      drag = { kind: 'pan', start: [ev.clientX, ev.clientY], view0: { ...view } };
      render();
      return;
    }
    if (h.kind === 'handle') {
      begin();
      drag = { kind: 'end', wall: h.wall, end: h.end, linked: connectedEnds(h.wall[h.end], h.wall) };
      return;
    }
    sel = h;
    begin();
    if (h.kind === 'wall') {
      const g = wallGeom(h.wall);
      const linked = [...connectedEnds(h.wall.from, h.wall), ...connectedEnds(h.wall.to, h.wall)];
      // Т-примыкания к телу стены тоже двигаем
      for (const w of walls()) {
        if (w === h.wall) continue;
        for (const end of ['from', 'to']) {
          if (linked.some(l => l.w === w && l.end === end)) continue;
          const pr = projectOnWall(h.wall, w[end]);
          if (pr.d <= (h.wall.thickness ?? 0.3) / 2 + 0.03 && pr.t > 0.01 && pr.t < pr.g.len - 0.01) linked.push({ w, end, orig: [...w[end]] });
        }
      }
      drag = { kind: 'wall', wall: h.wall, p0: p, from0: [...h.wall.from], to0: [...h.wall.to], n: g.n, linked };
    } else if (h.kind === 'opening') {
      const pr = projectOnWall(h.wall, p);
      drag = { kind: 'opening', o: h.opening, w: h.wall, grab: pr.t - h.opening.offset };
    } else if (h.kind === 'room') {
      drag = { kind: 'room', room: h.room, d: [p[0] - h.room.at[0], p[1] - h.room.at[1]] };
    } else if (h.kind === 'skylight') {
      drag = { kind: 'skylight', win: h.win, p0: p, x0: [...h.win.x], y0: [...h.win.y] };
    }
    render();
  });

  svg.addEventListener('pointermove', ev => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    const p = toWorld(ev);
    if (draft && tool === 'wall') {
      draft.to = snapPoint(p, { ortho: draft.from });
      render();
      return;
    }
    if (!drag) return;
    if (drag.kind === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const r = svg.getBoundingClientRect();
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      view = { ...drag.view0 };
      const c = [view.x + ((mid[0] - r.left) / r.width) * view.w, view.y + ((mid[1] - r.top) / r.height) * (view.w / aspect())];
      zoomAt(c, drag.d0 / Math.max(d, 1));
    } else if (drag.kind === 'pan') {
      const k = drag.view0.w / svg.getBoundingClientRect().width;
      view = { ...drag.view0, x: drag.view0.x - (ev.clientX - drag.start[0]) * k, y: drag.view0.y - (ev.clientY - drag.start[1]) * k };
    } else if (drag.kind === 'wall') {
      const { n } = drag;
      let d = (p[0] - drag.p0[0]) * n[0] + (p[1] - drag.p0[1]) * n[1];
      // привязываем координату стены к сетке 5 см
      const axis = Math.abs(n[0]) > 0.999 ? 0 : Math.abs(n[1]) > 0.999 ? 1 : -1;
      if (axis >= 0) d = snap(drag.from0[axis] + n[axis] * d) * n[axis] - drag.from0[axis] * n[axis];
      else d = snap(d);
      const v = [n[0] * d, n[1] * d];
      drag.wall.from = [r2(drag.from0[0] + v[0]), r2(drag.from0[1] + v[1])];
      drag.wall.to = [r2(drag.to0[0] + v[0]), r2(drag.to0[1] + v[1])];
      for (const l of drag.linked) setEnd(l.w, l.end, [l.orig[0] + v[0], l.orig[1] + v[1]]);
    } else if (drag.kind === 'end') {
      const other = drag.end === 'from' ? drag.wall.to : drag.wall.from;
      const q = snapPoint(p, { exclude: [drag.wall, ...drag.linked.map(l => l.w)], ortho: other });
      setEnd(drag.wall, drag.end, q);
      for (const l of drag.linked) setEnd(l.w, l.end, q);
    } else if (drag.kind === 'opening') {
      const pr = projectOnWall(drag.w, p);
      drag.o.offset = r2(Math.max(0, Math.min(pr.g.len - drag.o.width, snap(pr.t - drag.grab))));
    } else if (drag.kind === 'room') {
      drag.room.at = [r2(snap(p[0] - drag.d[0])), r2(snap(p[1] - drag.d[1]))];
    } else if (drag.kind === 'skylight') {
      const dx = snap(p[0] - drag.p0[0]), dy = snap(p[1] - drag.p0[1]);
      drag.win.x = drag.x0.map(v => r2(v + dx));
      drag.win.y = drag.y0.map(v => r2(v + dy));
    }
    render();
  });

  const endPointer = ev => {
    pointers.delete(ev.pointerId);
    if (draft && tool === 'wall' && draft.pointer === ev.pointerId && dist(draft.from, draft.to) > 0.3) {
      finishWall();
      return;
    }
    if (drag && drag.kind !== 'pan' && drag.kind !== 'pinch') commit();
    else pending = null;
    if (pointers.size === 0) drag = null;
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  svg.addEventListener('wheel', ev => {
    ev.preventDefault();
    zoomAt(toWorld(ev), Math.exp(ev.deltaY * 0.0015));
    render();
  }, { passive: false });

  root.addEventListener('keydown', ev => {
    if (ev.target.closest('input, select, textarea')) return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel) { ev.preventDefault(); deleteSelected(); }
    else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); }
    else if (ev.key === 'Escape') { draft = null; sel = null; render(); }
  });

  $('ed-undo').onclick = undo;
  $('ed-fit').onclick = fit;

  // ---------- отрисовка ----------
  function heightLines() {
    const res = [];
    const f = floor();
    for (const roof of house.roofs ?? []) {
      if (roof.clip !== 'main') continue;
      const hs = roof.corners.map(c => c[2]);
      const hi = roof.corners[hs.indexOf(Math.max(...hs))], lo = roof.corners[hs.indexOf(Math.min(...hs))];
      const target = f.elevation + 2.2;
      if (target <= lo[2] || target >= hi[2]) continue;
      const y = hi[1] + ((lo[1] - hi[1]) * (hi[2] - target)) / (hi[2] - lo[2]);
      const xs = roof.corners.map(c => c[0]);
      const ox = (f.outline ?? []).map(p => p[0]);
      res.push([Math.max(Math.min(...xs), Math.min(...ox)), Math.min(Math.max(...xs), Math.max(...ox)), y]);
    }
    return res;
  }

  function render() {
    if (!house || !view || !svg.getBoundingClientRect().width) return;
    const f = floor();
    const k = 1 / pxPerM();       // метров на пиксель
    const h = view.w / aspect();
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${h}`);
    const out = [];
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // сетка 1 м
    const gx0 = Math.floor(view.x), gx1 = Math.ceil(view.x + view.w);
    const gy0 = Math.floor(view.y), gy1 = Math.ceil(view.y + h);
    let grid = '';
    for (let x = gx0; x <= gx1; x++) grid += `M${x} ${gy0}V${gy1}`;
    for (let y = gy0; y <= gy1; y++) grid += `M${gx0} ${y}H${gx1}`;
    out.push(`<path class="g-grid" d="${grid}"/>`);

    // оси
    for (const [name, x] of house.axes?.x ?? []) {
      out.push(`<line class="g-axis" x1="${x}" y1="${view.y}" x2="${x}" y2="${view.y + h}"/>`,
        `<text class="g-axis-label" x="${x}" y="${view.y + h - 12 * k}" font-size="${12 * k}">${esc(name)}</text>`);
    }
    for (const [name, y] of house.axes?.y ?? []) {
      out.push(`<line class="g-axis" x1="${view.x}" y1="${y}" x2="${view.x + view.w}" y2="${y}"/>`,
        `<text class="g-axis-label" x="${view.x + 10 * k}" y="${y - 4 * k}" font-size="${12 * k}">${esc(name)}</text>`);
    }

    if (f.outline) out.push(`<polygon class="g-slab" points="${f.outline.map(p => p.join(',')).join(' ')}"/>`);

    // заливка помещений
    rooms.regions.forEach(reg => {
      const room = f.rooms[reg.rooms[0]];
      const d = reg.runs.map(([a, b, y]) => `M${a} ${y}H${b}V${y + 0.05}H${a}Z`).join('');
      out.push(`<path class="g-room" d="${d}" fill="${esc(room?.color ?? '#ccc')}"/>`);
    });

    for (const hole of f.holes ?? []) {
      out.push(`<polygon class="g-hole" points="${hole.map(p => p.join(',')).join(' ')}"/>`);
    }
    for (const [a, b, y] of heightLines()) {
      out.push(`<line class="g-h22" x1="${a}" y1="${y}" x2="${b}" y2="${y}"/>`,
        `<text class="g-h22-label" x="${b - 4 * k}" y="${y - 4 * k}" font-size="${11 * k}">h 2,2 м</text>`);
    }

    // стены
    for (const w of f.walls) {
      const t = w.thickness ?? 0.3;
      const cls = w.virtual ? 'g-virtual' : w.material === 'glass' ? 'g-glass' : t >= 0.25 ? 'g-wall g-ext' : 'g-wall';
      const cap = t >= 0.25 ? 'square' : 'butt';
      const sw = w.virtual ? 1.5 * k : Math.max(t, 2 * k);
      out.push(`<line class="${cls}" x1="${w.from[0]}" y1="${w.from[1]}" x2="${w.to[0]}" y2="${w.to[1]}" stroke-width="${sw}" stroke-linecap="${cap}"/>`);
    }
    // проёмы
    for (const o of f.openings ?? []) {
      const w = f.walls.find(x => x.id === o.wall);
      if (!w) continue;
      const g = wallGeom(w);
      const a = [g.a[0] + g.u[0] * o.offset, g.a[1] + g.u[1] * o.offset];
      const b = [g.a[0] + g.u[0] * (o.offset + o.width), g.a[1] + g.u[1] * (o.offset + o.width)];
      const t = Math.max(w.thickness ?? 0.3, 3 * k);
      out.push(`<line class="g-gap" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${t * 1.02}"/>`);
      out.push(`<line class="g-op g-${o.type}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${Math.max(t * 0.45, 3 * k)}"/>`);
      if (o.type === 'door') {
        // дуга открывания
        const r = o.width;
        const e = [a[0] + g.n[0] * r, a[1] + g.n[1] * r];
        out.push(`<path class="g-swing" d="M${a[0]} ${a[1]}L${e[0]} ${e[1]}A${r} ${r} 0 0 ${1} ${b[0]} ${b[1]}" stroke-width="${1.2 * k}"/>`);
      }
    }

    // мансардные окна
    for (const s of skylights()) {
      const [a, b] = s.win.x, [c, d] = s.win.y;
      out.push(`<rect class="g-sky" x="${a}" y="${c}" width="${b - a}" height="${d - c}" stroke-width="${1.5 * k}"/>`);
    }

    // подписи помещений
    (f.rooms ?? []).forEach((room, i) => {
      if (!room.at) return;
      const info = rooms.rooms[i];
      const area = info?.area != null ? `${info.area.toFixed(1)} м²` : '';
      const shared = info?.region != null && rooms.regions[info.region].rooms.length > 1 ? ' (общая)' : '';
      out.push(`<text class="g-room-name" x="${room.at[0]}" y="${room.at[1]}" font-size="${13 * k}">${esc(room.name)}</text>`);
      if (area) out.push(`<text class="g-room-area" x="${room.at[0]}" y="${room.at[1] + 15 * k}" font-size="${12 * k}">${area}${shared}</text>`);
    });

    // выделение
    if (sel?.kind === 'wall') {
      const w = sel.wall;
      const g = wallGeom(w);
      out.push(`<line class="g-sel" x1="${w.from[0]}" y1="${w.from[1]}" x2="${w.to[0]}" y2="${w.to[1]}" stroke-width="${Math.max(w.thickness ?? 0.3, 4 * k) + 4 * k}"/>`);
      for (const e of [w.from, w.to]) out.push(`<circle class="g-handle" cx="${e[0]}" cy="${e[1]}" r="${8 * k}" stroke-width="${2 * k}"/>`);
      const mid = [(w.from[0] + w.to[0]) / 2 + g.n[0] * 18 * k, (w.from[1] + w.to[1]) / 2 + g.n[1] * 18 * k];
      out.push(`<text class="g-dim" x="${mid[0]}" y="${mid[1] + 4 * k}" font-size="${12 * k}">${Math.round(g.len * 1000)}</text>`);
    } else if (sel?.kind === 'opening') {
      const o = sel.opening, w = f.walls.find(x => x.id === o.wall);
      if (w) {
        const g = wallGeom(w);
        const a = [g.a[0] + g.u[0] * o.offset, g.a[1] + g.u[1] * o.offset];
        const b = [g.a[0] + g.u[0] * (o.offset + o.width), g.a[1] + g.u[1] * (o.offset + o.width)];
        out.push(`<line class="g-sel" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${Math.max(w.thickness ?? 0.3, 4 * k) + 6 * k}"/>`);
        const rest = g.len - o.offset - o.width;
        const lab = (t, s) => {
          const q = [g.a[0] + g.u[0] * t + g.n[0] * 18 * k, g.a[1] + g.u[1] * t + g.n[1] * 18 * k];
          out.push(`<text class="g-dim" x="${q[0]}" y="${q[1] + 4 * k}" font-size="${11 * k}">${s}</text>`);
        };
        lab(o.offset / 2, Math.round(o.offset * 1000));
        lab(o.offset + o.width / 2, Math.round(o.width * 1000));
        lab(g.len - rest / 2, Math.round(rest * 1000));
      }
    } else if (sel?.kind === 'skylight') {
      const [a, b] = sel.win.x, [c, d] = sel.win.y;
      out.push(`<rect class="g-sel-rect" x="${a}" y="${c}" width="${b - a}" height="${d - c}" stroke-width="${3 * k}"/>`);
    } else if (sel?.kind === 'room' && sel.room.at) {
      out.push(`<circle class="g-handle" cx="${sel.room.at[0]}" cy="${sel.room.at[1] - 4 * k}" r="${5 * k}" stroke-width="${2 * k}"/>`);
    }

    if (draft) {
      out.push(`<line class="g-draft" x1="${draft.from[0]}" y1="${draft.from[1]}" x2="${draft.to[0]}" y2="${draft.to[1]}" stroke-width="${Math.max(0.1, 3 * k)}"/>`,
        `<circle class="g-handle" cx="${draft.from[0]}" cy="${draft.from[1]}" r="${6 * k}" stroke-width="${2 * k}"/>`);
      const L = dist(draft.from, draft.to);
      if (L > 0.1) out.push(`<text class="g-dim" x="${(draft.from[0] + draft.to[0]) / 2}" y="${(draft.from[1] + draft.to[1]) / 2 - 10 * k}" font-size="${12 * k}">${Math.round(L * 1000)}</text>`);
    }

    svg.innerHTML = out.join('');
    renderProps();
    root.querySelectorAll('#ed-floors button').forEach((b, i) => b.setAttribute('aria-pressed', i === floorIdx));
    $('ed-undo').disabled = undoStack.length === 0;
    root.querySelector('[data-tool="skylight"]').disabled = !isTop();
  }

  // ---------- свойства ----------
  let propsKey = null;
  function renderProps() {
    const key = sel ? sel.kind + ':' + (sel.wall?.id ?? '') + (sel.opening ? house.floors[floorIdx].openings.indexOf(sel.opening) : '') : 'tool:' + tool;
    // не перерисовываем поля, пока пользователь в них печатает
    if (key === propsKey && props.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
      refreshReadouts();
      return;
    }
    propsKey = key;
    const field = (id, label, value, attrs = '') =>
      `<label class="ed-field" for="${id}"><span>${label}</span><input id="${id}" value="${value}" ${attrs}></label>`;
    const num = (id, label, value, step = 0.05) =>
      field(id, label, r2(value), `type="number" inputmode="decimal" step="${step}" min="0"`);
    // число + ползунок: 3D меняется прямо во время перетаскивания
    const slider = (id, label, value, min, max, step = 0.05) =>
      `<label class="ed-field ed-slider" for="${id}"><span>${label}</span>
        <span class="ed-slider-row">
          <input id="${id}-r" type="range" min="${min}" max="${max}" step="${step}" value="${r2(value)}" aria-label="${label}">
          <input id="${id}" type="number" inputmode="decimal" step="${step}" min="${min}" max="${max}" value="${r2(value)}">
        </span></label>`;
    let html = '';
    if (!sel) {
      html = `<p class="ed-hint">${TOOLS.find(t => t[0] === tool)[2]}</p>`;
    } else if (sel.kind === 'wall') {
      const w = sel.wall, g = wallGeom(w);
      const kind = w.virtual ? 'Граница зоны (в 3D не видна)' : w.material === 'glass' ? 'Витраж' : (w.thickness ?? 0.3) >= 0.25 ? 'Наружная стена' : 'Перегородка';
      html = `<div class="ed-props-head"><strong>${kind}</strong><button type="button" class="ed-danger" id="ed-del">Удалить</button></div>
        <div class="ed-grid">
          ${num('ed-len', 'Длина, м', g.len, 0.05)}
          <label class="ed-field" for="ed-thick"><span>Толщина</span><select id="ed-thick">
            ${[0.1, 0.15, 0.3].map(t => `<option value="${t}" ${Math.abs((w.thickness ?? 0.3) - t) < 1e-6 ? 'selected' : ''}>${t * 1000} мм</option>`).join('')}
          </select></label>
          <p class="ed-readout" id="ed-coords"></p>
        </div>`;
    } else if (sel.kind === 'opening') {
      const o = sel.opening;
      html = `<div class="ed-props-head"><strong>${TYPE_NAMES[o.type] ?? 'Проём'}</strong><button type="button" class="ed-danger" id="ed-del">Удалить</button></div>
        <div class="ed-grid">
          <label class="ed-field" for="ed-type"><span>Тип</span><select id="ed-type">
            ${Object.entries(TYPE_NAMES).map(([v, n]) => `<option value="${v}" ${o.type === v ? 'selected' : ''}>${n}</option>`).join('')}
          </select></label>
          ${num('ed-off', 'От начала стены, м', o.offset)}
          ${slider('ed-w', 'Ширина, м', o.width, 0.4, o.type === 'window' ? 3 : 2.4)}
          ${slider('ed-h', 'Высота, м', o.height, 0.4, 2.7)}
          ${o.type === 'window' ? slider('ed-sill', 'Низ окна от пола, м', o.sill ?? 0, 0, 1.8) : ''}
        </div>`;
    } else if (sel.kind === 'skylight') {
      const s = sel.win;
      html = `<div class="ed-props-head"><strong>Мансардное окно</strong><button type="button" class="ed-danger" id="ed-del">Удалить</button></div>
        <div class="ed-grid">
          ${slider('ed-sw', 'Ширина, м', s.x[1] - s.x[0], 0.4, 1.6)}
          ${slider('ed-sl', 'Высота по скату, м', (s.y[1] - s.y[0]) * slopeK(sel.roof), 0.5, 2.0)}
        </div>`;
    } else if (sel.kind === 'room') {
      const r = sel.room;
      html = `<div class="ed-props-head"><strong>Помещение</strong><button type="button" class="ed-danger" id="ed-del">Удалить подпись</button></div>
        <div class="ed-grid">
          ${field('ed-room-name', 'Название', String(r.name).replace(/"/g, '&quot;'), 'type="text" autocomplete="off"')}
          <label class="ed-field" for="ed-room-color"><span>Цвет пола</span><input id="ed-room-color" type="color" value="${r.color ?? '#d9c9a8'}"></label>
        </div>`;
    }
    props.innerHTML = html;
    refreshReadouts();

    const on = (id, fn) => {
      const el = props.querySelector('#' + id);
      if (!el) return;
      const range = props.querySelector('#' + id + '-r');
      const pair = [el, range].filter(Boolean);
      for (const inp of pair) {
        const other = pair.find(x => x !== inp);
        inp.addEventListener('focus', begin);
        inp.addEventListener('input', () => {
          begin();
          if (other) other.value = inp.value;
          fn(inp);
          render();
          live();
        });
        inp.addEventListener('change', () => { fn(inp); commit(); });
      }
    };
    props.querySelector('#ed-del')?.addEventListener('click', deleteSelected);
    if (sel?.kind === 'wall') {
      const w = sel.wall;
      on('ed-len', el => {
        const L = parseFloat(el.value);
        if (!(L > 0.1)) return;
        const g = wallGeom(w);
        const p = [w.from[0] + g.u[0] * L, w.from[1] + g.u[1] * L];
        const linked = connectedEnds(w.to, w);
        setEnd(w, 'to', p);
        for (const l of linked) setEnd(l.w, l.end, p);
      });
      on('ed-thick', el => { w.thickness = parseFloat(el.value); });
    } else if (sel?.kind === 'opening') {
      const o = sel.opening;
      const w = walls().find(x => x.id === o.wall);
      const clamp = () => { const L = wallGeom(w).len; o.width = Math.min(o.width, r2(L)); o.offset = r2(Math.max(0, Math.min(L - o.width, o.offset))); };
      on('ed-type', el => { o.type = el.value; if (o.type !== 'window') o.sill = 0; });
      on('ed-w', el => {
        const v = parseFloat(el.value);
        if (!(v > 0.2)) return;
        const c = o.offset + o.width / 2;   // ширина меняется от центра
        o.width = r2(v);
        o.offset = r2(c - o.width / 2);
        clamp();
      });
      on('ed-h', el => { const v = parseFloat(el.value); if (v > 0.2) o.height = v; });
      on('ed-sill', el => { const v = parseFloat(el.value); if (v >= 0) o.sill = v; });
      on('ed-off', el => { const v = parseFloat(el.value); if (v >= 0) { o.offset = v; clamp(); } });
    } else if (sel?.kind === 'skylight') {
      const s = sel.win;
      const k = slopeK(sel.roof);
      on('ed-sw', el => {
        const v = parseFloat(el.value);
        if (!(v > 0.3)) return;
        const c = (s.x[0] + s.x[1]) / 2;
        s.x = [r2(c - v / 2), r2(c + v / 2)];
      });
      on('ed-sl', el => {
        const v = parseFloat(el.value) / k;   // по скату → на плане
        if (!(v > 0.2)) return;
        const c = (s.y[0] + s.y[1]) / 2;
        s.y = [r2(c - v / 2), r2(c + v / 2)];
      });
    } else if (sel?.kind === 'room') {
      const r = sel.room;
      on('ed-room-name', el => { r.name = el.value; });
      on('ed-room-color', el => { r.color = el.value; });
    }
  }

  // Во сколько раз длина по скату больше длины на плане.
  function slopeK(roof) {
    if (!roof) return 1;
    const hs = roof.corners.map(c => c[2]);
    const hi = roof.corners[hs.indexOf(Math.max(...hs))], lo = roof.corners[hs.indexOf(Math.min(...hs))];
    const dy = Math.abs(hi[1] - lo[1]), dh = hi[2] - lo[2];
    return dy > 1e-6 ? Math.hypot(dy, dh) / dy : 1;
  }

  // Живое обновление 3D во время перетаскивания ползунка (не чаще ~8 раз в секунду).
  let liveTimer = null;
  function live() {
    if (liveTimer) return;
    liveTimer = setTimeout(() => { liveTimer = null; onChange(house); }, 120);
  }

  function refreshReadouts() {
    const c = props.querySelector('#ed-coords');
    if (c && sel?.kind === 'wall') {
      const w = sel.wall;
      c.textContent = `от (${w.from.map(v => v.toFixed(2)).join('; ')}) до (${w.to.map(v => v.toFixed(2)).join('; ')}) м`;
    }
  }

  // ---------- внешнее API ----------
  function setFloor(i) {
    floorIdx = i;
    sel = null;
    draft = null;
    rooms = computeRooms(floor());
    fit();
    onFloor?.(i);
  }

  return {
    setHouse(h, { keepView = false } = {}) {
      house = h;
      $('ed-floors').innerHTML = '';
      house.floors.forEach((f, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = f.short ?? `${i + 1} этаж`;
        b.onclick = () => setFloor(i);
        $('ed-floors').append(b);
      });
      floorIdx = Math.min(floorIdx, house.floors.length - 1);
      sel = null;
      rooms = computeRooms(floor());
      if (!keepView || !view) requestAnimationFrame(fit); else render();
    },
    get floor() { return floorIdx; },
    setFloor,
    setStatus(text) { $('ed-status').textContent = text; },
    onReset(fn) { $('ed-reset').onclick = fn; },
    onDownload(fn) { $('ed-download').onclick = fn; },
    onClose(fn) { $('ed-close').onclick = fn; },
    resize() { if (view) { render(); } },
    fit,
    setTool,
    // Выбрать проём или мансардное окно (например, по нажатию в 3D).
    select(target) {
      setTool('select');
      if (target.kind === 'opening') {
        const fi = house.floors.findIndex(f => (f.openings ?? []).includes(target.opening));
        if (fi < 0) return;
        if (fi !== floorIdx) setFloor(fi);
        sel = { kind: 'opening', opening: target.opening, wall: walls().find(w => w.id === target.opening.wall) };
      } else if (target.kind === 'skylight') {
        const top = house.floors.length - 1;
        if (floorIdx !== top) setFloor(top);
        sel = { kind: 'skylight', roof: target.roof, win: target.win };
      }
      render();
    },
  };
}
