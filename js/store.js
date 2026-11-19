/* =========================================================
 * 本地数据层：账号、题库、暂存草稿、做题记录、错题掌握标记
 * 数据保存在浏览器 localStorage 中，按学号隔离
 * =======================================================*/
window.Store = (function () {
  'use strict';
  var CFG = window.APP_CONFIG;
  var P = 'tkc26_';
  var K_USERS = P + 'users_v1';
  var K_BANK = P + 'bank_v2';
  var K_CUR = P + 'cur_user_v1';
  var K_NAME = P + 'nickname_v1';
  var K_FILL = P + 'fill_mastered_v1';
  function kDraft(id) { return P + 'draft_' + id; }
  function kRecords(id) { return P + 'records_' + id; }
  function kMastered(id) { return P + 'mastered_' + id; }

  function read(key, def) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? def : JSON.parse(raw);
    } catch (e) { return def; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { }
  }

  /* 简单口令散列（避免明文存放） */
  function hash(str) {
    var s = 'tkc$2024$' + String(str);
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = (h1 ^ c); h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (Math.imul(h2 ^ c, 2654435761) + i) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  /* ---------------- 本机学习档案（无登录模块） ---------------- */
  function getProfile() {
    var name = read(K_NAME, '学习学员');
    if (!name || String(name).length < 1) name = '学习学员';
    return { studentId: 'local', name: String(name), admin: false };
  }
  function setName(name) { return write(K_NAME, String(name || '').trim()); }

  /* ---------------- 填空背诵掌握标记 ---------------- */
  function getFillMastered() {
    var l = read(K_FILL, []);
    return Array.isArray(l) ? l : [];
  }
  function setFillMastered(id, on) {
    var l = getFillMastered();
    var i = l.indexOf(id);
    if (on && i < 0) l.push(id);
    if (!on && i > -1) l.splice(i, 1);
    return write(K_FILL, l);
  }

  function getUsers() { return read(K_USERS, {}); }
  function saveUsers(u) { return write(K_USERS, u); }

  function register(name, sid, pwd, pwd2, adminCode) {
    name = String(name || '').trim();
    sid = String(sid || '').trim();
    pwd = String(pwd || '');
    if (!name || name.length < 2 || name.length > 20) return { ok: false, msg: '请填写真实姓名（2-20 个字符）' };
    if (!/^[0-9A-Za-z_-]{4,20}$/.test(sid)) return { ok: false, msg: '学号/工号应为 4-20 位数字或字母' };
    if (pwd.length < 6) return { ok: false, msg: '密码至少 6 位' };
    if (pwd !== String(pwd2 || '')) return { ok: false, msg: '两次输入的密码不一致' };
    var users = getUsers();
    if (users[sid]) return { ok: false, msg: '该学号已注册，请直接登录' };
    var isAdmin = false;
    adminCode = String(adminCode || '').trim();
    if (adminCode) {
      if (adminCode === String(CFG.adminCode || '')) isAdmin = true;
      else return { ok: false, msg: '管理员邀请码不正确，请核对后重试；普通成员注册无需填写' };
    }
    users[sid] = { studentId: sid, name: name, pwd: hash(pwd), admin: isAdmin, createdAt: Date.now() };
    if (!saveUsers(users)) return { ok: false, msg: '浏览器存储不可用，请更换浏览器或关闭无痕模式' };
    write(K_CUR, sid);
    return { ok: true, user: { studentId: sid, name: name, admin: isAdmin } };
  }

  function login(sid, pwd) {
    sid = String(sid || '').trim();
    var users = getUsers();
    var u = users[sid];
    if (!u) return { ok: false, code: 'NOT_FOUND', msg: '该学号尚未注册，请先注册' };
    if (u.pwd !== hash(String(pwd || ''))) return { ok: false, code: 'BAD_PWD', msg: '密码不正确，请重新输入' };
    write(K_CUR, sid);
    return { ok: true, user: { studentId: u.studentId, name: u.name, admin: !!u.admin } };
  }

  /* 把云端账号还原到本机（换设备/换浏览器后首次登录时调用） */
  function importCloudUser(acc) {
    if (!acc || !acc.sid) return { ok: false, msg: '云端账号数据异常' };
    var sid = String(acc.sid);
    var users = getUsers();
    if (!users[sid]) {
      users[sid] = {
        studentId: sid,
        name: String(acc.name || sid),
        pwd: String(acc.pwd_hash || ''),
        admin: !!acc.admin,
        createdAt: Date.now()
      };
      if (!saveUsers(users)) return { ok: false, msg: '浏览器存储不可用，请更换浏览器或关闭无痕模式' };
    } else if (acc.admin && !users[sid].admin) {
      users[sid].admin = true;
      saveUsers(users);
    }
    write(K_CUR, sid);
    var u = users[sid];
    return { ok: true, user: { studentId: u.studentId, name: u.name, admin: !!u.admin } };
  }

  /* 导出本机账号的散列信息（用于注册/登录时备份到云端） */
  function exportAccount(sid) {
    var u = getUsers()[String(sid || '').trim()];
    return u ? { studentId: u.studentId, name: u.name, pwdHash: u.pwd, admin: !!u.admin } : null;
  }

  function logout() { remove(K_CUR); }

  function currentUser() {
    var sid = read(K_CUR, null);
    if (!sid) return null;
    var u = getUsers()[sid];
    return u ? { studentId: u.studentId, name: u.name, admin: !!u.admin } : null;
  }

  /* 已有账号补开管理员权限（管理员邀请码验证） */
  function grantAdmin(sid, adminCode) {
    sid = String(sid || '').trim();
    if (String(adminCode || '').trim() !== String(CFG.adminCode || '')) return { ok: false, msg: '管理员邀请码不正确' };
    var users = getUsers();
    if (!users[sid]) return { ok: false, msg: '账号不存在' };
    users[sid].admin = true;
    saveUsers(users);
    return { ok: true };
  }

  /* ---------------- 云同步：导出 / 合并 ---------------- */
  function exportSyncData() {
    return {
      v: 1,
      name: read(K_NAME, '学习学员'),
      records: getRecords('local'),
      mastered: read(kMastered('local'), []),
      fillMastered: getFillMastered(),
      exportedAt: Date.now()
    };
  }

  function importSyncData(data) {
    if (!data || typeof data !== 'object') return { changed: false, added: 0 };
    var changed = false, added = 0;

    /* 昵称：本机仍为默认昵称时才采用云端昵称 */
    var curName = read(K_NAME, '学习学员');
    if (data.name && String(data.name).trim() && (!curName || curName === '学习学员')) {
      write(K_NAME, String(data.name).trim());
      changed = true;
    }

    /* 做题记录：按 id 合并，保留题目更完整的一份 */
    var map = {};
    getRecords('local').forEach(function (r) { if (r && r.id) map[r.id] = r; });
    var remote = Array.isArray(data.records) ? data.records : [];
    remote.forEach(function (r) {
      if (!r || !r.id) return;
      if (!map[r.id]) {
        map[r.id] = r; added++;
      } else {
        var a = (map[r.id].questions || []).length;
        var b = (r.questions || []).length;
        if (b > a) map[r.id] = r;
      }
    });
    if (remote.length) {
      var list = Object.keys(map).map(function (k) { return map[k]; })
        .sort(function (a, b) { return (b.submittedAt || 0) - (a.submittedAt || 0); });
      var cap = CFG.maxRecords || 200;
      if (list.length > cap) list = list.slice(0, cap);
      write(kRecords('local'), list);
      if (added) changed = true;
    }

    /* 错题掌握 / 填空掌握：取并集 */
    function union(key, incoming) {
      var cur = read(key, []);
      if (!Array.isArray(cur)) cur = [];
      var set = {};
      cur.forEach(function (x) { set[x] = 1; });
      (Array.isArray(incoming) ? incoming : []).forEach(function (x) {
        if (x && !set[x]) { set[x] = 1; cur.push(x); changed = true; }
      });
      write(key, cur);
    }
    union(kMastered('local'), data.mastered);
    union(K_FILL, data.fillMastered);

    return { changed: changed, added: added };
  }

  /* ---------------- 题库 ---------------- */
  function getBank() {
    var bank = read(K_BANK, null);
    if (bank && Array.isArray(bank)) return bank;
    return (window.DEFAULT_QUESTIONS || []).slice();
  }
  function hasCustomBank() { return Array.isArray(read(K_BANK, null)); }
  function setBank(list) { return write(K_BANK, list || []); }
  function resetBank() { remove(K_BANK); return getBank(); }

  /* ---------------- 草稿 ---------------- */
  function getDraft(uid) { return read(kDraft(uid), null); }
  function saveDraft(uid, draft) {
    draft.savedAt = Date.now();
    return write(kDraft(uid), draft);
  }
  function clearDraft(uid) { remove(kDraft(uid)); }

  /* ---------------- 记录 ---------------- */
  function getRecords(uid) {
    var list = read(kRecords(uid), []);
    return Array.isArray(list) ? list : [];
  }
  function addRecord(uid, rec) {
    var list = getRecords(uid);
    rec.synced = !!rec.synced;
    list.unshift(rec);
    var cap = CFG.maxRecords || 200;
    if (list.length > cap) list = list.slice(0, cap);
    if (!write(kRecords(uid), list)) {
      // 存储空间不足时，逐条丢弃最旧记录后重试
      while (list.length > 5) {
        list.pop();
        if (write(kRecords(uid), list)) break;
      }
    }
    return true;
  }
  function markSynced(uid, recId) {
    var list = getRecords(uid);
    var hit = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === recId) { list[i].synced = true; hit = true; }
    }
    if (hit) write(kRecords(uid), list);
  }
  function getRecord(uid, id) {
    var list = getRecords(uid);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function clearRecords(uid) { remove(kRecords(uid)); remove(kMastered(uid)); remove(kDraft(uid)); }

  /* ---------------- 错题掌握标记 ---------------- */
  function getMastered(uid) { return read(kMastered(uid), []); }
  function markMastered(uid, qid) {
    var list = getMastered(uid);
    if (list.indexOf(qid) === -1) list.push(qid);
    write(kMastered(uid), list);
  }
  function unmarkMastered(uid, qid) {
    var list = getMastered(uid).filter(function (x) { return x !== qid; });
    write(kMastered(uid), list);
  }

  /* ---------------- 错题本（由历史记录聚合） ---------------- */
  function getWrongItems(uid) {
    var records = getRecords(uid);
    var mastered = getMastered(uid);
    var map = {};
    for (var i = records.length - 1; i >= 0; i--) { // 由旧到新
      var r = records[i];
      var qs = r.questions || [];
      for (var j = 0; j < qs.length; j++) {
        var q = qs[j];
        if (q.isCorrect) continue;
        if (!map[q.id]) map[q.id] = { id: q.id, count: 0, lastAt: r.submittedAt, question: q, userAnswer: q.userAnswer || [] };
        map[q.id].count += 1;
        map[q.id].lastAt = r.submittedAt;
        map[q.id].question = q;
        map[q.id].userAnswer = q.userAnswer || [];
      }
    }
    return Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (x) { return mastered.indexOf(x.id) === -1; })
      .sort(function (a, b) { return b.lastAt - a.lastAt; });
  }

  /* ---------------- 统计 ---------------- */
  function getStats(uid) {
    var records = getRecords(uid);
    var best = 0, sum = 0;
    records.forEach(function (r) { sum += r.score; if (r.score > best) best = r.score; });
    return {
      count: records.length,
      best: best,
      avg: records.length ? Math.round(sum / records.length * 10) / 10 : 0
    };
  }

  return {
    getProfile: getProfile, setName: setName, getFillMastered: getFillMastered, setFillMastered: setFillMastered,
    exportSyncData: exportSyncData, importSyncData: importSyncData,
    register: register, login: login, logout: logout, currentUser: currentUser, grantAdmin: grantAdmin,
    importCloudUser: importCloudUser, exportAccount: exportAccount, hash: hash,
    getBank: getBank, hasCustomBank: hasCustomBank, setBank: setBank, resetBank: resetBank,
    getDraft: getDraft, saveDraft: saveDraft, clearDraft: clearDraft,
    getRecords: getRecords, addRecord: addRecord, getRecord: getRecord, clearRecords: clearRecords, markSynced: markSynced,
    getMastered: getMastered, markMastered: markMastered, unmarkMastered: unmarkMastered,
    getWrongItems: getWrongItems, getStats: getStats
  };
})();
