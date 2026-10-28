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

/* ---------- 计时状态 ---------- */
function getRun(){
  try { return JSON.parse(localStorage.getItem('moyu_run') || 'null'); } catch(e){ return null; }
}
function setRun(r){ r ? localStorage.setItem('moyu_run', JSON.stringify(r)) : localStorage.removeItem('moyu_run'); }
function getSegments(){
  try { return JSON.parse(localStorage.getItem('moyu_seg_' + todayKey()) || '[]'); } catch(e){ return []; }
}
function saveSegments(arr){ localStorage.setItem('moyu_seg_' + todayKey(), JSON.stringify(arr)); }

/* 今日实时合计：已结算分段 + 进行中的一段 */
function todayStats(){
  const st = loadSettings(), pm = perMinute(st);
  let min = 0, money = 0;
  for (const s of getSegments()){ min += s.minutes; money += s.amount; }
  const run = getRun();
  if (run){
    const rm = (Date.now() - run.startTs) / 60000;
    min += rm; money += rm * pm * typeOf(run.typeId).coef;
  }
  return { minutes: min, money, running: !!run };
}

/* 历史某天金额（按当前薪资动态换算，系数取当日类型均值） */
function dayMoney(day, st){
  if (!day.minutes) return 0;
  const avg = day.types.length ? day.types.reduce((a,t) => a + typeOf(t).coef, 0) / day.types.length : 1;
  return day.minutes * perMinute(st) * avg;
}
function monthStats(){
  const st = loadSettings();
  let min = 0, money = 0, days = 0;
  for (const d of PAST_DAYS){
    min += d.minutes; money += dayMoney(d, st);
    if (d.minutes > 0) days++;
  }
  const t = todayStats();
  min += t.minutes; money += t.money;
  if (t.minutes >= 1) days++;
  return { minutes: min, money, days };
}
function levelOf(total){
  let cur = LEVELS[0], next = null;
  for (let i = 0; i < LEVELS.length; i++){
    if (total >= LEVELS[i].min){ cur = LEVELS[i]; next = LEVELS[i+1] || null; }
  }
  const progress = next ? Math.min(1, (total - cur.min) / (next.min - cur.min)) : 1;
  return { cur, next, progress, total };
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
      <div class="t-desc">${t.desc}</div>
    </div>`).join('');
  function paintTypes(){
    const running = !!getRun();
    $$('#typeGrid .type-card').forEach(c => {
      c.classList.toggle('on', c.dataset.id === selected);
      c.classList.toggle('locked', running && c.dataset.id !== selected);
    });
  }
  grid.addEventListener('click', e => {
    const card = e.target.closest('.type-card');
    if (!card || card.classList.contains('locked')) return;
    selected = card.dataset.id;
    localStorage.setItem('moyu_type', selected);
    paintTypes();
  });

  /* 大按钮 */
  const btn = $('#mainBtn');
  function paintBtn(){
    const run = getRun();
    btn.className = 'btn-big ' + (run ? 'btn-stop' : 'btn-start');
    btn.innerHTML = run ? '■ 结束摸鱼' : '▶ 开始摸鱼';
    $('.live-dot').classList.toggle('on', !!run);
    $('#liveLbl').textContent = run ? '摸鱼进行中' : '今日摸鱼总时长';
    const tag = $('#sessionTag');
    if (run){ tag.style.display = 'inline-flex'; tag.querySelector('span').textContent = typeOf(run.typeId).name + ' · 纯度 ×' + typeOf(run.typeId).coef.toFixed(1); }
    else tag.style.display = 'none';
  }

  btn.addEventListener('click', () => {
    const st = loadSettings();
    if (!st.salary || st.salary <= 0){ toast('月薪都不敢填，怎么摸得理直气壮'); return; }
    const run = getRun();
    if (!run){
      setRun({ startTs: Date.now(), typeId: selected });
      paintBtn(); paintTypes();
    } else {
      /* 结算 */
      const minutes = (Date.now() - run.startTs) / 60000;
      const amount = minutes * perMinute(st) * typeOf(run.typeId).coef;
      const segs = getSegments();
      segs.push({ minutes, amount, typeId: run.typeId });
      saveSegments(segs);
      setRun(null);
      paintBtn(); paintTypes();
      showSettle(minutes, amount);
    }
  });

  function showSettle(minutes, amount){
    const qs = QUOTES[quoteTier(amount)];
    const q = qs[Math.floor(Math.random() * qs.length)].replace('{m}', amount.toFixed(2));
    $('#mTime').textContent = fmtClock(minutes * 60);
    $('#mMoney').textContent = fmtMoney(amount);
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
  tick(); paintBtn(); paintTypes();
  setInterval(tick, 200);
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
      ? '≈ <b>' + fmtMoney(pm) + '</b> / 分钟 · 月计薪 <b>' + schemeDays(v.scheme) + '</b> 天'
      : '填完月薪和工时才能算身价';
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
    toast('已保存 · 身价已更新');
  });
  preview();
}

/* ================================================================
 * 页面：历史战绩
 * ================================================================ */
function initHistory(){
  const st = loadSettings();
  const ms = monthStats();
  const lv = levelOf(BASE_TOTAL + ms.money);

  /* 等级卡 */
  $('#lvIcon').innerHTML = ICONS[lv.cur.icon];
  $('#lvName').textContent = lv.cur.name;
  $('#lvTotal').textContent = '累计 ' + fmtMoney(lv.total);
  $('#lvBar').style.width = (lv.progress * 100).toFixed(1) + '%';
  $('#lvNext').textContent = lv.next
    ? '距「' + lv.next.name + '」还差 ' + fmtMoney(lv.next.min - lv.total)
    : '已登峰造极，摸界传说';

  /* 月累计 */
  $('#mHours').innerHTML = (ms.minutes / 60).toFixed(1) + '<small> 小时</small>';
  $('#mMoney').innerHTML = fmtMoney(ms.money);
  $('#mDays').innerHTML = ms.days + '<small> 天</small>';

  /* 按日列表：今天在最上 */
  const list = $('#dayList');
  const t = todayStats();
  const now = new Date();
  const todayRow = `
    <div class="day-item today">
      <div class="d-date"><div class="dd">${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}</div><div class="dw">今天</div></div>
      <div class="d-info">
        <div class="d-types">${t.running ? '摸鱼进行中 · ' : ''}${fmtDur(t.minutes)}</div>
        <div class="d-dur">≈ ${equivalence(t.money)}</div>
      </div>
      <div class="d-money">${fmtMoney(t.money)}</div>
      <a class="d-share" href="share.html" title="生成战报"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/></svg></a>
    </div>`;
  const rows = PAST_DAYS.map(d => {
    const money = dayMoney(d, st);
    const typeNames = d.types.length ? [...new Set(d.types)].map(x => typeOf(x).name).join(' · ') : '休息日 / 爱岗敬业';
    return `
    <div class="day-item">
      <div class="d-date"><div class="dd">${d.date}</div><div class="dw">${d.weekday}</div></div>
      <div class="d-info">
        <div class="d-types">${typeNames}</div>
        <div class="d-dur">${d.minutes ? fmtDur(d.minutes) : '—'}</div>
      </div>
      <div class="d-money" style="${money ? '' : 'color:var(--sub)'}">${money ? fmtMoney(money) : '¥ 0.00'}</div>
    </div>`;
  }).join('');
  list.innerHTML = todayRow + rows;

  /* 今日行数据实时刷新 */
  setInterval(() => {
    const nt = todayStats();
    const el = list.querySelector('.day-item.today .d-money');
    if (el) el.textContent = fmtMoney(nt.money);
    const dur = list.querySelector('.day-item.today .d-types');
    if (dur) dur.textContent = (nt.running ? '摸鱼进行中 · ' : '') + fmtDur(nt.minutes);
  }, 1000);
}

/* ================================================================
 * 页面：战报分享
 * ================================================================ */
function initShare(){
  const now = new Date();
  const dateStr = `${now.getMonth()+1}月${now.getDate()}日`;
  let quip = '';

  function data(){
    const t = todayStats();
    const ms = monthStats();
    return { t, lv: levelOf(BASE_TOTAL + ms.money) };
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
    $('#rcDate').textContent = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
    $('#rcMoney').innerHTML = '<small>¥</small>' + t.money.toFixed(2);
    $('#rcDur').textContent = '带薪摸鱼 ' + fmtDur(t.minutes);
    $('#rcEq').textContent = '≈ ' + equivalence(t.money);
    $('#rcQuip').textContent = '“' + (quip || pickQuip(t.money)) + '”';
    $('#rcLevel').textContent = lv.cur.name;
  }
  render();
  setInterval(render, 1000);

  $('#btnQuip').addEventListener('click', () => { const { t } = data(); quip = pickQuip(t.money); render(); });

  $('#btnFriend').addEventListener('click', () => toast('原型演示：请保存图片后手动分享'));

  /* 保存图片：Canvas 渲染战报卡 → 下载 PNG（原型中代替"保存到相册"）
   * TODO: 小程序内替换为 wx.canvasToTempFilePath + wx.saveImageToPhotosAlbum */
  $('#btnSave').addEventListener('click', () => {
    const { t, lv } = data();
    const W = 750, H = 1100;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');

    /* 背景 */
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#14141f'); g.addColorStop(.6, '#0b0b12'); g.addColorStop(1, '#101008');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(232,255,43,.07)'; c.lineWidth = 1;
    for (let y = 0; y < H; y += 48){ c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    /* 边框 */
    c.strokeStyle = 'rgba(232,255,43,.5)'; c.lineWidth = 3;
    c.strokeRect(24, 24, W - 48, H - 48);

    c.textAlign = 'center';
    c.fillStyle = '#8b8b99';
    c.font = '26px sans-serif';
    c.fillText('摸 鱼 战 绩 计 算 器', W/2, 110);
    c.font = '24px Consolas, monospace';
    c.fillText($('#rcDate').textContent + ' 战报', W/2, 152);

    /* 金额（辉光） */
    c.shadowColor = 'rgba(232,255,43,.55)'; c.shadowBlur = 46;
    c.fillStyle = '#e8ff2b';
    c.font = '800 120px Consolas, monospace';
    c.fillText('¥' + t.money.toFixed(2), W/2, 330);
    c.shadowBlur = 0;

    c.fillStyle = '#f2f2f5';
    c.font = '32px Consolas, monospace';
    c.fillText('带薪摸鱼 ' + fmtDur(t.minutes), W/2, 400);
    c.fillStyle = '#4ecdc4';
    c.font = '30px sans-serif';
    c.fillText('≈ ' + equivalence(t.money), W/2, 452);

    /* 虚线分隔 */
    c.strokeStyle = 'rgba(232,255,43,.25)'; c.setLineDash([8, 8]);
    c.beginPath(); c.moveTo(120, 510); c.lineTo(W - 120, 510); c.stroke();
    c.setLineDash([]);

    /* 文案 */
    c.fillStyle = '#f2f2f5';
    c.font = '34px sans-serif';
    const q = '“' + quip + '”';
    if (c.measureText(q).width > W - 160){
      const mid = Math.ceil(q.length / 2);
      c.fillText(q.slice(0, mid), W/2, 580);
      c.fillText(q.slice(mid), W/2, 632);
    } else c.fillText(q, W/2, 580);

    /* 段位章 */
    c.fillStyle = '#e8ff2b';
    const badge = '段位 · ' + lv.cur.name;
    c.font = '800 28px sans-serif';
    const bw = c.measureText(badge).width + 72;
    c.beginPath();
    c.roundRect(W/2 - bw/2, 700, bw, 64, 32);
    c.fill();
    c.fillStyle = '#0a0a0f';
    c.fillText(badge, W/2, 742);

    c.fillStyle = '#8b8b99';
    c.font = '20px sans-serif';
    c.fillText('长按识别小程序码，一起带薪摸鱼（示意图）', W/2, H - 70);

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
