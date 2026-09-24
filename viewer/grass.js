import * as THREE from 'three';

// Газон: шейдер земли без заметного повтора (две фактуры в разных масштабах + пятна оттенков)
// и живая трава — кустики травинок инстансами, качаются на ветру.

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

export function lawnMaterial(grassTex) {
  const noise = noiseTexture();
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
        vec3 lush = vec3(0.27, 0.43, 0.14), dark = vec3(0.17, 0.30, 0.10), dry = vec3(0.46, 0.46, 0.24);
        vec3 tint = mix(lush, dark, smoothstep(0.42, 0.78, big));
        tint = mix(tint, dry, smoothstep(0.62, 0.9, mid * 0.6 + big * 0.5) * 0.55);
        tint *= 0.9 + 0.2 * fine;
        diffuseColor.rgb *= tex * tint * 1.55;
      `);
  };
  return mat;
}

// Кустик из 5 травинок, каждая — сужающаяся полоска из 2 сегментов с изгибом.
function clumpGeometry() {
  const pos = [], col = [], nor = [];
  const base = new THREE.Color('#223d12'), tip = new THREE.Color('#78a043');
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < 6; b++) {
    const a = r() * Math.PI * 2, off = [Math.cos(a) * 0.035 * r(), Math.sin(a) * 0.035 * r()];
    const dir = r() * Math.PI * 2, lean = 0.01 + r() * 0.03, h = 0.06 + r() * 0.06, w = 0.006 + r() * 0.004;
    const pts = [0, 0.55, 1].map(t => [off[0] + Math.cos(dir) * lean * t * t, t * h, off[1] + Math.sin(dir) * lean * t * t, w * (1 - t * 0.95)]);
    const px = -Math.sin(dir), pz = Math.cos(dir);
    for (let k = 0; k < 2; k++) {
      const [x0, y0, z0, w0] = pts[k], [x1, y1, z1, w1] = pts[k + 1];
      const A = [x0 - px * w0, y0, z0 - pz * w0], B = [x0 + px * w0, y0, z0 + pz * w0];
      const C = [x1 + px * w1, y1, z1 + pz * w1], D = [x1 - px * w1, y1, z1 - pz * w1];
      for (const v of [A, B, C, A, C, D]) {
        pos.push(...v);
        const c = base.clone().lerp(tip, Math.pow(v[1] / h, 0.8));
        col.push(c.r, c.g, c.b);
        nor.push(0, 1, 0);   // как у земли — трава не «светится» отдельно от газона
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

let clumpGeo = null, bladeMat = null;
function bladeMaterial() {
  if (bladeMat) return bladeMat;
  bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  bladeMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = grassUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float gh = clamp(position.y / 0.12, 0.0, 1.0);
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float gw = sin(uTime * 1.6 + ip.x * 0.31 + ip.z * 0.17) + 0.45 * sin(uTime * 3.3 + ip.x * 1.7 - ip.z * 0.9);
        transformed.x += gw * 0.022 * gh * gh;
        transformed.z += gw * 0.01 * gh * gh;`);
  };
  return bladeMat;
}

function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Трава внутри границы участка, кроме многоугольников excludes. Координаты — участка.
export function grassField(boundary, excludes, density = 50) {
  if (!boundary?.length) return null;
  clumpGeo ??= clumpGeometry();
  const xs = boundary.map(p => p[0]), ys = boundary.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const boxes = excludes.filter(p => p?.length > 2).map(poly => {
    const px = poly.map(p => p[0]), py = poly.map(p => p[1]);
    return { poly, b: [Math.min(...px), Math.max(...px), Math.min(...py), Math.max(...py)] };
  });
  const max = Math.min(60000, Math.round((x1 - x0) * (y1 - y0) * density));
  const mesh = new THREE.InstancedMesh(clumpGeo, bladeMaterial(), max);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  const c = new THREE.Color();
  let s = 99991, n = 0;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < max; i++) {
    const p = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
    const rot = r(), size = 0.8 + r() * 0.5, tone = r();
    if (!inside(p, boundary)) continue;
    if (boxes.some(({ poly, b }) => p[0] >= b[0] - 0.05 && p[0] <= b[1] + 0.05 && p[1] >= b[2] - 0.05 && p[1] <= b[3] + 0.05 && inside(p, poly))) continue;
    e.set(0, rot * Math.PI * 2, 0);
    q.setFromEuler(e);
    sc.set(size, size * (0.8 + tone * 0.5), size);
    v.set(p[0], 0, p[1]);
    m.compose(v, q, sc);
    mesh.setMatrixAt(n, m);
    c.setRGB(0.85 + tone * 0.3, 0.9 + tone * 0.2, 0.8 + tone * 0.15);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.raycast = () => {};
  mesh.userData.dynamic = true;   // не запекать
  mesh.userData.grass = true;
  return mesh;
}
