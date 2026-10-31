/**
 * 毛衣上架素材生成引擎（纯规则，无需联网 / 无需 API Key）
 * 输入：一组商品标签 + 一张图
 * 输出：标题、卖点、SKU 规格、详情页文案、拼多多属性表
 */

export const OPTIONS = {
  category: ['套头毛衣', '针织开衫', '毛衣马甲', '针织连衣裙', '毛衣外套', '打底针织衫', '其他'],
  material: ['羊毛', '山羊绒', '兔绒', '羊毛混纺', '棉', '雪尼尔', '腈纶', '冰丝', '马海毛', '其他'],
  craft: ['麻花编织', '提花', '镂空', '钩花', '拼色', '条纹', '纯色', '绞花', '坑条', '其他'],
  neck: ['圆领', '半高领', 'V领', '高领', '翻领', '连帽', '方领', '一字领', '其他'],
  fit: ['宽松', '修身', '落肩', '短款', '中长款', 'oversize', '其他'],
  style: ['慵懒风', '韩版', '日系', '复古', '法式', '学院风', '通勤', 'ins风', '温柔风', '其他'],
  audience: ['女士', '学生', '妈妈', '大码', '情侣', '青少年', '其他'],
  weight: ['薄款', '常规', '加厚', '厚实', '其他'],
  season: ['春秋', '秋冬', '冬季', '其他'],
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
  山羊绒: ['云朵手感', '轻盈保暖', '贴肤不扎'],
  兔绒: ['蓬松柔软', '轻盈不压身', '暖糯亲肤'],
  羊毛混纺: ['柔软不扎', '挺括有型', '保暖耐穿'],
  棉: ['亲肤透气', '吸湿排汗', '不易起球'],
  雪尼尔: ['立体绒感', '厚实垂坠', '手感饱满'],
  腈纶: ['弹力回弹', '不易变形', '轻盈保暖'],
  冰丝: ['凉感垂坠', '顺滑不闷', '不易皱'],
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
  const matWord = mats.length ? (mats.length > 1 ? '羊毛混纺' : mats[0]) : '针织';
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

  const titles = combos.map((parts, i) => {
    const t = fitLimit(parts.filter(Boolean).join(' '));
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
  colors.forEach((c) => {
    sizes.forEach((s) => {
      skus.push({
        id: 'sku-' + n++,
        spec1: c,
        spec2: s,
        name: `${c} ${s}码`,
        pddName: `${c}-${s}`,
        price: price.toFixed(2),
        stock: 100,
        code: `KN${String(n - 1).padStart(3, '0')}`
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
  const crafts = uniq(input.crafts || []);
  const sizes = uniq(input.sizes || ['M']);
  const weight = input.weight || '常规';
  const year = new Date().getFullYear();
  return [
    ['商品类型', input.category || '套头毛衣'],
    ['材质成分', mats.length ? mats.join(' + ') : '针织'],
    ['领型', input.neck || '圆领'],
    ['版型', input.fit || '宽松'],
    ['图案', crafts.includes('条纹') ? '条纹' : crafts.includes('拼色') ? '拼色' : crafts.includes('提花') ? '提花' : '纯色'],
    ['厚薄', weight],
    ['衣长', input.fit === '短款' ? '短款' : input.fit === '中长款' ? '中长款' : '常规'],
    ['适用季节', input.season || '秋冬'],
    ['风格', (input.styles || ['慵懒风']).join('/')],
    ['适用人群', (input.audience || ['女士']).join('/')],
    ['尺码', sizes.join('/')],
    ['颜色', (input.colors || ['燕麦色']).join('/')],
    ['是否连帽', input.neck === '连帽' ? '是' : '否'],
    ['洗涤方式', '手洗 / 轻柔机洗'],
    ['上市年份季节', `${year}年${input.season || '秋冬'}`]
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
