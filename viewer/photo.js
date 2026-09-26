// Режим «Фото»: фотореалистичный кадр трассировкой путей (three-gpu-pathtracer).
// Картинка уточняется с каждым проходом: мягкий свет, отражения, переотражённый свет от неба и стен.
// Кадр считается в увеличенном разрешении (до 4K) и проходит через шумодав. Библиотека грузится только при первом нажатии.

import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export function createPhoto({ renderer, scene, camera, ui, onStart, onStop, setScale }) {
  let pt = null, dq = null, active = false, ready = false, dirty = true;

  // увеличение кадра: «4K» — до 3840 точек по ширине (не больше 3× экрана)
  const scaleFor = v => {
    const w = renderer.domElement.clientWidth || 1280;
    return v === '4k' ? Math.min(3, Math.max(1, 3840 / w)) : v === '2x' ? 2 : window.devicePixelRatio || 1;
  };

  async function ensure() {
    if (pt) return pt;
    const { WebGLPathTracer, DenoiseMaterial } = await import('three-gpu-pathtracer');
    pt = new WebGLPathTracer(renderer);
    pt.bounces = 6;
    pt.transmissiveBounces = 6;
    pt.filterGlossyFactor = 0.5;
    pt.minSamples = 1;
    pt.renderDelay = 0;
    pt.fadeDuration = 400;
    pt.tiles.set(3, 3);
    dq = new FullScreenQuad(new DenoiseMaterial({ sigma: 3, kSigma: 1.5, threshold: 0.2 }));
    const plain = pt.renderToCanvasCallback;
    pt.renderToCanvasCallback = (target, r, quad) => {
      if (!ui.denoise?.checked) return plain(target, r, quad);
      const m = dq.material;
      m.map = target.texture;
      m.opacity = quad.material.opacity;
      m.blending = quad.material.blending;
      // чем больше проходов, тем меньше нужно сглаживать — детали остаются резкими
      m.threshold = Math.max(0.03, 0.4 / Math.sqrt(Math.max(1, pt.samples)));
      const ac = r.autoClear;
      r.autoClear = false;
      dq.render(r);
      r.autoClear = ac;
    };
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
      setScale?.(scaleFor(ui.size?.value));
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

  ui.size?.addEventListener('change', () => {
    if (!active || !pt) return;
    setScale?.(scaleFor(ui.size.value));
    pt.reset();
  });

  function update() {
    if (!ready) { renderer.render(scene, camera); return; }
    pt.renderSample();
    const n = Math.floor(pt.samples);
    const { width, height } = renderer.domElement;
    ui.status.textContent = n < 1 ? 'Считаю свет…' : `${width}×${height} · проходов: ${n}${n >= 60 ? ' — готово, можно сохранить' : ''}`;
    ui.save.disabled = n < 1;
  }

  return {
    start, stop, update,
    // сцена пересобрана (правки) — при следующем фото загрузить заново
    sceneChanged() { dirty = true; },
    get active() { return active; },
  };
}
