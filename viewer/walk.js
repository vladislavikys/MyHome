import * as THREE from 'three';

// Прогулка от первого лица: ходьба со столкновениями и гравитацией
// или свободный полёт сквозь стены.

const EYE = 1.6;        // высота глаз над полом, м
const STEP = 0.35;      // на сколько можно шагнуть вверх (ступени, пороги)
const RADIUS = 0.25;    // «толщина» человека
const DOWN = new THREE.Vector3(0, -1, 0);

export function createWalk({ camera, dom, ui, getColliders, getWalkables }) {
  const ray = new THREE.Raycaster();
  const feet = new THREE.Vector3();
  const keys = new Set();
  const joy = { x: 0, y: 0 };
  let vert = 0;
  let yaw = 0, pitch = 0, velY = 0;
  let active = false;
  let look = null;
  let savedFov = camera.fov;

  const noclip = () => ui.noclip.checked;

  // мягкий свет «как от ламп в комнате», идёт вместе с камерой
  const lamp = new THREE.PointLight('#fff4e0', 0, 9, 1.2);
  camera.add(lamp);

  function floorBelow(p) {
    ray.set(new THREE.Vector3(p.x, p.y + STEP + 0.05, p.z), DOWN);
    ray.far = 60;
    const hit = ray.intersectObjects(getWalkables(), false)[0];
    return hit ? hit.point.y : 0;
  }

  function blocked(p, dir, dist) {
    for (const h of [STEP + 0.1, 1.1, 1.7]) {
      ray.set(new THREE.Vector3(p.x, p.y + h, p.z), dir);
      ray.far = dist + RADIUS;
      if (ray.intersectObjects(getColliders(), false).length) return true;
    }
    return false;
  }

  function enter() {
    if (active) return;
    active = true;
    savedFov = camera.fov;
    camera.fov = 70;
    camera.updateProjectionMatrix();
    // старт перед входом в дом, лицом к дому
    feet.set(13.2, 0, 13.5);
    yaw = 0.18; pitch = 0.05; velY = 0;
    feet.y = floorBelow(feet);
    document.body.classList.add('walking');
    lamp.intensity = 6;
    apply();
  }

  function exit() {
    if (!active) return;
    active = false;
    keys.clear();
    joy.x = joy.y = 0;
    vert = 0;
    lamp.intensity = 0;
    camera.fov = savedFov;
    camera.updateProjectionMatrix();
    document.body.classList.remove('walking');
  }

  function apply() {
    camera.position.set(feet.x, feet.y + EYE, feet.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  function update(dt) {
    if (!active) return;
    dt = Math.min(dt, 0.05);
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = (noclip() ? 6 : 2.2) * (run ? 2.5 : 1);
    let fwd = joy.y, side = joy.x;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) side += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) side -= 1;
    const len = Math.hypot(fwd, side);
    if (len > 1) { fwd /= len; side /= len; }

    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    if (noclip()) {
      // полёт: вперёд туда, куда смотришь (с наклоном)
      const look3 = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      let up = vert;
      if (keys.has('Space') || keys.has('KeyE')) up += 1;
      if (keys.has('KeyC') || keys.has('KeyQ')) up -= 1;
      feet.addScaledVector(look3, fwd * speed * dt);
      feet.addScaledVector(r, side * speed * dt);
      feet.y += up * speed * dt;
      velY = 0;
    } else {
      const d = new THREE.Vector3().addScaledVector(f, fwd * speed * dt).addScaledVector(r, side * speed * dt);
      // по осям отдельно — так вдоль стены можно скользить
      if (Math.abs(d.x) > 1e-6 && !blocked(feet, new THREE.Vector3(Math.sign(d.x), 0, 0), Math.abs(d.x))) feet.x += d.x;
      if (Math.abs(d.z) > 1e-6 && !blocked(feet, new THREE.Vector3(0, 0, Math.sign(d.z)), Math.abs(d.z))) feet.z += d.z;
      const floor = floorBelow(feet);
      if (floor >= feet.y - 0.01) { feet.y = floor; velY = 0; }
      else {
        velY -= 9.8 * dt;
        feet.y = Math.max(floor, feet.y + velY * dt);
        if (feet.y === floor) velY = 0;
      }
    }
    apply();
  }

  // ---------- ввод ----------
  const typing = ev => ev.target.closest?.('input:not([type="checkbox"]), select, textarea');
  window.addEventListener('keydown', ev => {
    if (!active || typing(ev)) return;
    if (ev.code === 'Escape') { ui.exitWalk.click(); return; }
    keys.add(ev.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) ev.preventDefault();
  });
  window.addEventListener('keyup', ev => keys.delete(ev.code));
  window.addEventListener('blur', () => keys.clear());

  // осмотр: тянуть мышью или пальцем по сцене
  dom.addEventListener('pointerdown', ev => {
    if (!active) return;
    look = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
    dom.setPointerCapture(ev.pointerId);
  });
  dom.addEventListener('pointermove', ev => {
    if (!active || !look || ev.pointerId !== look.id) return;
    yaw -= (ev.clientX - look.x) * 0.005;
    pitch = Math.max(-1.45, Math.min(1.45, pitch - (ev.clientY - look.y) * 0.005));
    look.x = ev.clientX; look.y = ev.clientY;
  });
  const endLook = ev => { if (look && ev.pointerId === look.id) look = null; };
  dom.addEventListener('pointerup', endLook);
  dom.addEventListener('pointercancel', endLook);

  // джойстик для телефона
  const base = ui.joy, knob = ui.joy.firstElementChild;
  let joyId = null;
  const joyMove = ev => {
    const r = base.getBoundingClientRect();
    const R = r.width / 2;
    let dx = ev.clientX - (r.left + R), dy = ev.clientY - (r.top + R);
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.x = dx / R; joy.y = -dy / R;
  };
  base.addEventListener('pointerdown', ev => { joyId = ev.pointerId; base.setPointerCapture(ev.pointerId); joyMove(ev); });
  base.addEventListener('pointermove', ev => { if (ev.pointerId === joyId) joyMove(ev); });
  const joyEnd = ev => {
    if (ev.pointerId !== joyId) return;
    joyId = null; joy.x = joy.y = 0; knob.style.transform = '';
  };
  base.addEventListener('pointerup', joyEnd);
  base.addEventListener('pointercancel', joyEnd);

  for (const [btn, v] of [[ui.flyUp, 1], [ui.flyDown, -1]]) {
    btn.addEventListener('pointerdown', ev => { vert = v; btn.setPointerCapture(ev.pointerId); });
    btn.addEventListener('pointerup', () => { vert = 0; });
    btn.addEventListener('pointercancel', () => { vert = 0; });
  }

  // при выключении полёта — опуститься на пол под собой
  ui.noclip.addEventListener('change', () => { velY = 0; ui.noclip.blur(); });

  // Переместиться в точку плана (x, y) лицом по направлению yaw.
  function teleport(x, y, yawV = yaw, h = 0, pitchV = 0) {
    feet.set(x, h, y);
    feet.y = floorBelow(feet);
    yaw = yawV; pitch = pitchV; velY = 0;
    apply();
  }

  return { enter, exit, update, teleport, get feet() { return feet.clone(); }, get active() { return active; } };
}
