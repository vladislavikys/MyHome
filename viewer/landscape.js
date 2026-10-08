import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { textureSet } from './looks.js';

// Ландшафт участка: покрытия (плитка, гравий, настил, клумба, пруд) и объекты
// (деревья, кусты, фонари, скамейки, валуны, беседка). Описание — общее для 3D и редактора плана.

export const AREA_KINDS = {
  paving: { name: 'Плитка', fill: '#b9b2a6', size: [1.2, 4] },
  gravel: { name: 'Гравий', fill: '#b3aca0', size: [1.2, 4] },
  deck: { name: 'Настил', fill: '#9a714c', size: [3, 4] },
  flowerbed: { name: 'Клумба', fill: '#8c5a6e', size: [3, 1.5] },
  pond: { name: 'Пруд', fill: '#4f86a0', size: [3.5, 2.2], round: true },
};

// r — радиус на плане (м) при size = 1; rect — прямоугольный объект [ширина, глубина].
export const ITEM_TYPES = {
  tree: { name: 'Дерево', group: 'plant', r: 2.2, fill: '#4f7a3a' },
  apple: { name: 'Плодовое', group: 'plant', r: 1.6, fill: '#6a8f3e' },
  spruce: { name: 'Ель', group: 'plant', r: 1.8, fill: '#2f5a3a' },
  thuja: { name: 'Туя', group: 'plant', r: 0.45, fill: '#35603a' },
  shrub: { name: 'Куст', group: 'plant', r: 0.7, fill: '#5d8a45' },
  lamp: { name: 'Фонарь', group: 'decor', r: 0.15, fill: '#e3b341' },
  bench: { name: 'Скамейка', group: 'decor', rect: [1.6, 0.6], fill: '#8a6440' },
  stone: { name: 'Валун', group: 'decor', r: 0.45, fill: '#8f8c86' },
  gazebo: { name: 'Беседка', group: 'decor', rect: [3.2, 3.2], fill: '#a07850' },
  firepit: { name: 'Место для костра (кресла, гирлянды)', group: 'decor', r: 2.6, fill: '#b3aca0' },
  screen: { name: 'Экран для проектора (на стену)', group: 'decor', rect: [3.1, 0.1], fill: '#f2f2f2' },
};

function rng(seed) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// Материалы на одну сборку участка — общие, чтобы запекание слило всё в несколько мешей.
export function landscapeMats() {
  const pbr = (color, kind, extra = {}) => {
    const t = kind ? textureSet(kind) : null;
    return new THREE.MeshStandardMaterial({ color, ...(t ? { map: t.map, normalMap: t.normalMap, ...t.mat } : {}), ...extra });
  };
  return {
    paving: pbr('#b9b2a6', 'paving'),
    asphalt: pbr('#2f3133', null, { roughness: 0.9 }),   // ровная тёмная полоса, без фактуры
    dirt: pbr('#9c9282', 'gravel'),
    shoulder: pbr('#8d877c', 'gravel'),
    curb: pbr('#b8b5ae', 'plaster', { roughness: 0.85 }),
    gravel: pbr('#b8b1a5', 'gravel'),
    deck: pbr('#8a6440', 'deck'),
    soil: pbr('#4a3a2c', 'soil'),
    water: new THREE.MeshStandardMaterial({ color: '#1f4652', roughness: 0.04, metalness: 0.2, envMapIntensity: 1.6 }),
    stone: pbr('#8f8c86', 'stone', { roughness: 0.8 }),
    bark: pbr('#5b4331', 'wood-dark'),
    leaf: pbr('#3f6b2f', 'foliage', { roughness: 0.9 }),
    leafLight: pbr('#5b8a3c', 'foliage', { roughness: 0.9 }),
    needle: pbr('#2d4a2b', 'foliage', { roughness: 0.92, side: THREE.DoubleSide }),
    thuja: pbr('#34583a', 'foliage', { roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: '#2b2e31', roughness: 0.45, metalness: 0.6 }),
    wood: pbr('#8a6440', 'wood-dark'),
    roof: pbr('#5b3a29', 'roof'),
    glow: new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd58a', emissiveIntensity: 1.4, roughness: 0.4 }),
    // ночные эффекты: userData.night — яркость свечения днём и ночью (меняется вместе с солнцем)
    bulb: Object.assign(new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#ffcf7a', emissiveIntensity: 3, roughness: 0.3 }), { userData: { night: [0.6, 3] } }),
    flame: Object.assign(new THREE.MeshStandardMaterial({ color: '#ff9a3c', emissive: '#ff7a1f', emissiveIntensity: 3, transparent: true, opacity: 0.85, depthWrite: false }), { userData: { night: [2, 4] } }),
    embers: Object.assign(new THREE.MeshStandardMaterial({ color: '#3a1a0c', emissive: '#ff4a10', emissiveIntensity: 1.5, roughness: 0.9 }), { userData: { night: [0.6, 2.2] } }),
    screen: Object.assign(new THREE.MeshStandardMaterial({ color: '#f4f5f6', emissive: '#cfdcff', emissiveIntensity: 0, roughness: 0.95 }), { userData: { night: [0, 0.55] } }),
    pine: pbr('#c9a678', 'wood-dark'),
    barrel: pbr('#6a4a30', 'wood-dark'),
    ash: new THREE.MeshStandardMaterial({ color: '#2a2725', roughness: 1 }),
    wire: new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.6 }),
    black: new THREE.MeshStandardMaterial({ color: '#1d1f21', roughness: 0.4, metalness: 0.3 }),
    fruit: new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.45 }),
    flowers: ['#d8434f', '#f2c14e', '#f4f1ea', '#9b5fc0', '#ef8a3a'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })),
  };
}

function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function flat(poly, h, mat) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, -y)));
  const m = mesh(new THREE.ShapeGeometry(shape), mat, false);
  m.rotation.x = -Math.PI / 2;
  m.position.y = h;
  return m;
}

function slab(poly, h0, h1, mat) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, -y)));
  const m = mesh(new THREE.ExtrudeGeometry(shape, { depth: h1 - h0, bevelEnabled: false }), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = h0;
  return m;
}

function insidePoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Неровный «ком» листвы / камень: икосаэдр со сдвинутыми вершинами.
function blob(r, mat, rnd, { squash = 1, jag = 0.22, detail = 1 } = {}) {
  const geo = mergeVertices(new THREE.IcosahedronGeometry(r, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) {
    v.fromBufferAttribute(p, k);
    v.multiplyScalar(1 + jag * (rnd() - 0.5) * 2);
    v.y *= squash;
    p.setXYZ(k, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();   // сглаженные нормали — мягкая крона без граней
  return mesh(geo, mat);
}

const areaKind = a => a.kind ?? (a.texture === 'gravel' ? 'gravel' : 'paving');

export function buildArea(a, M, seed = 1) {
  const g = new THREE.Group();
  const kind = areaKind(a);
  const poly = a.poly;
  if (kind === 'deck') {
    const m = slab(poly, 0, 0.1, M.deck);
    m.userData.walkable = true;
    g.add(m);
  } else if (kind === 'flowerbed') {
    g.add(slab(poly, 0, 0.06, M.soil));
    // цветы: кустики зелени с цветными шапками
    const rnd = rng(seed * 7919 + 17);
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const n = Math.min(400, Math.round((x1 - x0) * (y1 - y0) * 7));
    for (let i = 0; i < n; i++) {
      const p = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
      if (!insidePoly(p, poly)) continue;
      const s = 0.7 + rnd() * 0.6;
      const bush = blob(0.11 * s, M.leafLight, rnd, { squash: 0.8, detail: 0 });
      bush.position.set(p[0], 0.1 * s, p[1]);
      bush.castShadow = false;
      g.add(bush);
      const fl = blob(0.06 * s, M.flowers[Math.floor(rnd() * M.flowers.length)], rnd, { squash: 0.6, detail: 0 });
      fl.position.set(p[0] + (rnd() - 0.5) * 0.06, 0.2 * s, p[1] + (rnd() - 0.5) * 0.06);
      fl.castShadow = false;
      g.add(fl);
    }
  } else if (kind === 'pond') {
    g.add(flat(poly, 0.03, M.water));
    // камни по берегу
    const rnd = rng(seed * 4099 + 3);
    for (let i = 0; i < poly.length; i++) {
      const a0 = poly[i], b0 = poly[(i + 1) % poly.length];
      const L = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]);
      const n = Math.max(1, Math.round(L / 0.45));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const st = blob(0.16 + rnd() * 0.1, M.stone, rnd, { squash: 0.55, jag: 0.3, detail: 0 });
        st.position.set(a0[0] + (b0[0] - a0[0]) * t, 0.04, a0[1] + (b0[1] - a0[1]) * t);
        st.rotation.y = rnd() * 6;
        g.add(st);
      }
    }
  } else {
    // каждое следующее покрытие на 4 мм выше: пересекающиеся дорожки не мерцают
    const m = flat(poly, 0.012 + (seed % 12) * 0.004, kind === 'gravel' ? M.gravel : M.paving);
    m.userData.walkable = true;
    g.add(m);
  }
  return g;
}

// Ель: ярусы «лап» с неровным краем и провисанием.
function spruce(g, M, h, rnd) {
  const trunk = mesh(new THREE.CylinderGeometry(0.08, 0.18, h * 0.35, 8), M.bark);
  trunk.position.y = h * 0.175;
  trunk.userData.collide = true;
  g.add(trunk);
  const tiers = 9;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = (1 - t) * h * 0.24 + 0.15, th = h * 0.2;
    const geo = new THREE.ConeGeometry(r, th, 18, 2, true);
    const p = geo.attributes.position, v = new THREE.Vector3();
    const ph = rnd() * 6;
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      const rad = Math.hypot(v.x, v.z);
      if (rad > 1e-3) {
        const jag = 1 + 0.18 * Math.sin(Math.atan2(v.z, v.x) * 7 + ph);
        v.x *= jag; v.z *= jag;
        v.y -= (rad / r) * (rad / r) * th * 0.25;
      }
      p.setXYZ(k, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const cone = mesh(geo, M.needle);
    cone.position.y = h * 0.2 + t * h * 0.72;
    g.add(cone);
  }
}

function deciduous(g, M, h, crown, rnd, fruit = false) {
  const trunkH = h * 0.45;
  const trunk = mesh(new THREE.CylinderGeometry(0.07 * h / 5, 0.14 * h / 5 + 0.04, trunkH + crown * 0.4, 8), M.bark);
  trunk.position.y = (trunkH + crown * 0.4) / 2;
  trunk.userData.collide = true;
  g.add(trunk);
  const cy = trunkH + crown * 0.55;
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rnd();
    const d = i === 0 ? 0 : crown * (0.35 + rnd() * 0.25);
    const r = crown * (i === 0 ? 0.62 : 0.4 + rnd() * 0.15);
    const b = blob(r, rnd() < 0.5 ? M.leaf : M.leafLight, rnd, { squash: 0.85, detail: 2, jag: 0.16 });
    b.position.set(Math.cos(a) * d, cy + (i === 0 ? 0.1 : (rnd() - 0.4) * crown * 0.5), Math.sin(a) * d);
    g.add(b);
  }
  if (fruit) {
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2, e = (rnd() - 0.3) * 1.2;
      const f = mesh(new THREE.SphereGeometry(0.045, 8, 6), M.fruit, false);
      f.position.set(Math.cos(a) * Math.cos(e) * crown * 0.95, cy + Math.sin(e) * crown * 0.7, Math.sin(a) * Math.cos(e) * crown * 0.95);
      g.add(f);
    }
  }
}

// Кресло-шезлонг (адирондак): наклонное сиденье из реек, высокая спинка веером, широкие подлокотники.
// Смотрит в +z, начало — на земле под сиденьем.
function adirondack(M, mat) {
  const g = new THREE.Group();
  const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  for (let i = 0; i < 6; i++) {                      // сиденье: спереди 0,38 м, к спинке ниже
    const t = i / 5;
    box(0.56, 0.022, 0.075, 0, 0.38 - 0.1 * t, 0.26 - 0.5 * t, 0.2);
  }
  for (let i = 0; i < 6; i++) {                      // спинка веером, откинута назад
    const off = (i - 2.5) * 0.085;
    const b = box(0.075, 0.82, 0.022, off, 0.66, -0.36, -0.35, 0, -off * 0.25);
    b.position.x = off * 1.15;
  }
  box(0.6, 0.06, 0.03, 0, 0.5, -0.27, -0.35);
  box(0.66, 0.06, 0.03, 0, 0.9, -0.42, -0.35);
  for (const sx of [-1, 1]) {
    box(0.14, 0.024, 0.74, sx * 0.36, 0.6, 0.02);   // подлокотник
    box(0.06, 0.6, 0.06, sx * 0.33, 0.3, 0.3).userData.collide = true;
    box(0.05, 0.12, 0.8, sx * 0.3, 0.25, -0.05, 0.38);   // боковина-полоз
  }
  return g;
}

// Гирлянда между точками a и b с провисом sag: тонкий провод и лампочки через ~0,35 м.
function stringLights(g, M, a, b, sag) {
  const pts = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(mesh(new THREE.TubeGeometry(curve, 32, 0.004, 4, false), M.wire, false));
  const k = Math.max(2, Math.round(curve.getLength() / 0.35));
  for (let i = 1; i < k; i++) {
    const p = curve.getPoint(i / k);
    const bulb = mesh(new THREE.SphereGeometry(0.028, 8, 6), M.bulb, false);
    bulb.scale.y = 1.3;
    bulb.position.set(p.x, p.y - 0.045, p.z);
    g.add(bulb);
  }
}

// Точечный свет, который включается к вечеру (подвижная группа — не запекается).
function nightLight(g, color, power, x, y, z, distance) {
  const holder = new THREE.Group();
  holder.userData.dynamic = true;
  const l = new THREE.PointLight(color, 0, distance, 2);
  l.userData.night = power;
  holder.position.set(x, y, z);
  holder.add(l);
  g.add(holder);
  return holder;
}

export function buildItem(it, M, seed = 1) {
  const g = new THREE.Group();
  const s = it.size ?? 1;
  const rnd = rng(seed * 2654435761 % 1e9 + Math.round(it.at[0] * 131 + it.at[1] * 17));
  switch (it.type) {
    case 'tree': deciduous(g, M, 6 * s, 2.2 * s, rnd); break;
    case 'apple': deciduous(g, M, 3.6 * s, 1.6 * s, rnd, true); break;
    case 'spruce': spruce(g, M, 7 * s, rnd); break;
    case 'thuja': {
      const h = 2.6 * s;
      const geo = new THREE.ConeGeometry(0.45 * s, h, 14, 6);
      const p = geo.attributes.position, v = new THREE.Vector3();
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k);
        const bulge = 1 + 0.35 * Math.sin(((v.y / h) + 0.5) * Math.PI) + 0.08 * (rnd() - 0.5);
        v.x *= bulge; v.z *= bulge;
        p.setXYZ(k, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const c = mesh(geo, M.thuja);
      c.position.y = h / 2 + 0.1;
      c.userData.collide = true;
      g.add(c);
      break;
    }
    case 'shrub':
      for (let i = 0; i < 4; i++) {
        const b = blob(0.45 * s * (0.7 + rnd() * 0.4), i % 2 ? M.leaf : M.leafLight, rnd, { squash: 0.75 });
        b.position.set((rnd() - 0.5) * 0.5 * s, 0.35 * s, (rnd() - 0.5) * 0.5 * s);
        g.add(b);
      }
      break;
    case 'stone': {
      const b = blob(0.45 * s, M.stone, rnd, { squash: 0.6, jag: 0.35 });
      b.position.y = 0.12 * s;
      b.userData.collide = true;
      g.add(b);
      break;
    }
    case 'lamp': {
      const post = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9 * s, 10), M.metal);
      post.position.y = 0.45 * s;
      g.add(post);
      // колпак светится сильнее к ночи; свой точечный свет (optional — на телефоне выключается)
      const head = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 12), M.bulb, false);
      head.position.y = 0.9 * s + 0.09;
      g.add(head);
      if (it.light !== false) nightLight(g, '#ffc77a', 2.5, 0, 0.9 * s + 0.05, 0, 7).children[0].userData.optional = true;
      const cap = mesh(new THREE.ConeGeometry(0.15, 0.1, 12), M.metal);
      cap.position.y = 0.9 * s + 0.23;
      g.add(cap);
      break;
    }
    case 'bench': {
      const W = 1.6 * s;
      for (let i = 0; i < 4; i++) {
        const slat = mesh(new THREE.BoxGeometry(W, 0.03, 0.09), M.wood);
        slat.position.set(0, 0.45, -0.18 + i * 0.11);
        g.add(slat);
      }
      for (let i = 0; i < 3; i++) {
        const back = mesh(new THREE.BoxGeometry(W, 0.09, 0.03), M.wood);
        back.position.set(0, 0.6 + i * 0.12, 0.26);
        back.rotation.x = -0.12;
        g.add(back);
      }
      for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) {
        const leg = mesh(new THREE.BoxGeometry(0.05, 0.45, 0.5), M.metal);
        leg.position.set(x, 0.225, 0);
        leg.userData.collide = true;
        g.add(leg);
        const arm = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), M.metal);
        arm.position.set(x, 0.65, 0);
        g.add(arm);
      }
      break;
    }
    case 'firepit': {
      // Зона у костра: круг гравия с бордюром, каменный очаг с огнём, кресла по кругу (открыто к +z — к экрану),
      // столбы в бочках-кашпо с гирляндами, проектор на стойке с дальней стороны.
      const R = 2.6 * s;
      const pad = mesh(new THREE.CircleGeometry(R, 64), M.gravel, false);
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.02;
      pad.userData.walkable = true;
      g.add(pad);
      const edge = mesh(new THREE.CylinderGeometry(R, R, 0.05, 64, 1, true), M.metal, false);
      edge.position.y = 0.015;
      g.add(edge);
      // очаг: три ряда камней по кругу со смещением
      const rr = 0.52, nb = 14;
      for (let c = 0; c < 3; c++) for (let i = 0; i < nb; i++) {
        const a = ((i + (c % 2) * 0.5) / nb) * Math.PI * 2;
        const st = mesh(new THREE.BoxGeometry(0.21, 0.11, 0.15), M.stone);
        st.position.set(Math.cos(a) * rr, 0.06 + c * 0.115, Math.sin(a) * rr);
        st.rotation.y = -a + Math.PI / 2 + (rnd() - 0.5) * 0.08;
        st.userData.collide = c === 0;
        g.add(st);
      }
      const ash = mesh(new THREE.CircleGeometry(0.44, 24), M.ash, false);
      ash.rotation.x = -Math.PI / 2;
      ash.position.y = 0.05;
      g.add(ash);
      const coals = mesh(new THREE.CircleGeometry(0.26, 20), M.embers, false);
      coals.rotation.x = -Math.PI / 2;
      coals.position.y = 0.06;
      g.add(coals);
      for (let i = 0; i < 4; i++) {
        const lg = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.62, 8), M.bark);
        const a = (i / 4) * Math.PI + rnd() * 0.3;
        lg.rotation.set(Math.PI / 2 - 0.35, 0, 0);
        const w = new THREE.Group();
        w.add(lg);
        w.rotation.y = a;
        w.position.y = 0.16;
        lg.position.z = 0.0;
        g.add(w);
      }
      const fire = new THREE.Group();
      fire.userData.dynamic = true;
      fire.userData.flicker = true;
      for (let i = 0; i < 5; i++) {
        const f = mesh(new THREE.ConeGeometry(0.09 + rnd() * 0.06, 0.35 + rnd() * 0.3, 7), M.flame, false);
        f.position.set((rnd() - 0.5) * 0.2, 0.32 + rnd() * 0.08, (rnd() - 0.5) * 0.2);
        fire.add(f);
      }
      g.add(fire);
      const fl = nightLight(g, '#ff8a3d', 7, 0, 0.6, 0, 10);
      fl.userData.flicker = true;
      // кресла: дуга, открытая к экрану (+z)
      const nc = it.chairs ?? 5;
      for (let i = 0; i < nc; i++) {
        const a = THREE.MathUtils.degToRad(155 + (230 * i) / Math.max(1, nc - 1));
        const ch = adirondack(M, M.pine);
        const x = Math.cos(a) * 1.6 * Math.min(1, s), z = Math.sin(a) * 1.6 * Math.min(1, s);
        ch.position.set(x, 0.02, z);
        ch.rotation.y = Math.atan2(-x, -z);
        g.add(ch);
      }
      // столбы в бочках по краю и гирлянды между ними
      const np = it.posts ?? 5, tops = [];
      for (let i = 0; i < np; i++) {
        const a = (i / np) * Math.PI * 2 + Math.PI / 2 + 1.5 * Math.PI / np;   // ни один столб не встаёт на линию проектор — экран
        const x = Math.cos(a) * (R - 0.2), z = Math.sin(a) * (R - 0.2);
        const barrel = mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.5, 18), M.barrel);
        barrel.position.set(x, 0.25, z);
        barrel.userData.collide = true;
        g.add(barrel);
        for (const y of [0.1, 0.4]) {
          const hoop = mesh(new THREE.TorusGeometry(0.29 - (0.4 - y) * 0.06, 0.008, 4, 24), M.metal, false);
          hoop.rotation.x = Math.PI / 2;
          hoop.position.set(x, y, z);
          g.add(hoop);
        }
        const soil = mesh(new THREE.CircleGeometry(0.27, 16), M.soil, false);
        soil.rotation.x = -Math.PI / 2;
        soil.position.set(x, 0.47, z);
        g.add(soil);
        const post = mesh(new THREE.BoxGeometry(0.09, 2.7, 0.09), M.pine);
        post.position.set(x, 1.6, z);
        post.userData.collide = true;
        g.add(post);
        tops.push(new THREE.Vector3(x, 2.85, z));
      }
      for (let i = 0; i < np; i++) stringLights(g, M, tops[i], tops[(i + 1) % np], 0.45);
      nightLight(g, '#ffd08a', 4, 0, 2.5, 0, 9);
      // проектор на стойке за креслами, объектив к экрану (+z)
      if (it.projector !== false) {
        const pz = -(R - 0.45);
        const pole = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.35, 8), M.black);
        pole.position.set(0, 0.7, pz);
        g.add(pole);
        const foot = mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), M.black);
        foot.position.set(0, 0.035, pz);
        g.add(foot);
        const shelf = mesh(new THREE.BoxGeometry(0.34, 0.02, 0.3), M.black);
        shelf.position.set(0, 1.38, pz);
        g.add(shelf);
        const body = mesh(new THREE.BoxGeometry(0.3, 0.1, 0.24), M.metal);
        body.position.set(0, 1.44, pz);
        g.add(body);
        const lens = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), M.black);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0.07, 1.44, pz + 0.13);
        g.add(lens);
      }
      break;
    }
    case 'screen': {
      // экран для проектора на стене: чёрная рамка, белое полотно 16:9; ночью слегка светится — «кино».
      // Сзади (−z) — стена; it.bottom — высота низа над землёй, it.width — ширина полотна.
      const Wd = (it.width ?? 3) * s, Hd = Wd * 9 / 16, y0 = it.bottom ?? 1.2;
      const frame = mesh(new THREE.BoxGeometry(Wd + 0.12, Hd + 0.12, 0.04), M.black);
      frame.position.set(0, y0 + Hd / 2, 0);
      g.add(frame);
      const cloth = mesh(new THREE.BoxGeometry(Wd, Hd, 0.042), M.screen, false);
      cloth.position.set(0, y0 + Hd / 2, 0.002);
      g.add(cloth);
      break;
    }
    case 'gazebo': {
      const W = 3.2 * s, H = 2.3;
      const floor = slab([[-W / 2, -W / 2], [W / 2, -W / 2], [W / 2, W / 2], [-W / 2, W / 2]], 0, 0.15, M.deck);
      floor.userData.walkable = true;
      g.add(floor);
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const post = mesh(new THREE.BoxGeometry(0.14, H, 0.14), M.wood);
        post.position.set(x * (W / 2 - 0.1), H / 2 + 0.15, z * (W / 2 - 0.1));
        post.userData.collide = true;
        g.add(post);
      }
      for (const [x, z, rx] of [[0, -1, 0], [0, 1, 0], [-1, 0, 1], [1, 0, 1]]) {
        const beam = mesh(new THREE.BoxGeometry(rx ? 0.14 : W, 0.16, rx ? W : 0.14), M.wood);
        beam.position.set(x * (W / 2 - 0.1), H + 0.15, z * (W / 2 - 0.1));
        g.add(beam);
        const rail = mesh(new THREE.BoxGeometry(rx ? 0.08 : W - 0.2, 0.06, rx ? W - 0.2 : 0.08), M.wood);
        rail.position.set(x * (W / 2 - 0.1), 0.95, z * (W / 2 - 0.1));
        if (!(z === 1 && !rx)) g.add(rail);   // вход с одной стороны
      }
      const roof = mesh(new THREE.ConeGeometry(W * 0.82, 1.3, 4, 1), M.roof);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = H + 0.23 + 0.65;
      g.add(roof);
      break;
    }
  }
  g.position.set(it.at[0], 0, it.at[1]);
  g.rotation.y = -THREE.MathUtils.degToRad(it.rot ?? 0);
  return g;
}

// Дороги вокруг участка: site.roads = [{ name, from, to, width, kind: 'asphalt' | 'dirt', shoulder }]
// и съезды от ворот/калиток до ближайшей параллельной дороги.
function quad(a, b, w, h, mat, ext = 0) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1], u[0]];
  const A = [a[0] - u[0] * ext, a[1] - u[1] * ext], B = [b[0] + u[0] * ext, b[1] + u[1] * ext];
  const poly = [[A[0] + n[0] * w / 2, A[1] + n[1] * w / 2], [B[0] + n[0] * w / 2, B[1] + n[1] * w / 2],
    [B[0] - n[0] * w / 2, B[1] - n[1] * w / 2], [A[0] - n[0] * w / 2, A[1] - n[1] * w / 2]];
  const m = flat(poly, h, mat);
  m.userData.walkable = true;
  return m;
}

export function buildRoads(site, M) {
  const g = new THREE.Group();
  const roads = site.roads ?? [];
  roads.forEach((r, i) => {
    const sh = r.shoulder ?? 0.6;
    // слои разнесены на сантиметры: при миллиметрах на расстоянии поверхности «мерцают» полосами
    g.add(quad(r.from, r.to, r.width + 2 * sh, 0.01 + i * 0.01, M.shoulder));
    g.add(quad(r.from, r.to, r.width, 0.03 + i * 0.015, r.kind === 'dirt' ? M.dirt : M.asphalt));
  });
  // съезды: от ворот наружу до кромки дороги, параллельной забору
  const B = site.boundary ?? [];
  for (const g0 of site.gates ?? []) {
    const gate = Array.isArray(g0) ? { at: [g0[0], g0[1]], width: g0[2] * 2 } : g0;
    let edge = null;
    for (let i = 0; i < B.length; i++) {
      const a = B[i], b = B[(i + 1) % B.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const d = Math.abs((gate.at[0] - a[0]) * -u[1] + (gate.at[1] - a[1]) * u[0]);
      if (d < 0.5) { edge = u; break; }
    }
    if (!edge) continue;
    let best = null;
    for (const r of roads) {
      const L = Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]), ru = [(r.to[0] - r.from[0]) / L, (r.to[1] - r.from[1]) / L];
      if (Math.abs(ru[0] * edge[0] + ru[1] * edge[1]) < 0.95) continue;         // дорога вдоль этого забора
      const rn = [-ru[1], ru[0]];
      const dist = (gate.at[0] - r.from[0]) * rn[0] + (gate.at[1] - r.from[1]) * rn[1];
      const reach = Math.abs(dist) - r.width / 2;
      if (reach > 0 && reach < 15 && (!best || reach < best.reach)) best = { reach, dir: [-rn[0] * Math.sign(dist), -rn[1] * Math.sign(dist)], r };
    }
    if (!best) continue;
    const end = [gate.at[0] + best.dir[0] * (best.reach + 0.3), gate.at[1] + best.dir[1] * (best.reach + 0.3)];
    const wide = gate.type === 'slide' || gate.width > 2;
    g.add(quad(gate.at, end, gate.width + (wide ? 1.2 : 0.4), 0.065, wide ? (best.r.kind === 'dirt' ? M.dirt : M.asphalt) : M.paving));
  }
  return g;
}
