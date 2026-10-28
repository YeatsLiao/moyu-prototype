/* 摸鱼战绩计算器 · 数据层（wx 存储版） */

const K_SETTINGS = 'moyu_settings';
const K_TYPE = 'moyu_type';
const K_RUN = 'moyu_run';
const segKey = iso => 'moyu_seg_' + iso;

function get(k, d) { try { const v = wx.getStorageSync(k); return v === '' || v === undefined ? d : v; } catch (e) { return d; } }
function set(k, v) { wx.setStorageSync(k, v); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayKey() { return keyOf(new Date()); }

/* ---------- 配置 ---------- */
const SCHEMES = {
  double: { id: 'double', name: '双休', days: 21.75 },
  bigsmall: { id: 'bigsmall', name: '大小周', days: 23.75 },
  single: { id: 'single', name: '单休', days: 25.75 },
};
const SCHEME_LIST = [SCHEMES.double, SCHEMES.bigsmall, SCHEMES.single];
const DEFAULT_SETTINGS = { salary: 10000, hours: 8, scheme: 'double' };
function loadSettings() {
  const s = get(K_SETTINGS, DEFAULT_SETTINGS);
  return { salary: +s.salary || 0, hours: +s.hours || 8, scheme: s.scheme || 'double' };
}
function saveSettings(s) { set(K_SETTINGS, s); }
function workdays(st) { return (SCHEMES[st.scheme] || SCHEMES.double).days; }
function perHour(st) { return st.salary > 0 && st.hours > 0 ? st.salary / workdays(st) / st.hours : 0; }
function perMinute(st) { return perHour(st) / 60; }

/* ---------- 摸鱼类型 ---------- */
const TYPES = [
  { id: 'toilet', icon: '🚽', name: '带薪如厕', coef: 1.2 },
  { id: 'daze', icon: '😶', name: '工位发呆', coef: 1.0 },
  { id: 'coffee', icon: '☕', name: '咖啡回血', coef: 0.8 },
  { id: 'scroll', icon: '📱', name: '划水刷帖', coef: 1.1 },
];
function typeOf(id) { return TYPES.find(t => t.id === id) || TYPES[0]; }

/* ---------- 等价物价目表 ---------- */
const GOODS = [
  { name: '鸡腿', unit: '个', price: 6, eq: true },
  { name: '疯狂星期四', unit: '份', price: 9.9, eq: false },
  { name: '奶茶', unit: '杯', price: 15, eq: true },
  { name: '视频会员', unit: '月', price: 25, eq: false },
  { name: '盲盒', unit: '个', price: 39, eq: false },
  { name: '游戏皮肤', unit: '个', price: 88, eq: false },
];
function eqGoods() { return GOODS.filter(g => g.eq).sort((a, b) => b.price - a.price); }
function equivalence(money) {
  let rest = Math.floor(money * 100) / 100;
  const out = [];
  for (const g of eqGoods()) {
    const n = Math.floor(rest / g.price);
    if (n > 0) { out.push(n + ' ' + g.unit + g.name); rest = Math.round((rest - n * g.price) * 100) / 100; }
  }
  return out.length ? out.join(' + ') : '还差一点点就能换鸡腿';
}

/* ---------- 等级体系 ---------- */
const LEVELS = [
  { min: 0, name: '摸鱼新手', icon: '🐟', desc: '刚下水，还在试探水深' },
  { min: 300, name: '老油条', icon: '🐠', desc: '油了，领导喊不动的那种' },
  { min: 1500, name: '鱼塘塘主', icon: '👑', desc: '整层楼的鱼都归你管' },
  { min: 4000, name: '带薪休假大师', icon: '🏝️', desc: '上班如上岛，工资是船票' },
  { min: 8000, name: '摸鱼宗师', icon: '🐲', desc: '已臻化境，摸于无形' },
];
function levelOf(total) {
  let i = 0;
  LEVELS.forEach((l, idx) => { if (total >= l.min) i = idx; });
  const cur = LEVELS[i], next = LEVELS[i + 1] || null;
  const pct = next ? Math.min(100, (total - cur.min) / (next.min - cur.min) * 100) : 100;
  return { cur, next, pct, idx: i };
}

/* ---------- 分段计时（状态持久化） ---------- */
function loadRun() { return get(K_RUN, null); }
function saveRun(r) { r ? set(K_RUN, r) : wx.removeStorageSync(K_RUN); }
function loadSegments(iso) { return get(segKey(iso), []); }
function saveSegments(iso, arr) { set(segKey(iso), arr); }
function coefOf(tid) { return typeOf(tid).coef; }

function normalizeRun() {
  const run = loadRun();
  if (!run) return;
  const today = todayKey();
  if (run.date !== today) {
    const end = Date.now();
    const arr = loadSegments(run.date);
    arr.push({ typeId: run.typeId, start: run.start, end });
    saveSegments(run.date, arr);
    saveRun(null);
  }
}
function dayMinutes(iso) {
  let ms = loadSegments(iso).reduce((s, x) => s + (x.end - x.start), 0);
  const run = loadRun();
  if (run && run.date === iso) ms += Date.now() - run.start;
  return ms / 60000;
}
function dayMoney(iso, st) {
  st = st || loadSettings();
  const pm = perMinute(st);
  let total = 0;
  for (const s of loadSegments(iso)) total += (s.end - s.start) / 60000 * pm * coefOf(s.typeId);
  const run = loadRun();
  if (run && run.date === iso) total += (Date.now() - run.start) / 60000 * pm * coefOf(run.typeId);
  return Math.round(total * 100) / 100;
}
function dayStats(iso) { iso = iso || todayKey(); return { minutes: dayMinutes(iso), money: dayMoney(iso) }; }

/* ---------- Mock 历史数据（过去 30 天） ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function genPast() {
  const rnd = mulberry32(20261028), out = [];
  for (let i = 1; i <= 30; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) { out.push({ iso: keyOf(d), minutes: 0, money: 0 }); continue; }
    const minutes = Math.round(25 + rnd() * 105);
    out.push({ iso: keyOf(d), minutes, money: 0 });
  }
  return out;
}
const PAST_DAYS = genPast();
const BASE_TOTAL = 2000; // 演示：本月之前的累计（用于等级进度）
function pastMoney(d, st) { return Math.round(d.minutes * perMinute(st || loadSettings()) * 1.05 * 100) / 100; }

/* ---------- 格式化 ---------- */
function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60);
}
function fmtDur(min) {
  if (min < 1) return Math.floor(min * 60) + '秒';
  if (min < 60) return Math.floor(min) + '分钟';
  return Math.floor(min / 60) + '小时' + Math.round(min % 60) + '分';
}
function fmtMoney(n) { return '¥' + (+n).toFixed(2); }

/* ---------- 战报文案 ---------- */
const QUOTES = {
  small: ['今日进账{m}元，蚊子腿也是肉', '老板赚大头，我赚{m}元零头', '{m}元，好歹够个鸡腿'],
  mid: ['今日白嫖{m}元，美滋滋', '摸鱼{m}元，准时下班是最好的医美', '血赚{m}元，明天继续潜伏'],
  big: ['日入{m}元，工资只是遮羞布', '{m}元到手，老板看了要沉默', '摸鱼{m}元，我才是自己的老板'],
};
function quoteTier(m) { return m < 20 ? 'small' : m < 50 ? 'mid' : 'big'; }

module.exports = {
  get, set, pad, keyOf, todayKey,
  SCHEMES, SCHEME_LIST, DEFAULT_SETTINGS, loadSettings, saveSettings, workdays, perHour, perMinute,
  TYPES, typeOf, GOODS, eqGoods, equivalence,
  LEVELS, levelOf,
  loadRun, saveRun, loadSegments, saveSegments, coefOf, normalizeRun, dayStats,
  PAST_DAYS, BASE_TOTAL, pastMoney,
  fmtClock, fmtDur, fmtMoney, QUOTES, quoteTier
};
