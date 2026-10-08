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
  plywood: 'Фанера панелями',
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
  tall: { name: 'Пенал (высокий шкаф)', group: 'Кухня', size: [0.6, 0.6], fill: '#e7e3dc' },
  island2: { name: 'Остров с мойкой и столом', group: 'Кухня', size: [2.7, 1.0], fill: '#d3cfc9' },
  wallShelf: { name: 'Полки для посуды (на стену)', group: 'Кухня', size: [0.9, 0.26], fill: '#8a5a3a' },
  bath: { name: 'Ванна', group: 'Ванная', size: [1.7, 0.75], fill: '#f3f3f1' },
  shower: { name: 'Душевая', group: 'Ванная', size: [0.9, 0.9], fill: '#cfe3ea' },
  walkin: { name: 'Душ без поддона со скамьёй', group: 'Ванная', size: [2.05, 0.85], fill: '#77736d' },
  toilet: { name: 'Унитаз', group: 'Ванная', size: [0.38, 0.62], fill: '#f3f3f1' },
  sink: { name: 'Раковина с тумбой', group: 'Ванная', size: [0.8, 0.48], fill: '#f3f3f1' },
  washer: { name: 'Стиральная машина', group: 'Ванная', size: [0.6, 0.6], fill: '#eceeee' },
  towel: { name: 'Полотенцесушитель', group: 'Ванная', size: [0.5, 0.1], fill: '#b8bcc0' },
  desk: { name: 'Письменный стол', group: 'Прочее', size: [1.2, 0.6], fill: '#8a6a4f' },
  standDesk: { name: 'Стол с подъёмом (70–120 см)', group: 'Спальня', size: [1.4, 0.7], fill: '#c9a272' },
  closet: { name: 'Встроенный шкаф до потолка', group: 'Спальня', size: [1.8, 0.6], fill: '#d4b88c' },
  windowSeat: { name: 'Скамья у окна с ящиками', group: 'Спальня', size: [1.4, 0.75], fill: '#d4b88c' },
  loftBed: { name: 'Кровать-чердак 140', group: 'Спальня', size: [2.1, 1.6], fill: '#6e7378' },
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
    glossDouble: c => get('gd' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.12, side: THREE.DoubleSide })),
    enamel: get('enamel', () => new THREE.MeshStandardMaterial({ color: '#1e1f21', roughness: 0.5 })),
    fridgeIn: get('fridgeIn', () => new THREE.MeshStandardMaterial({ color: '#eef1f2', roughness: 0.35 })),
    marble: get('marble', () => pbr('#f6f4f0', 'marble')),
    quartz: c => get('q' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.14 })),
    led: get('led', () => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#eef4ff', emissiveIntensity: 1.6 })),
    iron: get('iron', () => new THREE.MeshStandardMaterial({ color: '#2a2c2e', roughness: 0.6, metalness: 0.5 })),
    steel: get('steel', () => new THREE.MeshStandardMaterial({ color: '#c3c7ca', roughness: 0.3, metalness: 0.85 })),
    ply: get('ply', () => pbr('#d4b88c', 'plywood')),
    ledWarm: get('ledWarm', () => Object.assign(new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffb45e', emissiveIntensity: 0.3 }), { userData: { night: [0.3, 3] } })),
    brass: get('brass', () => new THREE.MeshStandardMaterial({ color: '#b8913f', roughness: 0.3, metalness: 0.9 })),
    chrome: get('chrome',() => new THREE.MeshStandardMaterial({ color: '#d9dde0', roughness: 0.12, metalness: 1 })),
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
function sinkBowl(g, M, x, z, w, d, faucetZ, dir, { top = 0.9, depth = 0.18, mat = M.steel, small = false, metal = M.chrome } = {}) {
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
  if (small) {
    // обычный маленький смеситель для раковины: корпус 15 см, короткий носик, рычажок сверху
    cyl(g, 0.022, 0.024, 0.15, metal, x, top + 0.075, faucetZ, 14);
    const sp = cyl(g, 0.011, 0.011, 0.09, metal, x, top + 0.13, faucetZ + dir * 0.045, 10);
    sp.rotation.x = Math.PI / 2;
    cyl(g, 0.012, 0.012, 0.012, metal, x, top + 0.12, faucetZ + dir * 0.09, 10);
    const lv = rbox(g, 0.01, 0.01, 0.07, metal, x, top + 0.165, faucetZ - dir * 0.025);
    lv.rotation.x = -dir * 0.25;
    return;
  }
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

// Встроенная выдвижная вытяжка (даунрафт): стальная панель поднимается из столешницы за варочной панелью.
// Открытая — чуть ниже барной столешницы; в прогулке открывается и закрывается клавишей E (как двери).
// Воздухозаборная щель и светодиодная подсветка — со стороны варочной панели (−z).
function downdraft(g, M, x, z, w, { top = 0.9, h = 0.165, open = true } = {}) {
  rbox(g, w + 0.03, 0.004, 0.07, M.steel, x, top + 0.002, z);
  const holder = new THREE.Group();
  holder.userData.dynamic = true;
  holder.position.set(x, top, z);
  const c = new THREE.Group();
  holder.add(c);
  rbox(c, w, h, 0.045, M.steel, 0, h / 2, 0);
  rbox(c, w + 0.004, 0.012, 0.05, M.black, 0, h + 0.006, 0);
  rbox(c, w - 0.06, 0.04, 0.004, M.black, 0, h - 0.08, -0.0235).castShadow = false;
  for (const s of [-1, 1]) rbox(c, w * 0.38, 0.016, 0.004, M.led, s * w * 0.21, h - 0.03, -0.0235).castShadow = false;
  rbox(c, 0.012, 0.07, 0.004, M.black, w / 2 - 0.03, h - 0.07, -0.0235).castShadow = false;
  // закрытая уходит в столешницу, над ней остаётся только чёрная кромка
  c.position.y = open ? 0 : -h;
  holder.userData.door = { kind: 'lift', node: c, closed: -h, opened: 0, state: open ? 1 : 0, value: c.position.y, reach: 1.8 };
  g.add(holder);
}

// Брусок квадратного сечения s между точками a и b (стальная профильная труба).
function barBetween(g, mat, a, b, s = 0.05) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, A.distanceTo(B), s), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  m.castShadow = m.receiveShadow = true;
  g.add(m);
}

// Лофт-основание стола: рамка под столешницей, четыре наклонные ножки расходятся к полу, внизу — крестовина.
// ax, az — полуразмеры рамки сверху, bx, bz — точки опоры на полу, y — низ столешницы.
function loftBase(g, M, ax, az, bx, bz, y) {
  const s = 0.05, top = [[-ax, -az], [ax, -az], [ax, az], [-ax, az]], foot = [[-bx, -bz], [bx, -bz], [bx, bz], [-bx, bz]];
  for (let i = 0; i < 4; i++) {
    const [p, q] = [top[i], top[(i + 1) % 4]];
    barBetween(g, M.iron, [p[0], y - s / 2, p[1]], [q[0], y - s / 2, q[1]], s);
    barBetween(g, M.iron, [top[i][0], y - s, top[i][1]], [foot[i][0], s / 2, foot[i][1]], s);
  }
  barBetween(g, M.iron, [foot[0][0], s / 2, foot[0][1]], [foot[2][0], s / 2, foot[2][1]], s);
  barBetween(g, M.iron, [foot[1][0], s / 2, foot[1][1]], [foot[3][0], s / 2, foot[3][1]], s);
}

// Фасады нижних шкафов на грани z (дверцы по ~0,6 м): с ручками — щели и чёрные ручки;
// без ручек — два больших ящика на секцию и тёмные каналы-профили под столешницей и между ящиками.
function fronts(g, M, x0, x1, z, n, handleless, dir = 1) {
  const W = x1 - x0, gap = M.matte('#a9a49c');
  for (let i = 1; i < n; i++) rbox(g, 0.004, 0.74, 0.01, gap, x0 + (W * i) / n, 0.48, z - dir * 0.01);
  if (!handleless) {
    for (let i = 0; i < n; i++) rbox(g, 0.3, 0.015, 0.015, M.black, x0 + (W * (i + 0.5)) / n, 0.8, z + dir * 0.005);
    return;
  }
  const ch = M.matte('#6f6a64');
  for (const y of [0.835, 0.47]) rbox(g, W, 0.022, 0.012, ch, (x0 + x1) / 2, y, z - dir * 0.004);
}

// Подвес-клетка: чёрный цилиндр из прутьев с лампой внутри.
function cagePendant(g, M, x, z, ceil, y = 1.75) {
  cyl(g, 0.004, 0.004, ceil - y - 0.2, M.black, x, (ceil + y + 0.2) / 2, z, 6).castShadow = false;
  const r = 0.085, h = 0.24;
  for (const yy of [y, y + h]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.005, 5, 24), M.black);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, yy, z);
    g.add(ring);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    rbox(g, 0.008, h, 0.008, M.black, x + Math.cos(a) * r, y + h / 2, z + Math.sin(a) * r).castShadow = false;
  }
  cyl(g, 0.04, 0.04, 0.02, M.black, x, y + h + 0.01, z, 12).castShadow = false;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), M.led);
  bulb.scale.y = 1.4;
  bulb.position.set(x, y + h * 0.45, z);
  g.add(bulb);
}

// Посуда на полке: стопки тарелок, миски, чашки, банки — детерминированно по длине полки.
function dishes(g, M, x0, x1, y, zc, seed = 1) {
  const white = M.gloss('#f4f3ef'), grey = M.gloss('#c9cdd0'), glass = M.glass;
  let x = x0 + 0.06, k = seed;
  const kinds = ['plates', 'cups', 'bowls', 'jars', 'plates', 'cups'];
  while (x < x1 - 0.08) {
    const kind = kinds[k++ % kinds.length];
    if (kind === 'plates') {
      for (let i = 0; i < 6; i++) cyl(g, 0.11, 0.1, 0.012, white, x + 0.05, y + 0.008 + i * 0.014, zc, 28).castShadow = i === 5;
      x += 0.26;
    } else if (kind === 'cups') {
      for (let i = 0; i < 3; i++) cyl(g, 0.037, 0.03, 0.085, i % 2 ? grey : white, x + i * 0.085, y + 0.043, zc + (i % 2 ? 0.04 : -0.02), 16);
      x += 0.28;
    } else if (kind === 'bowls') {
      for (let i = 0; i < 3; i++) cyl(g, 0.075, 0.045, 0.045, white, x + 0.05, y + 0.023 + i * 0.03, zc, 24);
      x += 0.2;
    } else {
      for (let i = 0; i < 2; i++) {
        cyl(g, 0.045, 0.045, 0.14 - i * 0.03, glass, x + i * 0.1, y + 0.07 - i * 0.015, zc, 16);
        cyl(g, 0.047, 0.047, 0.018, M.wood('#9b7550'), x + i * 0.1, y + 0.149 - i * 0.03, zc, 16);
      }
      x += 0.24;
    }
  }
}

// Корпус колонны с проёмами под технику: боковины во всю высоту и перемычки между проёмами (holes — [{ y0, h }]).
function shell(g, mat, W, H, D, holes, s = 0.04) {
  const iw = W - 2 * s;
  for (const x of [-1, 1]) rbox(g, s, H, D, mat, x * (W / 2 - s / 2), H / 2, 0, true);
  let y = 0;
  for (const h of [...holes].sort((a, b) => a.y0 - b.y0)) {
    if (h.y0 > y + 0.001) rbox(g, iw, h.y0 - y, D, mat, 0, (y + h.y0) / 2, 0, true);
    y = h.y0 + h.h;
  }
  if (H > y + 0.001) rbox(g, iw, H - y, D, mat, 0, (y + H) / 2, 0, true);
}

// Камера техники в проёме: задняя стенка, бока, верх и низ; zf — лицевая плоскость, d — глубина.
function cavity(g, mat, w, h, d, y0, zf) {
  const t = 0.006, zc = zf - d / 2;
  rbox(g, w, h, t, mat, 0, y0 + h / 2, zf - d + t / 2);
  for (const sx of [-1, 1]) rbox(g, t, h, d, mat, sx * (w / 2 - t / 2), y0 + h / 2, zc);
  for (const y of [y0 + t / 2, y0 + h - t / 2]) rbox(g, w, t, d, mat, 0, y, zc);
}

// Подвижная дверца техники (открывается клавишей E в прогулке, как двери дома).
// at — точка петли; axis 'y' — дверца на боковых петлях, 'x' — откидная вниз; opened — угол открытия;
// aim — центр дверцы относительно петли: по нему ищется дверца, на которую смотрят.
function applianceDoor(g, { at, axis = 'y', opened, aim, build, reach = 1.8 }) {
  const holder = new THREE.Group();
  holder.userData.dynamic = true;
  holder.position.set(...at);
  const c = new THREE.Group();
  holder.add(c);
  build(c);
  holder.userData.door = { kind: axis === 'x' ? 'tilt' : 'swing', node: c, closed: 0, opened, state: 0, value: 0, reach, aim };
  g.add(holder);
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
      // it.style = 'loft' — толстая деревянная столешница на стальном основании с наклонными ножками
      const loft = it.style === 'loft';
      const top = cyl(g, 0.5, 0.5, loft ? 0.05 : 0.04, M.wood(loft && col === T.fill ? '#7a5234' : col), 0, loft ? 0.745 : 0.75, 0, 64);
      top.scale.set(tw, 1, td);
      if (loft) loftBase(g, M, tw * (round ? 0.2 : 0.26), td * 0.2, tw * (round ? 0.3 : 0.36), td * 0.3, 0.72);
      else for (const x of round ? [0] : [-tw * 0.28, tw * 0.28]) {
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
      // it.handleless — фасады без ручек (профиль-канал под столешницей и между ящиками); it.top — цвет столешницы
      rbox(g, W, 0.1, D - 0.05, M.black, 0, 0.05, -0.025);
      cabinetBody(g, M.matte(col), -hw, hw, -hd, hd - 0.02, holes);
      counterTop(g, M, -hw, hw, -hd, hd, holes, 0.88, 0.04, it.top ? M.quartz(it.top) : M.counter);
      const n = Math.max(1, Math.round(W / 0.6));
      fronts(g, M, -hw, hw, hd, n, it.handleless);
      if (it.type === 'kitchen') {
        // it.uppers = false — без верхних шкафов (под окном); it.sink / it.hob — положение по длине (0…1) или null
        // it.splash = 'marble' — мраморный фартук от столешницы до верхних шкафов; it.hood = 'downdraft' — выдвижная вытяжка
        const up = it.uppers !== false;
        if (up) {
          rbox(g, W, 0.66, 0.35, M.matte(col), 0, 1.83, -hd + 0.175, true);
          for (let i = 1; i < n; i++) rbox(g, 0.004, 0.64, 0.01, M.matte('#a9a49c'), -hw + (W * i) / n, 1.83, -hd + 0.355);
          if (!it.handleless) for (let i = 0; i < n; i++) rbox(g, 0.3, 0.015, 0.015, M.black, -hw + (W * (i + 0.5)) / n, 1.54, -hd + 0.36);
        }
        if (it.splash === 'marble') rbox(g, W, 0.6, 0.015, M.marble, 0, 1.2, -hd + 0.0075);
        const hx = at(it.hob, W >= 1.2 ? hw - Math.min(0.6, W * 0.3) : null);
        if (sx !== null) sinkBowl(g, M, sx, 0, 0.5, 0.38, -hd + 0.055, 1);
        if (hx !== null && it.hood === 'downdraft') {
          rbox(g, 0.79, 0.006, 0.452, M.steel, hx, 0.903, 0.05);
          rbox(g, 0.78, 0.008, 0.44, M.black, hx, 0.906, 0.05);
          downdraft(g, M, hx, -0.205, 0.8, { open: it.hoodOpen !== false });
        } else if (hx !== null) {
          rbox(g, 0.58, 0.008, 0.5, M.black, hx, 0.904, 0);
          if (up) rbox(g, 0.6, 0.12, 0.3, M.steel, hx, 1.44, -hd + 0.15);
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
      // it.kitchen = false — только барная стойка: панель от пола и столешница, без шкафов и рабочей столешницы
      const kit = it.kitchen !== false;
      const zf = kit ? Math.min(hd - 0.2, -hd + 0.72) : -hd + 0.18;   // лицо корпуса со стороны гостиной
      const cz = (-hd + zf) / 2;
      // корпус со шкафами, двери и ручки к кухне
      const at = f => (f === undefined || f === null || f === false ? null : -hw + W * f);
      const hx = at(it.hob), sx = at(it.sink), ceil = it.ceil ?? 2.7;
      const holes = sx !== null ? [{ x: sx, z: -hd + 0.27, w: 0.5, d: 0.38 }] : [];
      const raised = style !== 'ledge' || !kit;
      const topZ1 = raised ? zf - 0.1 : zf;                  // рабочая столешница до панели
      if (kit) {
        rbox(g, W, 0.1, zf + hd - 0.05, M.black, 0, 0.05, cz + 0.025);
        cabinetBody(g, M.matte(col), -hw, hw, -hd + 0.02, zf, holes);
        const n = Math.max(1, Math.round(W / 0.6));
        for (let i = 1; i < n; i++) rbox(g, 0.004, 0.74, 0.01, M.matte('#a9a49c'), -hw + (W * i) / n, 0.48, -hd + 0.01);
        for (let i = 0; i < n; i++) rbox(g, 0.3, 0.015, 0.015, M.black, -hw + (W * (i + 0.5)) / n, 0.8, -hd - 0.005);
        counterTop(g, M, -hw, hw, -hd - 0.02, topZ1, holes);
      }
      // it.shelf — барная столешница продолжается за торец полкой над рабочей столешницей (до стены);
      // в укороченном у стены конце (cut[1]) корпус и рабочая столешница доходят до стены (wallInset от края)
      const shelf = raised && it.shelf ? it.shelf : 0, zin = hd - (it.wallInset ?? 0.1);
      if (kit && shelf && c1 > 0) {
        rbox(g, c1, 0.86, zin - zf, M.matte(col), hw - c1 / 2, 0.43, (zin + zf) / 2, true);
        rbox(g, c1, 0.04, zin - topZ1, M.counter, hw - c1 / 2, 0.88, (zin + topZ1) / 2);
      }
      // it.shelfStart — то же у другого конца (cut[0], например у столба): отступ от края до препятствия;
      // полка доходит до торца стойки, а торец под ней закрыт бортиком
      const s0 = raised && it.shelfStart != null && c0 > 0 ? hd - it.shelfStart : null;
      if (kit && s0 !== null) {
        rbox(g, c0, 0.86, s0 - zf, M.matte(col), -hw + c0 / 2, 0.43, (s0 + zf) / 2, true);
        rbox(g, c0, 0.04, s0 - topZ1, M.counter, -hw + c0 / 2, 0.88, (s0 + topZ1) / 2);
      }
      // вытяжка: по умолчанию встроенная выдвижная за варочной панелью; 'island' — под потолком; false — нет
      const hood = hx === null || !kit ? null : it.hood === false ? null : it.hood ?? 'downdraft';
      if (kit && hx !== null) {
        const dd = hood === 'downdraft', pw = dd ? 0.78 : 0.58, pd = dd ? 0.44 : 0.5, pz = dd ? -hd + 0.25 : -hd + 0.3;
        rbox(g, pw + 0.012, 0.006, pd + 0.012, M.steel, hx, 0.903, pz);
        rbox(g, pw, 0.008, pd, M.black, hx, 0.906, pz);
        if (dd) downdraft(g, M, hx, pz + pd / 2 + 0.035, pw + 0.02, { open: it.hoodOpen !== false });
        else if (hood === 'island') islandHood(g, M, hx, pz, ceil);
      }
      if (kit && sx !== null) sinkBowl(g, M, sx, -hd + 0.27, 0.5, 0.38, topZ1 - 0.05, -1);
      const bz0 = raised ? zf - 0.18 : zf - 0.32, bd = hd - bz0, bzc = (bz0 + hd) / 2;
      if (raised) {
        // панель от пола до барной столешницы — прячет рабочую зону от гостиной
        const pm = style === 'waterfall' ? wood : M.matte(it.panelColor ?? col);
        if (kit) rbox(g, bw, 1.06, 0.1, pm, bc, 0.53, zf - 0.05, true);
        else rbox(g, W, 1.06, 0.1, pm, 0, 0.53, zf - 0.05, true);
        const topMat = style === 'waterfall' ? wood : M.counter;
        rbox(g, bw, 0.05, bd, topMat, bc, 1.085, bzc);
        if (shelf) rbox(g, c1 + shelf, 0.05, zin - bz0, topMat, bx1 + (c1 + shelf) / 2, 1.085, (bz0 + zin) / 2);
        if (s0 !== null) {
          rbox(g, c0, 0.05, s0 - bz0, topMat, -hw + c0 / 2, 1.085, (bz0 + s0) / 2);
          if (kit) rbox(g, 0.02, 0.16, s0 - bz0, topMat, -hw + 0.01, 0.98, (bz0 + s0) / 2);
        }
        const ends = [s0 === null && bx0 + 0.025, !shelf && bx1 - 0.025].filter(x => x !== false);
        if (style === 'waterfall') for (const x of ends) rbox(g, 0.05, 1.06, bd, wood, x, 0.53, bzc, true);
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
      const np = it.pendants ?? 0;
      const spans = hood === 'island' ? [[bx0, Math.max(bx0, hx - 0.5)], [Math.min(bx1, hx + 0.5), bx1]].filter(([a, b]) => b - a > 0.25) : [[bx0, bx1]];
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
    case 'tall': {
      // пенал до 2,2 м: две двери (нижняя и верхняя); it.handleless — без ручек
      rbox(g, W, 2.2, D, M.matte(col), 0, 1.1, 0, true);
      rbox(g, W - 0.01, 0.005, 0.01, M.matte('#a9a49c'), 0, 1.5, hd + 0.002);
      if (!it.handleless) for (const [y, h] of [[1.1, 0.4], [1.75, 0.25]]) rbox(g, 0.02, h, 0.025, M.black, hw - 0.06, y, hd + 0.015);
      break;
    }
    case 'island2': {
      // Остров: шкафы без ручек (ящики к рабочей стороне −z), белая столешница с мойкой;
      // на конце +x — тёмная деревянная столешница-стол поверх острова и за его край, на торцевой опоре, с табуретами.
      // it.slab — вылет стола за шкафы (м), it.sink — место мойки (0…1 по длине шкафов), it.pendants — подвесы-клетки.
      const slab = it.slab ?? 0.9, cx1 = hw - slab, cl = cx1 + hw;
      const sx = it.sink === null ? null : -hw + cl * (it.sink ?? 0.45);
      const holes = sx !== null ? [{ x: sx, z: 0, w: 0.55, d: 0.4 }] : [];
      const kd = D - 0.05, kz = -0.025;                     // шкафы чуть уже столешницы
      rbox(g, cl - 0.1, 0.1, kd - 0.12, M.black, -hw + cl / 2, 0.05, kz);
      cabinetBody(g, M.matte(col), -hw, cx1, kz - kd / 2, kz + kd / 2, holes);
      fronts(g, M, -hw, cx1, kz - kd / 2 - 0.02, Math.max(1, Math.round(cl / 0.9)), it.handleless !== false, -1);
      counterTop(g, M, -hw, cx1 + 0.05, -hd, hd, holes, 0.88, 0.04, M.quartz(it.top ?? '#f3f1ed'));
      if (sx !== null) sinkBowl(g, M, sx, 0, 0.55, 0.4, 0.27, -1);
      // стол: доска поверх острова и дальше, торец-опора до пола
      const wood = M.wood(it.slabColor ?? '#2e2622'), over = 0.5, sl0 = cx1 - over;
      rbox(g, hw - sl0, 0.05, D + 0.04, wood, (sl0 + hw) / 2, 0.925, 0.02);
      rbox(g, 0.05, 0.9, D - 0.1, wood, hw - 0.04, 0.45, 0.02, true);
      const ns = it.stools ?? 3;
      const sc = it.stoolColor ?? '#8c857c';
      const front = Math.min(ns, 2);
      for (let i = 0; i < front; i++) barStool(g, M, sc, cx1 + 0.12 + ((slab - 0.1) * (i + 0.5)) / front, hd + 0.1, 0);
      if (ns > 2) barStool(g, M, sc, cx1 + 0.12 + (slab - 0.1) / 2, -hd - 0.08, Math.PI);
      const np = it.pendants ?? 3, ceil = it.ceil ?? 2.7;
      for (let i = 0; i < np; i++) cagePendant(g, M, -hw + 0.3 + ((W - 0.6) * (i + 0.5)) / np, 0, ceil);
      break;
    }
    case 'wallShelf': {
      // открытые полки на стене (сзади −z — стена): деревянные доски на чёрных кронштейнах, на них посуда.
      // it.levels — число полок, it.bottom — высота нижней, it.step — шаг, it.dishes = false — без посуды
      const levels = it.levels ?? 2, y0 = it.bottom ?? 1.45, step = it.step ?? 0.4;
      const wood = M.wood(col === T.fill ? '#8a5a3a' : col);
      for (let l = 0; l < levels; l++) {
        const y = y0 + l * step;
        rbox(g, W, 0.035, D, wood, 0, y, 0);
        for (const x of [-hw + 0.12, hw - 0.12]) {
          rbox(g, 0.025, 0.12, 0.012, M.iron, x, y - 0.075, -hd + 0.006);
          rbox(g, 0.025, 0.012, D - 0.04, M.iron, x, y - 0.024, -0.02);
        }
        if (it.dishes !== false) dishes(g, M, -hw, hw, y + 0.018, -0.01, l * 2 + Math.round(W * 10));
      }
      break;
    }
    case 'oventower': {
      // колонна: духовка (дверца откидывается вниз), над ней микроволновка (дверца на петлях слева);
      // дверцы открываются клавишей E в прогулке
      const iw = W - 0.08, ov = { y0: 0.56, h: 0.58 }, mw = { y0: 1.21, h: 0.38 };
      shell(g, M.matte(col), W, 2.2, D, [ov, mw]);
      cavity(g, M.enamel, iw, ov.h, D - 0.06, ov.y0, hd);
      for (const y of [ov.y0 + 0.17, ov.y0 + 0.33]) rbox(g, iw - 0.03, 0.006, D - 0.12, M.chrome, 0, y, hd - D / 2 + 0.03).castShadow = false;
      cavity(g, M.enamel, iw, mw.h, 0.4, mw.y0, hd);
      cyl(g, 0.13, 0.13, 0.006, M.glass, 0, mw.y0 + 0.015, hd - 0.2, 32);
      applianceDoor(g, { at: [0, ov.y0, hd], axis: 'x', opened: 1.45, aim: [0, ov.h / 2, 0.02], build: c => {
        rbox(c, iw, ov.h, 0.03, M.black, 0, ov.h / 2, 0.015);
        rbox(c, iw - 0.08, 0.34, 0.031, M.glass, 0, ov.h / 2 - 0.03, 0.016);
        rbox(c, iw - 0.06, 0.02, 0.02, M.chrome, 0, ov.h - 0.06, 0.06);
        for (const sx of [-1, 1]) rbox(c, 0.015, 0.015, 0.03, M.chrome, sx * (iw / 2 - 0.05), ov.h - 0.06, 0.04);
      } });
      const mdw = iw * 0.78;
      applianceDoor(g, { at: [-iw / 2, mw.y0, hd], opened: -1.65, aim: [mdw / 2, mw.h / 2, 0.02], build: c => {
        rbox(c, mdw, mw.h, 0.03, M.black, mdw / 2, mw.h / 2, 0.015);
        rbox(c, mdw - 0.08, mw.h - 0.1, 0.031, M.glass, mdw / 2, mw.h / 2, 0.016);
      } });
      rbox(g, iw - mdw, mw.h, 0.03, M.black, iw / 2 - (iw - mdw) / 2, mw.y0 + mw.h / 2, hd + 0.015);
      break;
    }
    case 'fridge': {
      if (it.builtin) {
        // встраиваемый двухдверный: колонна 2,2 м в цвет кухни, сверху холодильная камера, снизу морозильная, над ними антресоль
        // двери на петлях слева открываются клавишей E в прогулке: внутри полки, на дверце — балконы
        const fc = M.matte(it.color ?? '#e7e3dc'), gap = M.matte('#a9a49c'), iw = W - 0.08;
        const fr = { y0: 0.84, h: 1.1 }, fz = { y0: 0.04, h: 0.76 };
        shell(g, fc, W, 2.2, D, [fz, fr]);
        cavity(g, M.fridgeIn, iw, fr.h, D - 0.06, fr.y0, hd);
        for (const y of [1.14, 1.42, 1.68]) rbox(g, iw - 0.02, 0.008, D - 0.12, M.glass, 0, y, hd - D / 2 + 0.03);
        cavity(g, M.fridgeIn, iw, fz.h, D - 0.06, fz.y0, hd);
        for (const y of [0.16, 0.42, 0.66]) rbox(g, iw - 0.04, 0.2, D - 0.14, M.gloss('#dfe6ea'), 0, y, hd - D / 2 + 0.04);
        rbox(g, W - 0.01, 0.005, 0.01, gap, 0, 1.96, hd + 0.002);
        if (!it.handleless) rbox(g, 0.3, 0.015, 0.015, M.black, 0, 2.03, hd + 0.005);
        for (const [o, hy, hl] of [[fr, 0.61, 0.36], [fz, 0.58, 0.26]]) {
          applianceDoor(g, { at: [-iw / 2, o.y0, hd], opened: -1.75, aim: [iw / 2, o.h / 2, 0.03], build: c => {
            rbox(c, iw, o.h - 0.006, 0.03, fc, iw / 2, o.h / 2, 0.015);
            if (!it.handleless) rbox(c, 0.02, hl, 0.025, M.black, iw - 0.05, hy, 0.045);
            for (const y of o === fr ? [0.25, 0.6, 0.9] : [0.3]) rbox(c, iw - 0.1, 0.07, 0.07, M.fridgeIn, iw / 2, y, -0.035);
          } });
        }
        break;
      }
      rbox(g, W, 1.95, D, M.matte(col), 0, 0.975, 0, true);
      rbox(g, W - 0.02, 0.005, 0.01, M.matte('#9ea3a8'), 0, 1.25, hd + 0.003);
      rbox(g, 0.025, 0.4, 0.03, M.chrome, hw - 0.08, 1.5, hd + 0.02);
      rbox(g, 0.025, 0.3, 0.03, M.chrome, hw - 0.08, 0.95, hd + 0.02);
      break;
    }
    case 'bath': {
      if (it.style === 'free') {
        // отдельностоящая овальная ванна и напольный смеситель-стойка у изголовья (−x); it.metal = 'brass'
        const met = it.metal === 'brass' ? M.brass : M.chrome;
        const shell = cyl(g, 0.5, 0.42, 0.6, M.gloss(col), 0, 0.3, 0, 40);
        shell.geometry.dispose();
        shell.geometry = new THREE.CylinderGeometry(0.5, 0.42, 0.6, 40, 1, true);      // открыта сверху
        shell.material = M.glossDouble(col);
        shell.scale.set(W / 1.0, 1, D / 1.0);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 8, 48), M.gloss(col));
        rim.rotation.x = Math.PI / 2; rim.position.y = 0.6; rim.scale.set(W, D, 1); g.add(rim);
        shell.userData.collide = true;
        const water = cyl(g, 0.46, 0.46, 0.01, M.gloss('#cfe1e6'), 0, 0.5, 0, 40);
        water.scale.set((W - 0.1) / 0.92, 1, (D - 0.1) / 0.92);
        cyl(g, 0.018, 0.022, 1.0, met, -hw - 0.12, 0.5, 0, 12);
        const sp = cyl(g, 0.012, 0.012, 0.22, met, -hw - 0.02, 0.98, 0, 10);
        sp.rotation.z = Math.PI / 2;
        cyl(g, 0.06, 0.07, 0.02, met, -hw - 0.12, 0.01, 0, 16);
        break;
      }
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
    case 'walkin': {
      // душевая зона во всю ширину у стены (сзади −z): слева скамья (терракотовое основание, дубовая доска),
      // диагональное стекло от стены к проходу, справа тропический душ и лейка на штанге. it.metal = 'chrome' — хром вместо латуни
      const met = it.metal === 'chrome' ? M.chrome : M.brass;
      // пол: стяжка сухой части на уровне fh, в душе — уклон от края к линейному трапу у стены (z = zd).
      // it.floorD — сколько стяжки продлить дальше в комнату (+z), чтобы пол санузла был ровным
      const fh = 0.025, zd = -hd + 0.1, gx0 = -hw + (it.glassFrom ?? 0.8), gx1 = -hw + (it.glassTo ?? 1.45);
      const gxAt = z => gx0 + ((z + hd) / D) * (gx1 - gx0);
      const fd = it.floorD ?? 0;
      const dry = new THREE.Shape([[-hw, -hd], [gx0, -hd], [gx1, hd], [hw, hd], [hw, hd + fd], [-hw, hd + fd]].map(([x, z]) => new THREE.Vector2(x, z)));
      const dm = new THREE.Mesh(new THREE.ExtrudeGeometry(dry, { depth: fh, bevelEnabled: false }), pbr(it.dryColor ?? '#8f8b85', 'plaster'));
      dm.rotation.x = Math.PI / 2; dm.position.y = fh; dm.receiveShadow = true; g.add(dm);
      const wetY = z => z <= zd ? 0.004 + (zd - z) * 0.03 : 0.004 + ((z - zd) / (hd - zd)) * (fh - 0.004);
      const pos = [];
      for (const [za, zb] of [[-hd, zd], [zd, hd]]) {
        const a0 = [gxAt(za), wetY(za), za], a1 = [hw, wetY(za), za], b0 = [gxAt(zb), wetY(zb), zb], b1 = [hw, wetY(zb), zb];
        pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      wg.computeVertexNormals();
      const wm = new THREE.Mesh(wg, M.matte(col)); wm.receiveShadow = true; g.add(wm);
      const bw = it.bench ?? 0.6;
      if (bw && it.rack) {
        // вместо скамьи — высокий стеллаж от западной стены до стекла: белые полки-трапеции, левая боковина у стены,
        // правая из дубовых реек вдоль диагонали стекла (как на референсе); сверху вниз: растения, баночки,
        // свёрнутые полотенца, стопка и корзина
        const gf = it.glassFrom ?? 0.8, gt = it.glassTo ?? 1.45, rd = 0.35, rz = -hd + rd / 2, H = 2.0;
        const xr = z => -hw + gf + ((z + hd) / D) * (gt - gf);         // x стекла на глубине z
        const x0 = -hw, xb = xr(-hd), xf = xr(-hd + rd), cx = x0 + (xb + xf) / 4 + 0.02;
        const white = M.matte('#f4f2ee'), oak = M.wood('#c9a272');
        const ys = [0.06, 0.37, 0.65, 0.92, 1.19, 1.46, 1.72, H];
        const slat = (x, z, ry, collide) => { const m = rbox(g, 0.025, H, 0.03, oak, x, H / 2, z, collide); m.rotation.y = ry; };
        const ang = -Math.atan2(D, gt - gf) + Math.PI / 2;                // рейки вдоль стекла
        for (let k = 0; k < 6; k++) {
          const z = -hd + 0.02 + k * ((rd - 0.04) / 5);
          slat(x0 + 0.0125, z, 0, k === 0 || k === 5);
          slat(xr(z) - 0.02, z, ang, false);
        }
        const shape = new THREE.Shape([[x0 + 0.025, -hd], [xb - 0.03, -hd], [xf - 0.03, -hd + rd], [x0 + 0.025, -hd + rd]].map(([x, z]) => new THREE.Vector2(x, z)));
        ys.forEach((y, l) => {
          const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }), white);
          m.rotation.x = Math.PI / 2; m.position.y = y + 0.015; m.castShadow = m.receiveShadow = true;
          if (l === 0) m.userData.collide = true;
          g.add(m);
        });
        const roll = (x, y, r, c) => { const m = cyl(g, r, r, 0.24, M.fabric(c), x, y, rz, 20); m.rotation.x = Math.PI / 2; };
        const fold = (x, y, c, n) => { for (let i = 0; i < n; i++) rbox(g, 0.4, 0.045, 0.28, M.fabric(c), x, y + 0.0225 + i * 0.047, rz); };
        const jar = (x, y, r, h, c) => cyl(g, r, r, h, M.gloss(c), x, y + h / 2, rz, 14);
        for (const [dx, c] of [[-0.2, '#e8e2d6'], [0.2, '#d9d2c6']]) {            // 1.72: растения
          cyl(g, 0.055, 0.045, 0.1, M.matte(c), cx + dx, 1.735 + 0.05, rz, 14);
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 1), M.leaf); b.position.set(cx + dx, 1.735 + 0.16, rz); g.add(b);
        }
        jar(cx - 0.24, 1.475, 0.055, 0.14, '#e8f0f0'); jar(cx, 1.475, 0.04, 0.2, '#e8e2d6'); jar(cx + 0.22, 1.475, 0.05, 0.1, '#d9d2c6');   // 1.46
        jar(cx - 0.22, 1.205, 0.04, 0.1, '#e8f0f0'); jar(cx - 0.02, 1.205, 0.04, 0.12, '#d9cbb4'); jar(cx + 0.2, 1.205, 0.03, 0.08, '#e8e2d6'); // 1.19
        roll(cx - 0.17, 0.945 + 0.07, 0.07, '#efe9df'); roll(cx, 0.945 + 0.07, 0.07, '#e4ddd0'); roll(cx + 0.17, 0.945 + 0.07, 0.07, '#efe9df'); // 0.92
        fold(cx, 0.665, '#6e6e70', 3); fold(cx, 0.665 + 0.14, '#555558', 1);       // 0.65
        rbox(g, 0.5, 0.14, 0.28, M.matte('#b9a98f'), cx, 0.385 + 0.07, rz);         // 0.37: корзина
        roll(cx - 0.12, 0.385 + 0.18, 0.05, '#efe9df'); roll(cx + 0.1, 0.385 + 0.18, 0.05, '#c9b49a');
        fold(cx, 0.075, '#d9d2c6', 3);                                              // 0.06
      } else if (bw) {
        rbox(g, bw, 0.4, 0.38, M.matte(it.benchColor ?? '#b0683f'), -hw + bw / 2, 0.2, -hd + 0.19, true);
        rbox(g, bw + 0.02, 0.04, 0.4, M.wood('#a27a52'), -hw + bw / 2 + 0.01, 0.42, -hd + 0.2);
      }
      // стекло: от стены (x0) к краю зоны (x1)
      const x0 = -hw + (it.glassFrom ?? 0.8), x1 = -hw + (it.glassTo ?? 1.45);
      const gl = Math.hypot(x1 - x0, D), ga = -Math.atan2(D, x1 - x0), gx = (x0 + x1) / 2;
      rbox(g, gl, 2.0, 0.01, M.glass, gx, 1.02, 0, true).rotation.y = ga;
      for (const y of [0.02, 2.02]) rbox(g, gl, 0.025, 0.025, met, gx, y, 0).rotation.y = ga;
      const rx = (x1 + hw) / 2 + 0.1;
      cyl(g, 0.012, 0.012, 0.35, met, rx, 2.1, -hd + 0.18, 8).rotation.x = Math.PI / 2;
      cyl(g, 0.15, 0.15, 0.015, met, rx, 2.08, -hd + 0.35, 28);
      cyl(g, 0.01, 0.01, 0.9, met, hw - 0.03, 1.3, -hd + 0.25, 8);                    // штанга лейки на боковой стене
      cyl(g, 0.03, 0.025, 0.2, met, hw - 0.05, 1.55, -hd + 0.25, 12);
      rbox(g, hw - gxAt(zd) - 0.1, 0.004, 0.06, M.iron, (gxAt(zd) + hw) / 2, 0.006, zd).castShadow = false; // линейный трап
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
      const bw = Math.min(0.5, W * 0.62), bd = Math.min(0.3, D - 0.08), bz = 0.03;
      counterTop(g, M, -hw, hw, -hd, hd, [{ x: 0, z: bz, w: bw, d: bd }], 0.86, 0.12, M.gloss('#f3f3f1'));
      sinkBowl(g, M, 0, bz, bw, bd, -hd + 0.05, 1, { top: 0.92, depth: 0.12, mat: M.gloss('#f3f3f1'), small: true, metal: it.metal === 'brass' ? M.brass : M.chrome });
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
      const tm = it.metal === 'brass' ? M.brass : M.chrome;
      for (const x of [-hw + 0.02, hw - 0.02]) cyl(g, 0.014, 0.014, 0.8, tm, x, 1.1, 0, 8);
      for (let i = 0; i < 6; i++) { const r = cyl(g, 0.01, 0.01, W - 0.04, tm, 0, 0.75 + i * 0.14, 0, 8); r.rotation.z = Math.PI / 2; }
      break;
    }
    case 'standDesk': {
      // стол на двух чёрных колоннах-подъёмниках; it.h — текущая высота столешницы (0,7–1,2 м)
      const h = it.h ?? 0.74;
      rbox(g, W, 0.03, D, M.wood(col), 0, h - 0.015, 0, true);
      for (const s of [-1, 1]) {
        rbox(g, 0.07, h - 0.08, 0.05, M.black, s * (hw - 0.2), (h - 0.08) / 2 + 0.03, 0);
        rbox(g, 0.06, 0.03, D - 0.1, M.black, s * (hw - 0.2), 0.015, 0);
        rbox(g, 0.05, 0.03, D - 0.15, M.black, s * (hw - 0.2), h - 0.05, 0);
      }
      rbox(g, W - 0.45, 0.04, 0.04, M.black, 0, h - 0.06, -hd + 0.12);
      rbox(g, 0.08, 0.012, 0.05, M.matte('#2a2c2e'), hw - 0.12, h - 0.035, hd - 0.04);   // пульт подъёма
      if (it.monitor) {
        rbox(g, 0.6, 0.36, 0.02, M.screen, 0, h + 0.3, -hd + 0.15);
        rbox(g, 0.05, 0.22, 0.05, M.black, 0, h + 0.11, -hd + 0.16);
      } else {                                                                          // ноутбук
        rbox(g, 0.32, 0.015, 0.22, M.matte('#b9bcbf'), 0, h + 0.008, 0.02);
        const lid = rbox(g, 0.32, 0.22, 0.008, M.screen, 0, h + 0.11, -0.09);
        lid.rotation.x = -0.25;
      }
      break;
    }
    case 'closet': {
      // встроенный шкаф из фанеры: верх идёт по скату — it.h0 высота у левого края (−x), it.h1 у правого (+x),
      // но не выше it.max; дверцы по ~0,45 м, теневые швы, длинные чёрные ручки
      const h0 = it.h0 ?? 2.4, h1 = it.h1 ?? 2.4, hmax = it.max ?? 2.7;
      const top = x => Math.min(hmax, h0 + ((x + hw) / W) * (h1 - h0));
      const prof = new THREE.Shape();
      prof.moveTo(-hw, 0); prof.lineTo(hw, 0);
      const steps = 12;
      for (let i = steps; i >= 0; i--) { const x = -hw + (W * i) / steps; prof.lineTo(x, top(x)); }
      const body = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: D, bevelEnabled: false }), M.ply);
      body.position.z = -hd;
      body.castShadow = body.receiveShadow = true;
      body.userData.collide = true;
      g.add(body);
      const n = Math.max(1, Math.round(W / 0.45)), dw = W / n;
      for (let i = 0; i <= n; i++) rbox(g, 0.004, Math.min(top(-hw + i * dw), hmax), 0.004, M.black, -hw + i * dw, Math.min(top(-hw + i * dw), hmax) / 2, hd + 0.001).castShadow = false;
      for (let i = 0; i < n; i++) {
        const cx = -hw + (i + 0.5) * dw, hx = cx + (i % 2 ? -1 : 1) * (dw / 2 - 0.05);
        rbox(g, 0.015, 0.5, 0.02, M.black, hx, 1.0, hd + 0.012);
      }
      break;
    }
    case 'windowSeat': {
      // скамья в нише у окна: короб из фанеры с двумя ящиками, мягкий матрас и подушки у стены (сзади −z)
      const h = it.h ?? 0.45;
      rbox(g, W, h - 0.08, D, M.ply, 0, (h - 0.08) / 2, 0, true);
      for (const s of [-1, 1]) {
        rbox(g, W / 2 - 0.03, 0.003, 0.004, M.black, s * W / 4, 0.18, hd + 0.001).castShadow = false;
        rbox(g, 0.16, 0.03, 0.02, M.black, s * W / 4, 0.25, hd + 0.01);
      }
      rbox(g, W - 0.02, 0.08, D - 0.02, M.fabric(it.cushion ?? '#5d6166'), 0, h - 0.04, 0);
      const pil = ['#e07a2f', '#4a4e53', '#d9d2c6'];
      for (let i = 0; i < 3; i++) {
        const p = rbox(g, 0.4, 0.36, 0.12, M.fabric(pil[i]), -hw + 0.3 + i * ((W - 0.6) / 2), h + 0.18, -hd + 0.1);
        p.rotation.x = -0.18;
      }
      break;
    }
    case 'loftBed': {
      // кровать-чердак: стальной каркас на 4 стойках, настил на высоте it.h (2,3 м), матрас 140×200,
      // перила с открытых сторон (it.rails: 'nw' — север/−z и запад/−x), лестница с запада (−x), LED-лента снизу
      const h = it.h ?? 2.3, st = M.black;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rbox(g, 0.05, h + 0.42, 0.05, st, sx * (hw - 0.025), (h + 0.42) / 2, sz * (hd - 0.025), true);
      for (const sz of [-1, 1]) rbox(g, W, 0.1, 0.04, st, 0, h - 0.05, sz * (hd - 0.02));
      for (const sx of [-1, 1]) rbox(g, 0.04, 0.1, D, st, sx * (hw - 0.02), h - 0.05, 0);
      rbox(g, W - 0.08, 0.025, D - 0.08, M.ply, 0, h - 0.0125, 0);
      rbox(g, W - 0.14, 0.008, 0.012, M.ledWarm, 0, h - 0.1, -hd + 0.05).castShadow = false;
      const mx = 0.12, mw = Math.min(2.0, W - 0.1), md = Math.min(1.4, D - 0.1);
      rbox(g, mw, 0.2, md, M.matte('#eeeae4'), mx / 2, h + 0.1, hd - md / 2 - 0.04);
      rbox(g, mw * 0.55, 0.05, md + 0.02, M.fabric('#6e7378'), mx / 2 + mw * 0.2, h + 0.225, hd - md / 2 - 0.04);
      for (const [i, c] of [[0, '#e07a2f'], [1, '#4a4e53']]) rbox(g, 0.5, 0.12, 0.32, M.fabric(c), hw - 0.2, h + 0.27, hd - 0.3 - i * 0.55).rotation.y = Math.PI / 2;
      // перила: верх на 0,4 м над настилом, сверху и с середины
      const rails = it.rails ?? 'nw', lw = 0.5;
      const rail = (len, x, z, alongX) => { for (const y of [h + 0.2, h + 0.4]) rbox(g, alongX ? len : 0.03, 0.03, alongX ? 0.03 : len, st, x, y, z); };
      if (rails.includes('n')) rail(W, 0, -hd + 0.02, true);
      if (rails.includes('w')) rail(D - lw - 0.05, -hw + 0.02, -hd + lw + (D - lw) / 2, false);
      // лестница: две тетивы под углом и перекладины
      const lx = -hw - 0.35, lz = -hd + lw / 2 + 0.03, ang = Math.atan2(0.35, h), len = Math.hypot(0.35, h);
      for (const s of [-1, 1]) {
        const r = rbox(g, 0.04, len + 0.4, 0.03, st, lx / 2 - hw / 2 + 0.02, (len + 0.4) / 2 - 0.02, lz + s * 0.2);
        r.rotation.z = -ang; r.position.x = -hw - 0.175;
      }
      for (let i = 1; i <= 7; i++) {
        const t = i / 8;
        rbox(g, 0.03, 0.025, 0.4, M.wood('#c9a272'), -hw - 0.35 * (1 - t), h * t, lz);
      }
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
