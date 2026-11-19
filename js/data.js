/* =========================================================
 * 基础配置（如需调整题量、时长、满分，改这里即可）
 * =======================================================*/
window.APP_CONFIG = {
  branch: '2026 年题库 · 交通设备与控制工程第一学生党支部',
  systemName: '党团知识竞赛训练系统',
  questionCount: 50,      // 每次训练随机抽取题数
  durationMinutes: 60,    // 限时（分钟）
  totalScore: 100,        // 满分
  excellentScore: 90,     // 优秀线（含）
  maxRecords: 200         // 本机最多保留的记录条数
};

/* =========================================================
 * 正式题库见 js/bank.js（2026 年题库，共 442 题）
 * type: single 单选 / multiple 多选 / judge 判断
 * options: 选项文本数组，按 A、B、C… 顺序对应
 * answer: 正确选项字母数组
 * =======================================================*/
window.DEFAULT_QUESTIONS = window.BANK_QUESTIONS && window.BANK_QUESTIONS.length
  ? window.BANK_QUESTIONS
  : [];
