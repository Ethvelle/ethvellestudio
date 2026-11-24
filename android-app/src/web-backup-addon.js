(function () {
  'use strict';
  try { if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return; } catch (_) {}
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true }); else fn(); }
  function toast(message) { try { if (typeof window.showToast === 'function') window.showToast(message, { duration: 3000 }); else alert(message); } catch (_) {} }
  function makeBackup() {
    const projects = localStorage.getItem('riggy.projects.v1') || '[]';
    const modelAssets = localStorage.getItem('riggy.modelAssets.v1') || '[]';
    const payload = { format: 'ethvelle-backup', version: 1, createdAt: new Date().toISOString(),
      projects: JSON.parse(projects), modelAssets: JSON.parse(modelAssets) };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'Ethvelle-Backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function restoreBackup(file) {
    const payload = JSON.parse(await file.text());
    if (!payload || payload.format !== 'ethvelle-backup') throw new Error('This is not an Ethvelle backup file.');
    localStorage.setItem('riggy.projects.v1', JSON.stringify(payload.projects || []));
    localStorage.setItem('riggy.modelAssets.v1', JSON.stringify(payload.modelAssets || []));
    if (typeof window.renderProjects === 'function') window.renderProjects();
    if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
    toast('Backup restored successfully.');
  }
  ready(() => {
    if (document.getElementById('ethvelle-browser-backup-tools')) return;
    const host = document.getElementById('screen-home') || document.body;
    const bar = document.createElement('div'); bar.id = 'ethvelle-browser-backup-tools';
    bar.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:8px 14px;position:relative;z-index:1000';
    bar.innerHTML = '<button id="ethvelle-browser-backup" type="button">Backup</button><button id="ethvelle-browser-restore" type="button">Restore</button><input id="ethvelle-browser-restore-file" type="file" accept="application/json,.json" hidden>';
    host.appendChild(bar);
    bar.querySelectorAll('button').forEach(button => button.style.cssText = 'background:#24385f;border:1px solid #4772d5;color:#fff;border-radius:9px;padding:8px 12px;font:600 12px system-ui');
    document.getElementById('ethvelle-browser-backup').addEventListener('click', () => {
      try { makeBackup(); toast('Backup exported.'); } catch (e) { toast('Backup failed: ' + e.message); }
    });
    document.getElementById('ethvelle-browser-restore').addEventListener('click', () => document.getElementById('ethvelle-browser-restore-file').click());
    document.getElementById('ethvelle-browser-restore-file').addEventListener('change', async event => {
      const file = event.target.files && event.target.files[0]; if (!file) return;
      try { await restoreBackup(file); } catch (e) { toast('Restore failed: ' + e.message); }
      finally { event.target.value = ''; }
    });
  });
})();
