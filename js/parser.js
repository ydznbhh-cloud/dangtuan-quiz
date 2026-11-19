/* =========================================================
 * 题库解析器：把纯文本题库 / JSON 转换成标准题目结构
 * 标准结构：{ id, type, stem, options:[String], answer:[String], analysis }
 * 无 DOM 依赖，便于单独测试
 * =======================================================*/
(function (global) {
  'use strict';

  var LETTERS = 'ABCDEFGH';

  function normalizeJudge(v) {
    var s = String(v == null ? '' : v).trim().toUpperCase();
    if (!s) return '';
    if (['正确', '对', '是', '√', 'T', 'TRUE', 'Y', 'YES', 'A'].indexOf(s) > -1) return '正确';
    if (['错误', '错', '否', '×', 'X', 'F', 'FALSE', 'N', 'NO', 'B'].indexOf(s) > -1) return '错误';
    return '';
  }

  function detectTypeTag(text) {
    var type = null, out = text;
    var m = out.match(/^[\s]*[【\[（(]\s*(单项选择题?|多项选择题?|不定项选择题?|单选题?|多选题?|判断题?)\s*[】\]）)]\s*[.、．:：]?\s*/) ||
            out.match(/^[\s]*(单项选择题?|多项选择题?|不定项选择题?|单选题?|多选题?|判断题?)\s*[：:、.．]\s*/);
    if (m) {
      var t = m[1];
      type = /多选|多项|不定项/.test(t) ? 'multiple' : (/判断/.test(t) ? 'judge' : 'single');
      out = out.slice(m[0].length);
    }
    var m2 = out.match(/[【\[（(]\s*(单项选择题?|多项选择题?|不定项选择题?|单选题?|多选题?|判断题?)\s*[】\]）)]\s*$/);
    if (m2) {
      var t2 = m2[1];
      if (!type) type = /多选|多项|不定项/.test(t2) ? 'multiple' : (/判断/.test(t2) ? 'judge' : 'single');
      out = out.slice(0, out.length - m2[0].length);
    }
    return { type: type, text: out };
  }

  var RE_ANSWER = /^[\s]*[【\[]?\s*(?:正确|参考|标准)?答\s*案\s*[】\]]?\s*[:：]?\s*([A-Ha-h][\sA-Ha-h,，、\/]*|正确|错误|对|错|√|×|T|F|TRUE|FALSE|是|否)\s*[。.]?\s*$/i;
  var RE_ANSWER_LOOSE = /^[\s]*[【\[]?\s*答\s*案\s*[】\]]?\s*[:：]\s*(.+)$/;
  var RE_ANALYSIS = /^[\s]*[【\[]?\s*(?:答案|试题|题目)?\s*解\s*析\s*[】\]]?\s*[:：]?\s*(.*)$/;
  var RE_OPTION = /^[\s]*[（(]?\s*([A-Ha-h])\s*[）)]?\s*[.、．:：)）]\s*(.*)$/;
  var RE_NUM_START = /^[\s]*(?:第\s*)?\d+\s*[、.．)）]\s*/;

  function parseBlock(lines, index) {
    var stemParts = [], options = [], analysisParts = [];
    var answerRaw = '', typeHint = null, stage = 'stem';

    for (var i = 0; i < lines.length; i++) {
      var t = String(lines[i]).replace(/\s+$/, '').trim();
      if (!t) {
        if (stage === 'analysis' && analysisParts.length) analysisParts.push('');
        continue;
      }

      // 1. 答案行
      var mA = t.match(RE_ANSWER) || t.match(RE_ANSWER_LOOSE);
      if (mA) { answerRaw = mA[1].trim(); stage = 'answer'; continue; }

      // 2. 解析行
      var mAn = t.match(RE_ANALYSIS);
      if (mAn) {
        stage = 'analysis';
        if (mAn[1] && mAn[1].trim()) analysisParts.push(mAn[1].trim());
        continue;
      }

      // 3. 选项行
      if (stage !== 'analysis') {
        var mO = t.match(RE_OPTION);
        if (mO) {
          options.push({ key: mO[1].toUpperCase(), text: (mO[2] || '').trim() });
          stage = 'option';
          continue;
        }
      }

      // 4. 题干 / 续行
      if (stage === 'stem') {
        var s = t.replace(RE_NUM_START, '');
        var tag = detectTypeTag(s);
        if (tag.type && !typeHint) typeHint = tag.type;
        if (tag.text.trim()) stemParts.push(tag.text.trim());
        continue;
      }
      if (stage === 'analysis') { analysisParts.push(t); continue; }
      if (stage === 'option') {
        if (options.length) options[options.length - 1].text += t;
        continue;
      }
    }

    var stem = stemParts.join('').trim();
    var analysis = analysisParts.join('\n').trim();
    var label = '第 ' + (index + 1) + ' 段';

    if (!stem) return { error: label + '：未能识别题干内容' };
    if (!answerRaw) return { error: label + '：未找到"答案："行（题干："' + stem.slice(0, 20) + '…"）' };

    // 判断题补全选项
    var judgeVal = normalizeJudge(answerRaw);
    var letters = [];
    if (/[A-Ha-h]/.test(answerRaw)) {
      letters = (answerRaw.toUpperCase().match(/[A-H]/g) || []).slice();
    }

    if (!options.length) {
      if (judgeVal) {
        options = [{ key: 'A', text: '正确' }, { key: 'B', text: '错误' }];
        letters = [judgeVal === '正确' ? 'A' : 'B'];
      }
    } else if (!letters.length && judgeVal) {
      // 选项为"正确/错误"类
      var hit = -1;
      for (var k = 0; k < options.length; k++) {
        if (normalizeJudge(options[k].text) === judgeVal) { hit = k; break; }
      }
      if (hit > -1) letters = [LETTERS[hit]];
    }

    // 答案按选项顺序去重排序
    var texts = options.map(function (o) { return o.text; });
    var idxs = [];
    letters.forEach(function (L) {
      var idx = LETTERS.indexOf(L);
      if (idx > -1 && idx < texts.length && idxs.indexOf(idx) === -1) idxs.push(idx);
    });
    idxs.sort(function (a, b) { return a - b; });

    if (!texts.length) return { error: label + '：未识别到选项（题干："' + stem.slice(0, 20) + '…"）' };
    if (texts.length < 2) return { error: label + '：选项少于 2 个（题干："' + stem.slice(0, 20) + '…"）' };
    if (!idxs.length) return { error: label + '：答案" ' + answerRaw + ' "无法匹配选项（题干："' + stem.slice(0, 20) + '…"）' };

    var type = typeHint;
    if (!type) {
      if (idxs.length > 1) type = 'multiple';
      else if (options.length === 2 && normalizeJudge(texts[0]) && normalizeJudge(texts[1])) type = 'judge';
      else type = 'single';
    }
    if (type === 'single' && idxs.length > 1) type = 'multiple';
    if (type === 'judge' && idxs.length !== 1) type = 'single';

    return {
      question: {
        id: 'imp' + Date.now().toString(36) + '_' + index,
        type: type,
        stem: stem,
        options: texts,
        answer: idxs.map(function (i) { return LETTERS[i]; }),
        analysis: analysis
      }
    };
  }

  function splitBlocks(text) {
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var hasNumber = lines.some(function (l) { return RE_NUM_START.test(l) && /\S/.test(l.replace(RE_NUM_START, '')); });
    var blocks = [], cur = [];
    if (hasNumber) {
      lines.forEach(function (l) {
        if (RE_NUM_START.test(l) && /\S/.test(l.replace(RE_NUM_START, ''))) {
          if (cur.length) blocks.push(cur);
          cur = [l];
        } else cur.push(l);
      });
      if (cur.length) blocks.push(cur);
    } else {
      lines.forEach(function (l) {
        if (!l.trim()) { if (cur.length) { blocks.push(cur); cur = []; } }
        else cur.push(l);
      });
      if (cur.length) blocks.push(cur);
    }
    return blocks;
  }

  function stemKey(s) { return String(s || '').replace(/\s+/g, '').replace(/[，。、；：？！,.;:?!"'（）()【】\[\]]/g, ''); }

  /** 解析纯文本题库 */
  function parseText(text) {
    var result = { questions: [], errors: [] };
    if (!text || !String(text).trim()) { result.errors.push('内容为空'); return result; }
    var blocks = splitBlocks(text);
    var seen = {};
    blocks.forEach(function (lines, i) {
      var r = parseBlock(lines, i);
      if (r.error) { result.errors.push(r.error); return; }
      var key = stemKey(r.question.stem);
      if (seen[key]) return;
      seen[key] = 1;
      result.questions.push(r.question);
    });
    return result;
  }

  /** 解析 JSON 题库（支持 array / {questions:[...]}） */
  function parseJSON(data) {
    var result = { questions: [], errors: [] };
    var arr = Array.isArray(data) ? data : (data && Array.isArray(data.questions) ? data.questions : null);
    if (!arr) { result.errors.push('JSON 格式不正确，应为题目数组或用 questions 字段包裹的数组'); return result; }
    var seen = {};
    arr.forEach(function (raw, i) {
      var label = '第 ' + (i + 1) + ' 题';
      if (!raw || typeof raw !== 'object') { result.errors.push(label + '：不是有效对象'); return; }
      var stem = String(raw.stem || raw.title || raw.question || '').trim();
      if (!stem) { result.errors.push(label + '：缺少题干'); return; }
      var opts = raw.options || raw.opts || [];
      var texts = [];
      if (Array.isArray(opts)) {
        texts = opts.map(function (o) {
          if (o && typeof o === 'object') return String(o.text || o.content || o.label || '').trim();
          return String(o == null ? '' : o).trim();
        });
      } else if (opts && typeof opts === 'object') {
        Object.keys(opts).sort().forEach(function (k) { texts.push(String(opts[k]).trim()); });
      }
      var ansRaw = raw.answer != null ? raw.answer : (raw.answers != null ? raw.answers : raw.correct);
      var ansArr = Array.isArray(ansRaw) ? ansRaw : String(ansRaw == null ? '' : ansRaw).split(/[\s,，、\/]+/);
      var letters = [];
      ansArr.forEach(function (a) {
        var s = String(a).trim().toUpperCase();
        if (/^[A-H]$/.test(s)) { if (letters.indexOf(s) === -1) letters.push(s); }
        else {
          var l = s.match(/[A-H]/g);
          if (l) l.forEach(function (x) { if (letters.indexOf(x) === -1) letters.push(x); });
        }
      });
      // 判断题答案
      if (!letters.length) {
        var jv = normalizeJudge(ansRaw);
        if (jv) {
          if (!texts.length) texts = ['正确', '错误'];
          var hit = -1;
          for (var k = 0; k < texts.length; k++) if (normalizeJudge(texts[k]) === jv) { hit = k; break; }
          if (hit > -1) letters = [LETTERS[hit]];
          else if (!texts.length) letters = [jv === '正确' ? 'A' : 'B'];
        }
      }
      if (texts.length < 2) { result.errors.push(label + '：选项少于 2 个'); return; }
      var idxs = letters.map(function (L) { return LETTERS.indexOf(L); })
        .filter(function (n) { return n > -1 && n < texts.length; })
        .sort(function (a, b) { return a - b; });
      if (!idxs.length) { result.errors.push(label + '：答案无法匹配选项'); return; }
      var type = String(raw.type || '').toLowerCase();
      if (!/^(single|multiple|judge)$/.test(type)) {
        type = idxs.length > 1 ? 'multiple' : (texts.length === 2 && normalizeJudge(texts[0]) && normalizeJudge(texts[1]) ? 'judge' : 'single');
      }
      if (type === 'single' && idxs.length > 1) type = 'multiple';
      var key = stemKey(stem);
      if (seen[key]) return;
      seen[key] = 1;
      result.questions.push({
        id: 'imp' + Date.now().toString(36) + '_' + i,
        type: type, stem: stem, options: texts,
        answer: idxs.map(function (i2) { return LETTERS[i2]; }),
        analysis: String(raw.analysis || raw.explain || raw.explanation || '').trim()
      });
    });
    return result;
  }

  global.QuestionParser = { parseText: parseText, parseJSON: parseJSON, normalizeJudge: normalizeJudge };
})(typeof window !== 'undefined' ? window : globalThis);
