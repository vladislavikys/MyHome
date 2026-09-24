// 2D-редактор плана этажа: стены, проёмы, мансардные окна, подписи комнат.
// Работает мышью и пальцем. Меняет объект house на месте и сообщает об изменениях.

import { computeRooms } from './rooms.js';
import { stairSteps } from './stairs.js';
import { AREA_KINDS, ITEM_TYPES } from './landscape.js';
import { FURNITURE, FLOOR_FINISHES, WALL_FINISHES, furnSize } from './interior.js';

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
  ['furniture', 'Мебель', 'Выберите предмет и нажмите в комнате. Отделка пола и стен — нажмите на подпись комнаты.'],
];

const SITE_TOOLS = [
  ['select', 'Выбор', 'Тяните дом, постройки, дорожки, ворота или углы участка. Нажмите на дом или постройку, чтобы повернуть.'],
  ['area', 'Покрытие', 'Выберите покрытие и нажмите на участке. Форму меняйте, таща кружки на углах.'],
  ['plant', 'Растения', 'Выберите растение и нажимайте на участке — можно посадить сразу несколько.'],
  ['decor', 'Декор', 'Выберите объект и нажмите на участке.'],
  ['gate', 'Ворота', 'Нажмите на забор там, где нужны ворота или калитка.'],
  ['building', 'Постройка', 'Нажмите на участке там, где поставить новую постройку.'],
];

const TYPE_NAMES = { window: 'Окно', door: 'Дверь', glassdoor: 'Витражная дверь' };

const snap = v => Math.round(v / SNAP) * SNAP;
const r2 = v => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const uid = p => p + Math.random().toString(36).slice(2, 7);

// Поворот точки на deg° вокруг c (на плане: ось y вниз).
function rotP(p, deg, c = [0, 0]) {
  const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a), x = p[0] - c[0], y = p[1] - c[1];
  return [c[0] + x * co - y * si, c[1] + x * si + y * co];
}

function insidePoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

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

export function createEditor(root, { onChange, onFloor, onSite }) {
  let house = null;
  let floorIdx = 0;
  let siteMode = false;   // вкладка «Участок»
  const palette = { area: 'paving', plant: 'tree', decor: 'lamp', furniture: 'bed2' };
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
  // панель свойств меняет высоту → меняется и область плана; без перерисовки клики «съезжают»
  let lastSize = '';
  new ResizeObserver(() => {
    const r = svg.getBoundingClientRect(), key = `${Math.round(r.width)}x${Math.round(r.height)}`;
    if (key !== lastSize && view) { lastSize = key; requestAnimationFrame(render); }
  }).observe(svg);

  function renderTools() {
    $('ed-tools').innerHTML = '';
    for (const [key, label] of siteMode ? SITE_TOOLS : TOOLS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.tool = key;
      b.textContent = label;
      b.onclick = () => setTool(key);
      b.setAttribute('aria-pressed', key === tool);
      $('ed-tools').append(b);
    }
  }
  renderTools();

  const floor = () => house.floors[floorIdx];
  const furnPoly = it => {
    const [w, d] = furnSize(it), [x, y] = it.at;
    return [[x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]].map(q => rotP(q, it.rot ?? 0, it.at));
  };
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
    const pts = siteMode ? fitSite() : [...(floor().outline ?? []), ...walls().flatMap(w => [w.from, w.to])];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const pad = siteMode ? 2.0 : 1.0;
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
    // по фактической матрице отрисовки — клик попадает туда, что видно на экране
    const m = svg.getScreenCTM?.();
    if (m) { const q = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()); return [q.x, q.y]; }
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
    for (const s of skylights()) {
      const [a, b] = s.win.x, [c, d] = s.win.y;
      if (p[0] >= a && p[0] <= b && p[1] >= c && p[1] <= d) return { kind: 'skylight', ...s };
    }
    for (const [k, room] of (floor().rooms ?? []).entries()) {
      if (room.at && Math.abs(p[0] - room.at[0]) < 0.9 && Math.abs(p[1] - room.at[1]) < 0.35) return { kind: 'room', room, index: k };
    }
    for (const it of [...(floor().furniture ?? [])].reverse()) if (insidePoly(p, furnPoly(it))) return { kind: 'furn', it };
    let best = null, bestD = Infinity;
    for (const w of walls()) {
      const pr = projectOnWall(w, p);
      const lim = Math.max((w.thickness ?? 0.3) / 2, tol);
      if (pr.t >= -0.1 && pr.t <= pr.g.len + 0.1 && pr.d < lim && pr.d < bestD) { best = w; bestD = pr.d; }
    }
    if (best) return { kind: 'wall', wall: best };
    return null;
  }

  // ---------- участок ----------
  // Дом ставится на участок точкой at и поворотом rot (°); постройки поворачиваются вокруг своего центра.
  const site = () => (house.site ??= { boundary: [], gates: [], buildings: [], paths: [] });
  const place = () => (site().house ??= { at: [0, 0], rot: 0 });
  const placeRO = () => ({ at: house.site?.house?.at ?? [0, 0], rot: house.site?.house?.rot ?? 0 });
  const toSite = p => { const pl = placeRO(); const q = rotP(p, pl.rot); return [q[0] + pl.at[0], q[1] + pl.at[1]]; };
  const houseOutline = () => house.floors[0].outline ?? [];
  const houseCenter = () => {
    const o = houseOutline(), xs = o.map(p => p[0]), ys = o.map(p => p[1]);
    return xs.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : [0, 0];
  };
  const bldCenter = b => [(b.rect[0] + b.rect[2]) / 2, (b.rect[1] + b.rect[3]) / 2];
  const bldPoly = b => {
    const [x0, y0, x1, y1] = b.rect, c = bldCenter(b);
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(p => rotP(p, b.rot ?? 0, c));
  };
  const gateObj = g => Array.isArray(g) ? { at: [g[0], g[1]], width: g[2] * 2, type: 'gap' } : g;
  // ребро забора, ближайшее к точке
  function nearestEdge(p) {
    const B = house.site?.boundary ?? [];
    let best = null;
    for (let i = 0; i < B.length; i++) {
      const w = { from: B[i], to: B[(i + 1) % B.length] };
      const pr = projectOnWall(w, p);
      if (!best || pr.d < best.pr.d) best = { i, pr };
    }
    return best;
  }

  const itemR = it => { const T = ITEM_TYPES[it.type]; return T?.rect ? Math.max(...T.rect) / 2 * (it.size ?? 1) : (T?.r ?? 0.5) * (it.size ?? 1); };
  const itemRect = it => {
    const T = ITEM_TYPES[it.type], s = it.size ?? 1, [w, d] = T.rect.map(v => v * s / 2), [x, y] = it.at;
    return [[x - w, y - d], [x + w, y - d], [x + w, y + d], [x - w, y + d]].map(q => rotP(q, it.rot ?? 0, it.at));
  };
  const polyCenter = poly => {
    const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  };
  function rotatePath(path, deg) {
    const c = polyCenter(path.poly);
    path.poly = path.poly.map(q => rotP(q, deg, c)).map(q => [r2(q[0]), r2(q[1])]);
  }
  function newArea(kind, p) {
    const K = AREA_KINDS[kind], [w, d] = K.size, [x, y] = [snap(p[0]), snap(p[1])];
    const poly = K.round
      ? Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return [r2(x + Math.cos(a) * w / 2), r2(y + Math.sin(a) * d / 2)]; })
      : [[x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]].map(q => q.map(r2));
    return { name: K.name, kind, poly };
  }

  // Двери построек: в неповёрнутых координатах постройки, на грани одной из стен.
  const doorSeg = (b, d) => {
    const hw = d.width / 2, [x, y] = d.at, c = bldCenter(b);
    return (d.axis === 'y' ? [[x, y - hw], [x, y + hw]] : [[x - hw, y], [x + hw, y]]).map(q => rotP(q, b.rot ?? 0, c));
  };
  function placeDoor(b, d, p) {
    const c = bldCenter(b), q = rotP(p, -(b.rot ?? 0), c);
    const [x0, y0, x1, y1] = b.rect, hw = d.width / 2;
    const cx = Math.max(x0 + hw, Math.min(x1 - hw, q[0])), cy = Math.max(y0 + hw, Math.min(y1 - hw, q[1]));
    const sides = [[Math.abs(q[1] - y0), [r2(snap(cx)), r2(y0 - 0.03)], 'x'], [Math.abs(q[1] - y1), [r2(snap(cx)), r2(y1 + 0.03)], 'x'],
      [Math.abs(q[0] - x0), [r2(x0 - 0.03), r2(snap(cy))], 'y'], [Math.abs(q[0] - x1), [r2(x1 + 0.03), r2(snap(cy))], 'y']];
    const [, at, axis] = sides.sort((a, b2) => a[0] - b2[0])[0];
    d.at = at;
    if (axis === 'y') d.axis = 'y'; else delete d.axis;
  }

  // Двускатная крыша: полупролёт с свесом и уклон в градусах (как в 3D: main.js outbuilding).
  const gableSpan = b => {
    const w = b.rect[2] - b.rect[0], d = b.rect[3] - b.rect[1];
    const alongX = b.ridge ? b.ridge === 'x' : w >= d - 1e-6;
    return (alongX ? d : w) / 2 + (b.overhang ?? 0.4);
  };
  const gablePitch = b => { const s = gableSpan(b); return Math.atan2(b.rise ?? s * 0.7, s) * 180 / Math.PI; };

  function setHouseRot(deg) {
    const pl = place(), c = houseCenter();
    const S = toSite(c);
    pl.rot = ((Math.round(deg) % 360) + 360) % 360;
    const q = rotP(c, pl.rot);
    pl.at = [r2(S[0] - q[0]), r2(S[1] - q[1])];
  }

  function siteHit(p) {
    const tol = HIT_PX / pxPerM();
    const s = house.site ?? {};
    const B = s.boundary ?? [];
    if (sel?.kind === 'path') {
      for (let i = 0; i < sel.path.poly.length; i++) if (dist(p, sel.path.poly[i]) < tol * 1.3) return { kind: 'pvert', path: sel.path, i };
    }
    for (let i = 0; i < B.length; i++) if (dist(p, B[i]) < tol * 1.3) return { kind: 'corner', i };
    for (const it of [...(s.items ?? [])].reverse()) {
      const T = ITEM_TYPES[it.type];
      if (T?.rect ? insidePoly(p, itemRect(it)) : dist(p, it.at) < Math.max(tol, itemR(it) * (T?.group === 'plant' ? 0.6 : 1))) return { kind: 'item', it };
    }
    for (const [i, g0] of (s.gates ?? []).entries()) {
      const g = gateObj(g0);
      if (dist(p, g.at) < Math.max(g.width / 2, tol * 1.5)) {
        const e = nearestEdge(g.at);
        if (!e || projectOnWall({ from: g.at, to: [g.at[0] + e.pr.g.u[0], g.at[1] + e.pr.g.u[1]] }, p).d < 0.8) return { kind: 'gate', i };
      }
    }
    if (sel?.kind === 'bld' || sel?.kind === 'bdoor') {
      const b = sel.b;
      for (const door of b.doors ?? []) {
        const [a, c] = doorSeg(b, door);
        if (projectOnWall({ from: a, to: c }, p).d < Math.max(tol, 0.25)) return { kind: 'bdoor', b, door };
      }
    }
    for (const b of [...(s.buildings ?? [])].reverse()) if (insidePoly(p, bldPoly(b))) return { kind: 'bld', b };
    if (insidePoly(p, houseOutline().map(toSite))) return { kind: 'house' };
    for (const path of [...(s.paths ?? [])].reverse()) if (insidePoly(p, path.poly)) return { kind: 'path', path };
    return null;
  }

  function siteDown(p, ev) {
    if (tool === 'gate') {
      const e = nearestEdge(p);
      if (!e || e.pr.d > 1.5) return;
      begin();
      const s = site();
      s.gates = (s.gates ?? []).map(gateObj);
      const g = { name: 'Ворота', at: [r2(snap(e.pr.q[0])), r2(snap(e.pr.q[1]))], width: 4.0, type: 'slide' };
      s.gates.push(g);
      sel = { kind: 'gate', i: s.gates.length - 1 };
      tool = 'select';
      commit();
      renderTools();
      return;
    }
    if (tool === 'area') {
      begin();
      const a = newArea(palette.area, p);
      (site().paths ??= []).push(a);
      sel = { kind: 'path', path: a };
      tool = 'select';
      commit();
      renderTools();
      return;
    }
    if (tool === 'plant' || tool === 'decor') {
      begin();
      const it = { type: palette[tool], at: [r2(snap(p[0])), r2(snap(p[1]))] };
      (site().items ??= []).push(it);
      if (tool === 'decor') { sel = { kind: 'item', it }; tool = 'select'; renderTools(); }
      commit();
      return;
    }
    if (tool === 'building') {
      begin();
      const [x, y] = [snap(p[0]), snap(p[1])];
      const b = { name: 'Постройка', rect: [r2(x - 2), r2(y - 1.5), r2(x + 2), r2(y + 1.5)], height: 2.6, roof: 'shed', drop: 0.4,
        wallColor: '#c9a27a', wallTexture: 'soffit', roofColor: '#8d8f8c',
        doors: [{ at: [r2(x), r2(y + 1.53)], width: 0.9, height: 1.9, color: '#6e4a2f' }] };
      (site().buildings ??= []).push(b);
      sel = { kind: 'bld', b };
      tool = 'select';
      commit();
      renderTools();
      return;
    }
    const h = siteHit(p);
    if (!h) {
      sel = null;
      drag = { kind: 'pan', start: [ev.clientX, ev.clientY], view0: { ...view } };
      render();
      return;
    }
    begin();
    if (h.kind === 'gate') {
      const s = site();
      s.gates = s.gates.map(gateObj);
      sel = h;
      drag = { kind: 's-gate', g: s.gates[h.i] };
    } else if (h.kind === 'corner') {
      sel = h;
      drag = { kind: 's-corner', i: h.i };
    } else if (h.kind === 'bld') {
      sel = h;
      drag = { kind: 's-bld', b: h.b, p0: p, rect0: [...h.b.rect], doors0: (h.b.doors ?? []).map(d => [...d.at]) };
    } else if (h.kind === 'house') {
      sel = h;
      drag = { kind: 's-house', p0: p, at0: [...place().at] };
    } else if (h.kind === 'bdoor') {
      sel = h;
      drag = { kind: 's-bdoor', b: h.b, door: h.door };
    } else if (h.kind === 'pvert') {
      drag = { kind: 's-pvert', path: h.path, i: h.i };
    } else if (h.kind === 'item') {
      sel = h;
      drag = { kind: 's-item', it: h.it, p0: p, at0: [...h.it.at] };
    } else if (h.kind === 'path') {
      sel = h;
      drag = { kind: 's-path', path: h.path, p0: p, poly0: h.path.poly.map(q => [...q]) };
    }
    render();
  }

  function siteMove(p) {
    const d = drag.p0 ? [snap(p[0] - drag.p0[0]), snap(p[1] - drag.p0[1])] : null;
    const add = (q, v) => [r2(q[0] + v[0]), r2(q[1] + v[1])];
    if (drag.kind === 's-bld') {
      drag.b.rect = [drag.rect0[0] + d[0], drag.rect0[1] + d[1], drag.rect0[2] + d[0], drag.rect0[3] + d[1]].map(r2);
      (drag.b.doors ?? []).forEach((door, k) => { door.at = add(drag.doors0[k], d); });
    } else if (drag.kind === 's-house') {
      place().at = add(drag.at0, d);
    } else if (drag.kind === 's-path') {
      drag.path.poly = drag.poly0.map(q => add(q, d));
    } else if (drag.kind === 's-bdoor') {
      placeDoor(drag.b, drag.door, p);
    } else if (drag.kind === 's-item') {
      drag.it.at = add(drag.at0, d);
    } else if (drag.kind === 's-pvert') {
      drag.path.poly[drag.i] = [r2(snap(p[0])), r2(snap(p[1]))];
    } else if (drag.kind === 's-corner') {
      site().boundary[drag.i] = [r2(snap(p[0])), r2(snap(p[1]))];
    } else if (drag.kind === 's-gate') {
      const e = nearestEdge(p);
      if (e) drag.g.at = [r2(snap(e.pr.q[0])), r2(snap(e.pr.q[1]))];
    } else return false;
    live();
    return true;
  }

  function siteDelete() {
    const s = site();
    if (sel.kind === 'bld') s.buildings = s.buildings.filter(b => b !== sel.b);
    else if (sel.kind === 'gate') s.gates = s.gates.filter((g, i) => i !== sel.i);
    else if (sel.kind === 'path') s.paths = s.paths.filter(p => p !== sel.path);
    else if (sel.kind === 'item') s.items = s.items.filter(it => it !== sel.it);
    else if (sel.kind === 'bdoor') sel.b.doors = sel.b.doors.filter(d => d !== sel.door);
    else if (sel.kind === 'corner' && s.boundary.length > 3) s.boundary.splice(sel.i, 1);
    else return false;
    return true;
  }

  function fitSite() {
    const s = house.site ?? {};
    const pts = [...(s.boundary ?? []), ...(s.buildings ?? []).flatMap(bldPoly), ...houseOutline().map(toSite)];
    return pts.length ? pts : [[0, 0], [10, 10]];
  }

  function renderSite(out, k) {
    const s = house.site ?? {};
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const pts = a => a.map(p => p.join(',')).join(' ');
    const label = (p, t, cls = 'g-room-name') => out.push(`<text class="${cls}" x="${p[0]}" y="${p[1]}" font-size="${13 * k}">${esc(t)}</text>`);
    if (s.boundary?.length) out.push(`<polygon class="g-bound" points="${pts(s.boundary)}" stroke-width="${3 * k}"/>`);
    for (const path of s.paths ?? []) {
      const K = AREA_KINDS[path.kind ?? (path.texture === 'gravel' ? 'gravel' : 'paving')];
      out.push(`<polygon class="g-area" points="${pts(path.poly)}" fill="${K?.fill ?? '#bbb'}"/>`);
    }
    // дом: контур и стены 1-го этажа
    const hp = houseOutline().map(toSite);
    if (hp.length) out.push(`<polygon class="g-slab g-house" points="${pts(hp)}"/>`);
    for (const w of house.floors[0].walls) {
      if (w.virtual) continue;
      const a = toSite(w.from), b = toSite(w.to), t = w.thickness ?? 0.3;
      const cls = w.material === 'glass' ? 'g-glass' : t >= 0.25 ? 'g-wall g-ext' : 'g-wall';
      out.push(`<line class="${cls}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${Math.max(t, 2 * k)}"/>`);
    }
    if (hp.length) label(toSite(houseCenter()), 'Дом');
    for (const b of s.buildings ?? []) {
      out.push(`<polygon class="g-bld" points="${pts(bldPoly(b))}" stroke-width="${2 * k}"/>`);
      const c = bldCenter(b);
      for (const d of b.doors ?? []) {
        const [p0, p1] = doorSeg(b, d);
        out.push(`<line class="g-op g-door" x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0]}" y2="${p1[1]}" stroke-width="${5 * k}"/>`);
      }
      label(c, b.name ?? 'Постройка');
    }
    for (const it of s.items ?? []) {
      const T = ITEM_TYPES[it.type];
      if (!T) continue;
      if (T.rect) out.push(`<polygon class="g-item" points="${pts(itemRect(it))}" fill="${T.fill}" stroke-width="${1 * k}"/>`);
      else out.push(`<circle class="g-item${T.group === 'plant' ? ' g-plant' : ''}" cx="${it.at[0]}" cy="${it.at[1]}" r="${Math.max(itemR(it), 3 * k)}" fill="${T.fill}" stroke-width="${1 * k}"/>`);
    }
    for (const g0 of s.gates ?? []) {
      const g = gateObj(g0), e = nearestEdge(g.at);
      if (!e) continue;
      const u = e.pr.g.u, hw = g.width / 2;
      out.push(`<line class="g-gate${g.type === 'gap' ? ' g-gate-gap' : ''}" x1="${g.at[0] - u[0] * hw}" y1="${g.at[1] - u[1] * hw}" x2="${g.at[0] + u[0] * hw}" y2="${g.at[1] + u[1] * hw}" stroke-width="${7 * k}"/>`);
    }
    for (const c of s.boundary ?? []) out.push(`<circle class="g-handle" cx="${c[0]}" cy="${c[1]}" r="${5 * k}" stroke-width="${1.5 * k}"/>`);
    // выделение
    const selPoly = sel?.kind === 'bld' ? bldPoly(sel.b) : sel?.kind === 'house' ? hp : sel?.kind === 'path' ? sel.path.poly
      : sel?.kind === 'item' && ITEM_TYPES[sel.it.type]?.rect ? itemRect(sel.it) : null;
    if (selPoly) out.push(`<polygon class="g-sel-rect" points="${pts(selPoly)}" stroke-width="${3 * k}"/>`);
    if (sel?.kind === 'bdoor') {
      const [a, c] = doorSeg(sel.b, sel.door);
      out.push(`<line class="g-sel" x1="${a[0]}" y1="${a[1]}" x2="${c[0]}" y2="${c[1]}" stroke-width="${14 * k}"/>`);
    }
    if (sel?.kind === 'item' && !ITEM_TYPES[sel.it.type]?.rect) out.push(`<circle class="g-sel-rect" cx="${sel.it.at[0]}" cy="${sel.it.at[1]}" r="${Math.max(itemR(sel.it), 5 * k)}" stroke-width="${3 * k}"/>`);
    if (sel?.kind === 'path') for (const c of sel.path.poly) out.push(`<circle class="g-handle" cx="${c[0]}" cy="${c[1]}" r="${6 * k}" stroke-width="${2 * k}"/>`);
    if (sel?.kind === 'gate' && s.gates?.[sel.i]) {
      const g = gateObj(s.gates[sel.i]), e = nearestEdge(g.at);
      if (e) {
        const u = e.pr.g.u, hw = g.width / 2;
        out.push(`<line class="g-sel" x1="${g.at[0] - u[0] * hw}" y1="${g.at[1] - u[1] * hw}" x2="${g.at[0] + u[0] * hw}" y2="${g.at[1] + u[1] * hw}" stroke-width="${16 * k}"/>`);
      }
    }
    if (sel?.kind === 'corner' && s.boundary?.[sel.i]) {
      const c = s.boundary[sel.i];
      out.push(`<circle class="g-handle" cx="${c[0]}" cy="${c[1]}" r="${9 * k}" stroke-width="${3 * k}"/>`);
    }
  }

  function siteProps(field, num, slider) {
    const rotBtns = `<div class="ed-btnrow"><button type="button" id="ed-rl">↺ 90°</button><button type="button" id="ed-rr">↻ 90°</button></div>`;
    const rot15 = `<div class="ed-btnrow"><button type="button" id="ed-rl">↺ 90°</button><button type="button" id="ed-rl15">↺ 15°</button><button type="button" id="ed-rr15">↻ 15°</button><button type="button" id="ed-rr">↻ 90°</button></div>`;
    if (!sel) {
      const hint = `<p class="ed-hint">${SITE_TOOLS.find(t => t[0] === tool)[2]}</p>`;
      const list = tool === 'area' ? Object.entries(AREA_KINDS)
        : tool === 'plant' || tool === 'decor' ? Object.entries(ITEM_TYPES).filter(([, T]) => T.group === tool) : null;
      if (!list) return hint;
      return hint + `<div class="ed-palette">${list.map(([key, T]) =>
        `<button type="button" data-pal="${key}" aria-pressed="${palette[tool] === key}"><i style="background:${T.fill}"></i>${T.name}</button>`).join('')}</div>`;
    }
    if (sel.kind === 'item') {
      const it = sel.it, T = ITEM_TYPES[it.type] ?? { name: 'Объект' };
      return `<div class="ed-props-head"><strong>${T.name}</strong><button type="button" class="ed-danger" id="ed-del">Удалить</button></div>
        <div class="ed-grid">
          ${slider('ed-isize', 'Размер', it.size ?? 1, 0.5, 2, 0.05)}
          ${T.group === 'decor' ? slider('ed-rot', 'Поворот, °', it.rot ?? 0, 0, 359, 1) + rotBtns : ''}
          <p class="ed-hint">Тяните, чтобы передвинуть.</p>
        </div>`;
    }
    if (sel.kind === 'house') {
      return `<div class="ed-props-head"><strong>Дом</strong></div>
        <div class="ed-grid">${slider('ed-rot', 'Поворот, °', placeRO().rot, 0, 359, 1)}${rotBtns}
        <p class="ed-hint">Тяните дом мышью или пальцем, чтобы передвинуть.</p></div>`;
    }
    if (sel.kind === 'bld') {
      const b = sel.b;
      return `<div class="ed-props-head"><strong>${b.name ?? 'Постройка'}</strong><button type="button" class="ed-danger" id="ed-del">Удалить</button></div>
        <div class="ed-grid">
          ${field('ed-bname', 'Название', String(b.name ?? '').replace(/"/g, '&quot;'), 'type="text" autocomplete="off"')}
          ${num('ed-bw', 'Ширина, м', b.rect[2] - b.rect[0], 0.1)}
          ${num('ed-bd', 'Глубина, м', b.rect[3] - b.rect[1], 0.1)}
          ${num('ed-bh', 'Высота стен, м', b.height ?? 2.8, 0.1)}
          ${(b.roof ?? 'shed') === 'gable' ? slider('ed-pitch', 'Уклон крыши, °', Math.round(gablePitch(b) * 10) / 10, 10, 60, 0.5) + `<p class="ed-readout">Конёк на высоте ${((b.height ?? 2.8) + (b.rise ?? gableSpan(b) * 0.7)).toFixed(2)} м</p>` : ''}
          <label class="ed-field" for="ed-roof"><span>Крыша</span><select id="ed-roof">
            ${[['flat', 'Плоская'], ['shed', 'Односкатная'], ['gable', 'Двускатная']].map(([v, n]) => `<option value="${v}" ${(b.roof ?? 'shed') === v ? 'selected' : ''}>${n}</option>`).join('')}
          </select></label>
          ${slider('ed-rot', 'Поворот, °', b.rot ?? 0, 0, 359, 1)}${rotBtns}
          <div class="ed-btnrow"><button type="button" id="ed-adddoor">Добавить дверь</button></div>
          <p class="ed-hint">Двери постройки тянутся вдоль стен; нажмите на дверь, чтобы изменить размер или удалить.</p>
        </div>`;
    }
    if (sel.kind === 'bdoor') {
      const d = sel.door;
      return `<div class="ed-props-head"><strong>Дверь · ${sel.b.name ?? 'постройка'}</strong><button type="button" class="ed-danger" id="ed-del">Удалить</button></div>
        <div class="ed-grid">
          ${slider('ed-dw', 'Ширина, м', d.width, 0.6, 4, 0.05)}
          ${slider('ed-dh', 'Высота, м', d.height, 1.6, 3, 0.05)}
          <label class="ed-field" for="ed-dc"><span>Цвет</span><input id="ed-dc" type="color" value="${d.color ?? '#4a4038'}"></label>
          <p class="ed-hint">Тяните дверь вдоль стен постройки.</p>
        </div>`;
    }
    if (sel.kind === 'gate') {
      const g = gateObj(site().gates[sel.i]);
      const types = { slide: 'Откатные ворота', swing: 'Калитка (распашная)', gap: 'Проём без створки' };
      return `<div class="ed-props-head"><strong>${g.name ?? types[g.type]}</strong><button type="button" class="ed-danger" id="ed-del">Удалить</button></div>
        <div class="ed-grid">
          <label class="ed-field" for="ed-gtype"><span>Тип</span><select id="ed-gtype">
            ${Object.entries(types).map(([v, n]) => `<option value="${v}" ${g.type === v ? 'selected' : ''}>${n}</option>`).join('')}
          </select></label>
          ${slider('ed-gw', 'Ширина, м', g.width, 0.8, 6, 0.1)}
          ${g.type !== 'gap' ? `<button type="button" id="ed-gflip">${g.type === 'slide' ? 'Откатывать в другую сторону' : 'Петли с другой стороны'}</button>` : ''}
          <p class="ed-hint">Тяните ворота вдоль забора. В прогулке открываются клавишей E или кнопкой «Дверь».</p>
        </div>`;
    }
    if (sel.kind === 'path') {
      const kind = sel.path.kind ?? (sel.path.texture === 'gravel' ? 'gravel' : 'paving');
      return `<div class="ed-props-head"><strong>${sel.path.name ?? 'Дорожка'}</strong><button type="button" class="ed-danger" id="ed-del">Удалить</button></div>
        <div class="ed-grid">
          ${field('ed-pname', 'Название', String(sel.path.name ?? '').replace(/"/g, '&quot;'), 'type="text" autocomplete="off"')}
          <label class="ed-field" for="ed-pkind"><span>Покрытие</span><select id="ed-pkind">
            ${Object.entries(AREA_KINDS).map(([v, K]) => `<option value="${v}" ${kind === v ? 'selected' : ''}>${K.name}</option>`).join('')}
          </select></label>
          ${rot15}
          <p class="ed-hint">Тяните, чтобы передвинуть; кружки на углах меняют форму.</p>
        </div>`;
    }
    if (sel.kind === 'corner') {
      return `<div class="ed-props-head"><strong>Угол участка</strong><button type="button" class="ed-danger" id="ed-del">Убрать угол</button></div>
        <p class="ed-hint">Тяните угол, чтобы изменить границу участка.</p>`;
    }
    return '';
  }

  function sitePropsBind(on) {
    const btn = (id, fn) => props.querySelector('#' + id)?.addEventListener('click', () => { begin(); fn(); commit(); });
    props.querySelectorAll('[data-pal]').forEach(b => b.addEventListener('click', () => {
      palette[tool] = b.dataset.pal;
      propsKey = null;
      render();
    }));
    if (sel?.kind === 'path') {
      const path = sel.path;
      on('ed-pname', el => { path.name = el.value; });
      on('ed-pkind', el => { path.kind = el.value; delete path.texture; });
      btn('ed-rl', () => rotatePath(path, -90));
      btn('ed-rr', () => rotatePath(path, 90));
      btn('ed-rl15', () => rotatePath(path, -15));
      btn('ed-rr15', () => rotatePath(path, 15));
    } else if (sel?.kind === 'bdoor') {
      const d = sel.door, b = sel.b;
      on('ed-dw', el => { const v = parseFloat(el.value); if (v > 0.3) { d.width = v; placeDoor(b, d, rotP(d.at, b.rot ?? 0, bldCenter(b))); } });
      on('ed-dh', el => { const v = parseFloat(el.value); if (v > 1) d.height = Math.min(v, (b.height ?? 2.8) - 0.1); });
      on('ed-dc', el => { d.color = el.value; });
    } else if (sel?.kind === 'item') {
      const it = sel.it;
      const setRot = v => { it.rot = ((Math.round(v) % 360) + 360) % 360; };
      on('ed-isize', el => { const v = parseFloat(el.value); if (v > 0.2) it.size = v; });
      on('ed-rot', el => setRot(parseFloat(el.value) || 0));
      btn('ed-rl', () => setRot((it.rot ?? 0) - 90));
      btn('ed-rr', () => setRot((it.rot ?? 0) + 90));
    }
    if (sel?.kind === 'house') {
      on('ed-rot', el => setHouseRot(parseFloat(el.value) || 0));
      btn('ed-rl', () => setHouseRot(placeRO().rot - 90));
      btn('ed-rr', () => setHouseRot(placeRO().rot + 90));
    } else if (sel?.kind === 'bld') {
      const b = sel.b;
      const setRot = v => { b.rot = ((Math.round(v) % 360) + 360) % 360; };
      on('ed-rot', el => setRot(parseFloat(el.value) || 0));
      btn('ed-rl', () => setRot((b.rot ?? 0) - 90));
      btn('ed-rr', () => setRot((b.rot ?? 0) + 90));
      on('ed-bname', el => { b.name = el.value; });
      on('ed-bh', el => { const v = parseFloat(el.value); if (v > 1) b.height = v; });
      on('ed-pitch', el => { const v = parseFloat(el.value); if (v > 1 && v < 80) b.rise = r2(gableSpan(b) * Math.tan(v * Math.PI / 180)); });
      on('ed-roof', el => { b.roof = el.value; propsKey = null; });
      btn('ed-adddoor', () => {
        const d = { width: 0.9, height: 2.0, color: '#6e4a2f', at: [0, 0] };
        placeDoor(b, d, rotP([bldCenter(b)[0], b.rect[3] + 1], b.rot ?? 0, bldCenter(b)));
        (b.doors ??= []).push(d);
        sel = { kind: 'bdoor', b, door: d };
      });
      const resize = (w, d) => {
        const [cx, cy] = bldCenter(b), w0 = b.rect[2] - b.rect[0], d0 = b.rect[3] - b.rect[1];
        b.rect = [cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2].map(r2);
        for (const door of b.doors ?? []) door.at = [r2(cx + (door.at[0] - cx) * w / w0), r2(cy + (door.at[1] - cy) * d / d0)];
      };
      on('ed-bw', el => { const v = parseFloat(el.value); if (v > 1) resize(v, b.rect[3] - b.rect[1]); });
      on('ed-bd', el => { const v = parseFloat(el.value); if (v > 1) resize(b.rect[2] - b.rect[0], v); });
    } else if (sel?.kind === 'gate') {
      const g = () => site().gates[sel.i];
      on('ed-gtype', el => { g().type = el.value; propsKey = null; });
      on('ed-gw', el => { const v = parseFloat(el.value); if (v > 0.5) g().width = v; });
      btn('ed-gflip', () => { if (g().flip) delete g().flip; else g().flip = true; });
    }
  }

  // ---------- действия ----------
  function setTool(t) {
    tool = t;
    draft = null;
    if (t !== 'select') sel = null;
    root.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
    render();
  }

  function deleteSelected() {
    if (!sel) return;
    begin();
    if (siteMode) {
      if (siteDelete()) { sel = null; commit(); } else pending = null;
      return;
    }
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
    } else if (sel.kind === 'furn') {
      f.furniture = f.furniture.filter(it => it !== sel.it);
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

  function placeFurniture(p) {
    begin();
    const it = { type: palette.furniture, at: [r2(snap(p[0])), r2(snap(p[1]))] };
    (floor().furniture ??= []).push(it);
    sel = { kind: 'furn', it };
    tool = 'select';
    root.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === tool));
    commit();
    $('ed-status').textContent = `Поставлено: ${FURNITURE[it.type]?.name ?? 'предмет'} — тяните, чтобы передвинуть`;
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
    if (siteMode) { siteDown(p, ev); return; }

    if (tool === 'wall') {
      if (!draft) draft = { from: snapPoint(p), to: snapPoint(p), pointer: ev.pointerId, t0: performance.now() };
      else { draft.to = snapPoint(p, { ortho: draft.from }); finishWall(); }
      render();
      return;
    }
    if (tool === 'window' || tool === 'door') { addOpening(p, tool); return; }
    if (tool === 'skylight') { addSkylight(p); return; }
    if (tool === 'room') { addRoom(p); return; }
    if (tool === 'furniture') { placeFurniture(p); return; }

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
    } else if (h.kind === 'furn') {
      drag = { kind: 'furn', it: h.it, p0: p, at0: [...h.it.at] };
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
    } else if (drag.kind.startsWith('s-')) {
      siteMove(p);
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
    } else if (drag.kind === 'furn') {
      drag.it.at = [r2(drag.at0[0] + snap(p[0] - drag.p0[0])), r2(drag.at0[1] + snap(p[1] - drag.p0[1]))];
      live();
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
    if (siteMode) {
      renderSite(out, k);
      svg.innerHTML = out.join('');
      renderProps();
      markTabs();
      $('ed-undo').disabled = undoStack.length === 0;
      return;
    }

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
    // ступени лестниц: на своём этаже — сплошные, на этаже выше — бледные
    for (const st of house.stairs ?? []) {
      const fi = st.floor ?? 0;
      if (floorIdx !== fi && floorIdx !== fi + 1) continue;
      const cls = floorIdx === fi ? 'g-stair' : 'g-stair g-stair-up';
      for (const { poly } of stairSteps(st)) {
        out.push(`<polygon class="${cls}" points="${poly.map(p => p.join(',')).join(' ')}" stroke-width="${1 * k}"/>`);
      }
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
      if (o.type === 'door' && o.slide) {
        // раздвижная: полотно пунктиром вдоль стены
        const sw = o.flip ? -1 : 1, sh = o.hingeEnd ? -1 : 1;
        const off = ((w.thickness ?? 0.3) / 2 + 0.05) * sw;
        const shift = -sh * o.width * (o.open ?? 0.8);
        const p0 = [a[0] + g.u[0] * shift + g.n[0] * off, a[1] + g.u[1] * shift + g.n[1] * off];
        const p1 = [b[0] + g.u[0] * shift + g.n[0] * off, b[1] + g.u[1] * shift + g.n[1] * off];
        out.push(`<line class="g-swing" x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0]}" y2="${p1[1]}" stroke-width="${3 * k}"/>`);
      } else if (o.type === 'door') {
        // дуга открывания
        const r = o.width;
        const sw = o.flip ? -1 : 1;
        const [h, q] = o.hingeEnd ? [b, a] : [a, b];   // петли и свободный край
        const e = [h[0] + g.n[0] * r * sw, h[1] + g.n[1] * r * sw];
        const sweep = (o.flip ? 1 : 0) ^ (o.hingeEnd ? 1 : 0) ? 0 : 1;
        out.push(`<path class="g-swing" d="M${h[0]} ${h[1]}L${e[0]} ${e[1]}A${r} ${r} 0 0 ${sweep} ${q[0]} ${q[1]}" stroke-width="${1.2 * k}"/>`);
      }
    }

    // мансардные окна
    for (const s of skylights()) {
      const [a, b] = s.win.x, [c, d] = s.win.y;
      out.push(`<rect class="g-sky" x="${a}" y="${c}" width="${b - a}" height="${d - c}" stroke-width="${1.5 * k}"/>`);
    }

    // мебель
    for (const it of f.furniture ?? []) {
      const T = FURNITURE[it.type];
      const poly = furnPoly(it);
      out.push(`<polygon class="g-furn" points="${poly.map(q => q.join(',')).join(' ')}" fill="${it.color ?? T?.fill ?? '#ccc'}" stroke-width="${1 * k}"/>`);
      const [w, d] = furnSize(it);
      const fr = [rotP([it.at[0] - w / 2, it.at[1] + d / 2], it.rot ?? 0, it.at), rotP([it.at[0] + w / 2, it.at[1] + d / 2], it.rot ?? 0, it.at)];
      out.push(`<line class="g-furn-front" x1="${fr[0][0]}" y1="${fr[0][1]}" x2="${fr[1][0]}" y2="${fr[1][1]}" stroke-width="${2.5 * k}"/>`);
      if (sel?.kind === 'furn' && sel.it === it) out.push(`<polygon class="g-sel-rect" points="${poly.map(q => q.join(',')).join(' ')}" stroke-width="${3 * k}"/>`);
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
    markTabs();
    $('ed-undo').disabled = undoStack.length === 0;
    const sk = root.querySelector('[data-tool="skylight"]');
    if (sk) sk.disabled = !isTop();
  }
  function markTabs() {
    root.querySelectorAll('#ed-floors button').forEach(b =>
      b.setAttribute('aria-pressed', b.dataset.site ? siteMode : !siteMode && Number(b.dataset.floor) === floorIdx));
  }

  // ---------- свойства ----------
  let propsKey = null;
  function renderProps() {
    const key = siteMode ? 'site:' + (sel ? sel.kind + (sel.i ?? '') + (sel.b ? house.site.buildings.indexOf(sel.b) + ':' + (sel.door ? sel.b.doors.indexOf(sel.door) : '') : '') + (sel.it ? house.site.items.indexOf(sel.it) : '') + (sel.path ? house.site.paths.indexOf(sel.path) : '') : tool + palette[tool]) : sel ? sel.kind + ':' + (sel.it ? (floor().furniture ?? []).indexOf(sel.it) : '') + (sel.wall?.id ?? '') + (sel.opening ? house.floors[floorIdx].openings.indexOf(sel.opening) : '') : 'tool:' + tool;
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
    if (siteMode) {
      html = siteProps(field, num, slider);
    } else if (!sel) {
      html = `<p class="ed-hint">${TOOLS.find(t => t[0] === tool)[2]}</p>`;
      if (tool === 'furniture') {
        const groups = [...new Set(Object.values(FURNITURE).map(T => T.group))];
        html += `<label class="ed-field ed-pal-select" for="ed-pal"><span>Предмет</span><select id="ed-pal">${groups.map(gr => `<optgroup label="${gr}">${
          Object.entries(FURNITURE).filter(([, T]) => T.group === gr).map(([key, T]) => `<option value="${key}" ${palette.furniture === key ? 'selected' : ''}>${T.name}</option>`).join('')}</optgroup>`).join('')}</select></label>
          <div class="ed-btnrow"><button type="button" id="ed-place-center">Поставить в центр плана</button></div>`;
      }
      const sk = skylights();
      if (tool === 'select' && sk.length) {
        html += `<div class="ed-sky-list"><span>Мансардные окна:</span>${sk.map((s, i) =>
          `<button type="button" data-sky="${i}">${s.win.name ?? 'Окно ' + (i + 1)}</button>`).join('')}</div>`;
      } else if (tool === 'select' && !isTop()) {
        html += `<p class="ed-hint">Мансардные окна настраиваются на вкладке «${house.floors.at(-1).short ?? 'верхний этаж'}».</p>`;
      }
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
          ${o.type === 'door' ? `<button type="button" id="ed-slide">${o.slide ? 'Сделать распашной' : 'Сделать раздвижной'}</button><button type="button" id="ed-flip">${o.slide ? 'Полотно на другую сторону' : 'Открывать в другую сторону'}</button><button type="button" id="ed-hinge">${o.slide ? 'Сдвигать в другую сторону' : 'Петли с другого края'}</button>` : ''}
        </div>`;
    } else if (sel.kind === 'skylight') {
      const s = sel.win;
      html = `<div class="ed-props-head"><strong>Мансардное окно${s.name ? ' · ' + s.name : ''}</strong><button type="button" class="ed-danger" id="ed-del">Удалить</button></div>
        <div class="ed-grid">
          ${slider('ed-sw', 'Ширина, м', s.x[1] - s.x[0], 0.4, 1.6)}
          ${slider('ed-sl', 'Высота по скату, м', (s.y[1] - s.y[0]) * slopeK(sel.roof), 0.5, 2.0)}
        </div>`;
    } else if (sel.kind === 'room') {
      const r = sel.room;
      const opt = (obj, cur) => Object.entries(obj).map(([v, n]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${n}</option>`).join('');
      const floorKind = r.texture ?? (/санузел|котельн|тамбур|прихож|ванн|туалет/i.test(r.name) ? 'tiles' : 'floor');
      const wf = r.wallFinish ?? (r.wallColor ? 'paint' : '');
      html = `<div class="ed-props-head"><strong>Помещение</strong><button type="button" class="ed-danger" id="ed-del">Удалить подпись</button></div>
        <div class="ed-grid">
          ${field('ed-room-name', 'Название', String(r.name).replace(/"/g, '&quot;'), 'type="text" autocomplete="off"')}
          <label class="ed-field" for="ed-room-floor"><span>Пол</span><select id="ed-room-floor">${opt(FLOOR_FINISHES, floorKind)}</select></label>
          <label class="ed-field" for="ed-room-color"><span>Цвет пола</span><input id="ed-room-color" type="color" value="${r.color ?? '#d9c9a8'}"></label>
          <label class="ed-field" for="ed-room-wf"><span>Стены</span><select id="ed-room-wf"><option value="" ${wf ? '' : 'selected'}>Как в проекте</option>${opt(WALL_FINISHES, wf)}</select></label>
          ${wf ? `<label class="ed-field" for="ed-room-wc"><span>${wf === 'tiles' ? 'Цвет стен выше плитки' : 'Цвет стен'}</span><input id="ed-room-wc" type="color" value="${r.wallColor ?? '#efe9dc'}"></label>` : ''}
          ${wf === 'tiles' ? `<label class="ed-field" for="ed-room-tc"><span>Цвет плитки</span><input id="ed-room-tc" type="color" value="${r.tileColor ?? '#e9ecec'}"></label>${slider('ed-room-th', 'Плитка до высоты, м', r.tileHeight ?? 2.1, 0.3, 3, 0.05)}` : ''}
        </div>`;
    } else if (sel.kind === 'furn') {
      const it = sel.it, T = FURNITURE[it.type] ?? { name: 'Предмет', fill: '#cccccc' };
      const [w, d] = furnSize(it);
      html = `<div class="ed-props-head"><strong>${T.name}</strong><button type="button" class="ed-danger" id="ed-del">Удалить</button></div>
        <div class="ed-grid">
          ${num('ed-fw', 'Ширина, м', w, 0.05)}
          ${num('ed-fd', 'Глубина, м', d, 0.05)}
          <label class="ed-field" for="ed-fc"><span>Цвет</span><input id="ed-fc" type="color" value="${it.color ?? T.fill}"></label>
          ${slider('ed-frot', 'Поворот, °', it.rot ?? 0, 0, 359, 1)}
          <div class="ed-btnrow"><button type="button" id="ed-frl">↺ 90°</button><button type="button" id="ed-frr">↻ 90°</button></div>
          <p class="ed-hint">Тяните, чтобы передвинуть. Толстая линия — лицевая сторона.</p>
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
    if (siteMode) { sitePropsBind(on); return; }
    props.querySelectorAll('[data-sky]').forEach(b => b.addEventListener('click', () => {
      const s = skylights()[Number(b.dataset.sky)];
      sel = { kind: 'skylight', roof: s.roof, win: s.win };
      render();
    }));
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
      props.querySelector('#ed-flip')?.addEventListener('click', () => {
        begin();
        if (o.flip) delete o.flip; else o.flip = true;
        commit();
      });
      props.querySelector('#ed-slide')?.addEventListener('click', () => {
        begin();
        if (o.slide) delete o.slide; else o.slide = true;
        propsKey = null;
        commit();
      });
      props.querySelector('#ed-hinge')?.addEventListener('click', () => {
        begin();
        if (o.hingeEnd) delete o.hingeEnd; else o.hingeEnd = true;
        commit();
      });
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
      on('ed-room-floor', el => { r.texture = el.value; });
      on('ed-room-wf', el => { if (el.value) r.wallFinish = el.value; else { delete r.wallFinish; delete r.wallColor; } propsKey = null; });
      on('ed-room-wc', el => { r.wallColor = el.value; });
      on('ed-room-tc', el => { r.tileColor = el.value; });
      on('ed-room-th', el => { const v = parseFloat(el.value); if (v > 0.1) r.tileHeight = v; });
    } else if (sel?.kind === 'furn') {
      const it = sel.it;
      const setRot = v => { it.rot = ((Math.round(v) % 360) + 360) % 360; };
      on('ed-fw', el => { const v = parseFloat(el.value); if (v > 0.1) it.w = v; });
      on('ed-fd', el => { const v = parseFloat(el.value); if (v > 0.05) it.d = v; });
      on('ed-fc', el => { it.color = el.value; });
      on('ed-frot', el => setRot(parseFloat(el.value) || 0));
      for (const [id, dv] of [['ed-frl', -90], ['ed-frr', 90]]) props.querySelector('#' + id)?.addEventListener('click', () => { begin(); setRot((it.rot ?? 0) + dv); commit(); });
    }
    props.querySelector('#ed-pal')?.addEventListener('change', e => { palette.furniture = e.target.value; });
    props.querySelector('#ed-place-center')?.addEventListener('click', () => {
      palette.furniture = props.querySelector('#ed-pal')?.value ?? palette.furniture;
      placeFurniture([view.x + view.w / 2, view.y + view.w / aspect() / 2]);
    });
    props.querySelectorAll('[data-pal]').forEach(b => b.addEventListener('click', () => {
      palette[tool] = b.dataset.pal;
      propsKey = null;
      render();
    }));
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
    if (siteMode) { siteMode = false; tool = 'select'; renderTools(); }
    sel = null;
    draft = null;
    rooms = computeRooms(floor());
    fit();
    onFloor?.(i);
  }

  function setSite() {
    siteMode = true;
    tool = 'select';
    sel = null;
    draft = null;
    renderTools();
    fit();
    onSite?.();
  }

  return {
    setHouse(h, { keepView = false } = {}) {
      house = h;
      $('ed-floors').innerHTML = '';
      house.floors.forEach((f, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = f.short ?? `${i + 1} этаж`;
        b.dataset.floor = i;
        b.onclick = () => setFloor(i);
        $('ed-floors').append(b);
      });
      const sb = document.createElement('button');
      sb.type = 'button';
      sb.textContent = 'Участок';
      sb.dataset.site = '1';
      sb.onclick = setSite;
      $('ed-floors').append(sb);
      floorIdx = Math.min(floorIdx, house.floors.length - 1);
      sel = null;
      rooms = computeRooms(floor());
      if (!keepView || !view) requestAnimationFrame(fit); else render();
    },
    get floor() { return floorIdx; },
    get site() { return siteMode; },
    setFloor,
    setSite,
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
