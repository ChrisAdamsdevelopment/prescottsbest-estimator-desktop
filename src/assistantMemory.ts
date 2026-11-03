export type LessonCategory = 'all' | 'concierge' | 'remodel';
export interface AssistantLesson {
  id: string;
  category: LessonCategory;
  note: string;
  createdAt: string;
  source: 'operator' | 'feedback';
}
const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open('pbc-ai-lessons-v1', 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains('lessons')) req.result.createObjectStore('lessons', { keyPath: 'id' });
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
export async function getLessons(): Promise<AssistantLesson[]> {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const req = db.transaction('lessons', 'readonly').objectStore('lessons').getAll();
    req.onsuccess = () => resolve((req.result as AssistantLesson[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    req.onerror = () => reject(req.error);
  });
}
export async function storeLesson(category: LessonCategory, note: string, source: AssistantLesson['source'] = 'operator') {
  const normalized = note.trim().slice(0, 450);
  if (normalized.length < 4) throw new Error('Write at least four characters.');
  const db = await dbPromise;
  const lesson: AssistantLesson = { id: crypto.randomUUID(), category, note: normalized, source, createdAt: new Date().toISOString() };
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('lessons', 'readwrite');
    tx.objectStore('lessons').put(lesson);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function deleteLesson(id: string) {
  const db = await dbPromise;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('lessons', 'readwrite');
    tx.objectStore('lessons').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export function relevantLessons(items: AssistantLesson[], mode: LessonCategory, text: string): AssistantLesson[] {
  const words = new Set(text.toLowerCase().match(/[a-z]{4,}/g) || []);
  return items.filter(item => item.category === 'all' || item.category === mode)
    .map(item => ({ item, score: (item.category === 'all' ? 2 : 3) +
      (item.note.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => words.has(w)).length }))
    .sort((a, b) => b.score - a.score || b.item.createdAt.localeCompare(a.item.createdAt))
    .slice(0, 8).map(x => x.item);
}

export async function importLessons(records: unknown): Promise<number> {
  if (!Array.isArray(records)) return 0;
  const valid = records.slice(0, 1000).filter(x => x && typeof x.id === 'string' &&
    typeof x.note === 'string' && x.note.length >= 4 && x.note.length <= 450 &&
    ['all', 'concierge', 'remodel'].includes(x.category) &&
    typeof x.createdAt === 'string' && Number.isFinite(Date.parse(x.createdAt)));
  const db = await dbPromise;
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction('lessons', 'readwrite');
    for (const row of valid) tx.objectStore('lessons').put({
      id: row.id, note: row.note, createdAt: row.createdAt, category: row.category,
      source: row.source === 'feedback' ? 'feedback' : 'operator'
    });
    tx.oncomplete = () => resolve(valid.length);
    tx.onerror = () => reject(tx.error);
  });
}
