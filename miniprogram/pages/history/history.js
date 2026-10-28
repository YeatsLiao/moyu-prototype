const store = require('../../utils/store');

const RANGES = [
  { id: 'day', name: '日' },
  { id: 'week', name: '周' },
  { id: 'month', name: '月' },
];
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

Page({
  data: {
    ranges: RANGES,
    range: 'week',
    lv: store.levelOf(0),
    lvList: [],
    totalText: '0.00',
    showLv: false,
    stat: { dur: '0分钟', money: '0.00', eq: '0 杯' },
    cmp: { up: true, pct: 0, prevLabel: '上周', prev: '0.00' },
    offset: 0,
    calTitle: '',
    cells: [],
    selectedIso: '',
    detail: { head: '', money: '¥0.00', dur: '0分钟', eq: '', has: false, isToday: true },
  },
  timer: null,

  onShow() {
    if (!this.data.selectedIso) this.setData({ selectedIso: store.todayKey() });
    this.renderAll();
    this.timer = setInterval(() => this.renderAll(), 1000);
  },
  onHide() { clearInterval(this.timer); },
  onUnload() { clearInterval(this.timer); },

  /* ---------- 数据 ---------- */
  dayData(iso, st) {
    if (iso === store.todayKey()) return store.dayStats(iso);
    const d = store.PAST_DAYS.find(x => x.iso === iso);
    if (!d) return { minutes: 0, money: 0 };
    return { minutes: d.minutes, money: store.pastMoney(d, st) };
  },
  monthMoney(offset, st) {
    const now = new Date();
    const ym = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const prefix = ym.getFullYear() + '-' + store.pad(ym.getMonth() + 1);
    let sum = store.PAST_DAYS.filter(d => d.iso.slice(0, 7) === prefix)
      .reduce((s, d) => s + store.pastMoney(d, st), 0);
    if (offset === 0) sum += store.dayStats().money;
    return Math.round(sum * 100) / 100;
  },

  renderAll() {
    const st = store.loadSettings();
    const total = store.BASE_TOTAL + this.monthMoney(0, st);
    const lv = store.levelOf(total);
    this.setData({
      lv,
      totalText: total.toFixed(2),
      lvList: store.LEVELS.map((l, i) => ({
        ...l,
        on: i === lv.idx,
        range: i === store.LEVELS.length - 1 ? '¥' + l.min + '+' : '¥' + l.min + '–' + store.LEVELS[i + 1].min,
      })),
    });
    this.renderRange(st);
    this.renderCalendar(st);
    this.renderDetail(st);
  },

  /* ---------- 日/周/月 ---------- */
  renderRange(st) {
    const { range } = this.data;
    const today = store.todayKey();
    const inLast7 = iso => (new Date(today) - new Date(iso)) / 86400000 < 7;
    const sum = (arr, f) => Math.round(arr.reduce((s, d) => s + f(d), 0) * 100) / 100;

    let durMin, money, eqCount, prev, prevLabel;
    if (range === 'day') {
      const t = store.dayStats();
      durMin = t.minutes; money = t.money;
      eqCount = Math.floor(t.money / 15);
      const y = store.PAST_DAYS.find(d => d.iso === store.keyOf(new Date(Date.now() - 86400000)));
      prev = y ? store.pastMoney(y, st) : 0;
      prevLabel = '昨日';
    } else if (range === 'week') {
      const days = store.PAST_DAYS.filter(d => inLast7(d.iso));
      const t = store.dayStats();
      durMin = days.reduce((s, d) => s + d.minutes, 0) + t.minutes;
      money = sum(days, d => store.pastMoney(d, st)) + t.money;
      eqCount = Math.floor(money / 15);
      prev = sum(store.PAST_DAYS.filter(d => {
        const diff = (new Date(today) - new Date(d.iso)) / 86400000;
        return diff >= 7 && diff < 14;
      }), d => store.pastMoney(d, st));
      prevLabel = '上周';
    } else {
      const now = new Date();
      const prefix = now.getFullYear() + '-' + store.pad(now.getMonth() + 1);
      const days = store.PAST_DAYS.filter(d => d.iso.slice(0, 7) === prefix);
      const t = store.dayStats();
      durMin = days.reduce((s, d) => s + d.minutes, 0) + t.minutes;
      money = this.monthMoney(0, st);
      eqCount = Math.floor(money / 15);
      prev = this.monthMoney(1, st);
      prevLabel = '上月';
    }
    const pct = prev > 0 ? Math.abs(Math.round((money - prev) / prev * 100)) : 100;
    this.setData({
      stat: { dur: store.fmtDur(durMin), money: money.toFixed(2), eq: eqCount + ' 杯' },
      cmp: { up: money >= prev, pct, prevLabel, prev: prev.toFixed(2) },
    });
  },
  onRange(e) {
    this.setData({ range: e.currentTarget.dataset.id });
    this.renderRange(store.loadSettings());
  },

  /* ---------- 日历 ---------- */
  renderCalendar(st) {
    const { offset, selectedIso } = this.data;
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const y = base.getFullYear(), m = base.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const lead = (base.getDay() + 6) % 7; // 周一开头
    const monthPrefix = y + '-' + store.pad(m + 1);
    const monthDays = store.PAST_DAYS.filter(d => d.iso.slice(0, 7) === monthPrefix);
    const maxMoney = Math.max(1, ...monthDays.map(d => store.pastMoney(d, st)));

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push({ idx: 'x' + i, iso: '' });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = monthPrefix + '-' + store.pad(d);
      const future = iso > store.todayKey();
      const { money } = future ? { money: 0 } : this.dayData(iso, st);
      let heat = 0;
      if (money > 0) heat = money / maxMoney > 0.66 ? 3 : money / maxMoney > 0.33 ? 2 : 1;
      cells.push({
        idx: iso, iso: future ? '' : iso, day: d, heat,
        isToday: iso === store.todayKey(),
        moneyText: money > 0 ? (money >= 10 ? '¥' + Math.round(money) : '¥' + money.toFixed(1)) : '',
      });
    }
    this.setData({
      cells,
      calTitle: y + '年' + (m + 1) + '月' + (offset === 0 ? ' · 本月' : ''),
    });
    // 如果选中的日子不在当前月份，自动选本月最后一个有战绩的日子
    if (selectedIso.slice(0, 7) !== monthPrefix) {
      const last = monthDays.filter(d => d.minutes > 0).pop();
      this.setData({ selectedIso: offset === 0 ? store.todayKey() : (last ? last.iso : monthDays.length ? monthDays[monthDays.length - 1].iso : monthPrefix + '-01') });
      this.renderDetail(st);
    }
  },
  onDay(e) {
    const iso = e.currentTarget.dataset.iso;
    if (!iso) return;
    this.setData({ selectedIso: iso });
    this.renderDetail(store.loadSettings());
  },
  prevMonth() { if (this.data.offset < 1) { this.setData({ offset: 1 }); this.renderCalendar(store.loadSettings()); } },
  nextMonth() { if (this.data.offset > 0) { this.setData({ offset: 0 }); this.renderCalendar(store.loadSettings()); } },

  /* ---------- 详情 ---------- */
  renderDetail(st) {
    const iso = this.data.selectedIso;
    if (!iso) return;
    const { minutes, money } = this.dayData(iso, st);
    const [y, m, d] = iso.split('-').map(Number);
    const isToday = iso === store.todayKey();
    this.setData({
      detail: {
        head: isToday ? '今天' : m + '月' + d + '日 · 周' + WEEK[new Date(y, m - 1, d).getDay()],
        money: store.fmtMoney(money),
        dur: store.fmtDur(minutes),
        eq: store.equivalence(money),
        has: minutes > 0.01 || money > 0.01,
        isToday,
      },
    });
  },
  goShare() {
    const { detail, selectedIso } = this.data;
    wx.navigateTo({ url: '/pages/share/share' + (detail.isToday ? '' : '?date=' + selectedIso) });
  },

  openLv() { this.setData({ showLv: true }); },
  closeLv() { this.setData({ showLv: false }); },
});
