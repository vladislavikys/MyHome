import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { boxUVs } from './looks.js';

// Быстрые лучи (прогулка, выбор мышью) по большой слитой геометрии.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Обрезка треугольников плоскостями: остаётся то, что с положительной стороны
// (как у material.clippingPlanes). Нужна трассировщику, который не знает про clippingPlanes.
function clipGeometry(geo, planes) {
  const pos = geo.attributes.position;
  const out = [];
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < pos.count; i += 3) {
    for (let k = 0; k < 3; k++) tri[k].fromBufferAttribute(pos, i + k);
    let poly = tri.map(v => v.clone());
    for (const pl of planes) {
      const res = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        const da = pl.distanceToPoint(a), db = pl.distanceToPoint(b);
        if (da >= 0) res.push(a);
        if ((da >= 0) !== (db >= 0)) res.push(a.clone().lerp(b, da / (da - db)));
      }
      poly = res;
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    for (let k = 1; k < poly.length - 1; k++) out.push(...poly[0].toArray(), ...poly[k].toArray(), ...poly[k + 1].toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

/**
 * «Запекает» группу этажа: переносит все меши в мировые координаты, обрезает по плоскостям
 * материала, считает UV, сливает одинаковые меши (по материалу и флагам) в один.
 * Меши с userData.pick (окна) и прозрачные остаются отдельными.
 */
// Плоскости срезки всех материалов сцены — собрать ДО запекания (материалы общие для этажей).
export function collectClipPlanes(roots) {
  const map = new Map();
  for (const r of roots) r.traverse(o => { if (o.isMesh && o.material.clippingPlanes?.length) map.set(o.material, o.material.clippingPlanes); });
  return map;
}

// После запекания срезка уже в геометрии — снимаем её с материалов.
export function clearClipPlanes(map) {
  for (const mat of map.keys()) { mat.clippingPlanes = null; mat.needsUpdate = true; }
}

export function bakeGroup(group, planesOf = collectClipPlanes([group])) {
  group.updateMatrixWorld(true);
  const meshes = [];
  group.traverse(o => { if (o.isMesh) meshes.push(o); });
  const buckets = new Map();
  const keep = [];

  for (const m of meshes) {
    // данные для выбора (окна) — с предков на сам меш
    let pick = null;
    for (let q = m; q && q !== group; q = q.parent) if (q.userData.pick) { pick = q.userData.pick; break; }

    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    for (const name of Object.keys(geo.attributes)) if (name !== 'position') geo.deleteAttribute(name);
    const planes = planesOf.get(m.material);
    if (planes?.length) geo = clipGeometry(geo, planes);
    if (!geo.attributes.position.count) continue;
    geo.computeVertexNormals();
    if (m.userData.uvFn) m.userData.uvFn(geo); else boxUVs(geo);

    const flags = { collide: !!m.userData.collide, walkable: !!m.userData.walkable };
    const mat = m.material;
    if (pick || mat.transparent) {
      const mm = new THREE.Mesh(geo, mat);
      Object.assign(mm.userData, flags, pick ? { pick } : {});
      mm.castShadow = m.castShadow; mm.receiveShadow = m.receiveShadow;
      keep.push(mm);
      continue;
    }
    const key = `${mat.uuid}|${flags.collide}|${flags.walkable}|${m.castShadow}`;
    if (!buckets.has(key)) buckets.set(key, { mat, flags, cast: m.castShadow, geos: [] });
    buckets.get(key).geos.push(geo);
  }

  // старое содержимое (кроме подписей) убираем
  const labels = [];
  group.traverse(o => { if (o.isCSS2DObject) labels.push(o); });
  group.clear();
  for (const l of labels) group.add(l);

  for (const { mat, flags, cast, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    merged.computeBoundsTree();
    const mesh = new THREE.Mesh(merged, mat);
    Object.assign(mesh.userData, flags);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const m of keep) { m.geometry.computeBoundsTree(); group.add(m); }
}
