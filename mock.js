/* ============ mock.js · 唯一数据源 ============
 * 所有页面从这里读数据；金额由"分钟数 × 当前薪资分薪"动态计算，
 * 改设置页的薪资后，历史战绩金额会联动变化（原型演示效果）。
 * TODO: 接真实后端时替换为 GET /api/history 等接口，保持返回结构不变。
 */

const TYPES = [
  { id:'toilet', name:'带薪如厕', coef:1.2, desc:'肉身离场，风险溢价 +20%',      icon:'door'   },
  { id:'daze',   name:'工位发呆', coef:1.0, desc:'人在工位，魂在峡谷',          icon:'brain'  },
  { id:'coffee', name:'咖啡回血', coef:0.8, desc:'名为摸鱼，实为续命加班',      icon:'coffee' },
  { id:'scroll', name:'划水刷帖', coef:1.1, desc:'手指在滑，KPI 在摆',          icon:'scroll' },
];

const SCHEMES = [
  { id:'double', name:'双休',   days:21.75, sub:'周末双休 · 标准打工人' },
  { id:'bigsm',  name:'大小周', days:23.75, sub:'一大一小 · 间歇性坚强' },
  { id:'single', name:'单休',   days:25.75, sub:'月休四天 · 福报体验卡' },
];

/* 等级：按累计摸鱼总收益判定，只升不降 */
const LEVELS = [
  { name:'摸鱼新手',     min:0,   icon:'fish'    },
  { name:'摸鱼老油条',   min:10,  icon:'fish'    },
  { name:'鱼塘塘主',     min:50,  icon:'crown'   },
  { name:'带薪休假大师', min:200, icon:'palmtree'},
  { name:'摸鱼宗师',     min:500, icon:'dragon'  },
];

/* 历史累计基数（本月之前攒下的家业），用于等级判定 */
const BASE_TOTAL = 163.40;

/* 过去战绩：只存分钟数与类型，金额动态换算 */
const PAST_DAYS = [
  { date:'10-27', weekday:'周二', minutes:126, types:['scroll','toilet'] },
  { date:'10-26', weekday:'周一', minutes:152, types:['daze','scroll'] },
  { date:'10-25', weekday:'周日', minutes:0,   types:[] },
  { date:'10-24', weekday:'周六', minutes:0,   types:[] },
  { date:'10-23', weekday:'周五', minutes:98,  types:['toilet','coffee'] },
  { date:'10-22', weekday:'周四', minutes:173, types:['scroll','daze','toilet'] },
  { date:'10-21', weekday:'周三', minutes:87,  types:['coffee'] },
  { date:'10-20', weekday:'周二', minutes:141, types:['daze','scroll'] },
  { date:'10-19', weekday:'周一', minutes:64,  types:['toilet'] },
  { date:'10-16', weekday:'周五', minutes:188, types:['scroll','scroll','toilet'] },
  { date:'10-15', weekday:'周四', minutes:112, types:['daze'] },
  { date:'10-14', weekday:'周三', minutes:95,  types:['coffee','scroll'] },
];

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

/* 等价物：贪心拆解，先奶茶后鸡腿 */
const GOODS = [
  { name:'奶茶', unit:'杯', price:15 },
  { name:'鸡腿', unit:'个', price:6  },
];
function equivalence(money){
  let rest = Math.floor(money * 100) / 100, out = [];
  for (const g of GOODS){
    const n = Math.floor(rest / g.price);
    if (n > 0){ out.push(`${n} ${g.unit}${g.name}`); rest = Math.round((rest - n * g.price) * 100) / 100; }
  }
  return out.length ? out.join(' + ') : '还差一点点就能换鸡腿';
}
