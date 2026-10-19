/* 저장 — 무한 모드라 이게 제일 중요하다.
 *
 * 1) IndexedDB 에 쓴다 (용량이 넉넉하다).
 * 2) 같은 내용을 localStorage 에도 한 벌 더 쓴다 (한쪽이 깨지거나 비어도 다른 쪽에서 살린다).
 *    불러올 때는 둘 중 savedAt 이 더 최근인 것을 쓴다.
 * 3) navigator.storage.persist() 로 "지우지 말아 달라"고 요청한다.
 * 4) 백업 파일로 내보내기 / 불러오기 — 앱을 지우거나 폰을 바꿔도 이어서 할 수 있게.
 */
(function (root) {
  'use strict';
  const DB_NAME = 'infinite-mines';
  const STORE = 'kv';
  const LS_PREFIX = 'im:';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!('indexedDB' in root)) return resolve(null);
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  async function idbGet(k) {
    const db = await openDB();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(k);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(undefined);
      } catch (e) { dbPromise = null; resolve(undefined); }
    });
  }

  async function idbPut(k, v) {
    const db = await openDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(v, k);
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => resolve(false);
      } catch (e) { dbPromise = null; resolve(false); }
    });
  }

  async function idbDelete(k) {
    const db = await openDB();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(k);
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch (e) { resolve(); }
    });
  }

  function lsGet(k) {
    try { const s = localStorage.getItem(LS_PREFIX + k); return s ? JSON.parse(s) : undefined; }
    catch (e) { return undefined; }
  }
  function lsPut(k, v) {
    try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); return true; }
    catch (e) { return false; }   // 용량 초과 등 — IndexedDB 쪽이 주 저장소다
  }
  function lsDelete(k) { try { localStorage.removeItem(LS_PREFIX + k); } catch (e) {} }

  const stamp = (v) => (v && typeof v === 'object' && +v.savedAt) || 0;

  const Storage = {
    lastSavedAt: 0,
    lastError: null,

    async load(k) {
      const [a, b] = [await idbGet(k), lsGet(k)];
      if (a === undefined) return b;
      if (b === undefined) return a;
      return stamp(b) > stamp(a) ? b : a;
    },

    /** 두 군데에 쓴다. 하나라도 성공하면 저장된 것으로 친다. */
    async save(k, v) {
      if (v && typeof v === 'object') v.savedAt = Date.now();
      const okLS = lsPut(k, v);
      const okDB = await idbPut(k, v);
      if (okLS || okDB) {
        this.lastSavedAt = Date.now();
        this.lastError = null;
        return true;
      }
      this.lastError = '저장 공간에 쓰지 못했어요';
      return false;
    },

    /** 페이지가 닫히는 순간처럼 기다릴 틈이 없을 때: localStorage 에만 즉시 쓴다 */
    saveNow(k, v) {
      if (v && typeof v === 'object') v.savedAt = Date.now();
      if (lsPut(k, v)) this.lastSavedAt = Date.now();
      idbPut(k, v);   // 끝까지 갈 수도, 못 갈 수도 있다
    },

    async remove(k) { lsDelete(k); await idbDelete(k); },

    async requestPersist() {
      try {
        if (navigator.storage && navigator.storage.persist) {
          if (await navigator.storage.persisted()) return true;
          return await navigator.storage.persist();
        }
      } catch (e) {}
      return false;
    },

    async isPersisted() {
      try { return !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); }
      catch (e) { return false; }
    },

    /** 모든 기록을 하나의 백업 꾸러미로 */
    async exportAll(worldIds) {
      const data = { app: 'infinite-mines', v: 1, exportedAt: new Date().toISOString(), profile: await this.load('profile'), worlds: {} };
      for (const id of worldIds) {
        const w = await this.load('world:' + id);
        if (w) data.worlds[id] = w;
      }
      return data;
    },

    validateBackup(data) {
      if (!data || data.app !== 'infinite-mines' || data.v !== 1) return '이 게임의 백업 파일이 아니에요';
      if (data.profile && typeof data.profile !== 'object') return '백업 파일이 손상됐어요';
      if (data.worlds && typeof data.worlds !== 'object') return '백업 파일이 손상됐어요';
      for (const w of Object.values(data.worlds || {})) {
        if (!w || w.v !== 1 || typeof w.seed !== 'number') return '백업 파일이 손상됐어요';
      }
      return null;
    },

    async importAll(data) {
      const err = this.validateBackup(data);
      if (err) throw new Error(err);
      if (data.profile) { const p = data.profile; delete p.savedAt; await this.save('profile', p); }
      for (const [id, w] of Object.entries(data.worlds || {})) {
        delete w.savedAt;
        await this.save('world:' + id, w);
      }
    },
  };

  root.Storage = Storage;
})(typeof window !== 'undefined' ? window : globalThis);
