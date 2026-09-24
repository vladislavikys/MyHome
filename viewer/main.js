import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { computeRooms } from './rooms.js';
import { stairSteps } from './stairs.js';
import { createEditor } from './editor.js';
import { openStore, downloadJson, downloadFile, writeMirror } from './store.js';
import { createWalk } from './walk.js';
import { createTour } from './tour.js';
import { applyVariant, tourPoints } from './variants.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { textureSet, skyTexture, doorTextures, boxUVs, setMaxAnisotropy } from './looks.js';
import { sunPosition, localToUtc, sunTimes, fmtTime } from './sun.js';
import { bakeGroup, collectClipPlanes, clearClipPlanes } from './bake.js';
import { landscapeMats, buildArea, buildItem, buildRoads } from './landscape.js';
import { lawnMaterial, grassField, grassUniforms } from './grass.js';
import { furnitureMats, buildFurniture } from './interior.js';
import { CELL } from './rooms.js';
import { createPhoto } from './photo.js';

// Координаты плана [x, y] (метры) переводятся в 3D как (x, высота, y).
// Высоты — абсолютные отметки, 0.000 = чистый пол 1-го этажа.

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
app.appendChild(renderer.domElement);
setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
labelRenderer.domElement.id = 'labels-layer';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.02;

// Постобработка: объёмное затенение в углах (GTAO) и сглаживание (SMAA).
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.1, samples: 16 });
gtao.blendIntensity = 0.9;
composer.addPass(gtao);
composer.addPass(new OutputPass());
const smaa = new SMAAPass(1, 1);
composer.addPass(smaa);
const coarse = matchMedia('(pointer: coarse)').matches;
let highQuality = !coarse;

// Солнце и небо: небо — HDR-карта окружения (рассеянный свет и отражения), солнце — направленный свет с тенями.
const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
let sky = skyTexture(SUN_DIR);
scene.background = sky;
scene.environment = sky;
scene.environmentIntensity = 0.9;
const sun = new THREE.DirectionalLight('#fff1dc', 3.2);
sun.position.copy(SUN_DIR).multiplyScalar(40).add(new THREE.Vector3(8, 0, 4));
sun.target.position.set(8, 0, 4);
scene.add(sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 130 });
scene.add(sun);

// ---------- солнце по координатам, дате и времени суток ----------
// Молодечно; север — по генплану: −y плана (улица с востока, +x). geo.north поворачивает север (°, по часовой).
const GEO_DEFAULT = { lat: 54.3136, lon: 26.8517, tz: 3, north: 0 };
const sunUi = {
  date: document.getElementById('sun-date'), time: document.getElementById('sun-time'),
  clock: document.getElementById('sun-clock'), play: document.getElementById('sun-play'), info: document.getElementById('sun-info'),
};
const sunState = (() => {
  const today = new Date(Date.now() + GEO_DEFAULT.tz * 3600e3).toISOString().slice(0, 10);
  try { const s = JSON.parse(localStorage.getItem('myhome.sun') ?? 'null'); if (s?.date) return s; } catch { /* нет хранилища */ }
  return { date: today, hours: 13 };
})();
let sunPlaying = false, sunQueued = false;
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
function applySun() {
  sunQueued = false;
  const g = { ...GEO_DEFAULT, ...(house?.geo ?? {}) };
  const { el, az } = sunPosition(localToUtc(sunState.date, sunState.hours, g.tz), g.lat, g.lon);
  const Y = new THREE.Vector3(0, 1, 0);
  const north = new THREE.Vector3(0, 0, -1).applyAxisAngle(Y, -THREE.MathUtils.degToRad(g.north));
  const east = north.clone().applyAxisAngle(Y, -Math.PI / 2);
  const dirOf = (elD, azD) => {
    const e = THREE.MathUtils.degToRad(elD), a = THREE.MathUtils.degToRad(azD);
    return east.clone().multiplyScalar(Math.sin(a) * Math.cos(e)).add(north.clone().multiplyScalar(Math.cos(a) * Math.cos(e))).add(new THREE.Vector3(0, Math.sin(e), 0));
  };
  const dir = dirOf(el, az);
  // небо и отражения
  const old = sky;
  sky = skyTexture(dir);
  scene.background = sky;
  scene.environment = sky;
  old.dispose();
  scene.environmentIntensity = 0.35 + 0.55 * smooth(-8, 20, el);
  // днём — солнце (тёплое у горизонта), ночью — слабый холодный «лунный» свет
  const w = smooth(-3, 4, el);
  const lightDir = w > 0.05 ? dirOf(Math.max(el, 1.5), az) : dirOf(35, az + 180);
  sun.position.copy(sun.target.position).addScaledVector(lightDir, 60);
  sun.intensity = w * 3.3 * (0.35 + 0.65 * smooth(0, 15, el)) + (1 - w) * 0.55;
  sun.color.set(w > 0.05 ? '#ff9a55' : '#8fa6d8');
  if (w > 0.05) sun.color.lerp(new THREE.Color('#fff1dc'), smooth(2, 25, el));
  const hh = sunState.hours;
  sunUi.clock.textContent = fmtTime(hh);
  const st = sunTimes(sunState.date, g.lat, g.lon, g.tz);
  const side = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'][Math.round(az / 45) % 8];
  sunUi.info.textContent = el > -0.8
    ? `Солнце: высота ${Math.round(el)}°, ${side} (азимут ${Math.round(az)}°) · восход ${fmtTime(st.rise)} · закат ${fmtTime(st.set)}`
    : `Солнце за горизонтом · восход ${fmtTime(st.rise)} · закат ${fmtTime(st.set)}`;
  try { localStorage.setItem('myhome.sun', JSON.stringify(sunState)); } catch { /* нет хранилища */ }
  photo?.sceneChanged?.();
}
function queueSun() { if (!sunQueued) { sunQueued = true; requestAnimationFrame(applySun); } }
sunUi.date.value = sunState.date;
sunUi.time.value = sunState.hours;
sunUi.date.addEventListener('change', () => { if (sunUi.date.value) { sunState.date = sunUi.date.value; queueSun(); } });
sunUi.time.addEventListener('input', () => { sunState.hours = parseFloat(sunUi.time.value); queueSun(); });
sunUi.play.addEventListener('click', () => {
  sunPlaying = !sunPlaying;
  sunUi.play.textContent = sunPlaying ? '❚❚' : '▶';
  sunUi.play.setAttribute('aria-label', sunPlaying ? 'Остановить смену времени суток' : 'Прокрутить сутки');
});
function tickSun(dt) {
  if (!sunPlaying) return;
  sunState.hours = (sunState.hours + dt * 1.2) % 24;   // 1,2 часа за секунду
  sunUi.time.value = sunState.hours;
  queueSun();
}

const grassTex = textureSet('grass');
const groundGeo = new THREE.PlaneGeometry(300, 300);
const guv = groundGeo.attributes.uv;
for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * 300, guv.getY(i) * 300);
const ground = new THREE.Mesh(
  groundGeo,
  lawnMaterial(grassTex)
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.userData.walkable = true;
scene.add(ground);

// PBR-материал с процедурной фактурой: kind — вид фактуры (looks.js), цвет её тонирует.
function pbr(color, kind, extra = {}) {
  const t = kind ? textureSet(kind) : null;
  return new THREE.MeshStandardMaterial({
    color, ...(t ? { map: t.map, normalMap: t.normalMap, ...t.mat } : {}), ...extra,
  });
}

const glassMat = new THREE.MeshStandardMaterial({
  color: '#c8dbe6', transparent: true, opacity: 0.18, roughness: 0.03, metalness: 0.1,
  envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false,
});
const frameMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 });
let soffitColor = null; // обшивка свесов снизу
// Межкомнатные — шпон ореха с фрезеровкой; входная — крашеный металл с филёнками.
const doorStyles = {
  interior: () => { const t = doorTextures('walnut'); return {
    leaf: new THREE.MeshStandardMaterial({ color: '#6b4630', map: t.map, normalMap: t.normalMap, roughness: 0.5 }),
    frame: new THREE.MeshStandardMaterial({ color: '#5c3d28', roughness: 0.5 }),
    handle: new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.35, metalness: 0.8 }),
  }; },
  metal: () => { const t = doorTextures('metal'); return {
    leaf: new THREE.MeshStandardMaterial({ color: '#3e6a62', map: t.map, normalMap: t.normalMap, roughness: 0.42, metalness: 0.45 }),
    frame: new THREE.MeshStandardMaterial({ color: '#3a6159', roughness: 0.45, metalness: 0.4 }),
    handle: new THREE.MeshStandardMaterial({ color: '#b08a45', roughness: 0.28, metalness: 1 }),
  }; },
};
const doorMatCache = {};
const doorMats = style => (doorMatCache[style] ??= doorStyles[style]());
const skylightMat = new THREE.MeshStandardMaterial({ color: '#1f2c36', roughness: 0.04, metalness: 0.3, envMapIntensity: 2, side: THREE.DoubleSide });

// Плоскости срезки: стены группы обрезаются снизу скатами крыши, так получаются фронтоны.
let clipPlanes = {};
const matCache = new Map();

function resetMaterials() {
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
  clipPlanes = {};
}

// opts.kind — фактура (plaster, wood-dark, floor, tiles, stone, roof, soffit, deck, foliage).
function material(color, clip, opts = {}) {
  const key = `${color}|${clip ?? ''}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) {
    const planes = clip ? clipPlanes[clip] ?? [] : [];
    const { kind, ...rest } = opts;
    const t = kind ? textureSet(kind) : null;
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, clippingPlanes: planes, clipShadows: true,
      side: planes.length ? THREE.DoubleSide : THREE.FrontSide,
      ...(t ? { map: t.map, normalMap: t.normalMap, ...t.mat } : {}),
      ...rest,
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
// room = { l, r } — сколько места для наличника слева/справа от проёма (до примыкающей стены), м
function openingFill(o, t, room = { l: 0.08, r: 0.08 }) {
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
    // Дверь: наличники + полотно на петлях (или раздвижное) — подвижная часть, её можно открыть/закрыть.
    const style = o.style ?? (t >= 0.25 ? 'metal' : 'interior');
    const M = doorMats(style);
    const metal = style === 'metal';
    for (const side of [-1, 1]) {
      const z = side * (d / 2 + 0.012);
      // наличник обрезается у примыкающей стены, чтобы не проходить сквозь неё в соседнюю комнату
      const cl = Math.max(0, Math.min(0.08, room.l)), cr = Math.max(0, Math.min(0.08, room.r));
      const top = box(o.width + cl + cr, 0.08, 0.02, M.frame); top.position.set((cr - cl) / 2, o.height + 0.04, z); g.add(top);
      for (const [sx, cw] of [[-1, cl], [1, cr]]) {
        if (cw < 0.01) continue;
        const st = box(cw, o.height + 0.08, 0.02, M.frame); st.position.set(sx * (o.width / 2 + cw / 2), (o.height + 0.08) / 2 - 0.04, z); g.add(st);
      }
    }
    if (metal) {
      // карниз над входной дверью, снаружи
      const out = o.flip ? 1 : -1;
      const c1 = box(o.width + 0.5, 0.1, 0.16, M.frame); c1.position.set(0, o.height + 0.14, out * (d / 2 + 0.08)); g.add(c1);
      const c2 = box(o.width + 0.36, 0.06, 0.1, M.frame); c2.position.set(0, o.height + 0.06, out * (d / 2 + 0.05)); g.add(c2);
    }
    const leafW = o.width - 2 * f, leafH = o.height - f, th = metal ? 0.07 : 0.04;
    const sw = o.flip ? -1 : 1, sh = o.hingeEnd ? -1 : 1;
    const leaf = box(leafW, leafH, th, M.leaf);
    leaf.userData.collide = true;
    const hx = sh * (leafW - 0.08);
    const addHandle = (parent, zSide) => {
      const zz = zSide * (th / 2 + 0.012);
      const ros = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 20), M.handle);
      ros.rotation.x = Math.PI / 2; ros.position.set(hx, 1.0, zz); parent.add(ros);
      const lever = box(0.13, 0.018, 0.022, M.handle);
      lever.position.set(hx - sh * 0.065, 1.0, zz + zSide * 0.03); parent.add(lever);
      const neck = box(0.018, 0.018, 0.04, M.handle);
      neck.position.set(hx, 1.0, zz + zSide * 0.015); parent.add(neck);
      if (metal) {
        const lock = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 16), M.handle);
        lock.rotation.x = Math.PI / 2; lock.position.set(hx, 0.86, zz); parent.add(lock);
      }
    };
    const content = new THREE.Group();
    leaf.position.set(sh * leafW / 2, leafH / 2, 0);
    content.add(leaf);
    addHandle(content, 1); addHandle(content, -1);
    if (metal) {
      const out = o.flip ? 1 : -1, zz = out * (th / 2 + 0.03);
      const head = mesh(new THREE.SphereGeometry(0.055, 20, 14), M.handle);
      head.scale.set(1, 1.1, 0.5); head.position.set(sh * leafW / 2, 1.62, zz); content.add(head);
      const ring = mesh(new THREE.TorusGeometry(0.055, 0.009, 10, 28), M.handle);
      ring.position.set(sh * leafW / 2, 1.5, zz + out * 0.01); content.add(ring);
    }
    const holder = new THREE.Group();
    holder.userData.dynamic = true;
    holder.userData.pick = { kind: 'opening', opening: o };
    if (o.slide) {
      const z = sw * (t / 2 + 0.035);
      holder.position.set(sh * (-o.width / 2 + f), 0, z);
      holder.add(content);
      const openX = -sh * leafW * (o.open ?? 0.8);
      holder.userData.door = { kind: 'slide', node: content, closed: 0, opened: openX, state: 1, value: openX };
      content.position.x = openX;
      const rail = box(o.width * 2, 0.05, 0.05, M.frame);
      rail.position.set(-sh * o.width * 0.5, o.height + 0.03, z);
      g.add(rail);
    } else {
      // holder — неподвижное крепление у петель, hinge — поворачивается
      holder.position.set(sh * (-o.width / 2 + f), 0, sw * d / 2);
      const hinge = new THREE.Group();
      hinge.add(content);
      holder.add(hinge);
      const openA = -sw * sh * THREE.MathUtils.degToRad(o.open ?? 80);
      holder.userData.door = { kind: 'swing', node: hinge, closed: 0, opened: openA, state: 1, value: openA };
      hinge.rotation.y = openA;
    }
    g.add(holder);
  }
  return g;
}

// Стена с проёмами: собирается из кусков вдоль оси стены (локальная X).
// Свободное место слева/справа от проёма [a, b] на стене до ближайшей примыкающей стены (для наличников).
function casingRoom(wall, floor, a, b) {
  const [x1, y1] = wall.from, [x2, y2] = wall.to;
  const L = Math.hypot(x2 - x1, y2 - y1), u = [(x2 - x1) / L, (y2 - y1) / L], t = wall.thickness ?? 0.3;
  const proj = p => [(p[0] - x1) * u[0] + (p[1] - y1) * u[1], Math.abs((p[0] - x1) * -u[1] + (p[1] - y1) * u[0])];
  const obst = [];
  for (const w2 of floor.walls) {
    if (w2 === wall || w2.virtual) continue;
    const t2 = w2.thickness ?? 0.3;
    // конец другой стены упирается в эту
    for (const e of [w2.from, w2.to]) {
      const [s, d] = proj(e);
      if (d <= t / 2 + 0.03 && s > -0.05 && s < L + 0.05) obst.push([s - t2 / 2, s + t2 / 2]);
    }
    // эта стена упирается концом в другую
    const L2 = Math.hypot(w2.to[0] - w2.from[0], w2.to[1] - w2.from[1]) || 1;
    const u2 = [(w2.to[0] - w2.from[0]) / L2, (w2.to[1] - w2.from[1]) / L2];
    for (const [e, s] of [[wall.from, 0], [wall.to, L]]) {
      const s2 = (e[0] - w2.from[0]) * u2[0] + (e[1] - w2.from[1]) * u2[1];
      const d2 = Math.abs((e[0] - w2.from[0]) * -u2[1] + (e[1] - w2.from[1]) * u2[0]);
      if (d2 <= t2 / 2 + 0.03 && s2 > -0.05 && s2 < L2 + 0.05) obst.push([s - t2 / 2, s + t2 / 2]);
    }
  }
  let l = 0.08, r = 0.08;
  for (const [o0, o1] of obst) {
    if (o1 <= a + 1e-3) l = Math.min(l, a - o1);
    if (o0 >= b - 1e-3) r = Math.min(r, o0 - b);
  }
  return { l, r };
}

function buildWall(wall, openings, floor, defaults) {
  const [x1, y1] = wall.from;
  const [x2, y2] = wall.to;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const t = wall.thickness ?? 0.3;
  const H = wall.height ?? floor.height;
  const clip = wall.clip === undefined ? defaults.clip : wall.clip;
  const isGlass = wall.material === 'glass';
  const mat = isGlass ? glass(clip) : material(wall.color ?? defaults.wallColor, clip, { kind: 'plaster' });

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
    const fill = openingFill(o, t, casingRoom(wall, floor, a, b));
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
  const mat = material(fz.timber ?? '#5a3822', 'main', { kind: 'wood-dark' });
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

  // у наружного угла брус продлевается на полтолщины стены; у внутреннего (эркер, ниша) — наоборот, заканчивается
  // у грани соседней стены, иначе стойка выходит на её внутреннюю поверхность тёмной полосой
  const concave = (px, py, dir) => pointInPoly(px + u[0] * dir * (t / 2 + 0.06) + n[0] * side * (t / 2 + 0.06),
    py + u[1] * dir * (t / 2 + 0.06) + n[1] * side * (t / 2 + 0.06), outline);
  const x0 = concave(x1, y1, -1) ? t / 2 : -t / 2, x9 = concave(x2, y2, 1) ? L - t / 2 : L + t / 2;
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
function regionMesh(runs, h, color, kind = 'floor') {
  const pos = [];
  for (const [a, b, y] of runs) {
    const y1 = y + 0.05;
    pos.push(a, h, y, b, h, y, b, h, y1, a, h, y, b, h, y1, a, h, y1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const m = mesh(geo, material(color, null, { kind, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }), false);
  m.userData.walkable = true;
  return m;
}

// Покрытие пола по назначению помещения (или room.texture).
const WET = /санузел|котельн|тамбур|прихож|ванн|туалет/i;
const roomFloorKind = room => room.texture ?? (WET.test(room.name) ? 'tiles' : 'floor');

let defaultsWallColor = '#efe9dc';
function buildFloor(floor, defaults) {
  defaultsWallColor = defaults.wallColor;
  const g = new THREE.Group();
  const slabT = floor.slab ?? 0.2;
  if (floor.outline) {
    g.add(slab(floor.outline, floor.holes, floor.elevation, slabT, material(floor.slabColor ?? '#9a9a9a', null, { kind: floor.slabTexture ?? (floor.elevation === 0 ? 'stone' : 'plaster') })));
  }

  const { regions, rooms } = computeRooms(floor);
  // подложка под полы комнат: сплошной слой по контуру этажа — закрывает щели у стен и на границах зон
  // (полы комнат строятся по сетке 5 см и не доходят вплотную), берётся покрытие самой большой комнаты
  if (floor.outline && regions.length) {
    const big = regions.reduce((a, b) => (b.area > a.area ? b : a));
    const room = floor.rooms[big.rooms[0]];
    const shape = new THREE.Shape(floor.outline.map(([x, y]) => new THREE.Vector2(x, -y)));
    for (const hole of floor.holes ?? []) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, -y))));
    const base = mesh(new THREE.ShapeGeometry(shape), material(room.color ?? '#d9d4c7', null, { kind: roomFloorKind(room), side: THREE.DoubleSide }), false);
    base.rotation.x = -Math.PI / 2;
    base.position.y = floor.elevation + 0.002;
    base.userData.walkable = true;
    g.add(base);
  }
  for (const reg of regions) {
    const room = floor.rooms[reg.rooms[0]];
    g.add(regionMesh(reg.runs, floor.elevation + 0.005, room.color ?? '#d9d4c7', roomFloorKind(room)));
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
  roomLinings(g, floor, defaults, regions);
  // столбы (колонны): от пола до потолка этажа; floor.columns = [{ at, w, d, round, height? }]
  for (const c of floor.columns ?? []) {
    const H = c.height ?? defaults.ceilH ?? floor.height;
    const mat = material(c.color ?? defaults.wallColor, null, { kind: 'plaster' });
    const m = c.round
      ? mesh(new THREE.CylinderGeometry((c.w ?? 0.3) / 2, (c.w ?? 0.3) / 2, H, 28), mat)
      : box(c.w ?? 0.3, H, c.d ?? 0.3, mat);
    m.position.set(c.at[0], floor.elevation + H / 2, c.at[1]);
    m.rotation.y = -THREE.MathUtils.degToRad(c.rot ?? 0);
    m.userData.collide = true;
    g.add(m);
  }
  const FM = furnitureMats();
  for (const it of floor.furniture ?? []) {
    const m = buildFurniture(it, FM);
    m.position.y = floor.elevation + 0.01;
    g.add(m);
  }
  return g;
}

// Отделка стен по комнатам: тонкая облицовка на гранях стен, обращённых в комнату
// (плитка до заданной высоты, покраска, вагонка, кирпич). Проёмы обходятся.
const WALL_KIND = { paint: 'plaster', tiles: 'tiles', wood: 'soffit', brick: 'brick' };
function roomLinings(g, floor, defaults, regions) {
  const rooms = floor.rooms ?? [];
  if (!rooms.some(r => r.wallFinish || r.wallColor)) return;
  // растр комнат: строка → [x0, x1, room]
  let y0 = Infinity;
  for (const reg of regions) for (const [, , y] of reg.runs) y0 = Math.min(y0, y);
  const rows = new Map();
  for (const reg of regions) {
    const room = reg.rooms.map(i => rooms[i]).find(r => r.wallFinish || r.wallColor) ?? rooms[reg.rooms[0]];
    for (const [a, b, y] of reg.runs) {
      const j = Math.round((y - y0) / CELL);
      if (!rows.has(j)) rows.set(j, []);
      rows.get(j).push([a, b, room]);
    }
  }
  const roomAt = (x, y) => {
    const row = rows.get(Math.floor((y - y0) / CELL + 1e-6));
    return row?.find(([a, b]) => x >= a && x <= b)?.[2] ?? null;
  };
  for (const w of floor.walls) {
    if (w.virtual || w.material === 'glass') continue;
    const [x1, y1] = w.from, [x2, y2] = w.to;
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 0.2) continue;
    const u = [(x2 - x1) / L, (y2 - y1) / L], n = [-u[1], u[0]];
    const t = w.thickness ?? 0.3, H = w.height ?? floor.height;
    const clip = w.clip === undefined ? defaults.clip : w.clip;
    const ops = (floor.openings ?? []).filter(o => o.wall === (w.id ?? floor.walls.filter(x => !x.virtual).indexOf(w)));
    for (const side of [1, -1]) {
      // какая комната у этой грани — пробами через каждые 10 см
      const STEP = 0.1, N = Math.max(1, Math.round(L / STEP));
      const at = [];
      for (let k = 0; k <= N; k++) {
        const s = (k / N) * L, off = t / 2 + 0.12;
        at.push(roomAt(x1 + u[0] * s + n[0] * off * side, y1 + u[1] * s + n[1] * off * side));
      }
      // пробелы у углов (рядом другая стена) — продолжаем соседнюю комнату
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 1; k < at.length; k++) if (!at[k] && at[k - 1]) at[k] = at[k - 1];
        for (let k = at.length - 2; k >= 0; k--) if (!at[k] && at[k + 1]) at[k] = at[k + 1];
      }
      let k0 = 0;
      for (let k = 1; k <= at.length; k++) {
        if (k < at.length && at[k] === at[k0]) continue;
        const room = at[k0];
        if (room && (room.wallFinish || room.wallColor)) {
          const a = k0 === 0 ? -t / 2 : ((k0 - 0.5) / N) * L, b = k === at.length ? L + t / 2 : ((k - 0.5) / N) * L;
          liningRun(g, w, side, a, b, H, t, clip, ops, room, floor);
        }
        k0 = k;
      }
    }
  }
}

function liningRun(g, w, side, a, b, H, t, clip, ops, room, floor) {
  const fin = room.wallFinish ?? 'paint';
  const paintColor = room.wallColor ?? defaultsWallColor;
  const bands = fin === 'tiles'
    ? [[0, Math.min(H, room.tileHeight ?? 2.1), material(room.tileColor ?? '#e9ecec', clip, { kind: 'tiles' })],
       ...(room.wallColor ? [[Math.min(H, room.tileHeight ?? 2.1), H, material(paintColor, clip, { kind: 'plaster' })]] : [])]
    : [[0, H, material(fin === 'paint' ? paintColor : room.wallColor ?? (fin === 'wood' ? '#c9a27a' : '#a8583c'), clip, { kind: WALL_KIND[fin] })]];
  const [x1, y1] = w.from, [x2, y2] = w.to;
  const grp = new THREE.Group();
  grp.position.set(x1, floor.elevation, y1);
  grp.rotation.y = -Math.atan2(y2 - y1, x2 - x1);
  const z = side * (t / 2 + 0.004), th = 0.006;
  const piece = (p0, p1, h0, h1, mat) => {
    if (p1 - p0 < 1e-3 || h1 - h0 < 1e-3) return;
    const m = box(p1 - p0, h1 - h0, th, mat);
    m.castShadow = false;
    m.position.set((p0 + p1) / 2, (h0 + h1) / 2, z);
    grp.add(m);
  };
  for (const [h0, h1, mat] of bands) {
    let cur = a;
    for (const o of [...ops].sort((p, q) => p.offset - q.offset)) {
      const oa = o.offset, ob = o.offset + o.width;
      if (ob <= a || oa >= b) continue;
      const sill = o.sill ?? 0, top = sill + o.height;
      piece(cur, Math.max(cur, oa), h0, h1, mat);
      const ca = Math.max(a, oa), cb = Math.min(b, ob);
      piece(ca, cb, h0, Math.min(h1, sill), mat);
      piece(ca, cb, Math.max(h0, top), h1, mat);
      cur = Math.max(cur, ob);
    }
    piece(cur, b, h0, h1, mat);
  }
  g.add(grp);
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
  const m = mesh(geo, material(s.color ?? '#999999', s.clip, { kind: s.texture, side: THREE.DoubleSide }));
  m.userData.collide = true;
  m.userData.walkable = true;
  return m;
}

// Лестница: каждая ступень — проступь-плита по своему многоугольнику (марши и забежные).
function stairs(s) {
  const g = new THREE.Group();
  // гладкие ступени: цельное дерево без рисунка досок (texture — по желанию)
  const mat = material(s.color ?? '#b08a5a', null, { kind: s.texture ?? null, side: THREE.DoubleSide, roughness: 0.42 });
  const t = s.thickness ?? 0.05;
  const all = stairSteps(s);
  for (const { poly, lead, top } of all) {
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
  // последний подступенок — от верхней ступени до пола следующего этажа, по задней кромке
  const last = all.at(-1);
  if (last && !last.landing && last.poly.length === 4 && s.risersClosed !== false) {
    const [a, b] = [last.poly[1], last.poly[2]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), h = s.h[1] - last.top;
    if (len > 0.05 && h > 0.01) {
      const r = box(len, h + t, 0.03, mat);
      r.position.set((a[0] + b[0]) / 2, last.top - t + (h + t) / 2, (a[1] + b[1]) / 2);
      r.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      g.add(r);
    }
  }
  return g;
}

// ---------- потолки ----------
// floor.ceiling = { finish: 'paint' | 'stretch' | 'wood' | 'concrete', color }
// Нижние этажи — плоскость под перекрытием следующего этажа (видна только снизу),
// верхний — обшивка под скатами крыши внутри наружных стен (снаружи остаётся подшивка свесов).
const CEILINGS = {
  paint: { color: '#f5f3ef', opts: { roughness: 0.92 } },
  stretch: { color: '#f7f6f3', opts: { roughness: 0.12, envMapIntensity: 1.3 } },
  wood: { color: '#d8b98c', opts: { kind: 'soffit', roughness: 0.6 } },
  concrete: { color: '#b9b6b0', opts: { kind: 'plaster', roughness: 0.95 } },
};
function ceilingOpts(c = {}) {
  const f = CEILINGS[c.finish] ?? CEILINGS.paint;
  return { color: c.color ?? f.color, opts: f.opts };
}
function buildCeilings(house) {
  const floors = house.floors;
  for (let i = 0; i < floors.length - 1; i++) {
    const up = floors[i + 1];
    if (!up.outline) continue;
    const { color, opts } = ceilingOpts(floors[i].ceiling);
    const shape = new THREE.Shape(up.outline.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of up.holes ?? []) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const m = mesh(new THREE.ShapeGeometry(shape), material(color, null, { ...opts, side: THREE.FrontSide }), false);
    m.rotation.x = Math.PI / 2;            // лицом вниз: сверху (вид без верхнего этажа) не мешает
    m.position.y = up.elevation - (up.slab ?? 0.2) - 0.003;
    floorGroups[i].add(m);
  }
  // мансарда: под скатами, только внутри наружных стен
  const top = floors.at(-1);
  if (!top?.outline) return;
  const xs = top.outline.map(p => p[0]), ys = top.outline.map(p => p[1]), inset = 0.3;
  const planes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -(Math.min(...xs) + inset)), new THREE.Plane(new THREE.Vector3(-1, 0, 0), Math.max(...xs) - inset),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -(Math.min(...ys) + inset)), new THREE.Plane(new THREE.Vector3(0, 0, -1), Math.max(...ys) - inset),
  ];
  const { color, opts } = ceilingOpts(top.ceiling);
  const { kind, ...rest } = opts;
  const tx = kind ? textureSet(kind) : null;
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, ...(tx ? { map: tx.map, normalMap: tx.normalMap, ...tx.mat } : {}), ...rest, clippingPlanes: planes });
  for (const p of house.roofs ?? []) {
    if (p.clip !== 'main' || p.material === 'glass') continue;
    const pts = p.corners.map(([x, y, h]) => new THREE.Vector3(x, h, y));
    const plane = new THREE.Plane().setFromCoplanarPoints(pts[0], pts[1], pts[2]);
    if (plane.normal.y < 0) plane.negate();
    const q = pts.map(v => v.clone().addScaledVector(plane.normal, -0.03).toArray());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]], 3));
    geo.computeVertexNormals();
    const U = new THREE.Vector3(1, 0, 0), V = plane.normal.clone().cross(U).normalize();
    const m = mesh(geo, mat, false);
    m.userData.uvFn = g => {
      const pos = g.attributes.position, uv = new Float32Array(pos.count * 2), v = new THREE.Vector3();
      for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k); uv[k * 2] = v.dot(U); uv[k * 2 + 1] = v.dot(V); }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    };
    roofGroup.add(m);
  }
}

// Стенка произвольного профиля: вдоль отрезка from→to, профиль [[t, h], …] (t — от начала, h — от пола).
// Например, стенка под маршем, повторяющая низ ступеней.
function panelSolid(s, elevation) {
  const [x1, y1] = s.from, [x2, y2] = s.to;
  const th = s.thickness ?? 0.1;
  const shape = new THREE.Shape(s.profile.map(([u, h]) => new THREE.Vector2(u, h)));
  const m = mesh(new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false }), material(s.color ?? '#efe9dc', null, { kind: s.texture ?? 'plaster' }));
  m.position.z = -th / 2;
  m.userData.collide = true;
  const g = new THREE.Group();
  g.position.set(x1, elevation, y1);
  g.rotation.y = -Math.atan2(y2 - y1, x2 - x1);
  g.add(m);
  return g;
}

// Перила: стойки, поручень и балясины вдоль ломаной.
// Точка пути [x, y] или [x, y, h] — h: отметка низа перил над полом этажа (для наклонных перил лестницы).
function railing(r, elevation) {
  const g = new THREE.Group();
  // гладкое дерево, как у ступеней (texture — по желанию)
  const mat = material(r.color ?? '#6b4630', null, { kind: r.texture ?? null, roughness: 0.45 });
  const H = r.height ?? 0.95, step = r.baluster ?? 0.12;
  // точка пути: [x, y, h = 0, drop = 0] — h: низ перил над полом этажа, drop: насколько столб уходит ниже (до площадки)
  const pts = r.path.map(([x, y, h = 0]) => new THREE.Vector3(x, elevation + h, y));
  const drops = r.path.map(p => p[3] ?? 0);
  // брус от a до b без перекоса: ширина — горизонтально, высота — в вертикальной плоскости пути
  const bar = (a, b, w, d) => {
    const X = b.clone().sub(a).normalize();
    const Z = new THREE.Vector3().crossVectors(X, new THREE.Vector3(0, 1, 0));
    if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1);
    Z.normalize();
    const Y = new THREE.Vector3().crossVectors(Z, X);
    const m = box(a.distanceTo(b), w, d, mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    return m;
  };
  const vbox = (x, y0, y1, z, s) => {
    const m = box(s, y1 - y0, s, mat);
    m.position.set(x, (y0 + y1) / 2, z);
    m.userData.collide = true;
    g.add(m);
  };
  const up = new THREE.Vector3(0, H, 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    // поручень чуть заходит на столбы
    g.add(bar(a.clone().add(up), b.clone().add(up), 0.05, 0.07));
    const flat = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(flat / step));
    for (let k = 1; k < n; k++) {
      const p = a.clone().lerp(b, k / n);
      vbox(p.x, p.y, p.y + H - 0.025, p.z, 0.035);
    }
  }
  pts.forEach((p, i) => vbox(p.x, p.y - drops[i], p.y + H + 0.06, p.z, 0.08));   // столбы на изломах и концах
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
    : material(p.color ?? '#5b3a29', null, { kind: 'roof', side: THREE.DoubleSide });
  // UV по плоскости ската: u — вдоль конька (x), v — вдоль ската
  const U = new THREE.Vector3(1, 0, 0), V = plane.normal.clone().cross(U).normalize();
  const uvFn = geo => {
    const pos = geo.attributes.position, uv = new Float32Array(pos.count * 2), q = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { q.fromBufferAttribute(pos, i); uv[i * 2] = q.dot(U); uv[i * 2 + 1] = q.dot(V); }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  };
  const g = new THREE.Group();
  const rm = mesh(hexahedron(verts), mat, !isGlass);
  rm.userData.uvFn = uvFn;
  g.add(rm);
  if (soffitColor && !isGlass) {
    // обшивка снизу: тонкий слой под скатом (видна на свесах и изнутри мансарды)
    const under = pts.map(v => v.clone().addScaledVector(plane.normal, -0.01).toArray());
    const ug = new THREE.BufferGeometry();
    ug.setAttribute('position', new THREE.Float32BufferAttribute([...under[0], ...under[1], ...under[2], ...under[0], ...under[2], ...under[3]], 3));
    ug.computeVertexNormals();
    const sm = mesh(ug, material(soffitColor, null, { kind: 'soffit', side: THREE.DoubleSide }), false);
    sm.userData.uvFn = uvFn;
    g.add(sm);
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
    sm.userData.pick = { kind: 'skylight', roof: p.src ?? p, win: w };
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
// ---------- цоколь ----------
// house.plinth = { height, finish: 'stone' | 'plaster' | 'brick', color, steps: [{ at, dir, width }] }
// Дом поднимается на высоту цоколя; террасы, крыльцо, столбы и дымоход с опорой на землю — удлиняются вниз.
const PLINTH = {
  stone: { color: '#8e877d', kind: 'stone' },
  plaster: { color: '#9a958d', kind: 'plaster' },
  brick: { color: '#8a4a36', kind: 'brick' },
};
function liftHouse(h) {
  const dz = Math.max(0, h.plinth?.height ?? 0);
  if (!dz) return h;
  const up = v => v + dz;
  return {
    ...h,
    floors: h.floors.map(f => ({ ...f, elevation: up(f.elevation) })),
    roofs: (h.roofs ?? []).map(p => ({ ...p, src: p, corners: p.corners.map(([x, y, z]) => [x, y, up(z)]) })),
    stairs: (h.stairs ?? []).map(s => ({ ...s, h: s.h.map(up) })),
    solids: (h.solids ?? []).map(s => {
      if (s.type === 'panel') return s;
      const grounded = !(s.floor > 0) && s.bottom.h <= 0.05;
      if (grounded) return s.top ? { ...s, top: { ...s.top, h: up(s.top.h) } } : { ...s, height: s.height + dz };
      return { ...s, bottom: { ...s.bottom, h: up(s.bottom.h) }, ...(s.top ? { top: { ...s.top, h: up(s.top.h) } } : {}) };
    }),
  };
}
// Контур, раздвинутый наружу на d (для облицовки цоколя, чуть выступающей из стены)
function offsetOutline(poly, d) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; area += x0 * y1 - x1 * y0; }
  const s = area > 0 ? 1 : -1;
  const nrm = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [s * (b[1] - a[1]) / L, -s * (b[0] - a[0]) / L]; };
  return poly.map((v, i) => {
    const n1 = nrm(poly[(i - 1 + poly.length) % poly.length], v), n2 = nrm(v, poly[(i + 1) % poly.length]);
    const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [v[0] + (n1[0] + n2[0]) * k, v[1] + (n1[1] + n2[1]) * k];
  });
}
function buildPlinth(orig, lifted, g) {
  const pl = orig.plinth, dz = pl?.height ?? 0, outline = orig.floors[0]?.outline;
  if (!dz || !outline) return;
  const f = PLINTH[pl.finish] ?? PLINTH.stone;
  const mat = material(pl.color ?? f.color, null, { kind: f.kind });
  const o = offsetOutline(outline, 0.04);
  const m = mesh(new THREE.ExtrudeGeometry(new THREE.Shape(o.map(([x, y]) => new THREE.Vector2(x, -y))), { depth: dz + 0.1, bevelEnabled: false }), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.1;
  m.userData.collide = true;
  g.add(m);
  // отлив по верху цоколя
  const cap = mesh(new THREE.ExtrudeGeometry(new THREE.Shape(offsetOutline(outline, 0.07).map(([x, y]) => new THREE.Vector2(x, -y))),
    { depth: 0.03, bevelEnabled: false }), material('#3a3c3e', null, { roughness: 0.5, metalness: 0.4 }));
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = dz - 0.03;
  g.add(cap);
  // ступени от крыльца и террасы к земле
  const stepMat = material(pl.stepColor ?? '#a39c92', null, { kind: 'stone' });
  for (const st of pl.steps ?? []) {
    const n = Math.max(1, Math.round(dz / 0.17)), rise = dz / n, tread = 0.3;
    const L = Math.hypot(st.dir[0], st.dir[1]), d = [st.dir[0] / L, st.dir[1] / L];
    for (let i = 1; i <= n; i++) {
      const top = dz - rise * i;
      if (top <= 0.005) break;
      const c = [st.at[0] + d[0] * tread * (i - 0.5), st.at[1] + d[1] * tread * (i - 0.5)];
      const w = st.width;
      const b = box(Math.abs(d[0]) > 0.5 ? tread : w, top + 0.05, Math.abs(d[0]) > 0.5 ? w : tread, stepMat);
      b.position.set(c[0], (top - 0.05) / 2, c[1]);
      b.userData.walkable = true;
      g.add(b);
    }
  }
}

function build(house) {
  const orig = house;
  house = liftHouse(house);
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
    const up = house.floors[i + 1];
    const ceilH = up ? up.elevation - (up.slab ?? 0.2) - f.elevation : f.height;
    const g = buildFloor(f, { ...defaults, ceilH, facade: house.facade && { ...house.facade, floorIdx: i } });
    floorGroups.push(g);
    scene.add(g);
  });
  for (const s of house.solids ?? []) floorGroups[s.floor ?? 0].add(s.type === 'panel' ? panelSolid(s, house.floors[s.floor ?? 0].elevation) : prism(s));
  for (const s of house.stairs ?? []) floorGroups[s.floor ?? 0].add(stairs(s));
  for (const r of house.railings ?? []) {
    const fi = r.floor ?? 0;
    floorGroups[fi]?.add(railing(r, house.floors[fi].elevation));
  }
  buildPlinth(orig, house, floorGroups[0]);
  buildCeilings(house);
  buildSite(house.site, house);
  // Обрезка по крыше, UV и слияние — один раз после сборки (нужно и для «Фото»).
  const planesOf = collectClipPlanes([...floorGroups, roofGroup]);
  for (const g of floorGroups) bakeGroup(g, planesOf);
  bakeGroup(roofGroup, planesOf);
  clearClipPlanes(planesOf);
  collectDoors();
  photo?.sceneChanged();

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
  for (const g of [...floorGroups, siteGroup]) g.traverse(o => {
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
// Вид с улицы: глаза прохожего напротив дома (site.streetView в координатах участка)
function siteToWorld([x, y]) {
  const p = housePlace(house.site), a = THREE.MathUtils.degToRad(-p.rot), dx = x - p.at[0], dy = y - p.at[1];
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}
document.getElementById('street').onclick = () => {
  const sv = house?.site?.streetView;
  if (!sv) return;
  if (walk.active) walkUi.exitWalk.click();
  if (tour.active) stopTour();
  ui.roof.checked = true;
  ui.floors.value = house.floors.length - 1;
  applyVisibility();
  const [ex, ez] = siteToWorld(sv.eye), [lx, lz] = siteToWorld(sv.look);
  controls.target.set(lx, 2.6, lz);
  camera.position.set(ex, 1.7, ez);
  controls.update();
};

function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  composer.setSize(w, h);
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

// ---------- фото ----------
const photoUi = {
  status: document.getElementById('photo-status'),
  save: document.getElementById('photo-save'),
};
const photo = createPhoto({
  renderer, scene, camera, ui: photoUi,
  onStart() {
    if (walk.active) walkUi.exitWalk.click();
    if (tour.active) stopTour();
    controls.enabled = false;
    if (grassMesh) grassMesh.visible = false;   // трассировщику трава не по силам
  },
  onStop() { controls.enabled = true; if (grassMesh) grassMesh.visible = highQuality; },
});
document.getElementById('photo').onclick = () => photo.start();
document.getElementById('photo-close').onclick = () => photo.stop();
photoUi.save.onclick = () => {
  renderer.domElement.toBlob(async blob => {
    try { await downloadFile('dom-foto.png', blob); } catch (e) { if (e?.code !== 'declined') photoUi.status.textContent = 'Сохранить не удалось.'; }
  }, 'image/png');
};
window.addEventListener('keydown', ev => { if (photo.active && ev.key === 'Escape') photo.stop(); });

// ---------- качество ----------
const qualityEl = document.getElementById('quality');
qualityEl.value = highQuality ? 'high' : 'fast';
function applyQuality() {
  const q = qualityEl.value, ultra = q === 'ultra';
  highQuality = q !== 'fast';
  if (grassMesh) grassMesh.visible = highQuality;
  // «Ультра» — рендер в 2× большем разрешении и сжатие (суперсэмплинг): чёткие края, мелкие детали без ряби
  const dpr = window.devicePixelRatio || 1;
  const pr = ultra ? Math.min(dpr * 2, 3) : highQuality ? Math.min(Math.max(dpr, 1.5), 2) : Math.min(dpr, 1.25);
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  gtao.updateGtaoMaterial({ samples: ultra ? 24 : 16 });
  const size = ultra ? Math.min(8192, renderer.capabilities.maxTextureSize) : highQuality ? 4096 : 2048;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  resize();
}
qualityEl.onchange = applyQuality;

// ---------- деревья вокруг ----------
function spruce(x, z, h, seed) {
  // ель: ярусы «лап» с неровным краем и провисанием, ствол
  let r0 = seed * 9301 + 49297;
  const rnd = () => ((r0 = (r0 * 9301 + 49297) % 233280) / 233280);
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.1, 0.22, h * 0.35, 10), pbr('#5b4331', 'wood-dark'));
  trunk.position.y = h * 0.175;
  g.add(trunk);
  const foliage = pbr('#2d4a2b', 'foliage', { roughness: 0.92, side: THREE.DoubleSide });
  const tiers = 11;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = (1 - t) * h * 0.26 + 0.2;
    const th = h * 0.2;
    const geo = new THREE.ConeGeometry(r, th, 22, 2, true);
    const p = geo.attributes.position, v = new THREE.Vector3();
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      const rad = Math.hypot(v.x, v.z);
      if (rad > 1e-3) {
        const ang = Math.atan2(v.z, v.x);
        const jag = 1 + 0.18 * Math.sin(ang * 7 + seed + i) + 0.12 * (rnd() - 0.5);
        v.x *= jag; v.z *= jag;
        v.y -= (rad / r) * (rad / r) * th * 0.25;   // лапы провисают к краю
      }
      p.setXYZ(k, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const cone = mesh(geo, foliage);
    cone.position.y = h * 0.22 + t * h * 0.7;
    cone.rotation.y = rnd() * Math.PI * 2;
    g.add(cone);
  }
  g.position.set(x, 0, z);
  return g;
}
// ---------- участок (генплан): граница с забором, гараж, баня, дорожки ----------
const siteGroup = new THREE.Group();
scene.add(siteGroup);

function flatQuad(poly, h, mat) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, -y)));
  const m = mesh(new THREE.ShapeGeometry(shape), mat, false);
  m.rotation.x = -Math.PI / 2;
  m.position.y = h;
  return m;
}

// Пристройка — часть того же здания: b.annex = { length, height, rise, side: 'end' | 'start' }.
// Стоит у торца по оси конька, ширина — как у здания; двигается и поворачивается вместе с ним.
function annexRect(b) {
  const a = b.annex;
  if (!a) return null;
  const [x0, y0, x1, y1] = b.rect, w = x1 - x0, d = y1 - y0;
  const alongX = b.ridge ? b.ridge === 'x' : w >= d - 1e-6, L = a.length ?? 3, end = a.side !== 'start';
  return alongX ? (end ? [x1, y0, x1 + L, y1] : [x0 - L, y0, x0, y1]) : (end ? [x0, y1, x1, y1 + L] : [x0, y0 - L, x1, y0]);
}
function outbuilding(b) {
  const g = outbuildingPart(b);
  const ar = annexRect(b);
  if (ar) {
    const a = b.annex;
    const w = b.rect[2] - b.rect[0], d = b.rect[3] - b.rect[1];
    g.add(outbuildingPart({ ...b, annex: undefined, name: undefined, rect: ar, height: a.height ?? (b.height ?? 2.8) - 0.5,
      rise: a.rise ?? b.rise, ridge: b.ridge ?? (w >= d - 1e-6 ? 'x' : 'y'), join: a.side === 'start' ? 'end' : 'start', doors: a.doors ?? [] }));
  }
  return g;
}
function outbuildingPart(b) {
  const g = new THREE.Group();
  const [x0, y0, x1, y1] = b.rect;
  const w = x1 - x0, dpt = y1 - y0, H = b.height ?? 2.8;
  const walls = box(w, H, dpt, pbr(b.wallColor ?? '#e9e4da', b.wallTexture ?? 'plaster'));
  walls.position.set((x0 + x1) / 2, H / 2, (y0 + y1) / 2);
  walls.userData.collide = true;
  g.add(walls);
  const plinth = box(w + 0.04, 0.3, dpt + 0.04, pbr('#9a8f84', 'stone'));
  plinth.position.set((x0 + x1) / 2, 0.15, (y0 + y1) / 2);
  g.add(plinth);
  const roofMat = pbr(b.roofColor ?? '#5b3a29', 'roof', { side: THREE.DoubleSide });
  const o = b.overhang ?? 0.4;
  if (b.roof === 'gable') {
    // конёк вдоль длинной стороны
    const alongX = b.ridge ? b.ridge === 'x' : w >= dpt - 1e-6;   // ridge: 'x' | 'y' — явное направление конька
    // join: 'start' | 'end' — этот торец примыкает к другому зданию: без свеса и без фронтона
    const o0 = b.join === 'start' ? 0 : o, o1 = b.join === 'end' ? 0 : o;
    // rise — подъём конька над верхом стен; скат лежит на верхней кромке стены и продолжается свесом вниз
    const half = (alongX ? dpt : w) / 2, rise = b.rise ?? half * 0.7;
    const span = half + o, len = (alongX ? w : dpt) + o0 + o1, shift = (o1 - o0) / 2;
    const ang = Math.atan2(rise, half), slope = span / Math.cos(ang), th = 0.1;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (const side of [-1, 1]) {
      const panel = box(alongX ? len : slope, th, alongX ? slope : len, roofMat);
      // середина ската по горизонтали — span/2 от конька; поднимаем на полтолщины по нормали
      const hy = H + rise - (span / 2) * Math.tan(ang) + (th / 2) / Math.cos(ang);
      panel.position.set(cx + (alongX ? shift : side * span / 2), hy, cy + (alongX ? side * span / 2 : shift));
      if (alongX) panel.rotation.x = side * ang; else panel.rotation.z = -side * ang;
      g.add(panel);
    }
    // коньковая планка
    const ridgeCap = box(alongX ? len : 0.16, 0.08, alongX ? 0.16 : len, roofMat);
    ridgeCap.position.set(cx + (alongX ? shift : 0), H + rise + th / Math.cos(ang) - 0.01, cy + (alongX ? 0 : shift));
    g.add(ridgeCap);
    // фронтоны: от верха стен до конька (под скат, без зазора)
    const tri = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rise)]);
    for (const side of [-1, 1]) {
      if ((side < 0 && b.join === 'start') || (side > 0 && b.join === 'end')) continue;
      const gm = mesh(new THREE.ShapeGeometry(tri), pbr(b.wallColor ?? '#e9e4da', b.wallTexture ?? 'plaster', { side: THREE.DoubleSide }));
      if (alongX) { gm.rotation.y = Math.PI / 2; gm.position.set(side > 0 ? x1 : x0, H, cy); }
      else gm.position.set(cx, H, side > 0 ? y1 : y0);
      g.add(gm);
    }
  } else if (b.roof === 'flat') {
    // плоская: плита с небольшим свесом и металлическим отливом по краю
    const ov = b.overhang ?? 0.15;
    const plate = box(w + 2 * ov, 0.22, dpt + 2 * ov, pbr(b.roofColor ?? '#8d8f8c', null, { roughness: 0.6, metalness: 0.3 }));
    plate.position.set((x0 + x1) / 2, H + 0.11, (y0 + y1) / 2);
    g.add(plate);
    const top = box(w + 2 * ov - 0.1, 0.02, dpt + 2 * ov - 0.1, pbr('#5d5f5f', 'gravel'));
    top.position.set((x0 + x1) / 2, H + 0.23, (y0 + y1) / 2);
    g.add(top);
  } else {
    // односкатная
    const drop = b.drop ?? 0.5;
    const panel = box(w + 2 * o, 0.12, Math.hypot(dpt + 2 * o, drop), roofMat);
    panel.position.set((x0 + x1) / 2, H + 0.06 + drop / 2 * 0, (y0 + y1) / 2);
    panel.rotation.x = Math.atan2(drop, dpt + 2 * o) * (b.slopeTo === 'north' ? -1 : 1);
    g.add(panel);
  }
  const doorFrame = pbr('#3a2f27', null, { roughness: 0.6 }), doorHandle = pbr('#1b1b1b', null, { roughness: 0.35, metalness: 0.8 });
  for (const d of b.doors ?? []) {
    const dg = new THREE.Group();
    const [dx, dy] = d.at;
    dg.position.set(dx, 0, dy);
    if (d.axis === 'y') dg.rotation.y = Math.PI / 2;
    const leaf = box(d.width - 0.08, d.height - 0.04, 0.05, pbr(d.color ?? '#4a4038', d.width > 1.8 ? 'roof' : null, { roughness: 0.5, metalness: d.width > 1.8 ? 0.5 : 0.2 }));
    leaf.position.set(0, (d.height - 0.04) / 2, 0);
    dg.add(leaf);
    const top = box(d.width + 0.08, 0.06, 0.08, doorFrame); top.position.set(0, d.height, 0); dg.add(top);
    for (const s of [-1, 1]) { const st = box(0.06, d.height, 0.08, doorFrame); st.position.set(s * (d.width / 2 - 0.01), d.height / 2, 0); dg.add(st); }
    if (d.width <= 1.8) for (const s of [-1, 1]) { const h = box(0.12, 0.025, 0.03, doorHandle); h.position.set(d.width / 2 - 0.16, 1.0, s * 0.045); dg.add(h); }
    g.add(dg);
  }
  return g;
}

// Ворота в старом формате [x, y, полуширина] → объект.
function normGate(g) {
  return Array.isArray(g) ? { at: [g[0], g[1]], width: g[2] * 2, type: 'gap' } : g;
}

// Деталь-брусок с UV в метрах (для подвижных частей, которые не запекаются).
function part(parent, w, h, d, mat, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  geo.translate(x, y, z);
  boxUVs(geo);
  const m = mesh(geo, mat);
  parent.add(m);
  return m;
}

// Панель в стиле «графитовая рама + доска под дерево + вертикальные ламели».
// Локально: x от 0 до L, y от y0 до y0+H, плоскость z = 0.
function fencePanel(parent, M, x0, L, y0, H, { slats = [], collide = true } = {}) {
  const fr = 0.05, th = 0.05;
  const add = (w, h, d, mat, x, y, z) => { const m = part(parent, w, h, d, mat, x, y, z); if (collide) m.userData.collide = true; return m; };
  add(L, fr, th, M.metal, x0 + L / 2, y0 + fr / 2, 0);
  add(L, fr, th, M.metal, x0 + L / 2, y0 + H - fr / 2, 0);
  add(fr, H, th, M.metal, x0 + fr / 2, y0 + H / 2, 0);
  add(fr, H, th, M.metal, x0 + L - fr / 2, y0 + H / 2, 0);
  const rail = y0 + H * 0.3;
  // зоны ламелей → остальное заполняется доской
  const zones = slats.map(([a, b]) => [x0 + a * L, x0 + b * L]).sort((p, q) => p[0] - q[0]);
  let cur = x0 + fr;
  const wood = (a, b) => {
    if (b - a < 0.02) return;
    add(b - a, H - 2 * fr, 0.02, M.wood, (a + b) / 2, y0 + H / 2, 0);
    add(b - a, 0.045, th, M.metal, (a + b) / 2, rail, 0);
  };
  for (const [a, b] of zones) {
    wood(cur, a);
    add(0.04, H, th, M.metal, a, y0 + H / 2, 0);
    add(0.04, H, th, M.metal, b, y0 + H / 2, 0);
    const n = Math.max(2, Math.round((b - a) / 0.07));
    for (let i = 1; i < n; i++) add(0.025, H - 2 * fr, 0.04, M.metal, a + (b - a) * i / n, y0 + H / 2, 0);
    cur = b;
  }
  wood(cur, x0 + L - fr);
}

function pillar(g, M, x, H) {
  part(g, 0.46, 0.45, 0.46, M.concrete, x, 0.225, 0);
  const b = part(g, 0.38, H - 0.35, 0.38, M.brick, x, 0.45 + (H - 0.35) / 2 - 0.05, 0);
  b.userData.collide = true;
  part(g, 0.46, 0.04, 0.46, M.metal, x, H + 0.07, 0);
  part(g, 0.34, 0.04, 0.34, M.metal, x, H + 0.11, 0);
  part(g, 0.2, 0.04, 0.2, M.metal, x, H + 0.15, 0);
}

function insidePoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Ворота на ребре забора. Локально: x — вдоль забора, z — поперёк (inside — сторона участка).
function gateLeaf(eg, M, gate, t0, t1, H, inside, roomPlus, roomMinus) {
  const w = t1 - t0;
  const holder = new THREE.Group();
  holder.userData.dynamic = true;
  const content = new THREE.Group();
  holder.add(content);
  if (gate.type === 'slide') {
    // откатные: полотно идёт по стороне участка вдоль забора
    const dir = (roomPlus >= roomMinus ? 1 : -1) * (gate.flip ? -1 : 1);
    const z = inside * 0.3;
    holder.position.set(t0, 0, z);
    fencePanel(content, M, 0.02, w - 0.04, 0.08, H - 0.1, { slats: [[0.56, 0.7]] });
    // балка-направляющая и ролики
    part(content, w - 0.04, 0.08, 0.07, M.metal, w / 2, 0.04, 0);
    // направляющая по земле вдоль хода полотна
    part(eg, 2 * w, 0.03, 0.1, M.metal, dir > 0 ? t0 + w : t1 - w, 0.015, z);
    const open = dir * (w + 0.1);
    holder.userData.door = { kind: 'slide', node: content, closed: 0, opened: open, state: 0, value: 0, reach: w / 2 + 2.5 };
  } else {
    // калитка / распашная створка: петли у края t0 (или t1 при flip)
    const fl = gate.flip ? -1 : 1;
    holder.position.set(fl > 0 ? t0 : t1, 0, 0);
    const lx = fl > 0 ? 0 : -w;
    fencePanel(content, M, lx + 0.02, w - 0.04, 0.08, H - 0.1, { slats: fl > 0 ? [[0.74, 0.86]] : [[0.14, 0.26]] });
    const hx = fl > 0 ? w * 0.7 : -w * 0.7;
    for (const s of [-1, 1]) part(content, 0.03, 1.1, 0.03, M.metal, hx, 1.05, s * 0.06);
    const open = -inside * fl * THREE.MathUtils.degToRad(85);
    holder.userData.door = { kind: 'swing', node: content, closed: 0, opened: open, state: 0, value: 0, reach: 2.6 };
  }
  eg.add(holder);
}

function fence(boundary, gates, height = 2.0) {
  const g = new THREE.Group();
  const M = {
    metal: pbr('#33363a', null, { roughness: 0.45, metalness: 0.55 }),
    wood: pbr('#7c5436', 'fence-wood'),
    brick: pbr('#b06a4a', 'brick'),
    concrete: pbr('#b3b0a9', 'plaster', { roughness: 0.9 }),
  };
  const P = 0.19;   // половина столба
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.5) continue;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    const eg = new THREE.Group();
    eg.position.set(a[0], 0, a[1]);
    eg.rotation.y = -Math.atan2(uy, ux);
    g.add(eg);
    // локальная ось z = (-uy, ux) на плане: с какой стороны участок
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const inside = insidePoly([mid[0] - uy * 0.5, mid[1] + ux * 0.5], boundary) ? 1 : -1;
    // ворота на этом ребре
    const ops = [];
    for (const gt of gates) {
      const t = (gt.at[0] - a[0]) * ux + (gt.at[1] - a[1]) * uy;
      const d = Math.abs((gt.at[0] - a[0]) * -uy + (gt.at[1] - a[1]) * ux);
      if (d > 0.4 || t < P || t > L - P) continue;
      const w = Math.min(gt.width, L - 4 * P);
      ops.push({ gt, t0: Math.max(2 * P, t - w / 2), t1: Math.min(L - 2 * P, t + w / 2) });
    }
    ops.sort((p, q) => p.t0 - q.t0);
    // пролёты забора между столбами
    const runs = [];
    let s = 0;
    for (const o of ops) { runs.push([s, o.t0 - P]); s = o.t1 + P; }
    runs.push([s, L]);
    for (const [r0, r1] of runs) {
      pillar(eg, M, r0, height);
      if (r1 - r0 < 0.5) { if (r1 < L) pillar(eg, M, r1, height); continue; }
      const n = Math.ceil((r1 - r0) / 3);
      for (let k = 0; k < n; k++) {
        const x0 = r0 + (k / n) * (r1 - r0), x1 = r0 + ((k + 1) / n) * (r1 - r0);
        if (k > 0) pillar(eg, M, x0, height);
        part(eg, x1 - x0 - 2 * P, 0.3, 0.2, M.concrete, (x0 + x1) / 2, 0.1, 0);
        fencePanel(eg, M, x0 + P, x1 - x0 - 2 * P, 0.25, height - 0.3);
      }
      if (r1 < L) pillar(eg, M, r1, height);
    }
    ops.forEach((o, k) => {
      if (o.gt.type === 'gap') return;
      const next = ops[k + 1]?.t0 ?? L, prev = ops[k - 1]?.t1 ?? 0;
      gateLeaf(eg, M, o.gt, o.t0, o.t1, height, inside, next - o.t1, o.t0 - prev);
    });
  }
  return g;
}

// Положение дома на участке: точка at (участок) ← начало координат дома, поворот rot (°).
function housePlace(site) {
  return { at: site?.house?.at ?? [0, 0], rot: site?.house?.rot ?? 0 };
}

let grassMesh = null;
function buildSite(site, house) {
  siteGroup.traverse(o => o.geometry?.dispose());
  siteGroup.clear();
  grassMesh = null;
  if (!site) return;
  // Мир = система координат дома; участок разворачиваем обратно к нему.
  const place = housePlace(site);
  const frame = new THREE.Group();
  frame.rotation.y = THREE.MathUtils.degToRad(place.rot);
  const inner = new THREE.Group();
  inner.position.set(-place.at[0], 0, -place.at[1]);
  frame.add(inner);
  siteGroup.add(frame);
  const LM = landscapeMats();
  (site.paths ?? []).forEach((a, i) => inner.add(buildArea(a, LM, i + 1)));
  (site.items ?? []).forEach((it, i) => inner.add(buildItem(it, LM, i + 1)));
  inner.add(buildRoads(site, LM));
  // живая трава: везде на участке, кроме дома, построек и покрытий
  const toSite = ([x, y]) => {
    const a = THREE.MathUtils.degToRad(place.rot), c = Math.cos(a), s = Math.sin(a);
    return [place.at[0] + x * c - y * s, place.at[1] + x * s + y * c];
  };
  const excludes = [
    (house.floors[0]?.outline ?? []).map(toSite),
    ...(house.solids ?? []).filter(s => !(s.floor > 0) && s.bottom?.rect).map(s => {
      const [x0, x1, y0, y1] = s.bottom.rect;
      return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(toSite);
    }),
    ...(site.buildings ?? []).flatMap(b => {
      const cx = (b.rect[0] + b.rect[2]) / 2, cy = (b.rect[1] + b.rect[3]) / 2, a = THREE.MathUtils.degToRad(b.rot ?? 0);
      return [b.rect, annexRect(b)].filter(Boolean).map(([x0, y0, x1, y1]) =>
        [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]));
    }),
    ...(site.paths ?? []).map(p => p.poly),
    ...(site.items ?? []).filter(it => it.type === 'gazebo').map(it => {
      const h = 1.65 * (it.size ?? 1);
      return [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [it.at[0] + x, it.at[1] + y]);
    }),
  ];
  grassMesh = grassField(site.boundary, excludes);
  if (grassMesh) { grassMesh.visible = highQuality && !photo?.active; inner.add(grassMesh); }
  for (const b of site.buildings ?? []) {
    const [x0, y0, x1, y1] = b.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const wrap = new THREE.Group();
    wrap.position.set(cx, 0, cy);
    wrap.rotation.y = -THREE.MathUtils.degToRad(b.rot ?? 0);
    const og = outbuilding(b);
    og.position.set(-cx, 0, -cy);
    wrap.add(og);
    inner.add(wrap);
  }
  if (site.boundary) inner.add(fence(site.boundary, (site.gates ?? []).map(normGate), site.fenceHeight));
  bakeGroup(siteGroup);
}

// ---------- двери: открыть / закрыть ----------
let doors = [];
function collectDoors() {
  doors = [];
  for (const g of [...floorGroups, siteGroup]) g.traverse(o => { if (o.userData.door) doors.push(o); });
}
function animateDoors(dt) {
  for (const h of doors) {
    const d = h.userData.door;
    const target = d.state ? d.opened : d.closed;
    if (Math.abs(d.value - target) < 1e-4) continue;
    const speed = d.kind === 'swing' ? 3.2 : 2.2;   // рад/с или м/с
    d.value += Math.sign(target - d.value) * Math.min(Math.abs(target - d.value), speed * dt);
    if (d.kind === 'swing') d.node.rotation.y = d.value; else d.node.position.x = d.value;
  }
}
// Ближайшая дверь перед камерой (до 2 м).
function toggleNearestDoor() {
  const cam = camera.position, fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  // выбираем дверь, на которую смотрим: важнее направление взгляда, чем расстояние
  let best = null, bestScore = -Infinity;
  const p = new THREE.Vector3();
  fwd.y = 0; fwd.normalize();
  for (const h of doors) {
    if (!h.parent?.visible) continue;
    h.getWorldPosition(p);
    p.y = cam.y;
    const d = p.distanceTo(cam);
    if (d > (h.userData.door.reach ?? 2.2)) continue;
    const dot = p.clone().sub(cam).setY(0).normalize().dot(fwd);
    if (dot < 0.4 && d > 0.8) continue;
    const score = dot - d * 0.25;
    if (score > bestScore) { best = h; bestScore = score; }
  }
  if (best) best.userData.door.state ^= 1;
  return !!best;
}
window.addEventListener('keydown', ev => {
  if (walk.active && ev.code === 'KeyE' && !ev.target.closest?.('input, select, textarea')) toggleNearestDoor();
});
document.getElementById('door-toggle').onclick = () => toggleNearestDoor();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  tickSun(dt);
  grassUniforms.uTime.value = clock.elapsedTime;
  animateDoors(dt);
  if (photo.active) { photo.update(); return; }
  if (tour.active) tour.update();
  else if (walk.active) walk.update(dt);
  else controls.update();
  if (highQuality) composer.render(); else renderer.render(scene, camera);
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
  onSite() {
    ui.floors.value = house.floors.length - 1;
    ui.roof.checked = true;
    applyVisibility();
  },
});

function setStatus(text) { editor.setStatus(text); }

function scheduleSave() {
  // копия в браузере — сразу, общий документ — через 0,7 с после последней правки
  writeMirror(house, original?.revision ?? null);
  if (!store) return;
  setStatus('Сохраняю…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await store.save(house, original?.revision ?? null);
      setStatus(store.kind === 'shared' ? 'Сохранено в проекте' : 'Сохранено в этом браузере');
    } catch (e) {
      setStatus(e?.code === 'invalid_argument' || e?.code === 'read_only'
        ? 'Только просмотр: изменения не сохраняются'
        : 'Не сохранилось. Правки остались на экране, повторю при следующем изменении.');
    }
  }, 700);
}

// закрытие / перезагрузка страницы: несохранённое — сразу в браузер и в проект
function flushSave() {
  if (!saveTimer || !house) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  writeMirror(house, original?.revision ?? null);
  store?.save(house, original?.revision ?? null).catch(() => {});
}
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

function setEditing(on) {
  document.body.classList.toggle('editing', on);
  ui.edit.setAttribute('aria-pressed', on);
  if (on) {
    if (!editorOpened) { editorOpened = true; editor.setFloor(house.floors.length - 1); }
    else if (editor.site) editor.setSite(); else editor.setFloor(editor.floor);
  }
  requestAnimationFrame(() => { resize(); editor.fit(); });
}

ui.edit.onclick = () => setEditing(!document.body.classList.contains('editing'));
editor.onClose(() => setEditing(false));

// 3D-модель целиком (.glb) — для Twinmotion / Unreal Engine / Blender / D5 / Lumion
async function exportGlb() {
  const hidden = [];
  const show = o => { if (!o.visible) { hidden.push(o); o.visible = true; } };
  [...floorGroups, roofGroup, siteGroup, ground].forEach(show);
  if (grassMesh?.visible) { grassMesh.visible = false; hidden.push({ restore: () => { grassMesh.visible = highQuality; } }); }
  try {
    const root = [...floorGroups, roofGroup, siteGroup, ground];
    // служебные данные (двери, выбор, коллизии) в файл не пишем — иначе он раздувается в десятки раз
    const saved = [];
    for (const r of root) r.traverse(o => { if (Object.keys(o.userData).length) { saved.push([o, o.userData]); o.userData = {}; } });
    let glb;
    try { glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 2048 }); }
    finally { for (const [o, u] of saved) o.userData = u; }
    await downloadFile('moy-dom.glb', new Blob([glb], { type: 'model/gltf-binary' }));
  } finally {
    for (const o of hidden) o.restore ? o.restore() : (o.visible = false);
    applyVisibility();
  }
}
editor.onExport?.(async () => {
  setStatus('Готовлю 3D-модель…');
  try { await exportGlb(); setStatus('3D-модель сохранена: moy-dom.glb'); }
  catch (e) { console.error(e); if (e?.code !== 'declined') setStatus('Не получилось сохранить 3D-модель.'); }
});
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
  applySun();
  applyQuality();

  // Сохранённая версия появляется позже, когда хранилище ответит.
  // пока не пришла сохранённая версия, редактирование закрыто: иначе правки ушли бы в копию, которую она заменит
  const editLabel = ui.edit.textContent;
  ui.edit.disabled = true;
  ui.edit.textContent = 'Загружаю ваши правки…';
  try {
    store = await openStore();
    setStatus(store.kind === 'shared' ? 'Правки сохраняются в проекте' : 'Правки сохраняются в этом браузере');
    const saved = await Promise.race([store.load(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 15000))]);
    if (saved?.house?.floors && saved.base === (original.revision ?? null)) {
      // правки сделаны от текущей версии проекта — показываем их
      house = saved.house;
      build(house);
      editor.setHouse(house, { keepView: true });
      renderVariants();
      setStatus(store.kind === 'shared' ? 'Загружены ваши правки' : 'Загружены правки из этого браузера');
      if (saved.fromMirror) scheduleSave();   // в браузере оказалась более свежая правка — дописываем её в проект
    } else if (saved?.house?.floors) {
      // проект обновился после сохранения: берём новую версию, переносим выбор вариантов,
      // прежнюю копию кладём в резервную
      await store.backup(saved);
      for (const [group, g] of Object.entries(saved.house.variants ?? {})) {
        if (g.active && house.variants?.[group]?.active !== g.active) applyVariant(house, group, g.active);
      }
      // участок, расставленный вручную, сохраняем, пока в проекте не вышла новая версия участка
      if (saved.house.site && (saved.house.site.revision ?? 0) >= (house.site?.revision ?? 0)) house.site = saved.house.site;
      build(house);
      editor.setHouse(house, { keepView: true });
      renderVariants();
      await store.save(house, original.revision ?? null);
      setStatus('Проект обновлён. Выбор вариантов и участок перенесены, прежняя копия сохранена как резервная.');
    }
  } catch {
    setStatus('Сохранённую версию загрузить не удалось, показан проект');
  } finally {
    ui.edit.disabled = false;
    ui.edit.textContent = editLabel;
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
window.viewer = { camera, controls, view, applyVisibility, ui, editor, walk, tour, exportGlb, rebuild: () => build(house), get house() { return house; } };
