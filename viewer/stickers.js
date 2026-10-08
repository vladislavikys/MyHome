import * as THREE from 'three';

// Стикеры-заметки: жёлтые квадраты 20×20 см, приклеенные к поверхностям. Хранятся в house.notes:
// { id, at: [x, y, z], n: [nx, ny, nz], text } — мировые координаты точки и нормаль поверхности.
// Подойти ближе 1,5 м и посмотреть на стикер — он всплывает карточкой с полным текстом.

const SIZE = 0.2, NEAR = 1.5;

function stickerTexture(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffe066';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = 'rgba(160, 120, 0, 0.18)';          // загнутый уголок и тень у края
  x.fillRect(0, 236, 256, 20);
  x.fillStyle = '#3a3000';
  x.font = '600 30px "Segoe Print", "Comic Sans MS", sans-serif';
  const lines = [];
  for (const word of text.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && x.measureText(last + ' ' + word).width < 216) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word);
  }
  const shown = lines.slice(0, 6);
  if (lines.length > 6) shown[5] = shown[5].replace(/.{0,2}$/, '…');
  shown.forEach((l, i) => x.fillText(l, 20, 46 + i * 36, 216));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createStickers({ scene, camera, notes, onChange }) {
  const group = new THREE.Group();
  group.name = 'stickers';
  scene.add(group);
  const geo = new THREE.PlaneGeometry(SIZE, SIZE);

  const card = document.createElement('div');
  card.className = 'note-card';
  card.hidden = true;
  card.innerHTML = `<p class="note-text"></p><div class="note-actions"><button type="button" class="note-edit">Изменить</button>
    <button type="button" class="note-del">Удалить</button><button type="button" class="note-close" aria-label="Закрыть">×</button></div>
    <p class="note-keys">E — изменить · Delete — удалить</p>`;
  document.body.append(card);
  let focused = null, pinned = false;

  function sync() {
    for (const m of group.children) { m.material.map.dispose(); m.material.dispose(); }
    group.clear();
    for (const note of notes()) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        map: stickerTexture(note.text), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2,
      }));
      const p = new THREE.Vector3(...note.at), n = new THREE.Vector3(...note.n).normalize();
      m.position.copy(p).addScaledVector(n, 0.004);
      // на полу и потолке «верх» стикера — по оси -z (север на плане), на стенах — вверх
      m.up.set(0, Math.abs(n.y) > 0.9 ? 0 : 1, Math.abs(n.y) > 0.9 ? -1 : 0);
      m.lookAt(p.clone().add(n));
      m.rotateZ(((note.id.charCodeAt(note.id.length - 1) % 9) - 4) * 0.02);   // чуть криво, как наклеен рукой
      m.userData.note = note;
      m.receiveShadow = true;
      group.add(m);
    }
    if (focused && !notes().includes(focused)) hide();
  }

  function add(at, n) {
    const text = prompt('Текст стикера:')?.trim();
    if (!text) return null;
    const note = { id: 'n' + Date.now().toString(36), at: at.toArray().map(v => +v.toFixed(3)), n: n.toArray().map(v => +v.toFixed(3)), text };
    notes(true).push(note);
    sync();
    onChange();
    return note;
  }
  function edit(note = focused) {
    if (!note) return;
    const text = prompt('Текст стикера:', note.text)?.trim();
    if (text == null || text === '' || text === note.text) return;
    note.text = text;
    sync();
    show(note, pinned);
    onChange();
  }
  function remove(note = focused) {
    if (!note || !confirm('Удалить стикер?')) return;
    const list = notes(true), i = list.indexOf(note);
    if (i >= 0) list.splice(i, 1);
    hide();
    sync();
    onChange();
  }

  function show(note, pin) {
    focused = note;
    pinned = pin;
    card.querySelector('.note-text').textContent = note.text;
    card.classList.toggle('pinned', pin);
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('open'));
  }
  function hide() {
    focused = null;
    pinned = false;
    card.classList.remove('open');
    card.hidden = true;
  }
  card.querySelector('.note-edit').onclick = () => edit();
  card.querySelector('.note-del').onclick = () => remove();
  card.querySelector('.note-close').onclick = hide;

  // каждый кадр: ближайший стикер перед глазами всплывает карточкой
  const cam = new THREE.Vector3(), fwd = new THREE.Vector3(), to = new THREE.Vector3();
  function update() {
    if (pinned || !group.visible) return;
    camera.getWorldPosition(cam);
    camera.getWorldDirection(fwd);
    let best = null, bestD = NEAR;
    for (const m of group.children) {
      to.copy(m.position).sub(cam);
      const d = to.length();
      if (d < bestD && to.divideScalar(d).dot(fwd) > 0.9) { best = m.userData.note; bestD = d; }
    }
    if (best && best !== focused) show(best, false);
    else if (!best && focused) hide();
  }

  // попадание луча в стикер (для клика в 3D)
  function hit(raycaster) {
    if (!group.visible) return null;
    return raycaster.intersectObjects(group.children, false)[0]?.object.userData.note ?? null;
  }

  return {
    group, sync, add, edit, remove, update, hit, hide,
    open: note => show(note, true),
    get focused() { return focused; },
    setVisible(on) { group.visible = on; if (!on) hide(); },
  };
}
