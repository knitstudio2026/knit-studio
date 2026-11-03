/**
 * 毛衣上架素材生成引擎（纯规则，无需联网 / 无需 API Key）
 * 输入：一组商品标签 + 一张图
 * 输出：标题、卖点、SKU 规格、详情页文案、拼多多属性表
 */

export const OPTIONS = {
  category: ['套头毛衣', '针织开衫', '毛衣马甲', '针织连衣裙', '毛衣外套', '打底针织衫', '其他'],
  material: ['羊毛', '羊绒', '棉', '聚酯纤维', '腈纶', '锦纶', '粘纤', '马海毛', '兔毛', '混纺'],
  craft: ['麻花编织', '提花', '镂空', '钩花', '拼色', '条纹', '纯色', '绞花', '坑条', '其他'],
  // 以下选项对齐拼多多「女装/毛衣针织衫」发布页的商品属性项
  wearStyle: ['套头', '开衫', '马甲', '连衣裙'],
  neck: ['圆领', 'V领', '高领', '半高领', '翻领', '连帽', '方领', '一字领', '娃娃领', '立领', 'POLO领'],
  fit: ['宽松', '修身', '直筒', '收腰', '常规'],
  length: ['短款', '常规款', '中长款', '长款'],
  sleeveLen: ['无袖', '短袖', '五分袖', '七分袖', '九分袖', '长袖'],
  sleeveType: ['常规', '落肩袖', '插肩袖', '泡泡袖', '灯笼袖', '公主袖', '蝙蝠袖'],
  weight: ['薄款', '常规', '加厚', '加绒'],
  pattern: ['纯色', '条纹', '格子', '印花', '提花', '拼色', '刺绣', '字母', '动物纹'],
  elements: ['纯色', '纽扣', '口袋', '拉链', '蝴蝶结', '蕾丝', '荷叶边', '流苏', '刺绣', '拼接', '钉珠', '镂空'],
  fiber: ['针织', '毛线', '羊毛', '羊绒', '雪尼尔', '棉线', '马海毛', '冰丝'],
  age: ['青年（18-25周岁）', '中青年（26-40周岁）', '中年（41-50周岁）', '中老年（51-60周岁）'],
  fleece: ['不加绒', '加绒'],
  mainStyle: ['甜美清新', '个性街头', '气质名媛', '简约通勤', '文艺复古', '小众特色'],
  subStyle: ['韩版', '日系', '法式', '复古', '小清新', '通勤', '学院风', 'ins风', '慵懒风', '温柔风', '小香风', '运动风'],
  style: ['慵懒风', '韩版', '日系', '复古', '法式', '学院风', '通勤', 'ins风', '温柔风', '其他'],
  audience: ['女士', '学生', '妈妈', '大码', '情侣', '青少年', '其他'],
  season: ['春季', '夏季', '秋季', '冬季', '春秋', '秋冬', '四季'],
  color: ['燕麦色', '奶白色', '雾霾蓝', '奶茶色', '焦糖色', '墨绿色', '藏青色', '黑色', '灰色', '粉色', '浅杏色', '酒红色', '其他'],
  size: ['S', 'M', 'L', 'XL', '2XL', '3XL', '均码', '其他'],
  scene: ['内搭打底', '单穿外穿', '通勤上班', '约会日常', '校园', '居家', '其他']
};

export const SIZE_WEIGHT = {
  S: '85-100斤',
  M: '100-115斤',
  L: '115-130斤',
  XL: '130-145斤',
  '2XL': '145-160斤',
  '3XL': '160-175斤',
  均码: '90-140斤'
};

const TITLE_LIMIT = 60;

const MATERIAL_FEEL = {
  羊毛: ['软糯不扎', '保暖锁温', '亲肤细腻'],
  羊绒: ['云朵手感', '轻盈保暖', '贴肤不扎'],
  兔毛: ['蓬松柔软', '轻盈不压身', '暖糯亲肤'],
  混纺: ['柔软不扎', '挺括有型', '保暖耐穿'],
  棉: ['亲肤透气', '吸湿排汗', '不易起球'],
  聚酯纤维: ['挺括不易皱', '耐磨耐穿', '好打理'],
  腈纶: ['弹力回弹', '不易变形', '轻盈保暖'],
  锦纶: ['高弹耐磨', '回弹好', '不易变形'],
  粘纤: ['顺滑垂坠', '亲肤透气', '不易起静电'],
  马海毛: ['毛绒质感', '蓬松有光泽', '轻盈'],
};

const CRAFT_DESC = {
  麻花编织: '立体麻花绞花工艺，纹路清晰有厚度，穿在身上自带设计感，不怕过时。',
  提花: '整片提花织造，图案边缘干净，不是印花贴上去的，洗多次也不掉色。',
  镂空: '局部镂空织法，透气不闷，层次感强，单穿也有小心机。',
  钩花: '手工钩花点缀，花型立体，远看近看都有细节。',
  拼色: '色块拼接撞色，版型更显年轻，搭配深浅都好看。',
  条纹: '经典条纹，纵向视觉拉长身形，显瘦不挑人。',
  纯色: '纯色干净好搭配，通勤、日常、约会都不会出错。',
  绞花: '绞花走线紧实，表面有肌理感，上身有质感不廉价。',
  坑条: '竖向坑条，贴身显瘦，弹性好不勒肉。'
};

const FIT_DESC = {
  宽松: '宽松落肩版型，遮腰腹不显肉，里面塞厚内搭也活动自如。',
  修身: '修身但不紧勒，贴合身形显腰线，做内搭更利落。',
  直筒: '直筒版型不挑身材，上下一条直线，显瘦又利落。',
  收腰: '微收腰设计，腰线清楚，显比例不臃肿。',
  A字: 'A 字下摆，遮胯遮大腿，梨形身材也能穿。',
  常规: '常规版型，肩线自然，日常穿不挑人。',
  落肩: '落肩袖设计，肩线自然下沉，肩宽背厚也能穿得轻松。',
  短款: '短款衣长，配高腰裤/半裙显腿长比例。',
  中长款: '中长衣长，遮胯遮臀，外面套大衣也不臃肿。',
  oversize: 'Oversize 大廓形，慵懒随性，一件撑起整个氛围感。'
};

const PROMISE = ['7天无理由退换', '48小时内发货', '运费险可选', '正品保障'];

/* ---------------- 工具 ---------------- */

const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
const pick = (arr, i) => arr[i % arr.length];

function charLen(s) {
  return Array.from(s.replace(/\s+/g, '')).length;
}

function fitLimit(s, limit = TITLE_LIMIT) {
  const clean = s.replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean);
  if (chars.length <= limit) return clean;
  let cut = '';
  let count = 0;
  for (const ch of chars) {
    if (count >= limit) break;
    cut += ch;
    if (!/\s/.test(ch)) count += 1;
  }
  return cut.replace(/\s+\S*$/, '').trim();
}

const pad = (n) => String(n).padStart(2, '0');

/* ---------------- 标题 ---------------- */

const CAT_SYNONYMS = {
  套头毛衣: ['套头毛衣', '针织衫', '套头衫', '打底衫', '针织上衣'],
  针织开衫: ['针织开衫', '毛衣外套', '开衫外套', '针织上衣'],
  毛衣马甲: ['毛衣马甲', '针织背心', '马甲上衣'],
  针织连衣裙: ['针织连衣裙', '毛衣裙', '针织长裙'],
  毛衣外套: ['毛衣外套', '针织开衫', '厚外套'],
  打底针织衫: ['打底针织衫', '打底衫', '内搭上衣', '针织衫']
};

export function makeTitles(input) {
  const cat = input.category || '套头毛衣';
  const mats = uniq(input.materials || []);
  const crafts = uniq(input.crafts || []);
  const neck = input.neck || '圆领';
  const fit = input.fit || '宽松';
  const styles = uniq(input.styles || []);
  const aud = uniq(input.audience || ['女士']);
  const weight = input.weight || '常规';
  const season = input.season || '秋冬';
  const scenes = uniq(input.scene || []);
  const year = new Date().getFullYear();

  const synonyms = CAT_SYNONYMS[cat] || [cat];
  const catWord = synonyms[0].replace(/针织/, '');
  const catSyn = synonyms[1] || catWord;
  const matWord = mats.length ? (mats.length > 1 ? mats.join('') : mats[0]) : '针织';
  const styleWord = styles[0] || '慵懒风';
  const styleWord2 = styles[1] || '百搭';
  const audWord = aud[0] || '女士';
  const sceneWord = scenes[0] || '内搭打底';
  const sceneWord2 = scenes[1] || '单穿外穿';
  const craftWord = crafts[0] || '麻花编织';
  const coreWord = `${audWord}${catWord}`;
  const coreWord2 = `${catSyn}`;

  const feel = uniq(mats.flatMap((m) => MATERIAL_FEEL[m] || [])).slice(0, 3);
  const extra = uniq((input.extra || '').split(/[,，、\s]+/)).filter(Boolean).slice(0, 4);
  const hot = ['显瘦', '百搭', '保暖', '软糯'];

  const pool = uniq([
    `${year}${season}新款`,                       // 0
    styleWord,                                   // 1
    coreWord,                                    // 2
    matWord,                                     // 3
    craftWord,                                   // 4
    `${weight}${neck}`,                          // 5
    fit,                                         // 6
    ...feel,                                     // 7,8,9
    sceneWord,                                   // 10
    ...extra,                                    // 11+
    coreWord2,                                   // after extra
    `${styleWord2}${catSyn}`,
    `${season}${weight}`,
    sceneWord2,
    ...hot
  ]);

  const n = pool.length;
  const at = (i) => pool[Math.min(i, n - 1)];

  const combos = [
    // 1 关键词堆砌
    [0, 1, 2, 3, 4, 5, 6, 7, 10],
    // 2 卖点前置
    [7, 5, 2, 1, 3, 6, 8, 10],
    // 3 场景痛点
    [10, 2, 5, 7, 1, 3, 4, 9],
    // 4 风格人群
    [1, 2, 4, 3, 5, 6, 8, 11],
    // 5 材质工艺
    [3, 4, 5, 2, 1, 6, 0, 7],
    // 6 同义词长尾
    [n - 5, n - 4, 2, 5, 3, 6, 1, 10],
    // 7 满配长尾（接近 60 字上限）
    [0, 1, 2, 3, 4, 5, 6, 7, 10, n - 5, n - 4, n - 2]
  ].map((idxs) => idxs.map(at));

  // 防比价：每次生成随机打乱 2~3 个词的位置，并随机加一个语气词/修饰词，避免标题和别家完全一致
  const extraFlavor = ['洋气', '减龄', '显白', '遮肉', '不起球', '不缩水', '高质感', '氛围感', '小香风', '甜美', '显瘦', '百搭', '软糯', '亲肤', '高级感', '韩系', '温柔', '气质', '慵懒', '简约'];
  const flav = extraFlavor[Math.floor(Math.random() * extraFlavor.length)];
  const titles = combos.map((parts, i) => {
    const useFlav = Math.random() > 0.4 ? [flav] : [];
    // 随机交换 1 对相邻元素位置
    if (parts.length > 2 && Math.random() > 0.5) {
      const k = Math.floor(Math.random() * (parts.length - 1));
      [parts[k], parts[k + 1]] = [parts[k + 1], parts[k]];
    }
    const t = fitLimit(useFlav.concat(parts).filter(Boolean).join(' '));
    return { text: t, len: charLen(t), kind: ['关键词堆砌', '卖点前置', '场景痛点', '风格人群', '材质工艺', '同义词长尾', '满配长尾'][i] };
  });

  const seen = new Set();
  return titles.filter((t) => {
    if (!t.text || seen.has(t.text)) return false;
    seen.add(t.text);
    return true;
  });
}

/* ---------------- 卖点 ---------------- */

export function makeSellingPoints(input) {
  const mats = uniq(input.materials || []);
  const crafts = uniq(input.crafts || []);
  const fit = input.fit || '宽松';
  const weight = input.weight || '常规';
  const list = [];

  mats.forEach((m) => {
    const f = MATERIAL_FEEL[m] || [];
    if (f[0]) list.push({ icon: '◈', text: `${m}材质 · ${f[0]}`, desc: f.slice(1).join('，') || f[0] });
  });

  list.push({ icon: '✳', text: '不易起球不掉毛', desc: '加密纱线工艺，日常摩擦不易起球' });
  if (/加厚|厚实/.test(weight)) list.push({ icon: '☀', text: '加厚保暖锁温', desc: '厚度升级，秋冬单穿也扛冻' });
  list.push({ icon: '⌁', text: `${fit}版型显瘦`, desc: FIT_DESC[fit] || '' });

  crafts.forEach((c) => {
    list.push({ icon: '❖', text: c, desc: CRAFT_DESC[c] || '' });
  });

  list.push({ icon: '♡', text: '内搭外穿两用', desc: '单穿有型，做内搭不臃肿' });
  list.push({ icon: '⚖', text: '弹力回弹不变形', desc: '多次洗涤依然回弹，不松垮' });
  list.push({ icon: '☁', text: '软糯不扎人', desc: '贴肤穿也舒服，敏感肌可尝试' });

  const out = [];
  const seen = new Set();
  for (const p of list) {
    if (seen.has(p.text)) continue;
    seen.add(p.text);
    out.push(p);
    if (out.length >= 8) break;
  }
  return out;
}

/* ---------------- SKU ---------------- */

export function makeSkus(input) {
  const colors = uniq(input.colors || ['燕麦色']);
  const sizes = uniq(input.sizes || ['M']);
  const price = Number(input.price) || 59.9;
  const skus = [];
  let n = 1;
  // 防比价：给每个颜色随机一个别名后缀，SKU 规格名不和同行撞
  const colorAlias = {
    燕麦色: ['燕麦奶', '杏奶茶', '米杏色', '燕麦奶白'],
    奶白色: ['奶油白', '云朵白', '象牙白', '糯米白'],
    雾霾蓝: ['灰雾蓝', '雾感蓝', '烟灰蓝', '雾霾灰蓝'],
    奶茶色: ['焦糖奶', '棕奶茶', '拿铁棕', '奶茶棕'],
    焦糖色: ['焦糖棕', '红棕焦糖', '太妃糖', '焦糖橘'],
    墨绿色: ['森林绿', '复古墨绿', '暗松绿', '墨松绿'],
    藏青色: ['深海蓝', '藏青蓝', '暗夜蓝', '深蓝藏青'],
    黑色: ['经典黑', '炭黑', '暗夜黑', '纯黑'],
    灰色: ['云雾灰', '高级灰', '烟灰', '浅麻灰'],
    粉色: ['樱花粉', '蜜桃粉', '奶油粉', '雾粉'],
    浅杏色: ['浅杏奶', '杏色', '奶茶杏', '裸杏色'],
    酒红色: ['复古酒红', '勃艮第红', '暗酒红', '车厘子红']
  };
  const randomSuffix = () => String(Math.floor(Math.random() * 900) + 100);
  colors.forEach((c) => {
    sizes.forEach((s) => {
      const alias = (colorAlias[c] && colorAlias[c][Math.floor(Math.random() * colorAlias[c].length)]) || c;
      const sep = ['-', '/', '·', ' '][Math.floor(Math.random() * 4)];
      skus.push({
        id: 'sku-' + n++,
        spec1: c,
        spec2: s,
        name: `${alias} ${s}码`,
        pddName: `${alias}${sep}${s}`,
        price: price.toFixed(2),
        stock: 100,
        code: `KN${randomSuffix()}${String(n - 1).padStart(2, '0')}`
      });
    });
  });
  return skus;
}

/* ---------------- 详情页 ---------------- */

export function makeDetail(input) {
  const cat = input.category || '套头毛衣';
  const mats = uniq(input.materials || []);
  const crafts = uniq(input.crafts || []);
  const neck = input.neck || '圆领';
  const fit = input.fit || '宽松';
  const styles = uniq(input.styles || []);
  const weight = input.weight || '常规';
  const season = input.season || '秋冬';
  const sizes = uniq(input.sizes || ['M']);
  const aud = uniq(input.audience || ['女士']);
  const points = makeSellingPoints(input);
  const color = (input.colors || ['燕麦色'])[0];

  const matSentence = mats.length
    ? `这件选用了${mats.join(' + ')}纱线，${uniq(mats.flatMap((m) => MATERIAL_FEEL[m] || [])).slice(0, 3).join('、')}。上手是软糯的，贴脖子、贴手臂都不扎。`
    : '选用亲肤针织纱线，软糯有弹性，贴身穿也舒服。';

  const craftSentence = crafts.length
    ? crafts.map((c) => CRAFT_DESC[c]).filter(Boolean).join(' ')
    : '细密织法，表面平整，不易勾丝起球。';

  const sections = [
    {
      title: '一句话卖点',
      lines: [
        `${season}${weight}款${neck}${cat}`,
        `${points[0] ? points[0].text : '软糯保暖'} · ${points[1] ? points[1].text : '显瘦版型'}`,
        `单穿好看，内搭不臃肿，学生通勤都能穿`
      ]
    },
    {
      title: '为什么选它',
      lines: points.slice(0, 6).map((p) => `${p.icon} ${p.text}：${p.desc}`)
    },
    {
      title: '材质说明',
      lines: [matSentence, '收到货建议先通风挂一天，再上身更蓬松。']
    },
    {
      title: '工艺细节',
      lines: [craftSentence, `领口是${neck}，锁住风口不灌风；下摆螺纹收口，不翘边不变形。`]
    },
    {
      title: '版型与尺码',
      lines: [
        FIT_DESC[fit] || '常规版型，正常尺码拍。',
        sizes.map((s) => `${s} 码建议 ${SIZE_WEIGHT[s] || '常规体重'}`).join('｜'),
        '身高体重卡在两个码中间，喜欢宽松选大一码。'
      ]
    },
    {
      title: '穿搭建议',
      lines: [
        `① ${color}${cat} + 直筒牛仔裤 + 小白鞋：日常通勤，干净不出错`,
        `② 同色系半身裙 + 短靴：温柔路线，约会拍照好看`,
        `③ 外面套大衣/羽绒服：当内搭穿，领口露出来有层次`
      ]
    },
    {
      title: '洗涤保养',
      lines: [
        '建议手洗或羊毛档轻柔机洗，水温不超过 30℃',
        '平铺阴干，不要悬挂暴晒，避免拉长变形',
        '不要用洗衣粉，选中性洗涤剂，起球用毛球修剪器轻推'
      ]
    },
    {
      title: '服务承诺',
      lines: PROMISE.map((p) => `✓ ${p}`)
    },
    {
      title: '常见问题',
      lines: [
        'Q：会不会扎人？ A：纱线做过柔软处理，贴身穿不扎；对羊毛敏感的姐妹建议里面加一件打底。',
        'Q：起球吗？ A：加密织法 + 抗起球纱线，日常穿着不易起球，摩擦多的部位（腋下、袖口）长期穿有轻微起球属正常，用修剪器处理即可。',
        'Q：会掉色吗？ A：深色建议单独洗涤，前两次轻微浮色属正常，不是质量问题。',
        'Q：码数怎么选？ A：按平时穿的码拍；喜欢宽松或肩宽选大一码。',
        'Q：什么时候发货？ A：48 小时内发出。'
      ]
    }
  ];

  return { sections, matSentence, craftSentence };
}

/* ---------------- 属性表 ---------------- */

export function makeAttrs(input) {
  const mats = uniq(input.materials || []);
  const elems = uniq(input.elements || []);
  const year = new Date().getFullYear();
  const main = mats[0] || '聚酯纤维';
  const pct = mats.length > 1 ? `${main}30%+${mats[1]}70%` : `${main}100%`;
  // 字段和顺序照拼多多女装商品属性：品牌、穿着方式、厚薄、衣长、领型、袖长、袖型、服装版型、
  // 图案、主面料成分、成分含量、面料俗称、适用年龄、流行元素、是否加绒、上市时节、主风格、风格
  return [
    ['商品类目', input.category || '套头毛衣'],
    ['品牌', '无品牌'],
    ['穿着方式', input.wearStyle || '套头'],
    ['厚薄', input.weight || '常规'],
    ['衣长', input.length || '常规款'],
    ['领型', input.neck || '圆领'],
    ['袖长', input.sleeveLen || '长袖'],
    ['袖型', input.sleeveType || '常规'],
    ['服装版型', input.fit || '宽松'],
    ['图案', input.pattern || '纯色'],
    ['主面料成分', main],
    ['成分含量', pct],
    ['面料俗称', input.fiber || '针织'],
    ['适用年龄', input.age || '中青年（26-40周岁）'],
    ['流行元素', elems.length ? elems.join('、') : '纯色'],
    ['是否加绒', input.fleece || '不加绒'],
    ['上市时节', `${year}年${input.season || '秋冬'}`],
    ['主风格', input.mainStyle || '简约通勤'],
    ['风格', input.subStyle || '慵懒风']
  ];
}

/* ---------------- 组装 ---------------- */

export function generateKit(input, price) {
  const merged = Object.assign({}, input, { price: price != null ? price : input.price });
  return {
    titles: makeTitles(merged),
    sellingPoints: makeSellingPoints(merged),
    skus: makeSkus(merged),
    detail: makeDetail(merged),
    attrs: makeAttrs(merged),
    generatedAt: Date.now()
  };
}

export function detailToText(kit) {
  return kit.detail.sections
    .map((s) => `【${s.title}】\n` + s.lines.map((l) => '· ' + l).join('\n'))
    .join('\n\n');
}

export function skuToCsv(skus) {
  const head = '规格1,规格2,规格名,拼多多规格,价格,库存,编码';
  const body = skus.map((s) => [s.spec1, s.spec2, s.name, s.pddName, s.price, s.stock, s.code].join(',')).join('\n');
  return head + '\n' + body;
}
