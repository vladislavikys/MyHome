// Где хранится отредактированная модель.
// Внутри claude.ai — общий документ `models/current` (его видит и Claude),
// локально — localStorage этого браузера.

const LOCAL_KEY = 'myhome.house.v1';
const DOC_PATH = 'models/current';
const BACKUP_PATH = 'models/previous';

export async function openStore() {
  const db = window.claude?.use ? await window.claude.use('db').catch(() => null) : null;
  if (db) {
    const ref = db.doc(DOC_PATH);
    let readOnly = false;
    return {
      kind: 'shared',
      // → { house, base } или null; base — ревизия проекта, от которой сделаны правки
      async load() {
        const snap = await ref.get();
        if (!snap.exists) return null;
        const d = snap.data();
        return d.house ? { house: d.house, base: d.base ?? null } : null;
      },
      async backup(saved) {
        await db.doc(BACKUP_PATH).set({ house: JSON.parse(JSON.stringify(saved.house)), base: saved.base, savedAt: new Date().toISOString() });
      },
      async save(house, base) {
        if (readOnly) throw Object.assign(new Error('read-only'), { code: 'read_only' });
        try {
          await ref.set({ house: JSON.parse(JSON.stringify(house)), base: base ?? null, savedAt: new Date().toISOString() });
        } catch (e) {
          if (e?.code === 'invalid_argument') readOnly = true;
          throw e;
        }
      },
      async clear() { await ref.delete(); },
    };
  }
  return {
    kind: 'local',
    async load() {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        return d.house ? d : { house: d, base: null };   // старый формат — просто модель
      } catch { return null; }
    },
    async backup(saved) {
      try { localStorage.setItem(LOCAL_KEY + '.backup', JSON.stringify(saved)); } catch { /* хранилище недоступно */ }
    },
    async save(house, base) {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ house, base: base ?? null })); } catch { /* хранилище недоступно */ }
    },
    async clear() {
      try { localStorage.removeItem(LOCAL_KEY); } catch { /* хранилище недоступно */ }
    },
  };
}

// Любой файл: через capability downloads в claude.ai или обычной ссылкой локально.
export async function downloadFile(filename, blob) {
  const downloads = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (downloads) { await downloads.save({ filename, data: blob }); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Файл house.json: через capability downloads в claude.ai или обычной ссылкой локально.
export async function downloadJson(house) {
  const text = JSON.stringify(house, null, 2);
  const downloads = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (downloads) {
    await downloads.save({ filename: 'house.json', data: text });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = 'house.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
