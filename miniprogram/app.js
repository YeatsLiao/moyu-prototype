App({
  onLaunch() {
    // 跨天兜底：昨天开始还没停的计时，自动记到昨天
    const store = require('./utils/store');
    store.normalizeRun();
  }
});
