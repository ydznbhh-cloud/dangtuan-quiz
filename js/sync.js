/* =========================================================
 * 云同步：用一个「同步码」在多台设备间同步学习数据
 * 数据保存在 Supabase（免费），无需注册登录。
 * 同步内容：昵称、做题记录、错题掌握标记、填空掌握标记。
 * =======================================================*/
window.Sync = (function () {
  'use strict';

  var CFG = window.SYNC_CONFIG || {};
  var U = window.U;
  var Store = window.Store;
  var K_CODE = 'tkc26_sync_code';
  var K_AT = 'tkc26_sync_at';
  var busy = false;
  var pushTimer = null;

  function enabled() { return !!(CFG.url && CFG.anonKey); }

  function getCode() {
    try { return localStorage.getItem(K_CODE) || ''; } catch (e) { return ''; }
  }
  function setCode(code) {
    try {
      code = String(code || '').trim();
      if (code) localStorage.setItem(K_CODE, code);
      else localStorage.removeItem(K_CODE);
    } catch (e) { }
  }
  function lastSyncAt() {
    try { return parseInt(localStorage.getItem(K_AT) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function markSyncAt() {
    try { localStorage.setItem(K_AT, String(Date.now())); } catch (e) { }
  }

  function genCode() {
    var alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    var s = '';
    var buf = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < 12; i++) {
      s += alphabet[buf[i] % alphabet.length];
      if (i === 3 || i === 7) s += '-';
    }
    return s;
  }

  function rpc(fn, body) {
    var url = String(CFG.url).replace(/\/+$/, '') + '/rest/v1/rpc/' + fn;
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CFG.anonKey,
        'Authorization': 'Bearer ' + CFG.anonKey
      },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) throw new Error((t || '').slice(0, 160) || ('HTTP ' + r.status));
        if (!t) return null;
        try { return JSON.parse(t); } catch (e) { return t; }
      });
    });
  }

  /* 拉取云端 → 合并到本机 → 再把合并结果推回云端 */
  function syncNow(manual) {
    if (!enabled()) {
      if (manual) U.toast('尚未配置云同步：请先在 js/sync-config.js 中填写 Supabase 地址和密钥', 'error');
      return Promise.resolve(false);
    }
    var code = getCode();
    if (!code) {
      if (manual) { openPanel(); U.toast('请先输入或生成同步码', 'error'); }
      return Promise.resolve(false);
    }
    if (busy) {
      if (manual) U.toast('正在同步，请稍候');
      return Promise.resolve(false);
    }
    busy = true;
    if (manual) U.toast('正在同步…');
    return rpc('get_sync', { p_code: code }).then(function (remote) {
      var changed = false;
      if (remote && typeof remote === 'object') {
        var res = Store.importSyncData(remote);
        changed = !!res.changed;
      }
      return rpc('put_sync', { p_code: code, p_data: Store.exportSyncData() }).then(function () {
        markSyncAt();
        busy = false;
        if (changed) window.dispatchEvent(new Event('sync:updated'));
        if (manual) U.toast('同步完成', 'success');
        return true;
      });
    }).catch(function (err) {
      busy = false;
      var msg = err && err.message ? err.message : '网络异常';
      if (manual) U.toast('同步失败：' + msg, 'error');
      return false;
    });
  }

  function schedulePush() {
    if (!enabled() || !getCode()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      if (busy) return;
      var code = getCode();
      if (!code) return;
      rpc('put_sync', { p_code: code, p_data: Store.exportSyncData() })
        .then(markSyncAt)
        .catch(function () { });
    }, 1500);
  }

  function wrapStore() {
    ['addRecord', 'markMastered', 'unmarkMastered', 'setFillMastered', 'setName', 'clearRecords'].forEach(function (name) {
      var orig = Store[name];
      if (typeof orig !== 'function' || orig.__syncWrapped) return;
      var wrapped = function () {
        var r = orig.apply(Store, arguments);
        schedulePush();
        return r;
      };
      wrapped.__syncWrapped = true;
      Store[name] = wrapped;
    });
  }

  /* ---------------- 同步面板 ---------------- */
  function openPanel() {
    var root = document.getElementById('modal-root');
    if (!root) return;
    var code = getCode();
    var conf = enabled();
    var at = lastSyncAt();

    var body = '';
    if (!conf) {
      body += '<p class="sync-hint">云同步尚未配置。按下面的步骤启用后，手机和电脑就能用同一个同步码互通数据：</p>' +
        '<ol class="sync-steps">' +
        '<li>注册免费 <b>Supabase</b> 账号并新建项目；</li>' +
        '<li>在 SQL Editor 中运行 <b>supabase_setup.sql</b>；</li>' +
        '<li>把项目 URL 和 anon 密钥填入 <b>js/sync-config.js</b>；</li>' +
        '<li>重新打开网页即可。</li>' +
        '</ol>' +
        '<p class="sync-hint">详细步骤见文件夹中的《部署与同步说明.md》。未配置时，网站照常可用，只是各设备数据独立。</p>';
    } else {
      body += '<p class="sync-hint">在手机和电脑上填写<b>同一个同步码</b>，两边的昵称、做题记录、错题本和填空掌握标记就会自动合并。同步码相当于钥匙，请勿公开。</p>' +
        '<div class="sync-row">' +
        '  <input class="modal-input sync-code" id="sync-code-input" type="text" maxlength="40" placeholder="输入或生成同步码" value="' + U.esc(code) + '">' +
        '</div>' +
        '<div class="sync-actions">' +
        '  <button class="btn btn-sm btn-ghost" id="sync-gen">生成新码</button>' +
        '  <button class="btn btn-sm btn-ghost" id="sync-copy">复制</button>' +
        '  <button class="btn btn-sm btn-primary" id="sync-save">保存并同步</button>' +
        '  <button class="btn btn-sm btn-ghost" id="sync-now">立即同步</button>' +
        '</div>' +
        '<p class="sync-status" id="sync-status">' +
        (code ? ('当前状态：已设置同步码' + (at ? ' · 上次同步 ' + U.fmtDate(at) : ' · 尚未同步')) : '当前状态：尚未设置同步码') +
        '</p>';
    }

    body += '<div class="sync-divider"></div>' +
      '<div class="sync-actions">' +
      '  <button class="btn btn-sm btn-ghost" id="sync-export">导出本机数据</button>' +
      '  <button class="btn btn-sm btn-ghost" id="sync-import">导入数据文件</button>' +
      '  <input type="file" id="sync-file" accept=".json,application/json" hidden>' +
      '</div>' +
      '<p class="sync-hint">导出/导入用于备份，或在没有云同步时把旧设备（如本地 double-click 打开）的记录搬到新网址。</p>';

    root.innerHTML =
      '<div class="modal-mask"><div class="modal sync-modal">' +
      '  <div class="modal-h">云同步</div>' +
      '  <div class="modal-b">' + body + '</div>' +
      '  <div class="modal-f"><button class="btn btn-primary" id="sync-close">关闭</button></div>' +
      '</div></div>';

    function close() { root.innerHTML = ''; }
    document.getElementById('sync-close').addEventListener('click', close);
    root.querySelector('.modal-mask').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) close();
    });

    var codeInput = document.getElementById('sync-code-input');
    if (codeInput) {
      document.getElementById('sync-gen').addEventListener('click', function () {
        codeInput.value = genCode();
        codeInput.focus();
        codeInput.select();
      });
      document.getElementById('sync-copy').addEventListener('click', function () {
        var v = codeInput.value.trim();
        if (!v) return U.toast('请先生成或输入同步码', 'error');
        copyText(v).then(function (ok) {
          U.toast(ok ? '同步码已复制' : '复制失败，请手动选择复制', ok ? 'success' : 'error');
        });
      });
      document.getElementById('sync-save').addEventListener('click', function () {
        var v = codeInput.value.trim();
        if (!/^[A-Za-z0-9-]{6,40}$/.test(v)) return U.toast('同步码需为 6-40 位字母、数字或短横线', 'error');
        setCode(v);
        syncNow(true).then(close);
      });
      document.getElementById('sync-now').addEventListener('click', function () {
        var v = codeInput.value.trim();
        if (v && v !== getCode()) {
          if (!/^[A-Za-z0-9-]{6,40}$/.test(v)) return U.toast('同步码格式不正确', 'error');
          setCode(v);
        }
        syncNow(true).then(function (ok) {
          var st = document.getElementById('sync-status');
          if (st) st.textContent = '当前状态：' + (ok ? '已同步 · ' + U.fmtDate(lastSyncAt()) : '同步失败，请检查网络或配置');
        });
      });
    }

    var fileEl = document.getElementById('sync-file');
    document.getElementById('sync-export').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(Store.exportSyncData(), null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '学习数据_' + U.fmtDate(Date.now()).replace(/[-: ]/g, '').slice(0, 8) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      U.toast('已导出本机学习数据', 'success');
    });
    document.getElementById('sync-import').addEventListener('click', function () { fileEl.click(); });
    fileEl.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(String(reader.result || '')); }
        catch (err) { return U.toast('文件格式不正确', 'error'); }
        var res = Store.importSyncData(data);
        U.toast('导入完成：新增 ' + (res.added || 0) + ' 条记录' + (res.changed ? '，已更新本机数据' : ''), 'success');
        window.dispatchEvent(new Event('sync:updated'));
        schedulePush();
        close();
      };
      reader.onerror = function () { U.toast('文件读取失败', 'error'); };
      reader.readAsText(f, 'utf-8');
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return false; });
    }
    return Promise.resolve(false);
  }

  function init() {
    wrapStore();
    if (enabled() && getCode()) {
      setTimeout(function () { syncNow(false); }, 800);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    enabled: enabled,
    getCode: getCode,
    setCode: setCode,
    genCode: genCode,
    syncNow: syncNow,
    openPanel: openPanel,
    lastSyncAt: lastSyncAt
  };
})();
