/* 通用工具 */
window.U = (function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return pad(m) + ':' + pad(s);
  }
  function fmtDuration(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + ' 小时 ' + m + ' 分';
    if (m > 0) return m + ' 分 ' + s + ' 秒';
    return s + ' 秒';
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtDateShort(ts) {
    var d = new Date(ts);
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  var toastWrap = null;
  function toast(msg, type) {
    if (!toastWrap) toastWrap = document.getElementById('toast-wrap');
    if (!toastWrap) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(function () { el.remove(); }, 260);
    }, 2200);
  }

  /* 确认弹窗，返回 Promise<boolean> */
  function confirm(title, text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var root = document.getElementById('modal-root');
      var okText = opts.okText || '确定';
      var cancelText = opts.cancelText || '取消';
      root.innerHTML =
        '<div class="modal-mask"><div class="modal">' +
        '<div class="modal-h">' + esc(title) + '</div>' +
        '<div class="modal-b">' + esc(text || '') + '</div>' +
        '<div class="modal-f">' +
        (opts.hideCancel ? '' : '<button class="btn btn-ghost" data-m="0">' + esc(cancelText) + '</button>') +
        '<button class="btn btn-primary" data-m="1">' + esc(okText) + '</button>' +
        '</div></div></div>';
      function close(v) {
        root.innerHTML = '';
        document.removeEventListener('keydown', onKey);
        resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') close(false); }
      root.querySelectorAll('[data-m]').forEach(function (b) {
        b.addEventListener('click', function () { close(b.getAttribute('data-m') === '1'); });
      });
      root.querySelector('.modal-mask').addEventListener('click', function (e) {
        if (e.target === e.currentTarget) close(false);
      });
      document.addEventListener('keydown', onKey);
    });
  }

  /* 输入弹窗，返回 Promise<string|null>（取消为 null） */
  function prompt(title, text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var root = document.getElementById('modal-root');
      root.innerHTML =
        '<div class="modal-mask"><div class="modal">' +
        '<div class="modal-h">' + esc(title) + '</div>' +
        '<div class="modal-b">' + esc(text || '') +
        '<input class="modal-input" id="modal-input" type="' + (opts.password ? 'password' : 'text') + '" placeholder="' + esc(opts.placeholder || '') + '" maxlength="64"></div>' +
        '<div class="modal-f">' +
        '<button class="btn btn-ghost" data-m="0">取消</button>' +
        '<button class="btn btn-primary" data-m="1">' + esc(opts.okText || '确定') + '</button>' +
        '</div></div></div>';
      var input = root.querySelector('#modal-input');
      function close(v) {
        root.innerHTML = '';
        document.removeEventListener('keydown', onKey);
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter') close(input.value);
      }
      root.querySelectorAll('[data-m]').forEach(function (b) {
        b.addEventListener('click', function () { close(b.getAttribute('data-m') === '1' ? input.value : null); });
      });
      root.querySelector('.modal-mask').addEventListener('click', function (e) {
        if (e.target === e.currentTarget) close(null);
      });
      document.addEventListener('keydown', onKey);
      setTimeout(function () { input.focus(); }, 50);
    });
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function lastOf(arr) { return arr && arr.length ? arr[arr.length - 1] : null; }

  return {
    esc: esc, $: $, $$: $$, pad: pad,
    fmtClock: fmtClock, fmtDuration: fmtDuration, fmtDate: fmtDate, fmtDateShort: fmtDateShort,
    toast: toast, confirm: confirm, prompt: prompt, shuffle: shuffle, lastOf: lastOf
  };
})();
