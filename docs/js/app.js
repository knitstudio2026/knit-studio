import { OPTIONS, generateKit, detailToText, skuToCsv } from './gen.js';
import { buildMainImages, buildDetailImage, downloadCanvas, loadImageFromFile } from './img.js';

/* 全局异常兜底：任何静默异常都弹 toast */
window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason && (e.reason.message || e.reason.body)) || '未知错误';
  console.error('[unhandled promise]', e.reason);
  toast('出错了：' + msg);
});
window.addEventListener('error', (e) => {
  console.error('[runtime error]', e.error || e.message);
});

/* ================= 基础设施 ================= */

const APP_VER = '1157B';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const uid = () => 'id-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

const money = (n) => {
  if (!isFinite(n)) return '—';
  return (n < 0 ? '-' : '') + '¥' + Math.abs(n).toFixed(2);
};
const pct = (n) => (isFinite(n) ? (n * 100).toFixed(1) + '%' : '—');
const num = (n, d) => (isFinite(n) ? n.toFixed(d == null ? 0 : d) : '—');

const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const addDays = (dateStr, delta) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const toast = (msg, ms) => {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, ms || 2200);
};

async function api(path, opts) {
  const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {}));
  let body = null;
  try { body = await res.json(); } catch (_) {}
  if (!res.ok) {
    const err = new Error((body && body.error) || 'HTTP_' + res.status);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/* ================= 状态 ================= */

const S = {
  data: null,
  rev: 0,
  route: 'dashboard',
  syncState: 'ok',
  studioImage: null,      // { img, dataUrl, aiUrl, assetUrl }
  swapImages: [],         // 多张姿势参考图 [{ img, dataUrl, aiUrl }]
  swapStatus: '',
  studioKit: null,
  studioResultTab: 'titles',
  tagOpen: false,
  studioAiImages: [],     // 方舟生成的模特图（本次会话）
  arkFaceRef: null,       // 第一张生成图的人脸参考（本会话）
  arkIdentity: null,      // 本款商品用的模特长相（换商品时重置）
  arkLight: null,         // 本款商品用的灯光/镜头设定（换商品时重置）
  arkRecentScenes: [],    // 最近用过的场景，避免不同商品撞背景
  libSearch: '',          // 素材库搜索关键词
  libViewId: null,        // 素材库当前查看的素材 ID
  arkPendingJobs: null,   // 预览后待生成的剩余 jobs
  arkCounts: { mainPer: 2, simpleSku: false, simpleNote: '不带丝带', noAccessory: false, accessoryList: '丝带、蕾丝蝴蝶结、胸针等装饰', photoStyle: 'auto', antiCompare: true },
  aiStatus: '',
  arkStatus: '',
  studioInput: {
    category: '套头毛衣',
    materials: ['羊毛', '腈纶'],
    crafts: ['麻花编织'],
    pattern: '纯色',
    wearStyle: '套头',
    neck: '半高领',
    fit: '宽松',
    length: '常规款',
    sleeveLen: '长袖',
    sleeveType: '常规',
    elements: ['纽扣'],
    fiber: '针织',
    age: '中青年（26-40周岁）',
    fleece: '不加绒',
    mainStyle: '简约通勤',
    subStyle: '慵懒风',
    styles: ['慵懒风'],
    audience: ['女士'],
    weight: '加厚',
    season: '秋冬',
    colors: ['燕麦色'],
    sizes: ['M', 'L', 'XL'],
    scene: ['内搭打底'],
    price: '59.9',
    extra: '',
    antiCompare: true
  }
};

let saveTimer = null;

function setSync(state, text) {
  S.syncState = state;
  const dot = $('#syncDot');
  const label = $('#syncText');
  dot.className = 'sync-dot ' + (state === 'ok' ? '' : state);
  label.textContent = text;
}

function persist() {
  setSync('pending', '同步中…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 500);
}

async function flush() {
  if (!S.data) return;
  try {
    const body = {
      rev: S.rev,
      data: {
        shops: S.data.shops,
        products: S.data.products,
        daily: S.data.daily,
        materials: S.data.materials,
        settings: S.data.settings
      }
    };
    const r = await api('/api/data', { method: 'PUT', body: JSON.stringify(body) });
    S.rev = r.rev;
    S.data.updatedAt = r.updatedAt;
    setSync('ok', '已同步');
    localStorage.setItem('knit-cache', JSON.stringify(S.data));
  } catch (err) {
    if (err.status === 409) {
      setSync('error', '有冲突');
      toast('数据在其他设备上更新了，正在重新载入…', 3000);
      await loadData();
      renderRoute();
      return;
    }
    setSync('error', '离线');
  }
}

async function loadData() {
  const d = await api('/api/data');
  S.data = d;
  S.rev = d.rev;
  localStorage.setItem('knit-cache', JSON.stringify(d));
  setSync('ok', '已同步');
}

/* ================= 认证 ================= */

async function boot() {
  try {
    await enter();
  } catch (e) {
    authError('打开失败：' + ((e && e.message) || '未知原因'));
    showAuth(false);
  }
}

function authError(msg) {
  const tip = $('#authTip');
  if (tip) {
    tip.textContent = msg;
    tip.style.color = '#d93025';
    tip.style.fontWeight = '700';
    tip.style.fontSize = '15px';
    tip.style.lineHeight = '1.6';
  }
  toast(msg);
}

window.addEventListener('error', (e) => {
  if (!$('#authScreen') || $('#authScreen').hidden) return;
  authError('程序出错：' + (e.message || '未知错误'));
});
window.addEventListener('unhandledrejection', (e) => {
  if (!$('#authScreen') || $('#authScreen').hidden) return;
  authError('程序出错：' + ((e.reason && e.reason.message) || '未知错误'));
});

function showAuth(needsSetup) {
  const screen = $('#authScreen');
  screen.hidden = false;
  screen.style.display = 'grid';
  $('#shell').hidden = true;
  $('#authSub').textContent = needsSetup ? '第一次使用，设置一个只有你知道的口令' : '输入口令，手机和电脑共用同一份数据';
  $('#authTip').textContent = needsSetup ? '口令保存在服务器上，忘记后需要清空数据目录才能重置。' : '登录状态会记住 30 天。';
  const input = $('#authInput');
  const btn = $('#authBtn');
  input.value = '';
  btn.textContent = needsSetup ? '设置并进入' : '进入';
  const submit = async () => {
    const password = input.value.trim();
    if (!password) { authError('请输入口令'); return; }
    btn.disabled = true;
    btn.textContent = '正在进入…';
    try {
      await api('/api/health');
    } catch (_) {
      authError('连不上服务器：黑色窗口关掉了？请重新双击 knit-studio.exe');
      btn.disabled = false;
      btn.textContent = needsSetup ? '设置并进入' : '进入';
      return;
    }
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      screen.hidden = true;
      await enter();
    } catch (err) {
      authError(err.status === 401 ? '口令不正确' : ('出错了：' + (err.message || '未知原因')));
    } finally {
      btn.disabled = false;
      btn.textContent = needsSetup ? '设置并进入' : '进入';
    }
  };
  btn.onclick = submit;
  input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  setTimeout(() => input.focus(), 200);
}

async function enter() {
  $('#authScreen').hidden = true;
  $('#authScreen').style.display = 'none';
  $('#shell').hidden = false;
  $('#shell').style.display = '';
  try {
    await loadData();
    ensureDefaults();
    renderRoute();
    registerTabs();
  } catch (_) {
    const cache = localStorage.getItem('knit-cache');
    if (cache) {
      S.data = JSON.parse(cache);
      S.rev = S.data.rev || 0;
      setSync('error', '离线模式');
      renderRoute();
      registerTabs();
      toast('当前处于离线模式，改动会在联网后同步');
    }
  }
}

function registerTabs() {
  $$('#tabs .tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === S.route);
    btn.onclick = () => { S.route = btn.dataset.route; renderRoute(); registerTabs(); };
  });
}

function ensureDefaults() {
  const d = S.data;
  d.shops = d.shops || [];
  d.products = d.products || [];
  d.daily = d.daily || [];
  d.materials = d.materials || [];
  d.settings = d.settings || {};
  d.settings.ai = d.settings.ai || {
    provider: 'volc',
    apiKey: '',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    visionModel: 'doubao-seed-2-1-pro-260915',
    imageModel: 'doubao-seedream-5-0-pro-260628',
    img2img: true,
    accessKeyId: '',
    secretAccessKey: ''
  };
}

/* ================= 计算 ================= */

function productProfit(p) {
  const price = Number(p.price) || 0;
  const c = p.cost || {};
  const costSum = (Number(c.material) || 0) + (Number(c.labor) || 0) + (Number(c.accessories) || 0) + (Number(c.packaging) || 0);
  const shipping = Number(p.shipping) || 0;
  const commissionRate = Number(p.commission) || 0;
  const commission = price * commissionRate / 100;
  const adCost = Number(p.adCost) || 0;
  const refundRate = (Number(p.refundRate) || 0) / 100;

  const refundLoss = refundRate * (shipping * 2 + (Number(c.packaging) || 0) + 4);
  const gross = price - costSum - shipping - commission;
  const net = gross - adCost - refundLoss;
  const grossMargin = price > 0 ? gross / price : 0;
  const netMargin = price > 0 ? net / price : 0;
  const affordableAd = price - costSum - shipping - commission - refundLoss;
  const breakEvenRoi = affordableAd > 0 ? price / affordableAd : Infinity;
  const breakEvenPrice = commissionRate < 100 ? (costSum + shipping + refundLoss) / (1 - commissionRate / 100) : Infinity;

  return { price, costSum, shipping, commission, adCost, refundRate, refundLoss, gross, net, grossMargin, netMargin, affordableAd, breakEvenRoi, breakEvenPrice };
}

function shopStats(shopId) {
  const shop = S.data.shops.find((s) => s.id === shopId) || {};
  const list = S.data.daily.filter((d) => d.shopId === shopId);
  const sum = (k) => list.reduce((a, b) => a + (Number(b[k]) || 0), 0);
  const sales = sum('sales');
  const orders = sum('orders');
  const refunds = sum('refunds');
  const adSpend = sum('adSpend');
  const costRate = (Number(shop.costRate) || 0) / 100;
  const commissionRate = (shop.commission == null ? 0.6 : Number(shop.commission)) / 100;
  const cost = sales * costRate;
  const commission = sales * commissionRate;
  const gross = sales - cost - commission;
  const net = gross - adSpend - refunds;
  return { sales, orders, refunds, adSpend, gross, net, roi: adSpend > 0 ? sales / adSpend : Infinity, aov: orders > 0 ? sales / orders : 0, refundRate: sales > 0 ? refunds / sales : 0 };
}

function rangeStats(days) {
  const from = addDays(today(), -(days - 1));
  const rows = S.data.daily.filter((d) => d.date >= from);
  const ss = (k) => rows.reduce((a, b) => a + (Number(b[k]) || 0), 0);
  const sales = ss('sales');
  const refunds = ss('refunds');
  const adSpend = ss('adSpend');
  const orders = ss('orders');
  let gross = 0;
  rows.forEach((r) => {
    const shop = S.data.shops.find((s) => s.id === r.shopId) || {};
    const costRate = (Number(shop.costRate) || 0) / 100;
    const cr = (shop.commission == null ? 0.6 : Number(shop.commission)) / 100;
    gross += (Number(r.sales) || 0) * (1 - costRate - cr);
  });
  return { sales, refunds, adSpend, orders, gross, net: gross - adSpend - refunds, roi: adSpend > 0 ? sales / adSpend : Infinity };
}

/* ================= 渲染入口 ================= */

function renderRoute() {
  const view = $('#view');
  const map = { dashboard: viewDashboard, products: viewProducts, studio: viewStudio, shops: viewShops, settings: viewSettings };
  view.innerHTML = (map[S.route] || viewDashboard)();
  bindRoute();
}

function bindRoute() {
  const fn = { dashboard: bindDashboard, products: bindProducts, studio: bindStudio, shops: bindShops, settings: bindSettings }[S.route];
  if (fn) fn();
  bindOneDownloads();
}

/* ================= 通用组件 ================= */

function openDrawer(title, bodyHtml, footHtml) {
  closeDrawer();
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.id = 'drawerOverlay';
  wrap.innerHTML = `
    <div class="drawer" role="dialog" aria-modal="true">
      <div class="drawer-head">
        <h3>${esc(title)}</h3>
        <div style="margin-left:auto"><button class="icon-btn" data-close>关闭</button></div>
      </div>
      <div class="drawer-body">${bodyHtml}</div>
      <div class="drawer-foot">${footHtml || ''}</div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.hasAttribute('data-close')) closeDrawer(); });
  return wrap;
}

function closeDrawer() {
  const old = $('#drawerOverlay');
  if (old) old.remove();
}

/* 页面内确认对话框，替代原生 confirm（原生 confirm 在部分手机浏览器可能不弹） */
function confirm2(msg) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.style.zIndex = '9999';
    wrap.innerHTML = `
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;color:#1a1a1a;padding:22px 20px 16px;border-radius:14px;max-width:340px;width:92vw;box-shadow:0 10px 40px rgba(0,0,0,.25);font-size:14px;line-height:1.6">
        <div style="font-weight:600;font-size:15px;margin-bottom:10px">确认一下</div>
        <div style="margin-bottom:18px;color:#333">${esc(msg)}</div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn sm" data-cancel>取消</button>
          <button class="btn sm primary" data-ok>继续</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.querySelector('[data-ok]').onclick = () => done(true);
    wrap.querySelector('[data-cancel]').onclick = () => done(false);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) done(false); });
  });
}

/* ================= 看板 ================= */

function viewDashboard() {
  const d = S.data;
  if (!d.shops.length) {
    return `
      <div class="empty">
        <div class="glyph">◫</div>
        <h4>先添加你的第一家店</h4>
        <p>一人多店：每加一家店，看板和利润表都会自动汇总。</p>
        <button class="btn primary" data-act="add-shop">＋ 添加店铺</button>
      </div>`;
  }

  const todayStr = today();
  const t = rangeStats(1);
  const w = rangeStats(7);
  const m = rangeStats(30);

  const rows = d.shops.map((shop) => {
    const st = shopStats(shop.id);
    return `
      <tr>
        <td><strong>${esc(shop.name)}</strong></td>
        <td class="num">${money(st.sales)}</td>
        <td class="num">${num(st.orders)}</td>
        <td class="num" style="color:${st.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(st.net)}</td>
        <td class="num">${st.roi === Infinity ? '—' : st.roi.toFixed(2)}</td>
        <td class="num">${pct(st.refundRate)}</td>
      </tr>`;
  }).join('');

  const series = buildSeries(14);

  return `
    <div class="page-head">
      <div>
        <h2>经营看板</h2>
        <p>${todayStr} · ${d.shops.length} 家店在管</p>
      </div>
      <div class="spacer"></div>
      <button class="btn sm" data-act="export-daily">导出</button>
      <button class="btn primary sm" data-act="add-daily">＋ 录入今日数据</button>
    </div>

    <div class="grid four" style="margin-bottom:14px">
      <div class="stat accent">
        <div class="label">今日净利</div>
        <div class="value">${money(t.net)}</div>
        <div class="hint">销售额 ${money(t.sales)}</div>
      </div>
      <div class="stat">
        <div class="label">近 7 天净利</div>
        <div class="value">${money(w.net)}</div>
        <div class="hint">销售额 ${money(w.sales)}</div>
      </div>
      <div class="stat">
        <div class="label">近 30 天净利</div>
        <div class="value">${money(m.net)}</div>
        <div class="hint">广告费 ${money(m.adSpend)}</div>
      </div>
      <div class="stat">
        <div class="label">整体 ROI</div>
        <div class="value">${m.roi === Infinity ? '—' : m.roi.toFixed(2)}</div>
        <div class="hint">销售额 / 广告费</div>
      </div>
    </div>

    <div class="stack">
      <div class="card">
        <div class="card-head">
          <h3>各店今日表现</h3>
          <span class="sub">净利已扣成本、佣金、广告、退款</span>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>店铺</th><th class="num">今日销售额</th><th class="num">订单</th><th class="num">今日净利</th><th class="num">ROI</th><th class="num">退款率</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>近 14 天净利趋势</h3><span class="sub">按日汇总</span></div>
        <div class="card-body">
          ${series.hasData ? `<canvas id="spark" class="spark" width="800" height="160"></canvas>` : `<div class="tbl-empty">还没有每日数据，录入 2 天以上就能看到趋势</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>需要你注意</h3></div>
        <div class="card-body">${attentionList()}</div>
      </div>
    </div>`;
}

function attentionList() {
  const items = [];
  const lowMargin = S.data.products.map((p) => ({ p, r: productProfit(p) })).filter((x) => x.r.net < 0);
  if (lowMargin.length) {
    items.push(`<div class="seg-row"><div class="sk">亏损</div><div>${lowMargin.length} 个商品扣掉推广费后是负毛利：${lowMargin.slice(0, 3).map((x) => esc(x.p.name)).join('、')}${lowMargin.length > 3 ? ' 等' : ''}</div><span class="pill bad">看利润页</span></div>`);
  }
  S.data.shops.forEach((shop) => {
    const st = shopStats(shop.id);
    if (st.refundRate > 0.05) items.push(`<div class="seg-row"><div class="sk">退款</div><div>${esc(shop.name)} 退款率 ${pct(st.refundRate)}，高于 5%</div><span class="pill warn">查售后</span></div>`);
    if (st.adSpend > 0 && st.roi < 2) items.push(`<div class="seg-row"><div class="sk">投放</div><div>${esc(shop.name)} ROI 只有 ${st.roi.toFixed(2)}，先别加预算</div><span class="pill warn">查推广</span></div>`);
  });
  if (!items.length) return `<div class="tbl-empty">一切正常，没有需要立刻处理的问题</div>`;
  return items.join('');
}

function buildSeries(days) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today(), -i);
    const rows = S.data.daily.filter((d) => d.date === date);
    const net = rows.reduce((a, r) => {
      const shop = S.data.shops.find((s) => s.id === r.shopId) || {};
      const costRate = (Number(shop.costRate) || 0) / 100;
      const cr = (shop.commission == null ? 0.6 : Number(shop.commission)) / 100;
      return a + (Number(r.sales) || 0) * (1 - costRate - cr) - (Number(r.adSpend) || 0) - (Number(r.refunds) || 0);
    }, 0);
    out.push({ date, net, has: rows.length > 0 });
  }
  return { points: out, hasData: out.some((o) => o.has) };
}

function drawSpark() {
  const c = $('#spark');
  if (!c) return;
  const { points } = buildSeries(14);
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth || 800;
  const H = 160;
  c.width = W * dpr;
  c.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const vals = points.filter((p) => p.has).map((p) => p.net);
  const max = Math.max(10, ...vals);
  const min = Math.min(0, ...vals);
  const padL = 36, padR = 12, padT = 14, padB = 26;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const yFor = (v) => padT + ih - ((v - min) / (max - min || 1)) * ih;
  const xFor = (i) => padL + (iw / Math.max(1, points.length - 1)) * i;

  ctx.strokeStyle = '#eee6da';
  ctx.lineWidth = 1;
  [0, 0.5, 1].forEach((f) => {
    const y = padT + ih * f;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
  });

  ctx.strokeStyle = '#c9beb0';
  ctx.beginPath();
  ctx.moveTo(padL, yFor(0));
  ctx.lineTo(W - padR, yFor(0));
  ctx.stroke();

  const real = points.map((p, i) => ({ x: xFor(i), y: yFor(p.has ? p.net : 0), has: p.has })).filter((p) => p.has);
  if (real.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = '#c4562b';
    ctx.lineWidth = 2;
    real.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    real.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#c4562b';
      ctx.fill();
    });
  } else if (real.length === 1) {
    ctx.beginPath(); ctx.arc(real[0].x, real[0].y, 4, 0, Math.PI * 2); ctx.fillStyle = '#c4562b'; ctx.fill();
  }

  ctx.fillStyle = '#9c9186';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillText(money(max), 2, padT + 8);
  ctx.fillText(money(min), 2, padT + ih);
  ctx.fillText(points[0].date.slice(5), padL, H - 14);
  ctx.textAlign = 'right';
  ctx.fillText(points[points.length - 1].date.slice(5), W - padR, H - 14);
  ctx.textAlign = 'left';
}

function bindDashboard() {
  drawSpark();
  $$('#view [data-act]').forEach((b) => {
    b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'add-shop') { S.route = 'shops'; renderRoute(); registerTabs(); }
      if (act === 'add-daily') openDailyForm();
      if (act === 'export-daily') exportDaily();
    };
  });
}

function openDailyForm() {
  const shops = S.data.shops;
  if (!shops.length) { toast('先添加店铺'); return; }
  const html = `
    <div class="stack">
      <div class="grid two">
        <div class="field"><label>日期</label><input class="input" type="date" id="dDate" value="${today()}"></div>
        <div class="field"><label>店铺</label>
          <select class="select" id="dShop">${shops.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="grid two">
        <div class="field"><label>销售额（成交金额）</label><input class="input" id="dSales" type="number" inputmode="decimal" placeholder="0.00"></div>
        <div class="field"><label>订单数</label><input class="input" id="dOrders" type="number" inputmode="numeric" placeholder="0"></div>
      </div>
      <div class="grid two">
        <div class="field"><label>退款金额</label><input class="input" id="dRefunds" type="number" inputmode="decimal" placeholder="0.00"></div>
        <div class="field"><label>推广花费</label><input class="input" id="dAd" type="number" inputmode="decimal" placeholder="0.00"></div>
      </div>
      <div class="field"><label>访客数（可选）</label><input class="input" id="dVisitors" type="number" inputmode="numeric" placeholder="0"></div>
      <p class="tip" style="font-size:12px;color:var(--ink-3)">数据从拼多多商家后台「数据中心 → 经营概况」抄录，一天录一次即可。成本率、佣金率在店铺设置里配置。</p>
    </div>`;
  openDrawer('录入每日数据', html, `<button class="btn ghost" data-close>取消</button><button class="btn primary" id="dSave">保存</button>`);

  $('#dSave').onclick = () => {
    const shopId = $('#dShop').value;
    const date = $('#dDate').value || today();
    const rec = {
      id: uid(),
      shopId,
      date,
      sales: Number($('#dSales').value) || 0,
      orders: Number($('#dOrders').value) || 0,
      refunds: Number($('#dRefunds').value) || 0,
      adSpend: Number($('#dAd').value) || 0,
      visitors: Number($('#dVisitors').value) || 0
    };
    S.data.daily = S.data.daily.filter((x) => !(x.shopId === shopId && x.date === date));
    S.data.daily.push(rec);
    persist();
    closeDrawer();
    renderRoute();
    toast('已保存 ' + date + ' 的数据');
  };
}

function exportDaily() {
  const head = '日期,店铺,销售额,订单数,退款,推广费,访客';
  const body = S.data.daily
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => {
      const shop = S.data.shops.find((s) => s.id === r.shopId);
      return [r.date, shop ? shop.name : '-', r.sales, r.orders, r.refunds, r.adSpend, r.visitors || 0].join(',');
    })
    .join('\n');
  downloadText(head + '\n' + body, 'daily-' + today() + '.csv', 'text/csv');
}

/* ================= 利润 ================= */

function viewProducts() {
  const products = S.data.products;
  const withR = products.map((p) => ({ p, r: productProfit(p) }));
  const avgMargin = withR.length ? withR.reduce((a, x) => a + x.r.grossMargin, 0) / withR.length : 0;
  const loss = withR.filter((x) => x.r.net < 0).length;

  const rows = withR.map(({ p, r }) => {
    const shop = S.data.shops.find((s) => s.id === p.shopId);
    return `
      <tr data-id="${p.id}" style="cursor:pointer">
        <td><strong>${esc(p.name)}</strong><div style="font-size:11px;color:var(--ink-3)">${esc(shop ? shop.name : '未分配店铺')}</div></td>
        <td class="num">${money(r.price)}</td>
        <td class="num">${money(r.costSum)}</td>
        <td class="num">${money(r.gross)}</td>
        <td class="num"><span class="pill ${r.grossMargin >= 0.35 ? 'good' : r.grossMargin >= 0.15 ? 'warn' : 'bad'}">${pct(r.grossMargin)}</span></td>
        <td class="num" style="color:${r.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(r.net)}</td>
        <td class="num">${r.breakEvenRoi === Infinity ? '—' : r.breakEvenRoi.toFixed(2)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="page-head">
      <div><h2>利润核算</h2><p>把成本摊开算清楚，才知道该不该投推广</p></div>
      <div class="spacer"></div>
      <button class="btn primary sm" data-act="add-product">＋ 新增商品成本卡</button>
    </div>

    <div class="grid three" style="margin-bottom:14px">
      <div class="stat"><div class="label">商品数</div><div class="value">${products.length}<small>个</small></div></div>
      <div class="stat"><div class="label">平均毛利率</div><div class="value">${pct(avgMargin)}</div><div class="hint">扣除成本/运费/佣金，未扣推广</div></div>
      <div class="stat ${loss ? 'bad' : 'good'}"><div class="label">扣推广后亏损</div><div class="value">${loss}<small>个</small></div></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>成本卡列表</h3><span class="sub">点击一行可编辑</span></div>
      ${products.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>商品</th><th class="num">售价</th><th class="num">单件成本</th><th class="num">毛利</th><th class="num">毛利率</th><th class="num">净利</th><th class="num">保本ROI</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : `<div class="tbl-empty">还没有商品，先建一张成本卡试试</div>`}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-head"><h3>怎么用这几列</h3></div>
      <div class="card-body" style="font-size:13px;color:var(--ink-2);line-height:1.9">
        <div><b>毛利</b> = 售价 − 商品成本 − 运费 − 平台佣金（未扣推广费）</div>
        <div><b>净利</b> = 毛利 − 单笔推广费 − 退款损耗（按退款率估算往返运费与包装损耗）</div>
        <div><b>保本ROI</b> = 售价 ÷（售价 − 成本 − 运费 − 佣金 − 退款损耗）。推广 ROI 低于这个数就是在亏钱卖。</div>
        <div><b>保本售价</b> = 成本 ÷（1 − 佣金率），用来判断还能不能再降价。</div>
      </div>
    </div>`;
}

function bindProducts() {
  $$('#view [data-act="add-product"]').forEach((b) => (b.onclick = () => openProductForm(null)));
  $$('#view tr[data-id]').forEach((tr) => {
    tr.onclick = () => {
      const p = S.data.products.find((x) => x.id === tr.dataset.id);
      if (p) openProductForm(p);
    };
  });
}

function openProductForm(product) {
  const p = product || {
    id: uid(),
    shopId: (S.data.shops[0] || {}).id,
    name: '',
    price: 59.9,
    cost: { material: 18, labor: 6, accessories: 1, packaging: 1.2 },
    shipping: 3.5,
    commission: 0.6,
    adCost: 8,
    refundRate: 3,
    note: ''
  };
  const shopOpts = S.data.shops.map((s) => `<option value="${s.id}" ${p.shopId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');

  openDrawer(product ? '编辑成本卡' : '新增成本卡', `
    <div class="stack">
      <div class="field"><label>商品名称</label><input class="input" id="pName" value="${esc(p.name)}" placeholder="例如：半高领加厚毛衣"></div>
      <div class="field"><label>所属店铺</label><select class="select" id="pShop">${shopOpts}</select></div>
      <div class="grid two">
        <div class="field"><label>售价（元）</label><input class="input" id="pPrice" type="number" value="${p.price}"></div>
        <div class="field"><label>平台佣金率（%）</label><input class="input" id="pCommission" type="number" step="0.01" value="${p.commission}"><div class="tip">拼多多多为 0.6%</div></div>
      </div>
      <div class="card-head" style="padding:0;border:0;background:none"><h3 style="font-size:13px;color:var(--ink-2)">单件成本</h3></div>
      <div class="grid two">
        <div class="field"><label>采购/生产</label><input class="input" id="cMaterial" type="number" value="${p.cost.material}"></div>
        <div class="field"><label>加工/工费</label><input class="input" id="cLabor" type="number" value="${p.cost.labor}"></div>
        <div class="field"><label>辅料/吊牌</label><input class="input" id="cAcc" type="number" value="${p.cost.accessories}"></div>
        <div class="field"><label>包装</label><input class="input" id="cPack" type="number" value="${p.cost.packaging}"></div>
      </div>
      <div class="grid two">
        <div class="field"><label>单件运费（元）</label><input class="input" id="pShip" type="number" value="${p.shipping}"></div>
        <div class="field"><label>单笔推广费（元）</label><input class="input" id="pAd" type="number" value="${p.adCost}"></div>
      </div>
      <div class="field"><label>预估退款率（%）</label><input class="input" id="pRefund" type="number" value="${p.refundRate}"></div>
      <div class="card" style="background:var(--surface-2);box-shadow:none" id="pCalc"></div>
    </div>`, `<button class="btn danger" id="pDel">删除</button><button class="btn primary" id="pSave">保存</button>`);

  const calc = () => {
    const tmp = {
      price: Number($('#pPrice').value),
      cost: {
        material: Number($('#cMaterial').value),
        labor: Number($('#cLabor').value),
        accessories: Number($('#cAcc').value),
        packaging: Number($('#cPack').value)
      },
      shipping: Number($('#pShip').value),
      commission: Number($('#pCommission').value),
      adCost: Number($('#pAd').value),
      refundRate: Number($('#pRefund').value)
    };
    const r = productProfit(tmp);
    $('#pCalc').innerHTML = `
      <div class="card-body" style="padding:14px">
        <div class="grid two" style="gap:10px">
          <div><div style="font-size:11px;color:var(--ink-3)">单件总成本</div><div style="font-weight:650">${money(r.costSum + r.shipping)}</div></div>
          <div><div style="font-size:11px;color:var(--ink-3)">毛利 / 毛利率</div><div style="font-weight:650">${money(r.gross)} · ${pct(r.grossMargin)}</div></div>
          <div><div style="font-size:11px;color:var(--ink-3)">净利 / 净利率</div><div style="font-weight:650;color:${r.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(r.net)} · ${pct(r.netMargin)}</div></div>
          <div><div style="font-size:11px;color:var(--ink-3)">保本 ROI</div><div style="font-weight:650">${r.breakEvenRoi === Infinity ? '—' : r.breakEvenRoi.toFixed(2)}</div></div>
          <div><div style="font-size:11px;color:var(--ink-3)">保本售价</div><div style="font-weight:650">${money(r.breakEvenPrice)}</div></div>
          <div><div style="font-size:11px;color:var(--ink-3)">退款损耗</div><div style="font-weight:650">${money(r.refundLoss)}</div></div>
        </div>
      </div>`;
  };

  $$('#drawerOverlay input').forEach((i) => (i.oninput = calc));
  calc();

  $('#pSave').onclick = () => {
    const name = $('#pName').value.trim();
    if (!name) { toast('给商品起个名字'); return; }
    const rec = {
      id: p.id,
      shopId: $('#pShop').value,
      name,
      price: Number($('#pPrice').value),
      cost: {
        material: Number($('#cMaterial').value),
        labor: Number($('#cLabor').value),
        accessories: Number($('#cAcc').value),
        packaging: Number($('#cPack').value)
      },
      shipping: Number($('#pShip').value),
      commission: Number($('#pCommission').value),
      adCost: Number($('#pAd').value),
      refundRate: Number($('#pRefund').value),
      note: p.note || ''
    };
    const idx = S.data.products.findIndex((x) => x.id === rec.id);
    if (idx >= 0) S.data.products[idx] = rec; else S.data.products.push(rec);
    persist();
    closeDrawer();
    renderRoute();
    toast('已保存');
  };

  $('#pDel').onclick = () => {
    if (!confirm('删除这张成本卡？')) return;
    S.data.products = S.data.products.filter((x) => x.id !== p.id);
    persist();
    closeDrawer();
    renderRoute();
    toast('已删除');
  };
}

/* ================= 店铺 ================= */

function viewShops() {
  const cards = S.data.shops.map((shop) => {
    const st = shopStats(shop.id);
    return `
      <div class="card shop-card" data-id="${shop.id}">
        <div class="accent-bar" style="background:${esc(shop.color || '#c4562b')}"></div>
        <div class="card-body">
          <div class="name">${esc(shop.name)}</div>
          <div class="meta">${esc(shop.note || '未填写备注')}</div>
          <div class="shop-kv">
            <div><div class="k">运营方式</div><div class="v" style="font-size:13px">${esc(shop.opMode || '未设置')}</div></div>
            <div><div class="k">价位段</div><div class="v" style="font-size:13px">${esc(shop.band || '未设置')}</div></div>
            <div><div class="k">累计净利</div><div class="v" style="color:${st.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(st.net)}</div></div>
            <div><div class="k">商品数</div><div class="v">${S.data.products.filter((p) => p.shopId === shop.id).length}</div></div>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="page-head">
      <div><h2>我的店铺</h2><p>一人多店：新开店铺加进来，所有数据自动汇总</p></div>
      <div class="spacer"></div>
      <button class="btn primary sm" data-act="add-shop">＋ 添加店铺</button>
    </div>
    ${S.data.shops.length ? `<div class="shop-grid">${cards}</div>` : `<div class="empty"><div class="glyph">◫</div><h4>还没有店铺</h4><p>先把正在经营的店加进来</p><button class="btn primary" data-act="add-shop">＋ 添加店铺</button></div>`}
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3>不用自己算，选一下就行</h3></div>
      <div class="card-body" style="font-size:13px;color:var(--ink-2);line-height:1.9">
        <div>添加店铺只需要：店名、运营方式、价位段。系统按价位段自动估算成本率，看板上的毛利是估算值。</div>
        <div>想算准某一个款：去「利润」页建成本卡，填售价、进货价、运费、每天推广费，系统自动算出毛利率和保本 ROI。</div>
      </div>
    </div>`;
}

function bindShops() {
  $$('#view [data-act="add-shop"]').forEach((b) => (b.onclick = () => openShopForm(null)));
  $$('#view .shop-card').forEach((c) => {
    c.onclick = () => openShopForm(S.data.shops.find((s) => s.id === c.dataset.id));
  });
}

function openShopForm(shop) {
  const s = shop || { id: uid(), name: '', note: '', opMode: '自然流量', band: '30-60', costRate: 40, commission: 0.6, color: '#c4562b' };
  const colors = ['#c4562b', '#2f3a30', '#7a6a58', '#3f5b7a', '#8a4b63', '#a8781c'];
  const MODES = ['自然流量', '付费推广', '直播带货', '活动秒杀', '多店铺货'];
  const BANDS = ['30元以下', '30-60元', '60-100元', '100元以上'];
  const BAND_RATE = { '30元以下': 45, '30-60元': 40, '60-100元': 35, '100元以上': 30 };
  const mode = s.opMode || '自然流量';
  let band = s.band || '30-60';
  openDrawer(shop ? '编辑店铺' : '添加店铺', `
    <div class="stack">
      <div class="field"><label>店铺名称</label><input class="input" id="sName" value="${esc(s.name)}" placeholder="例如：织间旗舰店"></div>
      <div class="field"><label>主要运营方式</label><div class="chip-group" id="sMode">${MODES.map((m) => `<button class="chip ${m === mode ? 'active' : ''}" data-mode="${m}">${m}</button>`).join('')}</div></div>
      <div class="field"><label>主流价位段</label><div class="chip-group" id="sBand">${BANDS.map((b) => `<button class="chip ${b === band ? 'active' : ''}" data-band="${b}">${b}</button>`).join('')}</div></div>
      <div class="field"><label>备注（可选）</label><input class="input" id="sNote" value="${esc(s.note)}" placeholder="主营类目 / 风格 / 其他要点"></div>
      <div class="field"><label>识别色</label><div class="chip-group" id="sColors">${colors.map((c) => `<button class="chip ${c === s.color ? 'active' : ''}" data-color="${c}" style="width:34px;height:34px;padding:0;background:${c};border-color:${c}"></button>`).join('')}</div></div>
      <div class="hint" style="color:var(--ink-3);font-size:12px">成本率不用你算：系统按价位段自动估算，看板上是估算值；要精确到单品，在「利润」页建成本卡。</div>
    </div>`, `<button class="btn danger" id="sDel">删除</button><button class="btn primary" id="sSave">保存</button>`);

  let color = s.color;
  let modeSel = mode;
  $$('#sColors .chip').forEach((b) => {
    b.onclick = () => {
      color = b.dataset.color;
      $$('#sColors .chip').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    };
  });
  $$('#sMode .chip').forEach((b) => {
    b.onclick = () => {
      modeSel = b.dataset.mode;
      $$('#sMode .chip').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    };
  });
  $$('#sBand .chip').forEach((b) => {
    b.onclick = () => {
      band = b.dataset.band;
      $$('#sBand .chip').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    };
  });

  $('#sSave').onclick = () => {
    const name = $('#sName').value.trim();
    if (!name) { toast('填一个店铺名'); return; }
    const rec = {
      id: s.id,
      name,
      note: $('#sNote').value.trim(),
      opMode: modeSel,
      band,
      costRate: BAND_RATE[band] || 40,
      commission: Number(s.commission) || 0.6,
      color
    };
    const idx = S.data.shops.findIndex((x) => x.id === rec.id);
    if (idx >= 0) S.data.shops[idx] = rec; else S.data.shops.push(rec);
    persist();
    closeDrawer();
    renderRoute();
    toast('已保存');
  };

  $('#sDel').onclick = () => {
    if (!confirm('删除店铺？该店铺下的商品成本卡不会被删除。')) return;
    S.data.shops = S.data.shops.filter((x) => x.id !== s.id);
    persist();
    closeDrawer();
    renderRoute();
  };
}

/* ================= 素材工坊 ================= */

function chipGroup(key, values, multi) {
  const cur = S.studioInput[key];
  const arr = Array.isArray(cur) ? cur : [cur];
  return `<div class="chip-group" data-group="${key}" data-multi="${multi ? 1 : 0}">${values
    .map((v) => `<button class="chip ${arr.includes(v) ? 'active' : ''}" data-value="${esc(v)}">${esc(v)}</button>`)
    .join('')}</div>`;
}

function viewStudio() {
  const i = S.studioInput;
  const hasKit = Boolean(S.studioKit);

  return `
    <div class="page-head">
      <div><h2>AI 换装</h2><p>上传你的衣服 + 模特姿势图 → 把模特身上的衣服换成你的衣服</p></div>
    </div>

    <div class="studio">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>1 · 你的衣服（要换上去的）</h3><span class="sub">上传你家的衣服实拍图</span></div>
          <div class="card-body">
            ${S.studioImage
              ? `<div class="thumb"><img src="${S.studioImage.dataUrl}" alt="商品图"><button class="reup" id="reup">换图</button></div>`
              : `<div class="dropzone" id="dz"><div class="dz-icon">⬆</div><p>点击上传 / 拍照</p><div class="dz-hint">建议白底或干净背景，正方形最好</div></div>`}
            <input type="file" id="fileInput" accept="image/*" hidden>
            ${S.studioImage && S.data.settings && S.data.settings.ai && S.data.settings.ai.apiKey ? '' : (S.studioImage ? `
              <div class="no-key">
                <b>还没填火山方舟 Key</b>
                <p>这张图不会自动识别颜色，也不能换装。填一次 Key 就能用。</p>
                <button class="btn primary sm" id="goSettings">去设置填 Key</button>
              </div>` : '')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>2 · 模特姿势图</h3><span class="sub">换成上面那件衣服，姿势和背景保留</span></div>
          <div class="card-body">
            <p style="font-size:12px;color:#7a5a1e;background:#fff7e6;border:1px solid #ffd591;border-radius:8px;padding:8px 10px;margin:0 0 10px;line-height:1.7">
              可以一次传多张，每张各出 1 张。姿势、动作、背景<strong>照抄</strong>这里的图；有人脸会<strong>微调</strong>成不一样的人；衣服永远只认第 1 格你上传的。没人穿的平铺/挂拍图也能传，会自动生成模特穿上你的衣服。
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
              ${S.swapImages.map((im, i) => `
                <div style="position:relative;width:90px">
                  <img src="${im.dataUrl}" style="width:90px;height:120px;object-fit:cover;border-radius:6px;border:1px solid var(--line)" alt="参考图${i+1}">
                  <button class="reup" data-swap-del="${i}" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#fff;border:1px solid var(--line);font-size:12px;line-height:1;padding:0">×</button>
                  <div style="font-size:11px;color:var(--ink-3);text-align:center;margin-top:2px">参考图 ${i+1}</div>
                </div>`).join('')}
              <div class="dropzone" id="swapDz" style="width:90px;height:120px;min-height:auto;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
                <div class="dz-icon" style="font-size:20px">+</div>
                <div style="font-size:11px;color:var(--ink-3)">添加</div>
              </div>
            </div>
            <input type="file" id="swapFile" accept="image/*" multiple hidden>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0 4px;font-size:13px">
              <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">
                <input type="checkbox" id="swapNoAcc" ${S.arkCounts.noAccessory ? 'checked' : ''}>
                不带小装饰
              </label>
              <input id="swapAccList" type="text" value="${esc(S.arkCounts.accessoryList)}" placeholder="要去掉的装饰，例如：丝带、蝴蝶结、胸针" style="flex:1;min-width:130px">
            </div>
            ${S.swapImages.length ? (() => {
              const cn = Math.max(1, (i.colors || []).length);
              const total = S.swapImages.length * cn;
              const rest = total - 1;
              return `<div style="font-size:12px;color:var(--ink-3);margin:6px 0 4px">${S.swapImages.length} 张姿势图 × ${cn} 个颜色 = 共 ${total} 张</div>
              <div style="display:flex;gap:8px">
                <button class="btn primary" id="swapBtn" style="flex:1">${S.swapPreviewReady ? `继续生成剩余 ${rest} 张` : '换装生成（先出 1 张预览）'}</button>
                ${S.swapPreviewReady ? '<button class="btn" id="swapRedo">重出预览</button>' : ''}
              </div>`;
            })() : `<div style="margin-top:8px"><button class="btn primary" id="swapBtn" style="width:100%">换装生成（收费）</button></div>`}
            <div id="swapStatus" style="font-size:12px;color:var(--ink-3);margin-top:6px;min-height:18px">${esc(S.swapStatus || (S.swapImages.length ? '先出 1 张预览，满意再生成全部，避免白花钱' : '会先提示费用，确认后才扣钱'))}</div>
            ${S.studioAiImages && S.studioAiImages.some((x) => /换装/.test(x.label)) ? `<div class="canvas-grid" style="margin-top:10px">${S.studioAiImages.filter((x) => /换装/.test(x.label)).map((it) => `
              <div class="canvas-card">
                <a href="${it.url}" target="_blank" rel="noopener"><img src="${it.url}" alt="${esc(it.label)}"></a>
                <div class="cc-foot"><span>${esc(it.label)}</span><span style="margin-left:auto"></span><a class="btn sm dlOne" href="${it.url}" data-url="${it.url}" data-name="${esc(it.label)}">下载</a></div>
              </div>`).join('')}</div>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>3 · 商品标签</h3><span class="sub">自动识别，可改</span>
            <div style="margin-left:auto"><button class="btn sm" id="tagToggle">${S.tagOpen ? '收起' : '修改标签'}</button></div>
          </div>
          <div class="card-body">
            <div style="font-size:13px;line-height:1.9;color:var(--ink-2)">
              ${esc([i.category, i.wearStyle, (i.materials || []).join('、'), i.fiber, i.pattern, i.neck, i.fit, i.length, i.sleeveLen, i.sleeveType, i.mainStyle, i.subStyle, i.weight, i.age, i.fleece, i.season, (i.colors || []).length ? (i.colors || []).join('、') + '（' + (i.colors || []).length + ' 色）' : ''].filter(Boolean).join(' · '))}
              ${S.aiStatus
                ? `<div id="aiStatus" class="ai-status ${/失败/.test(S.aiStatus) ? 'bad' : (/识别成功/.test(S.aiStatus) ? 'good' : '')}">${esc(S.aiStatus)}</div>`
                : '<div style="color:var(--ink-3);font-size:12px">上传图片后自动识别，不准可以点「修改标签」或重新识别</div>'}
              ${S.data.settings && S.data.settings.ai && S.data.settings.ai.apiKey ? `<button class="btn sm" id="aiRecognizeBtn" style="margin-top:8px">重新识别一次</button>` : ''}
            </div>
            ${S.tagOpen ? `
            <div style="margin-top:14px">
              <div class="param-block">
                <div class="plabel"><span>品类</span></div>
                ${chipGroup('category', OPTIONS.category, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>主面料成分</span><span class="opt">可多选，第一个算主成分</span></div>
                ${chipGroup('materials', OPTIONS.material, true)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>穿着方式</span></div>
                ${chipGroup('wearStyle', OPTIONS.wearStyle, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>面料俗称</span></div>
                ${chipGroup('fiber', OPTIONS.fiber, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>图案</span></div>
                ${chipGroup('pattern', OPTIONS.pattern, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>领型</span></div>
                ${chipGroup('neck', OPTIONS.neck, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>版型</span></div>
                ${chipGroup('fit', OPTIONS.fit, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>衣长</span></div>
                ${chipGroup('length', OPTIONS.length, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>袖长</span></div>
                ${chipGroup('sleeveLen', OPTIONS.sleeveLen, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>袖型</span></div>
                ${chipGroup('sleeveType', OPTIONS.sleeveType, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>适用年龄</span></div>
                ${chipGroup('age', OPTIONS.age, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>是否加绒</span></div>
                ${chipGroup('fleece', OPTIONS.fleece, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>流行元素</span><span class="opt">可多选</span></div>
                ${chipGroup('elements', OPTIONS.elements, true)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>主风格</span><span class="opt">只能选 1 个</span></div>
                ${chipGroup('mainStyle', OPTIONS.mainStyle, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>风格</span></div>
                ${chipGroup('subStyle', OPTIONS.subStyle, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>厚薄</span></div>
                ${chipGroup('weight', OPTIONS.weight, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>适用季节</span></div>
                ${chipGroup('season', OPTIONS.season, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>颜色</span><span class="opt">可多选，漏了就手动加</span></div>
                ${chipGroup('colors', Array.from(new Set([].concat(OPTIONS.color, (S.studioInput.colors || [])))), true)}
                <div style="display:flex;gap:8px;margin-top:8px">
                  <input class="input" id="colorCustom" placeholder="手动补颜色，如：浅紫色">
                  <button class="btn sm" id="colorAdd" style="white-space:nowrap">添加</button>
                </div>
              </div>
              <div class="param-block">
                <div class="plabel"><span>尺码</span><span class="opt">可多选</span></div>
                ${chipGroup('sizes', OPTIONS.size, true)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>场景</span><span class="opt">可多选</span></div>
                ${chipGroup('scene', OPTIONS.scene, true)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>售价（元）</span></div>
                <input class="input" id="stuPrice" type="number" value="${esc(i.price)}">
              </div>
              <div class="param-block">
                <div class="plabel"><span>额外关键词</span><span class="opt">选填，逗号分隔</span></div>
                <input class="input" id="stuExtra" value="${esc(i.extra)}" placeholder="如：大码、孕妇可穿、可机洗">
              </div>
            </div>` : ''}
            <div style="margin-top:16px">
              <button class="btn primary block" id="genBtn">${hasKit ? '重新生成全部素材' : '一键生成全部素材'}</button>
            </div>
          </div>
        </div>
      </div>

      <div>
        ${hasKit ? renderStudioResult() : `
          <div class="card"><div class="empty" style="padding:60px 20px">
            <div class="glyph">✳</div>
            <h4>左边选好标签，点「一键生成」</h4>
            <p>会生成 6 组标题、8 条卖点、SKU 规格表和整套属性表。出图请用右边的 AI 换装</p>
          </div></div>`}
      </div>
    </div>`;
}

function renderStudioResult() {
  const kit = S.studioKit;
  const tabs = [
    ['titles', '标题'],
    ['points', '卖点'],
    ['skus', 'SKU'],
    ['jimeng', '即梦提示词'],
    ['detail', '详情页'],
    ['attrs', '属性表']
  ];
  // 老版本可能把 tab 存在 ark/images 上，这里兜底回标题
  const tab = tabs.some(([k]) => k === S.studioResultTab) ? S.studioResultTab : (S.studioResultTab = 'titles');

  let body = '';

  if (tab === 'titles') {
    body = kit.titles.map((t, i) => `
      <div class="title-item">
        <div class="idx">${i + 1}</div>
        <div>
          <div class="txt">${esc(t.text)}</div>
          <div class="meta ${t.len > 60 ? 'over' : ''}">${t.kind} · ${t.len} 字${t.len > 60 ? '（超出 60，需删减）' : ''}</div>
        </div>
        <div class="acts"><button class="btn sm" data-copy="${esc(t.text)}">复制</button></div>
      </div>`).join('');
  }

  if (tab === 'points') {
    body = `<div class="copy-list">${kit.sellingPoints.map((p) => `
      <div class="copy-block">
        <div class="cb-head"><span>${p.icon} ${esc(p.text)}</span><span class="spacer"></span><button class="btn sm" data-copy="${esc(p.text)}：${esc(p.desc)}">复制</button></div>
        <pre>${esc(p.desc)}</pre>
      </div>`).join('')}</div>`;
  }

  if (tab === 'skus') {
    body = `
      <div class="card"><div class="card-head"><h3>${kit.skus.length} 个 SKU</h3><span class="sub">价格、库存可直接改</span></div>
      <div class="table-wrap"><table class="tbl sku-table">
        <thead><tr><th>规格1</th><th>规格2</th><th>拼多多规格名</th><th class="num">价格</th><th class="num">库存</th><th>编码</th></tr></thead>
        <tbody>${kit.skus.map((s, idx) => `<tr>
          <td>${esc(s.spec1)}</td><td>${esc(s.spec2)}</td><td>${esc(s.pddName)}</td>
          <td class="num"><input type="number" value="${s.price}" data-sku-price="${idx}"></td>
          <td class="num"><input type="number" value="${s.stock}" data-sku-stock="${idx}"></td>
          <td>${esc(s.code)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="card-body" style="border-top:1px solid var(--line)"><button class="btn sm" id="copySku">复制为 CSV（可粘贴到表格）</button></div>
      </div>`;
  }

  if (tab === 'images') {
    body = `
      <div class="row" style="margin-bottom:12px">
        <button class="btn sm primary" id="dlAll">下载全部主图</button>
        <button class="btn sm" id="dlDetail">下载详情长图</button>
        <span class="sub" style="font-size:12px;color:var(--ink-3)">800×800 PNG · 详情 750px 宽</span>
      </div>
      <div class="canvas-grid" id="canvasGrid"></div>`;
  }

  if (tab === 'ark') {
    const ai = (S.data.settings && S.data.settings.ai) || {};
    const hasKey = Boolean(ai.apiKey);
    const aiImgs = S.studioAiImages || [];
    body = `
      <div class="card">
        <div class="card-head"><h3>火山方舟生成模特图</h3><span class="sub">手动点，确认后扣费</span>
          <button class="btn sm" id="arkBalanceBtn" style="margin-left:auto">查余额</button>
        </div>
        <div class="card-body">
          <div id="arkBalanceBox" style="display:none;font-size:13px;background:#f6ffed;border:1px solid #b7eb8f;border-radius:8px;padding:8px 10px;margin-bottom:10px;line-height:1.7"></div>
          ${hasKey ? `
            <div style="font-size:13px;color:var(--ink-2);margin-bottom:10px">
              识别到的颜色：<strong>${esc((S.studioInput.colors && S.studioInput.colors.length ? S.studioInput.colors.join('、') : '未识别（按 1 个颜色算）'))}</strong>
              <span style="color:var(--ink-3)">（${S.studioInput.colors && S.studioInput.colors.length ? S.studioInput.colors.length : 1} 个颜色，每个颜色单独出）</span>
            </div>
            <div class="row" style="gap:16px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
              <label style="font-size:13px;color:var(--ink-2)">每个颜色主图
                <input id="arkMainCount" type="number" min="1" max="20" step="1" value="${Number(S.arkCounts.mainPer) || 2}" style="width:64px;margin:0 4px;text-align:center">
                张
              </label>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:13px">
              <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">出图风格
                <select id="arkPhotoStyle" style="margin:0 4px">
                  <option value="auto" ${(S.arkCounts.photoStyle || 'auto') === 'auto' ? 'selected' : ''}>自动随机（每款统一风格）</option>
                  <option value="flatlay" ${S.arkCounts.photoStyle === 'flatlay' ? 'selected' : ''}>全平铺挂拍（无模特）</option>
                  <option value="lifestyle" ${S.arkCounts.photoStyle === 'lifestyle' ? 'selected' : ''}>全素人模特随手拍</option>
                  <option value="whitebg" ${S.arkCounts.photoStyle === 'whitebg' ? 'selected' : ''}>纯白棚拍（高调白底，素人脸）</option>
                </select>
              </label>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:13px">
              <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">
                <input type="checkbox" id="arkSimpleSku" ${S.arkCounts.simpleSku ? 'checked' : ''}>
                有简配版（低价 SKU 引流，多出 1 张）
              </label>
              <input id="arkSimpleNote" type="text" value="${esc(S.arkCounts.simpleNote)}" placeholder="简配差异，例如：不带丝带" style="flex:1;min-width:140px">
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:13px">
              <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">
                <input type="checkbox" id="arkNoAcc" ${S.arkCounts.noAccessory ? 'checked' : ''}>
                不带装饰（只生成衣服本体，全部图都生效）
              </label>
              <input id="arkAccList" type="text" value="${esc(S.arkCounts.accessoryList)}" placeholder="要去掉的装饰，例如：丝带、蝴蝶结" style="flex:1;min-width:140px">
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:13px">
              <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">
                <input type="checkbox" id="arkAntiCompare" ${S.arkCounts.antiCompare ? 'checked' : ''}>
                防比价模式（强干扰：每张重构图 + 首图侧身回望 + SKU/标题全随机）
              </label>
            </div>
            <div style="font-size:12px;color:var(--ink-3);line-height:1.6;margin:-4px 0 10px">
              防比价原理：平台会比对主图、SKU图、SKU文字（权重最高）、标题、属性，相同特征超阈值就判同款、报活动被压价。SKU 图直接用生成好的主图就行，不用另外花钱生成；SKU 文字会自动做变体。<br>
              新品标（服装类目有效期 30 天）：需店铺近 90 天 DSR 三项高于同行，且属性填全、图片原创，由平台自动判定，无法手动报名。
            </div>
            <div class="row" style="margin-bottom:8px;flex-wrap:wrap;gap:8px">
              ${S.arkPendingJobs && S.arkPendingJobs.length ? `
                <button class="btn primary" id="arkContinueBtn">继续生成剩余 ${S.arkPendingJobs.length} 张</button>
                <button class="btn sm" id="arkRestartBtn">丢掉预览，重新出</button>
              ` : `
                <button class="btn primary" id="arkGenBtn">先生成 1 张预览（约 0.1~1 元）</button>
                ${aiImgs.length ? `<button class="btn sm" id="arkClearBtn">清空</button>` : ''}
              `}
            </div>
            <div id="arkStatus" style="font-size:13px;color:var(--ink-2);min-height:20px;margin-bottom:12px">${esc(S.arkStatus || (S.arkPendingJobs && S.arkPendingJobs.length ? '预览图已出，满意就点「继续生成」，不满意就「丢掉预览，重新出」' : (aiImgs.length ? '已生成 ' + aiImgs.length + ' 张' : '建议先出 1 张看看人脸和风格，满意了再批量出，省得浪费钱')))}</div>
            ${aiImgs.length ? `<div class="row" style="margin-bottom:10px">
                <button class="btn sm primary" id="arkDlAll">全部下载（${aiImgs.length} 张）</button>
                <span class="sub" style="font-size:12px;color:var(--ink-3)">打包成 1 个 zip 下载，不会一张张弹窗</span>
              </div><div class="canvas-grid">${aiImgs.map((it) => `
              <div class="canvas-card">
                <a href="${it.url}" target="_blank" rel="noopener"><img src="${it.url}" alt="${esc(it.label)}"></a>
                <div class="cc-foot"><span>${esc(it.label)}</span><span style="margin-left:auto"></span>
                  <a class="btn sm dlOne" href="${it.url}" data-url="${it.url}" data-name="${esc(it.label)}">下载</a></div>
              </div>`).join('')}</div>` : ''}
          ` : `
            <div class="tbl-empty" style="margin-bottom:12px">还没填火山方舟 Key，不能直接出图。</div>
            <button class="btn" id="arkGoSettings">去设置填 Key</button>
          `}
        </div>
      </div>`;
  }

  if (tab === 'jimeng') {
    const jmOpts = Object.assign({ photoStyle: S.arkCounts.photoStyle || 'blend', count: 4, seed: 0, antiCompare: true, heroShot: true, heroType: 0 }, arkAccOpts() || {});
    const variants = buildJimengPrompts(S.studioInput, jmOpts);
    const videoVariants = buildJimengVideoPrompts(S.studioInput);
    body = `
      <div class="card">
        <div class="card-head"><h3>即梦图片提示词</h3><span class="sub">免费 · 已内置防比价：每张重构图 + 第 1 张侧身回望</span></div>
        <div class="card-body">
          <p style="font-size:12px;color:var(--ink-3);margin:0 0 12px">即梦选「图生图」，上传你的衣服实拍图当参考，粘贴下面任意一条即可。每条的人脸、场景、构图都不一样，平台搜同款搜不到你的图。<strong>第 1 条用作链接首图</strong>，后面几张轮换当主图。</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:13px">
            <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">出图风格
              <select id="jimengPhotoStyle" style="margin:0 4px">
                <option value="blend" ${(S.arkCounts.photoStyle || 'blend') === 'blend' ? 'selected' : ''}>融合推荐（种草氛围 + 主图质感）</option>
                <option value="lifestyle" ${S.arkCounts.photoStyle === 'lifestyle' ? 'selected' : ''}>纯生活种草</option>
                <option value="studio" ${S.arkCounts.photoStyle === 'studio' ? 'selected' : ''}>纯电商实拍主图</option>
              </select>
            </label>
            <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">
              <input type="checkbox" id="jimengNoAcc" ${S.arkCounts.noAccessory ? 'checked' : ''}>
              不带装饰（只卖衣服本体）
            </label>
            <input id="jimengAccList" type="text" value="${esc(S.arkCounts.accessoryList)}" placeholder="要去掉的装饰，例如：丝带、蝴蝶结" style="flex:1;min-width:140px" ${S.arkCounts.noAccessory ? '' : 'disabled'}>
          </div>
          ${S.studioImage ? '' : `<div class="tbl-empty" style="margin-bottom:12px">请先上传商品图</div>`}
          <div class="copy-list">
            ${variants.map((v, i) => `
              <div class="copy-block">
                <div class="cb-head">
                  <span><strong>${i + 1}. ${esc(v.name)}</strong></span>
                  <span class="spacer"></span>
                  <button class="btn sm primary" data-copy="${esc(v.prompt)}">复制提示词</button>
                </div>
                <pre>${esc(v.prompt)}</pre>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>即梦视频提示词</h3><span class="sub">5 秒 · 1:1</span></div>
        <div class="card-body">
          <p style="font-size:12px;color:var(--ink-3);margin:0 0 12px">即梦选「图生视频」，时长 5 秒、比例 1:1，粘贴下面这条。</p>
          <div class="copy-list">
            ${videoVariants.map((v, i) => `
              <div class="copy-block">
                <div class="cb-head">
                  <span><strong>${i + 1}. ${esc(v.name)}</strong></span>
                  <span class="spacer"></span>
                  <button class="btn sm primary" data-copy="${esc(v.prompt)}">复制提示词</button>
                </div>
                <pre>${esc(v.prompt)}</pre>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  if (tab === 'detail') {
    body = `<div class="copy-list">${kit.detail.sections.map((s) => `
      <div class="copy-block">
        <div class="cb-head"><span>${esc(s.title)}</span><span class="spacer"></span>
        <button class="btn sm" data-copy="${esc(s.lines.join('\n'))}">复制</button></div>
        <pre>${esc(s.lines.join('\n'))}</pre>
      </div>`).join('')}
      <button class="btn block" data-copy="${esc(detailToText(kit))}">复制整篇详情页文案</button></div>`;
  }

  if (tab === 'attrs') {
    body = `<div class="card"><div class="card-head"><h3>拼多多商品属性</h3><span class="sub">上架时照填</span></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>属性</th><th>填写值</th></tr></thead>
        <tbody>${kit.attrs.map(([k, v]) => `<tr><td style="color:var(--ink-2)">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</tbody>
      </table></div>
      <div class="card-body" style="border-top:1px solid var(--line)">
        <button class="btn sm" data-copy="${esc(kit.attrs.map(([k, v]) => k + '：' + v).join('\n'))}">复制全部属性</button>
        <p style="font-size:12px;color:var(--ink-3);margin-top:10px">字段与拼多多女装毛衣发布页一致（品牌、穿着方式、厚薄、衣长、领型、袖长、袖型、服装版型、图案、主面料成分、成分含量、面料俗称、适用年龄、流行元素、是否加绒、上市时节、主风格、风格）。成分含量是草稿值，务必按吊牌实际百分比改，平台会抽检。</p>
      </div></div>`;
  }

  return `
    <div class="card">
      <div class="card-head">
        <h3>生成结果</h3><span class="sub">${new Date(kit.generatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
        <div style="margin-left:auto"><button class="btn sm" id="saveMaterial">保存到素材库</button></div>
      </div>
      <div class="card-body">
        <div class="result-tabs">${tabs.map(([k, label]) => `<button class="${tab === k ? 'active' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>
        ${body}
      </div>
    </div>`;
}

function bindStudio() {
  const dz = $('#dz');
  const fileInput = $('#fileInput');
  const reup = $('#reup');

  const chooseFile = () => fileInput && fileInput.click();
  if (dz) dz.onclick = chooseFile;
  if (reup) reup.onclick = chooseFile;

  const goSet = $('#goSettings');
  if (goSet) goSet.onclick = () => { S.route = 'settings'; renderRoute(); registerTabs(); };

  const colorAdd = $('#colorAdd');
  if (colorAdd) {
    colorAdd.onclick = () => {
      const inp = $('#colorCustom');
      const v = (inp && inp.value || '').trim();
      if (!v) return;
      const arr = Array.isArray(S.studioInput.colors) ? S.studioInput.colors : [];
      if (!arr.includes(v)) arr.push(v);
      S.studioInput.colors = arr;
      S.studioKit = generateKit(S.studioInput, Number(S.studioInput.price) || 0);
      renderRoute();
      bindRoute();
      toast('已添加颜色：' + v);
    };
  }

  const swapFile = $('#swapFile');
  const chooseSwap = () => swapFile && swapFile.click();
  const swapDz = $('#swapDz');
  if (swapDz) swapDz.onclick = chooseSwap;
  if (swapFile) {
    swapFile.onchange = async () => {
      const files = swapFile.files;
      if (!files || !files.length) return;
      let added = 0;
      for (let f = 0; f < files.length; f++) {
        const file = files[f];
        if (file.size > 10 * 1024 * 1024) { toast(file.name + ' 太大，跳过'); continue; }
        try {
          const { img, dataUrl } = await loadImageFromFile(file);
          S.swapImages.push({ img, dataUrl, aiUrl: toAiJpeg(img, 1500) });
          added++;
        } catch (_) { toast(file.name + ' 读取失败，跳过'); }
      }
      if (added) {
        S.swapStatus = '';
        S.swapPreviewReady = false;
        S.swapPreviewUrl = '';
        renderRoute();
        bindRoute();
      }
      swapFile.value = '';
    };
  }
  $$('[data-swap-del]').forEach((b) => {
    b.onclick = () => {
      const idx = Number(b.dataset.swapDel);
      S.swapImages.splice(idx, 1);
      S.swapPreviewReady = false;
      S.swapPreviewUrl = '';
      renderRoute();
      bindRoute();
    };
  });
  const swapBtn = $('#swapBtn');
  if (swapBtn) swapBtn.onclick = swapGenerate;
  const swapRedoBtn = $('#swapRedo');
  if (swapRedoBtn) swapRedoBtn.onclick = swapRedo;
  const swapNoAcc = $('#swapNoAcc');
  if (swapNoAcc) swapNoAcc.onchange = () => { S.arkCounts.noAccessory = swapNoAcc.checked; };
  const swapAccList = $('#swapAccList');
  if (swapAccList) swapAccList.oninput = () => { S.arkCounts.accessoryList = swapAccList.value; };
  if (fileInput) {
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast('图片太大，请压缩到 10MB 以内'); return; }
      try {
        const { img, dataUrl } = await loadImageFromFile(file);
        // 给 AI 用的图：统一转成 JPEG，最长边 2600（拼图分格后每格细节仍清晰，口袋小装饰、纽扣不会被糊掉）
        const aiUrl = toAiJpeg(img, 2600);
        S.studioImage = { img, dataUrl, aiUrl, assetUrl: null };
        S.studioAiImages = [];
        S.arkFaceRef = null;
        S.arkIdentity = null;
        S.arkLight = null;
        S.arkPendingJobs = null;
        S.aiStatus = '';
        S.arkStatus = '';
        S.studioResultTab = 'titles';
        // 先用当前标签生成一版结果
        S.studioKit = generateKit(S.studioInput, Number(S.studioInput.price) || 0);
        renderRoute();
        bindRoute();
        // 配了 Key 就自动识别风格，没配就等用户手动选标签
        if (S.data && S.data.settings && S.data.settings.ai && S.data.settings.ai.apiKey) {
          await autoRecognize();
        }
      } catch (_) {
        toast('图片读取失败');
      }
    };
  }

  $$('#view .chip-group').forEach((group) => {
    const key = group.dataset.group;
    const multi = group.dataset.multi === '1';
    $$('.chip', group).forEach((chip) => {
      chip.onclick = () => {
        const v = chip.dataset.value;
        if (multi) {
          const arr = Array.isArray(S.studioInput[key]) ? S.studioInput[key] : [];
          const i = arr.indexOf(v);
          if (i >= 0) arr.splice(i, 1); else arr.push(v);
          if (!arr.length) arr.push(v);
        } else {
          S.studioInput[key] = v;
          if (key === 'subStyle') S.studioInput.styles = [v];
        }
        $$('.chip', group).forEach((c) => c.classList.toggle('active', Array.isArray(S.studioInput[key]) ? S.studioInput[key].includes(c.dataset.value) : S.studioInput[key] === c.dataset.value));
      };
    });
  });

  $$('#view .result-tabs button').forEach((b) => {
    b.onclick = () => { S.studioResultTab = b.dataset.tab; renderRoute(); bindRoute(); };
  });

  $$('#view [data-copy]').forEach((b) => {
    b.onclick = () => copyText(b.dataset.copy);
  });

  const genBtn = $('#genBtn');
  if (genBtn) {
    genBtn.onclick = () => {
      const pInp = $('#stuPrice');
      const eInp = $('#stuExtra');
      if (pInp) S.studioInput.price = pInp.value;
      if (eInp) S.studioInput.extra = eInp.value;
      if (!S.studioImage) { toast('先上传一张商品图'); return; }
      S.studioKit = generateKit(S.studioInput, Number(S.studioInput.price));
      S.studioResultTab = 'titles';
      renderRoute();
      bindRoute();
      toast('素材已生成');
    };
  }

  const tagToggle = $('#tagToggle');
  if (tagToggle) tagToggle.onclick = () => {
    S.tagOpen = !S.tagOpen;
    renderRoute();
    bindRoute();
  };

  const priceInput = $('#stuPrice');
  if (priceInput) priceInput.oninput = () => { S.studioInput.price = priceInput.value; };

  const grid = $('#canvasGrid');
  if (grid) {
    const input = Object.assign({}, S.studioInput, { price: Number(S.studioInput.price) });
    const images = buildMainImages(S.studioImage.img, S.studioKit, input);
    grid.innerHTML = images.map((x) => `
      <div class="canvas-card">
        <img src="${x.c.toDataURL('image/png')}" alt="${x.label}">
        <div class="cc-foot"><span>${x.label}</span><span style="margin-left:auto"></span>
          <button class="btn sm" data-dl="${x.key}">下载</button></div>
      </div>`).join('');
    $$('#view [data-dl]').forEach((b) => {
      b.onclick = () => {
        const item = images.find((x) => x.key === b.dataset.dl);
        if (item) downloadCanvas(item.c, item.label.replace(/[·\s]/g, '_') + '.png');
      };
    });
    const dlAll = $('#dlAll');
    if (dlAll) dlAll.onclick = () => images.forEach((x, i) => setTimeout(() => downloadCanvas(x.c, (i + 1) + '.png'), i * 350));
    const dlDetail = $('#dlDetail');
    if (dlDetail) dlDetail.onclick = () => {
      const d = buildDetailImage(S.studioImage.img, S.studioKit, input);
      downloadCanvas(d.c, '详情长图.png');
    };
  }

  const copySku = $('#copySku');
  if (copySku) copySku.onclick = () => copyText(skuToCsv(S.studioKit.skus));

  $$('#view [data-sku-price]').forEach((inp) => {
    inp.onchange = () => { S.studioKit.skus[Number(inp.dataset.skuPrice)].price = inp.value; };
  });
  $$('#view [data-sku-stock]').forEach((inp) => {
    inp.onchange = () => { S.studioKit.skus[Number(inp.dataset.skuStock)].stock = inp.value; };
  });

  const saveMaterial = $('#saveMaterial');
  if (saveMaterial) saveMaterial.onclick = saveToLibrary;

  const aiRecog = $('#aiRecognizeBtn');
  if (aiRecog) aiRecog.onclick = () => autoRecognize();

  const arkGen = $('#arkGenBtn');
  if (arkGen) arkGen.onclick = () => arkPreviewOne();
  const arkContinue = $('#arkContinueBtn');
  if (arkContinue) arkContinue.onclick = () => arkContinueRest();
  const arkRestart = $('#arkRestartBtn');
  if (arkRestart) arkRestart.onclick = () => arkRestartPreview();
  const arkBalance = $('#arkBalanceBtn');
  if (arkBalance) arkBalance.onclick = () => arkCheckBalance();
  const arkMainCount = $('#arkMainCount');
  if (arkMainCount) arkMainCount.onchange = () => {
    const n = Math.max(1, Math.min(20, Math.round(Number(arkMainCount.value) || 2)));
    arkMainCount.value = n;
    S.arkCounts.mainPer = n;
  };
  const arkSimpleSku = $('#arkSimpleSku');
  if (arkSimpleSku) arkSimpleSku.onchange = () => { S.arkCounts.simpleSku = arkSimpleSku.checked; };
  const arkSimpleNote = $('#arkSimpleNote');
  if (arkSimpleNote) arkSimpleNote.oninput = () => { S.arkCounts.simpleNote = arkSimpleNote.value; };
  const arkNoAcc = $('#arkNoAcc');
  if (arkNoAcc) arkNoAcc.onchange = () => { S.arkCounts.noAccessory = arkNoAcc.checked; };
  const arkAnti = $('#arkAntiCompare');
  if (arkAnti) arkAnti.onchange = () => { S.arkCounts.antiCompare = arkAnti.checked; S.studioInput.antiCompare = arkAnti.checked; };
  const arkPhotoStyle = $('#arkPhotoStyle');
  if (arkPhotoStyle) arkPhotoStyle.onchange = () => { S.arkCounts.photoStyle = arkPhotoStyle.value; };
  const arkAccList = $('#arkAccList');
  if (arkAccList) arkAccList.oninput = () => { S.arkCounts.accessoryList = arkAccList.value; };
  const jimengPhotoStyle = $('#jimengPhotoStyle');
  if (jimengPhotoStyle) jimengPhotoStyle.onchange = () => {
    S.arkCounts.photoStyle = jimengPhotoStyle.value;
    renderRoute();
    bindRoute();
  };
  const jimengNoAcc = $('#jimengNoAcc');
  if (jimengNoAcc) jimengNoAcc.onchange = () => {
    S.arkCounts.noAccessory = jimengNoAcc.checked;
    renderRoute();
    bindRoute();
  };
  const jimengAccList = $('#jimengAccList');
  if (jimengAccList) jimengAccList.onchange = () => {
    S.arkCounts.accessoryList = jimengAccList.value;
    renderRoute();
    bindRoute();
  };
  const arkClear = $('#arkClearBtn');
  if (arkClear) arkClear.onclick = () => {
    S.studioAiImages = [];
    S.arkFaceRef = null;
    S.arkIdentity = null;
    S.arkLight = null;
    S.arkPendingJobs = null;
    S.arkStatus = '';
    renderRoute();
    bindRoute();
  };
  const arkDlAll = $('#arkDlAll');
  if (arkDlAll) arkDlAll.onclick = () => {
    const imgs = (S.studioAiImages || []).slice();
    if (!imgs.length) return;
    const stamp = new Date().toLocaleString('zh-CN').replace(/[\/\s:]/g, '-');
    downloadAsZip(imgs, `毛衣素材_${stamp}.zip`);
  };
  const arkGoSettings = $('#arkGoSettings');
  if (arkGoSettings) arkGoSettings.onclick = () => {
    S.route = 'settings';
    renderRoute();
    registerTabs();
  };
}

async function autoRecognize() {
  if (!S.studioImage) return;
  const startedAt = Date.now();
  const tick = () => {
    S.aiStatus = '正在识别拼多多属性（材质、图案、领型、版型、衣长、袖型、风格、颜色）…（已识别 ' + Math.round((Date.now() - startedAt) / 1000) + ' 秒）';
    setAiStatus(S.aiStatus);
  };
  tick();
  renderRoute();
  bindRoute();
  const timer = setInterval(tick, 1000);
  try {
    let r = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        r = await api('/api/ai/recognize', { method: 'POST', body: JSON.stringify({ imageUrl: S.studioImage.aiUrl }) });
        break;
      } catch (err) {
        lastErr = err;
        if ((err.body && err.body.error) !== 'AI_PARSE_FAIL') break;
      }
    }
    if (!r) throw lastErr;
    const s = r.style;
    // 模型偶尔把数组返回成字符串，这里统一整理
    ['materials', 'crafts', 'styles', 'audience', 'colors', 'sizes', 'scene'].forEach((k) => {
      if (typeof s[k] === 'string') s[k] = s[k].split(/[,，、\/\s]+/).filter(Boolean);
    });
    if (Array.isArray(s.colors)) s.colors = Array.from(new Set(s.colors.map((c) => String(c).trim()).filter(Boolean))).slice(0, 12);
    if (Array.isArray(s.grid) && s.grid.length) {
      const g = Array.from(new Set(s.grid.map((c) => String(c).trim()).filter(Boolean)));
      if (g.length > (Array.isArray(s.colors) ? s.colors.length : 0)) s.colors = g.slice(0, 12);
    }
    if (Array.isArray(s.styles) && s.styles.length > 1) s.styles = [s.styles[0]];
    if (!Array.isArray(s.styles) || !s.styles.length) {
      s.styles = [s.subStyle || '慵懒风'];
    }
    if (!Array.isArray(s.crafts) || !s.crafts.length) {
      s.crafts = [s.pattern && s.pattern !== '纯色' ? s.pattern : (s.materials && /羊毛|羊绒|马海毛/.test(s.materials.join('')) ? '麻花编织' : '坑条')];
    }
    const map = ['category','materials','crafts','neck','fit','styles','audience','weight','season','colors','sizes','scene',
      'pattern','wearStyle','fiber','age','fleece','mainStyle','subStyle','length','sleeveLen','sleeveType','elements'];
    map.forEach((k) => { if (s[k] !== undefined && s[k] !== null) S.studioInput[k] = s[k]; });
    if (s.price) S.studioInput.price = String(s.price);
    if (s.extra) S.studioInput.extra = s.extra;
    S.studioKit = generateKit(S.studioInput, Number(S.studioInput.price) || 0);
    S.studioResultTab = 'jimeng';
    const colN = (S.studioInput.colors || []).length;
    S.aiStatus = '✅ 识别成功：' + (colN ? `认出 ${colN} 个颜色（${(S.studioInput.colors || []).join('、')}）` : '已填好属性') + '。即梦提示词已生成，在右侧「即梦提示词」页';
    renderRoute();
    bindRoute();
    toast('识别完成，即梦提示词已生成');
  } catch (e) {
    S.aiStatus = '❌ 识别失败：' + ((e.body && e.body.message) || e.message);
    renderRoute();
    bindRoute();
  } finally {
    clearInterval(timer);
  }
}

// 妆容与皮肤的统一要求：素人真实感，刻意避开网红/AI 塑料感
const FACE_QUALITY = '漂亮但真实：五官清秀耐看、第一眼让人想点开，不是流水线网红整容脸、左右脸略有自然差异；清透自然的日常淡妆——干净轻薄的底妆、淡淡的棕色眼妆、自然眉形、提气色的唇色并保留唇纹、眼周有自然卧蚕，不浓艳、没有厚重假睫毛；皮肤白皙干净但保留真实皮肤纹理和细小毛孔、不是磨皮假面不是塑料感；头发是真实发丝不是一整片色块：能看出发丝走向和层次、发缝自然、发际线有小碎发、几根飞散的毛躁发丝、发根到发梢有轻微深浅变化；头发整体哑光质感，室内光下只有发丝边缘一点点自然反光，不要大面积高光、不要油亮反光、不要亮成塑料丝、不要假发感、不要头盔感';

// 当前这一款商品用哪位模特：新商品重新随机，同商品各颜色保持一致
function arkIdentity() {
  if (!S.arkIdentity) S.arkIdentity = ARK_IDENTITIES[Math.floor(Math.random() * ARK_IDENTITIES.length)];
  return S.arkIdentity;
}
function arkLightSetup() {
  if (!S.arkLight) {
    S.arkLight = ARK_LIGHTS[Math.floor(Math.random() * ARK_LIGHTS.length)];
    S.arkLens = ARK_LENSES[Math.floor(Math.random() * ARK_LENSES.length)];
    S.arkWb = ARK_WBS[Math.floor(Math.random() * ARK_WBS.length)];
  }
  return S.arkLight;
}
function arkFaceSpec(style) {
  const studio = ['studio', 'whitebg'].includes(style || S.arkCounts.photoStyle || 'blend');
  const quality = studio
    ? '漂亮但真实：五官清秀耐看、让人有购买欲，不是流水线网红脸；清透自然的日常淡妆——干净底妆、淡淡棕色眼妆、自然眉形、提气色唇色，没有厚重假睫毛不浓艳；皮肤白皙干净但保留真实皮肤纹理和细小毛孔，不要水光肌不要磨皮假面；头发柔顺有光泽带几根碎发，发色按身份描述'
    : FACE_QUALITY;
  return `模特：${arkIdentity()}；${quality}；同一个商品的所有颜色图必须是同一位模特、同一张脸`;
}

function arkStyleInfo() {
  const i = S.studioInput || {};
  const styles = (i.styles || []).filter(Boolean).join('、') || '简约通勤';
  const aud = (i.audience || []).filter(Boolean).join('、') || '女士';
  const scene = (i.scene || []).filter(Boolean).join('、') || '日常';
  return `整体风格：${styles}；目标人群：${aud}；穿搭场景：${scene}`;
}

async function swapGenerate() {
  if (!S.studioImage) { toast('先在上面上传你的衣服实拍图'); return; }
  if (!S.swapImages.length) { toast('先上传至少一张模特姿势图'); return; }
  const ai = (S.data && S.data.settings && S.data.settings.ai) || {};
  if (!ai.apiKey) { toast('先去「设置」里填火山方舟 Key'); return; }
  const colors = (S.studioInput.colors || []).filter(Boolean);
  const colorList = colors.length ? colors : [''];
  const combs = [];
  S.swapImages.forEach((_, pi) => colorList.forEach((c) => combs.push({ pi, color: c })));
  const total = combs.length;
  const isPreview = !S.swapPreviewReady;
  const todo = isPreview ? combs.slice(0, 1) : combs.slice(1);
  if (!todo.length) { toast('已经全部生成完了'); return; }
  const low = (todo.length * 0.1).toFixed(1);
  const msg = isPreview
    ? `先出 1 张预览（${S.swapImages.length} 张姿势图 × ${colorList.length} 个颜色 = 共 ${total} 张），约 0.1~1 元。满意再生成剩余 ${total - 1} 张。继续吗？`
    : `继续生成剩余 ${todo.length} 张，约 ${low}~${todo.length} 元，从你的方舟余额扣。继续吗？`;
  if (!confirm(msg)) return;
  const btn = $('#swapBtn');
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const el = $('#swapStatus');
    if (el) el.textContent = `换装中…已等 ${Math.round((Date.now() - startedAt) / 1000)} 秒，别关页面`;
  }, 1000);
  S.swapStatus = `正在换装（1/${todo.length}）…`;
  if (btn) { btn.disabled = true; btn.textContent = `换装中…（0/${todo.length}）`; }
  renderRoute();
  bindRoute();

  // 换装必须保留参考图1的姿势和背景，所以这里不带生活方式收尾语
  const garment = S.studioImage.aiUrl || S.studioImage.dataUrl;
  const baseTail = S.arkCounts.noAccessory
    ? `，参考图2是你唯一要穿上的衣服：款式、版型、长度、袖型、门襟、领口、材质纹理、花纹、纽扣数量和每颗颜色、口袋位置全部照参考图2一模一样还原，不能改款不能改色，但不要生成${S.arkCounts.accessoryList || '丝带、蝴蝶结等装饰'}，只保留衣服本体`
    : '，参考图2是你唯一要穿上的衣服：款式、版型、长度、袖型、门襟、领口、材质纹理、花纹、纽扣数量和每颗颜色、口袋位置全部照参考图2一模一样还原，不能改款不能改色，不能换成参考图1原来的衣服，也不能直接输出参考图1里那件衣服本身';
  const faceScale = '，构图用半身中景，人物面部不要占太大：脸的高度约占画面高度的五分之一到四分之一，头顶上方留出空间，不要大头贴、不要脸部特写、不要脸顶到画面顶部';
  let done = 0;
  let lastUrl = '';
  for (let k = 0; k < todo.length; k++) {
    const { pi, color } = todo[k];
    try {
      const ref = S.swapImages[pi];
      const colorHint = color && colors.length
        ? `；参考图2这件衣服原色是「${colors[0]}」，这一张要出的是「${color}」色版本：款式、版型、织法纹理、纽扣数量和每颗颜色、口袋位置完全一致，只把衣服主体颜色改成${color}，不要改变任何结构`
        : '';
      S.swapStatus = `正在换装第 ${k + 1}/${todo.length} 张…`;
      const el = $('#swapStatus');
      if (el) el.textContent = S.swapStatus;
      const r = await api('/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: SWAP_PROMPT + baseTail + colorHint + faceScale + '。真实生活人像摄影：皮肤有真实纹理和细碎发丝，不磨皮不塑料感，非 3D 渲染非插画，柔和自然光有自然阴影，背景照搬参考图1不做更换；无水印、无文字、无 logo',
          images: [ref.aiUrl, garment],
          size: '1024x1536',
          negative_prompt: 'plastic skin, over-saturated, cartoon, AI look, glossy face, deformed hands, flat lay, hanging garment, mannequin, product-only photo, big close-up face, cropped head' + (S.arkCounts.noAccessory ? ', ribbon, bow, brooch, lace trim, bowknot, decorative pin' : '')
        })
      });
      const raw = r.dataUrl || r.url;
      if (!raw) throw new Error('方舟没返回图片');
      const url = await gradePhoto(raw);
      lastUrl = url;
      S.studioAiImages.unshift({ url, label: `换装图（参考图 ${pi + 1}${color ? '·' + color : ''}）` });
      cacheImageNow(url);
      done++;
      if (btn) btn.textContent = `换装中…（${done}/${todo.length}）`;
      renderRoute();
      bindRoute();
    } catch (e) {
      S.swapStatus = `第 ${k + 1} 张失败：${(e.body && e.body.message) || e.message}。已成功 ${done} 张，失败的不扣钱。`;
      renderRoute();
      bindRoute();
      break;
    }
  }
  clearInterval(timer);
  if (btn) btn.disabled = false;
  if (done === todo.length) {
    if (isPreview) {
      S.swapPreviewReady = true;
      S.swapPreviewUrl = lastUrl;
      S.swapStatus = `✅ 预览已出。满意就点「继续生成剩余 ${total - 1} 张」，不满意点「重出预览」`;
      toast('预览已出，看看衣服像不像');
    } else {
      S.swapPreviewReady = true;
      S.swapStatus = `✅ 全部完成，共 ${total} 张，图在下面`;
      toast('换装完成');
    }
  }
  renderRoute();
  bindRoute();
}

async function swapRedo() {
  const old = S.swapPreviewUrl;
  if (old) {
    const idx = S.studioAiImages.findIndex((x) => x.url === old);
    if (idx >= 0) S.studioAiImages.splice(idx, 1);
  }
  S.swapPreviewReady = false;
  S.swapPreviewUrl = '';
  S.swapStatus = '';
  renderRoute();
  bindRoute();
  await swapGenerate();
}

const ARK_PHOTO_LIFE = '真实手机实拍、不是棚拍海报：__LIGHT__；手机后置主摄 __LENS__ 拍摄，有细微胶片颗粒；中景偏半身构图、镜头略微后退，人物和毛衣占画面 60%~75%，头部上方留出空间、不要把脸顶到画面顶部，裤子只露一点，不拍全身不拍鞋；背景是真实生活场景的自然浅景深，近处墙面桌椅窗框绿植能看出形状和材质，远处逐渐柔化，不是糊成一片奶油；皮肤有真实质感：可见细小毛孔和绒毛、轻微肤色不均、眼下和鼻翼有自然阴影，不是磨皮不是塑料；针织纹理清楚：针脚细密平整、罗纹或平针走向清晰可见，表面紧实不蓬松、不是毛呢不是抓绒不是羊羔绒，不起球不脏旧，有自然褶皱和厚度，纽扣质感真实；模特表情自然放松、像朋友随手抓拍的一瞬间，构图略微不完美；头发哑光自然、有碎发和层次；只出现两只手、五指数量正确、手指结构自然；服装颜色、花纹、材质、纽扣、口袋与参考图完全一致；无水印、无文字、无 logo；不要过度磨皮、不要塑料感、不要海报感、不要插画或 3D 渲染感、不要暖橙滤镜';
const ARK_PHOTO_WHITE = '纯白无缝背景棚拍、像正规品牌白底主图：大面积柔光箱均匀打的明亮高调光，光线柔和均匀，没有强烈方向光、没有窗影、没有环境色反射，模特脸上和衣服上没有刺眼高光斑；50mm 人像镜头、全身构图，头顶到脚完整入镜，头顶上方留白约画面高度的八分之一，脚下只有一层极淡柔和投影；背景干净到接近纯白，画面里没有任何道具、家具、植物、装饰和文字；模特漂亮耐看、化自然清透的日常淡妆，皮肤白皙干净但有真实质感：可见轻微毛孔纹理，不是磨皮不是塑料不是水光肌；针织纹理清楚：针脚细密平整、罗纹或平针走向清晰可见，表面紧实不蓬松，不起球不脏旧；模特姿态放松不摆拍、表情自然，构图略微不完美；中性白平衡、低饱和、低对比、加一点胶片颗粒，不要暖黄调不要 HDR；服装颜色必须和参考图一致、不被灯光染偏；无水印、无文字、无 logo；不要过度磨皮、不要海报精修感、不要插画或 3D 渲染感';

// 每个商品随机一位模特（脸型/发型/身高/年纪都不同），同一商品的各颜色仍共用同一张脸
const ARK_IDENTITIES = [
  '23 岁亚洲女生，鹅蛋脸、鼻梁秀气、单眼皮内双，棕黑色中长发微卷、齐眉碎刘海、发梢刚过肩，身高 163cm、身形纤细',
  '25 岁亚洲女生，小圆脸、眼睛偏圆、苹果肌明显，深棕色大波浪长卷发、法式空气刘海、发量蓬松，身高 168cm、身材匀称',
  '22 岁亚洲女生，瓜子脸、眼尾略微上扬、唇形小巧，黑色长直发中分、发尾微内扣，身高 170cm、身形高挑偏瘦',
  '26 岁亚洲女生，脸型偏长、五官立体、鼻头小巧，栗棕色短锁骨发带轻微内扣、八字刘海，身高 165cm、身材苗条',
  '24 岁亚洲女生，脸颊有点婴儿肥、圆圆的眼睛、笑起来有卧蚕，深栗色大波浪及胸长发、侧分刘海，身高 160cm、身形娇小',
  '27 岁亚洲女生，鹅蛋脸、鼻梁高、眼型偏细长，冷棕色顺直长发、中分、几缕碎发，身高 172cm、气质偏成熟',
  '21 岁亚洲女生，小小一张脸、眼睛大而圆、嘴唇饱满，奶茶棕微卷长发、漫画刘海、发梢蓬松，身高 158cm、身形小巧',
  '25 岁亚洲女生，颧骨略高、面部线条清楚、下颌线利落，黑茶色微卷过肩发、偏分，身高 166cm、身形匀称',
  '23 岁亚洲女生，脸型柔和、眼距略宽、眼睛清亮，黑色大波浪长卷发、空气刘海，身高 164cm、身材匀称',
  '28 岁亚洲女生，鹅蛋脸、眼神温婉、唇形薄而清晰，深棕色低盘发、两侧几缕碎发，身高 162cm、气质知性',
  '24 岁亚洲女生，小方脸偏柔、眼尾略下垂、鼻子小巧，黑色长直发低马尾、额前碎发，身高 169cm、身形修长',
  '22 岁亚洲女生，圆润娃娃脸、眼睛略圆、卧蚕自然，浅棕色齐肩微卷发、碎刘海，身高 161cm、身形纤细',
  '29 岁亚洲女生，鹅蛋脸、眼窝稍深、唇色偏浅，深棕色长直发低发髻、鬓角碎发，身高 167cm、气质安静',
  '23 岁亚洲女生，脸型清瘦、颧骨柔和、眼睛内双，黑色及腰长直发半扎、前面留两缕碎发，身高 171cm、身形偏瘦',
  '26 岁亚洲女生，圆脸、鼻头略圆、嘴唇饱满，红棕色大卷发及胸、斜分刘海，身高 165cm、微胖匀称',
  '24 岁亚洲女生，菱形脸偏柔、眼型细长、鼻梁直，焦糖棕色中长微卷发、中分、发尾外翻，身高 164cm、身形匀称',
  '25 岁亚洲女生，鹅蛋脸、皮肤偏白、双眼皮清楚，黑色波波头短发、齐刘海，身高 158cm、身形娇小',
  '22 岁亚洲女生，小圆脸、眼睛圆而亮、卧蚕明显，灰棕色齐肩卷发、碎刘海，身高 162cm、身形纤细',
  '27 岁亚洲女生，脸型偏窄、下巴小巧、眼神清冷，黑色长发中分配珍珠发夹，身高 170cm、身形高挑',
  '24 岁亚洲女生，鹅蛋脸、眼睛圆、卧蚕明显，亚麻棕色齐肩羊毛卷、中分，身高 165cm、身形匀称',
  '22 岁亚洲女生，小圆脸、皮肤偏白、单眼皮，黑色高马尾、额前碎发，身高 163cm、身形纤细',
  '26 岁亚洲女生，窄长脸、鼻梁挺、唇形薄，深棕色低丸子头、鬓角碎发，身高 168cm、气质干净',
  '23 岁亚洲女生，心形脸、下巴尖、眼睛内双，黑色齐耳短发、碎刘海，身高 161cm、身形小巧',
  '25 岁亚洲女生，鹅蛋脸、眼距略窄、鼻头小巧，奶茶色中长直发、八字刘海，身高 167cm、长腿匀称',
  '24 岁亚洲女生，脸型柔和、苹果肌、笑起来有梨涡，深棕色侧编发、发尾微卷，身高 162cm、身形纤细',
  '28 岁亚洲女生，颧骨线条柔和、眼型细长、气质温婉，黑茶色低马尾、中分，身高 166cm、身形修长',
  '21 岁亚洲女生，娃娃脸、眼睛大而圆、唇形饱满，棕黑色双麻花辫、空气刘海，身高 159cm、身形娇小',
  '27 岁亚洲女生，脸型立体、鼻梁直、下颌线清楚，冷棕色及肩外翻卷发、偏分，身高 171cm、身形高瘦',
  '23 岁亚洲女生，鹅蛋脸、眼尾略上扬、卧蚕自然，黑色长直发半扎、留两缕碎发，身高 164cm、匀称',
  '25 岁亚洲女生，小方脸偏柔、鼻子秀气、嘴唇饱满，栗棕色羊毛卷短发、法式刘海，身高 160cm、微胖可爱',
  '26 岁亚洲女生，脸型清瘦、眼窝微深、眼神温柔，深棕色中长微卷发、侧分别在耳后，身高 169cm、身形纤细',
  '22 岁亚洲女生，瓜子脸、双眼皮清楚、皮肤白皙，黑色高颅顶丸子头、碎发修饰脸型，身高 162cm、身形小巧',
  '29 岁亚洲女生，鹅蛋脸、五官舒展、唇色自然，焦糖棕大波浪长发、中分，身高 168cm、气质成熟知性',
  '24 岁亚洲女生，脸型偏圆、眼睛清亮、鼻尖微翘，黑色波波头带内扣、齐眉刘海，身高 161cm、身形匀称',
  '27 岁亚洲女生，菱形脸、眼型细长、锁骨明显，深棕偏黑长直发、低发髻、耳边留碎发，身高 170cm、身形高挑',
  '23 岁亚洲女生，鹅蛋脸、卧蚕明显、笑起来很甜，浅茶色齐胸卷发、空气刘海，身高 165cm、身形苗条'
];

// 灯光和镜头的细微差异，保证不同商品背景与氛围不撞
const ARK_LIGHTS = [
  '从一侧窗户照进来的柔和自然光，阴影柔和过渡自然',
  '白天明亮的漫射自然光，均匀柔和、颜色真实不偏色',
  '清晨侧逆光，发丝有柔和轮廓光，面部有自然补光',
  '午后明亮的侧光，阳光从侧面45度照入，明亮通透不发橘',
  '咖啡馆窗边日光，背景有柔和光斑，主光自然柔和',
  '上午明亮的自然光，偏冷白、干净通透',
  '纱帘柔化后的日光，光线柔和发亮，整体清爽',
  '室内顶灯加窗边日光混合，明亮自然、颜色准确'
];
const ARK_LENSES = ['50mm f/2.0', '85mm f/2.0', '35mm f/2.8', '50mm f/2.8'];
const ARK_WBS = ['真实自然色彩，肤色通透自然', '中性白平衡，颜色准确不偏黄', '轻微偏冷白，干净通透', '自然日光白平衡，肤色通透'];


const ARK_PHOTO_STUDIO = '真实电商商品实拍，不是海报、不是小红书种草图：明亮均匀的柔光，中性白平衡，肤色自然不偏黄不偏橙；背景只有一个颜色、平整干净，没有杂物道具文字和 logo，背景在清晰对焦内不要虚化糊掉；镜头 50mm f/4，人物和衣服都清晰，针织纹理、绒毛、纽扣、走线、口袋边缘都看得清；模特漂亮耐看让人有购买欲，五官清秀、不是流水线网红脸不是整容脸不是 3D 建模脸；化自然清透的日常淡妆——干净底妆、淡淡棕色眼妆、自然眉形、提气色唇色，没有厚重假睫毛不浓艳；皮肤白皙干净但保留真实皮肤质感：可见轻微毛孔纹理、嘴唇有自然唇纹，不磨皮不塑料；表情自然看镜头；中景偏半身构图、镜头略微后退，上衣占画面 60%~78%，头部上方留空间，裤子只露一点，不拍全身不拍鞋；姿势自然放松，肩膀微侧，双手自然不摆拍；服装颜色、花纹、材质、纽扣、口袋与参考图完全一致；无水印、无文字、无 logo；不要暖橙滤镜、不要过度磨皮、不要塑料感、不要插画或 3D 渲染感';

// 无模特（平铺/挂拍/叠拍）的画质收尾语：只讲实物摄影，绝对不提人物、皮肤、头发、手
const ARK_PHOTO_FLAT = '这是卖家自己在室内用手机拍的实物照片，不是商品渲染图、不是3D建模、不是插画、不是广告精修图：白天自然光从一侧窗户照进来，光线有方向和明暗过渡，衣服与台面/地面/衣架之间有真实的接触阴影和柔和投影，背景自然渐暗不发光；针织实物质感可控：一根根纱线的走向、细密绒毛、轻微起球、织纹的厚薄起伏、袖口下摆的自然褶皱都看得见，衣服是摊开放着的、不是熨烫平整的展示样；颜色是日常光线下的真实颜色，允许轻微噪点、轻微曝光不均和一点点色差；背景的木头/棉布/墙面/地板有真实纹理和细小磨损，近处清楚、远处轻微虚化；构图是随手拍的，略微不正、留白不刻意；整体有一点点生活痕迹和不完美；无水印、无文字、无logo；不要棚拍打光、不要强烈高光反射、不要完美干净的纯色背景和CG级干净阴影、不要3D渲染感、不要插画感、不要塑料感、不要人台模特、不要假人躯干';

const ARK_PHOTO = ARK_PHOTO_LIFE;

const SWAP_PROMPT = '参考图1只提供四样东西：姿势动作、构图取景、拍摄角度、背景环境，除此之外参考图1里的一切都不得带进新照片；参考图2是我要卖的衣服实拍，新照片里人物穿的只能是参考图2这件。生成一张全新照片：姿势、动作、手臂和手的位置、身体朝向、构图、镜头角度、背景环境全部照搬参考图1，不重新设计姿势、不更换背景、不换场景；参考图1里出现的任何衣服（包括穿在人身上的、也包括平铺或挂着没有人穿的那件）必须完全丢弃，绝对不要出现在新照片里；如果参考图1里有人脸，保留这个人的五官轮廓、脸型和发型发色，只做轻微调整（眼型、鼻型、嘴型、眉形细微变化，妆容更清淡、皮肤更自然），让新脸和原图不是同一个人但气质相近；如果参考图1里没有人，只是一件衣服的平铺图或挂拍图，必须忽略参考图1里那件衣服本身，改为生成一位25岁左右的年轻亚洲女性模特，在参考图1类似的场景氛围里穿着参考图2这件衣服，站姿自然生活化，露出脸';

/* ===== 生活种草：姿势池 + 场景池（按风格自动匹配，随机不重复） ===== */
const LIFE_POSES = [
  '坐在木桌旁，一只手撑着下巴，另一只手放在桌面上扶着玻璃杯，侧脸看向镜头',
  '坐在沙发上，一只手撑着脸颊，另一只手放在腿上，身体微微侧向镜头',
  '坐在桌边，一只手扶着杯子，另一只手自然搭在桌沿，肩膀放松',
  '侧身靠在沙发背上，一只手搭在扶手上，头微微侧向镜头',
  '坐在椅子上，身体前倾，双手捧着杯子，视线从杯子上抬起看向镜头',
  '坐在沙发上双腿交叠，一只手撑在身后，另一只手放在膝盖上',
  '半躺在沙发上，一只手撑着头，另一只手搭在抱枕上，慵懒看向镜头',
  '跪坐在沙发或地毯上，一只手撑着地面，身体微侧看向镜头',
  '坐在地板上背靠沙发，抱膝，侧脸看向镜头',
  '站在窗边，一只手扶窗框，侧脸看向窗外，上半身占满画面',
  '站在衣柜前，一只手翻柜门，另一只手轻搭衣架，回头看向镜头',
  '对着全身镜举手机自拍，手机挡住半张脸，另一只手自然垂着',
  '靠在墙边，双手抱臂，侧头看向镜头',
  '坐在高脚凳上，双手交叠放在桌面上，身体前倾',
  '坐在桌前，双手捧着纸杯咖啡，身体微微前倾，抬起眼睛看向镜头',
  '抬手把头发别到耳后，脸正对镜头，微微侧头',
  '坐在床边，一只手撑着床沿，另一只手放在腿上，侧脸看向镜头',
  '坐在餐桌旁，一只手托着脸，另一只手用勺子搅动杯子，眼睛看向镜头',
  '坐在咖啡店窗边，手肘撑在桌上，手指轻轻抵着下巴，直视镜头',
  '侧身站着，一只手轻提衣摆展示下摆，脸转向镜头',
  '双手抱着杯子靠近胸口，肩膀放松，看向镜头自然微笑',
  '坐在沙发上抱着抱枕，下巴轻轻搭在抱枕上',
  '转身离开的瞬间回头，只拍肩膀以上到腰部，头发有动态',
  '坐在窗台边，一只手扶窗沿，侧脸看向远处',
  '坐在咖啡店木质吧台前，一只手搭在吧台边缘，另一只手托着拿铁杯，回头看向镜头',
  '蹲在花店门口，一只手轻碰花束，侧脸看向镜头',
  '坐在书店地板上背靠书架，一只手拿着书，抬头看向镜头',
  '站在地铁口手扶栏杆，侧身看向镜头，头发被风吹起',
  '坐在公园长椅上，一只手搭在椅背上，另一只手放在腿上，看向远处再转回镜头',
  '站在复古衣架前，一只手轻摸衣架上的衣服，侧脸看向镜头',
  '坐在地毯上，双腿盘起，一只手撑在身后，身体微倾看向镜头',
  '站在落地窗旁，一只手轻扶窗框，侧脸让光打在脸上',
  '坐在餐桌旁切蛋糕，一只手拿刀，另一只手扶盘，抬头看向镜头',
  '坐在沙发上，一只手搭在沙发靠背上，另一只手自然垂着，慵懒歪头',
  '站在绿植墙前，一只手撩头发，侧身看向镜头',
  '坐在咖啡店角落，手肘撑在小桌上，手托腮，微微嘟嘴看向镜头',
  '坐在楼梯台阶上，一只手搭在膝盖上，另一只手撑在台阶上，看向镜头',
  '站在试衣镜前整理衣领，从镜子里看向镜头',
  '坐在露台栏杆旁，一只手扶栏杆，另一只手举着杯子，看向镜头',
  '坐在床上背靠床头，双腿弯曲，一只手搭在膝盖上，看向镜头',
  '站在便利店冷藏柜前，一只手拿着饮料，回头看向镜头',
  '坐在甜品店窗边，一只手拿着叉子，面前有蛋糕，看向镜头',
  '靠在路灯杆旁，一只手插口袋，侧脸看向镜头',
  '坐在复古皮沙发上，一只手搭在扶手上，另一只手放在腿上，慵懒看向镜头',
  '站在花架前，一只手轻扶花架，侧脸让光打在毛衣上',
  '坐在飘窗上，双腿伸直，一只手撑在身后，看向镜头',
  '站在旋转楼梯上，一只手扶扶手，回头看向镜头',
  '坐在露营椅上，一只手搭在椅背上，另一只手拿杯子，看向镜头',
  '坐在浴缸边缘（干的），一只手搭在浴缸沿，看向镜头',
  '站在阳台晾衣架旁，一只手拿着衣架，侧脸看向镜头',
  '坐在咖啡店窗边，双手捧着杯子放在桌上，微微低头看着杯子再抬眼',
  '站在花店柜台前，一只手轻托一束花，侧身看向镜头',
  '坐在沙发扶手上，一只手扶着靠背，另一只手自然垂着，看向镜头',
  '站在书店书架间，一只手抽出一本书，身体侧转看向镜头',
  '坐在木质台阶上，手肘撑在膝盖上，手托腮看向镜头',
  '靠在落地窗边，一只手轻碰窗帘，侧脸让光落在脸侧',
  '坐在餐椅上，一只手搭在椅背，另一只手放桌面，正脸看向镜头',
  '站在衣柜镜前，一只手整理袖口，从镜中看向镜头',
  '坐在阳光下的飘窗上，一只手撑在窗台，另一只手放在腿上，看向镜头',
  '站在咖啡店门口，一只手推门，回头看向镜头',
  '坐在甜品店窗边，一只手用小叉子切蛋糕，视线看向镜头',
  '站在楼梯转角，一只手扶扶手，身体微侧看向镜头',
  '坐在沙发前的地毯上，双手抱膝，侧脸看向镜头',
  '站在白色墙面前，一只手把头发拨到肩后，脸正对镜头',
  '坐在窗边的矮凳上，一只手搭在膝上，手肘撑着小桌看向镜头',
  '站在阳台栏杆旁，一只手扶着栏杆，另一只手放在口袋，看向远处再回头',
  '坐在化妆镜前，一只手拿着口红，侧脸看向镜头',
  '站在挂满衣服的衣架旁，一只手轻提衣架上的毛衣，脸转向镜头',
  '坐在书店阶梯上，书放在腿上，一只手扶着书页，抬头看向镜头',
  '站在厨房台面前，一只手扶着台面，回身看向镜头',
  '坐在窗边高脚凳上，手里握着一杯热饮，看向镜头',
  '站直半身，双手缩进毛衣袖口里只露出指尖，肩膀放松，微微歪头看向镜头',
  '站立半身，一只手插牛仔裤口袋，另一只手拎小方包，身体微侧看向镜头',
  '对着镜子举手机自拍，手机挡住半张脸，另一只手插在口袋里',
  '坐在车内驾驶座，身体侧向镜头，一只手扶方向盘，另一只手搭在腿上',
  '靠在车门边，一只手拿着手机，侧脸看向镜头',
  '站在机场候机厅，一只手扶行李箱拉杆，另一只手整理围巾，回头看向镜头',
  '站在商场扶梯上，身体侧转回头看向镜头，头发有动态',
  '站在电梯口低头看手机，若有所觉抬头看向镜头',
  '走在街头斑马线上，边走边回头看向镜头，抓拍动态',
  '站在天桥上，一只手扶栏杆，侧脸看向远处再回头',
  '靠在浅色墙边，双手插兜，一条腿微曲，视线看向镜头',
  '蹲在街边台阶上，一只手撑膝盖，另一只手托腮看向镜头',
  '坐在台阶上，一只手拿手机挡在下巴前，看向镜头',
  '站立半身，双手抱臂，肩膀一高一低，冷淡看向镜头',
  '站立半身，一只手轻轻拉领口，展示领型，看向镜头',
  '站立半身，一只手整理袖口，低头看袖口再抬眼',
  '站立半身，双手捧着脸颊，手肘收在胸前，看向镜头',
  '站立半身，一只手举到额前挡阳光，眯眼看向镜头',
  '站立半身，侧身回眸，一只手把头发拨到耳后',
  '坐在咖啡馆高脚凳上，双腿交叠，一只手撑在凳面，另一只手放腿上',
  '坐在餐厅卡座里，一只手托腮，另一只手搭在桌沿，看向镜头',
  '坐在车内副驾驶，系着安全带，身体微侧看向镜头',
  '站在商场女装店的挂衣杆旁，一只手轻扶衣架，另一只手插兜',
  '站在服装店镜子前，一只手整理毛衣下摆，从镜中看向镜头',
  '坐在试衣间外的长凳上，一条腿搭在另一条腿上，看向镜头',
  '坐在地毯上，一只手撑地，另一只手搭在膝盖上，身体侧倾',
  '站立半身，一只手插兜，另一只手拿着手机垂在身侧',
  '站立半身，双手捧着热咖啡杯靠近胸口，微微低头再抬眼',
  '站立半身，一只手拎着购物袋，另一只手拨头发，看向镜头侧面',
  '站在雪景街边，双手插兜，缩着肩膀，看向镜头',
  '站在海边栏杆旁，一只手压住被风吹起的头发，侧脸看向镜头',
  '坐在户外露营椅上，双手捧着马克杯，腿交叠，看向镜头',
  '站在地铁车厢里，一只手扶吊环，另一只手插兜，看向镜头',
  '坐在书店窗台，一条腿垂下，一只手扶窗框，看向镜头',
  '站立半身，一只手背在身后，另一只手轻碰耳环，看向镜头',
  '站立半身，微微仰头看向镜头，嘴唇自然微张',
  '站立半身，低头看手机，头发垂下来遮住一点侧脸',
  '坐在地板上，一条腿伸直一条腿弯曲，一只手撑地看向镜头',
  '站在楼梯上，一只手扶扶手，身体前倾看向镜头',
  '站立半身，一只手拿着帽子垂在身侧，另一只手插兜'
];

// 场景带风格标签，生成时只挑和识别出的风格匹配的。背景要清晰可辨，不要糊掉
const LIFE_SCENES = [
  { t: '韩系咖啡馆内，木质吧台和白色瓷砖墙，大落地窗白天自然光，桌上有纸杯咖啡和一块蛋糕，背景的咖啡机、菜单板、绿植都清晰可辨，整体明亮通透', s: ['韩版', 'ins风', '温柔风', '通勤'] },
  { t: '咖啡馆靠窗座位，木质桌面、拿铁杯和木托盘，窗外街景明亮清楚，明亮的自然光打在桌面和毛衣上', s: ['韩版', '通勤', 'ins风'] },
  { t: '咖啡馆镜子前，镜面里能看到店内的木质柜台、吊灯和瓷砖墙，光线充足明亮，镜边框是深色木质，背景细节清楚', s: ['韩版', 'ins风'] },
  { t: '米色墙面和白色置物架的居家角落，大窗明亮自然光，背景有绿植、杯子和杂物，明亮有生活气息，细节清楚', s: ['慵懒风', '温柔风', 'ins风'] },
  { t: '卧室床边，浅色床品和针织毛毯，晨光明亮柔和，窗有白色纱帘，背景清楚', s: ['日系', '慵懒风', '温柔风'] },
  { t: '窗边卧室，浅色纱帘透光，浅木地板，明亮自然光，窗台有小盆栽，背景清晰', s: ['日系', '温柔风', '法式'] },
  { t: '极简服装店内，一整面浅色墙前立着干净的木质陈列架，挂着少量熨烫整齐的浅色衣服，间距宽松、像精品店陈列，明亮柔和的灯光，地面干净', s: ['复古', '法式', '慵懒风'] },
  { t: '复古咖啡馆，深色木质墙板、黄铜吊灯和皮沙发，大窗日光充足明亮，整体通透，背景清楚', s: ['复古', '法式', '慵懒风'] },
  { t: '校园图书馆靠窗位置，成排书本和木质书架，大窗日光很亮，桌面明亮，背景清楚', s: ['学院风', '复古'] },
  { t: '教学楼走廊，绿树背景，明亮自然光，白墙和木扶手，背景清晰', s: ['学院风', '日系'] },
  { t: '写字楼玻璃幕墙走廊，简洁现代，明亮自然光，远处绿植清楚', s: ['通勤'] },
  { t: '街边绿植墙前，城市街拍，日光柔和，背景有咖啡店招牌清楚可辨', s: ['韩版', 'ins风'] },
  { t: '秋日街景，落叶和街道，白天明亮日光，背景有店铺橱窗清楚', s: ['韩版', '通勤', '法式'] },
  { t: '花店门口，花束和绿植，明亮日光，木质门框，玻璃窗透进日光，背景清楚', s: ['温柔风', '法式', '日系'] },
  { t: '书店靠窗过道，木质书架和明亮阅读区，窗边日光，背景清楚', s: ['学院风', '复古', '温柔风'] },
  { t: '地铁口或斑马线，城市日常背景，明亮自然光，远处行人清楚', s: ['韩版', '通勤'] },
  { t: '白天露台，明亮日光、白色栏杆和绿植，远处城市清楚，画面通透', s: ['ins风', '韩版'] },
  { t: '极简居家角落，白墙、浅木地板、一盆绿植，明亮窗户光，背景清楚', s: ['ins风', '日系'] },
  { t: '沙发旁，米色抱枕和针织毛毯，白天明亮自然光，木质边几上有杯子，窗外日光，背景清楚', s: ['慵懒风', '温柔风'] },
  { t: '明亮的衣帽间里，全身镜前，镜面干净，镜前是浅色木地板和一小盆绿植，柜子里衣服叠放整齐，明亮温暖', s: ['ins风', '韩版'] },
  { t: '全身镜前，镜面反光，房间一角有绿植和木质衣架，明亮温暖，背景清楚', s: ['ins风', '韩版'] },
  { t: '木质餐桌旁，浅色餐具、绿植和纸杯咖啡，日间明亮柔光，背景清楚', s: ['日系', '温柔风'] },
  { t: '落地窗前的地毯上，窗外城市明亮，室内光线明亮，有抱枕，背景清楚', s: ['ins风', '日系', '韩版'] },
  { t: '白天街边咖啡店门口，浅色墙面、木质门窗和绿植，日光充足，背景清楚', s: ['韩版', 'ins风'] },
  { t: '公园长椅，绿树和柔和日光，木质长椅，背景有散步的人清楚', s: ['日系', '学院风', '温柔风'] },
  { t: '甜品店店内，木质桌椅、玻璃柜里的蛋糕，白天明亮的自然光，整体通透，背景清楚', s: ['韩版', 'ins风', '温柔风'] },
  { t: '便利店冷藏柜前，明亮冷白光，货架上饮料清楚，背景清晰', s: ['通勤', 'ins风'] },
  { t: '电梯里对镜自拍，银灰色金属电梯门和干净的大镜子，头顶暖白光均匀明亮，镜面干净没有污渍，背景简洁现代', s: ['ins风', '韩版', '通勤'] },
  { t: '民宿客厅，布艺沙发、原木茶几，大窗户白天日光，明亮通透，背景干净整齐', s: ['慵懒风', '温柔风', 'ins风'] },
  { t: '复古旋转楼梯，木质扶手和铁艺栏杆，白天明亮的自然光，背景清楚', s: ['复古', '法式'] },
  { t: '露营风阳台，折叠椅、小桌、绿植，明亮日光，背景清楚', s: ['ins风', '韩版'] },
  { t: '婚纱店试衣镜前，明亮干净的灯光，镜面反光清楚', s: ['法式', '温柔风'] },
  { t: '艺术展览馆走廊，白墙、木地板、远处画作，明亮柔光，背景清楚', s: ['法式', 'ins风'] },
  { t: '面包店柜台前，玻璃柜里的面包、白天明亮的灯光、木质装修，背景清楚', s: ['韩版', '温柔风'] },
  { t: '旧物市集摊位前，木桌、陶瓷杯、绿植，白天明亮的日光，背景有生活杂物清楚', s: ['复古', '慵懒风'] },
  { t: '瑜伽垫旁的居家角落，浅色地毯、绿植、白天明亮的自然光，背景清楚', s: ['ins风', '温柔风'] },
  { t: '酒店房间窗边，纱帘、大床，白天明亮的自然光，背景清楚', s: ['法式', '温柔风'] },
  { t: '复古理发店等候区，皮椅、绿植、白天明亮的灯光，背景清楚', s: ['复古', 'ins风'] },
  { t: '海边咖啡店露台，白色栏杆、绿植、远处海面明亮，背景清楚', s: ['韩版', 'ins风'] },
  { t: '旧书店二楼，满墙书架、木地板、明亮的阅读灯，背景清楚', s: ['复古', '学院风'] },
  { t: '社区便利店门口，自动门、白天明亮的灯光、货架，背景清楚', s: ['通勤', '日系'] },
  { t: '日式榻榻米房间，草席、障子门，明亮的自然光，背景清楚', s: ['日系', '温柔风'] },
  { t: '画室一角，画架、颜料，明亮的自然光，背景清楚', s: ['法式', 'ins风'] },
  { t: '花店内部，花架上满是鲜花、明亮的自然光、木地板，背景清楚', s: ['温柔风', '法式', '日系'] },
  { t: '咖啡店吧台旁的高脚凳，黄铜灯、木质台面、背景咖啡器具清楚', s: ['韩版', 'ins风', '通勤'] },
  { t: '北欧风客厅，浅色沙发、木质茶几、绿植、大窗日光，背景清楚', s: ['ins风', '日系'] },
  { t: '复古照相馆，浅色背景布、木质道具，明亮的灯光，背景清楚', s: ['复古', '法式'] },
  { t: '韩式甜品咖啡店二楼，白色墙面、木质桌椅、甜品柜，明亮的自然光，背景清楚明亮', s: ['韩版', 'ins风', '温柔风'] },
  { t: '家居店样板间客厅，浅色布艺沙发、木茶几、干花和绿植，明亮日光，背景清楚', s: ['ins风', '慵懒风'] },
  { t: '花艺工作室，成排花桶和木质长桌，自然光从窗进来，背景清楚', s: ['温柔风', '法式', '日系'] },
  { t: '老洋房楼梯间，木质楼梯、白墙、绿植，白天明亮的自然光，背景清楚', s: ['法式', '复古'] },
  { t: '商场女装区试衣间外，浅色墙面和挂衣杆，明亮灯光，背景清楚', s: ['通勤', '韩版'] },
  { t: '早午餐店靠窗卡座，藤编椅、木质桌、窗外街景，明亮日光，背景清楚', s: ['ins风', '韩版', '温柔风'] },
  { t: '学校教室窗边，木质课桌、黑板和窗外绿树，日光明亮，背景清楚', s: ['学院风', '日系'] },
  { t: '咖啡店露台，木质围栏、绿植、藤椅和遮阳伞，明亮日光，背景清楚', s: ['韩版', 'ins风'] },
  { t: '文创市集摊位，木质货架、手作摆件，白天明亮的日光，背景清楚', s: ['ins风', '复古'] },
  { t: '日料店门口，木质推拉门、灯笼，白天明亮，背景清楚', s: ['日系', '温柔风'] },
  { t: '美术馆白墙展厅，画作和柔光射灯，明亮干净，背景清楚', s: ['法式', 'ins风'] },
  { t: '冬日街角面包店，木质门面、白天明亮的橱窗、路边街景，背景清楚', s: ['韩版', '温柔风', '复古'] },
  { t: '阳台花架旁，藤椅、小圆桌、白色花盆和绿植，午后日光，背景清楚', s: ['ins风', '温柔风', '日系'] },
  { t: '私家车内，米色真皮座椅，车窗外是白天明亮的街景，光线充足柔和，背景清楚', s: ['韩版', 'ins风', '温柔风'] },
  { t: '机场候机大厅，落地窗、行李车和远处航班信息屏，白天明亮，背景清楚', s: ['通勤', '韩版', 'ins风'] },
  { t: '地铁车厢内，浅色座椅和扶手，车厢灯光明亮，背景清楚', s: ['通勤', '日系', '韩版'] },
  { t: '商场女装区扶梯旁，浅色墙面、挂衣杆和模特道具，灯光通明，背景清楚', s: ['通勤', '韩版', 'ins风'] },
  { t: '商场中庭栏杆旁，浅色地砖和玻璃护栏，白天灯光明亮通透，背景清楚', s: ['ins风', '韩版', '通勤'] },
  { t: '城市街头斑马线，车流和店铺招牌虚化但仍可辨认，白天阳光明亮', s: ['韩版', 'ins风', '通勤'] },
  { t: '天桥栏杆旁，远处高楼和街道，白天明亮日光，背景清楚', s: ['通勤', '韩版', '法式'] },
  { t: '超市货架间，明亮顶灯，货架商品清楚，背景干净', s: ['日系', '通勤'] },
  { t: '咖啡馆室外座位，藤椅、小圆桌、遮阳伞和街景，午后阳光，背景清楚', s: ['ins风', '韩版', '法式'] },
  { t: '酒店大堂，大理石地面、壁灯和绿植，灯光明亮干净，背景清楚', s: ['法式', '温柔风', 'ins风'] },
  { t: '衣帽间挂衣杆前，木质柜体、整齐挂着的秋冬衣服，明亮的灯光，背景清楚', s: ['慵懒风', '韩版', 'ins风'] },
  { t: '奶油色纯色影棚背景，柔和均匀布光，地面同色，画面干净', s: ['ins风', '韩版', '温柔风'] },
  { t: '浅灰渐变影棚背景，柔光箱布光，干净但有轻微光影层次', s: ['韩版', '通勤', 'ins风'] },
  { t: '卧室地毯上，浅色床品和毛毯，窗外白天明亮的柔光，画面亮堂，背景清楚', s: ['慵懒风', '日系', '温柔风'] },
  { t: '雪后的街边，积雪和亮着的店铺橱窗，冷调明亮，背景清楚', s: ['韩版', '法式', '温柔风'] },
  { t: '海边木栈道，栏杆、沙滩和远处海面，日光充足，背景清楚', s: ['ins风', '韩版', '法式'] },
  { t: '早午餐餐厅窗边，浅色木桌、绿植和餐具，大窗白天日光，明亮通透，背景清楚', s: ['复古', '法式', '慵懒风'] },
  { t: '电梯镜面里能看到楼道灯和人物倒影，灯光明亮干净，背景清楚', s: ['ins风', '通勤', '韩版'] },
  { t: '服装店试衣间外，浅色墙面、挂衣钩和全身镜，灯光明亮，背景清楚', s: ['通勤', '韩版', 'ins风'] },
  { t: '冬日咖啡馆窗边，窗外飘雪，室内明亮通透的灯光和木质桌面，背景清楚', s: ['韩版', '温柔风', '复古'] },
  { t: '奶油风客厅沙发旁，浅色布艺沙发和羊毛毯，大窗日光，背景清楚', s: ['ins风', '慵懒风', '温柔风'] },
  { t: '日式街道便利店门口，自动贩卖机和灯箱，白天明亮，背景清楚', s: ['日系', '韩版'] },
  { t: '花店门口，白色门面、门口摆着鲜花桶和绿植，白天明亮，背景清楚', s: ['温柔风', '韩版', 'ins风'] },
  { t: '阳光露台，白色栏杆、藤编椅和小圆桌，绿植点缀，白天日光充足，背景清楚', s: ['ins风', '法式', '温柔风'] },
  { t: '书店靠窗阅读区，木质书架和落地窗，白天明亮自然光，背景清楚', s: ['通勤', '日系', '温柔风'] },
  { t: '面包房白色操作台前，浅色瓷砖墙和玻璃柜，明亮干净，背景清楚', s: ['韩版', '温柔风', '日系'] },
  { t: '白色楼梯间，浅色台阶和落地窗，白天日光透进来，明亮干净，背景清楚', s: ['ins风', '通勤', '韩版'] },
  { t: '校园林荫道，绿树、长椅和浅色路面，白天阳光透过树叶，背景清楚', s: ['日系', '韩版', '温柔风'] }
];

function shuffleArr(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

function scenesForStyle(style) {
  if (!style) return LIFE_SCENES.map((x) => x.t);
  const hit = LIFE_SCENES.filter((x) => x.s.indexOf(style) >= 0).map((x) => x.t);
  return hit.length >= 5 ? hit : hit.concat(LIFE_SCENES.map((x) => x.t));
}

// 「不带装饰」开关：返回 buildJimengPrompts 用的参数
function arkAccOpts() {
  return S.arkCounts.noAccessory
    ? { simple: true, noAccessory: true, accessory: S.arkCounts.accessoryList || '丝带、蕾丝蝴蝶结等装饰' }
    : null;
}

// 画质收尾语：按「出图风格」选生活种草或白底影棚；开了「不带装饰」时去掉「装饰与原图一致」
function arkPhotoTag(style) {
  const mode = style || S.arkCounts.photoStyle || 'blend';
  const life = mode !== 'studio' && mode !== 'whitebg';
  // 光位保持统一，镜头和白平衡每张略变，避免整批像同一张图复制出来的
  const lens = ARK_LENSES[Math.floor(Math.random() * ARK_LENSES.length)];
  let s = mode === 'flatlay'
    ? ARK_PHOTO_FLAT
    : mode === 'whitebg'
      ? ARK_PHOTO_WHITE
      : life
        ? ARK_PHOTO_LIFE
          .replace('__LIGHT__', arkLightSetup())
          .replace('__LENS__', lens)
        : ARK_PHOTO_STUDIO;
  if (mode === 'blend') {
    s += '；这张图要同时兼顾生活氛围和商品可售质感：衣服是绝对主体，正面或半侧面朝向镜头、版型完整，占画面 65%~80%，针织纹理、绒感、纽扣、走线都清晰可辨；背景生活化但简洁、不杂乱不抢主体；像真实店铺拍的高质量买家秀，不是海报不是精修大片';
  }
  if (S.arkCounts.noAccessory) {
    s = s.replace('服装颜色、花纹、材质、纽扣、口袋与参考图完全一致',
      `服装颜色、花纹、材质、纽扣、口袋与参考图完全一致，但不要生成${S.arkCounts.accessoryList || '丝带、蝴蝶结、胸针等'}，只保留衣服本体`);
  }
  return s;
}

function arkCheckReady() {
  if (!S.studioImage) { toast('先上传一张商品图'); return false; }
  const ai = (S.data && S.data.settings && S.data.settings.ai) || {};
  if (!ai.apiKey) { toast('先去「设置」里填火山方舟的 API Key'); return false; }
  if (!ai.imageModel) { toast('先去「设置」里填生图模型 ID'); return false; }
  return true;
}

function arkBuildJobs() {
  const colors = (S.studioInput.colors || []).filter(Boolean);
  const colorList = colors.length ? colors : ['图片所示颜色'];
  const mainPer = Math.max(1, Math.min(20, Math.round(Number(S.arkCounts.mainPer) || 2)));
  const mode = S.arkCounts.photoStyle || 'auto';
  const accOpts = arkAccOpts() || {};
  const accNote = S.arkCounts.noAccessory ? `。衣服上不要出现${S.arkCounts.accessoryList || '丝带、蕾丝蝴蝶结等装饰'}，只保留衣服本体` : '';
  const jobs = [];
  // 本批次统一风格：auto 模式下随机选「全平铺挂拍」或「全素人模特」，同一个款所有图风格一致
  let batchMode = mode;
  if (mode === 'auto') {
    batchMode = Math.random() < 0.5 ? 'flatlay' : 'lifestyle';
  }
  // 首图构图策略：每款只抽一种，同款各颜色共用；最近几款用过的策略排到后面，避免连着几款都是同一个姿势
  const heroTotal = batchMode === 'flatlay' ? HERO_FLAT.length : (batchMode === 'whitebg' ? WHITE_HERO.length : HERO_MODEL.length);
  const recentHero = Array.isArray(S.arkRecentHero) ? S.arkRecentHero : [];
  let heroType = Math.floor(Math.random() * heroTotal);
  for (let t = 0; t < heroTotal; t++) {
    const cand = (heroType + t) % heroTotal;
    if (recentHero.indexOf(cand) < 0) { heroType = cand; break; }
  }
  S.arkRecentHero = [heroType].concat(recentHero).slice(0, 4);
  // 整批打乱一次：颜色之间、张数之间都不重复；每次点生成都会重新打乱
  const styleKey = (S.studioInput.styles && S.studioInput.styles[0]) || '温柔风';
  const posePool = shuffleArr(LIFE_POSES);
  let scenePool = shuffleArr(scenesForStyle(styleKey));
  // 不同商品之间尽量不撞背景：把上一款用过的场景挪到队尾
  const recent = S.arkRecentScenes || [];
  const fresh = scenePool.filter((x) => recent.indexOf(x.t) < 0);
  const used = scenePool.filter((x) => recent.indexOf(x.t) >= 0);
  scenePool = fresh.concat(used);
  S.arkRecentScenes = scenePool.slice(0, 6).map((x) => x.t);
  let startIdx = 0;
  colorList.forEach((color, colorIdx) => {
    const ci = Object.assign({}, S.studioInput, { colors: [color] });
    const fc = color === '图片所示颜色' ? '' : color;
    for (let i = 0; i < mainPer; i++) {
      const one = buildJimengPrompts(ci, Object.assign({ count: 1, start: startIdx + i, poses: posePool, scenes: scenePool, forceColor: fc, photoStyle: batchMode, antiCompare: !!S.arkCounts.antiCompare, heroShot: i === 0, heroType }, accOpts))[0];
      jobs.push({ color, label: `${color} 主图 ${i + 1}`, prompt: one.prompt + accNote, photoStyle: batchMode });
    }
    startIdx += mainPer;
  });
  if (S.arkCounts.simpleSku) {
    const ci = Object.assign({}, S.studioInput, { colors: [colorList[0]] });
    const p = buildJimengPrompts(ci, { simple: true, accessory: S.arkCounts.simpleNote || '丝带等装饰', count: 1, photoStyle: batchMode })[0].prompt;
    jobs.push({ color: colorList[0], label: '引流图（简配）', prompt: p });
  }
  return jobs;
}

/* 把生成图里的头部裁出来当人脸参考：只传整张图会让模型连第一张的背景和动作一起抄 */
function faceCropUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        const sx = Math.round(W * 0.12);
        const sy = Math.round(H * 0.01);
        const sw = Math.round(W * 0.7);
        const sh = Math.round(H * 0.37);
        const c = document.createElement('canvas');
        c.width = sw;
        c.height = sh;
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(c.toDataURL('image/jpeg', 0.92));
      } catch (_) {
        resolve(url);
      }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

/* 执行一组 jobs。btnId 是要锁定的按钮 id；doneBase 是之前已生成的张数（用于显示进度） */
async function arkRunJobs(jobs, btnId, doneBase) {
  const total = jobs.length;
  if (!total) return 0;
  let phase = '准备中';
  let done = 0;
  const startedAt = Date.now();
  const lockBtn = () => {
    const b = $('#' + btnId);
    if (b) { b.disabled = true; b.textContent = `生成中…（${doneBase + done}/${doneBase + total}）`; }
  };
  toast(`开始生成，共 ${total} 张，别关页面…`);
  const timer = setInterval(() => {
    const t = Math.round((Date.now() - startedAt) / 1000);
    setArkStatus(`${phase}，已等 ${t} 秒，别关页面`);
  }, 1000);
  lockBtn();

  const styleInfo = arkStyleInfo();
  const garment = S.studioImage.aiUrl || S.studioImage.dataUrl;
  // 人脸参考只取头部：整张图当参考，会把第一张的姿势、背景、构图一起抄进后面的图
  const faceRef = S.arkFaceRef ? await faceCropUrl(S.arkFaceRef) : null;
  try {
    for (let i = 0; i < total; i++) {
      const job = jobs[i];
      phase = `正在生成第 ${doneBase + i + 1}/${doneBase + total} 张（${job.label}）`;
      S.arkStatus = phase + '…';
      setArkStatus(S.arkStatus);
      // 主图统一按生活种草/平铺的完整构图出，不再单独出详情图
      // 无模特图绝对不能带模特／人脸／皮肤／手的描述，否则模型会折中成塑料人台
      const isFlat = job.photoStyle === 'flatlay';
      let prompt;
      if (isFlat) {
        // 无模特图：一句话交代颜色就够，任何多余的"必须一致"都会把画面拉回渲染感
        prompt = job.prompt + ((job.color && job.color !== '图片所示颜色')
          ? `。这件衣服是${job.color}，颜色和参考图一致`
          : '。衣服颜色和参考图一致');
      } else {
        prompt = job.prompt + '。' + styleInfo + '。' + arkFaceSpec(job.photoStyle) + '。' + arkPhotoTag(job.photoStyle);
        // 颜色必须和参考图完全一致：颜色偏差是退货最大原因，任何提亮/降温/加暖/加饱和都算错
        if (job.color && job.color !== '图片所示颜色') {
          prompt += `。这一张的衣服颜色是「${job.color}」：参考图里这件衣服的这个颜色，色相、明度、饱和度都要照着还原，整件衣服（含领口、袖口、门襟、口袋）颜色完全一致、干净均匀，不要提亮、不要加暖调、不要偏冷、不要加深、不要出现渐变或色块不均；款式、版型、长度、口袋和口袋上的小装饰、针织纹理都照参考图不变；纽扣保持参考图原样：数量、大小、位置、排列顺序和每一颗的颜色都不变，彩色纽扣按原顺序还原，不能同色化、不能串色、不能增减`;
        } else {
          prompt += '。颜色严格保持参考图的原色和原明度，色相、明度、饱和度一点都不能改，不要提亮、不要加深、不要加暖调或冷调';
        }
        // 环境光最容易把白毛衣染成米黄、把浅粉染成橘——衣服颜色必须是本色
        prompt += '。衣服的颜色不受现场环境影响：即使场景是暖光、夕阳、黄灯或玻璃反光，衣服也要呈现参考图的真实颜色（白就是干净的白、粉就是粉、蓝就是蓝、紫就是紫、黑就是黑），不要被环境光染偏黄、偏橘、偏绿，不要整体加暖调滤镜';
      }
      const body = { prompt, size: '1024x1536', negative_prompt: 'mannequin, headless mannequin, plastic mannequin torso, plastic skin, over-saturated colors, color shift, color cast, overexposed, washed out, changed garment color, beige color cast, warm yellow filter, wool coat texture, fleece texture, teddy fleece, boucle, pilling, bow on pocket, ribbon knot on pocket, embroidery on pocket, extra decorations on pocket, unbuttoned cardigan, open placket, gaping button placket, cartoon, illustration, 3D render, CGI, product render, watermark, text, AI look, glossy face, fake eyelashes, heavy makeup, deformed hands, extra fingers, extra limbs' };
      if (faceRef) {
        body.images = [garment, faceRef];
        prompt += '。参考图1 是服装图，只对照衣服的款式、版型、面料纹理、纽扣和口袋位置；参考图2 只是模特的脸部特写，只参考五官、脸型、发型、发色和妆容，绝对不要参考参考图2 的姿势、动作、构图、背景、光线角度和衣服';
        body.prompt = prompt;
      } else {
        body.imageUrl = garment;
      }
      const r = await api('/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const raw = r.dataUrl || r.url;
      if (!raw) throw new Error('方舟没返回图片');
      let url = await gradePhoto(raw, isFlat);
      if (S.arkCounts.antiCompare) url = await antiShift(url);
      if (!S.arkFaceRef && job.photoStyle === 'lifestyle') S.arkFaceRef = url;
      S.studioAiImages.unshift({ url, label: job.label });
      cacheImageNow(url);
      done += 1;
      S.arkStatus = `已生成 ${doneBase + done}/${doneBase + total} 张…`;
      renderRoute();
      bindRoute();
      lockBtn();
    }
    return { done, ok: true };
  } catch (e) {
    S.arkStatus = `第 ${doneBase + done + 1} 张失败了：${(e.body && e.body.message) || e.message}。已成功 ${doneBase + done} 张，没出来的那张不扣钱。`;
    renderRoute();
    bindRoute();
    return { done, ok: false };
  } finally {
    clearInterval(timer);
  }
}

async function arkPreviewOne() {
  try {
    if (!arkCheckReady()) return;
    toast('准备构建任务…');
    const jobs = arkBuildJobs();
    const total = jobs.length;
    if (!total) { toast('张数都是 0，先选一下'); return; }
    const msg = `先出 1 张预览（${jobs[0].label}），看看人脸和风格对不对。满意了再继续生成剩下的 ${total - 1} 张。这 1 张约 0.1~1 元，从你的方舟余额扣。继续吗？`;
    const ok = await confirm2(msg);
    if (!ok) { toast('已取消'); return; }

    toast('好的，开始生成预览…');
    S.arkPendingJobs = jobs.slice(1);
    S.arkStatus = `正在出预览图…`;
    renderRoute();
    bindRoute();
    const res = await arkRunJobs([jobs[0]], 'arkGenBtn', 0);
    if (res.ok) {
      S.arkStatus = `预览图已出（${jobs[0].label}）。满意就点「继续生成剩余 ${S.arkPendingJobs.length} 张」，不满意就「丢掉预览，重新出」。`;
      renderRoute();
      bindRoute();
      toast('✅ 预览图已出');
    } else {
      // 预览失败：清空待生成队列和人脸参考，让用户重新出
      S.arkPendingJobs = null;
      S.arkFaceRef = null;
      renderRoute();
      bindRoute();
    }
  } catch (e) {
    console.error('arkPreviewOne error:', e);
    toast('生成出错了：' + ((e.body && e.body.message) || e.message));
  }
}

async function arkContinueRest() {
  try {
    if (!arkCheckReady()) return;
    const jobs = S.arkPendingJobs;
    if (!jobs || !jobs.length) { toast('没有待生成的图，先点「先生成 1 张预览」'); return; }
    const total = jobs.length;
    const low = (total * 0.1).toFixed(1);
    const doneBase = S.studioAiImages.length;
    const msg = `继续生成剩下的 ${total} 张，约 ${low}~${total} 元，从你的方舟余额扣。之前的预览图会保留，继续往后加。继续吗？`;
    const ok = await confirm2(msg);
    if (!ok) { toast('已取消'); return; }

    toast('好的，开始批量生成…');
    S.arkStatus = `继续生成剩余 ${total} 张…`;
    renderRoute();
    bindRoute();
    const res = await arkRunJobs(jobs, 'arkContinueBtn', doneBase);
    if (res.ok) {
      S.arkPendingJobs = null;
      S.arkStatus = `完成：本次共生成 ${doneBase + total} 张。点图片看大图，点「下载」保存。`;
      renderRoute();
      bindRoute();
      toast('✅ 全部生成完成');
    } else {
      // 中途失败：把已成功的从 pending 里去掉，剩下的留着让用户重试
      S.arkPendingJobs = jobs.slice(res.done);
      renderRoute();
      bindRoute();
    }
  } catch (e) {
    console.error('arkContinueRest error:', e);
    toast('生成出错了：' + ((e.body && e.body.message) || e.message));
  }
}

function arkRestartPreview() {
  S.studioAiImages = [];
  S.arkFaceRef = null;
  S.arkPendingJobs = null;
  // 重新出预览时换一位模特和一套灯光，避免每次都是同一张脸同一个模子
  S.arkIdentity = null;
  S.arkLight = null;
  S.arkStatus = '';
  renderRoute();
  bindRoute();
}

async function arkCheckBalance() {
  const ai = (S.data && S.data.settings && S.data.settings.ai) || {};
  const box = $('#arkBalanceBox');
  const btn = $('#arkBalanceBtn');
  if (btn) { btn.disabled = true; btn.textContent = '查询中…'; }
  if (box) { box.style.display = 'block'; box.style.background = '#fff7e6'; box.style.borderColor = '#ffd591'; box.textContent = '正在查余额…'; }
  try {
    const r = await api('/api/ai/balance', { method: 'POST', body: '{}' });
    if (!r.ok) {
      if (box) { box.style.background = '#fff1f0'; box.style.borderColor = '#ffa39e'; box.textContent = '查不了：' + (r.message || r.error) + '。没填 AK/SK 的话去「设置」里填一下。'; }
    } else {
      const lines = [];
      if (r.available !== '' && r.available != null) lines.push('可用余额：<b>¥' + r.available + '</b>');
      if (r.cash !== '' && r.cash != null) lines.push('现金余额：¥' + r.cash);
      if (r.frozen !== '' && r.frozen != null) lines.push('冻结金额：¥' + r.frozen);
      if (!lines.length && r.raw) {
        // 把原始字段里看起来像金额的列出来
        for (const k in r.raw) {
          const v = r.raw[k];
          if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) lines.push(k + '：¥' + v);
        }
      }
      if (box) {
        box.style.background = '#f6ffed';
        box.style.borderColor = '#b7eb8f';
        box.innerHTML = lines.length ? lines.join('<br>') : ('查询成功，但返回内容看不懂。原始数据：' + JSON.stringify(r.raw).slice(0, 200));
      }
    }
  } catch (e) {
    if (box) { box.style.background = '#fff1f0'; box.style.borderColor = '#ffa39e'; box.textContent = '查询失败：' + ((e.body && e.body.message) || e.message); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '查余额'; }
  }
}

/* 给 AI 用的压缩图：最长边不超过 max，返回 dataURL */
function shrinkDataUrl(img, max) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, max / Math.max(w, h));
  if (scale >= 1) return null;
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

function toAiJpeg(img, max) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}

function setAiStatus(text) {
  const el = $('#aiStatus');
  if (el) el.textContent = text;
}

function setArkStatus(text) {
  const el = $('#arkStatus');
  if (el) el.textContent = text;
}

function aiModelPrompt(kit, input) {
  // 兼容旧调用，返回第一个提示词
  return buildJimengPrompts(input)[0].prompt;
}

// 首图构图策略池（每款随机抽一种，同款各颜色共用，不同款轮换，避免全店一个姿势）
const HERO_MODEL = [
  '七分身取景（头顶到大腿中部），模特身体侧向约 40°、肩膀斜对镜头，头转回来看向镜头，能看到衣服的侧面轮廓和大部分正面，毛衣下摆贴到画面下边缘',
  '七分身取景（头顶到大腿中部），模特正朝镜头方向自然走动抓拍，身体略侧、手臂自然摆动、衣摆有轻微动态，像路人随手拍下的一瞬间',
  '七分身取景（头顶到大腿中部），模特低头看着衣服下摆，手指轻轻捏住下摆一角，脸露出三分之二侧脸、视线不看镜头，像在整理衣服',
  '七分身取景（头顶到大腿中部），模特双手插在衣服两侧口袋里，肩膀略微倾斜、身体相对镜头偏转 15°~20°，姿态放松自然，毛衣占画面一半以上',
  '七分身取景（头顶到大腿中部），模特侧后方约 45° 站位、身体转回一半，回头看向镜头，画面里同时能看到衣服的背面和一侧前襟（能看到这一侧的口袋）',
  '七分身取景（头顶到大腿中部），模特站在镜子前对镜自拍，手机举在胸前、身体略侧不是正对镜子，镜子里清楚看到衣服正面',
  '七分身取景（头顶到大腿中部），模特坐在窗台、床沿或椅子边，背自然挺直、一只手搭在腿上，身体略侧，毛衣下摆接近画面下边缘',
  '七分身取景（头顶到大腿中部），模特靠墙站立、一只手插在口袋里，肩膀放松，镜头略低带一点仰拍，墙面一起入镜',
  '七分身取景（头顶到大腿中部），模特站在门口或门洞里，身体半侧、回头看了一眼镜头，门框把画面自然切成两半',
  '高角度俯拍七分身自拍，手机举得比脸高、视线向上看屏幕，头发自然垂落，毛衣占画面一半以上',
  '七分身取景（头顶到大腿中部），模特一只手轻轻捏住一侧衣摆，另一只手自然下垂，视线看向画面外侧而不是镜头',
  '七分身取景（头顶到大腿中部），模特坐在咖啡店里，一只手搭在桌面上、杯子出现在前景，身体略侧、视线看向窗外',
  '七分身取景（头顶到大腿中部），模特一只手把头发拨到耳后或撩起一侧头发，视线略微向下不直视镜头，头部自然偏转',
  '七分身取景（头顶到大腿中部），模特手里拿着咖啡杯或一本书，身体侧站、视线看向手里的道具而不是镜头，像被抓拍的生活瞬间',
  '七分身取景（头顶到大腿中部），模特正面略侧站立、重心落在一条腿上，肩膀一高一低很放松，毛衣下摆一侧轻微出画',
  '七分身取景（头顶到大腿中部），模特侧身四分之三面对镜头，低头浅笑，一只肩膀略向前，像朋友随手拍的一张'
];
const HERO_FLAT = [
  '衣服在画面里斜向 45° 摆放、整体偏左，右侧留出一排道具和桌面空白，不是居中平铺',
  '衣服挂在木质衣架上、悬在窗前被自然光照亮，画面偏右放置，衣架和窗框一起入镜，不是平铺',
  '一只手捏着木质衣架把毛衣提在半空，衣服自然垂下、下摆被手指压出自然褶皱，手臂和手背从画面一侧入镜，衣服没有被完全展平',
  '一只手从下方托住衣摆把毛衣半提起来，衣服形成自然的堆叠和褶皱，只露出手指和手腕，领口、门襟、纽扣和口袋全部清楚可见',
  '衣服搭在椅背上、两只袖子自然垂落，画面偏左，椅子和地板纹理一起入镜，不是平铺',
  '衣服平铺但一只袖子折起、下摆折起一角，露出内里纹理，摆放角度不是正的，像随手摊开的样子',
  '主件衣服叠放在另一件衣物或毯子上，主件完整展示、轮廓清楚，构图偏右，不是单件居中平铺',
  '衣架挂拍，一只手同时扶住衣架肩部、把衣服一侧拉开展示袖子，袖子和衣身形成前后层次，不是完全展平的挂拍',
  '衣服平铺，一只手按住一侧肩膀，另一只手把另一侧下摆轻轻掀起一角露出内里，衣服主体和口袋仍然完整可见',
  '衣服挂拍或平铺，画面一侧有窗框、门框或枝叶入镜，把背景切得不规整，衣服完整不被压住',
  '衣服用衣架挂在门把手或墙上的挂钩上，背后是白墙或木门，构图偏一侧，画面留出大片墙面空白，不是平铺',
  '衣服摊在床铺或被子上，布料和被子之间的褶皱自然起伏，俯拍角度略斜、不是正俯视',
  '衣服平铺在木地板或地毯上俯拍，画面里有木纹、地板缝或地毯纹理，构图偏一侧',
  '衣架挂在窗帘旁的挂钩上逆光拍摄，衣服边缘有柔和的逆光轮廓，背景窗帘虚化，不是平铺',
  '衣服叠好放在快递袋或纸箱旁边，像发货前随手拍的一张，衣服在画面里偏左、包装占右下角',
  '两件同色系不同深浅的衣服叠放在一起、错开露出一角，构图偏一侧，主件完整清楚',
  '衣服铺在浅色石台面或木质台阶上，衣服的柔软质感和背景纹理形成对比，画面不是居中',
  '衣服挂在户外树枝或晾衣绳上，背景是虚化的绿植和天空，风吹得下摆略微扬起',
  '衣服旁边放一把软尺或一张手写便签做尺寸参考，衣服平铺但摆放角度偏斜，不是标准商品图',
  '衣服搭在楼梯扶手上，两只袖子向下垂落，楼梯的斜线和扶手一起入镜'
];
// 纯白棚拍首图策略：没有道具、没有场景，只靠站位和机位制造差异（对标大牌白底主图）
const WHITE_HERO = [
  '全身构图，模特站在画面偏左三分之一处，右侧留出大片纯白空白',
  '全身构图，模特站在画面偏右三分之一处，左侧留出大片纯白空白',
  '全身构图，机位略低（大约膝盖高度）轻微仰拍，模特显得修长',
  '全身构图，机位略高轻微俯拍，脚尖靠近画面下边缘，上方留白多',
  '全身构图，模特侧身四分之三面对镜头、重心落在一条腿上，一只手抬起整理头发',
  '全身构图，模特一只手臂向上抬起、另一只手自然下垂，身体略微扭转，像在伸展',
  '从膝盖以上取景的半全身构图，画面顶部留白多，衣服占画面比例更大',
  '全身构图，模特正面站立、双手自然下垂但肩膀一高一低，姿态放松不摆拍'
];

// 根据标签生成即梦 AI 专用提示词（图生图，以上传的服装图为参考）
function buildJimengPrompts(input, opts) {
  const colors = (input.colors && input.colors.length) ? input.colors.join('、') : '图片所示颜色';
  const category = input.category || '毛衣';
  const materials = (input.materials && input.materials.length) ? input.materials.join('、') : '';
  const crafts = (input.crafts && input.crafts.length) ? input.crafts.join('、') : '';
  const neck = input.neck || '';
  const fit = input.fit || '';
  const styles = (input.styles && input.styles.length) ? input.styles.join('、') : '';
  const weight = input.weight || '';
  const season = input.season || '';

  // 服装描述（各版本共用）
  let garment = `${colors}的${category}`;
  const desc = [];
  if (materials) desc.push(`材质为${materials}`);
  if (crafts) desc.push(`${crafts}工艺`);
  if (neck) desc.push(`${neck}设计`);
  if (fit) desc.push(`${fit}版型`);
  if (weight) desc.push(weight);
  if (season) desc.push(`${season}款`);
  if (desc.length) garment += '，' + desc.join('，');
  if (styles) garment += `，${styles}风格`;

  // 核心约束：严格参考上传的服装图（简配版会去掉指定装饰）
  const accessory = (opts && opts.simple) ? (opts.accessory || '丝带等装饰') : '';
  const forceColor = (opts && opts.forceColor) || '';
  const colorFix = forceColor
    ? `；这张图的颜色必须是${forceColor}，色相、明度、饱和度都按参考图里这个颜色还原，不许提亮、不许偏冷、不许偏暖；款式、版型、长度、门襟、口袋、纽扣和纹理必须100%照参考图，不能因为改颜色就改款`
    : '；颜色、明度、饱和度必须和参考图完全一致，不许提亮、不许偏色';
  const buttonFix = '；纽扣必须和参考图完全一致：数量、大小、间距、位置、排列顺序都不变，参考图是彩色纽扣的（例如黄、蓝、粉、绿依次排列），要按原顺序保留每一种颜色，不能全部做成同色、不能串色、不能增减纽扣、不能换位置；如果这件是带纽扣的开衫，纽扣必须全部整齐扣好、门襟平整闭合，不许敞开门襟、不许只扣上面几颗、不许撑开缝隙露出内搭或皮肤（除非参考图本身就是敞开穿的）'
  const pocketFix = '；口袋只存在于衣服正面的两侧，绝对不能画到背面、肩部、袖子背面或侧面；从背面拍时，背面必须是干净的、没有口袋也没有门襟和纽扣（除非参考图背面本来就有口袋）；不管什么角度，口袋的数量和左右位置都不变；口袋必须是平整的纯色贴袋：参考图口袋里没有的东西一律不许加，不要给口袋加蝴蝶结、丝带结、系带、刺绣、贴花、小挂件、小别针、小标签或任何装饰，参考图口袋上有的才保留';
  const knit = /针织|毛衣|开衫|腈纶|聚酯|涤纶|锦纶|羊毛|羊绒|棉/.test(String(materials) + String(category) + String(crafts));
  const fabricFix = knit
    ? '；这是针织类毛衣，面料质感必须完全照参考图还原：参考图是带细密绒毛的软糯针织，就要保留同样的细密绒毛和柔和绒光；参考图是平整针织，就保持平整针织。纹理粗细、绒感长短、表面光泽都和参考图一致，不要把带绒的做成死板平针，也不要把平针的加上绒；织法纹理也必须和参考图完全一致：坑条的有无、宽窄、间距、方向、密度都和参考图相同，参考图是平针就是平针、是坑条就是同样的坑条，不要自己换成别的织法纹理；绝对不要做成毛呢、羊毛呢、抓绒、羊羔绒、泰迪绒、颗粒绒那种粗厚蓬松的毛呢外套质感，也不要做成棉服/羽绒/摇粒绒的质感'
    : '';
  const whiteFix = /白/.test(String(forceColor))
    ? '；这件是白色系，必须是接近纯白的极浅白：不能偏米色、不能偏燕麦色、不能偏卡其、不能偏驼色、不能偏黄，最亮处要接近纯白，整件颜色干净一致'
    : '';
  const detailFix = '；参考图可能是同一款衣服多个颜色的拼图，请把每一块都当成同一件衣服，取其中看得最清楚的那一块对照细节：衣服长度和整体轮廓不变；门襟、领口、袖口、下摆的样式不变；两个口袋的位置、大小、形状和口袋边缘的细节不变；口袋上原本就有的小别针、小挂件、小标签、小刺绣原样保留，原本没有的就绝对不许添加任何装饰；针织纹理和绒感不变。只允许更换穿着的人、姿势和背景';
  const constraint = accessory
    ? `严格参考上传的服装图片，保持服装的版型、材质纹理和主体设计100%一致${colorFix}${whiteFix}${fabricFix}${buttonFix}${pocketFix}${detailFix}，但衣服上不要出现${accessory}，只保留衣服本体，不要任何附加挂饰；只改变穿着的人和场景`
    : `严格参考上传的服装图片，保持服装的花纹、图案、材质纹理、纽扣、装饰等所有细节100%一致，不得更改服装的款式和设计${colorFix}${whiteFix}${fabricFix}${buttonFix}${pocketFix}${detailFix}；只改变穿着的人和场景`;

  // 画质约束：核心是具体相机 + 真实光线 + 胶片颗粒，去 AI 味
  const photoMode = (opts && opts.photoStyle) || S.arkCounts.photoStyle || 'auto';
  const useLife = true;
  const CAMERA = 'photorealistic, shot on Canon EOS R5, 85mm f/1.8 prime lens, soft natural daylight, neutral white balance, shallow depth of field, subtle film grain, fine texture detail';
  const NEG = 'no plastic skin, no over-saturated colors, no cartoon, no illustration, no 3D render, no watermark, no text, no AI look, no glossy face, no heavy makeup, no fake eyelashes, no dark skin, no african features, no wool coat texture, no fleece texture, no teddy fleece, no boucle, no beige color cast, no warm yellow filter, no airbrushed skin, no beauty filter, no HDR look, no overexposed face, no face in shadow, no dim lighting, no muddy grey background, no bow on pocket, no ribbon knot on pocket, no extra decorations on pocket, no unbuttoned cardigan, no open placket, no gaping button placket, no different knit structure, no changed rib texture, no decorative bow on props';
  const quality = `${CAMERA}; 自然光下的真实随手拍，画面明亮通透、曝光充足，但保留真实的明暗层次：不要过曝死白、不要整片均匀亮到像渲染图，背景和人物身上有自然的光影过渡和柔和的暗部；人物脸部必须有光、曝光准确、清晰明亮，眼睛里有自然的眼神光，脸不能发暗、不能陷在阴影里、不能半张脸黑掉；衣服本身曝光准确，纹理看得清；白平衡中性，不要整体偏黄偏橙的暖调滤镜，也不要冷白到发蓝；人物和衣服清晰对焦，背景保留可辨识的真实细节、自然浅景深，不一片死糊；整体质感像拼多多和淘宝上销量几万的毛衣爆款主图——真实相机拍的原图，不是AI精修图、不是海报大片；面料纹理真实清晰：针脚、绒感和表面光泽完全照参考图还原，纹理看得清、不糊成一团；${NEG}`;

  // 防比价：让主图/商品图在构图结构上与常见同款图不同，平台的同款识别置信度会降下来
  // 参考实测：换角度 + 商品被遮挡约 1/3 + 换个背景结构，主图防比价率可到 95%
  const ANTI_STRUCT = [
    '构图故意不居中：衣服主体偏画面左侧三分之一，右侧留出环境空白，领口、门襟和口袋清楚可见',
    '构图偏画面右侧，左侧有家具或道具自然入镜，领口、门襟和口袋清楚可见',
    '手持拍摄的轻微倾斜构图，画面水平线不是完全水平，领口、门襟和口袋清楚可见',
    '略高角度俯拍，背景里有桌面边缘或地板线条打破画面平衡，下摆贴到画面下边缘',
    '略低角度仰拍，前景有桌面或椅背出现在画面下方边缘，领口和口袋清楚可见',
    '前景有绿色枝叶或干花出现在画面一侧，主体偏左，衣服和两个口袋都清楚可见',
    '前景有一只手或一只咖啡杯出现在画面边缘，价格牌也不入镜，衣服本体和口袋不被遮挡',
    '画面边缘有窗框或门框入镜，把背景切得不规整，衣服主体清楚',
    '衣服只占画面一半，另一侧是明显的环境细节（书架/床头/桌面）',
    '竖构图对角线取景，身体在画面里略斜，不是标准居中商品图',
    '画面下方三分之一被前景物体（桌子边缘、窗台或栏杆）切过，衣服主体、门襟和口袋仍在画面内',
    '镜头贴得很近，衣服离画面很近、带一点轻微透视变形，像走过时随手按的一张',
    '画面里有镜面、玻璃柜或水面的反射，衣服主体和背景一起出现两层影像，构图偏一侧',
    '画面里另外还有一件无关衣物或包包的局部出现在角落，抢走一部分视觉重心，主商品完整清楚'
  ];
  const antiOn = opts && opts.antiCompare;
  const antiClause = (idx) => {
    if (!antiOn || idx == null) return '';
    const s = ANTI_STRUCT[idx % ANTI_STRUCT.length];
    return `；这张图的构图要与常见同款商品图明显不同：${s}。不要正面居中的标准商品图，构图和背景都不能和参考图或常见同款图重复`;
  };
  // 链接第 1 张主图：从策略池抽一种，同款各颜色共用同一种，不同款换着来
  const heroOn = !!(opts && opts.heroShot && opts.antiCompare);
  const heroPool = photoMode === 'whitebg' ? WHITE_HERO : (photoMode === 'flatlay' ? HERO_FLAT : HERO_MODEL);
  const heroIdx = (opts && opts.heroType != null) ? Number(opts.heroType) : Math.floor(Math.random() * heroPool.length);
  const heroClause = heroOn
    ? (photoMode === 'whitebg'
      ? `；这张是链接第 1 张主图：${heroPool[heroIdx % heroPool.length]}。衣服的领口、门襟、纽扣、口袋和口袋上的小装饰必须清楚可见，不能因为构图丢失细节；背景必须保持纯白干净`
      : `；这张是链接第 1 张主图：${heroPool[heroIdx % heroPool.length]}。衣服的领口、门襟、纽扣、口袋和口袋上的小装饰必须清楚可见，不能因为这个姿势而丢失细节；衣服下摆可以贴到画面下边缘或一侧轻微出画，但上半身的领口、门襟和口袋不许裁切或遮挡；靠机位高度、背景和陈设的不同来制造差异`)
    : '';

  const base = (model, scene, antiIdx) => {
    return `场景和动作必须是这里描述的这一处：${scene}。${model}，穿着${garment}。${quality}。${constraint}。背景、房间、墙面、家具都要按上面这段重新布置，不要复制参考图里的背景和环境，不要沿用参考图的构图${antiClause(antiIdx)}${heroClause}。`;
  };

  // 生活种草场景：暖调、有生活气息，姿势自然抓拍（对标小红书爆款图）
  const style0 = (input.styles && input.styles[0]) || '温柔风';
  const STYLE_SCENE = {
    慵懒风: ['淡妆，表情放松慵懒', '居家客厅，米色墙面和白色置物架，白天明亮的自然光，倚着柜子侧身站着，一只手轻抬到胸前，慵懒自然'],
    韩版: ['清爽气质，淡妆', '韩系咖啡店室内，木质桌面和明亮的窗边自然光，坐姿半身，侧脸看向窗外，自然抓拍'],
    日系: ['自然感淡妆，表情平静', '日系清新卧室，浅色纱帘和木地板，晨光明亮柔和，站在窗边侧身，手里拿着咖啡杯'],
    复古: ['复古淡妆，唇色自然', '复古室内，木质家具与明亮的自然光，胶片质感，身体侧转回头看向镜头'],
    法式: ['气质优雅，淡妆', '法式复古卧室，雕花墙面与窗边柔光，靠墙侧身站立，姿态松弛优雅'],
    学院风: ['青春感淡妆', '校园图书馆或宿舍，书架背景虚化，明亮自然光，抱着一本书侧身站着'],
    通勤: ['干练气质，淡妆', '写字楼走廊或咖啡店外景，简洁背景，自然日光，手提托特包侧身行走抓拍'],
    ins风: ['干净气质，淡妆', '极简居家角落，白色置物架和绿植，柔和自然光，靠墙侧身站立，构图留白干净'],
    温柔风: ['温柔气质，淡妆', '窗边居家场景，米色墙面和白色置物架，白天明亮的自然光，身体侧转四分之三背对镜头，一手轻扶架子，温柔自然']
  };
  const st = STYLE_SCENE[style0] || STYLE_SCENE['温柔风'];

  const count = Math.max(1, Number(opts && opts.count) || 2);
  // 姿势/场景/拍法/配饰/表情各自打乱，整批轮换不重样；每次生成都换一批
  const posePool = (opts && opts.poses) || shuffleArr(LIFE_POSES);
  const scenePool = (opts && opts.scenes) || shuffleArr(scenesForStyle(style0));
  const start = Number(opts && opts.start) || 0;
  // 拼多多/小红书爆款常见的拍法：统一七分身（头顶到大腿中部）、下摆贴近画面下边缘——实测这种取景防比价成功还拿到了新品标
  const SHOT_TYPES = [
    '七分身近景，从头顶取到大腿中部，毛衣下摆在画面下边缘附近、一侧衣角可以轻微出画，毛衣占画面 60%~75%',
    '坐姿七分身，镜头略高于视平线，从头顶取到大腿中部，毛衣下摆接近画面下边缘，毛衣占画面 60%~75%',
    '站立七分身，镜头平视胸口高度，从头顶取到大腿中部，毛衣占画面 60%~75%，下摆一侧可以轻微出画',
    '对镜自拍七分身构图，手机出现在画面一角，从头顶取到大腿中部，毛衣占画面 55%~70%',
    '侧身回眸七分身，肩膀转向镜头，从头顶取到大腿中部，毛衣下摆贴到画面下边缘，毛衣占画面 55%~70%',
    '略微俯拍七分身，头在上方、衣摆在画面下边缘附近，毛衣占画面 60%~75%',
    '略微仰拍七分身，从头顶取到大腿中部偏上，毛衣占画面 60%~75%',
    '半身偏近构图，从头顶取到腰胯之间，毛衣占画面 65%~80%，下摆在画面下边缘出画一点',
    '七分身，身体略侧 20°，从头顶取到大腿中部，毛衣占画面 60%~75%'
  ];
  const ACC_POOL = [
    '不戴项链，脖颈干净',
    '一条细金项链搭在领口',
    '一条珍珠项链',
    '一对小圆耳环',
    '一顶贝雷帽',
    '一条羊毛围巾搭在肩上',
    '一个斜挎小包',
    '一枚素圈戒指'
  ];
  const EXPR_POOL = [
    '看镜头自然微笑',
    '侧脸看向镜头，嘴唇微张',
    '低头浅笑再抬眼',
    '不看镜头，看向侧前方',
    '表情放松，嘴角轻微上扬'
  ];
  const shotPool = shuffleArr(SHOT_TYPES);
  const accPool = shuffleArr(ACC_POOL);
  const exprPool = shuffleArr(EXPR_POOL);
  // 脸型池：以当下主流审美为主（瓜子脸优先），每张图换一种脸型，防比价的同时避免全店一张脸
  const FACE_POOL = [
    '瓜子脸、下颌线柔和、眼睛清澈',
    '鹅蛋脸、五官比例舒服、气质温婉',
    '小圆脸、苹果肌饱满、笑起来亲和',
    '心形脸、额头饱满、下巴小巧',
    '小方脸、下颌线干净、气质清冷',
    '菱形脸、颧骨柔和、眼神有灵气',
    '鹅蛋脸、眼尾微垂、初恋脸感觉',
    '瓜子脸、鼻梁秀挺、长相干净'
  ];
  const facePool = shuffleArr(FACE_POOL);

  const lifeVariants = [];
  for (let i = 0; i < count; i++) {
    const pose = posePool[(start + i) % posePool.length];
    const scene = scenePool[(start + i) % scenePool.length];
    const shot = shotPool[(start + i) % shotPool.length];
    const acc = accPool[(start + i) % accPool.length];
    const expr = exprPool[(start + i) % exprPool.length];
    lifeVariants.push({
      name: `生活种草图 ${i + 1}（${style0}）`,
      prompt: base(
        `一位年轻漂亮的东亚女生（中国女生面孔），长得好看、第一眼就让人想点开：${facePool[(start + i) % facePool.length]}，不是流水线网红脸不是整容脸；皮肤白皙干净有真实皮肤质感（能看到轻微毛孔纹理、不磨皮成塑料），化自然清透的日常淡妆——干净的底妆、淡淡的棕色眼妆、自然的眉毛和提气色的唇色，不浓艳、不夸张、没有厚重假睫毛；头发是打理过的柔顺深色系（自然黑或深棕）微卷长发或自然直发，有光泽但真实、带一点碎发和自然的毛流感；${st[0]}`,
        `${shot}，${pose}，${scene}，${acc}，${expr}，裤子只露出一点，不要全身、不要拍到鞋子。背景必须是真实存在的实景，不是虚化背景板也不是假布景，并且背景要干净精致、有美感——像精心布置过的咖啡馆或好看的室内空间，物件摆放有秩序感、不杂乱不邋遢，不要出租屋感、不要像乱糟糟的家，背景里的物件有真实的阴影和反光，不要那种一眼假的干净棚景`,
        start + i
      )
    });
  }

  // 电商主图：干净背景 + 自然站姿，背景颜色和姿势都随机轮换，避免整批一个样
  const STUDIO_BGS = [
    '浅灰色无缝摄影背景，干净平整，有极细的墙面纹理',
    '米白色摄影背景，干净通透',
    '奶油白色摄影背景，柔和干净',
    '浅蓝灰色摄影背景，冷静干净',
    '浅粉色摄影背景，柔和干净',
    '浅卡其色摄影背景，温暖干净',
    '窗边白墙，白天明亮自然光，墙面干净',
    '极简展厅白墙，干净明亮，无任何装饰',
    '浅灰色水泥肌理墙，哑光干净，光线均匀',
    '暖白色摄影背景，干净柔和',
    '浅木色墙板前，整洁明亮，自然光',
    '白色纱帘前的窗边，柔光透进来，背景干净',
    '浅豆绿色摄影背景，干净柔和',
    '浅杏色摄影背景，干净柔和',
  ];
  const STUDIO_POSES = [
    '站立半身，肩膀微侧、重心落在一条腿上，一只手轻搭在腰间',
    '站立半身，双手自然垂在身侧，身体微微侧转',
    '站立半身，一只手插口袋，另一只手自然垂下',
    '坐姿半身，坐在简洁的白色方凳上，双手交叠放在腿上',
    '站立半身，一只手轻拉衣摆展示下摆',
    '站立半身，一只手整理领口，展示领型',
    '坐姿半身，坐在白色方凳上，身体微微前倾',
    '站立半身，侧身四分之三面对镜头，一只手轻扶口袋'
  ];
  const bgPool = shuffleArr(STUDIO_BGS);
  const stPosePool = shuffleArr(STUDIO_POSES);
  const studioVariants = Array.from({ length: Math.max(2, count) }, (_, i) => ({
    name: `电商主图 ${i + 1}`,
    prompt: base(
      `一位年轻漂亮的亚洲女生模特，${facePool[(start + i) % facePool.length]}，五官清秀耐看、让人有购买欲，不是流水线网红脸不是整容脸；化自然清透的日常淡妆——干净底妆、淡淡棕色眼妆、提气色唇色，不浓艳没有厚重假睫毛；皮肤白皙干净但有真实皮肤质感（轻微毛孔纹理、不磨皮成塑料），深色系柔顺头发、有碎发和毛流感`,
      `${stPosePool[(start + i) % stPosePool.length]}，${bgPool[(start + i) % bgPool.length]}，半身构图，上衣占画面 60%~78%，裤子只露一点，不要拍全身、不要拍到鞋子`
    )
  }));

  /* ===== 无模特商品图（平铺/挂拍/叠拍/人台）—— 拼多多爆款最常用，天然无 AI 味 ===== */
  const FLATLAY_SCENES = [
    { t: '平铺·木地板', d: '衣服平铺在浅原木地板上，旁边随意放一杯咖啡和一本杂志，自然光从窗边斜照进来，有柔和阴影，俯拍 45 度' },
    { t: '平铺·大理石', d: '衣服平铺在白色大理石纹台面上，旁边放一副墨镜和一小束干花，干净明亮的自然光，俯拍' },
    { t: '平铺·棉麻布', d: '衣服平铺在浅米色棉麻背景布上，画面干净只有布面纹理，柔和的室内自然光，俯拍 45 度' },
    { t: '平铺·地毯', d: '衣服平铺在浅灰色短绒地毯上，旁边放一双帆布鞋和一顶棒球帽，自然光，俯拍' },
    { t: '挂拍·白墙', d: '衣服挂在简约木质衣架上，背景是干净的白色墙面，柔和的侧光，正面平视拍摄' },
    { t: '挂拍·百叶窗', d: '衣服挂在衣架上，背景是白色百叶窗，阳光透过百叶窗投下条纹光影，正面拍摄' },
    { t: '挂拍·绿植', d: '衣服挂在衣架上，背景是一面浅色墙，旁边有一盆龟背竹绿植，自然光，正面平视' },
    { t: '叠拍·多色', d: '同款不同色的几件毛衣整齐叠放在一起，展示所有颜色，浅木色背景，俯拍' },
    { t: '叠拍·单款', d: '一件毛衣整齐叠放，旁边放着同色的围巾和手套，浅灰色背景，自然光，俯拍 45 度' },
    { t: '挂拍·卧室门后', d: '衣服用木质衣架挂在卧室木门后的挂钩上，旁边有半截窗帘和一小片木地板，室内白天的自然光，平视略微侧拍' },
    { t: '椅子搭放', d: '衣服随意搭在一把简约的木质餐椅靠背上，背景是干净的室内墙面，自然光，平视拍摄' },
    { t: '床边平铺', d: '衣服平铺在铺着白色床单的床上，旁边放一杯水和一本打开的书，清晨柔和自然光，俯拍 45 度' }
  ];
  const flatPool = shuffleArr(FLATLAY_SCENES);
  const flatConstraint = accessory
    ? `严格参考上传的服装图片，保持服装的版型、材质纹理和主体设计100%一致${colorFix}${buttonFix}${detailFix}，但衣服上不要出现${accessory}，只保留衣服本体`
    : `严格参考上传的服装图片，保持服装的花纹、图案、材质纹理、纽扣、装饰等所有细节100%一致，不得更改服装的款式和设计${colorFix}${buttonFix}${detailFix}；道具严格按描述原样出现，不要给道具或衣服额外加蝴蝶结、丝带、珍珠、贴标等装饰`;
  const flatQuality = '真实手机实拍质感：室内窗边自然光，光线有方向和柔和的明暗过渡，衣服下方有真实的接触阴影和投影，背景自然渐暗不发白；布料和针织的纹理、绒毛、织纹厚薄、细小起球、自然褶皱都清晰可见，不是熨烫平整的展示样；轻微噪点、轻微曝光不均、轻微色差，像卖家随手拍的一张实物图；背景材质（木头、棉布、墙面、地板）有真实纹理和细小磨损，近处清楚、远处轻微虚化；无水印无文字无logo；不是棚拍广告图、不是商品渲染图、不是3D建模、不是插画，不要塑料光泽、不要完美干净的纯色背景和CG级均匀阴影、不要锐化描边、不要人台假人';
  const FLAT_ANTI = [
    '衣服不平铺居中，而是斜放在画面里、构图偏左，右侧留一排道具，衣服完整入镜',
    '镜头略高俯拍，背景里有桌面边缘或地板纹理打破画面平衡，衣服完整不被裁切',
    '前景有一片枝叶、一条围巾或一只杯子出现在画面边缘，不压住衣服和口袋',
    '衣服旁边叠放其他衣物作为环境元素，主件衣服完整展示',
    '构图偏右，左侧是明显的桌面/地板/床沿环境细节，衣服完整'
  ];
  // 无模特图的关键：提示词必须短、必须具体到「瑕疵」。一长串"必须100%一致"会把模型推回干净的商品渲染感
  const flatShortConstraint = `衣服的款式、版型、长度、颜色、纽扣数量和每颗纽扣的颜色顺序、两个口袋的位置都和参考图一致${accessory ? `，但不要${accessory}，只保留衣服本体` : ''}`;
  const flatVariants = Array.from({ length: Math.max(2, count) }, (_, i) => {
    const sc = flatPool[(start + i) % flatPool.length];
    const antiFlat = antiOn ? `。${FLAT_ANTI[i % FLAT_ANTI.length]}` : '';
    const heroFlat = (opts && opts.heroShot && opts.antiCompare)
      ? `。${HERO_FLAT[heroIdx % HERO_FLAT.length]}`
      : '';
    // 首图策略若描述里有「手」，允许只露出手/手腕，其余张数仍然绝对不出现人体
    const heroHand = (opts && opts.heroShot && opts.antiCompare && /手/.test(HERO_FLAT[heroIdx % HERO_FLAT.length]));
    const bodyRule = heroHand
      ? '画面里只有一只手伸进画面轻轻扶着衣服，不出现脸和身体，没有假人模特'
      : '画面里没有人、没有手、没有假人模特、没有人台';
    return {
      name: `商品图·${sc.t}`,
      prompt: `手机后置主摄拍的一张实物照片，不是AI图不是渲染图：${sc.d}，白天窗边自然光从一侧斜照进来，光线偏硬有方向，地上有边缘清楚的窗影和衣服的硬投影，画面轻微过曝、有轻微噪点和暗角，水平线略歪、构图不居中；一件${garment}，随手摊开着、不是熨烫好的展示样：衣服有自然褶皱和厚度起伏，下摆有一角微微卷起，口袋边缘有一点点起皱，绒毛和纱线走向一根根看得清，衣身沾着两三根细小毛絮和一点灰尘；${flatShortConstraint}；背景有真实使用痕迹——木纹、细小划痕、一点灰，道具也有一点使用感和反光，远处轻微虚化；${bodyRule}${antiFlat}${heroFlat}。`
    };
  });

  /* ===== 纯白棚拍：对标大牌白底主图，去 AI 味的核心是「脸真实 + 背景干净到没有信息 + 低饱和低对比」 ===== */
  const WHITE_POSES = [
    '全身站立，双手自然垂在身侧，肩膀放松、不摆拍',
    '全身站立，一只手轻搭在腰侧，另一只手自然垂下',
    '全身站立，一只手臂向上抬起、另一只手自然下垂，身体略微扭转，像在伸展',
    '全身站立，侧身四分之三面对镜头、重心落在一条腿上',
    '全身站立，一只手整理头发或耳侧，视线看向镜头',
    '全身站立，双手插在上衣或裤子口袋里，肩线自然下沉'
  ];
  const realFaceText = '一位年轻漂亮的东亚女生（中国女生面孔），长得好看但不是流水线网红脸：五官清秀耐看、脸型自然、皮肤白皙干净但有真实皮肤质感（轻微毛孔纹理、不磨皮成塑料），化自然清透的日常淡妆——干净底妆、淡淡棕色眼妆、自然眉形、提气色的唇色，不浓艳没有厚重假睫毛；头发是打理过的柔顺棕色系微卷长发或自然直发，有光泽带一点碎发';
  const whiteVariants = Array.from({ length: Math.max(2, count) }, (_, i) => ({
    name: `纯白棚拍 ${i + 1}`,
    prompt: `纯白色无缝摄影棚背景：没有任何道具、家具、植物、装饰或文字，背景干净到接近纯白，地面上只有一层极淡、非常柔和的投影。${realFaceText}，穿着${garment}；${WHITE_POSES[i % WHITE_POSES.length]}，全身构图，头顶上方留白约画面高度的八分之一，头顶到脚完整入镜，脚上穿简单的白色或裸色平底鞋。画面整体是大面积柔光箱的均匀高调光：明亮、柔和、没有强烈方向光、没有窗影、没有环境色反射，模特脸上和衣服上没有刺眼的高光斑。photorealistic, shot on Canon EOS R5, 50mm f/2.8, large softbox high-key lighting, neutral white balance, low contrast, low saturation, subtle film grain, not airbrushed；调色像手机直出：低饱和、低对比、不加滤镜、不做 HDR、不做暖黄调；皮肤保留真实毛孔和细纹；衣服颜色必须和参考图完全一致，不受灯光影响；${NEG}。${constraint}${antiClause(start + i)}${heroClause}。`,
    isWhite: true
  }));

  const useFlat = photoMode === 'flatlay';
  let variants;
  if (useFlat) {
    variants = flatVariants.slice(0, count);
  } else if (photoMode === 'whitebg') {
    variants = whiteVariants.slice(0, count);
  } else {
    variants = useLife ? lifeVariants : studioVariants.slice(0, count);
  }

  return variants;
}

// 即梦「图生视频」提示词（拼多多主图小视频，5~10 秒，1:1）
function buildJimengVideoPrompts(input) {
  const colors = (input.colors && input.colors.length) ? input.colors.join('、') : '图片所示颜色';
  const category = input.category || '毛衣';
  const materials = (input.materials && input.materials.length) ? input.materials.join('、') : '';
  const crafts = (input.crafts && input.crafts.length) ? input.crafts.join('、') : '';
  const neck = input.neck || '';
  const fit = input.fit || '';
  const styles = (input.styles && input.styles.length) ? input.styles.join('、') : '';
  const weight = input.weight || '';
  const season = input.season || '';

  let garment = `${colors}的${category}`;
  const desc = [];
  if (materials) desc.push(`材质为${materials}`);
  if (crafts) desc.push(`${crafts}工艺`);
  if (neck) desc.push(`${neck}设计`);
  if (fit) desc.push(`${fit}版型`);
  if (weight) desc.push(weight);
  if (season) desc.push(`${season}款`);
  if (desc.length) garment += '，' + desc.join('，');
  if (styles) garment += `，${styles}风格`;

  const constraint = '严格参考上传的服装图片，保持服装的花纹、图案、颜色深浅、材质纹理、纽扣和装饰等所有细节与原图100%一致，不得改变服装的款式和设计；只让模特动作和镜头运动，衣服本身不变形不闪烁';
  const quality = '真实摄影质感，24帧每秒，画面稳定不抖动，光影自然有真实阴影，高清细节，无水印无文字无logo，不要卡通不要插画，电商主图视频质感';
  const base = (model, action, camera, extra) => `${model}，穿着${garment}。${constraint}。${action}。${camera}${extra ? '。' + extra : ''}。${quality}。`;

  return [
    {
      name: '影棚正面展示（5秒 · 1:1）',
      prompt: base(
        '一位25岁左右的亚洲女性模特，五官自然，淡妆，长直发，表情温和微笑',
        '模特正面站立，双手自然下垂，先轻微侧身再回正看向镜头，动作缓慢自然',
        '镜头固定中景，约腰以上半身，浅灰色渐变背景，柔和均匀布光'
      )
    }
  ];
}


async function saveToLibrary() {
  if (!S.studioImage || !S.studioKit) return;
  try {
    let url = S.studioImage.assetUrl;
    if (!url) {
      const r = await api('/api/asset', { method: 'POST', body: JSON.stringify({ dataUrl: S.studioImage.dataUrl }) });
      url = r.url;
      S.studioImage.assetUrl = url;
    }
    // 保存全部：原图、火山模特图、即梦提示词、属性、SKU、标题、卖点等
    const jmOpts = Object.assign({ photoStyle: S.arkCounts.photoStyle || 'blend', count: 4, seed: 0 }, arkAccOpts() || {});
    const jmVariants = buildJimengPrompts(S.studioInput, jmOpts).map((v) => ({ name: v.name, prompt: v.prompt }));
    S.data.materials.unshift({
      id: uid(),
      name: S.studioInput.category + ' · ' + (S.studioInput.colors || []).join('/'),
      imageUrl: url,
      input: Object.assign({}, S.studioInput),
      kit: S.studioKit,
      aiImages: (S.studioAiImages || []).map((x) => ({ url: x.url, label: x.label })),
      jimengPrompts: jmVariants,
      createdAt: Date.now()
    });
    S.data.materials = S.data.materials.slice(0, 500);
    persist();
    toast('已存入素材库（含模特图、提示词、SKU 等全部素材）');
  } catch (_) {
    toast('保存失败，检查网络');
  }
}

/* ================= 批量下载（打包 zip） ================= */
function zipCrc32(buf) {
  if (!zipCrc32.table) {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    zipCrc32.table = t;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = zipCrc32.table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(files) {
  const te = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  files.forEach((f) => {
    const nameBytes = te.encode(f.name);
    const data = f.bytes;
    const crc = zipCrc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, dosTime, true);
    dv.setUint16(12, dosDate, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    chunks.push(local, data);
    const c = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(c.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, dosTime, true);
    cdv.setUint16(14, dosDate, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, data.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true);
    c.set(nameBytes, 46);
    central.push(c);
    offset += local.length + data.length;
  });
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const edv = new DataView(end.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, cdSize, true);
  edv.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}

/* ===== 图片本地缓存：方舟图片链接 24 小时后会失效，生成时就存一份到浏览器 ===== */
const IMG_DB = 'knit-img';
function imgDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IMG_DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('imgs')) r.result.createObjectStore('imgs'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function imgCacheGet(url) {
  return imgDb().then((db) => new Promise((res) => {
    const t = db.transaction('imgs').objectStore('imgs').get(url);
    t.onsuccess = () => res(t.result || null);
    t.onerror = () => res(null);
  })).catch(() => null);
}
function imgCachePut(url, blob) {
  return imgDb().then((db) => new Promise((res) => {
    const t = db.transaction('imgs', 'readwrite').objectStore('imgs').put(blob, url);
    t.onsuccess = () => res(true);
    t.onerror = () => res(false);
  })).catch(() => false);
}
// 生成完马上缓存，之后下载不再依赖方舟链接
function cacheImageNow(url) {
  if (!url) return;
  imgCacheGet(url).then((c) => {
    if (c) return;
    fetch(url).then((resp) => {
      if (!resp.ok) return;
      const type = resp.headers.get('content-type') || '';
      if (!/^image\//.test(type)) return;
      return resp.blob().then((b) => imgCachePut(url, b));
    }).catch(() => {});
  });
}
async function fetchImageBlob(url) {
  const cached = await imgCacheGet(url);
  if (cached) return cached;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('这张图的方舟链接已失效（方舟图片只保留 24 小时），重新生成一下这张就行');
  const type = resp.headers.get('content-type') || '';
  const blob = await resp.blob();
  if (!/^image\//.test(type) || blob.size < 20000) {
    throw new Error('这张图的方舟链接已失效（方舟图片只保留 24 小时），重新生成一下这张就行');
  }
  imgCachePut(url, blob);
  return blob;
}

async function downloadOne(url, name) {
  try {
    const blob = await fetchImageBlob(url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (name || '图片').replace(/[\\/:*?"<>|]/g, '_') + '.jpg';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 30000);
  } catch (e) {
    toast(e.message || '下载失败，长按图片可保存');
  }
}

function bindOneDownloads() {
  $$('.dlOne').forEach((el) => {
    el.onclick = (e) => {
      e.preventDefault();
      downloadOne(el.dataset.url, el.dataset.name);
    };
  });
}

async function downloadAsZip(items, zipName) {
  if (!items || !items.length) return;
  const toastMsg = toast;
  toastMsg(`正在打包 ${items.length} 张图片…`);
  try {
    const files = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let buf;
      try {
        const blob = await fetchImageBlob(it.url);
        buf = new Uint8Array(await blob.arrayBuffer());
      } catch (e) {
        throw new Error(`第 ${i + 1} 张（${it.label || '未命名'}）：${e.message}`);
      }
      const safe = (it.label || ('图片' + (i + 1))).replace(/[\\/:*?"<>|]/g, '_');
      files.push({ name: `${String(i + 1).padStart(2, '0')}_${safe}.jpg`, bytes: buf });
    }
    const blob = makeZip(files);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = zipName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 30000);
    toastMsg(`已打包 ${items.length} 张，下载 1 个 zip 文件即可`);
  } catch (e) {
    toast('打包失败：' + (e.message || e));
  }
}



function filteredMaterials(materials, keyword) {
  const k = (keyword || '').trim().toLowerCase();
  if (!k) return materials;
  return materials.filter((m) => {
    const i = m.input || {};
    const hay = [
      m.name,
      i.category,
      (i.colors || []).join(' '),
      (i.styles || []).join(' '),
      (i.materials || []).join(' '),
      i.neck, i.fit, i.weight, i.season,
      (i.extra || ''),
      (i.scene || []).join(' ')
    ].join(' ').toLowerCase();
    return hay.includes(k);
  });
}

function renderMaterialDetail(m) {
  if (!m) return '<div class="tbl-empty">素材不存在</div>';
  const i = m.input || {};
  const k = m.kit || {};
  const tags = [i.category, (i.materials || []).join('、'), i.neck, i.fit, (i.styles || []).join('、'), i.weight, i.season, (i.colors || []).join('、')].filter(Boolean).join(' · ');
  const aiImgs = m.aiImages || [];
  const jm = m.jimengPrompts || [];
  const titles = (k.titles || []).map((t) => t.text).filter(Boolean);
  const skus = k.skus || [];
  return `
    <div style="font-size:13px;color:var(--ink-2);line-height:1.8">
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">${esc(m.name)}</div>
      <div style="color:var(--ink-3);font-size:12px;margin-bottom:12px">${new Date(m.createdAt).toLocaleString('zh-CN')}</div>
      <div style="background:var(--surface-2);padding:8px 12px;border-radius:8px;margin-bottom:14px">${esc(tags)}</div>
      ${aiImgs.length ? `
        <div style="font-weight:600;margin:12px 0 8px">火山模特图（${aiImgs.length} 张）</div>
        <div class="canvas-grid">${aiImgs.map((a) => `
          <div class="canvas-card">
            <a href="${a.url}" target="_blank" rel="noopener"><img src="${a.url}" alt="${esc(a.label)}"></a>
            <div class="cc-foot"><span>${esc(a.label)}</span><span style="margin-left:auto"><a class="btn sm dlOne" href="${a.url}" data-url="${a.url}" data-name="${esc(a.label)}">下载</a></span></div>
          </div>`).join('')}</div>
        <div style="margin-top:8px"><a class="btn sm" id="libDlAll">全部下载（${aiImgs.length} 张）</a></div>
      ` : '<div style="color:var(--ink-3);font-size:12px;margin-bottom:12px">（保存时没有火山模特图）</div>'}
      ${titles.length ? `
        <div style="font-weight:600;margin:16px 0 8px">标题</div>
        <div style="display:flex;flex-direction:column;gap:6px">${titles.map((t) => `<div style="background:var(--surface-2);padding:8px 12px;border-radius:8px;font-size:13px">${esc(t)}</div>`).join('')}</div>
      ` : ''}
      ${skus.length ? `
        <div style="font-weight:600;margin:16px 0 8px">SKU 规格</div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>颜色</th><th>尺码</th><th>拼多多规格名</th><th class="num">价格</th><th class="num">库存</th></tr></thead><tbody>${skus.map((s) => `<tr><td>${esc(s.spec1)}</td><td>${esc(s.spec2)}</td><td>${esc(s.pddName)}</td><td class="num">${s.price}</td><td class="num">${s.stock}</td></tr>`).join('')}</tbody></table></div>
      ` : ''}
      ${jm.length ? `
        <div style="font-weight:600;margin:16px 0 8px">即梦提示词（${jm.length} 组）</div>
        <div style="display:flex;flex-direction:column;gap:8px">${jm.map((p) => `
          <div style="background:var(--surface-2);padding:10px 12px;border-radius:8px">
            <div style="font-size:12px;color:var(--ink-3);margin-bottom:4px">${esc(p.name)}</div>
            <div style="font-size:12px;color:var(--ink-2);line-height:1.6;word-break:break-all">${esc(p.prompt)}</div>
          </div>`).join('')}</div>
      ` : ''}
      <div style="margin-top:16px">
        <button class="btn sm" id="libDel">删除这条素材</button>
      </div>
    </div>`;
}

function viewSettings() {
  const d = S.data;
  return `
    <div class="page-head"><div><h2>设置</h2><p>数据、备份、使用说明 · 当前版本 v${APP_VER}</p></div></div>
    <div class="stack">
      <div class="card">
        <div class="card-head"><h3>数据同步</h3><span class="sub">手机与电脑共用同一份数据</span></div>
        <div class="card-body">
          <div class="seg-row"><div class="sk">同步状态</div><div id="syncStateText">${S.syncState === 'ok' ? '已同步到云端' : '未同步'}</div><span class="pill ${S.syncState === 'ok' ? 'good' : 'warn'}">${S.syncState === 'ok' ? '正常' : '注意'}</span></div>
          <div class="seg-row"><div class="sk">最近更新</div><div>${d.updatedAt ? new Date(d.updatedAt).toLocaleString('zh-CN') : '—'}</div></div>
          <div class="row" style="margin-top:14px">
            <a class="btn" href="/api/backup" download>下载备份（JSON）</a>
            <button class="btn" id="importBtn">从备份恢复</button>
            <input type="file" id="importFile" accept="application/json" hidden>
          </div>
          <p style="font-size:12px;color:var(--ink-3);margin-top:12px">建议每周下载一次备份。服务器重建后，用备份文件可以完整恢复店铺、商品、每日数据和素材库。</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>AI 生图配置</h3><span class="sub">自动识别属性 + 手动生成模特图</span></div>
        <div class="card-body">
          <div class="seg-row"><div class="sk">服务平台</div>
            <select id="aiProvider">
              <option value="volc" ${(S.data.settings.ai.provider||'volc')==='volc'?'selected':''}>火山方舟（豆包识图 + Seedream 出图）</option>
              <option value="custom" ${(S.data.settings.ai.provider)==='custom'?'selected':''}>自定义（OpenAI 兼容接口）</option>
            </select>
          </div>
          <div class="seg-row"><div class="sk">API Key（密钥）</div>
            <input id="aiApiKey" type="password" style="flex:1" placeholder="粘贴火山方舟的 API Key" value="${esc(S.data.settings.ai.apiKey||'')}">
          </div>
          <div class="seg-row"><div class="sk">接口地址（Base URL）</div>
            <input id="aiBaseUrl" type="text" style="flex:1" value="${esc(S.data.settings.ai.baseUrl||'')}">
          </div>
          <div class="seg-row"><div class="sk">识别模型（豆包视觉）</div>
            <input id="aiVisionModel" type="text" style="flex:1" placeholder="填豆包视觉模型 ID" value="${esc(S.data.settings.ai.visionModel||'')}">
          </div>
          <p style="font-size:12px;color:var(--ink-3);margin-top:4px">只用于识别材质、领型、版型、风格，约 0.001 元一张（基本可以忽略）。上传图片后自动跑，不用你点。</p>
          <div class="seg-row" style="margin-top:10px"><div class="sk">生图模型（Seedream）</div>
            <input id="aiImageModel" type="text" style="flex:1" placeholder="填 Seedream 生图模型 ID" value="${esc(S.data.settings.ai.imageModel||'')}">
          </div>
          <p style="font-size:12px;color:var(--ink-3);margin-top:4px">只用于「生成模特图」，一张约 0.1~1 元。必须你手动点按钮才会生成，不会自动扣钱。</p>
          <div class="seg-row" style="margin-top:10px"><div class="sk">Access Key ID</div>
            <input id="aiAkId" type="text" style="flex:1" placeholder="火山引擎 AK ID（可选，仅用于查余额）" value="${esc(S.data.settings.ai.accessKeyId||'')}">
          </div>
          <div class="seg-row"><div class="sk">Secret Access Key</div>
            <input id="aiAkSecret" type="password" style="flex:1" placeholder="火山引擎 SK（可选，仅用于查余额）" value="${esc(S.data.settings.ai.secretAccessKey||'')}">
          </div>
          <p style="font-size:12px;color:var(--ink-3);margin-top:4px">填了这两个才能在工具里查方舟余额。只填 API Key 查不了余额（方舟没开放这个接口）。AK/SK 在火山引擎控制台「访问控制 - API 访问密钥」里创建，只存在你自己浏览器里。</p>
          <div class="seg-row" style="margin-top:10px"><div class="sk">图生图参考</div>
            <label style="display:flex;align-items:center;gap:6px"><input id="aiImg2img" type="checkbox" ${S.data.settings.ai.img2img!==false?'checked':''}> 上传实拍图作为生成参考（更像你的衣服）</label>
          </div>
          <div class="row" style="margin-top:14px">
            <button class="btn primary" id="aiSaveBtn">保存配置</button>
            <button class="btn" id="aiTestBtn">测试连接</button>
          </div>
          <p style="font-size:12px;color:var(--ink-3);margin-top:12px">模型 ID 在火山方舟控制台「开通管理」里复制，形如 doubao-seedream-4-5-xxxx。填完先点「测试连接」，显示能用再回素材工坊生成，避免白扣钱。不填 Key 也能用：素材工坊里手动选标签，即梦提示词照样自动生成，拿去即梦免费出图。<br>方舟余额用完就去控制台充值，工具本身不代收任何费用。</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>账号</h3></div>
        <div class="card-body">
          <div class="row"><button class="btn" id="logoutBtn2">退出登录</button>
          <span style="font-size:12px;color:var(--ink-3)">口令暂不支持在线修改，如需重置请联系管理员清空服务器 data 目录。</span></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>数据来源说明</h3></div>
        <div class="card-body" style="font-size:13px;color:var(--ink-2);line-height:1.9">
          <div><b>当前版本</b>：手动录入 + 导入，零封店风险。每日数据从商家后台「数据中心」抄录，30 秒录完一家店。</div>
          <div><b>为什么不做自动抓取</b>：插件抓取违反平台协议，有封店风险，且后台一改版就失效，不适合作为长期依赖。</div>
          <div><b>以后可以接</b>：拼多多开放平台的订单/物流/商品接口，需要企业资质与应用审核；届时看板可以直接自动出数。</div>
          <div><b>素材生成</b>：按毛衣类目的关键词规则生成，不联网、不上传你的图到第三方；生成结果按平台规则做过字数控制。</div>
          <div><b>AI 模特图</b>：两条路都保留。免费路线 = 复制即梦提示词去即梦 AI 网页版出图；花钱路线 = 在素材工坊手动点「用火山方舟生成」，一张约 0.1~1 元，从方舟余额扣，不点不扣。上传图片后的材质识别约 0.001 元一张，自动跑。</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>素材库</h3><span class="sub">共 ${d.materials.length} 条</span></div>
        <div class="card-body">
          <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
            <input type="text" id="libSearchInput" placeholder="搜索：品类 / 颜色 / 风格 / 材质…" value="${esc(S.libSearch)}" style="flex:1;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;background:var(--bg)">
            ${S.libViewId ? `<button class="btn sm" id="libBack">返回列表</button>` : ''}
          </div>
          ${S.libViewId ? renderMaterialDetail(d.materials.find((m) => m.id === S.libViewId)) : (d.materials.length ? `<div class="canvas-grid">${filteredMaterials(d.materials, S.libSearch).map((m) => `
            <div class="canvas-card" data-mat-id="${m.id}" style="cursor:pointer">
              <img src="${m.imageUrl}" alt="${esc(m.name)}">
              <div class="cc-foot"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}</span>${m.aiImages && m.aiImages.length ? `<span style="color:var(--brand);font-size:11px;margin-left:6px">${m.aiImages.length}图</span>` : ''}</div>
            </div>`).join('')}</div>${filteredMaterials(d.materials, S.libSearch).length === 0 && S.libSearch ? `<div class="tbl-empty">没有匹配「${esc(S.libSearch)}」的素材</div>` : ''}` : `<div class="tbl-empty">素材工坊里点「保存到素材库」后，会出现在这里</div>`)}
        </div>
      </div>
    </div>`;
}

function bindSettings() {
  const importBtn = $('#importBtn');
  if (importBtn) importBtn.onclick = () => $('#importFile').click();
  const importFile = $('#importFile');
  if (importFile) {
    importFile.onchange = async () => {
      const f = importFile.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const parsed = JSON.parse(text);
        if (!parsed.shops) throw new Error('bad');
        S.data.shops = parsed.shops || [];
        S.data.products = parsed.products || [];
        S.data.daily = parsed.daily || [];
        S.data.materials = parsed.materials || [];
        S.rev = parsed.rev || S.rev;
        persist();
        renderRoute();
        toast('备份已恢复，正在同步');
      } catch (_) {
        toast('备份文件格式不对');
      }
    };
  }
  const logout = $('#logoutBtn2');
  if (logout) logout.onclick = doLogout;

  // 素材库：搜索
  const libSearchInput = $('#libSearchInput');
  if (libSearchInput) {
    libSearchInput.oninput = (e) => {
      S.libSearch = e.target.value;
      S.libViewId = null;
      renderRoute();
      bindSettings();
      // 重新聚焦搜索框并把光标放到末尾
      const inp = $('#libSearchInput');
      if (inp) { inp.focus(); const v = inp.value; inp.value = ''; inp.value = v; }
    };
  }
  // 素材库：点击素材查看详情
  $$('[data-mat-id]').forEach((el) => {
    el.onclick = () => {
      S.libViewId = el.dataset.matId;
      renderRoute();
      bindSettings();
    };
  });
  // 素材库：返回列表
  const libBack = $('#libBack');
  if (libBack) libBack.onclick = () => { S.libViewId = null; renderRoute(); bindSettings(); };
  // 素材库：批量下载
  const libDlAll = $('#libDlAll');
  if (libDlAll) libDlAll.onclick = () => {
    const m = S.data.materials.find((x) => x.id === S.libViewId);
    const imgs = (m && m.aiImages) || [];
    if (!imgs.length) return;
    downloadAsZip(imgs, `${(m.name || '素材').replace(/[\\/:*?"<>|]/g, '_')}.zip`);
  };
  // 素材库：删除
  const libDel = $('#libDel');
  if (libDel) libDel.onclick = () => {
    if (!confirm('确定删除这条素材？此操作不可恢复。')) return;
    S.data.materials = S.data.materials.filter((x) => x.id !== S.libViewId);
    S.libViewId = null;
    persist();
    renderRoute();
    bindSettings();
    toast('已删除');
  };

  const aiSave = $('#aiSaveBtn');
  if (aiSave) aiSave.onclick = () => {
    S.data.settings.ai = {
      provider: $('#aiProvider').value,
      apiKey: $('#aiApiKey').value.trim(),
      baseUrl: $('#aiBaseUrl').value.trim(),
      visionModel: $('#aiVisionModel').value.trim(),
      imageModel: $('#aiImageModel').value.trim(),
      img2img: $('#aiImg2img').checked,
      accessKeyId: $('#aiAkId').value.trim(),
      secretAccessKey: $('#aiAkSecret').value.trim()
    };
    persist();
    toast('AI 配置已保存');
  };
  const aiTest = $('#aiTestBtn');
  if (aiTest) aiTest.onclick = async () => {
    // 先用当前输入框的值临时保存一下再测试
    S.data.settings.ai = {
      provider: $('#aiProvider').value,
      apiKey: $('#aiApiKey').value.trim(),
      baseUrl: $('#aiBaseUrl').value.trim(),
      visionModel: $('#aiVisionModel').value.trim(),
      imageModel: $('#aiImageModel').value.trim(),
      img2img: $('#aiImg2img').checked,
      accessKeyId: $('#aiAkId').value.trim(),
      secretAccessKey: $('#aiAkSecret').value.trim()
    };
    await flush();
    aiTest.disabled = true;
    aiTest.textContent = '测试中…';
    try {
      const r = await api('/api/ai/test', { method: 'POST', body: '{}' });
      if (r.ok) toast('Key 能用，浏览器能直连方舟，可以去生成模特图了');
      else toast('连接失败：' + (r.message || r.error));
    } catch (e) {
      toast('连接失败：' + ((e.body && e.body.message) || e.message));
    } finally {
      aiTest.disabled = false;
      aiTest.textContent = '测试连接';
    }
  };
}

async function doLogout() {
  try { await api('/api/logout', { method: 'POST' }); } catch (_) {}
  location.reload();
}

/* ================= 工具 ================= */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制');
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('已复制');
  }
}

/* 出图后自动调色：只提亮 + 轻颗粒，不改色相（白仍是白，不会变米黄），接近手机直出咖啡馆的亮度 */
function gradePhoto(url, flat) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const x = c.getContext('2d');
        // 只提亮、不调色：用「向白靠拢」的阴影提亮，不改变色相和饱和度，白仍然是白（不会变米黄），只把死气沉沉的暗部拉起来
        x.drawImage(img, 0, 0, W, H);
        const grain = x.getImageData(0, 0, W, H);
        const gd = grain.data;
        const lift = flat ? 0.02 : 0.06;
        const amp = flat ? 9 : 6;
        for (let i = 0; i < gd.length; i += 4) {
          const n = (Math.random() - 0.5) * amp;
          gd[i] = gd[i] + (255 - gd[i]) * lift + n;
          gd[i + 1] = gd[i + 1] + (255 - gd[i + 1]) * lift + n;
          gd[i + 2] = gd[i + 2] + (255 - gd[i + 2]) * lift + n;
        }
        x.putImageData(grain, 0, 0);
        resolve(c.toDataURL('image/jpeg', 0.94));
      } catch (_) {
        resolve(url);
      }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

/* 防比价结构扰动：随机裁边 + 轻微旋转 + 重新构图。
   图片指纹（pHash/直方图）会明显变化，但衣服本身、颜色、细节都不改，人眼也看不出异常。 */
function antiShift(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const x = c.getContext('2d');
        x.fillStyle = '#ffffff';
        x.fillRect(0, 0, W, H);
        // 四边各随机裁掉 1.5%~4%，构图重心整体改变
        const cutL = W * (0.015 + Math.random() * 0.025);
        const cutR = W * (0.015 + Math.random() * 0.025);
        const cutT = H * (0.015 + Math.random() * 0.025);
        const cutB = H * (0.015 + Math.random() * 0.025);
        const sw = W - cutL - cutR;
        const sh = H - cutT - cutB;
        const ang = (Math.random() * 2 - 1) * 1.6 * Math.PI / 180;
        const k = Math.max(W / sw, H / sh) * 1.06;
        x.save();
        x.translate(W / 2, H / 2);
        x.rotate(ang);
        x.drawImage(img, cutL, cutT, sw, sh, -sw * k / 2, -sh * k / 2, sw * k, sh * k);
        x.restore();
        resolve(c.toDataURL('image/jpeg', 0.94));
      } catch (_) {
        resolve(url);
      }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

function openImgViewer(url, label) {
  if (!url) return;
  const old = $('#imgViewer');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'imgViewer';
  wrap.className = 'img-viewer';
  wrap.innerHTML = `
    <div class="iv-top"><span>${esc(label || '查看大图')}</span><button class="iv-close" type="button">关闭</button></div>
    <div class="iv-body"><img src="${url}" alt="${esc(label || '')}"></div>
    <div class="iv-foot"><a class="btn sm primary" href="${url}" download="${esc(label || '图片')}.png">下载这张</a></div>`;
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.iv-top') || e.target.closest('.iv-foot')) return;
    wrap.remove();
  });
  document.body.appendChild(wrap);
}

function downloadText(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ================= 启动 ================= */

// 生成图统一在应用内查看大图：data: 图片在新标签页会被浏览器拦截成黑屏
document.addEventListener('click', (e) => {
  const img = e.target.closest('.canvas-card img');
  if (!img) return;
  const card = img.closest('.canvas-card');
  const labelEl = card && card.querySelector('.cc-foot span');
  const link = img.closest('a');
  if (link) e.preventDefault();
  openImgViewer(img.getAttribute('src'), labelEl ? labelEl.textContent : '查看大图');
});

$('#logoutBtn').onclick = doLogout;
window.addEventListener('resize', () => { if (S.route === 'dashboard') drawSpark(); });
window.addEventListener('online', () => { toast('网络已恢复'); flush(); });
window.addEventListener('offline', () => setSync('error', '离线'));

if ('serviceWorker' in navigator) {
  // 不再使用离线缓存，避免旧版本页面卡住；同时注销历史注册
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
}

boot().catch((err) => {
  console.error(err);
  showAuth(false);
});
