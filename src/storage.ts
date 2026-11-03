import type { Job } from './types';
import { getLessons, importLessons } from './assistantMemory';
const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('pbc-estimator-v1', 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('jobs')) db.createObjectStore('jobs', { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function allJobs(): Promise<Job[]> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db.transaction('jobs', 'readonly').objectStore('jobs').getAll();
    request.onsuccess = () => resolve((request.result as Job[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(request.error);
  });
}
export async function saveJob(job: Job): Promise<void> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('jobs', 'readwrite');
    transaction.objectStore('jobs').put({ ...job, updatedAt: new Date().toISOString() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function removeJob(id: string): Promise<void> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('jobs', 'readwrite');
    transaction.objectStore('jobs').delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function exportJobs() {
  const jobs = await allJobs();
  const assistantLessons = await getLessons();
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), version: 2, jobs, assistantLessons }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'pbc-estimates-backup-' + new Date().toISOString().slice(0, 10) + '.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importJobs(file: File) {
  const parsed: unknown = JSON.parse(await file.text());
  if (!parsed || typeof parsed !== 'object' || !('jobs' in parsed) || !Array.isArray(parsed.jobs)) throw new Error('Not a PBC estimates backup');
  let count = 0;
  for (const job of parsed.jobs) {
    if (job && typeof job.id === 'string' && Array.isArray(job.items) && Array.isArray(job.photos)) { await saveJob(job as Job); count++; }
  }
  if ('assistantLessons' in parsed) await importLessons(parsed.assistantLessons);
  return count;
}