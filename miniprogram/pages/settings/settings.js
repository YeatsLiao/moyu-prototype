const store = require('../../utils/store');

Page({
  data: {
    schemes: store.SCHEME_LIST,
    salary: '',
    hours: '',
    scheme: 'double',
    rateHour: '--',
    rateMinute: '--',
    schemeDays: 21.75,
    showPrices: false,
    prices: [],
    priceNote: '',
  },

  onLoad() {
    const s = store.loadSettings();
    this.setData({
      salary: s.salary ? String(s.salary) : '',
      hours: String(s.hours),
      scheme: s.scheme,
    });
    this.preview();
  },

  cur() {
    return {
      salary: parseFloat(this.data.salary) || 0,
      hours: parseFloat(this.data.hours) || 0,
      scheme: this.data.scheme,
    };
  },
  preview() {
    const st = this.cur();
    const h = store.perHour(st);
    this.setData({
      rateHour: h > 0 ? h.toFixed(2) : '--',
      rateMinute: h > 0 ? (h / 60).toFixed(2) : '--',
      schemeDays: store.workdays(st),
    });
  },

  onSalary(e) { this.setData({ salary: e.detail.value }); this.preview(); },
  onHours(e) { this.setData({ hours: e.detail.value }); this.preview(); },
  onScheme(e) { this.setData({ scheme: e.currentTarget.dataset.id }); this.preview(); },

  onSave() {
    const st = this.cur();
    if (st.salary <= 0 || st.hours <= 0) {
      wx.showToast({ title: '月薪和工时都要大于 0', icon: 'none' });
      return;
    }
    store.saveSettings(st);
    wx.showToast({ title: '身价已校准', icon: 'none' });
  },

  openPrices() {
    const pm = store.perMinute(this.cur());
    this.setData({
      showPrices: true,
      prices: store.GOODS.map(g => ({
        ...g,
        priceText: g.price % 1 ? g.price.toFixed(1) : String(g.price),
        minText: pm > 0 ? '摸 ' + Math.ceil(g.price / pm) + ' 分钟' : '—',
      })),
      priceNote: pm > 0
        ? '按当前身价：摸 1 分钟 ≈ ¥' + pm.toFixed(2) + '；战报只换算奶茶和鸡腿'
        : '先填月薪，才能算要摸多久',
    });
  },
  closePrices() { this.setData({ showPrices: false }); },
});
