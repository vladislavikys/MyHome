// Где хранится отредактированная модель.
// Внутри claude.ai — общий документ `models/current` (его видит и Claude),
// локально — localStorage этого браузера.

const LOCAL_KEY = 'myhome.house.v1';
const DOC_PATH = 'models/current';

export async function openStore() {
  const db = window.claude?.use ? await window.claude.use('db').catch(() => null) : null;
  if (db) {
    const ref = db.doc(DOC_PATH);
    let readOnly = false;
    return {
      kind: 'shared',
      async load() {
        const snap = await ref.get();
        return snap.exists ? snap.data().house ?? null : null;
      },
      async save(house) {
        if (readOnly) throw Object.assign(new Error('read-only'), { code: 'read_only' });
        try {
          await ref.set({ house: JSON.parse(JSON.stringify(house)), savedAt: new Date().toISOString() });
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
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },
    async save(house) {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(house)); } catch { /* хранилище недоступно */ }
    },
    async clear() {
      try { localStorage.removeItem(LOCAL_KEY); } catch { /* хранилище недоступно */ }
    },
  };
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
