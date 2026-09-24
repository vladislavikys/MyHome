// Варианты частей дома (например, лестницы): house.variants[группа] = { label, active, options: { ключ: { name, set } } }.
// set — что подставить в модель: ключ — путь ("stairs", "floors.1.holes", "floors.0.walls#id"), значение — новое значение
// (для "#id" — элемент массива с этим id; null — удалить элемент).

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    cur = cur[key] ??= {};
  }
  const last = parts[parts.length - 1];
  const hash = last.indexOf('#');
  if (hash >= 0) {
    const arr = (cur[last.slice(0, hash)] ??= []);
    const id = last.slice(hash + 1);
    const i = arr.findIndex(x => x?.id === id);
    if (value === null) { if (i >= 0) arr.splice(i, 1); }
    else if (i >= 0) arr[i] = structuredClone(value);
    else arr.push(structuredClone(value));
  } else {
    cur[/^\d+$/.test(last) ? Number(last) : last] = structuredClone(value);
  }
}

export function applyVariant(house, group, key) {
  const g = house.variants?.[group];
  const opt = g?.options?.[key];
  if (!opt) return false;
  for (const [path, value] of Object.entries(opt.set ?? {})) setPath(house, path, value);
  g.active = key;
  return true;
}

// Точки маршрута экскурсии с полем variant: "группа:ключ" берутся только при активном варианте.
export function tourPoints(house) {
  return (house.tour ?? []).filter(p => {
    if (!p.variant) return true;
    const [group, key] = p.variant.split(':');
    return house.variants?.[group]?.active === key;
  });
}
