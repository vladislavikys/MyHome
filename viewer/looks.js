import * as THREE from 'three';

// Процедурные PBR-фактуры (без внешних картинок): карта цвета (светлая, тонируется цветом материала),
// карта нормалей из высот и небо-окружение для освещения. 1 единица UV = 1 метр.

const SIZE = 512;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Плавный шум по решётке (value noise) с периодом, чтобы фактура тайлилась без швов.
function makeNoise(seed, period) {
  const r = rng(seed);
  const g = Array.from({ length: period * period }, r);
  const at = (x, y) => g[((y % period + period) % period) * period + ((x % period + period) % period)];
  const s = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function fbm(noises, x, y) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (const n of noises) { v += amp * n(x * f, y * f); norm += amp; amp *= 0.5; f *= 2; }
  return v / norm;
}

// Генератор: fn(u, v) → [albedo(0..1) или [r,g,b], height(0..1)], u,v в долях плитки 0..1.
function bake(fn, { normalStrength = 2, rough = null } = {}) {
  const n = SIZE;
  const albedo = new Uint8ClampedArray(n * n * 4);
  const height = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [a, h] = fn(i / n, j / n);
      const k = (j * n + i) * 4;
      const [r, g, b] = Array.isArray(a) ? a : [a, a, a];
      albedo[k] = r * 255; albedo[k + 1] = g * 255; albedo[k + 2] = b * 255; albedo[k + 3] = 255;
      height[j * n + i] = h;
    }
  }
  const normal = new Uint8ClampedArray(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const hL = height[j * n + ((i - 1 + n) % n)], hR = height[j * n + ((i + 1) % n)];
      const hD = height[((j - 1 + n) % n) * n + i], hU = height[((j + 1) % n) * n + i];
      let nx = (hL - hR) * normalStrength, ny = (hD - hU) * normalStrength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const k = (j * n + i) * 4;
      normal[k] = (nx / l * 0.5 + 0.5) * 255;
      normal[k + 1] = (ny / l * 0.5 + 0.5) * 255;
      normal[k + 2] = (nz / l * 0.5 + 0.5) * 255;
      normal[k + 3] = 255;
    }
  }
  const tex = (data, srgb) => {
    const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return { map: tex(albedo, true), normalMap: tex(normal, false) };
}

const N = seed => [makeNoise(seed, 8), makeNoise(seed + 1, 16), makeNoise(seed + 2, 32), makeNoise(seed + 3, 64), makeNoise(seed + 4, 128)];

// Описания фактур: tile — размер плитки в метрах; mat — параметры материала.
const KINDS = {
  plaster: {
    tile: 1.6, mat: { roughness: 0.92 }, normalStrength: 3,
    fn: (() => { const ns = N(11); return (u, v) => {
      const h = fbm(ns, u * 8, v * 8);
      return [0.9 + 0.1 * h, h];
    }; })(),
  },
  'wood-dark': {
    tile: 1.2, mat: { roughness: 0.7 }, normalStrength: 1.5,
    fn: (() => { const ns = N(21); const w = makeNoise(29, 16); return (u, v) => {
      const grain = 0.5 + 0.5 * Math.sin((v * 90 + fbm(ns, u * 1.5, v * 3) * 1.5) * Math.PI);
      const a = 0.78 + 0.1 * grain + 0.12 * w(u * 24, v * 3);
      return [a, grain * 0.6];
    }; })(),
  },
  'fence-wood': {  // вертикальные доски под дерево (панели забора и ворот)
    tile: 1.2, mat: { roughness: 0.6 }, normalStrength: 2.5,
    fn: (() => { const ns = N(23); const r = rng(9); const tones = Array.from({ length: 16 }, () => 0.72 + r() * 0.26); return (u, v) => {
      const cols = 8, col = Math.floor(u * cols), fu = u * cols - col;
      const gap = fu < 0.025;
      const grain = 0.5 + 0.5 * Math.sin((u * 70 + fbm(ns, u * 2, v * 1.2) * 5) * Math.PI);
      const knot = fbm(ns, u * 6 + col, v * 3);
      const a = tones[col % 16] * (0.84 + 0.1 * grain + 0.1 * knot);
      return [gap ? 0.35 : a, gap ? 0 : 0.55 + 0.25 * grain];
    }; })(),
  },
  gravel: {  // мелкий гравий / отсев: камешки на сетке со сдвигом
    tile: 1.0, mat: { roughness: 0.95 }, normalStrength: 5,
    fn: (() => { const fine = makeNoise(131, 128); const C = 16; const r = rng(13);
      const cell = Array.from({ length: C * C }, () => [r(), r(), 0.55 + r() * 0.45, 0.35 + r() * 0.2]);
      return (u, v) => {
        const cx = Math.floor(u * C), cy = Math.floor(v * C);
        let best = 0, tone = 1;
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const ix = cx + ox, iy = cy + oy, c = cell[((iy + C) % C) * C + ((ix + C) % C)];
          const d = Math.hypot(u * C - (ix + c[0]), v * C - (iy + c[1])) / c[3];
          const h = Math.max(0, 1 - d * d);
          if (h > best) { best = h; tone = c[2]; }
        }
        const n = fine(u * 128, v * 128);
        return [0.45 + 0.4 * tone * Math.sqrt(best) + 0.12 * n, best * 0.85 + n * 0.15];
      }; })(),
  },
  soil: {  // земля клумбы / мульча
    tile: 1.0, mat: { roughness: 1 }, normalStrength: 4,
    fn: (() => { const ns = N(141); const fine = makeNoise(143, 128); return (u, v) => {
      const h = fbm(ns, u * 8, v * 8), f = fine(u * 128, v * 128);
      return [0.6 + 0.25 * h + 0.15 * f, 0.6 * h + 0.4 * f];
    }; })(),
  },
  floor: {  // паркетная / инженерная доска
    tile: 2.4, mat: { roughness: 0.45 }, normalStrength: 4,
    fn: (() => { const ns = N(31); const r = rng(5); const tones = Array.from({ length: 64 }, () => 0.78 + r() * 0.2); return (u, v) => {
      const rows = 13, row = Math.floor(v * rows), fv = v * rows - row;
      const shift = (row * 0.37) % 1, cols = 2, uu = (u + shift) % 1, col = Math.floor(uu * cols), fu = uu * cols - col;
      const gap = fv < 0.03 || fu < 0.008 ? 1 : 0;
      const grain = 0.5 + 0.5 * Math.sin((uu * 90 + fbm(ns, u * 4, v * 24) * 6) * Math.PI);
      const tone = tones[(row * 7 + col * 13) % 64];
      return [gap ? 0.45 : tone * (0.9 + 0.1 * grain), gap ? 0 : 0.6 + 0.1 * grain];
    }; })(),
  },
  deck: {
    tile: 2.0, mat: { roughness: 0.75 }, normalStrength: 5,
    fn: (() => { const ns = N(41); return (u, v) => {
      const rows = 14, row = Math.floor(v * rows), fv = v * rows - row;
      const gap = fv < 0.08 ? 1 : 0;
      const grain = 0.5 + 0.5 * Math.sin((u * 50 + fbm(ns, u * 3, v * 20) * 7) * Math.PI);
      return [gap ? 0.3 : 0.75 + 0.2 * grain - (row % 3) * 0.04, gap ? 0 : 0.7];
    }; })(),
  },
  tiles: {
    tile: 1.2, mat: { roughness: 0.25 }, normalStrength: 6,
    fn: (() => { const ns = N(51); return (u, v) => {
      const k = 4, fu = (u * k) % 1, fv = (v * k) % 1;
      const grout = fu < 0.02 || fv < 0.02 ? 1 : 0;
      return [grout ? 0.7 : 0.95 + 0.05 * fbm(ns, u * 6, v * 6), grout ? 0 : 1];
    }; })(),
  },
  stone: {
    tile: 1.4, mat: { roughness: 0.9 }, normalStrength: 6,
    fn: (() => {
      const r = rng(61), pts = Array.from({ length: 36 }, () => [r(), r(), 0.65 + r() * 0.35]);
      const ns = N(63);
      return (u, v) => {
        let d1 = 9, d2 = 9, tone = 1;
        for (const [px, py, t] of pts) {
          for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            const d = Math.hypot(u - px - ox, (v - py - oy) * 1.6);
            if (d < d1) { d2 = d1; d1 = d; tone = t; } else if (d < d2) d2 = d;
          }
        }
        const edge = d2 - d1;
        const mortar = edge < 0.018 ? 1 : 0;
        const n = fbm(ns, u * 10, v * 10);
        return [mortar ? 0.45 : tone * (0.85 + 0.15 * n), mortar ? 0 : Math.min(1, edge * 8) * 0.8 + n * 0.2];
      };
    })(),
  },
  roof: {  // металлочерепица: волна поперёк ската и ступени вдоль
    tile: 1.4, mat: { roughness: 0.5, metalness: 0.3 }, normalStrength: 7,
    fn: (u, v) => {
      const wave = 0.5 + 0.5 * Math.cos(u * 4 * 2 * Math.PI);
      const fv = (v * 4) % 1;
      const step = fv < 0.12 ? fv / 0.12 : 1 - (fv - 0.12) * 0.25;
      const h = 0.55 * wave + 0.45 * step;
      return [0.78 + 0.22 * h, h];
    },
  },
  soffit: {  // вагонка
    tile: 1.0, mat: { roughness: 0.6 }, normalStrength: 3,
    fn: (() => { const ns = N(71); return (u, v) => {
      const fv = (v * 10) % 1, gap = fv < 0.06;
      const grain = fbm(ns, u * 3, v * 30);
      return [gap ? 0.55 : 0.85 + 0.15 * grain, gap ? 0 : 0.7];
    }; })(),
  },
  brick: {  // кирпич, ложковая перевязка
    tile: 1.0, mat: { roughness: 0.85 }, normalStrength: 6,
    fn: (() => { const ns = N(101); const r = rng(7); const tones = Array.from({ length: 256 }, () => 0.72 + r() * 0.28); return (u, v) => {
      const rows = 15, row = Math.floor(v * rows), fv = v * rows - row;
      const cols = 4, uu = (u + (row % 2) * 0.125) % 1, col = Math.floor(uu * cols), fu = uu * cols - col;
      const mortar = fv < 0.14 || fu < 0.04;
      const n = fbm(ns, u * 12, v * 12);
      const t = tones[(row * 17 + col * 5) % 256];
      return [mortar ? [0.78, 0.76, 0.72] : [t * (0.9 + 0.1 * n), t * (0.9 + 0.1 * n), t * (0.9 + 0.1 * n)], mortar ? 0 : 0.7 + 0.3 * n];
    }; })(),
  },
  paving: {  // тротуарная плитка
    tile: 1.2, mat: { roughness: 0.85 }, normalStrength: 5,
    fn: (() => { const ns = N(111); return (u, v) => {
      const rows = 6, row = Math.floor(v * rows), fv = v * rows - row;
      const cols = 3, uu = (u + (row % 2) * 0.5 / cols) % 1, fu = (uu * cols) % 1;
      const joint = fv < 0.05 || fu < 0.025;
      const n = fbm(ns, u * 10, v * 10);
      return [joint ? 0.55 : 0.82 + 0.15 * n, joint ? 0 : 0.8];
    }; })(),
  },
  grass: {
    tile: 3.0, mat: { roughness: 0.95 }, normalStrength: 2.5,
    fn: (() => { const ns = N(81); const fine = makeNoise(88, 256); return (u, v) => {
      const big = fbm(ns, u * 4, v * 4), blade = fine(u * 256, v * 256);
      const a = 0.62 + 0.25 * big + 0.13 * blade;
      return [[a * 0.95, a, a * 0.85], 0.5 * blade + 0.5 * big];
    }; })(),
  },
  foliage: {
    tile: 1.0, mat: { roughness: 0.9 }, normalStrength: 4,
    fn: (() => { const ns = N(91); return (u, v) => { const h = fbm(ns, u * 16, v * 16); return [0.7 + 0.3 * h, h]; }; })(),
  },
};

const cache = new Map();
export function textureSet(kind) {
  const k = KINDS[kind];
  if (!k) return null;
  if (!cache.has(kind)) {
    const t = bake(k.fn, { normalStrength: k.normalStrength });
    for (const tex of [t.map, t.normalMap]) tex.repeat.set(1 / k.tile, 1 / k.tile);
    cache.set(kind, { ...t, mat: k.mat });
  }
  return cache.get(kind);
}

// Небо: равнопромежуточная HDR-карта (градиент + ореол вокруг солнца) — фон и окружение.
export function skyTexture(sunDir) {
  const w = 512, h = 256;
  const data = new Float32Array(w * h * 4);
  const sd = sunDir.clone().normalize();
  // день → сумерки → ночь по высоте солнца (sd.y = sin высоты)
  const mixc = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
  const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const day = sm(-0.05, 0.3, sd.y), dusk = sm(-0.18, 0.02, sd.y) * (1 - sm(0.05, 0.3, sd.y));
  const nightZen = [0.02, 0.032, 0.075], nightHor = [0.05, 0.065, 0.11];
  let zen = mixc(nightZen, [0.18, 0.36, 0.78], day), hor = mixc(nightHor, [0.78, 0.86, 0.95], day);
  hor = mixc(hor, [1.1, 0.55, 0.28], dusk * 0.8);
  zen = mixc(zen, [0.22, 0.25, 0.45], dusk * 0.5);
  const gnd = mixc([0.03, 0.03, 0.035], [0.32, 0.31, 0.28], day);
  const glowK = sm(-0.12, 0.02, sd.y);
  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI;           // +π/2 вверх
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * 2 * Math.PI - Math.PI;
      const d = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
      let c;
      if (d.y >= 0) {
        const t = Math.pow(d.y, 0.45);
        c = hor.map((x, k) => x + (zen[k] - x) * t);
      } else {
        const t = Math.min(1, -d.y * 6);
        c = hor.map((x, k) => x + (gnd[k] - x) * t);
      }
      const cos = Math.max(0, d.dot(sd));
      // ореол солнца; у горизонта — тёплый и широкий
      const glow = (Math.pow(cos, 64) * 6 + Math.pow(cos, 8) * (0.35 + dusk * 0.9)) * glowK;
      const k = (j * w + i) * 4;
      data[k] = (c[0] + glow) * 1.1;
      data[k + 1] = (c[1] + glow * (0.95 - dusk * 0.35)) * 1.1;
      data[k + 2] = (c[2] + glow * (0.85 - dusk * 0.5)) * 1.1;
      data[k + 3] = 1;
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// UV «коробочной» проекцией в мировых метрах (для геометрии без своих UV).
export function boxUVs(geometry) {
  const pos = geometry.attributes.position, nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    if (nor) n.fromBufferAttribute(nor, i);
    else n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const p = [a, b, c][k];
      let u, v;
      if (ay >= ax && ay >= az) { u = p.x; v = p.z; }
      else if (ax >= az) { u = p.z; v = p.y; }
      else { u = p.x; v = p.y; }
      uv[(i + k) * 2] = u; uv[(i + k) * 2 + 1] = v;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Фактуры дверных полотен (натягиваются на полотно целиком, UV 0..1).
const doorCache = new Map();
export function doorTextures(style) {
  if (doorCache.has(style)) return doorCache.get(style);
  const W = 256, H = 640;
  const col = new Uint8ClampedArray(W * H * 4), hgt = new Float32Array(W * H);
  const ns = N(style === 'metal' ? 131 : 121);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / W, v = 1 - j / H;          // v=0 низ
    let a, h = 0.5;
    if (style === 'metal') {
      // металл, покрашенный: филёнки — большая сверху, две снизу
      const inRect = (x0, y0, x1, y1) => u > x0 && u < x1 && v > y0 && v < y1;
      const rim = (x0, y0, x1, y1, w) => inRect(x0, y0, x1, y1) && !inRect(x0 + w, y0 + w * 0.4, x1 - w, y1 - w * 0.4);
      h = 0.5;
      for (const r of [[0.2, 0.44, 0.8, 0.9], [0.2, 0.25, 0.8, 0.37], [0.2, 0.06, 0.8, 0.2]]) {
        if (rim(...r, 0.05)) h = 0.2;
        else if (inRect(...r)) h = 0.75;
      }
      a = 0.9 + 0.1 * fbm(ns, u * 8, v * 16);
    } else {
      // шпон ореха, по центру — вертикальные фрезерованные канавки, внизу тонкий шов
      // ровные продольные волокна шпона + мелкий шум
      const grain = 0.5 + 0.5 * Math.sin((u * 70 + fbm(ns, u * 2, v * 3) * 1.2) * Math.PI);
      const fine = fbm(ns, u * 40, v * 2);
      a = 0.8 + 0.08 * grain + 0.1 * fine;
      if (u > 0.36 && u < 0.64) {
        const g = ((u - 0.36) / 0.28) * 7 % 1;
        h = 0.5 + 0.45 * Math.cos(g * 2 * Math.PI);
        a *= 0.85 + 0.15 * h;
      }
      if (Math.abs(v - 0.33) < 0.003 && (u < 0.36 || u > 0.64)) { h = 0.1; a *= 0.6; }
    }
    const k = (j * W + i) * 4;
    col[k] = col[k + 1] = col[k + 2] = a * 255; col[k + 3] = 255;
    hgt[j * W + i] = h;
  }
  const nor = new Uint8ClampedArray(W * H * 4);
  const st = style === 'metal' ? 6 : 4;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const g = (x, y) => hgt[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    const nx = (g(i - 1, j) - g(i + 1, j)) * st, ny = (g(i, j + 1) - g(i, j - 1)) * st;
    const l = Math.hypot(nx, ny, 1), k = (j * W + i) * 4;
    nor[k] = (nx / l * 0.5 + 0.5) * 255; nor[k + 1] = (ny / l * 0.5 + 0.5) * 255; nor[k + 2] = (1 / l * 0.5 + 0.5) * 255; nor[k + 3] = 255;
  }
  const mk = (d, srgb) => {
    const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8;
    t.flipY = false; t.needsUpdate = true;
    return t;
  };
  const res = { map: mk(col, true), normalMap: mk(nor, false) };
  doorCache.set(style, res);
  return res;
}
