import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

const EthvelleMedia = registerPlugin('EthvelleMedia');
const EthvelleStorage = registerPlugin('EthvelleStorage');
const native = Capacitor.isNativePlatform();
if (native) {
  const ROOT = 'ethvelle';
  const DB_NAMES = new Set([
    'ethvelle-device-project-storage-v1',
    'ethvelle-source-media-v1',
    'ethvelle-audio-device',
    'ethvelle-model-packages',
    'ethvelle-enhanced-media-v1'
  ]);
  const DB_STORES = {
    'ethvelle-device-project-storage-v1': ['snapshots'],
    'ethvelle-source-media-v1': ['assets'],
    'ethvelle-audio-device': ['files'],
    'ethvelle-model-packages': ['p'],
    'ethvelle-enhanced-media-v1': ['assets']
  };
  const $ = id => document.getElementById(id);
  const log = (...args) => console.warn('[Ethvelle native]', ...args);
  const enc = value => btoa(unescape(encodeURIComponent(String(value)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const safeId = value => String(value || 'item').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90) || 'item';
  const ensureDir = async path => {
    try { await Filesystem.mkdir({ path, directory: Directory.Data, recursive: true }); }
    catch (e) { if (!String(e?.message || e).toLowerCase().includes('exist')) throw e; }
  };
  const readText = async path => {
    try { const r = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 }); return r.data || ''; }
    catch (e) { if (/does not exist|not found|no such file/i.test(String(e?.message || e))) return null; throw e; }
  };
  const atomicWrite = async (path, text) => {
    const parent = path.split('/').slice(0, -1).join('/');
    if (parent) await ensureDir(parent);
    const temp = path + '.tmp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    await Filesystem.writeFile({ path: temp, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
    try { await EthvelleStorage.atomicReplace({ tempPath: temp, targetPath: path }); }
    catch (e) { try { await Filesystem.deleteFile({ path: temp, directory: Directory.Data }); } catch (_) {} throw e; }
  };
  const readJson = async (path, fallback) => {
    const raw = await readText(path);
    if (raw == null || raw === '') return fallback;
    try { return JSON.parse(raw); } catch (e) { throw new Error('Corrupt native storage file ' + path + ': ' + e.message); }
  };
  const removeFile = async path => {
    try { await Filesystem.deleteFile({ path, directory: Directory.Data }); }
    catch (e) { if (!/not found|does not exist/i.test(String(e?.message || e))) throw e; }
  };
  const listDir = async path => {
    try { return (await Filesystem.readdir({ path, directory: Directory.Data })).files || []; }
    catch (e) { if (/not found|does not exist/i.test(String(e?.message || e))) return []; throw e; }
  };
  const announceWriteFailure = err => {
    log('durable write failed', err);
    if (window.__ethvelleNativeStorageWriteFailed) window.__ethvelleNativeStorageWriteFailed(err);
  };
  const parseArray = key => {
    try { const raw = window.localStorage?.getItem(key) || window.__ethvelleNativeMemory?.[key] || '[]'; const v = JSON.parse(raw); return Array.isArray(v) ? v : []; }
    catch (e) { announceWriteFailure(new Error('Could not parse ' + key + ': ' + e.message)); return []; }
  };

  async function saveProjects() {
    const projects = parseArray('riggy.projects.v1');
    await ensureDir(ROOT + '/projects');
    const keep = new Set();
    for (const project of projects) {
      if (!project || project.id == null) continue;
      const id = safeId(project.id);
      keep.add(id + '.json');
      await atomicWrite(ROOT + '/projects/' + id + '.json', JSON.stringify(project));
    }
    const existing = await listDir(ROOT + '/projects');
    for (const file of existing) if (file.type === 'file' && file.name.endsWith('.json') && !keep.has(file.name)) await removeFile(ROOT + '/projects/' + file.name);
    await atomicWrite(ROOT + '/projects/index.json', JSON.stringify({ ids: Array.from(keep).map(v => v.slice(0, -5)), savedAt: Date.now() }));
  }
  async function saveModelAssets() {
    const models = parseArray('riggy.modelAssets.v1');
    await ensureDir(ROOT + '/model-assets');
    const keep = new Set();
    for (const model of models) {
      if (!model || model.id == null) continue;
      const id = safeId(model.id); keep.add(id + '.json');
      await atomicWrite(ROOT + '/model-assets/' + id + '.json', JSON.stringify(model));
    }
    for (const file of await listDir(ROOT + '/model-assets')) if (file.type === 'file' && file.name.endsWith('.json') && !keep.has(file.name)) await removeFile(ROOT + '/model-assets/' + file.name);
    await atomicWrite(ROOT + '/model-assets/index.json', JSON.stringify({ ids: Array.from(keep), savedAt: Date.now() }));
  }
  let flushQueue = Promise.resolve();
  window.__ethvelleNativeFlush = function () {
    flushQueue = flushQueue.catch(() => {}).then(async () => {
      await saveProjects();
      await saveModelAssets();
      window.__ethvelleNativeStorageError = '';
      const banner = $('ethvelle-native-storage-error'); if (banner) banner.remove();
      return true;
    }).catch(err => { announceWriteFailure(err); throw err; });
    return flushQueue;
  };
  window.__ethvelleDeviceSaveNow = window.__ethvelleNativeFlush;
  window.__ethvelleNativeStorageMode = 'Capacitor Filesystem (Directory.Data)';

  // File-backed compatibility layer for the five legacy IndexedDB database names.
  // It is installed before the legacy editor scripts run. Source media blobs are rejected:
  // only small metadata references may enter ethvelle-source-media-v1.
  const blobToDataUrl = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not serialize cached blob.'));
    reader.readAsDataURL(blob);
  });
  async function encodeValue(value, dbName, depth = 0) {
    if (depth > 40) throw new Error('IndexedDB value nesting is too deep.');
    if (value instanceof Blob) {
      if (dbName === 'ethvelle-source-media-v1') throw new Error('Native timeline originals must be linked, not copied.');
      if (value.size > 8 * 1024 * 1024) throw new Error('Large media blobs are not cached by the native adapter.');
      return { __evBlob: true, type: value.type || 'application/octet-stream', data: await blobToDataUrl(value) };
    }
    if (Array.isArray(value)) return Promise.all(value.map(v => encodeValue(v, dbName, depth + 1)));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [key, item] of Object.entries(value)) out[key] = await encodeValue(item, dbName, depth + 1);
      return out;
    }
    return value;
  }
  function decodeValue(value) {
    if (Array.isArray(value)) return value.map(decodeValue);
    if (value && typeof value === 'object') {
      if (value.__evBlob && typeof value.data === 'string') {
        const parts = value.data.split(',');
        const mime = value.type || parts[0].match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
        const binary = atob(parts[1] || ''); const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
      }
      const out = {}; for (const [key, item] of Object.entries(value)) out[key] = decodeValue(item); return out;
    }
    return value;
  }
  function fileFor(db, store, key) { return ROOT + '/idb/' + safeId(db) + '/' + safeId(store) + '/' + enc(key) + '.json'; }
  async function getAllRecords(db, store) {
    const folder = ROOT + '/idb/' + safeId(db) + '/' + safeId(store);
    const files = await listDir(folder), out = [];
    for (const f of files) if (f.type === 'file' && f.name.endsWith('.json')) {
      const row = await readJson(folder + '/' + f.name, null);
      if (row) out.push(row);
    }
    return out;
  }
  function makeRequest(operation, tx) {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    if (tx) tx.pending++;
    Promise.resolve().then(operation).then(value => {
      req.result = value;
      if (typeof req.onsuccess === 'function') req.onsuccess({ target: req });
    }).catch(error => {
      req.error = error; if (tx) tx.error = error;
      if (typeof req.onerror === 'function') req.onerror({ target: req });
      else log('file-backed IndexedDB request failed', error);
    }).finally(() => {
      if (tx) { tx.pending--; tx.checkComplete(); }
    });
    return req;
  }
  function fileDbOpen(name, version) {
    const request = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(async () => {
      try {
        const known = DB_STORES[name] || [];
        const stores = new Set(known);
        const db = {
          name, version: Number(version) || 1, objectStoreNames: {
            contains: value => stores.has(String(value)),
            item: index => Array.from(stores)[index] || null,
            get length() { return stores.size; }
          },
          createObjectStore: storeName => { stores.add(String(storeName)); return {}; },
          deleteObjectStore: storeName => stores.delete(String(storeName)),
          close: () => {},
          transaction: (storeName, mode) => {
            const tx = { mode: mode || 'readonly', pending: 0, error: null, oncomplete: null, onerror: null, onabort: null, completeTimer: 0 };
            tx.checkComplete = () => {
              if (tx.pending === 0) {
                clearTimeout(tx.completeTimer);
                tx.completeTimer = setTimeout(() => {
                  if (tx.error) { if (typeof tx.onerror === 'function') tx.onerror({ target: tx }); }
                  else if (typeof tx.oncomplete === 'function') tx.oncomplete({ target: tx });
                }, 0);
              }
            };
            tx.objectStore = store => {
              if (!stores.has(String(store))) throw new Error('Unknown native file store: ' + store);
              const base = ROOT + '/idb/' + safeId(name) + '/' + safeId(store);
              const writable = tx.mode === 'readwrite' || tx.mode === 'versionchange';
              return {
                put: (value, key) => makeRequest(async () => {
                  if (!writable) throw new Error('IndexedDB transaction is readonly.');
                  const actualKey = key != null ? key : (value && value.key != null ? value.key : value && value.id);
                  if (actualKey == null) throw new Error('A key is required for the native file store.');
                  if (name === 'ethvelle-source-media-v1' && value && value.blob) throw new Error('Timeline source media is URI-linked on Android; byte copies are disabled.');
                  if (name === 'ethvelle-device-project-storage-v1') return actualKey; // projects are stored one JSON file per project, never as a duplicate aggregate snapshot\n                  const encoded = await encodeValue(value, name);
                  await atomicWrite(fileFor(name, store, actualKey), JSON.stringify({ key: actualKey, value: encoded }));
                  return actualKey;
                }, tx),
                get: key => makeRequest(async () => { const row = await readJson(fileFor(name, store, key), null); return row ? decodeValue(row.value) : undefined; }, tx),
                delete: key => makeRequest(async () => { if (!writable) throw new Error('IndexedDB transaction is readonly.'); await removeFile(fileFor(name, store, key)); }, tx),
                clear: () => makeRequest(async () => { if (!writable) throw new Error('IndexedDB transaction is readonly.'); for (const f of await listDir(base)) if (f.type === 'file') await removeFile(base + '/' + f.name); }, tx),
                getAll: () => makeRequest(async () => (await getAllRecords(name, store)).map(row => decodeValue(row.value)), tx),
                count: () => makeRequest(async () => (await getAllRecords(name, store)).length, tx),
                openCursor: () => {
                  const req = { result: null, error: null, onsuccess: null, onerror: null };
                  let rows = null, index = 0;
                  const emit = () => {
                    const row = rows && rows[index];
                    req.result = row ? { key: row.key, primaryKey: row.key, value: decodeValue(row.value), continue: () => { index++; setTimeout(emit, 0); } } : null;
                    if (typeof req.onsuccess === 'function') req.onsuccess({ target: req });
                  };
                  makeRequest(async () => { rows = await getAllRecords(name, store); setTimeout(emit, 0); }, tx);
                  return req;
                }
              };
            };
            setTimeout(tx.checkComplete, 0);
            return tx;
          }
        };
        request.result = db;
        const oldVersion = 0;
        if (typeof request.onupgradeneeded === 'function') request.onupgradeneeded({ target: request, oldVersion, newVersion: db.version });
        if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
      } catch (error) {
        request.error = error; if (typeof request.onerror === 'function') request.onerror({ target: request }); else log('IndexedDB open failed', error);
      }
    }, 0);
    return request;
  }
  try {
    const nativeIndexedDB = window.indexedDB;
    window.indexedDB = new Proxy(nativeIndexedDB, {
      get(target, prop) {
        if (prop === 'open') return function (name, version) { return DB_NAMES.has(String(name)) ? fileDbOpen(String(name), version) : target.open.apply(target, arguments); };
        return Reflect.get(target, prop, target);
      }
    });
  } catch (e) { log('File-backed IndexedDB bridge could not be installed', e); }

  const linked = item => item && (item.nativeMediaRef?.uri || item.mediaRef?.uri || item.uri);
  const allProjectMedia = () => {
    const out = [];
    const projects = parseArray('riggy.projects.v1');
    for (const p of projects) {
      const state = p?.savedState || {};
      for (const item of [...(state.overlays || []), ...(state.backgrounds || [])]) if (item && (item.nativeMediaRef || item.deviceMediaKey)) out.push(item);
    }
    return out;
  };
  const toast = message => {
    try {
      if (typeof window.showToast === 'function') window.showToast(message, { duration: 3500 });
      else console.info('[Ethvelle]', message);
    } catch (_) { alert(message); }
  };
  let currentExportUri = null;
  async function persistExport(blob, filename) {
    let session = null;
    try {
      await EthvelleMedia.setKeepAwake({ enabled: true });
      session = await EthvelleMedia.startExport({ filename: filename || 'Ethvelle-v399.mp4', mime: blob.type || 'video/mp4' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const chunkSize = 384 * 1024;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
        let binary = '';
        for (let i = 0; i < chunk.length; i++) binary += String.fromCharCode(chunk[i]);
        await EthvelleMedia.appendExportChunk({ id: session.id, base64: btoa(binary) });
      }
      const saved = await EthvelleMedia.finishExport({ id: session.id });
      currentExportUri = saved.uri;
      const share = $('ethvelle-share-export'); if (share) share.hidden = false;
      toast('Export saved to Movies/Ethvelle.');
      return saved;
    } catch (e) { toast('Export could not be saved: ' + (e?.message || e)); throw e; }
    finally { try { await EthvelleMedia.setKeepAwake({ enabled: false }); } catch (_) {} }
  }
  window.__ethvelleSaveExport = persistExport;
  window.__capExportBegin = function () { EthvelleMedia.setKeepAwake({ enabled: true }).catch(log); };
  window.__capExportDone = function (info) {
    if (info?.blob) return persistExport(info.blob, info.filename || 'Ethvelle-v399.mp4');
    return Promise.resolve();
  };
  document.addEventListener('click', async event => {
    const a = event.target?.closest?.('a[download]');
    if (!a || !a.href || !a.href.startsWith('blob:') || a.dataset.evNativeSaved) return;
    event.preventDefault(); event.stopImmediatePropagation();
    a.dataset.evNativeSaved = '1';
    try { await persistExport(await (await fetch(a.href)).blob(), a.download || 'Ethvelle-export.mp4'); }
    catch (e) { log('export download interception failed', e); }
  }, true);
  document.addEventListener('click', event => {
    const node = event.target?.closest?.('button,[role=button]');
    if (node && /export/i.test((node.id || '') + ' ' + (node.textContent || ''))) {
      EthvelleMedia.setKeepAwake({ enabled: true }).catch(log);
    }
  }, true);

  async function pickOne() {
    const response = await EthvelleMedia.pickMedia({ multiple: false, types: ['image', 'video', 'audio'] });
    const file = response?.files?.[0];
    if (!file) return null;
    return { id: file.id, uri: file.uri, name: file.name, mime: file.mime, size: Number(file.size) || 0, lastModified: Number(file.lastModified) || 0,
      url: 'https://localhost/_media/' + encodeURIComponent(file.id) };
  }
  const kindOf = mime => String(mime || '').startsWith('video/') ? 'video' : String(mime || '').startsWith('audio/') ? 'audio' : String(mime || '').startsWith('image/') ? 'image' : '';
  async function mediaInfo(kind, url) {
    if (kind === 'image') return { duration: 5, width: 0, height: 0, peaks: [] };
    const el = document.createElement(kind);
    el.preload = 'metadata'; el.src = url;
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out reading media metadata.')), 15000);
        el.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
        el.onerror = () => { clearTimeout(timeout); reject(new Error('Media file could not be opened.')); };
      });
      return { duration: Math.max(0.1, Number(el.duration) || (kind === 'audio' ? 3 : 12)), width: el.videoWidth || 0, height: el.videoHeight || 0, peaks: [] };
    } finally { el.removeAttribute('src'); try { el.load(); } catch (_) {} }
  }
  async function relinkClip(clip, kindHint) {
    const file = await pickOne(); if (!file) return;
    const kind = kindOf(file.mime); if (!kind || (kindHint && kindHint !== kind)) throw new Error('Choose a matching ' + (kindHint || 'media') + ' file.');
    const info = await mediaInfo(kind, file.url);
    clip.type = kind; clip.src = file.url;
    clip.nativeMediaRef = { uri: file.uri, name: file.name, mime: file.mime, size: file.size, lastModified: file.lastModified };
    clip.deviceMediaKey = file.id; clip.deviceMediaName = file.name;
    if (info.duration) clip.sourceDuration = info.duration;
    if (info.width) clip.sourceWidth = info.width;
    if (info.height) clip.sourceHeight = info.height;
    delete clip.nativeMediaMissing;
    await window.__ethvelleNativeFlush();
    if (typeof window.renderOverlayLayers === 'function') window.renderOverlayLayers();
    if (typeof window.renderOverlayListPanel === 'function') window.renderOverlayListPanel();
    if (typeof window.renderFrame === 'function') window.renderFrame();
    return file;
  }
  window.__ethvelleRelinkClip = async id => {
    const clip = [...(window.overlays || []), ...(window.backgrounds || [])].find(v => String(v.id) === String(id));
    if (!clip) return;
    try { await relinkClip(clip); } catch (e) { toast('Relink failed: ' + e.message); }
  };
  async function addNativeMedia(target, appendAfterGroup) {
    const file = await pickOne(); if (!file) return;
    const kind = kindOf(file.mime);
    if (!kind) throw new Error('Choose an image, video, or audio file.');
    if (target === 'audio' && kind !== 'audio') throw new Error('Choose an audio file.');
    if (target === 'background' && kind === 'audio') throw new Error('Audio cannot be used as a background.');
    if ((target === 'overlay' || target === 'media' || target === 'replace-overlay') && kind === 'audio' && target !== 'replace-overlay') throw new Error('Use the Audio tool to add audio clips.');
    const info = await mediaInfo(kind, file.url);
    const ref = { uri: file.uri, name: file.name, mime: file.mime, size: file.size, lastModified: file.lastModified };
    if (target === 'replace-overlay') {
      const id = (typeof replaceTargetId !== 'undefined') ? replaceTargetId : window.replaceTargetId;
      const clip = (window.overlays || []).find(v => String(v.id) === String(id));
      if (!clip) throw new Error('Selected clip no longer exists.');
      clip.type = kind; clip.src = file.url; clip.nativeMediaRef = ref; clip.deviceMediaKey = file.id;
      clip.deviceMediaName = file.name; clip.deviceMediaSize = file.size; clip.deviceMediaLastModified = file.lastModified;
      clip.sourceDuration = info.duration; clip.sourceWidth = info.width; clip.sourceHeight = info.height; delete clip.nativeMediaMissing;
    } else if (target === 'replace-background') {
      const id = (typeof replaceTargetId !== 'undefined') ? replaceTargetId : window.replaceTargetId;
      const clip = (window.backgrounds || []).find(v => String(v.id) === String(id));
      if (!clip) throw new Error('Selected background no longer exists.');
      clip.src = file.url; clip.nativeMediaRef = ref; clip.deviceMediaKey = file.id; clip.deviceMediaName = file.name; delete clip.nativeMediaMissing;
    } else if (target === 'background') {
      if (typeof window.addBackgroundClip !== 'function') throw new Error('Background timeline is not ready.');
      window.addBackgroundClip(file.url);
      const clip = (window.backgrounds || []).slice(-1)[0];
      if (clip) { clip.nativeMediaRef = ref; clip.deviceMediaKey = file.id; clip.deviceMediaName = file.name; }
    } else {
      if (typeof window.addMediaOverlay !== 'function') throw new Error('Timeline is not ready.');
      window.addMediaOverlay({ type: kind, src: file.url, name: file.name, duration: info.duration, sourceDuration: info.duration,
        sourceWidth: info.width, sourceHeight: info.height, thumbs: [], peaks: info.peaks || [], appendAfterGroup: appendAfterGroup || null,
        deviceMediaKey: file.id, deviceMediaInfo: ref, nativeMediaRef: ref });
      const clip = (window.overlays || []).slice(-1)[0];
      if (clip) clip.nativeMediaRef = ref;
    }
    try { if (typeof window.renderOverlayLayers === 'function') window.renderOverlayLayers(); } catch (_) {}
    try { if (typeof window.renderOverlayListPanel === 'function') window.renderOverlayListPanel(); } catch (_) {}
    try { if (typeof window.renderFrame === 'function') window.renderFrame(); } catch (_) {}
    try { if (typeof window.persistProjectState === 'function') window.persistProjectState(); } catch (_) {}
    try { if (typeof window.saveProjectsToStorage === 'function') window.saveProjectsToStorage(); } catch (_) {}
    await window.__ethvelleNativeFlush();
    toast('Linked to the original device file — no media copy was made.');
  }

  let wrappersInstalled = false;
  function installLateWrappers() {
    if (wrappersInstalled) return;
    wrappersInstalled = true;
    const oldTrigger = window.triggerUpload;
    window.triggerUpload = function (target, appendAfterGroup) {
      const t = String(target || '');
      if (['overlay', 'media', 'audio', 'replace-overlay', 'background', 'replace-background'].includes(t)) {
        try { uploadTarget = t; uploadAppendGroup = appendAfterGroup || null; } catch (_) {}
        addNativeMedia(t, appendAfterGroup).catch(e => toast('Could not add media: ' + (e?.message || e)));
        return;
      }
      return typeof oldTrigger === 'function' ? oldTrigger.apply(this, arguments) : undefined;
    };
    window.__ethvelleDeviceSaveNow = window.__ethvelleNativeFlush;
    const oldBegin = window.__capExportBegin;
    window.__capExportBegin = function () {
      EthvelleMedia.setKeepAwake({ enabled: true }).catch(log);
      if (typeof oldBegin === 'function') { try { oldBegin.apply(this, arguments); } catch (e) { log(e); } }
    };
    const oldGoogle = window.performGoogleSignIn;
    if (typeof oldGoogle === 'function' && !oldGoogle.__ethvelleNativeGoogle) {
      const google = async function () {
        try {
          if (typeof loginLegalConsentAcceptedOnce !== 'undefined' &&
              (!loginLegalConsentAcceptedOnce || (typeof requireLoginLegalConsent === 'function' && !requireLoginLegalConsent()))) return;
          try { loginLegalConsentAcceptedOnce = false; } catch (_) {}
          if ((typeof firebaseReady !== 'undefined' && !firebaseReady) || !window.fbAuth || !window.firebase) {
            if (typeof showLoginError === 'function') showLoginError('Firebase is not ready. Please try again.');
            return;
          }
          const button = $('googleSignInBtn'); if (button) button.disabled = true;
          const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true, useCredentialManager: true });
          const token = result?.credential || {};
          if (!token.idToken && !token.accessToken) throw new Error('Google returned no id/access token. Check Firebase Android setup.');
          const credential = firebase.auth.GoogleAuthProvider.credential(token.idToken || null, token.accessToken || null);
          const signed = await fbAuth.signInWithCredential(credential);
          try { if (typeof trackEvent === 'function') trackEvent(signed?.additionalUserInfo?.isNewUser ? 'user_signup' : 'user_login'); } catch (_) {}
        } catch (err) {
          log('native Google sign-in failed', err);
          toast('Google sign-in needs Firebase Android SHA-1/SHA-256 and google-services.json. ' + (err?.message || ''));
        } finally { const button = $('googleSignInBtn'); if (button) button.disabled = false; }
      };
      google.__ethvelleNativeGoogle = true;
      window.performGoogleSignIn = google;
    }
    window.__ethvelleHandleBack = function () {
      const backdrops = ['settingsSheetBackdrop', 'projectMenuBackdrop', 'ethvelleStoragePermission'];
      for (const id of backdrops) {
        const el = $(id); if (el && el.classList.contains('active')) { el.classList.remove('active'); return true; }
      }
      const editor = $('screen-editor');
      if (editor && editor.classList.contains('active') && typeof window.exitEditor === 'function') { window.exitEditor(); return true; }
      if (typeof window.closePanel === 'function') { try { window.closePanel(); return true; } catch (_) {} }
      return false;
    };
  }

  async function backupData() {
    await window.__ethvelleNativeFlush();
    const payload = { format: 'ethvelle-backup', version: 1, createdAt: new Date().toISOString(),
      projects: parseArray('riggy.projects.v1'), modelAssets: parseArray('riggy.modelAssets.v1') };
    return JSON.stringify(payload);
  }
  function sanitizeForNative(projects) {
    return (Array.isArray(projects) ? projects : []).map(project => {
      const p = JSON.parse(JSON.stringify(project));
      const state = p.savedState || {};
      for (const clip of [...(state.overlays || []), ...(state.backgrounds || [])]) {
        if (!clip || typeof clip.src !== 'string') continue;
        if (/^(blob:|data:)/i.test(clip.src) || clip.src.includes('ethvelle-device-media://')) {
          clip.nativeMediaMissing = true;
          clip.nativeMediaRef = null;
          clip.src = '';
        }
      }
      return p;
    });
  }
  async function restorePayload(payload) {
    if (!payload || payload.format !== 'ethvelle-backup') throw new Error('This is not an Ethvelle backup file.');
    const projects = sanitizeForNative(payload.projects || []);
    window.localStorage.setItem('riggy.projects.v1', JSON.stringify(projects));
    window.localStorage.setItem('riggy.modelAssets.v1', JSON.stringify(payload.modelAssets || []));
    await window.__ethvelleNativeFlush();
    if (typeof window.renderProjects === 'function') window.renderProjects();
    if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
    toast('Backup restored. Timeline clips from browser storage may need Relink.');
  }
  window.__ethvelleNativeBackup = backupData;
  window.__ethvelleNativeRestore = restorePayload;

  function linkedCount() { return allProjectMedia().length; }
  async function testAllLinks() {
    const result = await EthvelleMedia.testMediaLinks();
    return result;
  }
  function showDiagnostics() {
    const projects = parseArray('riggy.projects.v1');
    const links = allProjectMedia();
    const old = $('ethvelle-diagnostics');
    if (old) old.remove();
    const modal = document.createElement('div'); modal.id = 'ethvelle-diagnostics';
    modal.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#080b12ed;display:grid;place-items:center;padding:18px;color:#f5f7fc;font:14px system-ui';
    modal.innerHTML = '<section style="width:min(520px,100%);background:#141a26;border:1px solid #3757b5;border-radius:18px;padding:20px;max-height:85vh;overflow:auto"><header style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:18px">Diagnostics</b><button id="evdiag-close" style="background:#29334b;color:white;border:0;border-radius:9px;padding:8px 12px">Close</button></header><p>Storage mode: <b>Capacitor Filesystem · Directory.Data</b></p><p>Saved projects: <b>' + projects.length + '</b></p><p>Linked media items: <b>' + links.length + '</b></p><button id="evdiag-test" style="background:#2F5CE8;color:white;border:0;border-radius:10px;padding:12px;width:100%">Test all media links</button><pre id="evdiag-results" style="white-space:pre-wrap;color:#dbe5ff"></pre></section>';
    document.body.appendChild(modal);
    $('evdiag-close').onclick = () => modal.remove();
    $('evdiag-test').onclick = async () => {
      $('evdiag-results').textContent = 'Checking persisted file permissions…';
      try { const r = await testAllLinks(); $('evdiag-results').textContent = JSON.stringify(r, null, 2); }
      catch (e) { $('evdiag-results').textContent = 'Test failed: ' + e.message; }
    };
  }
  window.__ethvelleShowDiagnostics = showDiagnostics;

  async function makeWebBackup() {
    const payload = { format: 'ethvelle-backup', version: 1, createdAt: new Date().toISOString(),
      projects: parseArray('riggy.projects.v1'), modelAssets: parseArray('riggy.modelAssets.v1') };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'Ethvelle-Backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function restoreWebBackup(file) {
    const payload = JSON.parse(await file.text());
    if (payload.format !== 'ethvelle-backup') throw new Error('This is not an Ethvelle backup file.');
    window.localStorage.setItem('riggy.projects.v1', JSON.stringify(payload.projects || []));
    window.localStorage.setItem('riggy.modelAssets.v1', JSON.stringify(payload.modelAssets || []));
    if (typeof window.renderProjects === 'function') window.renderProjects();
    if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
    toast('Backup restored.');
  }
  function installBackupControls() {
    if ($('ethvelle-backup-tools')) return;
    const host = $('screen-home') || document.body;
    const bar = document.createElement('div'); bar.id = 'ethvelle-backup-tools';
    bar.style.cssText = 'position:fixed;z-index:100000;right:10px;bottom:calc(14px + env(safe-area-inset-bottom));display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:94vw';
    bar.innerHTML = '<button id="ethvelle-backup" type="button" style="background:#24385f;border:1px solid #4772d5;color:#fff;border-radius:10px;padding:9px 11px;font:600 12px system-ui">Backup</button><button id="ethvelle-restore" type="button" style="background:#24385f;border:1px solid #4772d5;color:#fff;border-radius:10px;padding:9px 11px;font:600 12px system-ui">Restore</button><button id="ethvelle-share-export" type="button" hidden style="background:#2F5CE8;border:0;color:#fff;border-radius:10px;padding:9px 11px;font:600 12px system-ui">Share export</button><input id="ethvelle-restore-file" type="file" accept="application/json,.json" hidden>';
    host.appendChild(bar);
    $('ethvelle-backup').onclick = async () => {
      try {
        if (native) await EthvelleMedia.saveBackup({ filename: 'Ethvelle-Backup.json', content: await backupData() });
        else await makeWebBackup();
        toast('Backup exported.');
      } catch (e) { toast('Backup failed: ' + e.message); }
    };
    $('ethvelle-restore').onclick = async () => {
      try {
        if (native) { const r = await EthvelleMedia.restoreBackup(); if (r?.content) await restorePayload(JSON.parse(r.content)); }
        else $('ethvelle-restore-file').click();
      } catch (e) { toast('Restore failed: ' + e.message); }
    };
    $('ethvelle-restore-file').onchange = async e => { const file = e.target.files?.[0]; if (file) try { await restoreWebBackup(file); } catch (err) { toast('Restore failed: ' + err.message); } finally { e.target.value = ''; } };
    $('ethvelle-share-export').onclick = async () => { if (currentExportUri) try { await EthvelleMedia.shareExport({ uri: currentExportUri }); } catch (e) { toast('Share failed: ' + e.message); } };
  }
  function setupMissingMediaRelink() {
    const showButton = (wrapper, id) => {
      if (!wrapper || !id || wrapper.querySelector('.ev-native-relink')) return;
      const button = document.createElement('button'); button.className = 'ev-native-relink'; button.type = 'button';
      button.textContent = 'Media missing — Relink';
      button.style.cssText = 'position:absolute;z-index:2147480;left:8px;bottom:8px;background:#8d2938;color:white;border:1px solid #ffb7c0;border-radius:9px;padding:8px 10px;font:600 12px system-ui';
      button.onclick = () => window.__ethvelleRelinkClip(id);
      wrapper.style.position = wrapper.style.position || 'relative'; wrapper.appendChild(button);
    };
    const mark = el => {
      const wrapper = el?.closest?.('.overlay-media-item,[data-overlay-id]');
      const id = wrapper?.getAttribute('data-overlay-id') || wrapper?.getAttribute('data-id');
      showButton(wrapper, id);
    };
    const scan = () => {
      document.querySelectorAll('.overlay-media-item,[data-overlay-id]').forEach(wrapper => {
        const id = wrapper.getAttribute('data-overlay-id') || wrapper.getAttribute('data-id');
        if (!id) return;
        const clip = [...getOverlays(), ...getBackgrounds()].find(item => String(item.id) === String(id));
        if (clip && (clip.nativeMediaMissing || (!clip.src && (clip.deviceMediaKey || clip.nativeMediaRef)))) showButton(wrapper, id);
      });
    };
    document.addEventListener('error', e => { if (e.target && /^(VIDEO|IMG|AUDIO)$/.test(e.target.tagName)) mark(e.target); }, true);
    document.addEventListener('loadeddata', e => { const w=e.target?.closest?.('.overlay-media-item'); w?.querySelector('.ev-native-relink')?.remove(); }, true);
    try { new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
    setInterval(scan, 1600);
    scan();
  }
  function installDiagnosticsGesture() {
    let count = 0, timer = 0;
    document.addEventListener('click', event => {
      if (!event.target?.closest?.('.home-brand-logo-only')) return;
      count++; clearTimeout(timer); timer = setTimeout(() => count = 0, 1600);
      if (count >= 5) { count = 0; showDiagnostics(); }
    }, true);
  }
  function suppressBrowserQuotaWarnings() {
    const scan = () => {
      document.querySelectorAll('[role=alert],.toast,.toast-message,.ev-toast').forEach(el => {
        const t = String(el.textContent || '').toLowerCase();
        if ((t.includes('storage full') || t.includes('quota') || t.includes('smaller background')) && el.id !== 'ethvelle-native-storage-error') el.remove();
      });
    };
    try { new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, characterData: true }); } catch (_) {}
    scan();
  }
  window.addEventListener('pagehide', () => { window.__ethvelleNativeFlush().catch(announceWriteFailure); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') window.__ethvelleNativeFlush().catch(announceWriteFailure); });
  document.addEventListener('DOMContentLoaded', () => {
    installLateWrappers();
    installBackupControls(); installDiagnosticsGesture(); setupMissingMediaRelink(); suppressBrowserQuotaWarnings();
  }, { once: true });
  if (document.readyState !== 'loading') {
    installLateWrappers(); installBackupControls(); installDiagnosticsGesture(); setupMissingMediaRelink(); suppressBrowserQuotaWarnings();
  }
}
