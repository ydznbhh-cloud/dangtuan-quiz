/* =========================================================
 * 应用主逻辑
 * =======================================================*/
(function () {
  'use strict';

  var CFG = window.APP_CONFIG;
  var U = window.U;
  var Store = window.Store;
  var Parser = window.QuestionParser;
  var LETTERS = 'ABCDEFGH';
  var appEl = document.getElementById('app');

  var state = {
    user: null,
    view: 'dashboard',
    authTab: 'login',
    draft: null,
    result: null,
    review: null,
    reviewTab: 'wrong',
    timerId: null,
    bankQuery: '',
    bankPreview: null
  };

  var TYPE_LABEL = { single: '单选题', multiple: '多选题', judge: '判断题' };

  /* ================= 渲染框架 ================= */
  function go(view) { state.view = view; render(); }

  function render() {
    stopTimer();
    switch (state.view) {
      case 'dashboard': renderDashboard(); break;
      case 'quiz': renderQuiz(); break;
      case 'result': renderResult(); break;
      case 'records': renderRecords(); break;
      case 'review': renderReview(); break;
      case 'wrongbook': renderWrongBook(); break;
      case 'fill': renderFill(); break;
      case 'bank': renderBank(); break;
      default: state.view = 'dashboard'; renderDashboard();
    }
    if (state.view !== 'quiz') window.scrollTo(0, 0);
  }

  function shell(active, content) {
    return '' +
      '<header class="app-header">' +
      '  <div class="ah-inner">' +
      '    <div class="ah-brand">' +
      '      <span class="ah-badge">★</span>' +
      '      <div class="ah-text">' +
      '        <div class="ah-title">' + U.esc(CFG.systemName) + '</div>' +
      '        <div class="ah-sub">' + U.esc(CFG.branch) + '</div>' +
      '      </div>' +
      '    </div>' +
      '    <nav class="ah-nav">' +
      '      <button data-nav="dashboard" class="' + (active === 'dashboard' ? 'active' : '') + '">工作台</button>' +
      '      <button data-nav="records" class="' + (active === 'records' ? 'active' : '') + '">做题记录</button>' +
      '      <button data-nav="wrongbook" class="' + (active === 'wrongbook' ? 'active' : '') + '">错题本</button>' +
      '      <button data-nav="fill" class="' + (active === 'fill' ? 'active' : '') + '">填空背诵</button>' +
      '      <button data-nav="bank" class="' + (active === 'bank' ? 'active' : '') + '">题库管理</button>' +
      '    </nav>' +
      '    <div class="ah-user">' +
      '      <div class="ah-user-info"><span class="ah-name">' + U.esc(state.user.name) + '</span><span class="ah-sid">本机学习档案</span></div>' +
      '      <button class="btn btn-sm btn-ghost" id="btn-sync">云同步</button>' +
      '      <button class="btn btn-sm btn-ghost" id="btn-rename">改名</button>' +
      '    </div>' +
      '  </div>' +
      '</header>' +
      '<main class="page">' + content + '</main>';
  }

  function bindShell() {
    U.$$('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-nav')); });
    });
    var sy = document.getElementById('btn-sync');
    if (sy) sy.addEventListener('click', function () { if (window.Sync) Sync.openPanel(); });
    var rn = document.getElementById('btn-rename');
    if (rn) rn.addEventListener('click', function () {
      U.prompt('修改昵称', '昵称仅保存在本机浏览器中，用于区分学习档案；做题记录与错题本不会丢失。', { placeholder: '请输入昵称（2-20 个字符）', okText: '保存' }).then(function (name) {
        if (name == null) return;
        name = String(name).trim();
        if (name.length < 2 || name.length > 20) return U.toast('昵称需为 2-20 个字符', 'error');
        Store.setName(name);
        state.user.name = name;
        render();
        U.toast('昵称已更新', 'success');
      });
    });
  }

  /* ================= 工作台 ================= */
  function checkExpiredDraft() {
    if (!state.user) return;
    var uid = state.user.studentId;
    var d = Store.getDraft(uid);
    if (d && d.deadline <= Date.now()) {
      var g = gradeDraft(d);
      var rec = buildRecord(d, g, true);
      Store.addRecord(uid, rec);
      Store.clearDraft(uid);
      syncAndMark(rec);
      state.result = rec;
      U.toast('上一份训练已超过 ' + CFG.durationMinutes + ' 分钟限时，系统已自动交卷', 'error');
    }
  }

  function renderDashboard() {
    checkExpiredDraft();
    var uid = state.user.studentId;
    var bank = Store.getBank();
    var records = Store.getRecords(uid);
    var draft = Store.getDraft(uid);
    var wrongs = Store.getWrongItems(uid);
    var stats = Store.getStats(uid);
    var n = Math.min(CFG.questionCount, bank.length);

    var html = '';
    html += '<div class="hero">' +
      '<div class="hero-l">' +
      '  <div class="hero-hi">' + U.esc(state.user.name) + '，您好</div>' +
      '  <div class="hero-sub">' + U.esc(CFG.branch) + '</div>' +
      '  <p class="hero-desc">每次训练从题库中随机抽取 <b>' + n + '</b> 道题目，限时 <b>' + CFG.durationMinutes + '</b> 分钟，满分 <b>' + CFG.totalScore + '</b> 分。作答过程中可随时暂存，下次打开继续作答。</p>' +
      '</div>' +
      '<div class="hero-r">' +
      '  <button class="btn btn-gold btn-lg" id="btn-start">开始新的训练</button>' +
      '  <div class="hero-note">当前题库共 ' + bank.length + ' 道题' + (bank.length < CFG.questionCount ? '（不足 ' + CFG.questionCount + ' 道，本次将使用全部题目）' : '') + '</div>' +
      '</div>' +
      '</div>';

    if (draft) {
      var left = Math.max(0, Math.round((draft.deadline - Date.now()) / 1000));
      var done = Object.keys(draft.answers || {}).length;
      html += '<div class="draft-card">' +
        '<div class="dc-l">' +
        '  <span class="dc-tag">未完成</span>' +
        '  <div><div class="dc-title">您有一份未完成的训练</div><div class="dc-sub">开始于 ' + U.fmtDate(draft.startAt) + ' · 已答 ' + done + '/' + draft.questions.length + ' 题 · 剩余 ' + U.fmtClock(left) + '</div></div>' +
        '</div>' +
        '<div class="dc-r"><button class="btn btn-primary" id="btn-resume">继续作答</button>' +
        '<button class="btn btn-ghost" id="btn-drop">放弃</button></div>' +
        '</div>';
    }

    html += '<div class="stat-row">' +
      statCard(stats.count, '训练次数', '次') +
      statCard(stats.best, '最高得分', '分') +
      statCard(stats.avg, '平均得分', '分') +
      statCard(wrongs.length, '待巩固错题', '题') +
      '</div>';

    html += '<div class="grid-2">';
    html += '<div class="card">' +
      '<div class="card-head"><h3>最近训练</h3><button class="link" data-nav="records">全部记录 ›</button></div>' +
      '<div class="card-body">';
    if (!records.length) {
      html += '<div class="empty">还没有训练记录，点击"开始新的训练"进入第一次练习。</div>';
    } else {
      html += '<ul class="mini-list">';
      records.slice(0, 4).forEach(function (r) {
        html += '<li><span class="ml-date">' + U.fmtDateShort(r.submittedAt) + '</span>' +
          '<span class="ml-score ' + (r.score >= CFG.excellentScore ? 'ok' : '') + '">' + r.score + ' 分</span>' +
          '<span class="ml-meta">' + U.fmtDuration(r.durationSec) + '</span>' +
          '<button class="link" data-open="' + r.id + '">查看</button></li>';
      });
      html += '</ul>';
    }
    html += '</div></div>';

    html += '<div class="card">' +
      '<div class="card-head"><h3>训练规则</h3></div>' +
      '<div class="card-body">' +
      '<ul class="rule-list">' +
      '<li><b>题量与分值</b>：每次 ' + CFG.questionCount + ' 题，每题 ' + fmtPerScore(n) + ' 分，满分 ' + CFG.totalScore + ' 分。</li>' +
      '<li><b>限时规则</b>：限时 ' + CFG.durationMinutes + ' 分钟，倒计时结束系统将自动交卷。</li>' +
      '<li><b>暂存续答</b>：答题过程中可点击"暂存并退出"，再次打开可继续作答。</li>' +
      '<li><b>自动批改</b>：交卷后立即出分，并逐题展示正确答案与解析。</li>' +
      '<li><b>错题管理</b>：错题自动归入错题本，可反复查看，掌握后可标记移出。</li>' +
      '</ul>' +
      '</div></div>';
    html += '</div>';

    appEl.innerHTML = shell('dashboard', html);
    bindShell();

    var startBtn = document.getElementById('btn-start');
    if (startBtn) startBtn.addEventListener('click', onStartClick);
    var resumeBtn = document.getElementById('btn-resume');
    if (resumeBtn) resumeBtn.addEventListener('click', function () {
      state.draft = Store.getDraft(uid);
      if (!state.draft) { U.toast('该训练已结束', 'error'); return renderDashboard(); }
      go('quiz');
    });
    var dropBtn = document.getElementById('btn-drop');
    if (dropBtn) dropBtn.addEventListener('click', function () {
      U.confirm('放弃当前训练', '放弃后本次作答记录将被清除，且不计入成绩，是否确认？', { okText: '确认放弃' }).then(function (ok) {
        if (!ok) return;
        Store.clearDraft(uid);
        U.toast('已放弃本次训练');
        renderDashboard();
      });
    });
    U.$$('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () {
        var rec = Store.getRecord(uid, b.getAttribute('data-open'));
        if (!rec) return U.toast('记录不存在', 'error');
        state.review = rec; state.reviewTab = defaultTab(rec); go('review');
      });
    });
  }

  function statCard(num, label, unit) {
    return '<div class="stat"><div class="stat-num">' + num + '<span class="stat-unit">' + unit + '</span></div><div class="stat-label">' + label + '</div></div>';
  }
  function fmtPerScore(n) {
    var v = CFG.totalScore / n;
    return (Math.round(v * 10) / 10).toString();
  }
  function defaultTab(rec) {
    return (rec.wrong + rec.blank) > 0 ? 'wrong' : 'all';
  }

  function onStartClick() {
    var uid = state.user.studentId;
    var bank = Store.getBank();
    if (!bank.length) {
      U.toast('题库为空，请先在"题库管理"中导入题目', 'error');
      return;
    }
    var draft = Store.getDraft(uid);
    if (draft) {
      U.confirm('已有未完成的训练', '检测到一份未完成的训练，开始新训练将放弃该进度，是否继续？', { okText: '放弃并开始' }).then(function (ok) {
        if (!ok) return;
        Store.clearDraft(uid);
        createDraft();
      });
    } else createDraft();
  }

  function createDraft() {
    var bank = Store.getBank();
    var n = Math.min(CFG.questionCount, bank.length);
    var picked = U.shuffle(bank).slice(0, n).map(function (q) {
      return {
        id: q.id, type: q.type, stem: q.stem,
        options: (q.options || []).slice(),
        answer: (q.answer || []).slice(),
        analysis: q.analysis || ''
      };
    });
    var now = Date.now();
    var draft = {
      id: 's' + now + Math.floor(Math.random() * 1000),
      startAt: now,
      deadline: now + CFG.durationMinutes * 60 * 1000,
      questions: picked,
      answers: {},
      index: 0
    };
    Store.saveDraft(state.user.studentId, draft);
    state.draft = draft;
    go('quiz');
  }

  /* ================= 答题页 ================= */
  function renderQuiz() {
    var d = state.draft;
    if (!d) { go('dashboard'); return; }
    if (d.deadline <= Date.now()) { doSubmit(true); return; }
    if (d.index >= d.questions.length) d.index = 0;

    appEl.innerHTML =
      '<div class="quiz-shell">' +
      '  <header class="quiz-top">' +
      '    <div class="qt-left">' +
      '      <span class="qt-title">党团知识竞赛训练</span>' +
      '      <span class="qt-meta">共 ' + d.questions.length + ' 题 · 满分 ' + CFG.totalScore + ' 分</span>' +
      '    </div>' +
      '    <div class="qt-timer"><span class="timer" id="timer">--:--</span><span class="qt-timer-label">剩余时间</span></div>' +
      '    <div class="qt-right">' +
      '      <button class="btn btn-ghost" id="btn-save">暂存并退出</button>' +
      '      <button class="btn btn-primary" id="btn-submit">交 卷</button>' +
      '    </div>' +
      '  </header>' +
      '  <div class="quiz-body">' +
      '    <section class="quiz-main"><div id="q-panel"></div></section>' +
      '    <aside class="quiz-side">' +
      '      <div class="side-head"><span>答题卡</span><span class="side-count"><b id="cnt-done">0</b> / ' + d.questions.length + '</span></div>' +
      '      <div class="legend"><span><i class="dot dot-done"></i>已答</span><span><i class="dot"></i>未答</span><span><i class="dot dot-cur"></i>当前</span></div>' +
      '      <div class="card-grid" id="card-grid">' + d.questions.map(function (q, i) {
        return '<button class="cell" data-jump="' + i + '">' + (i + 1) + '</button>';
      }).join('') + '</div>' +
      '      <button class="btn btn-primary btn-block" id="btn-submit-2">交 卷</button>' +
      '      <p class="side-tip">交卷后系统自动批改并生成错题解析，交卷后不可修改。</p>' +
      '    </aside>' +
      '  </div>' +
      '</div>';

    renderQuestionPanel();
    refreshCards();
    startTimer();

    document.getElementById('btn-save').addEventListener('click', onSaveDraft);
    document.getElementById('btn-submit').addEventListener('click', function () { doSubmit(false); });
    document.getElementById('btn-submit-2').addEventListener('click', function () { doSubmit(false); });
    document.getElementById('card-grid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-jump]');
      if (!b) return;
      d.index = parseInt(b.getAttribute('data-jump'), 10);
      Store.saveDraft(state.user.studentId, d);
      renderQuestionPanel(); refreshCards();
    });
  }

  function renderQuestionPanel() {
    var d = state.draft;
    var i = d.index;
    var q = d.questions[i];
    var sel = d.answers[q.id] || [];
    var panel = document.getElementById('q-panel');
    if (!panel) return;
    panel.innerHTML =
      '<div class="q-card">' +
      '  <div class="q-head">' +
      '    <span class="q-type">' + (TYPE_LABEL[q.type] || '单选题') + '</span>' +
      '    <span class="q-no">第 ' + (i + 1) + ' 题 / 共 ' + d.questions.length + ' 题</span>' +
      '    <span class="q-score">' + fmtPerScore(d.questions.length) + ' 分</span>' +
      '  </div>' +
      '  <div class="q-stem">' + U.esc(q.stem) + '</div>' +
      '  <div class="opt-list">' + q.options.map(function (o, k) {
        var key = LETTERS[k];
        var on = sel.indexOf(key) > -1;
        return '<button type="button" class="opt' + (on ? ' selected' : '') + '" data-opt="' + key + '">' +
          '<span class="opt-key">' + key + '</span><span class="opt-text">' + U.esc(o) + '</span></button>';
      }).join('') + '</div>' +
      (q.type === 'multiple' ? '<p class="q-hint">本题为多选题，需全部选对才得分。</p>' : '') +
      '  <div class="q-foot">' +
      '    <button type="button" class="btn btn-ghost" id="btn-prev"' + (i === 0 ? ' disabled' : '') + '>上一题</button>' +
      '    <button type="button" class="btn btn-ghost" id="btn-next"' + (i === d.questions.length - 1 ? ' disabled' : '') + '>下一题</button>' +
      '  </div>' +
      '</div>';

    U.$$('[data-opt]', panel).forEach(function (b) {
      b.addEventListener('click', function () { chooseOption(b.getAttribute('data-opt')); });
    });
    var prev = document.getElementById('btn-prev');
    var next = document.getElementById('btn-next');
    if (prev) prev.addEventListener('click', function () { move(-1); });
    if (next) next.addEventListener('click', function () { move(1); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function move(step) {
    var d = state.draft;
    var next = d.index + step;
    if (next < 0 || next >= d.questions.length) return;
    d.index = next;
    Store.saveDraft(state.user.studentId, d);
    renderQuestionPanel();
    refreshCards();
  }

  function chooseOption(key) {
    var d = state.draft;
    var q = d.questions[d.index];
    var sel = (d.answers[q.id] || []).slice();
    if (q.type === 'multiple') {
      var at = sel.indexOf(key);
      if (at > -1) sel.splice(at, 1); else sel.push(key);
      sel.sort();
    } else {
      sel = (sel.length === 1 && sel[0] === key) ? [] : [key];
    }
    if (sel.length) d.answers[q.id] = sel; else delete d.answers[q.id];
    Store.saveDraft(state.user.studentId, d);
    renderQuestionPanel();
    refreshCards();
  }

  function refreshCards() {
    var d = state.draft;
    var cells = U.$$('#card-grid .cell');
    var done = 0;
    cells.forEach(function (cell, i) {
      var q = d.questions[i];
      var answered = !!(d.answers[q.id] && d.answers[q.id].length);
      if (answered) done++;
      cell.classList.toggle('answered', answered);
      cell.classList.toggle('current', i === d.index);
    });
    var c = document.getElementById('cnt-done');
    if (c) c.textContent = done;
  }

  function onSaveDraft() {
    var d = state.draft;
    var ok = Store.saveDraft(state.user.studentId, d);
    if (!ok) return U.toast('暂存失败，浏览器存储空间不足', 'error');
    var done = Object.keys(d.answers || {}).length;
    U.confirm('已暂存', '本次作答已保存（已答 ' + done + '/' + d.questions.length + ' 题），限时倒计时仍会继续计算。退出后可随时回来继续作答。', {
      okText: '退出答题', cancelText: '继续答题'
    }).then(function (yes) {
      if (yes) { state.draft = null; Store.saveDraft(state.user.studentId, d); go('dashboard'); }
    });
  }

  /* ---------------- 计时 ---------------- */
  function startTimer() {
    stopTimer();
    var d = state.draft;
    function tick() {
      var left = Math.round((d.deadline - Date.now()) / 1000);
      var el = document.getElementById('timer');
      if (!el) return;
      if (left <= 0) {
        el.textContent = '00:00';
        stopTimer();
        doSubmit(true);
        return;
      }
      el.textContent = U.fmtClock(left);
      el.classList.toggle('warn', left <= 300);
    }
    tick();
    state.timerId = setInterval(tick, 500);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  /* ---------------- 评分与交卷 ---------------- */
  function gradeDraft(draft) {
    var per = CFG.totalScore / draft.questions.length;
    var correct = 0, wrong = 0, blank = 0;
    var questions = draft.questions.map(function (q) {
      var ua = (draft.answers[q.id] || []).slice().sort();
      var ca = (q.answer || []).slice().sort();
      var ok = ua.length > 0 && ua.join(',') === ca.join(',');
      if (!ua.length) blank++;
      else if (ok) correct++;
      else wrong++;
      return {
        id: q.id, type: q.type, stem: q.stem, options: q.options,
        answer: q.answer, analysis: q.analysis || '',
        userAnswer: ua, isCorrect: ok
      };
    });
    var score = Math.round(correct * per * 10) / 10;
    return { questions: questions, correct: correct, wrong: wrong, blank: blank, score: score };
  }

  function buildRecord(draft, g, auto) {
    var now = Date.now();
    var limit = CFG.durationMinutes * 60;
    var used = auto ? limit : Math.max(1, Math.min(limit, Math.round((now - draft.startAt) / 1000)));
    return {
      id: draft.id,
      startedAt: draft.startAt,
      submittedAt: now,
      durationSec: used,
      autoSubmitted: !!auto,
      score: g.score,
      correct: g.correct,
      wrong: g.wrong,
      blank: g.blank,
      total: draft.questions.length,
      questions: g.questions
    };
  }

  function doSubmit(auto) {
    var d = state.draft;
    if (!d) return;
    stopTimer();
    if (!auto) {
      var answered = Object.keys(d.answers || {}).length;
      var blank = d.questions.length - answered;
      var msg = blank > 0
        ? '您还有 ' + blank + ' 道题未作答，未作答的题目不得分。交卷后系统立即批改且不可修改，是否确认交卷？'
        : '交卷后系统立即批改且不可修改，是否确认交卷？';
      U.confirm('确认交卷', msg, { okText: '确认交卷' }).then(function (ok) {
        if (!ok) { startTimer(); return; }
        finalizeSubmit(auto);
      });
    } else {
      finalizeSubmit(true);
    }
  }

  /* 单机版：成绩仅保存在本机浏览器，无需云端同步 */
  function syncAndMark(rec) { }

  function finalizeSubmit(auto) {
    var d = state.draft;
    if (!d) return;
    var g = gradeDraft(d);
    var rec = buildRecord(d, g, auto);
    Store.addRecord(state.user.studentId, rec);
    Store.clearDraft(state.user.studentId);
    syncAndMark(rec);
    state.draft = null;
    state.result = rec;
    state.reviewTab = defaultTab(rec);
    if (auto) U.toast('答题时间已到，系统已自动交卷', 'error');
    go('result');
  }

  /* ================= 成绩页 ================= */
  function renderResult() {
    var r = state.result;
    if (!r) { go('dashboard'); return; }
    var excellent = r.score >= CFG.excellentScore;
    var missCount = r.wrong + r.blank;

    var html = '';
    html += '<div class="result-hero ' + (excellent ? 'is-excellent' : 'is-encourage') + '">' +
      '  <div class="rh-top">' + U.esc(CFG.branch) + ' · 训练成绩</div>' +
      '  <div class="rh-score">' + r.score + '<span class="rh-unit">分</span></div>' +
      '  <div class="rh-msg">' + (excellent ? '非常棒，请继续保持！' : '请继续努力！') + '</div>' +
      '  <div class="rh-sub">' + (excellent
        ? '本次成绩达到优秀标准（' + CFG.excellentScore + ' 分及以上），理论功底扎实，继续保持。'
        : '本次成绩距优秀标准（' + CFG.excellentScore + ' 分）还差 ' + (Math.round((CFG.excellentScore - r.score) * 10) / 10) + ' 分，针对错题加强复习，下次会更好。') + '</div>' +
      '  <div class="rh-meta">' +
      '    <span>答对 <b>' + r.correct + '</b> 题</span>' +
      '    <span>答错 <b>' + r.wrong + '</b> 题</span>' +
      '    <span>未答 <b>' + r.blank + '</b> 题</span>' +
      '    <span>用时 <b>' + U.fmtDuration(r.durationSec) + '</b></span>' +
      (r.autoSubmitted ? '<span class="rh-flag">超时自动交卷</span>' : '') +
      '  </div>' +
      '</div>';

    html += '<div class="result-actions">' +
      '<button class="btn btn-primary" id="btn-again">再练一次</button>' +
      '<button class="btn btn-ghost" id="btn-home">返回工作台</button>' +
      '<button class="btn btn-ghost" id="btn-rec">查看做题记录</button>' +
      '</div>';

    html += '<div class="card review-card">' +
      '<div class="tabs">' +
      '  <button data-rtab="wrong">错题回顾（' + missCount + '）</button>' +
      '  <button data-rtab="all">全部题目（' + r.total + '）</button>' +
      '</div>' +
      '<div id="rev-box" class="rev-box">' + reviewListHTML(r, state.reviewTab === 'wrong') + '</div>' +
      '</div>';

    appEl.innerHTML = shell('dashboard', '<div class="page-head"><h2>本次训练成绩</h2><p>交卷时间 ' + U.fmtDate(r.submittedAt) + '</p></div>' + html);
    bindShell();

    bindTabs(r);
    document.getElementById('btn-again').addEventListener('click', function () { onStartClick(); });
    document.getElementById('btn-home').addEventListener('click', function () { go('dashboard'); });
    document.getElementById('btn-rec').addEventListener('click', function () { go('records'); });
  }

  function bindTabs(record) {
    U.$$('[data-rtab]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-rtab') === state.reviewTab);
      b.addEventListener('click', function () {
        state.reviewTab = b.getAttribute('data-rtab');
        U.$$('[data-rtab]').forEach(function (x) { x.classList.toggle('active', x === b); });
        document.getElementById('rev-box').innerHTML = reviewListHTML(record, state.reviewTab === 'wrong');
      });
    });
  }

  function reviewListHTML(record, onlyWrong) {
    var items = record.questions.map(function (q, i) { return { q: q, i: i }; });
    if (onlyWrong) items = items.filter(function (x) { return !x.q.isCorrect; });
    if (!items.length) {
      return '<div class="empty empty-good">本次训练没有错题，全部答对，表现优秀。</div>';
    }
    return '<div class="rev-list">' + items.map(function (x) { return reviewItemHTML(x.q, x.i); }).join('') + '</div>';
  }

  function reviewItemHTML(q, idx) {
    var status = q.isCorrect ? '对' : (q.userAnswer.length ? '错' : '未答');
    var statusCls = q.isCorrect ? 'tag-ok' : 'tag-no';
    return '<article class="rev-item">' +
      '<div class="rev-head">' +
      '  <span class="tag ' + statusCls + '">' + status + '</span>' +
      '  <span class="tag tag-plain">' + (TYPE_LABEL[q.type] || '单选题') + '</span>' +
      '  <span class="rev-no">第 ' + (idx + 1) + ' 题</span>' +
      '</div>' +
      '<div class="rev-stem">' + U.esc(q.stem) + '</div>' +
      optionsReviewHTML(q) +
      answerSummaryHTML(q) +
      analysisHTML(q) +
      '</article>';
  }

  function optionsReviewHTML(q) {
    return '<div class="opt-list review">' + q.options.map(function (o, k) {
      var key = LETTERS[k];
      var isAns = (q.answer || []).indexOf(key) > -1;
      var isUser = (q.userAnswer || []).indexOf(key) > -1;
      var cls = 'opt ro';
      if (isAns) cls += ' is-correct';
      else if (isUser) cls += ' is-wrong';
      var mark = '';
      if (isAns && isUser) mark = '<span class="mark ok">正确答案 · 你的选择</span>';
      else if (isAns) mark = '<span class="mark ok">正确答案</span>';
      else if (isUser) mark = '<span class="mark no">你的选择</span>';
      return '<div class="' + cls + '"><span class="opt-key">' + key + '</span><span class="opt-text">' + U.esc(o) + '</span>' + mark + '</div>';
    }).join('') + '</div>';
  }

  function answerSummaryHTML(q) {
    var ua = (q.userAnswer || []).length ? q.userAnswer.join('、') : '未作答';
    var ca = (q.answer || []).join('、');
    return '<div class="ans-row">' +
      '<span class="ans-item"><span class="ans-label">你的答案</span><span class="ans-val ' + (q.isCorrect ? 'ok' : 'no') + '">' + U.esc(ua) + '</span></span>' +
      '<span class="ans-item"><span class="ans-label">正确答案</span><span class="ans-val ok">' + U.esc(ca) + '</span></span>' +
      '</div>';
  }

  function analysisHTML(q) {
    if (!q.analysis) return '<div class="analysis analysis-empty"><span class="an-label">解析</span><p>本题暂无解析。</p></div>';
    return '<div class="analysis"><span class="an-label">解析</span><p>' + U.esc(q.analysis) + '</p></div>';
  }

  /* ================= 做题记录 ================= */
  function renderRecords() {
    var uid = state.user.studentId;
    var records = Store.getRecords(uid);
    var stats = Store.getStats(uid);
    var html = '<div class="page-head"><h2>做题记录</h2><p>共 ' + records.length + ' 次训练记录，点击"查看"可回顾整卷与错题解析。</p></div>';

    html += '<div class="stat-row">' +
      statCard(records.length, '累计训练', '次') +
      statCard(stats.best, '最高得分', '分') +
      statCard(stats.avg, '平均得分', '分') +
      '<div class="stat stat-action"><button class="btn btn-ghost btn-sm" id="btn-clear">清空记录</button></div>' +
      '</div>';

    if (!records.length) {
      html += '<div class="card"><div class="empty">暂无训练记录。<button class="link" id="btn-go-start">立即开始一次训练 ›</button></div></div>';
    } else {
      html += '<div class="card table-card"><table class="table"><thead><tr>' +
        '<th style="width:56px">序号</th><th>交卷时间</th><th>用时</th><th>得分</th><th>答对/答错/未答</th><th>状态</th><th style="width:90px">操作</th>' +
        '</tr></thead><tbody>' +
        records.map(function (r, i) {
          var okCls = r.score >= CFG.excellentScore ? 'ok' : '';
          return '<tr>' +
            '<td class="td-no">' + (i + 1) + '</td>' +
            '<td>' + U.fmtDate(r.submittedAt) + '</td>' +
            '<td>' + U.fmtDuration(r.durationSec) + '</td>' +
            '<td class="td-score ' + okCls + '">' + r.score + '</td>' +
            '<td class="td-meta">' + r.correct + ' / ' + r.wrong + ' / ' + r.blank + '</td>' +
            '<td>' + (r.autoSubmitted ? '<span class="tag tag-warn">超时交卷</span>' : '<span class="tag tag-plain">正常交卷</span>') + '</td>' +
            '<td><button class="link" data-open="' + r.id + '">查看</button></td>' +
            '</tr>';
        }).join('') +
        '</tbody></table></div>';
    }

    appEl.innerHTML = shell('records', html);
    bindShell();
    U.$$('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () {
        var rec = Store.getRecord(uid, b.getAttribute('data-open'));
        if (!rec) return U.toast('记录不存在', 'error');
        state.review = rec; state.reviewTab = defaultTab(rec); go('review');
      });
    });
    var gs = document.getElementById('btn-go-start');
    if (gs) gs.addEventListener('click', function () { go('dashboard'); });
    var cl = document.getElementById('btn-clear');
    if (cl) cl.addEventListener('click', function () {
      U.confirm('清空全部记录', '将删除本账号的全部训练记录、错题本与未完成草稿，且无法恢复。是否确认？', { okText: '确认清空' }).then(function (ok) {
        if (!ok) return;
        Store.clearRecords(uid);
        U.toast('已清空');
        renderRecords();
      });
    });
  }

  /* ================= 记录详情 / 整卷回顾 ================= */
  function renderReview() {
    var r = state.review;
    if (!r) { go('records'); return; }
    var excellent = r.score >= CFG.excellentScore;
    var head = '<div class="page-head"><h2>训练详情</h2><p>交卷时间 ' + U.fmtDate(r.submittedAt) + ' · 用时 ' + U.fmtDuration(r.durationSec) + (r.autoSubmitted ? ' · 超时自动交卷' : '') + '</p></div>';

    var summary = '<div class="summary-bar">' +
      '<div class="sb-score ' + (excellent ? 'ok' : '') + '">' + r.score + '<span>分</span></div>' +
      '<div class="sb-msg">' + (excellent ? '非常棒，请继续保持！' : '请继续努力！') + '</div>' +
      '<div class="sb-meta">答对 ' + r.correct + ' 题 · 答错 ' + r.wrong + ' 题 · 未答 ' + r.blank + ' 题 · 满分 ' + CFG.totalScore + ' 分</div>' +
      '</div>';

    var body = '<div class="card review-card">' +
      '<div class="tabs">' +
      '  <button data-rtab="wrong">错题回顾（' + (r.wrong + r.blank) + '）</button>' +
      '  <button data-rtab="all">全部题目（' + r.total + '）</button>' +
      '</div>' +
      '<div id="rev-box" class="rev-box">' + reviewListHTML(r, state.reviewTab === 'wrong') + '</div>' +
      '</div>';

    appEl.innerHTML = shell('records', head + summary + body + '<div class="result-actions"><button class="btn btn-ghost" id="btn-back">返回记录列表</button></div>');
    bindShell();
    bindTabs(r);
    document.getElementById('btn-back').addEventListener('click', function () { go('records'); });
  }

  /* ================= 错题本 ================= */
  function renderWrongBook() {
    var uid = state.user.studentId;
    var items = Store.getWrongItems(uid);
    var counts = { all: items.length, single: 0, multiple: 0, judge: 0 };
    items.forEach(function (x) { counts[x.question.type] = (counts[x.question.type] || 0) + 1; });

    var html = '<div class="page-head"><h2>错题本</h2><p>系统自动汇总历次训练中的错题（含未作答题目），共 ' + items.length + ' 题。掌握后可标记移出。</p></div>';

    if (!items.length) {
      html += '<div class="card"><div class="empty empty-good">错题本为空。继续保持，认真对待每一次训练。</div></div>';
      appEl.innerHTML = shell('wrongbook', html);
      bindShell();
      return;
    }

    html += '<div class="filter-bar">' +
      '<div class="chips">' +
      '  <button class="chip active" data-type="all">全部 ' + counts.all + '</button>' +
      '  <button class="chip" data-type="single">单选题 ' + counts.single + '</button>' +
      '  <button class="chip" data-type="multiple">多选题 ' + counts.multiple + '</button>' +
      '  <button class="chip" data-type="judge">判断题 ' + counts.judge + '</button>' +
      '</div>' +
      '<input class="search" id="wb-search" type="search" placeholder="搜索题干关键词">' +
      '</div>';

    html += '<div id="wb-list">' + items.map(wrongItemHTML).join('') + '</div>';

    appEl.innerHTML = shell('wrongbook', html);
    bindShell();

    U.$$('[data-master]').forEach(function (b) {
      b.addEventListener('click', function () {
        var qid = b.getAttribute('data-master');
        U.confirm('标记为已掌握', '标记后该题将从错题本移出，是否继续？', { okText: '标记掌握' }).then(function (ok) {
          if (!ok) return;
          Store.markMastered(uid, qid);
          U.toast('已移出错题本', 'success');
          renderWrongBook();
        });
      });
    });

    function applyFilter() {
      var type = (document.querySelector('.chip.active') || {}).getAttribute
        ? document.querySelector('.chip.active').getAttribute('data-type') : 'all';
      var kw = (document.getElementById('wb-search').value || '').trim();
      var listEl = document.getElementById('wb-list');
      var shown = 0;
      items.forEach(function (it) {
        var el = listEl.querySelector('[data-qid="' + it.id + '"]');
        if (!el) return;
        var okType = type === 'all' || it.question.type === type;
        var okKw = !kw || it.question.stem.indexOf(kw) > -1;
        var show = okType && okKw;
        el.style.display = show ? '' : 'none';
        if (show) shown++;
      });
      var tip = document.getElementById('wb-empty');
      if (!shown) {
        if (!tip) {
          tip = document.createElement('div');
          tip.id = 'wb-empty';
          tip.className = 'empty';
          tip.textContent = '没有符合条件的错题。';
          listEl.appendChild(tip);
        }
      } else if (tip) tip.remove();
    }

    U.$$('.chip').forEach(function (c) {
      c.addEventListener('click', function () {
        U.$$('.chip').forEach(function (x) { x.classList.toggle('active', x === c); });
        applyFilter();
      });
    });
    document.getElementById('wb-search').addEventListener('input', applyFilter);
  }

  function wrongItemHTML(it) {
    var q = it.question;
    return '<article class="wrong-item" data-qid="' + U.esc(it.id) + '" data-type="' + q.type + '">' +
      '<div class="wi-head">' +
      '  <span class="tag tag-no">错 ' + it.count + ' 次</span>' +
      '  <span class="tag tag-plain">' + (TYPE_LABEL[q.type] || '单选题') + '</span>' +
      '  <span class="wi-date">最近 ' + U.fmtDateShort(it.lastAt) + '</span>' +
      '  <button class="link wi-master" data-master="' + U.esc(it.id) + '">标记已掌握</button>' +
      '</div>' +
      '<div class="rev-stem">' + U.esc(q.stem) + '</div>' +
      optionsReviewHTML({ options: q.options, answer: q.answer, userAnswer: it.userAnswer }) +
      answerSummaryHTML({ answer: q.answer, userAnswer: it.userAnswer, isCorrect: false }) +
      analysisHTML(q) +
      '</article>';
  }

  /* ================= 填空背诵 ================= */
  var fillSec = 'all', fillKw = '';

  function renderFill() {
    var items = window.FILL_QUESTIONS || [];
    var mastered = Store.getFillMastered();
    var sections = [];
    items.forEach(function (it) { if (sections.indexOf(it.section) === -1) sections.push(it.section); });
    var counts = {};
    items.forEach(function (it) { counts[it.section] = (counts[it.section] || 0) + 1; });
    var masteredCount = items.filter(function (it) { return mastered.indexOf(it.id) > -1; }).length;

    var html = '<div class="page-head"><h2>填空背诵</h2><p>2026 年题库中的填空题、简答题，共 ' + items.length + ' 题（随机训练不抽此类题）。先自己回忆，再点“显示答案”核对，可把已掌握的题标记移出待复习清单。</p></div>';

    html += '<div class="stat-row stat-row-3">' +
      '<div class="stat"><div class="stat-num" id="fill-num-all">' + items.length + '<span class="stat-unit">题</span></div><div class="stat-label">填空/简答总数</div></div>' +
      '<div class="stat"><div class="stat-num" id="fill-num-mastered">' + masteredCount + '<span class="stat-unit">题</span></div><div class="stat-label">已掌握</div></div>' +
      '<div class="stat"><div class="stat-num" id="fill-num-todo">' + (items.length - masteredCount) + '<span class="stat-unit">题</span></div><div class="stat-label">待巩固</div></div>' +
      '</div>';

    html += '<div class="filter-bar">' +
      '<div class="chips" id="fill-chips">' +
      '<button class="chip active" data-fsec="all">全部 ' + items.length + '</button>' +
      sections.map(function (sec) {
        return '<button class="chip" data-fsec="' + U.esc(sec) + '">' + U.esc(sec) + ' ' + counts[sec] + '</button>';
      }).join('') +
      '</div>' +
      '<input class="search" id="fill-search" type="search" placeholder="搜索题干关键词">' +
      '</div>';

    html += '<div class="fill-tools">' +
      '<button class="btn btn-sm btn-ghost" id="fill-show-all">全部显示答案</button>' +
      '<button class="btn btn-sm btn-ghost" id="fill-hide-all">全部隐藏答案</button>' +
      '</div>';

    html += '<div id="fill-list"></div>';

    appEl.innerHTML = shell('fill', html);
    bindShell();
    fillSec = 'all'; fillKw = '';
    renderFillList();

    document.getElementById('fill-chips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-fsec]');
      if (!b) return;
      fillSec = b.getAttribute('data-fsec');
      U.$$('#fill-chips .chip').forEach(function (x) { x.classList.toggle('active', x === b); });
      renderFillList();
    });
    document.getElementById('fill-search').addEventListener('input', function (e) {
      fillKw = e.target.value.trim();
      renderFillList();
    });
    document.getElementById('fill-show-all').addEventListener('click', function () {
      U.$$('#fill-list .fill-card').forEach(function (c) {
        c.classList.add('show');
        var b = c.querySelector('[data-fshow]');
        if (b) b.textContent = '隐藏答案';
      });
    });
    document.getElementById('fill-hide-all').addEventListener('click', function () {
      U.$$('#fill-list .fill-card').forEach(function (c) {
        c.classList.remove('show');
        var b = c.querySelector('[data-fshow]');
        if (b) b.textContent = '显示答案';
      });
    });
  }

  function renderFillList() {
    var items = (window.FILL_QUESTIONS || []).filter(function (it) {
      var okSec = fillSec === 'all' || it.section === fillSec;
      var okKw = !fillKw || it.stem.indexOf(fillKw) > -1 || it.answers.join('').indexOf(fillKw) > -1;
      return okSec && okKw;
    });
    var list = document.getElementById('fill-list');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="card"><div class="empty">没有符合条件的题目。</div></div>';
      return;
    }
    list.innerHTML = items.map(fillCardHTML).join('');
    U.$$('#fill-list [data-fshow]').forEach(function (b) {
      b.addEventListener('click', function () {
        var card = b.closest('.fill-card');
        var on = card.classList.toggle('show');
        b.textContent = on ? '隐藏答案' : '显示答案';
      });
    });
    U.$$('#fill-list [data-fmaster]').forEach(function (b) {
      b.addEventListener('click', function () {
        var card = b.closest('.fill-card');
        var id = b.getAttribute('data-fmaster');
        var on = !card.classList.contains('mastered');
        Store.setFillMastered(id, on);
        card.classList.toggle('mastered', on);
        b.textContent = on ? '已掌握 ✓' : '标记已掌握';
        updateFillStats();
      });
    });
  }

  function updateFillStats() {
    var items = window.FILL_QUESTIONS || [];
    var mastered = Store.getFillMastered();
    var m = items.filter(function (it) { return mastered.indexOf(it.id) > -1; }).length;
    var a = document.getElementById('fill-num-mastered');
    var t = document.getElementById('fill-num-todo');
    if (a) a.innerHTML = m + '<span class="stat-unit">题</span>';
    if (t) t.innerHTML = (items.length - m) + '<span class="stat-unit">题</span>';
  }

  function fillCardHTML(it) {
    var mastered = Store.getFillMastered().indexOf(it.id) > -1;
    var stem = U.esc(it.stem).replace(/＿＿＿＿/g, '<span class="blank"></span>');
    var ans = it.answers.length
      ? (it.answers.length === 1 && it.answers[0].length > 40
          ? '<span class="fill-ans-item">' + U.esc(it.answers[0]) + '</span>'
          : it.answers.map(function (a, i) {
              return '<span class="fill-ans-item">' + (it.answers.length > 1 ? (i + 1) + '. ' : '') + U.esc(a) + '</span>';
            }).join(''))
      : '<span class="fill-ans-item is-muted">本题原文为完整表述，无挖空。</span>';
    return '<article class="fill-card' + (mastered ? ' mastered' : '') + '" data-fid="' + U.esc(it.id) + '">' +
      '<div class="fill-head">' +
      '  <span class="tag tag-plain">' + (it.kind === '简答题' ? '简答题' : '填空题') + '</span>' +
      '  <span class="fill-sec">' + U.esc(it.section) + '</span>' +
      '  <button class="link" data-fmaster="' + U.esc(it.id) + '">' + (mastered ? '已掌握 ✓' : '标记已掌握') + '</button>' +
      '</div>' +
      '<div class="fill-stem">' + stem + '</div>' +
      '<div class="fill-actions"><button class="btn btn-sm btn-primary" data-fshow="' + U.esc(it.id) + '">显示答案</button></div>' +
      '<div class="fill-answers"><span class="fill-ans-label">参考答案</span>' + ans + '</div>' +
      '</article>';
  }

  /* ================= 题库管理 ================= */
  function renderBank() {
    var bank = Store.getBank();
    var counts = { single: 0, multiple: 0, judge: 0 };
    bank.forEach(function (q) { counts[q.type] = (counts[q.type] || 0) + 1; });

    var html = '<div class="page-head"><h2>题库管理</h2><p>当前题库共 ' + bank.length + ' 题，由 2026 年题库和 2025 年独有增补题组成，均可用于随机训练。原题库中的填空题、简答题无法自动判分，请到“填空背诵”中复习。题库更新后，新的训练将按新题库抽题，历史记录不受影响。</p></div>';

    var y25 = bank.filter(function (q) { return q.year === 2025; }).length;
    var y26 = bank.length - y25;
    html += '<div class="stat-row">' +
      statCard(bank.length, '题库总题数', '题') +
      statCard(counts.single, '单选题', '题') +
      statCard(counts.multiple, '多选题', '题') +
      statCard(counts.judge, '判断题', '题') +
      '</div>';

    html += '<div class="notice">题库构成：2026 年题库 ' + y26 + ' 题，2025 年独有增补 ' + y25 + ' 题；填空、简答题请到“填空背诵”中复习。</div>';

    if (bank.length < CFG.questionCount) {
      html += '<div class="notice">当前题库不足 ' + CFG.questionCount + ' 题，每次训练将使用题库中的全部题目，建议补充至 ' + CFG.questionCount + ' 题以上。</div>';
    }

    html += '<div class="grid-2">';

    html += '<div class="card">' +
      '<div class="card-head"><h3>文本导入（推荐）</h3></div>' +
      '<div class="card-body">' +
      '<p class="hint">支持"序号 + 题干 + 选项 + 答案 + 解析"的常见题库格式，自动识别单选、多选、判断。</p>' +
      '<textarea class="ta" id="ta-text" placeholder="1. 中国共产党成立于哪一年？&#10;A. 1919 年&#10;B. 1920 年&#10;C. 1921 年&#10;D. 1922 年&#10;答案：C&#10;解析：1921 年 7 月，中国共产党第一次全国代表大会在上海召开，宣告中国共产党成立。"></textarea>' +
      '<div class="import-row">' +
      '  <label class="file-btn">选择 .txt 文件<input type="file" id="file-text" accept=".txt,.md,text/plain" hidden></label>' +
      '  <label class="check"><input type="checkbox" id="ck-overwrite"> 覆盖现有题库</label>' +
      '  <button class="btn btn-primary" id="btn-import-text">解析并导入</button>' +
      '</div>' +
      '<div id="text-result" class="import-result"></div>' +
      '</div></div>';

    html += '<div class="card">' +
      '<div class="card-head"><h3>JSON 导入</h3></div>' +
      '<div class="card-body">' +
      '<p class="hint">字段：type（single/multiple/judge）、stem、options（数组）、answer（字母数组）、analysis。</p>' +
      '<textarea class="ta ta-sm" id="ta-json" placeholder="[{&quot;type&quot;:&quot;single&quot;,&quot;stem&quot;:&quot;题干&quot;,&quot;options&quot;:[&quot;选项A&quot;,&quot;选项B&quot;],&quot;answer&quot;:[&quot;A&quot;],&quot;analysis&quot;:&quot;解析&quot;}]"></textarea>' +
      '<div class="import-row">' +
      '  <label class="file-btn">选择 .json 文件<input type="file" id="file-json" accept=".json,application/json" hidden></label>' +
      '  <button class="btn btn-primary" id="btn-import-json">解析并导入</button>' +
      '  <button class="btn btn-ghost" id="btn-export">导出题库</button>' +
      '</div>' +
      '<div id="json-result" class="import-result"></div>' +
      '</div></div>';

    html += '</div>';

    html += '<div class="card">' +
      '<div class="card-head"><h3>题库预览</h3><div class="bank-tools">' +
      '<input class="search" id="bank-search" type="search" placeholder="搜索题干">' +
      '<button class="btn btn-sm btn-ghost" id="btn-reset-bank">恢复默认题库</button>' +
      '</div></div>' +
      '<div class="card-body bank-body" id="bank-list">' + bankListHTML(bank, '') + '</div>' +
      '</div>';

    appEl.innerHTML = shell('bank', html);
    bindShell();

    /* --- 文本导入 --- */
    document.getElementById('file-text').addEventListener('change', function (e) {
      readFile(e.target.files[0], function (txt) { document.getElementById('ta-text').value = txt; });
    });
    document.getElementById('btn-import-text').addEventListener('click', function () {
      var txt = document.getElementById('ta-text').value;
      var res = Parser.parseText(txt);
      renderImportResult('text-result', res);
      if (!res.questions.length) return U.toast('未解析出有效题目，请检查格式', 'error');
      var box = document.getElementById('text-result').innerHTML;
      commitImport(res.questions, document.getElementById('ck-overwrite').checked, function () {
        var ta = document.getElementById('ta-text');
        if (ta) ta.value = txt;
        var r = document.getElementById('text-result');
        if (r) r.innerHTML = box;
      });
    });

    /* --- JSON 导入 --- */
    document.getElementById('file-json').addEventListener('change', function (e) {
      readFile(e.target.files[0], function (txt) { document.getElementById('ta-json').value = txt; });
    });
    document.getElementById('btn-import-json').addEventListener('click', function () {
      var txt = document.getElementById('ta-json').value.trim();
      if (!txt) return U.toast('请先粘贴 JSON 内容', 'error');
      var data;
      try { data = JSON.parse(txt); }
      catch (err) { return U.toast('JSON 格式错误：' + err.message, 'error'); }
      var res = Parser.parseJSON(data);
      renderImportResult('json-result', res);
      if (!res.questions.length) return U.toast('未解析出有效题目', 'error');
      var box2 = document.getElementById('json-result').innerHTML;
      commitImport(res.questions, true, function () {
        var ta2 = document.getElementById('ta-json');
        if (ta2) ta2.value = txt;
        var r2 = document.getElementById('json-result');
        if (r2) r2.innerHTML = box2;
      });
    });

    document.getElementById('btn-export').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(Store.getBank(), null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '题库_' + U.fmtDate(Date.now()).replace(/[-: ]/g, '') + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });

    document.getElementById('btn-reset-bank').addEventListener('click', function () {
      U.confirm('恢复默认题库', '将清除当前导入的题库并恢复为系统默认的 2026 年题库，是否继续？', { okText: '确认恢复' }).then(function (ok) {
        if (!ok) return;
        Store.resetBank();
        U.toast('已恢复默认题库');
        renderBank();
      });
    });

    document.getElementById('bank-search').addEventListener('input', function (e) {
      document.getElementById('bank-list').innerHTML = bankListHTML(Store.getBank(), e.target.value.trim());
      bindBankDelete();
    });
    bindBankDelete();
  }

  function bindBankDelete() {
    U.$$('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var qid = b.getAttribute('data-del');
        var bank = Store.getBank().filter(function (q) { return q.id !== qid; });
        Store.setBank(bank);
        U.toast('已删除该题');
        document.getElementById('bank-list').innerHTML = bankListHTML(bank, (document.getElementById('bank-search').value || '').trim());
        bindBankDelete();
      });
    });
  }

  function bankListHTML(bank, kw) {
    var list = bank;
    if (kw) list = bank.filter(function (q) { return q.stem.indexOf(kw) > -1; });
    if (!list.length) return '<div class="empty">题库为空。</div>';
    return '<div class="bank-list">' + list.slice(0, 700).map(function (q, i) {
      return '<div class="bank-row">' +
        '<div class="br-main">' +
        '  <div class="br-stem"><span class="tag tag-plain">' + (TYPE_LABEL[q.type] || '单选题') + '</span>' + (q.year === 2025 ? '<span class="tag tag-warn">2025增补</span>' : '') + U.esc(q.stem.length > 70 ? q.stem.slice(0, 70) + '…' : q.stem) + '</div>' +
        '  <div class="br-meta">答案：' + (q.answer || []).join('、') + ' · 选项 ' + (q.options || []).length + ' 个' + (q.analysis ? ' · 含解析' : ' · 无解析') + '</div>' +
        '</div>' +
        '<button class="link danger" data-del="' + U.esc(q.id) + '">删除</button>' +
        '</div>';
    }).join('') + (bank.length > 700 ? '<div class="empty">仅显示前 700 题，共 ' + bank.length + ' 题。</div>' : '') + '</div>';
  }

  function renderImportResult(elId, res) {
    var el = document.getElementById(elId);
    if (!el) return;
    var html = '<div class="' + (res.questions.length ? 'ir-ok' : 'ir-err') + '">解析成功 <b>' + res.questions.length + '</b> 题' +
      (res.errors.length ? '，<b>' + res.errors.length + '</b> 段未识别' : '') + '。</div>';
    if (res.errors.length) {
      html += '<ul class="err-list">' + res.errors.slice(0, 8).map(function (e) { return '<li>' + U.esc(e) + '</li>'; }).join('') + '</ul>';
      if (res.errors.length > 8) html += '<div class="hint">另有 ' + (res.errors.length - 8) + ' 条错误未显示。</div>';
    }
    el.innerHTML = html;
  }

  function commitImport(questions, overwrite, after) {
    var bank = overwrite ? [] : Store.getBank();
    var map = {};
    bank.forEach(function (q) { map[q.stem.replace(/\s+/g, '')] = true; });
    var added = 0;
    questions.forEach(function (q) {
      var key = q.stem.replace(/\s+/g, '');
      if (map[key]) return;
      map[key] = true;
      q.id = 'q' + Date.now().toString(36) + '_' + (added++);
      bank.push(q);
    });
    Store.setBank(bank);
    U.toast('导入完成，新增 ' + added + ' 题，题库共 ' + bank.length + ' 题', 'success');
    renderBank();
    if (typeof after === 'function') after();
  }

  function readFile(file, cb) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { cb(String(reader.result || '')); };
    reader.onerror = function () { U.toast('文件读取失败', 'error'); };
    reader.readAsText(file, 'utf-8');
  }

  /* 云端同步合并到本机后，刷新当前页面（答题中除外） */
  window.addEventListener('sync:updated', function () {
    state.user = Store.getProfile();
    if (state.view !== 'quiz') render();
  });

  /* ================= 启动 ================= */
  function boot() {
    state.user = Store.getProfile();
    state.view = 'dashboard';
    render();
  }

  window.addEventListener('beforeunload', function (e) {
    if (state.view === 'quiz' && state.draft) {
      Store.saveDraft(state.user.studentId, state.draft);
      e.preventDefault();
      e.returnValue = '训练尚未提交，确定离开吗？';
      return e.returnValue;
    }
  });

  boot();
})();
