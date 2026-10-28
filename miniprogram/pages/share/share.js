const store = require('../../utils/store');

Page({
  data: {
    dateText: '',
    money: '0.00',
    dur: '0分钟',
    eq: '—',
    quip: '',
    lvIcon: '🐟',
    lvName: '摸鱼新手',
    showPrices: false,
    prices: [],
    priceNote: '',
  },
  iso: '',
  isToday: true,
  timer: null,

  onLoad(options) {
    const raw = options && options.date || '';
    this.iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : store.todayKey();
    this.isToday = this.iso === store.todayKey();
    if (!this.isToday) wx.setNavigationBarTitle({ title: '当日战报' });
  },
  onShow() {
    this.render();
    if (this.isToday) this.timer = setInterval(() => this.render(false), 1000);
  },
  onHide() { clearInterval(this.timer); },
  onUnload() { clearInterval(this.timer); },

  dayData() {
    if (this.isToday) return store.dayStats(this.iso);
    const st = store.loadSettings();
    const d = store.PAST_DAYS.find(x => x.iso === this.iso);
    return d ? { minutes: d.minutes, money: store.pastMoney(d, st) } : { minutes: 0, money: 0 };
  },
  totalMoney() {
    const st = store.loadSettings();
    const prefix = store.todayKey().slice(0, 7);
    return store.BASE_TOTAL + store.PAST_DAYS
      .filter(d => d.iso.slice(0, 7) === prefix)
      .reduce((s, d) => s + store.pastMoney(d, st), store.dayStats().money);
  },

  render(repick) {
    const t = this.dayData();
    const [y, m, d] = this.iso.split('-').map(Number);
    if (repick !== false || !this.data.quip) {
      const qs = store.QUOTES[store.quoteTier(t.money)];
      let q;
      do { q = qs[Math.floor(Math.random() * qs.length)]; } while (qs.length > 1 && q === this.data.quip);
      this.setData({ quip: q.replace('{m}', t.money.toFixed(2)) });
    }
    const lv = store.levelOf(this.totalMoney());
    this.setData({
      dateText: y + '.' + store.pad(m) + '.' + store.pad(d) + (this.isToday ? ' · 今天' : ''),
      money: t.money.toFixed(2),
      dur: store.fmtDur(t.minutes),
      eq: store.equivalence(t.money),
      lvIcon: lv.cur.icon,
      lvName: lv.cur.name,
    });
  },

  onQuip() { this.render(true); },

  openPrices() {
    const pm = store.perMinute(store.loadSettings());
    this.setData({
      showPrices: true,
      prices: store.GOODS.map(g => ({
        ...g,
        priceText: g.price % 1 ? g.price.toFixed(1) : String(g.price),
        minText: pm > 0 ? '摸 ' + Math.ceil(g.price / pm) + ' 分钟' : '—',
      })),
      priceNote: '战报只换算奶茶和鸡腿，其余是攒钱小目标',
    });
  },
  closePrices() { this.setData({ showPrices: false }); },

  /* ---------- Canvas 出图 → 保存相册 ---------- */
  onSave() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#reportCanvas').fields({ node: true, size: true }).exec(res => {
      if (!res[0] || !res[0].node) { wx.showToast({ title: '出图失败', icon: 'none' }); return; }
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2;
      const W = 375, H = 560;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.scale(dpr, dpr);

      // 纸底 + 边框
      ctx.fillStyle = '#FBF6EA'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#2A2723'; ctx.lineWidth = 3;
      ctx.strokeRect(14, 14, W - 28, H - 28);
      // 胶带
      ctx.save(); ctx.translate(W / 2, 14); ctx.rotate(-0.05);
      ctx.fillStyle = 'rgba(255,230,109,.75)'; ctx.fillRect(-60, -12, 120, 22); ctx.restore();
      // 印章
      ctx.save(); ctx.translate(W - 62, 78); ctx.rotate(0.28);
      ctx.strokeStyle = '#FF6B5B'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#FF6B5B'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('咸鱼认证', 0, 4); ctx.restore();

      const d0 = this.data;
      ctx.fillStyle = '#2A2723'; ctx.textAlign = 'center';
      ctx.font = '600 15px sans-serif';
      ctx.fillText('摸 鱼 战 绩 计 算 器', W / 2, 70);
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#8A8375';
      ctx.fillText(d0.dateText, W / 2, 94);
      // 荧光笔金额
      ctx.font = 'bold 54px "Courier New", monospace';
      const mw = ctx.measureText('¥' + d0.money).width;
      ctx.fillStyle = '#FFE66D'; ctx.fillRect(W / 2 - mw / 2 - 8, 120, mw + 16, 58);
      ctx.fillStyle = '#2A2723'; ctx.fillText('¥' + d0.money, W / 2, 168);
      ctx.font = '14px sans-serif'; ctx.fillStyle = '#8A8375';
      ctx.fillText(d0.dur, W / 2, 200);
      ctx.fillStyle = '#4A90B8';
      ctx.fillText('≈ ' + d0.eq, W / 2, 226);
      // 虚线
      ctx.strokeStyle = '#2A2723'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(44, 252); ctx.lineTo(W - 44, 252); ctx.stroke();
      ctx.setLineDash([]);
      // 文案
      ctx.fillStyle = '#2A2723'; ctx.font = '15px sans-serif';
      this.wrapText(ctx, '“' + d0.quip + '”', W / 2, 290, W - 110, 26);
      // 等级章 + 咸鱼
      ctx.font = 'bold 13px sans-serif';
      const lvText = d0.lvIcon + ' ' + d0.lvName;
      const lw = ctx.measureText(lvText).width + 28;
      ctx.strokeStyle = '#2A2723'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(W / 2 - lw / 2, 336, lw, 30, 15); ctx.stroke();
      ctx.fillText(lvText, W / 2, 356);
      ctx.font = '26px sans-serif'; ctx.fillText('🐟', W - 60, H - 60);
      ctx.font = '11px sans-serif'; ctx.fillStyle = '#8A8375';
      ctx.fillText('—— 摸鱼战绩计算器 ——', W / 2, H - 44);

      wx.canvasToTempFilePath({
        canvas,
        success: r => this.saveToAlbum(r.tempFilePath),
        fail: () => wx.showToast({ title: '出图失败', icon: 'none' }),
      });
    });
  },
  wrapText(ctx, text, x, y, maxW, lh) {
    let line = '', yy = y;
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, yy); line = ch; yy += lh; }
      else line += ch;
    }
    if (line) ctx.fillText(line, x, yy);
  },
  saveToAlbum(path) {
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => wx.showToast({ title: '已存进相册', icon: 'none' }),
      fail: err => {
        if (err.errMsg && err.errMsg.includes('auth')) {
          wx.showModal({
            title: '需要相册权限',
            content: '去设置里允许保存到相册',
            confirmText: '去设置',
            success: r => r.confirm && wx.openSetting(),
          });
        }
      },
    });
  },

  onShareAppMessage() {
    return {
      title: '今日摸鱼战绩：¥' + this.data.money + '，你也来算算？',
      path: '/pages/home/home',
    };
  },
});
