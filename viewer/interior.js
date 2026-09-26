import * as THREE from 'three';
import { textureSet } from './looks.js';

// Интерьер: отделка комнат (пол, стены) и мебель. Описание — общее для 3D и редактора плана.
// Мебель: { type, at: [x, y], rot (°), w?, d? (м), color? }. Лицевая сторона — к +y на плане (при rot = 0).

export const FLOOR_FINISHES = {
  herringbone: 'Керамогранит «ёлочка»',
  floor: 'Паркет / ламинат',
  tiles: 'Плитка',
  stone: 'Керамогранит под камень',
  plaster: 'Микроцемент',
  deck: 'Массивная доска',
};

export const WALL_FINISHES = {
  paint: 'Покраска',
  tiles: 'Плитка',
  wood: 'Вагонка / панели',
  brick: 'Кирпич (лофт)',
};

export const FURNITURE = {
  bed2: { name: 'Кровать 160', group: 'Спальня', size: [1.75, 2.15], fill: '#c9b8a6' },
  bed1: { name: 'Кровать 90', group: 'Спальня', size: [1.0, 2.05], fill: '#c9b8a6' },
  nightstand: { name: 'Тумбочка', group: 'Спальня', size: [0.45, 0.4], fill: '#8a6a4f' },
  wardrobe: { name: 'Шкаф', group: 'Спальня', size: [1.6, 0.6], fill: '#d8d2c8' },
  dresser: { name: 'Комод', group: 'Спальня', size: [1.2, 0.48], fill: '#8a6a4f' },
  sofa: { name: 'Диван', group: 'Гостиная', size: [2.2, 0.95], fill: '#7d8a92' },
  corner: { name: 'Угловой диван', group: 'Гостиная', size: [2.6, 1.7], fill: '#7d8a92' },
  armchair: { name: 'Кресло', group: 'Гостиная', size: [0.85, 0.85], fill: '#7d8a92' },
  coffee: { name: 'Журнальный столик', group: 'Гостиная', size: [1.1, 0.6], fill: '#8a6a4f' },
  tv: { name: 'ТВ-тумба', group: 'Гостиная', size: [1.8, 0.42], fill: '#3a3a3a' },
  rug: { name: 'Ковёр', group: 'Гостиная', size: [2.0, 1.4], fill: '#b89c7c' },
  shelf: { name: 'Стеллаж', group: 'Гостиная', size: [1.0, 0.35], fill: '#8a6a4f' },
  dining: { name: 'Стол и 4 стула', group: 'Кухня', size: [1.6, 1.9], fill: '#a0795a' },
  diningOval: { name: 'Овальный стол, 6 стульев', group: 'Кухня', size: [2.9, 2.1], fill: '#a0795a' },
  diningRound: { name: 'Круглый стол, 4 стула', group: 'Кухня', size: [2.1, 2.1], fill: '#a0795a' },
  kitchen: { name: 'Кухня (линия)', group: 'Кухня', size: [2.4, 0.62], fill: '#e7e3dc' },
  island: { name: 'Остров', group: 'Кухня', size: [1.8, 0.9], fill: '#e7e3dc' },
  bar: { name: 'Барная стойка с кухонным столом', group: 'Кухня', size: [2.4, 1.0], fill: '#e7e3dc' },
  fridge: { name: 'Холодильник', group: 'Кухня', size: [0.62, 0.66], fill: '#d9dcdf' },
  oventower: { name: 'Колонна с духовкой', group: 'Кухня', size: [0.6, 0.6], fill: '#e7e3dc' },
  bath: { name: 'Ванна', group: 'Ванная', size: [1.7, 0.75], fill: '#f3f3f1' },
  shower: { name: 'Душевая', group: 'Ванная', size: [0.9, 0.9], fill: '#cfe3ea' },
  toilet: { name: 'Унитаз', group: 'Ванная', size: [0.38, 0.62], fill: '#f3f3f1' },
  sink: { name: 'Раковина с тумбой', group: 'Ванная', size: [0.8, 0.48], fill: '#f3f3f1' },
  washer: { name: 'Стиральная машина', group: 'Ванная', size: [0.6, 0.6], fill: '#eceeee' },
  towel: { name: 'Полотенцесушитель', group: 'Ванная', size: [0.5, 0.1], fill: '#b8bcc0' },
  desk: { name: 'Письменный стол', group: 'Прочее', size: [1.2, 0.6], fill: '#8a6a4f' },
  chair: { name: 'Стул', group: 'Прочее', size: [0.45, 0.5], fill: '#8a6a4f' },
  plant: { name: 'Растение в горшке', group: 'Прочее', size: [0.45, 0.45], fill: '#5d8a45' },
};

export const furnSize = it => {
  const T = FURNITURE[it.type];
  return [it.w ?? T?.size[0] ?? 1, it.d ?? T?.size[1] ?? 1];
};

function pbr(color, kind, extra = {}) {
  const t = kind ? textureSet(kind) : null;
  return new THREE.MeshStandardMaterial({ color, ...(t ? { map: t.map, normalMap: t.normalMap, ...t.mat } : {}), ...extra });
}

// Материалы на одну сборку (запекание сливает мебель по материалам).
export function furnitureMats() {
  const cache = new Map();
  const get = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
  return {
    fabric: c => get('f' + c, () => pbr(c, 'plaster', { roughness: 0.97, normalScale: new THREE.Vector2(0.6, 0.6) })),
    wood: c => get('w' + c, () => pbr(c, 'wood-dark', { roughness: 0.55 })),
    matte: c => get('m' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })),
    gloss: c => get('g' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.12 })),
    steel: get('steel', () => new THREE.MeshStandardMaterial({ color: '#c3c7ca', roughness: 0.3, metalness: 0.85 })),
    chrome: get('chrome', () => new THREE.MeshStandardMaterial({ color: '#d9dde0', roughness: 0.12, metalness: 1 })),
    black: get('black', () => new THREE.MeshStandardMaterial({ color: '#1d1f21', roughness: 0.35, metalness: 0.4 })),
    counter: get('counter', () => pbr('#dcd7cf', 'plaster', { roughness: 0.25, normalScale: new THREE.Vector2(0.15, 0.15) })),
    glass: get('glass', () => new THREE.MeshStandardMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide })),
    screen: get('screen', () => new THREE.MeshStandardMaterial({ color: '#0d0f12', roughness: 0.08, metalness: 0.3 })),
    leaf: get('leaf', () => pbr('#4f7a3a', 'foliage', { roughness: 0.9 })),
    pillow: get('pillow', () => new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.9 })),
  };
}

function rbox(g, w, h, d, mat, x, y, z, collide = false) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = !mat.transparent;
  m.receiveShadow = true;
  if (collide) m.userData.collide = true;
  g.add(m);
  return m;
}
function cyl(g, r0, r1, h, mat, x, y, z, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

// Локально: x — ширина, z — глубина (перед — +z), y — вверх от пола.
function chairAt(g, M, c, x, z, face) {
  const s = new THREE.Group();
  rbox(s, 0.44, 0.05, 0.44, M.wood(c), 0, 0.46, 0);
  rbox(s, 0.44, 0.45, 0.04, M.wood(c), 0, 0.7, -0.2);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rbox(s, 0.035, 0.44, 0.035, M.black, a * 0.19, 0.22, b * 0.19);
  s.position.set(x, 0, z);
  s.rotation.y = face;
  g.add(s);
}

// Столешница с вырезами под мойки: полосы вокруг каждого выреза. holes — [{ x, z, w, d }].
function counterTop(g, M, x0, x1, z0, z1, holes = [], y = 0.88, t = 0.04, mat = M.counter) {
  let cx = x0;
  for (const h of [...holes].sort((a, b) => a.x - b.x)) {
    const hx0 = h.x - h.w / 2, hz0 = h.z - h.d / 2, hz1 = h.z + h.d / 2;
    if (hx0 > cx) rbox(g, hx0 - cx, t, z1 - z0, mat, (cx + hx0) / 2, y, (z0 + z1) / 2);
    if (hz0 > z0) rbox(g, h.w, t, hz0 - z0, mat, h.x, y, (z0 + hz0) / 2);
    if (z1 > hz1) rbox(g, h.w, t, z1 - hz1, mat, h.x, y, (hz1 + z1) / 2);
    cx = h.x + h.w / 2;
  }
  if (x1 > cx) rbox(g, x1 - cx, t, z1 - z0, mat, (cx + x1) / 2, y, (z0 + z1) / 2);
}

// Корпус нижних шкафов (от цоколя до top); под мойками верх опущен до low, чтобы чаша не упиралась.
function cabinetBody(g, mat, x0, x1, z0, z1, holes = [], top = 0.86, low = 0.68) {
  const box = (a, b, h) => { if (b - a > 0.001) rbox(g, b - a, h - 0.1, z1 - z0, mat, (a + b) / 2, 0.1 + (h - 0.1) / 2, (z0 + z1) / 2, true); };
  let cx = x0;
  for (const h of [...holes].sort((a, b) => a.x - b.x)) {
    const a = h.x - h.w / 2 - 0.02, b = h.x + h.w / 2 + 0.02;
    box(cx, a, top);
    box(a, b, low);
    for (const z of [z0 + 0.01, z1 - 0.01]) rbox(g, b - a, top - low, 0.02, mat, (a + b) / 2, (top + low) / 2, z);
    cx = b;
  }
  box(cx, x1, top);
}

// Мойка в вырезе: чаша ниже столешницы, бортик, слив, смеситель с изогнутым изливом.
// faucetZ — где стоит смеситель, dir — куда смотрит излив (+1 — в сторону +z).
function sinkBowl(g, M, x, z, w, d, faucetZ, dir, { top = 0.9, depth = 0.18, mat = M.steel } = {}) {
  const b = top - depth, t = 0.01;
  rbox(g, w, t, d, mat, x, b + t / 2, z);
  for (const s of [-1, 1]) {
    rbox(g, t, depth, d, mat, x + s * (w / 2 - t / 2), b + depth / 2, z);
    rbox(g, w, depth, t, mat, x, b + depth / 2, z + s * (d / 2 - t / 2));
  }
  const r = 0.025;
  for (const s of [-1, 1]) {
    rbox(g, w + 2 * r, 0.006, r, mat, x, top + 0.003, z + s * (d / 2 + r / 2));
    rbox(g, r, 0.006, d, mat, x + s * (w / 2 + r / 2), top + 0.003, z);
  }
  cyl(g, 0.035, 0.035, 0.004, M.black, x, b + t + 0.002, z, 16).castShadow = false;
  cyl(g, 0.024, 0.027, 0.04, M.chrome, x, top + 0.02, faucetZ, 12);
  cyl(g, 0.012, 0.012, 0.28, M.chrome, x, top + 0.18, faucetZ, 10);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 16, Math.PI), M.chrome);
  arc.rotation.y = Math.PI / 2;
  arc.position.set(x, top + 0.32, faucetZ + dir * 0.08);
  arc.castShadow = true;
  g.add(arc);
  cyl(g, 0.012, 0.01, 0.06, M.chrome, x, top + 0.29, faucetZ + dir * 0.16, 10);
}

// Островная вытяжка: козырёк над варочной панелью, трапеция и короб до потолка.
function islandHood(g, M, x, z, ceil, w = 0.9, d = 0.5) {
  const y0 = 1.62;
  rbox(g, w, 0.05, d, M.steel, x, y0 + 0.025, z);
  rbox(g, w - 0.06, 0.004, d - 0.06, M.black, x, y0 - 0.002, z).castShadow = false;
  const geo = new THREE.CylinderGeometry(0.11 * Math.SQRT2, (d / 2) * Math.SQRT2, 0.22, 4, 1).toNonIndexed();
  geo.rotateY(Math.PI / 4);
  geo.computeVertexNormals();
  const fr = new THREE.Mesh(geo, M.steel);
  fr.scale.x = w / d;
  fr.position.set(x, y0 + 0.05 + 0.11, z);
  fr.castShadow = fr.receiveShadow = true;
  g.add(fr);
  const yb = y0 + 0.27;
  rbox(g, 0.22 * w / d, ceil - yb, 0.22, M.steel, x, (ceil + yb) / 2, z);
}

// Барный табурет: сиденье на 0,76 м, низкая спинка, подножка. Смотрит вдоль −z (к стойке) при face = 0.
function barStool(g, M, c, x, z, face) {
  const s = new THREE.Group();
  cyl(s, 0.2, 0.19, 0.06, M.fabric(c), 0, 0.76, 0, 24);
  rbox(s, 0.34, 0.14, 0.035, M.fabric(c), 0, 0.9, 0.17);
  for (const a of [-0.13, 0.13]) rbox(s, 0.025, 0.2, 0.025, M.black, a, 0.86, 0.17);
  cyl(s, 0.028, 0.028, 0.72, M.black, 0, 0.37, 0, 10);
  cyl(s, 0.22, 0.24, 0.02, M.black, 0, 0.01, 0, 24).castShadow = false;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 24), M.black);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  s.add(ring);
  s.position.set(x, 0, z);
  s.rotation.y = face;
  g.add(s);
}

export function buildFurniture(it, M) {
  const g = new THREE.Group();
  const T = FURNITURE[it.type];
  const [W, D] = furnSize(it);
  const col = it.color ?? T?.fill ?? '#cccccc';
  const hw = W / 2, hd = D / 2;
  switch (it.type) {
    case 'bed2': case 'bed1': {
      rbox(g, W, 0.3, D, M.fabric('#8d8479'), 0, 0.2, 0, true);
      rbox(g, W - 0.06, 0.22, D - 0.1, M.matte('#f4f1ec'), 0, 0.46, 0.03);
      rbox(g, W - 0.02, 0.06, D * 0.62, M.fabric(col), 0, 0.59, hd - D * 0.31 - 0.02);
      rbox(g, W, 1.0, 0.1, M.fabric('#8d8479'), 0, 0.5, -hd + 0.05, true);
      const n = W > 1.3 ? 2 : 1;
      for (let i = 0; i < n; i++) rbox(g, W / n - 0.14, 0.14, 0.4, M.pillow, -hw + (W / n) * (i + 0.5), 0.63, -hd + 0.35);
      break;
    }
    case 'nightstand': case 'dresser': {
      const H = it.type === 'dresser' ? 0.85 : 0.5;
      rbox(g, W, H - 0.08, D, M.wood(col), 0, 0.08 + (H - 0.08) / 2, 0, true);
      const rows = it.type === 'dresser' ? 3 : 2;
      for (let i = 0; i < rows; i++) rbox(g, W * 0.3, 0.02, 0.02, M.black, 0, 0.08 + (H - 0.08) * (i + 0.5) / rows, hd + 0.01);
      for (const x of [-hw + 0.04, hw - 0.04]) rbox(g, 0.03, 0.08, 0.03, M.black, x, 0.04, 0);
      break;
    }
    case 'wardrobe': {
      const H = 2.2;
      rbox(g, W, H, D, M.matte(col), 0, H / 2, 0, true);
      const n = Math.max(2, Math.round(W / 0.55));
      for (let i = 1; i < n; i++) rbox(g, 0.006, H - 0.04, 0.01, M.matte('#9a958d'), -hw + (W * i) / n, H / 2, hd + 0.003);
      for (let i = 0; i < n; i++) rbox(g, 0.02, 0.35, 0.02, M.black, -hw + (W * (i + 0.5)) / n + (i % 2 ? -1 : 1) * (W / n / 2 - 0.06), 1.05, hd + 0.02);
      break;
    }
    case 'sofa': case 'corner': case 'armchair': {
      const seatD = it.type === 'corner' ? 0.95 : D;
      const fab = M.fabric(col);
      rbox(g, W, 0.42, seatD, fab, 0, 0.21, -hd + seatD / 2, true);
      rbox(g, W, 0.45, 0.2, fab, 0, 0.62, -hd + 0.1);
      if (it.type !== 'corner') for (const s of [-1, 1]) rbox(g, 0.18, 0.2, seatD, fab, s * (hw - 0.09), 0.52, -hd + seatD / 2);
      const n = it.type === 'armchair' ? 1 : Math.max(2, Math.round((W - 0.4) / 0.7));
      const cw = (W - (it.type === 'corner' ? 0.2 : 0.4)) / n;
      for (let i = 0; i < n; i++) rbox(g, cw - 0.03, 0.12, seatD - 0.25, M.fabric(col), -hw + (it.type === 'corner' ? 0 : 0.2) + cw * (i + 0.5), 0.48, -hd + 0.2 + (seatD - 0.25) / 2);
      if (it.type === 'corner') {
        // оттоманка справа
        rbox(g, 0.95, 0.42, D - seatD, fab, hw - 0.475, 0.21, hd - (D - seatD) / 2, true);
        rbox(g, 0.85, 0.12, D - seatD, M.fabric(col), hw - 0.475, 0.48, hd - (D - seatD) / 2);
        rbox(g, 0.2, 0.2, D, fab, hw - 0.1, 0.52, 0);
      }
      break;
    }
    case 'coffee': {
      rbox(g, W, 0.04, D, M.wood(col), 0, 0.42, 0);
      rbox(g, W - 0.1, 0.02, D - 0.1, M.wood(col), 0, 0.12, 0);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rbox(g, 0.03, 0.42, 0.03, M.black, a * (hw - 0.05), 0.21, b * (hd - 0.05));
      break;
    }
    case 'tv': {
      rbox(g, W, 0.45, D, M.matte(col), 0, 0.225 + 0.1, 0, true);
      rbox(g, Math.min(1.45, W - 0.1), 0.82, 0.04, M.screen, 0, 1.25, -hd + 0.06);
      break;
    }
    case 'rug': rbox(g, W, 0.012, D, M.fabric(col), 0, 0.006, 0); break;
    case 'shelf': {
      const H = 1.9;
      for (const s of [-1, 1]) rbox(g, 0.03, H, D, M.wood(col), s * (hw - 0.015), H / 2, 0, true);
      for (let i = 0; i < 5; i++) rbox(g, W, 0.025, D, M.wood(col), 0, 0.05 + i * 0.45, 0);
      for (let i = 0; i < 4; i++) for (let k = 0; k < 5; k++) {
        const bw = 0.03 + ((i * 7 + k * 3) % 5) * 0.012;
        rbox(g, bw, 0.22 + ((k + i) % 3) * 0.03, D * 0.7, M.matte(['#8b3a3a', '#35526b', '#c8b27a', '#556b3a', '#e0d8c8'][(i + k) % 5]), -hw + 0.12 + k * 0.1, 0.19 + i * 0.45, 0);
      }
      break;
    }
    case 'dining': {
      const tw = W, td = Math.min(0.9, D - 0.8);
      rbox(g, tw, 0.04, td, M.wood(col), 0, 0.75, 0, false);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rbox(g, 0.05, 0.73, 0.05, M.wood(col), a * (tw / 2 - 0.08), 0.365, b * (td / 2 - 0.08), true);
      for (const x of [-tw / 4, tw / 4]) {
        chairAt(g, M, col, x, -td / 2 - 0.22, 0);
        chairAt(g, M, col, x, td / 2 + 0.22, Math.PI);
      }
      break;
    }
    case 'diningOval': case 'diningRound': {
      // столешница-овал (или круг) на центральной опоре, стулья по кругу; W×D — габарит со стульями
      const round = it.type === 'diningRound';
      const tw = round ? Math.min(W, D) - 0.95 : W - 1.05, td = round ? tw : D - 1.05;
      const top = cyl(g, 0.5, 0.5, 0.04, M.wood(col), 0, 0.75, 0, 48);
      top.scale.set(tw, 1, td);
      for (const x of round ? [0] : [-tw * 0.28, tw * 0.28]) {
        cyl(g, 0.06, 0.08, 0.7, M.black, x, 0.37, 0, 16);
        cyl(g, 0.24, 0.26, 0.03, M.black, x, 0.015, 0, 24).castShadow = false;
      }
      const seats = round ? [0, 1, 2, 3].map(i => i * Math.PI / 2 + Math.PI / 4) : null;
      const place = (x, z, face) => chairAt(g, M, it.chairColor ?? col, x, z, face);
      if (round) for (const a of seats) place(Math.cos(a) * (tw / 2 + 0.22), Math.sin(a) * (tw / 2 + 0.22), -a - Math.PI / 2);
      else {
        for (const x of [-tw * 0.22, tw * 0.22]) { place(x, -td / 2 - 0.22, 0); place(x, td / 2 + 0.22, Math.PI); }
        place(-tw / 2 - 0.22, 0, Math.PI / 2); place(tw / 2 + 0.22, 0, -Math.PI / 2);
      }
      break;
    }
    case 'kitchen': case 'island': {
      // нижние шкафы, столешница; у линии — фартук, верхние шкафы, мойка и варочная панель
      const at = (f, def) => (f === undefined ? def : f === null || f === false ? null : -hw + W * f);
      const sx = it.type === 'kitchen' ? at(it.sink, -hw + Math.min(0.5, W * 0.25)) : null;
      const holes = sx !== null ? [{ x: sx, z: 0, w: 0.5, d: 0.38 }] : [];
      rbox(g, W, 0.1, D - 0.05, M.black, 0, 0.05, -0.025);
      cabinetBody(g, M.matte(col), -hw, hw, -hd, hd - 0.02, holes);
      counterTop(g, M, -hw, hw, -hd, hd, holes);
      const n = Math.max(1, Math.round(W / 0.6));
      for (let i = 1; i < n; i++) rbox(g, 0.004, 0.74, 0.01, M.matte('#a9a49c'), -hw + (W * i) / n, 0.48, hd - 0.01);
      for (let i = 0; i < n; i++) rbox(g, 0.3, 0.015, 0.015, M.black, -hw + (W * (i + 0.5)) / n, 0.8, hd + 0.005);
      if (it.type === 'kitchen') {
        // it.uppers = false — без верхних шкафов (под окном); it.sink / it.hob — положение по длине (0…1) или null
        if (it.uppers !== false) {
          rbox(g, W, 0.62, 0.35, M.matte(col), 0, 1.8, -hd + 0.175, true);
          for (let i = 1; i < n; i++) rbox(g, 0.004, 0.6, 0.01, M.matte('#a9a49c'), -hw + (W * i) / n, 1.8, -hd + 0.355);
        }
        const hx = at(it.hob, W >= 1.2 ? hw - Math.min(0.6, W * 0.3) : null);
        if (sx !== null) sinkBowl(g, M, sx, 0, 0.5, 0.38, -hd + 0.055, 1);
        if (hx !== null) {
          rbox(g, 0.58, 0.008, 0.5, M.black, hx, 0.904, 0);
          if (it.uppers !== false) rbox(g, 0.6, 0.35, 0.3, M.chrome, hx, 1.65, -hd + 0.15);
        }
      } else {
        for (const x of [-hw * 0.5, hw * 0.5]) {
          cyl(g, 0.2, 0.2, 0.04, M.fabric('#6b5a4c'), x, 0.72, hd + 0.35, 20);
          cyl(g, 0.025, 0.025, 0.7, M.black, x, 0.35, hd + 0.35, 8);
        }
      }
      break;
    }
    case 'bar': {
      // Спереди (+z, к гостиной) — барная столешница ~1,1 м с табуретами, сзади (−z, к кухне) — шкафы
      // и рабочая столешница 0,9 м. it.style: 'step' — ступенька на панели, 'ledge' — деревянная доска на стойках,
      // 'waterfall' — дерево с торцами до пола. it.cut = [слева, справа] — укоротить барную часть (обойти столб).
      // it.hob / it.sink — место на рабочей столешнице (0…1), it.pendants — число подвесных светильников.
      const style = it.style ?? 'step';
      const wood = M.wood(it.barColor ?? '#8a5a3a');
      const [c0, c1] = it.cut ?? [0, 0];
      const bx0 = -hw + c0, bx1 = hw - c1, bw = bx1 - bx0, bc = (bx0 + bx1) / 2;
      const zf = Math.min(hd - 0.2, -hd + 0.72);           // лицо корпуса со стороны гостиной
      const cz = (-hd + zf) / 2;
      // корпус со шкафами, двери и ручки к кухне
      const at = f => (f === undefined || f === null || f === false ? null : -hw + W * f);
      const hx = at(it.hob), sx = at(it.sink), ceil = it.ceil ?? 2.7;
      const holes = sx !== null ? [{ x: sx, z: -hd + 0.27, w: 0.5, d: 0.38 }] : [];
      rbox(g, W, 0.1, zf + hd - 0.05, M.black, 0, 0.05, cz + 0.025);
      cabinetBody(g, M.matte(col), -hw, hw, -hd + 0.02, zf, holes);
      const n = Math.max(1, Math.round(W / 0.6));
      for (let i = 1; i < n; i++) rbox(g, 0.004, 0.74, 0.01, M.matte('#a9a49c'), -hw + (W * i) / n, 0.48, -hd + 0.01);
      for (let i = 0; i < n; i++) rbox(g, 0.3, 0.015, 0.015, M.black, -hw + (W * (i + 0.5)) / n, 0.8, -hd - 0.005);
      const raised = style !== 'ledge';
      const topZ1 = raised ? zf - 0.1 : zf;                  // рабочая столешница до панели
      counterTop(g, M, -hw, hw, -hd - 0.02, topZ1, holes);
      if (hx !== null) {
        rbox(g, 0.58, 0.008, 0.5, M.black, hx, 0.904, -hd + 0.3);
        if (it.hood !== false) islandHood(g, M, hx, -hd + 0.3, ceil);
      }
      if (sx !== null) sinkBowl(g, M, sx, -hd + 0.27, 0.5, 0.38, topZ1 - 0.05, -1);
      const bz0 = raised ? zf - 0.18 : zf - 0.32, bd = hd - bz0, bzc = (bz0 + hd) / 2;
      if (raised) {
        // панель от пола до барной столешницы — прячет рабочую зону от гостиной
        const pm = style === 'waterfall' ? wood : M.matte(it.panelColor ?? col);
        rbox(g, bw, 1.06, 0.1, pm, bc, 0.53, zf - 0.05, true);
        rbox(g, bw, 0.05, bd, style === 'waterfall' ? wood : M.counter, bc, 1.085, bzc);
        if (style === 'waterfall') for (const x of [bx0 + 0.025, bx1 - 0.025]) rbox(g, 0.05, 1.06, bd, wood, x, 0.53, bzc, true);
        else for (const x of [bx0 + 0.3, bx1 - 0.3]) rbox(g, 0.04, 0.2, bd - 0.14, M.black, x, 0.96, bzc + 0.05);
      } else {
        // деревянная доска над краем рабочей столешницы на чёрных стойках, у края — ножки до пола
        rbox(g, bw, 0.06, bd, wood, bc, 1.1, bzc);
        const k = Math.max(2, Math.ceil(bw / 1.1) + 1);
        for (let i = 0; i < k; i++) {
          const x = bx0 + 0.12 + ((bw - 0.24) * i) / (k - 1);
          rbox(g, 0.04, 0.17, 0.04, M.black, x, 0.985, zf - 0.2);
          if (i === 0 || i === k - 1) rbox(g, 0.05, 1.07, 0.05, M.black, x, 0.535, hd - 0.06);
        }
        rbox(g, bw, 0.9, 0.02, M.wood(it.barColor ?? '#8a5a3a'), bc, 0.45, zf + 0.01);
      }
      const ns = it.stools ?? Math.max(1, Math.floor(bw / 0.6));
      for (let i = 0; i < ns; i++) barStool(g, M, it.stoolColor ?? '#5b4a3e', bx0 + (bw * (i + 0.5)) / ns, hd - 0.02, 0);
      // подвесы над барной частью; если есть вытяжка — по обе стороны от неё
      const np = it.pendants ?? 0, hood = hx !== null && it.hood !== false;
      const spans = hood ? [[bx0, Math.max(bx0, hx - 0.5)], [Math.min(bx1, hx + 0.5), bx1]].filter(([a, b]) => b - a > 0.25) : [[bx0, bx1]];
      const total = spans.reduce((t, [a, b]) => t + b - a, 0);
      const px = [];
      spans.forEach(([a, b], k) => {
        const m = k === spans.length - 1 ? np - px.length : Math.round((np * (b - a)) / total);
        for (let i = 0; i < m; i++) px.push(a + ((b - a) * (i + 0.5)) / m);
      });
      for (const x of px) {
        const y = 1.85;
        cyl(g, 0.004, 0.004, ceil - y, M.black, x, (ceil + y) / 2, bzc, 6).castShadow = false;
        const shade = cyl(g, 0.03, 0.14, 0.16, M.black, x, y - 0.08, bzc, 24);
        shade.castShadow = false;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8),
          new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffd9a0', emissiveIntensity: 2 }));
        bulb.position.set(x, y - 0.15, bzc);
        g.add(bulb);
      }
      break;
    }
    case 'oventower': {
      // колонна: духовка на уровне глаз, над ней микроволновка
      rbox(g, W, 2.2, D, M.matte(col), 0, 1.1, 0, true);
      rbox(g, W - 0.08, 0.58, 0.02, M.black, 0, 1.05, hd + 0.005);
      rbox(g, W - 0.16, 0.34, 0.021, M.glass, 0, 1.06, hd + 0.012);
      rbox(g, W - 0.08, 0.38, 0.02, M.black, 0, 1.6, hd + 0.005);
      rbox(g, W - 0.12, 0.02, 0.03, M.chrome, 0, 1.3, hd + 0.02);
      break;
    }
    case 'fridge': {
      rbox(g, W, 1.95, D, M.matte(col), 0, 0.975, 0, true);
      rbox(g, W - 0.02, 0.005, 0.01, M.matte('#9ea3a8'), 0, 1.25, hd + 0.003);
      rbox(g, 0.025, 0.4, 0.03, M.chrome, hw - 0.08, 1.5, hd + 0.02);
      rbox(g, 0.025, 0.3, 0.03, M.chrome, hw - 0.08, 0.95, hd + 0.02);
      break;
    }
    case 'bath': {
      rbox(g, W, 0.55, D, M.gloss(col), 0, 0.275, 0, true);
      rbox(g, W - 0.14, 0.02, D - 0.14, M.gloss('#dfe9ec'), 0, 0.5, 0);
      cyl(g, 0.015, 0.015, 0.2, M.chrome, -hw + 0.12, 0.65, 0, 8);
      break;
    }
    case 'shower': {
      rbox(g, W, 0.06, D, M.gloss('#f3f3f1'), 0, 0.03, 0);
      rbox(g, W, 2.0, 0.01, M.glass, 0, 1.06, hd - 0.005);
      rbox(g, 0.01, 2.0, D, M.glass, hw - 0.005, 1.06, 0);
      rbox(g, 0.02, 2.0, 0.02, M.chrome, hw - 0.01, 1.06, hd - 0.01);
      cyl(g, 0.012, 0.012, 1.1, M.chrome, -hw + 0.1, 1.6, -hd + 0.06, 8);
      cyl(g, 0.12, 0.12, 0.015, M.chrome, -hw + 0.25, 2.1, -hd + 0.25, 20);
      break;
    }
    case 'toilet': {
      rbox(g, 0.36, 0.8, 0.12, M.gloss(col), 0, 0.8, -hd + 0.06);          // инсталляция / бачок
      const bowl = cyl(g, 0.17, 0.12, 0.4, M.gloss(col), 0, 0.2, 0.05, 24);
      bowl.scale.z = 1.35;
      bowl.userData.collide = true;
      const seat = cyl(g, 0.18, 0.18, 0.03, M.gloss(col), 0, 0.415, 0.05, 24);
      seat.scale.z = 1.35;
      rbox(g, 0.1, 0.012, 0.06, M.chrome, 0, 1.0, -hd + 0.125);
      break;
    }
    case 'sink': {
      rbox(g, W, 0.5, D - 0.02, M.wood(col === T.fill ? '#8a6a4f' : col), 0, 0.55, -0.01, true);
      const bw = Math.min(0.5, W * 0.62), bd = Math.min(0.3, D - 0.2), bz = 0.03;
      counterTop(g, M, -hw, hw, -hd, hd, [{ x: 0, z: bz, w: bw, d: bd }], 0.86, 0.12, M.gloss('#f3f3f1'));
      sinkBowl(g, M, 0, bz, bw, bd, -hd + 0.05, 1, { top: 0.92, depth: 0.12, mat: M.gloss('#f3f3f1') });
      rbox(g, Math.min(0.8, W), 0.8, 0.02, M.gloss('#cfdde2'), 0, 1.55, -hd + 0.01);    // зеркало
      break;
    }
    case 'washer': {
      rbox(g, W, 0.85, D, M.matte(col), 0, 0.425, 0, true);
      const door = cyl(g, 0.2, 0.2, 0.03, M.glass, 0, 0.45, hd + 0.01, 28);
      door.rotation.x = Math.PI / 2;
      const ring = cyl(g, 0.22, 0.22, 0.02, M.chrome, 0, 0.45, hd + 0.005, 28);
      ring.rotation.x = Math.PI / 2;
      break;
    }
    case 'towel': {
      for (const x of [-hw + 0.02, hw - 0.02]) cyl(g, 0.014, 0.014, 0.8, M.chrome, x, 1.1, 0, 8);
      for (let i = 0; i < 6; i++) { const r = cyl(g, 0.01, 0.01, W - 0.04, M.chrome, 0, 0.75 + i * 0.14, 0, 8); r.rotation.z = Math.PI / 2; }
      break;
    }
    case 'desk': {
      rbox(g, W, 0.04, D, M.wood(col), 0, 0.74, 0);
      for (const s of [-1, 1]) rbox(g, 0.04, 0.72, D - 0.05, M.black, s * (hw - 0.03), 0.36, 0, true);
      rbox(g, 0.55, 0.32, 0.02, M.screen, 0, 1.0, -hd + 0.12);
      break;
    }
    case 'chair': chairAt(g, M, col, 0, 0, Math.PI); break;
    case 'plant': {
      cyl(g, 0.16, 0.12, 0.35, M.matte('#d8d2c8'), 0, 0.175, 0, 20);
      for (let i = 0; i < 5; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), M.leaf);
        b.position.set(Math.cos(i * 1.3) * 0.1, 0.55 + (i % 3) * 0.15, Math.sin(i * 1.3) * 0.1);
        b.castShadow = true;
        g.add(b);
      }
      break;
    }
    default: rbox(g, W, 0.8, D, M.matte(col), 0, 0.4, 0, true);
  }
  g.position.set(it.at[0], 0, it.at[1]);
  g.rotation.y = -THREE.MathUtils.degToRad(it.rot ?? 0);
  return g;
}
