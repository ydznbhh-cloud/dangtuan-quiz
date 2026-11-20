/* Wrong-answer practice: answers remain hidden until submission. */
window.WrongRetry = (function () {
  'use strict';
  function isCorrect(selected, answer) {
    return selected.length === answer.length && answer.every(function (a) { return selected.indexOf(a) !== -1; });
  }
  function start(uid, items, done) {
    var index = 0, passed = 0, selected = [], submitted = false;
    var root = document.getElementById('app');
    function render() {
      if (index >= items.length) {
        root.innerHTML = '<main class="page"><div class="card"><div class="card-body"><h2>本轮重做完成</h2><p>共重做 ' + items.length + ' 题，巩固完成 ' + passed + ' 题，仍需复习 ' + (items.length - passed) + ' 题。</p><button class="btn btn-primary" id="retry-back">返回错题本</button></div></div></main>';
        document.getElementById('retry-back').onclick = done; return;
      }
      var q = items[index].question;
      root.innerHTML = '<main class="page"><div class="page-head"><h2>错题重做</h2><p>第 ' + (index + 1) + ' / ' + items.length + ' 题 · 已巩固 ' + passed + ' 题</p></div><div class="q-card"><div class="q-type">' + ({single:'单选题',multiple:'多选题（全部选对才算完成）',judge:'判断题'}[q.type]) + '</div><div class="q-stem">' + U.esc(q.stem) + '</div><div class="opt-list">' + q.options.map(function (o, k) {
        var key = 'ABCDEFGH'[k];
        return '<button class="opt' + (selected.indexOf(key) >= 0 ? ' selected' : '') + '" data-retry-opt="' + key + '"' + (submitted ? ' disabled' : '') + '><span class="opt-key">' + key + '</span><span class="opt-text">' + U.esc(o) + '</span></button>';
      }).join('') + '</div><div id="retry-feedback" role="status"></div><div class="q-foot"><button class="btn btn-ghost" id="retry-exit">返回错题本</button><button class="btn btn-primary" id="retry-submit">' + (submitted ? (index === items.length - 1 ? '查看结果' : '下一题') : '提交答案') + '</button></div></div></main>';
      if (submitted) {
        var ok = isCorrect(selected, q.answer);
        document.getElementById('retry-feedback').innerHTML = '<p>' + (ok ? '✓ 回答正确，巩固完成，已移出错题本。' : '回答错误，保留在错题本。正确答案：' + U.esc(q.answer.join('、'))) + '</p>' + (q.analysis ? '<p>' + U.esc(q.analysis) + '</p>' : '');
      }
      root.querySelectorAll('[data-retry-opt]').forEach(function (b) { b.onclick = function () {
        if (submitted) return;
        var key = b.getAttribute('data-retry-opt');
        if (q.type === 'multiple') { var i = selected.indexOf(key); if (i < 0) selected.push(key); else selected.splice(i, 1); }
        else selected = [key];
        render();
      }; });
      document.getElementById('retry-exit').onclick = done;
      document.getElementById('retry-submit').onclick = function () {
        if (submitted) { index++; selected = []; submitted = false; render(); window.scrollTo(0,0); return; }
        if (!selected.length) return U.toast('请先选择答案');
        submitted = true;
        if (isCorrect(selected, q.answer)) { Store.markMastered(uid, items[index].id); passed++; }
        render();
      };
    }
    render(); window.scrollTo(0,0);
  }
  return {start:start, isCorrect:isCorrect};
})();
