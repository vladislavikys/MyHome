// Режим «Фото»: фотореалистичный кадр трассировкой путей (three-gpu-pathtracer).
// Картинка уточняется с каждым проходом: через 10–60 с получается мягкий свет, отражения и
// переотражённый свет от неба и стен. Библиотека грузится только при первом нажатии.

export function createPhoto({ renderer, scene, camera, ui, onStart, onStop }) {
  let pt = null, active = false, ready = false, dirty = true;

  async function ensure() {
    if (pt) return pt;
    const { WebGLPathTracer } = await import('three-gpu-pathtracer');
    pt = new WebGLPathTracer(renderer);
    pt.bounces = 6;
    pt.transmissiveBounces = 6;
    pt.filterGlossyFactor = 0.5;
    pt.minSamples = 1;
    pt.renderDelay = 0;
    pt.fadeDuration = 400;
    pt.tiles.set(2, 2);
    return pt;
  }

  async function start() {
    if (active) return;
    active = true;
    ready = false;
    onStart?.();
    document.body.classList.add('photo');
    ui.status.textContent = 'Готовлю сцену…';
    ui.save.disabled = true;
    try {
      const p = await ensure();
      if (!active) return;
      await new Promise(r => setTimeout(r, 60));   // дать показать «Готовлю сцену…»
      if (dirty) { p.setScene(scene, camera); dirty = false; }
      else { p.updateCamera(); p.updateMaterials(); p.updateLights(); p.updateEnvironment(); }
      p.reset();
      ready = true;
    } catch (e) {
      console.error(e);
      ui.status.textContent = 'Не получилось запустить фото-режим на этом устройстве.';
    }
  }

  function stop() {
    if (!active) return;
    active = false;
    ready = false;
    document.body.classList.remove('photo');
    onStop?.();
  }

  function update() {
    if (!ready) { renderer.render(scene, camera); return; }
    pt.renderSample();
    const n = Math.floor(pt.samples);
    ui.status.textContent = n < 1 ? 'Считаю свет…' : `Проходов: ${n}${n >= 40 ? ' — готово, можно сохранить' : ''}`;
    ui.save.disabled = n < 1;
  }

  return {
    start, stop, update,
    // сцена пересобрана (правки) — при следующем фото загрузить заново
    sceneChanged() { dirty = true; },
    get active() { return active; },
  };
}
