(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;

  var heavyKeys = new Set(['riggy.projects.v1', 'riggy.modelAssets.v1']);
  var original;
  try { original = window.localStorage; } catch (_) { return; }
  var memory = Object.create(null);
  var boot = { values: {}, storageMode: 'capacitor-filesystem' };
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://localhost/_ethvelle/bootstrap', false);
    xhr.send(null);
    if (xhr.status === 200) boot = JSON.parse(xhr.responseText || '{}');
    else throw new Error('Native storage bootstrap failed (HTTP ' + xhr.status + ').');
  } catch (err) {
    console.error('Ethvelle native storage bootstrap:', err);
    window.__ethvelleNativeStorageBootError = String(err && err.message || err);
  }
  if (boot.values && typeof boot.values === 'object') {
    Object.keys(boot.values).forEach(function (key) {
      if (heavyKeys.has(key) && typeof boot.values[key] === 'string') memory[key] = boot.values[key];
    });
  }
  if (typeof memory['riggy.projects.v1'] !== 'string') memory['riggy.projects.v1'] = '[]';
  if (typeof memory['riggy.modelAssets.v1'] !== 'string') memory['riggy.modelAssets.v1'] = '[]';

  var flushTimer = 0;
  function scheduleFlush() {
    if (window.__ethvelleNativeStorageBootError) { reportFailure(new Error(window.__ethvelleNativeStorageBootError)); return; }
    clearTimeout(flushTimer);
    flushTimer = setTimeout(function () {
      flushTimer = 0;
      if (typeof window.__ethvelleNativeFlush === 'function') {
        window.__ethvelleNativeFlush().catch(reportFailure);
      }
    }, 450);
  }
  function reportFailure(err) {
    console.error('Ethvelle native storage write failed:', err);
    window.__ethvelleNativeStorageError = String(err && err.message || err);
    try {
      var id = 'ethvelle-native-storage-error';
      var node = document.getElementById(id);
      if (!node) {
        node = document.createElement('div'); node.id = id;
        node.style.cssText = 'position:fixed;z-index:2147483647;left:10px;right:10px;bottom:12px;padding:12px 14px;border-radius:10px;background:#8c1d2c;color:#fff;font:600 13px/1.4 system-ui;box-shadow:0 4px 18px #0008';
        (document.body || document.documentElement).appendChild(node);
      }
      node.textContent = 'Ethvelle could not save your latest changes. Keep the app open and export a backup. Details: ' + window.__ethvelleNativeStorageError;
    } catch (_) {}
  }
  window.__ethvelleNativeStorageWriteFailed = reportFailure;

  var adapter = {
    getItem: function (key) { key = String(key); return heavyKeys.has(key) ? (Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null) : original.getItem(key); },
    setItem: function (key, value) {
      key = String(key); value = String(value);
      if (!heavyKeys.has(key)) return original.setItem(key, value);
      memory[key] = value; scheduleFlush();
    },
    removeItem: function (key) {
      key = String(key);
      if (!heavyKeys.has(key)) return original.removeItem(key);
      delete memory[key]; scheduleFlush();
    },
    key: function (index) {
      var keys = [];
      try { for (var i = 0; i < original.length; i++) { var k = original.key(i); if (!heavyKeys.has(k)) keys.push(k); } } catch (_) {}
      Array.from(heavyKeys).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(memory, k)) keys.push(k); });
      return keys[index] == null ? null : keys[index];
    },
    get length() {
      var n = 0;
      try { for (var i = 0; i < original.length; i++) if (!heavyKeys.has(original.key(i))) n++; } catch (_) {}
      return n + Array.from(heavyKeys).filter(function (k) { return Object.prototype.hasOwnProperty.call(memory, k); }).length;
    },
    clear: function () {
      original.clear();
      heavyKeys.forEach(function (k) { delete memory[k]; });
      scheduleFlush();
    }
  };
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return adapter; } }); }
  catch (err) { console.error('Could not install native localStorage adapter:', err); }
  window.__ethvelleNativeMemory = memory;
  window.__ethvelleNativeStorageMode = 'Capacitor Filesystem (Directory.Data)';
})();
