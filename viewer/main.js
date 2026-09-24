import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { computeRooms } from './rooms.js';
import { stairSteps } from './stairs.js';
import { createEditor } from './editor.js';
import { openStore, downloadJson } from './store.js';
import { createWalk } from './walk.js';
import { createTour } from './tour.js';
import { applyVariant, tourPoints } from './variants.js';

// Координаты плана [x, y] (метры) переводятся в 3D как (x, высота, y).
// Высоты — абсолютные отметки, 0.000 = чистый пол 1-го этажа.

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9eef3');

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.02;

scene.add(new THREE.HemisphereLight('#ffffff', '#7d7466', 1.3));
const sun = new THREE.DirectionalLight('#ffffff', 1.7);
sun.position.set(-12, 25, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 });
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(300, 300),
  new THREE.MeshStandardMaterial({ color: '#9fb989' })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.userData.walkable = true;
scene.add(ground);

const glassMat = new THREE.MeshStandardMaterial({
  color: '#9cc8e6', transparent: true, opacity: 0.35, roughness: 0.1,
  side: THREE.DoubleSide, depthWrite: false,
});
const frameMat = new THREE.MeshStandardMaterial({ color: '#ffffff' });
let soffitColor = null; // обшивка свесов снизу
const doorMat = new THREE.MeshStandardMaterial({ color: '#6d4a2f' });
const skylightMat = new THREE.MeshStandardMaterial({ color: '#2f4454', roughness: 0.2, side: THREE.DoubleSide });

// Плоскости срезки: стены группы обрезаются снизу скатами крыши, так получаются фронтоны.
let clipPlanes = {};
const matCache = new Map();

function resetMaterials() {
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
  clipPlanes = {};
}

function material(color, clip, opts = {}) {
  const key = `${color}|${clip ?? ''}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) {
    const planes = clip ? clipPlanes[clip] ?? [] : [];
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, clippingPlanes: planes, clipShadows: true,
      side: planes.length ? THREE.DoubleSide : THREE.FrontSide, ...opts,
    }));
  }
  return matCache.get(key);
}

function glass(clip) {
  if (!clip) return glassMat;
  const key = `glass|${clip}`;
  if (!matCache.has(key)) {
    const m = glassMat.clone();
    m.clippingPlanes = clipPlanes[clip] ?? [];
    matCache.set(key, m);
  }
  return matCache.get(key);
}

function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, mat) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, mat.transparent !== true);
}

// Оконный/дверной блок: белая рама + стекло или полотно.
function openingFill(o, t) {
  const g = new THREE.Group();
  const f = 0.06;
  const d = Math.min(t, 0.12);
  const glass = o.type !== 'door';
  const add = (w, h, x, y, mat) => {
    const m = box(w, h, mat === glassMat ? 0.02 : d, mat);
    m.position.set(x, y, 0);
    g.add(m);
  };
  add(o.width, f, 0, o.height - f / 2, frameMat);
  if ((o.sill ?? 0) > 0) add(o.width, f, 0, f / 2, frameMat);
  add(f, o.height, -o.width / 2 + f / 2, o.height / 2, frameMat);
  add(f, o.height, o.width / 2 - f / 2, o.height / 2, frameMat);
  if (glass) {
    add(o.width - 2 * f, o.height - 2 * f, 0, o.height / 2, glassMat);
    // импосты через ~0.9 м
    const n = Math.max(1, Math.round(o.width / 0.9));
    for (let i = 1; i < n; i++) add(0.04, o.height, -o.width / 2 + (o.width * i) / n, o.height / 2, frameMat);
  } else {
    // полотно открыто внутрь (на сторону +z, как дуга в редакторе), петли у начала проёма;
    // закрытая дверь — "open": 0
    const leafW = o.width - 2 * f;
    const leaf = box(leafW, o.height - f, 0.04, doorMat);
    const hinge = new THREE.Group();
    const sw = o.flip ? -1 : 1;       // flip: открывается на другую сторону стены
    const sh = o.hingeEnd ? -1 : 1;   // hingeEnd: петли у конца проёма, а не у начала
    hinge.position.set(sh * (-o.width / 2 + f), 0, sw * d / 2);
    hinge.rotation.y = -sw * sh * THREE.MathUtils.degToRad(o.open ?? 80);
    leaf.position.set(sh * leafW / 2, (o.height - f) / 2, 0.02);
    hinge.add(leaf);
    g.add(hinge);
  }
  return g;
}

// Стена с проёмами: собирается из кусков вдоль оси стены (локальная X).
function buildWall(wall, openings, floor, defaults) {
  const [x1, y1] = wall.from;
  const [x2, y2] = wall.to;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const t = wall.thickness ?? 0.3;
  const H = wall.height ?? floor.height;
  const clip = wall.clip === undefined ? defaults.clip : wall.clip;
  const isGlass = wall.material === 'glass';
  const mat = isGlass ? glass(clip) : material(wall.color ?? defaults.wallColor, clip);

  const g = new THREE.Group();
  g.position.set(x1, floor.elevation, y1);
  g.rotation.y = -Math.atan2(y2 - y1, x2 - x1);

  const piece = (a, b, y0, y3) => {
    if (b - a < 1e-3 || y3 - y0 < 1e-3) return;
    const m = box(b - a, y3 - y0, isGlass ? 0.03 : t, mat);
    if (isGlass) m.castShadow = false;
    m.userData.collide = true;
    m.position.set((a + b) / 2, (y0 + y3) / 2, 0);
    g.add(m);
  };

  // Удлиняем на половину толщины с обеих сторон, чтобы углы смыкались.
  let cursor = isGlass ? 0 : -t / 2;
  for (const o of [...openings].sort((a, b) => a.offset - b.offset)) {
    const sill = o.sill ?? 0;
    const a = o.offset, b = o.offset + o.width;
    piece(cursor, a, 0, H);
    piece(a, b, 0, sill);
    piece(a, b, sill + o.height, H);
    const fill = openingFill(o, t);
    fill.userData.pick = { kind: 'opening', opening: o };
    fill.position.set((a + b) / 2, sill, 0);
    g.add(fill);
    cursor = b;
  }
  piece(cursor, isGlass ? len : len + t / 2, 0, H);
  return g;
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Фахверк: брус на наружной грани стены — пояса, стойки, раскосы.
// Строится в локальных координатах стены: x вдоль стены, y вверх от пола этажа, z поперёк.
function fachwerk(wall, openings, floor, fz) {
  const t = wall.thickness ?? 0.3;
  if (wall.virtual || wall.material === 'glass' || t < 0.25) return null;
  const [x1, y1] = wall.from, [x2, y2] = wall.to;
  const L = Math.hypot(x2 - x1, y2 - y1);
  const u = [(x2 - x1) / L, (y2 - y1) / L], n = [-u[1], u[0]];
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  // наружная сторона — та, что вне контура этажа (или дальше от его центра)
  const outline = floor.outline ?? [];
  const inA = pointInPoly(mx + n[0] * 0.4, my + n[1] * 0.4, outline);
  const inB = pointInPoly(mx - n[0] * 0.4, my - n[1] * 0.4, outline);
  let side = inA && !inB ? -1 : 1;
  if (inA === inB) {
    const cx = outline.reduce((a, p) => a + p[0], 0) / outline.length;
    const cy = outline.reduce((a, p) => a + p[1], 0) / outline.length;
    side = (mx - cx) * n[0] + (my - cy) * n[1] >= 0 ? 1 : -1;
  }

  const W = fz.width ?? 0.14, D = 0.035;
  const z = side * (t / 2 + D / 2);
  const mat = material(fz.timber ?? '#5a3822', 'main');
  const H = wall.height ?? floor.height;
  const bands = (fz.bands?.[fz.floorIdx] ?? [0.07, 0.85, 2.45, 2.93]).filter(b => b < H);
  const g = new THREE.Group();
  g.position.set(x1, floor.elevation, y1);
  g.rotation.y = -Math.atan2(y2 - y1, x2 - x1);

  const beam = (xa, ya, xb, yb) => {
    const len = Math.hypot(xb - xa, yb - ya);
    if (len < 0.05) return;
    const m = box(len, W, D, mat);
    m.position.set((xa + xb) / 2, (ya + yb) / 2, z);
    m.rotation.z = Math.atan2(yb - ya, xb - xa);
    g.add(m);
  };

  const x0 = -t / 2, x9 = L + t / 2;
  const ops = [...openings].sort((a, b) => a.offset - b.offset)
    .map(o => ({ a: o.offset, b: o.offset + o.width, lo: o.sill ?? 0, hi: (o.sill ?? 0) + o.height }));

  // пояса: не пересекают проёмы
  for (const h of bands) {
    let cur = x0;
    for (const o of ops) {
      if (h > o.lo - W / 2 && h < o.hi + W / 2) { beam(cur, h, o.a - W / 2, h); cur = o.b + W / 2; }
    }
    beam(cur, h, x9, h);
  }

  const bot = bands[0] ?? 0, top = fz.floorIdx === 0 ? bands[bands.length - 1] : H;
  const post = x => beam(x, bot - W / 2, x, top + W / 2);

  // стойки: по бокам проёмов и по концам стены, простенки делим на панели ≤ facade.panel (1,5 м)
  const spans = [];
  let cur = x0 + W / 2;
  for (const o of ops) { spans.push([cur, o.a - W / 2]); cur = o.b + W / 2; }
  spans.push([cur, x9 - W / 2]);
  const braceLo = bands[0], braceHi = bands[bands.length - 1];
  spans.forEach(([a, b], si) => {
    if (b - a < 0.02) { post((a + b) / 2); return; }
    const k = Math.max(1, Math.ceil((b - a) / (fz.panel ?? 1.5)));
    const xs = Array.from({ length: k + 1 }, (_, i) => a + ((b - a) * i) / k);
    xs.forEach(post);
    if (fz.floorIdx !== 0 || (fz.braces === false)) return;
    for (let i = 0; i < k; i++) {
      const pa = xs[i] + W / 2, pb = xs[i + 1] - W / 2;
      if (pb - pa < 0.5) continue;
      const first = si === 0 && i === 0, last = si === spans.length - 1 && i === k - 1;
      if (first) beam(pa, braceLo, pb, braceHi);          // «/» у угла
      else if (last) beam(pa, braceHi, pb, braceLo);      // «\» у угла
      else if (k >= 2 && i % 2 === 0 && pb - pa < 1.4) {  // крест в глухом простенке
        beam(pa, braceLo, pb, braceHi);
        beam(pa, braceHi, pb, braceLo);
      }
    }
  });
  return g;
}

function toShape(poly) {
  return new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, -y)));
}

// Плита по контуру (с отверстиями), лежит между top - depth и top.
function slab(outline, holes, top, depth, mat) {
  const shape = toShape(outline);
  for (const h of holes ?? []) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, -y))));
  const m = mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = top - depth;
  m.userData.walkable = true;
  return m;
}

function roomLabel(text, x, y, h) {
  const div = document.createElement('div');
  div.className = 'label';
  div.textContent = text;
  const label = new CSS2DObject(div);
  label.position.set(x, h, y);
  label.userData.isLabel = true;
  return label;
}

// Пол помещения из горизонтальных полос ячеек, найденных rooms.js.
function regionMesh(runs, h, color) {
  const pos = [];
  for (const [a, b, y] of runs) {
    const y1 = y + 0.05;
    pos.push(a, h, y, b, h, y, b, h, y1, a, h, y, b, h, y1, a, h, y1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const m = mesh(geo, material(color, null, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }), false);
  m.userData.walkable = true;
  return m;
}

function buildFloor(floor, defaults) {
  const g = new THREE.Group();
  const slabT = floor.slab ?? 0.2;
  if (floor.outline) {
    g.add(slab(floor.outline, floor.holes, floor.elevation, slabT, material(floor.slabColor ?? '#9a9a9a')));
  }

  const { regions, rooms } = computeRooms(floor);
  for (const reg of regions) {
    const room = floor.rooms[reg.rooms[0]];
    g.add(regionMesh(reg.runs, floor.elevation + 0.005, room.color ?? '#d9d4c7'));
  }
  (floor.rooms ?? []).forEach((room, i) => {
    if (!room.at) return;
    const area = rooms[i].area;
    const text = area != null ? `${room.name} · ${area.toFixed(1)} м²` : room.name;
    g.add(roomLabel(text, room.at[0], room.at[1], (room.level ?? floor.elevation) + 0.05));
  });

  const walls = floor.walls.filter(w => !w.virtual).map((w, i) => ({ key: w.id ?? i, w }));
  for (const { key, w } of walls) {
    const ops = (floor.openings ?? []).filter(o => o.wall === key);
    g.add(buildWall(w, ops, floor, defaults));
    if (defaults.facade?.style === 'fachwerk') {
      const fw = fachwerk(w, ops, floor, defaults.facade);
      if (fw) g.add(fw);
    }
  }
  return g;
}

const FACES = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];

// Шестигранник из 8 вершин (0–3 низ, 4–7 верх); грани плоские, ориентация не важна (DoubleSide).
function hexahedron(v) {
  const pos = [];
  for (const [a, b, c, d] of FACES) pos.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// Призма: нижний и верхний прямоугольники [x0, x1, y0, y1] на отметках h.
function prism(s) {
  const b = s.bottom, t = s.top ?? { ...s.bottom, h: s.bottom.h + s.height };
  const [bx0, bx1, by0, by1] = b.rect, [tx0, tx1, ty0, ty1] = t.rect;
  const geo = hexahedron([
    [bx0, b.h, by0], [bx1, b.h, by0], [bx1, b.h, by1], [bx0, b.h, by1],
    [tx0, t.h, ty0], [tx1, t.h, ty0], [tx1, t.h, ty1], [tx0, t.h, ty1],
  ]);
  const m = mesh(geo, material(s.color ?? '#999999', s.clip, { side: THREE.DoubleSide }));
  m.userData.collide = true;
  m.userData.walkable = true;
  return m;
}

// Лестница: каждая ступень — проступь-плита по своему многоугольнику (марши и забежные).
function stairs(s) {
  const g = new THREE.Group();
  const mat = material(s.color ?? '#b08a5a', null, { side: THREE.DoubleSide });
  const t = s.thickness ?? 0.05;
  for (const { poly, lead, top } of stairSteps(s)) {
    const m = slab(poly, null, top, t, mat);
    m.castShadow = true;
    g.add(m);
    // подступенок — от предыдущей ступени до этой по передней кромке
    if (s.risersClosed !== false) {
      const [a, b] = lead;
      const h = (s.h[1] - s.h[0]) / (s.risers ?? 17);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 0.05) {
        const r = box(len, h, 0.03, mat);
        r.position.set((a[0] + b[0]) / 2, top - t - h / 2 + 0.001, (a[1] + b[1]) / 2);
        r.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        g.add(r);
      }
    }
  }
  return g;
}

// Перила: стойки, поручень и балясины вдоль ломаной.
function railing(r, elevation) {
  const g = new THREE.Group();
  const mat = material(r.color ?? '#5a3822');
  const H = r.height ?? 0.95, step = r.baluster ?? 0.12;
  const pts = r.path;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const ang = -Math.atan2(by - ay, bx - ax);
    const rail = box(len + 0.06, 0.06, 0.07, mat);
    rail.position.set((ax + bx) / 2, elevation + H, (ay + by) / 2);
    rail.rotation.y = ang;
    g.add(rail);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k <= n; k++) {
      const t = k / n, post = k === 0 || k === n;
      const b = box(post ? 0.08 : 0.03, H, post ? 0.08 : 0.03, mat);
      b.position.set(ax + (bx - ax) * t, elevation + H / 2, ay + (by - ay) * t);
      b.rotation.y = ang;
      b.userData.collide = true;
      g.add(b);
    }
  }
  return g;
}

// Скат крыши: 4 угла нижней поверхности [x, y, h] + толщина вверх по нормали.
function roofPanel(p) {
  const pts = p.corners.map(([x, y, h]) => new THREE.Vector3(x, h, y));
  const plane = new THREE.Plane().setFromCoplanarPoints(pts[0], pts[1], pts[2]);
  if (plane.normal.y < 0) plane.negate();
  const n = plane.normal.clone().multiplyScalar(p.thickness ?? 0.15);
  const verts = [...pts, ...pts.map(v => v.clone().add(n))].map(v => v.toArray());
  const isGlass = p.material === 'glass';
  const mat = isGlass
    ? glassMat
    : material(p.color ?? '#5b3a29', null, { side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 });
  const g = new THREE.Group();
  g.add(mesh(hexahedron(verts), mat, !isGlass));
  if (soffitColor && !isGlass) {
    // обшивка снизу: тонкий слой под скатом (видна на свесах и изнутри мансарды)
    const under = pts.map(v => v.clone().addScaledVector(plane.normal, -0.01).toArray());
    const ug = new THREE.BufferGeometry();
    ug.setAttribute('position', new THREE.Float32BufferAttribute([...under[0], ...under[1], ...under[2], ...under[0], ...under[2], ...under[3]], 3));
    ug.computeVertexNormals();
    g.add(mesh(ug, material(soffitColor, null, { side: THREE.DoubleSide }), false));
  }

  // Мансардные окна лежат в плоскости ската чуть выше покрытия.
  const heightAt = (x, y) => -(plane.normal.x * x + plane.normal.z * y + plane.constant) / plane.normal.y;
  const off = n.clone().multiplyScalar(1.15);
  for (const w of p.windows ?? []) {
    const [a, b] = w.x, [c, d] = w.y;
    const q = [[a, c], [b, c], [b, d], [a, d]]
      .map(([x, y]) => new THREE.Vector3(x, heightAt(x, y), y).add(off).toArray());
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute([...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]], 3));
    wg.computeVertexNormals();
    const sm = mesh(wg, skylightMat, false);
    sm.userData.pick = { kind: 'skylight', roof: p, win: w };
    g.add(sm);
  }
  return { group: g, plane };
}

const ui = {
  title: document.getElementById('title'),
  roof: document.getElementById('roof'),
  labels: document.getElementById('labels'),
  floors: document.getElementById('floors'),
  error: document.getElementById('error'),
  edit: document.getElementById('edit'),
};

let floorGroups = [];
let colliders = [];
let walkables = [];
const roofGroup = new THREE.Group();
scene.add(roofGroup);
const bounds = new THREE.Box3();

function disposeTree(obj) {
  obj.traverse(o => {
    o.geometry?.dispose();
    if (o.isCSS2DObject) o.element.remove();
  });
}

// Полная пересборка 3D-модели из house (после каждой правки в редакторе).
function build(house) {
  for (const g of floorGroups) { disposeTree(g); scene.remove(g); }
  disposeTree(roofGroup);
  roofGroup.clear();
  floorGroups = [];
  resetMaterials();
  const defaults = { wallColor: house.wallColor ?? '#efe9dc', clip: house.wallClip ?? null };
  frameMat.color.set(house.facade?.frames ?? '#ffffff');
  soffitColor = house.facade?.soffit ?? null;

  // Сначала крыша: из её скатов берутся плоскости срезки стен.
  for (const p of house.roofs ?? []) {
    const { group, plane } = roofPanel(p);
    roofGroup.add(group);
    // Сохраняем то, что под скатом: нормаль плоскости срезки смотрит вниз.
    if (p.clip) (clipPlanes[p.clip] ??= []).push(plane.clone().negate());
  }

  house.floors.forEach((f, i) => {
    const g = buildFloor(f, { ...defaults, facade: house.facade && { ...house.facade, floorIdx: i } });
    floorGroups.push(g);
    scene.add(g);
  });
  for (const s of house.solids ?? []) floorGroups[s.floor ?? 0].add(prism(s));
  for (const s of house.stairs ?? []) floorGroups[s.floor ?? 0].add(stairs(s));
  for (const r of house.railings ?? []) {
    const fi = r.floor ?? 0;
    floorGroups[fi]?.add(railing(r, house.floors[fi].elevation));
  }

  if (ui.floors.options.length !== house.floors.length) {
    ui.floors.innerHTML = '';
    house.floors.forEach((f, i) => ui.floors.add(new Option(i === house.floors.length - 1 ? 'все' : f.name, i)));
    ui.floors.value = house.floors.length - 1;
  }
  bounds.makeEmpty();
  floorGroups.forEach(g => bounds.expandByObject(g));
  bounds.expandByObject(roofGroup);
  colliders = [];
  walkables = [ground];
  for (const g of floorGroups) g.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.collide) colliders.push(o);
    if (o.userData.walkable) walkables.push(o);
  });
  applyVisibility();
}

function applyVisibility() {
  const upTo = Number(ui.floors.value);
  floorGroups.forEach((g, i) => { g.visible = i <= upTo; });
  const roofShown = ui.roof.checked && upTo === floorGroups.length - 1;
  roofGroup.visible = roofShown;
  // Подписи — только у верхнего видимого этажа и только без крыши.
  floorGroups.forEach((g, i) => g.traverse(o => {
    if (o.userData.isLabel) o.visible = ui.labels.checked && i === upTo && !roofShown;
  }));
}

function view(mode) {
  const c = bounds.getCenter(new THREE.Vector3());
  const r = bounds.getSize(new THREE.Vector3()).length();
  controls.target.copy(c);
  if (mode === 'top') camera.position.set(c.x, c.y + r * 1.5, c.z + 0.001);
  else camera.position.set(c.x + r * 0.55, c.y + r * 0.45, c.z + r * 0.95);
  controls.update();
}

ui.roof.onchange = ui.labels.onchange = ui.floors.onchange = applyVisibility;
document.getElementById('top').onclick = () => { ui.roof.checked = false; applyVisibility(); view('top'); };
document.getElementById('reset').onclick = () => view('3d');

function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(() => { resize(); editor.resize(); }).observe(app);
window.addEventListener('resize', resize);

const walkUi = {
  noclip: document.getElementById('noclip'),
  exitWalk: document.getElementById('exit-walk'),
  joy: document.getElementById('joy'),
  flyUp: document.getElementById('fly-up'),
  flyDown: document.getElementById('fly-down'),
};
// Видимые объекты — только они участвуют в столкновениях.
const visibleOnly = list => list.filter(o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; });
scene.add(camera); // чтобы свет, прикреплённый к камере, работал
const walk = createWalk({
  camera, dom: renderer.domElement, ui: walkUi,
  getColliders: () => visibleOnly(colliders),
  getWalkables: () => visibleOnly(walkables),
});
document.getElementById('walk').onclick = () => {
  controls.enabled = false;
  ui.floors.value = floorGroups.length - 1;
  applyVisibility();
  walk.enter();
};
walkUi.exitWalk.onclick = () => {
  walk.exit();
  controls.enabled = true;
  view('3d');
};

// Нажатие на окно в 3D открывает его в редакторе.
const picker = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', ev => { downAt = [ev.clientX, ev.clientY]; });
renderer.domElement.addEventListener('pointerup', ev => {
  if (walk.active || !downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  picker.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
  for (const hit of picker.intersectObjects(scene.children, true)) {
    let o = hit.object, visible = true;
    for (let q = o; q; q = q.parent) if (!q.visible) visible = false;
    if (!visible) continue;
    // срезанные крышей части стен не видны — сквозь них можно нажать
    const planes = hit.object.material?.clippingPlanes;
    if (planes?.some(pl => pl.distanceToPoint(hit.point) < 0)) continue;
    while (o && !o.userData.pick) o = o.parent;
    if (o) {
      if (!document.body.classList.contains('editing')) setEditing(true);
      editor.select(o.userData.pick);
      return;
    }
    if (hit.object.material?.transparent !== true) return; // первое непрозрачное — не окно
  }
});

const tour = createTour({
  camera,
  ui: { caption: document.getElementById('tour-caption'), progress: document.getElementById('tour-progress') },
});
function startTour() {
  if (walk.active) walkUi.exitWalk.click();
  if (document.body.classList.contains('editing')) setEditing(false);
  controls.enabled = false;
  ui.floors.value = floorGroups.length - 1;
  ui.roof.checked = true;
  applyVisibility();
  if (!tour.start(tourPoints(house))) controls.enabled = true;
}
function stopTour() {
  tour.stop();
  controls.enabled = true;
  view('3d');
}
document.getElementById('tour').onclick = startTour;
document.getElementById('stop-tour').onclick = stopTour;
window.addEventListener('keydown', ev => { if (tour.active && ev.key === 'Escape') stopTour(); });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (tour.active) tour.update();
  else if (walk.active) walk.update(dt);
  else controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

// ---------- редактор и сохранение ----------

let house = null;
let original = null;
let store = null;
let saveTimer = null;
let editorOpened = false;

const editor = createEditor(document.getElementById('editor'), {
  onChange(h) {
    build(h);
    scheduleSave();
  },
  onFloor(i) {
    ui.floors.value = i;
    ui.roof.checked = false;
    applyVisibility();
  },
});

function setStatus(text) { editor.setStatus(text); }

function scheduleSave() {
  if (!store) return;
  setStatus('Сохраняю…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await store.save(house);
      setStatus(store.kind === 'shared' ? 'Сохранено в проекте' : 'Сохранено в этом браузере');
    } catch (e) {
      setStatus(e?.code === 'invalid_argument' || e?.code === 'read_only'
        ? 'Только просмотр: изменения не сохраняются'
        : 'Не сохранилось. Правки остались на экране, повторю при следующем изменении.');
    }
  }, 700);
}

function setEditing(on) {
  document.body.classList.toggle('editing', on);
  ui.edit.setAttribute('aria-pressed', on);
  if (on) {
    if (!editorOpened) { editorOpened = true; editor.setFloor(house.floors.length - 1); }
    else editor.setFloor(editor.floor);
  }
  requestAnimationFrame(() => { resize(); editor.fit(); });
}

ui.edit.onclick = () => setEditing(!document.body.classList.contains('editing'));
editor.onClose(() => setEditing(false));
editor.onDownload(async () => {
  try { await downloadJson(house); } catch (e) {
    if (e?.code !== 'declined') setStatus('Скачать не удалось. Попробуйте ещё раз.');
  }
});

let resetArmed = false;
editor.onReset(() => {
  const btn = document.getElementById('ed-reset');
  if (!resetArmed) {
    resetArmed = true;
    btn.textContent = 'Точно вернуть? Нажмите ещё раз';
    setTimeout(() => { resetArmed = false; btn.textContent = 'Вернуть проект'; }, 3500);
    return;
  }
  resetArmed = false;
  btn.textContent = 'Вернуть проект';
  house = structuredClone(original);
  editor.setHouse(house, { keepView: true });
  build(house);
  renderVariants();
  scheduleSave();
});

// Переключатели вариантов (например, лестницы) в панели 3D.
function renderVariants() {
  const box = document.getElementById('variants');
  box.innerHTML = '';
  for (const [group, g] of Object.entries(house.variants ?? {})) {
    const label = document.createElement('label');
    label.textContent = (g.label ?? group) + ': ';
    const sel = document.createElement('select');
    sel.id = 'variant-' + group;
    for (const [key, opt] of Object.entries(g.options ?? {})) sel.add(new Option(opt.name ?? key, key, false, key === g.active));
    sel.onchange = () => {
      applyVariant(house, group, sel.value);
      build(house);
      editor.setHouse(house, { keepView: true });
      scheduleSave();
    };
    label.append(sel);
    box.append(label);
  }
}

async function load() {
  const res = await fetch('house.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`house.json: HTTP ${res.status}`);
  original = await res.json();
  house = structuredClone(original);
  ui.title.textContent = house.name ?? 'Мой дом';
  build(house);
  editor.setHouse(house);
  renderVariants();
  view('3d');

  // Сохранённая версия появляется позже, когда хранилище ответит.
  store = await openStore();
  setStatus(store.kind === 'shared' ? 'Правки сохраняются в проекте' : 'Правки сохраняются в этом браузере');
  try {
    const saved = await store.load();
    if (saved?.floors) {
      house = saved;
      // сохранённая версия без вариантов (старая) — берём их из проекта
      if (!house.variants && original.variants) {
        house.variants = structuredClone(original.variants);
        applyVariant(house, 'stairs', house.variants.stairs.active);
      }
      if (!house.tour && original.tour) house.tour = structuredClone(original.tour);
      build(house);
      editor.setHouse(house, { keepView: true });
      renderVariants();
      setStatus(store.kind === 'shared' ? 'Загружена сохранённая версия' : 'Загружена версия из этого браузера');
    }
  } catch {
    setStatus('Сохранённую версию загрузить не удалось, показан проект');
  }
}

resize();
load().catch(e => {
  console.error(e);
  ui.title.textContent = 'Ошибка';
  ui.error.textContent = String(e) +
    '\nОткройте через локальный сервер: python3 -m http.server (см. README).';
});

// Для отладки и скриншотов из консоли.
window.viewer = { camera, controls, view, applyVisibility, ui, editor, walk, tour, get house() { return house; } };
