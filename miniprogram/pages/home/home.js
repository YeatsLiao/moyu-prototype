const store = require('../../utils/store');

Page({
  data: {
    types: store.TYPES,
    typeId: 'toilet',
    clock: '00:00:00',
    money: '0.00',
    eq: '—',
    running: false,
    paused: false,
    lv: store.levelOf(0),
    streak: 3,
    showSettle: false,
    settle: { money: '0.00', dur: '', quip: '' },
  },
  timer: null,

  onLoad() {
    store.normalizeRun();
    this.setData({ typeId: store.get('moyu_type', 'toilet') });
  },
  onShow() {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 200);
  },
  onHide() { clearInterval(this.timer); },
  onUnload() { clearInterval(this.timer); },

  refresh() {
    const run = store.loadRun();
    const t = store.dayStats();
    const runMs = run ? Date.now() - run.start : 0;
    this.setData({
      running: !!run,
      paused: !run && t.minutes > 0.01,
      clock: store.fmtClock(runMs),
      money: t.money.toFixed(2),
      eq: t.money > 0 ? store.equivalence(t.money) : '—',
      lv: store.levelOf(store.BASE_TOTAL + this.monthMoney()),
    });
  },
  monthMoney() {
    const st = store.loadSettings();
    return store.PAST_DAYS
      .filter(d => d.iso.slice(0, 7) === store.todayKey().slice(0, 7))
      .reduce((s, d) => s + store.pastMoney(d, st), store.dayStats().money);
  },

  onPick(e) {
    if (this.data.running || this.data.paused) return;
    const id = e.currentTarget.dataset.id;
    this.setData({ typeId: id });
    store.set('moyu_type', id);
  },

  onMain() {
    if (this.data.running) {
      // 暂停：当前段入账
      const run = store.loadRun();
      if (run) {
        const arr = store.loadSegments(run.date);
        arr.push({ typeId: run.typeId, start: run.start, end: Date.now() });
        store.saveSegments(run.date, arr);
        store.saveRun(null);
      }
    } else {
      // 开始 / 继续
      store.saveRun({ typeId: this.data.typeId, start: Date.now(), date: store.todayKey() });
    }
    this.refresh();
  },

  onEnd() {
    if (this.data.running) this.onMain(); // 先暂停入账
    const t = store.dayStats();
    const qs = store.QUOTES[store.quoteTier(t.money)];
    const quip = qs[Math.floor(Math.random() * qs.length)].replace('{m}', t.money.toFixed(2));
    this.setData({
      showSettle: true,
      settle: { money: t.money.toFixed(2), dur: store.fmtDur(t.minutes), quip },
    });
  },
  closeSettle() { this.setData({ showSettle: false }); },
  goShare() {
    this.closeSettle();
    wx.navigateTo({ url: '/pages/share/share' });
  },
});
