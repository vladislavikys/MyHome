// Сравнение вариантов шторкой «до / после»: снимок варианта A лежит поверх живой сцены с вариантом B,
// вертикальная шторка делит экран. Камера на время сравнения стоит; чтобы сменить ракурс — закрыть, повернуть, сравнить снова.

export function createCompare({ container, canvas, variants, setVariant, renderOnce, freeze }) {
  const bar = document.createElement('div');
  bar.className = 'cmp-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <label>Сравнить: <select class="cmp-group" aria-label="Что сравнивать"></select></label>
    <select class="cmp-a" aria-label="Вариант слева"></select>
    <span aria-hidden="true">⇄</span>
    <select class="cmp-b" aria-label="Вариант справа"></select>
    <button type="button" class="cmp-swap" aria-label="Поменять местами">↔</button>
    <button type="button" class="cmp-close">Закрыть</button>`;
  const shot = document.createElement('div');
  shot.className = 'cmp-shot';
  shot.hidden = true;
  shot.innerHTML = `<img alt=""><div class="cmp-line" role="slider" tabindex="0" aria-label="Шторка сравнения"
    aria-valuemin="0" aria-valuemax="100"><span></span></div><b class="cmp-tag cmp-tag-a"></b><b class="cmp-tag cmp-tag-b"></b>`;
  container.append(shot, bar);
  const $ = s => bar.querySelector(s) ?? shot.querySelector(s);
  const img = $('img'), line = $('.cmp-line');
  let active = false, before = null, pos = 50;

  const setPos = p => {
    pos = Math.max(0, Math.min(100, p));
    img.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
    line.style.left = pos + '%';
    line.setAttribute('aria-valuenow', Math.round(pos));
  };
  const fill = (sel, opts, value) => {
    sel.innerHTML = '';
    for (const [k, o] of Object.entries(opts)) sel.add(new Option(o.name ?? k, k, false, k === value));
  };
  const group = () => variants()[$('.cmp-group').value];

  // снимок A, затем на экране остаётся живой B
  function run() {
    const g = group(), a = $('.cmp-a').value, b = $('.cmp-b').value;
    setVariant($('.cmp-group').value, a);
    renderOnce();
    img.src = canvas.toDataURL('image/jpeg', 0.92);
    setVariant($('.cmp-group').value, b);
    $('.cmp-tag-a').textContent = g.options[a]?.name ?? a;
    $('.cmp-tag-b').textContent = g.options[b]?.name ?? b;
    shot.hidden = false;
  }

  function open() {
    const all = variants(), keys = Object.keys(all);
    if (!keys.length) return;
    active = true;
    before = Object.fromEntries(keys.map(k => [k, all[k].active]));
    freeze(true);
    const gs = $('.cmp-group');
    gs.innerHTML = '';
    for (const k of keys) gs.add(new Option(all[k].label ?? k, k));
    pickGroup();
    bar.hidden = false;
    setPos(50);
  }
  function pickGroup() {
    const g = group(), opts = Object.keys(g.options);
    const a = g.active ?? opts[0], b = opts.find(k => k !== a) ?? a;
    fill($('.cmp-a'), g.options, a);
    fill($('.cmp-b'), g.options, b);
    run();
  }
  function close() {
    if (!active) return;
    active = false;
    bar.hidden = shot.hidden = true;
    for (const [k, v] of Object.entries(before)) if (variants()[k]?.active !== v) setVariant(k, v);
    freeze(false);
  }

  $('.cmp-group').onchange = () => { for (const [k, v] of Object.entries(before)) if (variants()[k]?.active !== v) setVariant(k, v); pickGroup(); };
  $('.cmp-a').onchange = $('.cmp-b').onchange = run;
  $('.cmp-swap').onclick = () => {
    const a = $('.cmp-a'), b = $('.cmp-b'), t = a.value;
    a.value = b.value; b.value = t;
    run();
  };
  $('.cmp-close').onclick = close;

  // шторку тянут за линию или кликом в любом месте снимка
  const drag = ev => {
    const r = shot.getBoundingClientRect();
    setPos(((ev.clientX - r.left) / r.width) * 100);
  };
  shot.addEventListener('pointerdown', ev => { shot.setPointerCapture(ev.pointerId); drag(ev); });
  shot.addEventListener('pointermove', ev => { if (shot.hasPointerCapture(ev.pointerId)) drag(ev); });
  line.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowLeft') setPos(pos - 5);
    else if (ev.key === 'ArrowRight') setPos(pos + 5);
  });
  window.addEventListener('keydown', ev => { if (active && ev.key === 'Escape') close(); });

  return { open, close, get active() { return active; } };
}
