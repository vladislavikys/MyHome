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
    asphalt: pbr('#66676a', 'asphalt'),
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
      const head = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 12), M.glow, false);
      head.position.y = 0.9 * s + 0.09;
      g.add(head);
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
