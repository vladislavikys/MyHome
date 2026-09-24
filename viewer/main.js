import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

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
scene.add(ground);

const glassMat = new THREE.MeshStandardMaterial({
  color: '#9cc8e6', transparent: true, opacity: 0.35, roughness: 0.1,
  side: THREE.DoubleSide, depthWrite: false,
});
const frameMat = new THREE.MeshStandardMaterial({ color: '#ffffff' });
const doorMat = new THREE.MeshStandardMaterial({ color: '#6d4a2f' });
const skylightMat = new THREE.MeshStandardMaterial({ color: '#2f4454', roughness: 0.2, side: THREE.DoubleSide });

// Плоскости срезки: стены группы обрезаются снизу скатами крыши, так получаются фронтоны.
const clipPlanes = {};
const matCache = new Map();

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
    add(o.width - 2 * f, o.height - f, 0, (o.height - f) / 2, doorMat);
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
    fill.position.set((a + b) / 2, sill, 0);
    g.add(fill);
    cursor = b;
  }
  piece(cursor, isGlass ? len : len + t / 2, 0, H);
  return g;
}

function polygonArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
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
  return m;
}

function roomLabel(room, h) {
  const c = room.label ?? room.polygon
    .reduce((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0])
    .map(v => v / room.polygon.length);
  const div = document.createElement('div');
  div.className = 'label';
  const area = room.area ?? polygonArea(room.polygon);
  div.textContent = `${room.name} · ${area.toFixed(2)} м²`;
  const label = new CSS2DObject(div);
  label.position.set(c[0], h, c[1]);
  label.userData.isLabel = true;
  return label;
}

function buildFloor(floor, defaults) {
  const g = new THREE.Group();
  const slabT = floor.slab ?? 0.2;
  if (floor.outline) {
    g.add(slab(floor.outline, floor.holes, floor.elevation, slabT, material(floor.slabColor ?? '#9a9a9a')));
  }

  for (const room of floor.rooms ?? []) {
    if (room.color !== null) {
      const m = mesh(new THREE.ShapeGeometry(toShape(room.polygon)),
        material(room.color ?? '#d9d4c7', null, { polygonOffset: true, polygonOffsetFactor: -1 }), false);
      m.rotation.x = -Math.PI / 2;
      m.position.y = (room.level ?? floor.elevation) + 0.005;
      g.add(m);
    }
    g.add(roomLabel(room, (room.level ?? floor.elevation) + 0.05));
  }

  const walls = floor.walls.map((w, i) => ({ key: w.id ?? i, w }));
  for (const { key, w } of walls) {
    const ops = (floor.openings ?? []).filter(o => o.wall === key);
    g.add(buildWall(w, ops, floor, defaults));
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
  return mesh(geo, material(s.color ?? '#999999', s.clip, { side: THREE.DoubleSide }));
}

// Прямой марш вдоль оси y плана.
function stairs(s) {
  const g = new THREE.Group();
  const [x0, x1] = s.x, [ya, yb] = s.y, [h0, h1] = s.h;
  const n = s.steps;
  const run = (yb - ya) / n, rise = (h1 - h0) / n;
  const mat = material(s.color ?? '#b08a5a');
  for (let i = 0; i < n; i++) {
    const m = box(x1 - x0, rise * (i + 1), Math.abs(run), mat);
    m.position.set((x0 + x1) / 2, h0 + (rise * (i + 1)) / 2, ya + run * (i + 0.5));
    g.add(m);
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
    g.add(mesh(wg, skylightMat, false));
  }
  return { group: g, plane };
}

const ui = {
  title: document.getElementById('title'),
  roof: document.getElementById('roof'),
  labels: document.getElementById('labels'),
  floors: document.getElementById('floors'),
  error: document.getElementById('error'),
};

const floorGroups = [];
const roofGroup = new THREE.Group();
const bounds = new THREE.Box3();

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

async function load() {
  const res = await fetch('house.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`house.json: HTTP ${res.status}`);
  const house = await res.json();
  const defaults = { wallColor: house.wallColor ?? '#efe9dc', clip: house.wallClip ?? null };

  ui.title.textContent = house.name ?? 'Мой дом';

  // Сначала крыша: из её скатов берутся плоскости срезки стен.
  for (const p of house.roofs ?? []) {
    const { group, plane } = roofPanel(p);
    roofGroup.add(group);
    // Сохраняем то, что под скатом: нормаль плоскости срезки смотрит вниз.
    if (p.clip) (clipPlanes[p.clip] ??= []).push(plane.clone().negate());
  }

  house.floors.forEach((f, i) => {
    const g = buildFloor(f, defaults);
    floorGroups.push(g);
    scene.add(g);
    ui.floors.add(new Option(i === house.floors.length - 1 ? 'все' : f.name, i));
  });
  ui.floors.value = house.floors.length - 1;

  for (const s of house.solids ?? []) floorGroups[s.floor ?? 0].add(prism(s));
  for (const s of house.stairs ?? []) floorGroups[s.floor ?? 0].add(stairs(s));

  scene.add(roofGroup);
  floorGroups.forEach(g => bounds.expandByObject(g));
  bounds.expandByObject(roofGroup);
  applyVisibility();
  view('3d');
}

ui.roof.onchange = ui.labels.onchange = ui.floors.onchange = applyVisibility;
document.getElementById('top').onclick = () => { ui.roof.checked = false; applyVisibility(); view('top'); };
document.getElementById('reset').onclick = () => view('3d');

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

load().catch(e => {
  console.error(e);
  ui.title.textContent = 'Ошибка';
  ui.error.textContent = String(e) +
    '\nОткройте через локальный сервер: python3 -m http.server (см. README).';
});

// Для отладки и скриншотов из консоли.
window.viewer = { camera, controls, view, applyVisibility, ui };
