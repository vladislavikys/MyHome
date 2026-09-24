import * as THREE from 'three';

// Автоматическая экскурсия: камера летит по сплайну через точки маршрута (house.tour)
// и смотрит на свои точки взгляда. Снаружи быстрее, внутри медленно, по кругу.

const OUTSIDE_SPEED = 7;   // м/с
const INSIDE_SPEED = 1.1;
const MIN_SEG = { out: 2.5, in: 2.0 };

const v3 = ([x, y, h]) => new THREE.Vector3(x, h, y);   // план [x, y, h] → 3D

export function createTour({ camera, ui }) {
  let active = false;
  let path = null, look = null, times = [], labels = [], total = 0;
  let t0 = 0, lastLabel = null, savedFov = camera.fov;
  const lamp = new THREE.PointLight('#fff1dc', 0, 10, 1.2);
  camera.add(lamp);

  function start(points) {
    if (!points?.length) return false;
    path = new THREE.CatmullRomCurve3(points.map(p => v3(p.p)), true, 'centripetal');
    look = new THREE.CatmullRomCurve3(points.map(p => v3(p.look)), true, 'centripetal');
    times = [0];
    labels = points.map(p => p.label ?? null);
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const inside = a.inside || b.inside;
      const d = v3(a.p).distanceTo(v3(b.p));
      const turn = v3(a.look).sub(v3(a.p)).normalize().angleTo(v3(b.look).sub(v3(b.p)).normalize());
      const dur = Math.max(d / (inside ? INSIDE_SPEED : OUTSIDE_SPEED), inside ? MIN_SEG.in : MIN_SEG.out, turn * 1.6);
      times.push(times[i] + dur);
    }
    total = times[times.length - 1];
    savedFov = camera.fov;
    camera.fov = 58;
    camera.updateProjectionMatrix();
    lamp.intensity = 6;
    t0 = performance.now();
    lastLabel = null;
    active = true;
    document.body.classList.add('touring');
    update();
    return true;
  }

  function stop() {
    if (!active) return;
    active = false;
    lamp.intensity = 0;
    camera.fov = savedFov;
    camera.updateProjectionMatrix();
    document.body.classList.remove('touring');
    ui.caption.classList.remove('show');
  }

  function update() {
    if (!active) return;
    const t = ((performance.now() - t0) / 1000) % total;
    let i = 0;
    while (i < times.length - 2 && times[i + 1] <= t) i++;
    const local = (t - times[i]) / (times[i + 1] - times[i]);
    const n = times.length - 1;
    const u = (i + local) / n;
    camera.position.copy(path.getPoint(u));
    camera.lookAt(look.getPoint(u));
    ui.progress.style.transform = `scaleX(${t / total})`;

    // подпись последней пройденной точки с названием
    let j = i;
    while (j >= 0 && !labels[j]) j--;
    const label = j >= 0 ? labels[j] : null;
    if (label !== lastLabel) {
      lastLabel = label;
      ui.caption.classList.remove('show');
      if (label) {
        ui.caption.textContent = label;
        requestAnimationFrame(() => ui.caption.classList.add('show'));
      }
    }
  }

  // Перейти к моменту экскурсии (секунды от начала).
  function seek(sec) { t0 = performance.now() - sec * 1000; update(); }

  return { start, stop, update, seek, get total() { return total; }, get active() { return active; } };
}
