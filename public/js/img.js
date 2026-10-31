/**
 * 主图 / 详情长图 Canvas 合成
 * 输入一张商品图 + 生成好的文案，输出可直接上传拼多多的图片
 */

const C = {
  ink: '#26211d',
  ink2: '#6b6259',
  cream: '#faf7f2',
  oat: '#efe5d5',
  accent: '#c4562b',
  accent2: '#a8451f',
  green: '#2f3a30',
  white: '#ffffff',
  soft: '#fdeee7'
};

const FONT = (size, weight) => `${weight || 600} ${size}px -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.textBaseline = 'top';
  return { c, ctx };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const br = w / h;
  let sw, sh, sx, sy;
  if (ir > br) {
    sh = img.height; sw = sh * br;
    sx = (img.width - sw) / 2; sy = 0;
  } else {
    sw = img.width; sh = sw / br;
    sx = 0; sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawContain(ctx, img, x, y, w, h, bg) {
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
  }
  const ir = img.width / img.height;
  const br = w / h;
  let dw, dh;
  if (ir > br) { dw = w; dh = w / ir; } else { dh = h; dw = h * ir; }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function pill(ctx, text, x, y, opts) {
  const o = Object.assign({ size: 24, padX: 18, padY: 10, bg: C.accent, color: '#fff', radius: 999 }, opts || {});
  ctx.font = FONT(o.size, 600);
  const tw = ctx.measureText(text).width;
  const w = tw + o.padX * 2;
  const h = o.size + o.padY * 2;
  ctx.fillStyle = o.bg;
  roundRect(ctx, x, y, w, h, Math.min(o.radius, h / 2));
  ctx.fill();
  ctx.fillStyle = o.color;
  ctx.fillText(text, x + o.padX, y + o.padY);
  return { w, h };
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of Array.from(text)) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paintBg(ctx, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

/* ================= 主图模板 ================= */

function tplWhite(img, kit, input) {
  const W = 800, H = 800;
  const { c, ctx } = canvas(W, H);
  paintBg(ctx, W, H, C.white);
  drawContain(ctx, img, 44, 44, 712, 640, null);

  const mat = (input.materials || []).slice(0, 1).join('');
  if (mat) pill(ctx, mat + '混纺', 26, 26, { size: 22, padX: 14, padY: 8, bg: C.green });

  const main = kit.sellingPoints[0] ? kit.sellingPoints[0].text : '软糯保暖';
  const p1 = pill(ctx, main, 26, 692, { size: 26, padX: 18, padY: 10, bg: C.accent });
  const second = kit.sellingPoints[1] ? kit.sellingPoints[1].text : '显瘦版型';
  ctx.font = FONT(22, 500);
  ctx.fillStyle = C.ink2;
  ctx.fillText(second, 26 + p1.w + 14, 706);

  ctx.font = FONT(20, 500);
  ctx.fillStyle = C.ink2;
  ctx.fillText(`${input.neck || '圆领'} · ${input.fit || '宽松'} · ${input.weight || '常规'}款`, 26, 750);
  return { c, key: 'main-1', label: '主图1 · 白底主图' };
}

function tplSelling(img, kit, input) {
  const W = 800, H = 800;
  const { c, ctx } = canvas(W, H);
  paintBg(ctx, W, H, '#f3ebdf');

  const panelX = 400, panelY = 60, panelW = 356, panelH = 680;
  ctx.save();
  roundRect(ctx, panelX, panelY, panelW, panelH, 28);
  ctx.clip();
  drawCover(ctx, img, panelX, panelY, panelW, panelH);
  ctx.restore();

  ctx.fillStyle = C.accent;
  ctx.font = FONT(20, 600);
  ctx.fillText(`${new Date().getFullYear()} ${input.season || '秋冬'} NEW`, 52, 76);

  ctx.fillStyle = C.ink;
  ctx.font = FONT(46, 700);
  const head = wrapText(ctx, `${input.neck || '半高领'}${input.weight || '加厚'}毛衣`, 330);
  head.forEach((l, i) => ctx.fillText(l, 52, 118 + i * 58));

  let y = 118 + head.length * 58 + 26;
  const pts = kit.sellingPoints.slice(0, 4);
  pts.forEach((p) => {
    ctx.fillStyle = C.accent;
    ctx.font = FONT(24, 700);
    ctx.fillText('●', 52, y);
    ctx.fillStyle = C.ink;
    ctx.font = FONT(26, 600);
    const lines = wrapText(ctx, p.text, 300);
    lines.forEach((l, i) => ctx.fillText(l, 82, y + i * 36));
    y += Math.max(1, lines.length) * 36 + 18;
  });

  pill(ctx, `${(input.colors || ['燕麦色'])[0]} 现货`, 52, y + 8, { size: 22, padX: 16, padY: 9, bg: C.green });
  return { c, key: 'main-2', label: '主图2 · 卖点图' };
}

function tplMood(img, kit, input) {
  const W = 800, H = 800;
  const { c, ctx } = canvas(W, H);
  drawCover(ctx, img, 0, 0, W, H);

  const g = ctx.createLinearGradient(0, H * 0.42, 0, H);
  g.addColorStop(0, 'rgba(20,16,12,0)');
  g.addColorStop(1, 'rgba(20,16,12,.78)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.42, W, H * 0.58);

  pill(ctx, (input.styles || ['慵懒风'])[0], 48, 52, { size: 22, padX: 16, padY: 9, bg: 'rgba(255,255,255,.9)', color: C.green });

  ctx.fillStyle = '#fff';
  ctx.font = FONT(60, 700);
  ctx.fillText((input.styles || ['慵懒风'])[0], 48, 566);
  ctx.font = FONT(28, 500);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  const sub = `${input.neck || '半高领'} · ${input.fit || '宽松'} · ${input.weight || '加厚'}`;
  ctx.fillText(sub, 50, 648);

  pill(ctx, '单穿 / 内搭都好看', 48, 706, { size: 22, padX: 16, padY: 9, bg: C.accent });
  return { c, key: 'main-3', label: '主图3 · 氛围场景图' };
}

function tplDetailShots(img, kit, input) {
  const W = 800, H = 800;
  const { c, ctx } = canvas(W, H);
  paintBg(ctx, W, H, C.cream);

  drawContain(ctx, img, 60, 52, 680, 600, null);

  const crafts = (input.crafts || []).slice(0, 2);
  const tags = crafts.length ? crafts : ['细密织法', '螺纹收口'];
  const bandY = 664;
  ctx.fillStyle = C.white;
  roundRect(ctx, 32, bandY, 736, 104, 22);
  ctx.fill();

  tags.slice(0, 3).forEach((t, i) => {
    const x = 52 + i * 240;
    ctx.fillStyle = C.accent;
    ctx.font = FONT(18, 700);
    ctx.fillText('0' + (i + 1), x, bandY + 24);
    ctx.fillStyle = C.ink;
    ctx.font = FONT(24, 600);
    ctx.fillText(t, x, bandY + 52);
  });

  pill(ctx, kit.sellingPoints[2] ? kit.sellingPoints[2].text : '不易起球', 28, 26, { size: 20, padX: 14, padY: 8, bg: C.green });
  return { c, key: 'main-4', label: '主图4 · 细节工艺图' };
}

function tplPromo(img, kit, input) {
  const W = 800, H = 800;
  const { c, ctx } = canvas(W, H);
  paintBg(ctx, W, H, '#f7efe2');

  drawContain(ctx, img, 60, 40, 680, 520, C.white);

  ctx.fillStyle = C.white;
  roundRect(ctx, 40, 580, 720, 180, 24);
  ctx.fill();

  const price = Number(input.price) || 59.9;
  const intPart = Math.floor(price);
  const decPart = price.toFixed(2).split('.')[1];

  ctx.fillStyle = C.accent;
  ctx.font = FONT(30, 700);
  ctx.fillText('¥', 72, 616);
  ctx.font = FONT(66, 800);
  const iw = ctx.measureText(String(intPart)).width;
  ctx.fillText(String(intPart), 100, 592);
  ctx.font = FONT(30, 700);
  ctx.fillText('.' + decPart, 100 + iw + 4, 618);

  ctx.fillStyle = C.ink2;
  ctx.font = FONT(22, 500);
  ctx.fillText('包邮 · 48h发货', 320, 604);
  ctx.fillStyle = C.ink;
  ctx.font = FONT(24, 600);
  ctx.fillText(`${(input.colors || ['燕麦色'])[0]}｜${(input.sizes || ['M']).join('/')} 可选`, 320, 642);

  pill(ctx, '限时特惠', 612, 614, { size: 22, padX: 16, padY: 9, bg: C.accent });

  ctx.fillStyle = C.ink;
  ctx.font = FONT(30, 700);
  ctx.fillText(`${input.weight || '加厚'}${input.neck || '半高领'}${(input.category || '毛衣').replace('针织', '')}`, 40, 776);
  return { c, key: 'main-5', label: '主图5 · 价格利益点' };
}

export function buildMainImages(img, kit, input) {
  if (!img) return [];
  return [tplWhite(img, kit, input), tplSelling(img, kit, input), tplMood(img, kit, input), tplDetailShots(img, kit, input), tplPromo(img, kit, input)];
}

/* ================= 详情长图 ================= */

export function buildDetailImage(img, kit, input) {
  const W = 750;
  const PAD = 48;
  const meas = canvas(W, 100);
  const mctx = meas.ctx;

  const blocks = [];
  kit.detail.sections.forEach((s) => {
    const lines = [];
    mctx.font = FONT(26, 400);
    s.lines.forEach((l) => {
      wrapText(mctx, l, W - PAD * 2 - 20).forEach((x) => lines.push(x));
    });
    blocks.push({ title: s.title, lines });
  });

  let height = 0;
  height += 210;                       // 头图
  height += 560;                       // 商品大图
  height += blocks.length * 62;         // 标题行
  height += blocks.reduce((a, b) => a + b.lines.length * 44 + 26, 0);
  height += 120;                        // 底部

  const { c, ctx } = canvas(W, height);
  let y = 0;

  // 头部
  ctx.fillStyle = C.green;
  ctx.fillRect(0, 0, W, 210);
  ctx.fillStyle = '#f7f2e9';
  ctx.font = FONT(44, 700);
  ctx.fillText(`${input.weight || '加厚'}${input.neck || '半高领'}${(input.category || '毛衣').replace('针织', '')}`, PAD, 52);
  ctx.font = FONT(22, 500);
  ctx.fillStyle = 'rgba(247,242,233,.72)';
  ctx.fillText(kit.sellingPoints.slice(0, 2).map((p) => p.text).join(' · '), PAD, 118);
  ctx.fillStyle = C.accent;
  ctx.font = FONT(20, 600);
  ctx.fillText(`${new Date().getFullYear()} ${input.season || '秋冬'} 新款`, PAD, 160);
  y = 210;

  // 商品大图
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, y, W, 560);
  drawContain(ctx, img, 0, y + 30, W, 500, null);
  y += 560;

  // 卖点条
  ctx.fillStyle = C.white;
  ctx.fillRect(0, y, W, 0);
  y += 0;

  blocks.forEach((b, bi) => {
    ctx.fillStyle = bi % 2 === 0 ? C.cream : C.white;
    const blockH = 62 + b.lines.length * 44 + 26;
    ctx.fillRect(0, y, W, blockH);

    ctx.fillStyle = C.accent;
    ctx.fillRect(PAD, y + 30, 6, 26);
    ctx.fillStyle = C.ink;
    ctx.font = FONT(30, 700);
    ctx.fillText(b.title, PAD + 20, y + 24);

    ctx.fillStyle = C.ink2;
    ctx.font = FONT(26, 400);
    b.lines.forEach((line, i) => ctx.fillText(line, PAD + 20, y + 74 + i * 44));
    y += blockH;
  });

  ctx.fillStyle = C.green;
  ctx.fillRect(0, y, W, 120);
  ctx.fillStyle = '#f7f2e9';
  ctx.font = FONT(24, 600);
  ctx.fillText('7天无理由退换 · 48小时内发货 · 正品保障', PAD, y + 48);

  return { c, key: 'detail-long', label: '详情页长图 · 750px' };
}

/* ================= 导出 ================= */

export function toDataUrl(c) {
  return c.toDataURL('image/png');
}

export function downloadCanvas(c, filename) {
  c.toBlob((blob) => {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ img, dataUrl: reader.result });
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
