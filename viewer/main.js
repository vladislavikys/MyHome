import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Координаты плана [x, y] (метры) переводятся в 3D как (x, высота, y).

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#eef1f4');

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight('#ffffff', '#8a8070', 1.2));
const sun = new THREE.DirectionalLight('#ffffff', 1.6);
sun.position.set(20, 30, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 });
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: '#a9bf8e' })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.3;
ground.receiveShadow = true;
scene.add(ground);

const mat = {
  wall: new THREE.MeshStandardMaterial({ color: '#f2eee6' }),
  slab: new THREE.MeshStandardMaterial({ color: '#9a9a9a' }),
  glass: new THREE.MeshStandardMaterial({ color: '#8fc1e3', transparent: true, opacity: 0.45 }),
  door: new THREE.MeshStandardMaterial({ color: '#7b5534' }),
};

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Стена с проёмами: собирается из кусков вдоль оси стены (локальная X).
function buildWall(wall, openings, floor) {
  const [x1, y1] = wall.from;
  const [x2, y2] = wall.to;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const t = wall.thickness ?? 0.3;
  const H = wall.height ?? floor.height;

  const g = new THREE.Group();
  g.position.set(x1, floor.elevation, y1);
  g.rotation.y = -Math.atan2(y2 - y1, x2 - x1);

  const piece = (a, b, y0, y3) => {
    if (b - a < 1e-3 || y3 - y0 < 1e-3) return;
    const m = box(b - a, y3 - y0, t, mat.wall);
    m.position.set((a + b) / 2, (y0 + y3) / 2, 0);
    g.add(m);
  };

  // Удлиняем на половину толщины с обеих сторон, чтобы углы смыкались.
  let cursor = -t / 2;
  for (const o of [...openings].sort((a, b) => a.offset - b.offset)) {
    const sill = o.sill ?? 0;
    const a = o.offset, b = o.offset + o.width;
    piece(cursor, a, 0, H);
    piece(a, b, 0, sill);
    piece(a, b, sill + o.height, H);
    const fill = o.type === 'window'
      ? box(o.width, o.height, 0.03, mat.glass)
      : box(o.width - 0.05, o.height, 0.05, mat.door);
    fill.position.set((a + b) / 2, sill + o.height / 2, 0);
    g.add(fill);
    cursor = b;
  }
  piece(cursor, len + t / 2, 0, H);
  return g;
}

function floorBounds(floor) {
  const b = new THREE.Box2();
  for (const w of floor.walls) {
    const t = (w.thickness ?? 0.3) / 2;
    for (const [x, y] of [w.from, w.to]) {
      b.expandByPoint(new THREE.Vector2(x - t, y - t));
      b.expandByPoint(new THREE.Vector2(x + t, y + t));
    }
  }
  return b;
}

function buildFloor(floor) {
  const g = new THREE.Group();
  const b = floorBounds(floor);
  const size = b.getSize(new THREE.Vector2());
  const center = b.getCenter(new THREE.Vector2());

  const slabT = floor.slab ?? 0.2;
  const slab = box(size.x, slabT, size.y, mat.slab);
  slab.position.set(center.x, floor.elevation - slabT / 2, center.y);
  g.add(slab);

  for (const room of floor.rooms ?? []) {
    const shape = new THREE.Shape(room.polygon.map(([x, y]) => new THREE.Vector2(x, -y)));
    const m = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({ color: room.color ?? '#d9d4c7' })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = floor.elevation + 0.01;
    m.receiveShadow = true;
    g.add(m);

    const c = room.polygon.reduce((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0])
      .map(v => v / room.polygon.length);
    const div = document.createElement('div');
    div.className = 'label';
    div.textContent = `${room.name} · ${polygonArea(room.polygon).toFixed(1)} м²`;
    const label = new CSS2DObject(div);
    label.position.set(c[0], floor.elevation + 0.05, c[1]);
    label.userData.isLabel = true;
    g.add(label);
  }

  const byId = new Map(floor.walls.map((w, i) => [w.id ?? i, w]));
  for (const [key, wall] of byId) {
    const ops = (floor.openings ?? []).filter(o => o.wall === key);
    g.add(buildWall(wall, ops, floor));
  }
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

// Двускатная крыша над габаритом верхнего этажа; конёк вдоль длинной стороны.
function buildGableRoof(roof, floor) {
  const b = floorBounds(floor);
  const alongX = b.max.x - b.min.x >= b.max.y - b.min.y;
  // u — вдоль конька, v — поперёк.
  const [u0, u1, v0, v1] = alongX
    ? [b.min.x, b.max.x, b.min.y, b.max.y]
    : [b.min.y, b.max.y, b.min.x, b.max.x];
  const o = roof.overhang ?? 0.4;
  const k = Math.tan(THREE.MathUtils.degToRad(roof.pitch ?? 30));
  const base = floor.elevation + floor.height;
  const vm = (v0 + v1) / 2;
  const ridge = base + (vm - v0) * k;
  const eave = base - o * k;

  const P = (u, y, v) => alongX ? [u, y, v] : [v, y, u];
  const U0 = u0 - o, U1 = u1 + o, V0 = v0 - o, V1 = v1 + o;

  const quad = (a, b2, c, d) => [...a, ...b2, ...c, ...a, ...c, ...d];
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    ...quad(P(U0, eave, V0), P(U1, eave, V0), P(U1, ridge, vm), P(U0, ridge, vm)),
    ...quad(P(U0, ridge, vm), P(U1, ridge, vm), P(U1, eave, V1), P(U0, eave, V1)),
  ], 3));
  roofGeo.computeVertexNormals();
  const roofMesh = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({
    color: roof.color ?? '#7a3b2e', side: THREE.DoubleSide,
  }));
  roofMesh.castShadow = true;

  const gableGeo = new THREE.BufferGeometry();
  gableGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    ...P(u0, base, v0), ...P(u0, ridge, vm), ...P(u0, base, v1),
    ...P(u1, base, v0), ...P(u1, ridge, vm), ...P(u1, base, v1),
  ], 3));
  gableGeo.computeVertexNormals();
  const gables = new THREE.Mesh(gableGeo, new THREE.MeshStandardMaterial({
    color: mat.wall.color, side: THREE.DoubleSide,
  }));

  const g = new THREE.Group();
  g.add(roofMesh, gables);
  return g;
}

const ui = {
  title: document.getElementById('title'),
  roof: document.getElementById('roof'),
  labels: document.getElementById('labels'),
  floors: document.getElementById('floors'),
  error: document.getElementById('error'),
};

let house, floorGroups = [], roofGroup = null, bounds = new THREE.Box3();

function applyVisibility() {
  const upTo = Number(ui.floors.value);
  floorGroups.forEach((g, i) => { g.visible = i <= upTo; });
  const roofShown = ui.roof.checked && upTo === floorGroups.length - 1;
  if (roofGroup) roofGroup.visible = roofShown;
  // Подписи комнат — только когда видно интерьер (без крыши). CSS2D прячется через style.
  floorGroups.forEach((g, i) => g.traverse(o => {
    if (o.userData.isLabel) {
      o.element.style.display = ui.labels.checked && i <= upTo && !(roofShown && roofGroup) ? '' : 'none';
    }
  }));
}

function view(mode) {
  const c = bounds.getCenter(new THREE.Vector3());
  const r = bounds.getSize(new THREE.Vector3()).length();
  controls.target.copy(c);
  if (mode === 'top') camera.position.set(c.x, c.y + r * 1.6, c.z + 0.001);
  else camera.position.set(c.x + r * 0.9, c.y + r * 0.7, c.z + r * 1.1);
  controls.update();
}

async function load() {
  const res = await fetch('house.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`house.json: HTTP ${res.status}`);
  house = await res.json();

  ui.title.textContent = house.name ?? 'Мой дом';
  house.floors.forEach((f, i) => {
    const g = buildFloor(f);
    floorGroups.push(g);
    scene.add(g);
    ui.floors.add(new Option(i === house.floors.length - 1 ? 'все' : `до «${f.name}»`, i));
  });
  ui.floors.value = house.floors.length - 1;

  if (house.roof?.type === 'gable') {
    roofGroup = buildGableRoof(house.roof, house.floors.at(-1));
    scene.add(roofGroup);
  }

  floorGroups.forEach(g => bounds.expandByObject(g));
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
  ui.title.textContent = 'Ошибка';
  ui.error.textContent = String(e) +
    '\nОткройте через локальный сервер: python3 -m http.server (см. README).';
});
