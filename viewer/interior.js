import * as THREE from 'three';
import { textureSet } from './looks.js';

// Интерьер: отделка комнат (пол, стены) и мебель. Описание — общее для 3D и редактора плана.
// Мебель: { type, at: [x, y], rot (°), w?, d? (м), color? }. Лицевая сторона — к +y на плане (при rot = 0).

export const FLOOR_FINISHES = {
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
  kitchen: { name: 'Кухня (линия)', group: 'Кухня', size: [2.4, 0.62], fill: '#e7e3dc' },
  island: { name: 'Остров', group: 'Кухня', size: [1.8, 0.9], fill: '#e7e3dc' },
  fridge: { name: 'Холодильник', group: 'Кухня', size: [0.62, 0.66], fill: '#d9dcdf' },
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
    case 'kitchen': case 'island': {
      // нижние шкафы, столешница; у линии — фартук, верхние шкафы, мойка и варочная панель
      rbox(g, W, 0.1, D - 0.05, M.black, 0, 0.05, -0.025);
      rbox(g, W, 0.76, D - 0.02, M.matte(col), 0, 0.48, -0.01, true);
      rbox(g, W, 0.04, D, M.counter, 0, 0.88, 0);
      const n = Math.max(1, Math.round(W / 0.6));
      for (let i = 1; i < n; i++) rbox(g, 0.004, 0.74, 0.01, M.matte('#a9a49c'), -hw + (W * i) / n, 0.48, hd - 0.01);
      for (let i = 0; i < n; i++) rbox(g, 0.3, 0.015, 0.015, M.black, -hw + (W * (i + 0.5)) / n, 0.8, hd + 0.005);
      if (it.type === 'kitchen') {
        rbox(g, W, 0.62, 0.35, M.matte(col), 0, 1.8, -hd + 0.175, true);
        for (let i = 1; i < n; i++) rbox(g, 0.004, 0.6, 0.01, M.matte('#a9a49c'), -hw + (W * i) / n, 1.8, -hd + 0.355);
        // мойка и варочная
        rbox(g, 0.5, 0.012, 0.4, M.chrome, -hw + Math.min(0.5, W * 0.25), 0.905, 0);
        cyl(g, 0.012, 0.012, 0.3, M.chrome, -hw + Math.min(0.5, W * 0.25), 1.05, -hd + 0.08, 8);
        if (W >= 1.2) {
          rbox(g, 0.58, 0.008, 0.5, M.black, hw - Math.min(0.6, W * 0.3), 0.904, 0);
          rbox(g, 0.6, 0.35, 0.3, M.chrome, hw - Math.min(0.6, W * 0.3), 1.65, -hd + 0.15);
        }
      } else {
        for (const x of [-hw * 0.5, hw * 0.5]) {
          cyl(g, 0.2, 0.2, 0.04, M.fabric('#6b5a4c'), x, 0.72, hd + 0.35, 20);
          cyl(g, 0.025, 0.025, 0.7, M.black, x, 0.35, hd + 0.35, 8);
        }
      }
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
      rbox(g, W, 0.12, D, M.gloss('#f3f3f1'), 0, 0.86, 0);
      rbox(g, W * 0.6, 0.02, D * 0.6, M.gloss('#dfe9ec'), 0, 0.915, 0.02);
      cyl(g, 0.012, 0.012, 0.2, M.chrome, 0, 1.0, -hd + 0.06, 8);
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
