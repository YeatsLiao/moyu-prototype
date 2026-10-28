/* ============ mock.js · 唯一数据源 ============
 * 金额由"分钟数 × 当前薪资分薪"动态计算；改设置页薪资后，
 * 历史金额、等级、周/月对比会联动重算（原型演示效果）。
 * TODO: 接真实后端时替换为 GET /api/history?range=day|week|month，返回结构不变。
 */

const TYPES = [
  { id:'toilet', name:'带薪如厕', coef:1.2, icon:'door'   },
  { id:'daze',   name:'工位发呆', coef:1.0, icon:'brain'  },
  { id:'coffee', name:'咖啡回血', coef:0.8, icon:'coffee' },
  { id:'scroll', name:'划水刷帖', coef:1.1, icon:'scroll' },
];

const SCHEMES = [
  { id:'double', name:'双休',   days:21.75 },
  { id:'bigsm',  name:'大小周', days:23.75 },
  { id:'single', name:'单休',   days:25.75 },
];

/* 等级：按累计摸鱼总收益判定，只升不降（阈值按月薪 1w、每天摸 1~2 小时的量级设定） */
const LEVELS = [
  { name:'摸鱼新手',     min:0,    icon:'fish',     tip:'刚学会偷偷看一眼手机' },
  { name:'摸鱼老油条',   min:300,  icon:'fish',     tip:'摸得理直气壮，脸不红' },
  { name:'鱼塘塘主',     min:1500, icon:'crown',    tip:'整层楼的鱼都归你管' },
  { name:'带薪休假大师', min:4000, icon:'palmtree', tip:'上班约等于带薪休假' },
  { name:'摸鱼宗师',     min:8000, icon:'dragon',   tip:'你不在摸鱼，你就是鱼' },
];

/* 历史累计基数（本月之前攒下的家业） */
const BASE_TOTAL = 615.00;

const PAD = n => String(n).padStart(2,'0');
const WD  = ['周日','周一','周二','周三','周四','周五','周六'];

/* 最近 60 天（不含今天）的确定性战绩：工作日摸鱼，周末归零，偶尔请假
 * back = 距今天数（1 = 昨天），用于取"最近 7 天 / 上一周"等区间 */
const PAST_DAYS = (() => {
  const arr = [];
  const base = new Date(); base.setHours(0,0,0,0);
  for (let i = 1; i <= 60; i++){
    const d = new Date(base.getTime() - i * 86400000);
    const dow = d.getDay();
    const seed = d.getDate() * 37 + d.getMonth() * 11 + i * 7;
    let minutes = 0;
    if (dow !== 0 && dow !== 6 && seed % 17 !== 0) minutes = 45 + (seed * 13) % 155;
    if (i === 1 && minutes === 0) minutes = 95;   /* 保证昨天有战绩，演示环比有基准 */
    const types = [];
    if (minutes){
      const n = Math.min(3, 1 + Math.floor(minutes / 80));
      for (let k = 0; k < n; k++) types.push(TYPES[(seed + k * 3) % TYPES.length].id);
    }
    arr.push({
      back: i,
      iso: `${d.getFullYear()}-${PAD(d.getMonth()+1)}-${PAD(d.getDate())}`,
      date: `${PAD(d.getMonth()+1)}-${PAD(d.getDate())}`,
      weekday: WD[dow],
      dow,
      minutes,
      types,
    });
  }
  return arr;
})();

/* 战报文案：按当日收益分档，越高越嚣张 */
const QUOTES = {
  zero:  ['今天一分钱没摸，老板赚麻了。'],
  tier1: ['摸鱼 ¥{m}，不多，但这是我应得的。',
          '今日战绩：为老板省下了奋斗的力气。',
          '摸鱼一小会儿，神清气爽一下午，血赚。'],
  tier2: ['工资是劳动所得，摸鱼收益才是净赚。',
          '把上班过成了按分钟计费的副业。',
          '今日带薪摸鱼 ¥{m}，老板以为我在奋斗，其实我在养鱼。'],
  tier3: ['你摸的不是鱼，是资本家的剩余价值。',
          '今日摸鱼收益 ¥{m}，感谢老板的天使轮投资。',
          '别人上班赚钱，我上班"赚"钱——各赚各的。'],
};

function quoteTier(money){
  if (money <= 0)  return 'zero';
  if (money < 20)  return 'tier1';
  if (money < 50)  return 'tier2';
  return 'tier3';
}

/* 等价物价目表：eq = true 的参与战报等价换算（从贵到便宜拆解） */
const GOODS = [
  { name:'鸡腿',       unit:'个', price:6,   eq:true  },
  { name:'疯狂星期四', unit:'份', price:9.9, eq:false },
  { name:'奶茶',       unit:'杯', price:15,  eq:true  },
  { name:'视频会员',   unit:'月', price:25,  eq:false },
  { name:'盲盒',       unit:'个', price:39,  eq:false },
  { name:'游戏皮肤',   unit:'个', price:88,  eq:false },
];
function eqGoods(){ return GOODS.filter(g => g.eq).sort((a, b) => b.price - a.price); }
function equivalence(money){
  let rest = Math.floor(money * 100) / 100, out = [];
  for (const g of eqGoods()){
    const n = Math.floor(rest / g.price);
    if (n > 0){ out.push(`${n} ${g.unit}${g.name}`); rest = Math.round((rest - n * g.price) * 100) / 100; }
  }
  return out.length ? out.join(' + ') : '还差一点点就能换鸡腿';
}
