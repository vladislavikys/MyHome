import * as THREE from 'three';

// Газон: шейдер земли без заметного повтора (две фактуры в разных масштабах + пятна оттенков)
// и густая короткая трава «оболочками» (shell texturing): стопка прозрачных слоёв, в каждом слое
// остаются только травинки выше его высоты. Вблизи — плотный стриженый газон, издали — ровный ковёр.

export const grassUniforms = { uTime: { value: 0 } };

// Тайлящийся шум 256×256 для крупных пятен (густая, тёмная, подсохшая трава).
function noiseTexture() {
  const N = 256, data = new Uint8Array(N * N * 4);
  const grid = (seed, P) => {
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: P * P }, r);
  };
  const octaves = [[4, 1], [8, 0.5], [16, 0.25], [32, 0.125]].map(([P, a], i) => ({ P, a, g: grid(1234 + i * 77, P) }));
  const sm = t => t * t * (3 - 2 * t);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let v = 0, norm = 0;
    for (const { P, a, g } of octaves) {
      const x = (i / N) * P, y = (j / N) * P, xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
      const at = (X, Y) => g[((Y % P) + P) % P * P + (((X % P) + P) % P)];
      const a0 = at(xi, yi), b0 = at(xi + 1, yi), c0 = at(xi, yi + 1), d0 = at(xi + 1, yi + 1);
      v += a * (a0 + (b0 - a0) * xf + (c0 - a0) * yf + (a0 - b0 - c0 + d0) * xf * yf);
      norm += a;
    }
    const k = (j * N + i) * 4, b = Math.round((v / norm) * 255);
    data[k] = data[k + 1] = data[k + 2] = b; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

let lawnNoise = null;
export function lawnMaterial(grassTex) {
  const noise = (lawnNoise ??= noiseTexture());
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: grassTex.map, normalMap: grassTex.normalMap, roughness: 0.95 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNoise = { value: noise };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uNoise;')
      .replace('#include <map_fragment>', `
        vec2 gp = vWPos.xz;
        vec3 g1 = texture2D(map, gp / 3.0).rgb;
        vec3 g2 = texture2D(map, mat2(0.8, -0.6, 0.6, 0.8) * gp / 7.3 + 0.31).rgb;
        float big = texture2D(uNoise, gp / 46.0).r;
        float mid = texture2D(uNoise, gp / 11.0 + 0.37).r;
        float fine = texture2D(uNoise, gp / 2.3 + 0.71).r;
        vec3 tex = mix(g1, g2, smoothstep(0.35, 0.65, mid));
        vec3 lush = vec3(0.19, 0.35, 0.09), dark = vec3(0.12, 0.24, 0.06), dry = vec3(0.38, 0.39, 0.17);
        vec3 tint = mix(lush, dark, smoothstep(0.42, 0.78, big));
        tint = mix(tint, dry, smoothstep(0.62, 0.9, mid * 0.6 + big * 0.5) * 0.55);
        tint *= 0.9 + 0.2 * fine;
        diffuseColor.rgb *= tex * tint * 1.55;
      `);
  };
  return mat;
}

// Случайная высота травинки на тексель (≈4 мм на тексель).
function bladeTexture() {
  const N = 512, data = new Uint8Array(N * N * 4);
  let s = 424242;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < N * N; k++) {
    const v = Math.round(r() * 255);
    data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = v; data[k * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// Маска: белое — газон (внутри участка), чёрное — дом, постройки, покрытия.
function maskTexture(boundary, excludes, box) {
  const PX = 10;   // пикселей на метр
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(box[2] * PX));
  c.height = Math.max(2, Math.ceil(box[3] * PX));
  const g = c.getContext('2d');
  const path = poly => { g.beginPath(); poly.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo']((x - box[0]) * PX, (y - box[1]) * PX)); g.closePath(); };
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; path(boundary); g.fill();
  g.fillStyle = '#000';
  for (const p of excludes) if (p?.length > 2) { path(p); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

let bladeTex = null;
const LAYERS = 14, HEIGHT = 0.038;

// Трава внутри границы участка, кроме многоугольников excludes. Координаты — участка.
export function grassField(boundary, excludes) {
  if (!boundary?.length) return null;
  const xs = boundary.map(p => p[0]), ys = boundary.map(p => p[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  bladeTex ??= bladeTexture();
  lawnNoise ??= noiseTexture();
  const mask = maskTexture(boundary, excludes, box);

  const geo = new THREE.PlaneGeometry(box[2], box[3]);
  geo.rotateX(-Math.PI / 2);
  geo.translate(box[0] + box[2] / 2, 0, box[1] + box[3] / 2);
  geo.deleteAttribute('uv');

  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      uTime: grassUniforms.uTime, uBlades: { value: bladeTex }, uNoise: { value: lawnNoise }, uMask: { value: mask },
      uBox: { value: new THREE.Vector4(...box) }, uHeight: { value: HEIGHT },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uHeight;\nvarying vec2 vSite;\nvarying float vH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSite = position.xz;
        vH = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y / uHeight;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform sampler2D uBlades, uNoise, uMask; uniform vec4 uBox;
        varying vec2 vSite; varying float vH;`)
      .replace('#include <map_fragment>', `
        if (texture2D(uMask, (vSite - uBox.xy) / uBox.zw).r < 0.5) discard;
        vec2 wind = vec2(sin(uTime * 1.3 + vSite.y * 0.45 + vSite.x * 0.2), cos(uTime * 1.1 + vSite.x * 0.35)) * 0.004 * vH * vH;
        vec2 bp = (vSite + wind) / 2.0;                       // 512 текселей на 2 м → ≈4 мм
        float r = texture2D(uBlades, bp).r;
        float r2 = texture2D(uBlades, bp * 0.173 + 0.31).r;
        float tall = r * (0.7 + 0.45 * r2);
        if (tall < vH) discard;
        float big = texture2D(uNoise, vSite / 46.0).r;
        float mid = texture2D(uNoise, vSite / 11.0 + 0.37).r;
        vec3 lush = vec3(0.19, 0.35, 0.09), dark = vec3(0.12, 0.24, 0.06), dry = vec3(0.38, 0.39, 0.17);
        vec3 tint = mix(lush, dark, smoothstep(0.42, 0.78, big));
        tint = mix(tint, dry, smoothstep(0.62, 0.9, mid * 0.6 + big * 0.5) * 0.55);
        diffuseColor.rgb = tint * (0.5 + 0.65 * vH) * (0.88 + 0.24 * r2);
      `)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
  };

  const mesh = new THREE.InstancedMesh(geo, mat, LAYERS);
  const m = new THREE.Matrix4();
  for (let i = 0; i < LAYERS; i++) mesh.setMatrixAt(i, m.makeTranslation(0, ((i + 1) / LAYERS) * HEIGHT, 0));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.raycast = () => {};
  mesh.userData.dynamic = true;   // не запекать
  mesh.userData.grass = true;
  return mesh;
}
