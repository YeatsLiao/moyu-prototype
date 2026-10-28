/* ============ app.js · 共享状态 + 页面逻辑 ============
 * state: localStorage
 *   moyu_settings  薪资配置
 *   moyu_run       进行中的计时 {startTs, typeId}
 *   moyu_seg_<日期> 当日已完成分段 [{minutes, amount, typeId}]
 * TODO: 接后端时替换为 POST /api/session/start|stop 等接口。
 */

/* ---------- 基础工具 ---------- */
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtClock(sec){
  sec = Math.floor(sec);
  const h = String(Math.floor(sec/3600)).padStart(2,'0');
  const m = String(Math.floor(sec%3600/60)).padStart(2,'0');
  const s = String(sec%60).padStart(2,'0');
  return `${h}:${m}:${s}`;
}
function fmtDur(min){
  min = Math.round(min);
  if (min < 60) return `${min}分钟`;
  return `${Math.floor(min/60)}小时${min%60 ? (min%60)+'分' : ''}`;
}
function fmtMoney(n){ return '¥ ' + n.toFixed(2); }

function toast(msg){
  let t = $('.toast');
  if (!t){ t = document.createElement('div'); t.className = 'toast'; $('.screen').appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ---------- 设置与费率 ---------- */
const DEFAULT_SETTINGS = { salary: 10000, hours: 8, scheme: 'double' };
function loadSettings(){
  try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem('moyu_settings') || '{}')); }
  catch(e){ return {...DEFAULT_SETTINGS}; }
}
function saveSettings(s){ localStorage.setItem('moyu_settings', JSON.stringify(s)); }
function schemeDays(id){ return (SCHEMES.find(x => x.id === id) || SCHEMES[0]).days; }
function perMinute(st){ return st.salary / schemeDays(st.scheme) / st.hours / 60; }
function typeOf(id){ return TYPES.find(t => t.id === id) || TYPES[0]; }

/* ---------- 计时状态 ----------
 * moyu_run = { typeId, startTs }   startTs 为 null 表示"已暂停"
 * moyu_seg_<日期> = [{ minutes, amount, typeId }]  当日已结算分段，可多段累加
 */
function getRun(){
  try { return JSON.parse(localStorage.getItem('moyu_run') || 'null'); } catch(e){ return null; }
}
function setRun(r){ r ? localStorage.setItem('moyu_run', JSON.stringify(r)) : localStorage.removeItem('moyu_run'); }
function getSegments(key){
  key = key || todayKey();
  try { return JSON.parse(localStorage.getItem('moyu_seg_' + key) || '[]'); } catch(e){ return []; }
}
function addSegment(key, seg){
  const arr = getSegments(key);
  arr.push(seg);
  localStorage.setItem('moyu_seg_' + key, JSON.stringify(arr));
}
/* 把正在跑的一段结算进当日分段 */
function bankRunning(){
  const run = getRun();
  if (!run || !run.startTs) return null;
  const st = loadSettings();
  const minutes = (Date.now() - run.startTs) / 60000;
  const amount = minutes * perMinute(st) * typeOf(run.typeId).coef;
  addSegment(todayKey(), { minutes, amount, typeId: run.typeId });
  return { minutes, amount, typeId: run.typeId };
}
/* 跨天兜底：昨天开始还没停的计时，自动记到昨天 */
function normalizeRun(){
  const run = getRun();
  if (!run || !run.startTs) return;
  const d = new Date(run.startTs); d.setHours(0,0,0,0);
  const t = new Date(); t.setHours(0,0,0,0);
  if (d.getTime() < t.getTime()){
    const st = loadSettings();
    const minutes = (Date.now() - run.startTs) / 60000;
    addSegment(`${d.getFullYear()}-${PAD(d.getMonth()+1)}-${PAD(d.getDate())}`,
      { minutes, amount: minutes * perMinute(st) * typeOf(run.typeId).coef, typeId: run.typeId });
    setRun(null);
  }
}
normalizeRun();

/* 今日实时合计：已结算分段 + 进行中的一段 */
function todayStats(){
  const st = loadSettings(), pm = perMinute(st);
  let min = 0, money = 0;
  for (const s of getSegments()){ min += s.minutes; money += s.amount; }
  const run = getRun();
  if (run && run.startTs){
    const rm = (Date.now() - run.startTs) / 60000;
    min += rm; money += rm * pm * typeOf(run.typeId).coef;
  }
  return { minutes: min, money, running: !!(run && run.startTs), paused: !!(run && !run.startTs) };
}

/* 历史某天金额（按当前薪资动态换算，系数取当日类型均值） */
function dayMoney(day, st){
  st = st || loadSettings();
  if (!day.minutes) return 0;
  const avg = day.types.length ? day.types.reduce((a,t) => a + typeOf(t).coef, 0) / day.types.length : 1;
  return day.minutes * perMinute(st) * avg;
}

/* 最近 N 天累计（back 区间，1 = 昨天） */
function sumRange(lo, hi){
  const st = loadSettings();
  let min = 0, money = 0, days = 0;
  for (const d of PAST_DAYS){
    if (d.back < lo || d.back > hi) continue;
    min += d.minutes; money += dayMoney(d, st);
    if (d.minutes > 0) days++;
  }
  return { min, money, days };
}
/* 自然月累计：0 = 本月（含今日实时），1 = 上月 */
function monthSum(offset){
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const prefix = `${first.getFullYear()}-${PAD(first.getMonth()+1)}`;
  const st = loadSettings();
  let min = 0, money = 0, days = 0;
  for (const d of PAST_DAYS){
    if (!d.iso.startsWith(prefix)) continue;
    min += d.minutes; money += dayMoney(d, st);
    if (d.minutes > 0) days++;
  }
  if (offset === 0){
    const t = todayStats();
    min += t.minutes; money += t.money;
    if (t.minutes >= 1) days++;
  }
  return { min, money, days };
}
/* 日 / 周 / 月：当前周期 vs 上一周期 */
function periodStats(kind){
  if (kind === 'day'){
    const t = todayStats();
    return { min: t.minutes, money: t.money, days: t.minutes >= 1 ? 1 : 0,
             prev: sumRange(1, 1), label: '较昨日' };
  }
  if (kind === 'week'){
    const past = sumRange(1, 6), t = todayStats();
    return { min: past.min + t.minutes, money: past.money + t.money,
             days: past.days + (t.minutes >= 1 ? 1 : 0),
             prev: sumRange(7, 13), label: '较上周' };
  }
  return { ...monthSum(0), prev: monthSum(1), label: '较上月' };
}
function levelOf(total){
  let cur = LEVELS[0], next = null;
  for (let i = 0; i < LEVELS.length; i++){
    if (total >= LEVELS[i].min){ cur = LEVELS[i]; next = LEVELS[i+1] || null; }
  }
  const progress = next ? Math.min(1, (total - cur.min) / (next.min - cur.min)) : 1;
  return { cur, next, progress, total };
}

/* ---------- 物品价格弹窗（首页/设置/战报共用） ---------- */
function openPrices(){
  let mask = $('#priceModal');
  if (!mask){
    mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.id = 'priceModal';
    mask.innerHTML = `
      <div class="modal modal-wide">
        <div class="tape"></div>
        <h3>物品价格</h3>
        <div class="price-list" id="priceList"></div>
        <div class="price-note" id="priceNote"></div>
        <div class="m-actions" style="margin-top:14px;">
          <button class="btn-big secondary" data-close>知道了</button>
        </div>
      </div>`;
    $('.screen').appendChild(mask);
    mask.addEventListener('click', e => {
      if (e.target === mask || e.target.closest('[data-close]')) mask.classList.remove('show');
    });
  }
  const st = loadSettings(), pm = perMinute(st);
  $('#priceList').innerHTML = GOODS.map(g => {
    const min = pm > 0 ? Math.ceil(g.price / pm) : 0;
    return `<div class="price-row">
      <span class="p-name">${g.name}<small> / ${g.unit}</small></span>
      <span class="p-min">${min ? '摸 ' + min + ' 分钟' : '—'}</span>
      <span class="p-price">¥${g.price % 1 ? g.price.toFixed(1) : g.price}</span>
    </div>`;
  }).join('');
  $('#priceNote').innerHTML = (pm > 0
    ? '按当前身价：摸 1 分钟 ≈ ' + fmtMoney(pm)
    : '先去设置里填月薪，才能算要摸多久')
    + '<br>战报只换算奶茶和鸡腿，其余是攒钱小目标';
  mask.classList.add('show');
}

/* ---------- Tabbar active ---------- */
(function(){
  const p = document.body.dataset.page;
  $$('.tab').forEach(a => a.classList.toggle('active', a.dataset.nav === p));
})();

/* ---------- Lucide 风格内联图标 ---------- */
const ICONS = {
  door:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.6v14.8l-7-2.1V6.7l7-2.1z"/></svg>',
  brain:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/></svg>',
  coffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>',
  scroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="14" x="8" y="5" rx="4"/><path d="m19 12-3 3-3-3"/><path d="m5 12 3-3 3 3"/></svg>',
  fish:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/></svg>',
  crown:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11.56 3.26a.5.5 0 0 1 .88 0l2.95 5.68a1 1 0 0 0 1.52.28l4.37-3.74a.5.5 0 0 1 .82.48l-2.8 9.6a1 1 0 0 1-.96.7H5.66a1 1 0 0 1-.96-.7l-2.8-9.6a.5.5 0 0 1 .82-.48l4.37 3.74a1 1 0 0 0 1.52-.28Z"/></svg>',
  palmtree:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8c0-3.5 3-5.5 6.5-5.5C19.5 5 18 7.5 13 8Z"/><path d="M13 8C13 4.5 10 2.5 6.5 2.5 6.5 5 8 7.5 13 8Z"/><path d="M13 8v13"/><path d="M13 21H8"/><path d="M13 21h5"/></svg>',
  dragon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
};

/* ================================================================
 * 页面：首页
 * ================================================================ */
function initHome(){
  let selected = localStorage.getItem('moyu_type') || 'toilet';

  /* 类型选择 */
  const grid = $('#typeGrid');
  grid.innerHTML = TYPES.map(t => `
    <div class="type-card" data-id="${t.id}">
      <span class="t-coef">×${t.coef.toFixed(1)}</span>
      <div class="t-name">${ICONS[t.icon]}${t.name}</div>
    </div>`).join('');
  function paintTypes(){
    const running = !!(getRun() && getRun().startTs);
    $$('#typeGrid .type-card').forEach(c => {
      c.classList.toggle('on', c.dataset.id === selected);
      c.classList.toggle('locked', running && c.dataset.id !== selected);
    });
  }
  /* 顶部 HUD：等级 + 经验条 + 连摸天数 */
  function paintHud(){
    const lv = levelOf(BASE_TOTAL + monthSum(0).money);
    $('#homeLvIcon').innerHTML = ICONS[lv.cur.icon];
    $('#homeLv').textContent = lv.cur.name;
    $('#homeXp').style.width = (lv.progress * 100).toFixed(1) + '%';
    let streak = 1;
    for (const d of PAST_DAYS){ if (d.minutes > 0 && d.dow !== 0 && d.dow !== 6) streak++; else break; }
    $('#streakNum').textContent = streak;
  }
  grid.addEventListener('click', e => {
    const card = e.target.closest('.type-card');
    if (!card || card.classList.contains('locked')) return;
    selected = card.dataset.id;
    localStorage.setItem('moyu_type', selected);
    paintTypes();
  });

  /* 主按钮：开始 → 暂停 → 继续 */
  const btn = $('#mainBtn'), btnEnd = $('#btnEnd');
  const ICON_PLAY = '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5 19 12 7 19.5z"/></svg>';
  const ICON_PAUSE = '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>';

  function paintBtn(){
    const run = getRun();
    const running = !!(run && run.startTs);
    const paused = !!(run && !run.startTs);

    btn.className = 'btn-big ' + (running ? 'btn-stop' : 'btn-start');
    btn.innerHTML = running ? ICON_PAUSE + '暂停' :
                    paused  ? ICON_PLAY + '继续摸鱼' :
                              ICON_PLAY + '开始摸鱼';

    $('.live-dot').classList.toggle('on', running);
    $('#liveLbl').textContent = running ? '摸鱼中' : paused ? '已暂停' : '今日';

    const tag = $('#sessionTag');
    if (run){
      tag.style.display = 'inline-flex';
      tag.querySelector('span').textContent = typeOf(run.typeId).name + (paused ? ' · 暂停中' : '');
    } else tag.style.display = 'none';

    /* 收工按钮：今天有战绩或还在计时时才出现 */
    const hasWork = running || paused || getSegments().length > 0;
    btnEnd.style.display = hasWork ? 'flex' : 'none';
  }

  btn.addEventListener('click', () => {
    const st = loadSettings();
    if (!st.salary || st.salary <= 0){ toast('先去设置里填个月薪'); return; }
    const run = getRun();

    if (!run){                                  /* 开始 */
      setRun({ startTs: Date.now(), typeId: selected });
    } else if (run.startTs){                    /* 暂停：本段入账，保留类型 */
      bankRunning();
      setRun({ typeId: run.typeId, startTs: null });
      toast('已暂停');
    } else {                                    /* 继续 */
      setRun({ startTs: Date.now(), typeId: run.typeId });
    }
    paintBtn(); paintTypes(); paintHud();
  });

  /* 收工：结算并看今日战报 */
  btnEnd.addEventListener('click', () => {
    bankRunning();
    setRun(null);
    const t = todayStats();
    paintBtn(); paintTypes(); paintHud();
    if (t.minutes < 0.1){ toast('今天还没摸，先摸一会儿'); return; }
    showSettle(t);
  });

  function showSettle(t){
    const qs = QUOTES[quoteTier(t.money)];
    const q = qs[Math.floor(Math.random() * qs.length)].replace('{m}', t.money.toFixed(2));
    $('#mTime').textContent = fmtClock(t.minutes * 60);
    $('#mMoney').textContent = fmtMoney(t.money);
    $('#mQuip').textContent = '“' + q + '”';
    $('#settleModal').classList.add('show');
  }
  $('#mClose').addEventListener('click', () => $('#settleModal').classList.remove('show'));

  /* 实时跳动 */
  const tTime = $('#tTime'), tMoney = $('#tMoney'), tEq = $('#tEq');
  function tick(){
    const t = todayStats();
    tTime.textContent = fmtClock(t.minutes * 60);
    tMoney.textContent = fmtMoney(t.money);
    tEq.innerHTML = '≈ <b>' + equivalence(t.money) + '</b>';
  }
  tick(); paintBtn(); paintTypes(); paintHud();
  setInterval(tick, 200);
  setInterval(paintHud, 2000);
}

/* ================================================================
 * 页面：设置
 * ================================================================ */
function initSettings(){
  const st = loadSettings();
  const salaryIn = $('#fSalary'), hoursIn = $('#fHours');
  salaryIn.value = st.salary;
  hoursIn.value = st.hours;

  /* 工作制度 segment */
  $$('#schemeSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.scheme === st.scheme);
    b.addEventListener('click', () => {
      $$('#schemeSeg button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      preview();
    });
  });

  function readForm(){
    return {
      salary: parseFloat(salaryIn.value) || 0,
      hours:  parseFloat(hoursIn.value) || 0,
      scheme: $('#schemeSeg button.on').dataset.scheme,
    };
  }
  function preview(){
    const v = readForm();
    const valid = v.salary > 0 && v.hours > 0;
    const pm = valid ? perMinute(v) : 0;
    $('#rHour').textContent = valid ? fmtMoney(pm * 60) : '¥ --';
    $('#rMinute').innerHTML = valid
      ? fmtMoney(pm) + ' / 分钟 · ' + schemeDays(v.scheme) + ' 天'
      : '填完才算得出身价';
    $('#saveBtn').style.opacity = valid ? 1 : .45;
    return valid;
  }
  salaryIn.addEventListener('input', preview);
  hoursIn.addEventListener('input', preview);

  $('#saveBtn').addEventListener('click', () => {
    const v = readForm();
    if (!(v.salary > 0)){ toast('月薪都不敢填，怎么摸得理直气壮'); return; }
    if (!(v.hours > 0) || v.hours > 24){ toast('每日工时不对劲，再想想'); return; }
    saveSettings(v);
    toast('已保存');
  });
  preview();
  $('#btnPrice').addEventListener('click', openPrices);
}

/* ================================================================
 * 页面：历史战绩
 * ================================================================ */
function initHistory(){
  const st = loadSettings();
  const lv = levelOf(BASE_TOTAL + monthSum(0).money);

  /* 等级卡 */
  $('#lvIcon').innerHTML = ICONS[lv.cur.icon];
  $('#lvName').textContent = lv.cur.name;
  $('#lvTotal').textContent = lv.next
    ? fmtMoney(lv.total) + ' / ¥' + lv.next.min
    : fmtMoney(lv.total) + ' · MAX';
  $('#lvBar').style.width = (lv.progress * 100).toFixed(1) + '%';

  /* 日 / 周 / 月 切换 */
  let range = localStorage.getItem('moyu_range') || 'week';
  $$('#rangeSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.range === range);
    b.addEventListener('click', () => {
      range = b.dataset.range;
      localStorage.setItem('moyu_range', range);
      $$('#rangeSeg button').forEach(x => x.classList.toggle('on', x === b));
      paintStats();
    });
  });

  function paintStats(){
    const p = periodStats(range);
    $('#mHours').innerHTML = (p.min / 60).toFixed(1) + '<small>h</small>';
    $('#mMoney').innerHTML = fmtMoney(p.money);
    /* 三宫格第三格：等价物杯数 */
    $('#mCups').innerHTML = Math.floor(p.money / 15) + '<small>杯</small>';
    const el = $('#cmpLine');
    const diff = p.prev.money > 0 ? (p.money - p.prev.money) / p.prev.money * 100 : null;
    if (diff === null){
      el.className = 'cmp';
      el.innerHTML = '<span class="cmp-k">' + p.label + '</span><b>无数据</b>';
    } else {
      const up = diff >= 0;
      el.className = 'cmp ' + (up ? 'up' : 'down');
      el.innerHTML = '<span class="cmp-k">' + p.label + '</span><b>' + (up ? '▲' : '▼') + ' ' + Math.abs(diff).toFixed(0) + '%</b>' +
        '<span class="cmp-prev">' + fmtMoney(p.prev.money) + '</span>';
    }
  }
  paintStats();

  /* 等级说明 */
  const lvList = $('#lvList');
  lvList.innerHTML = LEVELS.map((l, i) => {
    const next = LEVELS[i+1];
    const rangeTxt = next ? '¥' + l.min + ' – ¥' + (next.min - 0.01) : '¥' + l.min + ' 起';
    const cur = l.name === lv.cur.name;
    return `<div class="lv-row${cur ? ' on' : ''}">
      <div class="lv-row-ico">${ICONS[l.icon]}</div>
      <div class="lv-row-txt">
        <div class="lv-row-name">${l.name}${cur ? '<span class="lv-now">当前</span>' : ''}</div>
        <div class="lv-row-tip">${l.tip}</div>
      </div>
      <div class="lv-row-range">${rangeTxt}</div>
    </div>`;
  }).join('');
  $('#btnLvInfo').addEventListener('click', () => $('#lvModal').classList.add('show'));
  $('#lvClose').addEventListener('click', () => $('#lvModal').classList.remove('show'));

  /* ---------- 月历 ---------- */
  const TODAY = new Date(); TODAY.setHours(0,0,0,0);
  const TODAY_ISO = todayKey();
  const byIso = {};
  for (const d of PAST_DAYS) byIso[d.iso] = d;

  let monthOffset = 0;          /* 0 = 本月，1 = 上月 */
  let selectedIso = TODAY_ISO;
  const MAX_OFFSET = 1;         /* 历史只留一个月 */

  const WD_CN = ['周日','周一','周二','周三','周四','周五','周六'];

  /* 某天的数据：今天取实时，其余取历史 */
  function statOf(iso){
    if (iso === TODAY_ISO){
      const t = todayStats();
      return { minutes: t.minutes, money: t.money, today: true };
    }
    const d = byIso[iso];
    if (!d) return null;
    return { minutes: d.minutes, money: dayMoney(d, st), today: false };
  }

  function renderCalendar(){
    const base = new Date(TODAY.getFullYear(), TODAY.getMonth() - monthOffset, 1);
    const y = base.getFullYear(), m = base.getMonth();
    $('#calTitle').innerHTML = (m + 1) + '月<small>' + (monthOffset === 0 ? '本月' : monthOffset === 1 ? '上月' : '') + '</small>';
    $('#calPrev').disabled = monthOffset >= MAX_OFFSET;
    $('#calNext').disabled = monthOffset === 0;

    const firstIdx = (new Date(y, m, 1).getDay() + 6) % 7;   /* 周一为第一列 */
    const dim = new Date(y, m + 1, 0).getDate();

    /* 本月金额峰值，用于热度分档 */
    let peak = 0;
    for (let d = 1; d <= dim; d++){
      const iso = `${y}-${PAD(m+1)}-${PAD(d)}`;
      const s = statOf(iso);
      if (s && s.money > peak) peak = s.money;
    }

    let html = '';
    for (let i = 0; i < firstIdx; i++) html += '<div class="cal-cell blank"></div>';
    for (let d = 1; d <= dim; d++){
      const iso = `${y}-${PAD(m+1)}-${PAD(d)}`;
      const s = statOf(iso);
      const dow = new Date(y, m, d).getDay();
      const money = s ? s.money : 0;
      const ratio = peak > 0 ? money / peak : 0;
      const lv = money < 0.01 ? 0 : ratio > 0.66 ? 3 : ratio > 0.33 ? 2 : 1;
      const cls = ['cal-cell',
        'lv' + lv,
        iso === TODAY_ISO ? 'today' : '',
        iso === selectedIso ? 'sel' : '',
        (s && s.minutes < 1) || !s ? 'rest' : ''
      ].filter(Boolean).join(' ');
      const amt = money >= 0.01 ? (money >= 100 ? Math.round(money) : money.toFixed(money >= 10 ? 0 : 1)) : '';
      html += `<button class="${cls}" data-iso="${iso}" data-dow="${WD_CN[dow]}">
        <span class="cd">${d}</span><span class="cm">${amt}</span>
      </button>`;
    }
    $('#calGrid').innerHTML = html;
    renderDetail();
  }

  function renderDetail(){
    const s = statOf(selectedIso);
    const [yy, mm, dd] = selectedIso.split('-').map(Number);
    const d = new Date(yy, mm - 1, dd);
    const isToday = selectedIso === TODAY_ISO;
    const head = `${mm}月${dd}日 · ${WD_CN[d.getDay()]}${isToday ? ' · 今天' : ''}`;
    if (!s){
      $('#calDetail').innerHTML = `<div class="cd-head"><span class="cd-date">${head}</span>
        <span class="cd-money">¥0.00</span></div>
        <div class="cd-row"><span>没有记录</span></div>`;
      return;
    }
    const has = s.minutes > 0.01 || s.money > 0.01;
    $('#calDetail').innerHTML = `
      <div class="cd-head">
        <span class="cd-date">${head}</span>
        <span class="cd-money">${fmtMoney(s.money)}</span>
      </div>
      <div class="cd-row">
        <span>时长 <b>${fmtDur(s.minutes)}</b></span>
        <span>≈ ${equivalence(s.money)}</span>
      </div>
      ${has ? `<a class="btn-ghost" href="share.html${isToday ? '' : '?date=' + selectedIso}" style="margin-top:12px;">${isToday ? '生成今日战报' : '生成当日战报'}</a>` : ''}`;
  }

  /* 切月后自动选中：本月选今天，上月选最后一天有战绩的日子 */
  function focusMonth(){
    const base = new Date(TODAY.getFullYear(), TODAY.getMonth() - monthOffset, 1);
    if (monthOffset === 0){ selectedIso = TODAY_ISO; }
    else {
      const y = base.getFullYear(), m = base.getMonth();
      const dim = new Date(y, m + 1, 0).getDate();
      let best = null;
      for (let d = 1; d <= dim; d++){
        const iso = `${y}-${PAD(m+1)}-${PAD(d)}`;
        const s = statOf(iso);
        if (s && s.money > 0) best = iso;
      }
      selectedIso = best || `${y}-${PAD(m+1)}-01`;
    }
    renderCalendar();
  }

  $('#calGrid').addEventListener('click', e => {
    const cell = e.target.closest('.cal-cell');
    if (!cell || cell.classList.contains('blank')) return;
    selectedIso = cell.dataset.iso;
    $$('#calGrid .cal-cell').forEach(c => c.classList.toggle('sel', c.dataset.iso === selectedIso));
    renderDetail();
  });
  $('#calPrev').addEventListener('click', () => {
    if (monthOffset >= MAX_OFFSET) return;
    monthOffset++;
    focusMonth();
  });
  $('#calNext').addEventListener('click', () => {
    if (monthOffset === 0) return;
    monthOffset--;
    focusMonth();
  });
  renderCalendar();

  /* 今日数据实时刷新 */
  setInterval(() => {
    paintStats();
    if (monthOffset === 0) renderCalendar();
    else if (selectedIso === TODAY_ISO) renderDetail();
  }, 1000);
}

/* ================================================================
 * 页面：战报分享
 * ================================================================ */
function initShare(){
  /* 支持 ?date=YYYY-MM-DD 查看历史战报，缺省为今天 */
  const raw = new URLSearchParams(location.search).get('date') || '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayKey();
  const isToday = iso === todayKey();
  const [isoY, isoM, isoD] = iso.split('-').map(Number);

  const dateStr = `${isoM}月${isoD}日`;
  let quip = '';

  function dayStat(){
    if (isToday){
      const t = todayStats();
      return { minutes: t.minutes, money: t.money };
    }
    const d = PAST_DAYS.find(x => x.iso === iso);
    if (!d) return { minutes: 0, money: 0 };
    return { minutes: d.minutes, money: dayMoney(d) };
  }
  function data(){
    return { t: dayStat(), lv: levelOf(BASE_TOTAL + monthSum(0).money) };
  }
  function pickQuip(money){
    const qs = QUOTES[quoteTier(money)];
    let q;
    do { q = qs[Math.floor(Math.random() * qs.length)]; } while (qs.length > 1 && q === quip);
    quip = q;
    return q.replace('{m}', money.toFixed(2));
  }
  function render(){
    const { t, lv } = data();
    $('#rcDate').textContent = `${isoY}.${String(isoM).padStart(2,'0')}.${String(isoD).padStart(2,'0')}${isToday ? ' · 今天' : ''}`;
    $('#rcMoney').innerHTML = '<small>¥</small>' + t.money.toFixed(2);
    $('#rcDur').textContent = fmtDur(t.minutes);
    $('#rcEq').textContent = '≈ ' + equivalence(t.money);
    $('#rcQuip').textContent = '“' + (quip || pickQuip(t.money)) + '”';
    $('#rcLevel').textContent = lv.cur.name;
  }
  if (!isToday){
    $('.page-head h1').textContent = '当日战报';
    const back = $('.page-head .back');
    if (back){ back.href = 'history.html'; }
  }
  render();
  if (isToday) setInterval(render, 1000);

  $('#btnQuip').addEventListener('click', () => { const { t } = data(); quip = pickQuip(t.money); render(); });
  $('#btnPrice').addEventListener('click', openPrices);

  /* 保存图片：Canvas 渲染战报卡 → 下载 PNG（原型中代替"保存到相册"）
   * TODO: 小程序内替换为 wx.canvasToTempFilePath + wx.saveImageToPhotosAlbum */
  $('#btnSave').addEventListener('click', () => {
    const { t, lv } = data();
    const W = 750, H = 1100;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');

    const KAI = '"STKaiti","KaiTi","楷体",serif';
    const HAND = '"Comic Sans MS","Chalkboard SE",monospace';

    /* 纸张底 + 横格线 + 颗粒 */
    c.fillStyle = '#FBF6EA'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(143,211,244,.45)'; c.lineWidth = 2;
    for (let y = 100; y < H; y += 64){ c.beginPath(); c.moveTo(46, y); c.lineTo(W - 46, y); c.stroke(); }
    c.fillStyle = 'rgba(42,39,35,.055)';
    for (let i = 0; i < 800; i++) c.fillRect(Math.random() * W, Math.random() * H, 2, 2);

    /* 墨线双层边框 */
    c.strokeStyle = '#2A2723'; c.lineWidth = 5;
    c.beginPath(); c.roundRect(30, 30, W - 60, H - 60, 28); c.stroke();
    c.lineWidth = 2;
    c.beginPath(); c.roundRect(44, 44, W - 88, H - 88, 22); c.stroke();

    c.textAlign = 'center';
    c.fillStyle = '#7A7367';
    c.font = '700 30px ' + KAI;
    c.fillText('摸 鱼 战 绩 计 算 器', W/2, 122);
    c.font = '600 24px ' + HAND;
    c.fillText(`${isoY}.${PAD(isoM)}.${PAD(isoD)} 战报`, W/2, 162);

    /* 金额：荧光笔涂抹打底 + 墨字 */
    const moneyTxt = '¥' + t.money.toFixed(2);
    c.font = '700 118px ' + HAND;
    const mw = c.measureText(moneyTxt).width;
    c.save();
    c.translate(W/2, 330); c.rotate(-0.012);
    c.fillStyle = 'rgba(255,230,109,.9)';
    c.fillRect(-mw/2 - 20, -72, mw + 40, 98);
    c.restore();
    c.fillStyle = '#2A2723';
    c.fillText(moneyTxt, W/2, 330);

    c.font = '700 34px ' + KAI;
    c.fillText('带薪摸鱼 ' + fmtDur(t.minutes), W/2, 404);

    /* 等价物 + 波浪下划线 */
    const eqTxt = '≈ ' + equivalence(t.money);
    c.fillStyle = '#2E6F8E';
    c.font = '700 30px ' + KAI;
    c.fillText(eqTxt, W/2, 454);
    const ew = c.measureText(eqTxt).width;
    c.strokeStyle = '#8FD3F4'; c.lineWidth = 3;
    for (let x = W/2 - ew/2; x < W/2 + ew/2 - 8; x += 12){
      c.beginPath(); c.moveTo(x, 464); c.quadraticCurveTo(x + 6, 456, x + 12, 464); c.stroke();
    }

    /* 手绘虚线分隔 */
    c.strokeStyle = 'rgba(42,39,35,.4)'; c.lineWidth = 2; c.setLineDash([10, 8]);
    c.beginPath(); c.moveTo(110, 514); c.lineTo(W - 110, 514); c.stroke();
    c.setLineDash([]);

    /* 战报文案 */
    c.fillStyle = '#2A2723';
    c.font = '600 36px ' + KAI;
    const q = '“' + quip + '”';
    if (c.measureText(q).width > W - 170){
      const mid = Math.ceil(q.length / 2);
      c.fillText(q.slice(0, mid), W/2, 584);
      c.fillText(q.slice(mid), W/2, 636);
    } else c.fillText(q, W/2, 584);

    /* 段位章：荧光笔药丸 + 墨线 */
    const badge = '★ ' + lv.cur.name;
    c.font = '700 30px ' + KAI;
    const bw = c.measureText(badge).width + 84;
    c.fillStyle = '#FFE66D'; c.strokeStyle = '#2A2723'; c.lineWidth = 4;
    c.beginPath(); c.roundRect(W/2 - bw/2, 692, bw, 68, 34); c.fill(); c.stroke();
    c.fillStyle = '#2A2723';
    c.fillText(badge, W/2, 738);

    /* 咸鱼认证印章 */
    c.save();
    c.translate(W - 128, 208); c.rotate(-0.28);
    c.strokeStyle = '#FF6B5B'; c.lineWidth = 5;
    c.beginPath(); c.arc(0, 0, 48, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2; c.setLineDash([6, 6]);
    c.beginPath(); c.arc(0, 0, 37, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#FF6B5B';
    c.font = '700 21px ' + KAI;
    c.fillText('咸鱼', 0, -4); c.fillText('认证', 0, 26);
    c.restore();

    /* 角落小咸鱼 */
    c.save();
    c.translate(140, H - 190); c.rotate(-0.1);
    c.fillStyle = '#FFE66D'; c.strokeStyle = '#2A2723'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(0, 0, 40, 25, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(38, 0); c.lineTo(60, -17); c.lineTo(60, 17); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#2A2723'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-8, -10); c.lineTo(4, 2); c.moveTo(4, -10); c.lineTo(-8, 2); c.stroke();
    c.restore();

    c.fillStyle = '#7A7367';
    c.font = '18px ' + HAND;
    c.fillText('MOYU BATTLE REPORT · 精神收益 概不兑现', W/2, H - 96);

    const a = document.createElement('a');
    a.download = `摸鱼战报-${dateStr}.png`;
    a.href = cv.toDataURL('image/png');
    a.click();
    toast('战报已保存到本地');
  });
}

/* ---------- 路由 ---------- */
const PAGE_INIT = { home: initHome, settings: initSettings, history: initHistory, share: initShare };
const init = PAGE_INIT[document.body.dataset.page];
if (init) init();
