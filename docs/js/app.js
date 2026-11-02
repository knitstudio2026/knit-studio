import { OPTIONS, generateKit, detailToText, skuToCsv } from './gen.js';
import { buildMainImages, buildDetailImage, downloadCanvas, loadImageFromFile } from './img.js';

/* ================= 基础设施 ================= */

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
  arkPendingJobs: null,   // 预览后待生成的剩余 jobs
  arkCounts: { mainPer: 2, detailPer: 1, simpleSku: false, simpleNote: '不带丝带', noAccessory: false, accessoryList: '丝带、蕾丝蝴蝶结、胸针等装饰', photoStyle: 'lifestyle' },
  aiStatus: '',
  arkStatus: '',
  studioInput: {
    category: '套头毛衣',
    materials: ['羊毛混纺'],
    crafts: ['麻花编织'],
    neck: '半高领',
    fit: '宽松',
    styles: ['慵懒风'],
    audience: ['女士'],
    weight: '加厚',
    season: '秋冬',
    colors: ['燕麦色'],
    sizes: ['M', 'L', 'XL'],
    scene: ['内搭打底'],
    price: '59.9',
    extra: ''
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
      <div><h2>素材工坊</h2><p>上传一张图 → 标题、卖点、SKU、主图、详情页全部出来</p></div>
    </div>

    <div class="studio">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>1 · 商品图</h3></div>
          <div class="card-body">
            ${S.studioImage
              ? `<div class="thumb"><img src="${S.studioImage.dataUrl}" alt="商品图"><button class="reup" id="reup">换图</button></div>`
              : `<div class="dropzone" id="dz"><div class="dz-icon">⬆</div><p>点击上传 / 拍照</p><div class="dz-hint">建议白底或干净背景，正方形最好</div></div>`}
            <input type="file" id="fileInput" accept="image/*" hidden>
            ${S.studioImage && S.data.settings && S.data.settings.ai && S.data.settings.ai.apiKey ? `
              <div style="margin-top:12px"><button class="btn primary" id="arkGenTop" style="width:100%">用火山方舟生成模特图（先出 1 张预览）</button></div>
              <p style="font-size:12px;color:var(--ink-3);margin:6px 0 0">先出 1 张预览看人脸和风格，满意了再批量出，不点不扣钱。</p>
            ` : (S.studioImage ? `
              <div class="no-key">
                <b>还没填火山方舟 Key</b>
                <p>所以这张图不会识别颜色，也不会生成模特图。填一次 Key 就能自动识别。</p>
                <button class="btn primary sm" id="goSettings">去设置填 Key</button>
              </div>` : '')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>一键换装（可选）</h3><span class="sub">保留姿势，换成你的衣服</span></div>
          <div class="card-body">
            <p style="font-size:12px;color:#7a5a1e;background:#fff7e6;border:1px solid #ffd591;border-radius:8px;padding:8px 10px;margin:0 0 10px;line-height:1.7">
              一次可选多张爆款图做姿势参考。工具会自动换成新面孔，降低肖像权风险；但请只使用你有权使用的图片，不要直接拿同行模特正脸上架。
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
            <div style="margin-top:8px">
              <button class="btn primary" id="swapBtn" style="width:100%">${S.swapImages.length ? '一键全部换装（' + S.swapImages.length + ' 张）' : '换装生成（收费）'}</button>
            </div>
            <div id="swapStatus" style="font-size:12px;color:var(--ink-3);margin-top:6px;min-height:18px">${esc(S.swapStatus || (S.swapImages.length ? '点「一键全部换装」会对每张参考图各出 1 张' : '会先提示费用，确认后才扣钱'))}</div>
            ${S.studioAiImages && S.studioAiImages.some((x) => /换装/.test(x.label)) ? `<div class="canvas-grid" style="margin-top:10px">${S.studioAiImages.filter((x) => /换装/.test(x.label)).map((it) => `
              <div class="canvas-card">
                <a href="${it.url}" target="_blank" rel="noopener"><img src="${it.url}" alt="${esc(it.label)}"></a>
                <div class="cc-foot"><span>${esc(it.label)}</span><span style="margin-left:auto"></span><a class="btn sm" href="${it.url}" download="${esc(it.label)}.png">下载</a></div>
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
              ${esc([i.category, (i.materials || []).join('、'), i.neck, i.fit, (i.styles || []).join('、'), i.weight, i.season, (i.colors || []).length ? (i.colors || []).join('、') + '（' + (i.colors || []).length + ' 色）' : ''].filter(Boolean).join(' · '))}
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
                <div class="plabel"><span>材质</span><span class="opt">可多选</span></div>
                ${chipGroup('materials', OPTIONS.material, true)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>工艺</span><span class="opt">可多选</span></div>
                ${chipGroup('crafts', OPTIONS.craft, true)}
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
                <div class="plabel"><span>风格</span><span class="opt">可多选</span></div>
                ${chipGroup('styles', OPTIONS.style, true)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>人群</span><span class="opt">可多选</span></div>
                ${chipGroup('audience', OPTIONS.audience, true)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>厚薄</span></div>
                ${chipGroup('weight', OPTIONS.weight, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>季节</span></div>
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
            <p>会生成 6 组标题、8 条卖点、SKU 规格表、5 张主图、1 张详情长图、一整套属性表</p>
          </div></div>`}
      </div>
    </div>`;
}

function renderStudioResult() {
  const kit = S.studioKit;
  const tab = S.studioResultTab;
  const tabs = [
    ['titles', '标题'],
    ['points', '卖点'],
    ['skus', 'SKU'],
    ['images', '本地拼图'],
    ['ark', '火山模特图'],
    ['jimeng', '即梦提示词'],
    ['detail', '详情页'],
    ['attrs', '属性表']
  ];

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
                <select id="arkMainCount" style="margin:0 4px">
                  ${[2,3,4,5].map((n) => `<option value="${n}" ${S.arkCounts.mainPer === n ? 'selected' : ''}>${n}</option>`).join('')}
                </select>张
              </label>
              <label style="font-size:13px;color:var(--ink-2)">每个颜色详情图
                <select id="arkDetailCount" style="margin:0 4px">
                  ${[0,1,2,3].map((n) => `<option value="${n}" ${S.arkCounts.detailPer === n ? 'selected' : ''}>${n}</option>`).join('')}
                </select>张
              </label>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:13px">
              <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">出图风格
                <select id="arkPhotoStyle" style="margin:0 4px">
                  <option value="lifestyle" ${(S.arkCounts.photoStyle || 'lifestyle') === 'lifestyle' ? 'selected' : ''}>生活种草（推荐，像小红书爆款）</option>
                  <option value="studio" ${S.arkCounts.photoStyle === 'studio' ? 'selected' : ''}>白底影棚（拼多多主图）</option>
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
            ${aiImgs.length ? `<div class="canvas-grid">${aiImgs.map((it) => `
              <div class="canvas-card">
                <a href="${it.url}" target="_blank" rel="noopener"><img src="${it.url}" alt="${esc(it.label)}"></a>
                <div class="cc-foot"><span>${esc(it.label)}</span><span style="margin-left:auto"></span>
                  <a class="btn sm" href="${it.url}" download="${esc(it.label)}.png">下载</a></div>
              </div>`).join('')}</div>` : ''}
          ` : `
            <div class="tbl-empty" style="margin-bottom:12px">还没填火山方舟 Key，不能直接出图。</div>
            <button class="btn" id="arkGoSettings">去设置填 Key</button>
          `}
        </div>
      </div>`;
  }

  if (tab === 'jimeng') {
    const jmOpts = Object.assign({ photoStyle: S.arkCounts.photoStyle || 'lifestyle' }, arkAccOpts() || {});
    const variants = buildJimengPrompts(S.studioInput, jmOpts);
    const videoVariants = buildJimengVideoPrompts(S.studioInput);
    body = `
      <div class="card">
        <div class="card-head"><h3>即梦图片提示词</h3><span class="sub">免费，复制的越少越好用</span></div>
        <div class="card-body">
          <p style="font-size:12px;color:var(--ink-3);margin:0 0 12px">即梦选「图生图」，上传同一张实拍图，粘贴下面任意一条即可。</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:13px">
            <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">出图风格
              <select id="jimengPhotoStyle" style="margin:0 4px">
                <option value="lifestyle" ${(S.arkCounts.photoStyle || 'lifestyle') === 'lifestyle' ? 'selected' : ''}>生活种草（推荐）</option>
                <option value="studio" ${S.arkCounts.photoStyle === 'studio' ? 'selected' : ''}>白底影棚</option>
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
        <p style="font-size:12px;color:var(--ink-3);margin-top:10px">材质成分记得按实际含量改成百分比，平台对这块会抽检。</p>
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
      renderRoute();
      bindRoute();
    };
  });
  const swapBtn = $('#swapBtn');
  if (swapBtn) swapBtn.onclick = swapGenerate;
  if (fileInput) {
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast('图片太大，请压缩到 10MB 以内'); return; }
      try {
        const { img, dataUrl } = await loadImageFromFile(file);
        // 给 AI 用的图：统一转成 JPEG，最长边 1500，拼图多颜色也能看清
        const aiUrl = toAiJpeg(img, 1500);
        S.studioImage = { img, dataUrl, aiUrl, assetUrl: null };
        S.studioAiImages = [];
        S.arkFaceRef = null;
        S.arkPendingJobs = null;
        S.aiStatus = '';
        S.arkStatus = '';
        S.studioResultTab = 'ark';
        // 先用当前标签生成一版，保证「生成模特图」按钮立刻可见
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
  const arkGenTop = $('#arkGenTop');
  if (arkGenTop) arkGenTop.onclick = () => { S.studioResultTab = 'ark'; renderRoute(); bindRoute(); arkPreviewOne(); };
  const arkContinue = $('#arkContinueBtn');
  if (arkContinue) arkContinue.onclick = () => arkContinueRest();
  const arkRestart = $('#arkRestartBtn');
  if (arkRestart) arkRestart.onclick = () => arkRestartPreview();
  const arkBalance = $('#arkBalanceBtn');
  if (arkBalance) arkBalance.onclick = () => arkCheckBalance();
  const arkMainCount = $('#arkMainCount');
  if (arkMainCount) arkMainCount.onchange = () => { S.arkCounts.mainPer = Number(arkMainCount.value); };
  const arkDetailCount = $('#arkDetailCount');
  if (arkDetailCount) arkDetailCount.onchange = () => { S.arkCounts.detailPer = Number(arkDetailCount.value); };
  const arkSimpleSku = $('#arkSimpleSku');
  if (arkSimpleSku) arkSimpleSku.onchange = () => { S.arkCounts.simpleSku = arkSimpleSku.checked; };
  const arkSimpleNote = $('#arkSimpleNote');
  if (arkSimpleNote) arkSimpleNote.oninput = () => { S.arkCounts.simpleNote = arkSimpleNote.value; };
  const arkNoAcc = $('#arkNoAcc');
  if (arkNoAcc) arkNoAcc.onchange = () => { S.arkCounts.noAccessory = arkNoAcc.checked; };
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
    S.arkPendingJobs = null;
    S.arkStatus = '';
    renderRoute();
    bindRoute();
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
  S.studioResultTab = 'ark';
  const startedAt = Date.now();
  const tick = () => {
    S.aiStatus = '正在识别材质、领型、版型、风格、颜色…（已识别 ' + Math.round((Date.now() - startedAt) / 1000) + ' 秒）';
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
    const map = ['category','materials','crafts','neck','fit','styles','audience','weight','season','colors','sizes','scene'];
    map.forEach((k) => { if (s[k] !== undefined && s[k] !== null) S.studioInput[k] = s[k]; });
    if (s.price) S.studioInput.price = String(s.price);
    if (s.extra) S.studioInput.extra = s.extra;
    S.studioKit = generateKit(S.studioInput, Number(S.studioInput.price) || 0);
    S.studioResultTab = 'ark';
    const colN = (S.studioInput.colors || []).length;
    S.aiStatus = '✅ 识别成功：' + (colN ? `认出 ${colN} 个颜色（${(S.studioInput.colors || []).join('、')}）` : '已填好属性');
    renderRoute();
    bindRoute();
    toast('识别完成，属性已自动填好');
  } catch (e) {
    S.aiStatus = '❌ 识别失败：' + ((e.body && e.body.message) || e.message);
    renderRoute();
    bindRoute();
  } finally {
    clearInterval(timer);
  }
}

const FACE_SPEC = '固定模特：26 岁亚洲女性，鹅蛋脸，清秀自然五官，黑棕色微卷长发，裸妆淡妆，身高 168cm，身材匀称；同一个商品的所有颜色图必须是同一位模特、同一张脸';

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
  const n = S.swapImages.length;
  const low = (n * 0.1).toFixed(1);
  if (!confirm(`对 ${n} 张参考图各出 1 张换装图，共 ${n} 张，约 ${low}~${n} 元，从你的方舟余额扣。继续吗？`)) return;
  const btn = $('#swapBtn');
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const el = $('#swapStatus');
    if (el) el.textContent = `换装中…已等 ${Math.round((Date.now() - startedAt) / 1000)} 秒，别关页面`;
  }, 1000);
  S.swapStatus = `正在换装（1/${n}）…`;
  if (btn) { btn.disabled = true; btn.textContent = `换装中…（0/${n}）`; }
  renderRoute();
  bindRoute();

  // 换装必须保留参考图1的姿势和背景，所以这里不带生活方式收尾语
  const garment = S.studioImage.aiUrl || S.studioImage.dataUrl;
  const swapTail = S.arkCounts.noAccessory
    ? `，颜色、材质纹理、花纹、纽扣、口袋必须与参考图2完全一致，但不要生成${S.arkCounts.accessoryList || '丝带、蝴蝶结等装饰'}，只保留衣服本体`
    : '，颜色、材质纹理、花纹、纽扣、口袋、装饰必须与参考图2完全一致';
  let done = 0;
  for (let i = 0; i < n; i++) {
    try {
      const ref = S.swapImages[i];
      S.swapStatus = `正在换装第 ${i + 1}/${n} 张…`;
      const el = $('#swapStatus');
      if (el) el.textContent = S.swapStatus;
      const r = await api('/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: SWAP_PROMPT + swapTail + '。真实生活人像摄影：皮肤有真实纹理和细碎发丝，不磨皮不塑料感，非 3D 渲染非插画，暖色调灯光有柔和阴影，背景保留参考图1的场景氛围；无水印、无文字、无 logo',
          images: [ref.aiUrl, garment],
          size: '1024x1536'
        })
      });
      const url = r.dataUrl || r.url;
      if (!url) throw new Error('方舟没返回图片');
      S.studioAiImages.unshift({ url, label: `换装图（参考图 ${i + 1}）` });
      done++;
      if (btn) btn.textContent = `换装中…（${done}/${n}）`;
      renderRoute();
      bindRoute();
    } catch (e) {
      S.swapStatus = `第 ${i + 1} 张失败：${(e.body && e.body.message) || e.message}。已成功 ${done} 张，失败的不扣钱。`;
      renderRoute();
      bindRoute();
      break;
    }
  }
  clearInterval(timer);
  if (btn) { btn.disabled = false; btn.textContent = S.swapImages.length ? '一键全部换装（' + S.swapImages.length + ' 张）' : '换装生成（收费）'; }
  if (done === n) {
    S.swapStatus = `✅ 全部完成，共 ${n} 张，图在下面`;
    toast('换装完成');
  }
  renderRoute();
  bindRoute();
}

const ARK_PHOTO_LIFE = '真实生活人像摄影：35mm 镜头，f/2.4 浅景深，暖色调室内自然光，柔和阴影，皮肤有真实纹理和细碎发丝，不磨皮不塑料感，非 3D 渲染非插画；半身或七分身构图，人物占画面 60%~80%，构图自然抓拍感，不要全身站桩；模特造型生活化：微卷长发或空气刘海、戴细项链或背一只小巧斜挎包、下身配浅蓝牛仔裤或浅色半裙、脚穿简洁平底鞋；背景是真实的居家、咖啡店或衣柜前场景，有生活气息和层次但不抢衣服；服装颜色、花纹、材质、纽扣、口袋与参考图完全一致；无水印、无文字、无 logo';

const ARK_PHOTO_STUDIO = '真实商业摄影：85mm 定焦镜头，f/1.8 浅景深，柔和均匀的影棚布光，皮肤有真实纹理和细碎发丝，不磨皮不塑料感，非 3D 渲染非插画；七分身构图，人物占画面 70%，浅灰白无缝背景和自然落地阴影；模特自然放松的站姿，肩膀微侧、重心偏一条腿，不要僵直立正、不要双手垂直下垂；服装颜色、花纹、材质、纽扣、口袋与参考图完全一致；无水印、无文字、无 logo';

const ARK_PHOTO = ARK_PHOTO_LIFE;

const SWAP_PROMPT = '参考图1是模特姿势和构图，参考图2是我要卖的衣服实拍。请生成一张全新照片：完全保留参考图1的姿势、镜头角度、构图和背景氛围；把人物脸换成一位全新的、与参考图1不同的亚洲年轻女性；把身上的衣服换成参考图2这件';

// 「不带装饰」开关：返回 buildJimengPrompts 用的参数
function arkAccOpts() {
  return S.arkCounts.noAccessory
    ? { simple: true, noAccessory: true, accessory: S.arkCounts.accessoryList || '丝带、蕾丝蝴蝶结等装饰' }
    : null;
}

// 画质收尾语：按「出图风格」选生活种草或白底影棚；开了「不带装饰」时去掉「装饰与原图一致」
function arkPhotoTag() {
  const life = (S.arkCounts.photoStyle || 'lifestyle') === 'lifestyle';
  let s = life ? ARK_PHOTO_LIFE : ARK_PHOTO_STUDIO;
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
  const mainPer = Number(S.arkCounts.mainPer) || 2;
  const detailPer = Number(S.arkCounts.detailPer) || 0;
  const accOpts = Object.assign({ photoStyle: S.arkCounts.photoStyle || 'lifestyle' }, arkAccOpts() || {});
  const accNote = S.arkCounts.noAccessory ? `。衣服上不要出现${S.arkCounts.accessoryList || '丝带、蕾丝蝴蝶结等装饰'}，只保留衣服本体` : '';
  const photo = arkPhotoTag();
  const jobs = [];
  colorList.forEach((color) => {
    const ci = Object.assign({}, S.studioInput, { colors: [color] });
    const mv = buildJimengPrompts(ci, accOpts);
    const dv = buildJimengDetailPrompts(ci, accOpts);
    for (let i = 0; i < mainPer; i++) jobs.push({ label: `${color} 主图 ${i + 1}`, prompt: mv[i % mv.length].prompt + '。' + photo + accNote });
    for (let i = 0; i < detailPer; i++) jobs.push({ label: `${color} 详情图 ${i + 1}`, prompt: dv[i % dv.length].prompt + '。' + photo + accNote });
  });
  if (S.arkCounts.simpleSku) {
    const ci = Object.assign({}, S.studioInput, { colors: [colorList[0]] });
    const p = buildJimengPrompts(ci, { simple: true, accessory: S.arkCounts.simpleNote || '丝带等装饰' })[0].prompt;
    jobs.push({ label: '引流图（简配）', prompt: p + '。' + photo });
  }
  return jobs;
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
  const timer = setInterval(() => {
    setArkStatus(`${phase}，已等 ${Math.round((Date.now() - startedAt) / 1000)} 秒，别关页面`);
  }, 1000);

  const styleInfo = arkStyleInfo();
  const garment = S.studioImage.aiUrl || S.studioImage.dataUrl;
  try {
    for (let i = 0; i < total; i++) {
      const job = jobs[i];
      phase = `正在生成第 ${doneBase + i + 1}/${doneBase + total} 张（${job.label}）`;
      S.arkStatus = phase + '…';
      setArkStatus(S.arkStatus);
      let prompt = job.prompt + '。' + styleInfo + '。' + FACE_SPEC + '。' + arkPhotoTag();
      const body = { prompt, size: '1024x1536' };
      if (S.arkFaceRef) {
        body.images = [garment, S.arkFaceRef];
        prompt += '。服装严格按参考图1；脸部、发型、妆容、体型必须与参考图2完全一致，不要换脸。';
        body.prompt = prompt;
      } else {
        body.imageUrl = garment;
      }
      const r = await api('/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const url = r.dataUrl || r.url;
      if (!url) throw new Error('方舟没返回图片');
      if (!S.arkFaceRef) S.arkFaceRef = url;
      S.studioAiImages.unshift({ url, label: job.label });
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
  if (!arkCheckReady()) return;
  const jobs = arkBuildJobs();
  const total = jobs.length;
  if (!total) { toast('张数都是 0，先选一下'); return; }
  const msg = `先出 1 张预览（${jobs[0].label}），看看人脸和风格对不对。满意了再继续生成剩下的 ${total - 1} 张。这 1 张约 0.1~1 元，从你的方舟余额扣。继续吗？`;
  if (!confirm(msg)) return;

  S.arkPendingJobs = jobs.slice(1);
  S.arkStatus = `正在出预览图…`;
  renderRoute();
  bindRoute();
  const res = await arkRunJobs([jobs[0]], 'arkGenBtn', 0);
  if (res.ok) {
    S.arkStatus = `预览图已出（${jobs[0].label}）。满意就点「继续生成剩余 ${S.arkPendingJobs.length} 张」，不满意就「丢掉预览，重新出」。`;
    renderRoute();
    bindRoute();
    toast('预览图已出');
  } else {
    // 预览失败：清空待生成队列和人脸参考，让用户重新出
    S.arkPendingJobs = null;
    S.arkFaceRef = null;
    renderRoute();
    bindRoute();
  }
}

async function arkContinueRest() {
  if (!arkCheckReady()) return;
  const jobs = S.arkPendingJobs;
  if (!jobs || !jobs.length) { toast('没有待生成的图，先点「先生成 1 张预览」'); return; }
  const total = jobs.length;
  const low = (total * 0.1).toFixed(1);
  const doneBase = S.studioAiImages.length;
  const msg = `继续生成剩下的 ${total} 张，约 ${low}~${total} 元，从你的方舟余额扣。之前的预览图会保留，继续往后加。继续吗？`;
  if (!confirm(msg)) return;

  S.arkStatus = `继续生成剩余 ${total} 张…`;
  renderRoute();
  bindRoute();
  const res = await arkRunJobs(jobs, 'arkContinueBtn', doneBase);
  if (res.ok) {
    S.arkPendingJobs = null;
    S.arkStatus = `完成：本次共生成 ${doneBase + total} 张。点图片看大图，点「下载」保存。`;
    renderRoute();
    bindRoute();
    toast('模特图已生成');
  } else {
    // 中途失败：把已成功的从 pending 里去掉，剩下的留着让用户重试
    S.arkPendingJobs = jobs.slice(res.done);
    renderRoute();
    bindRoute();
  }
}

function arkRestartPreview() {
  S.studioAiImages = [];
  S.arkFaceRef = null;
  S.arkPendingJobs = null;
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
  return c.toDataURL('image/jpeg', 0.86);
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
  const constraint = accessory
    ? (opts && opts.noAccessory
      ? `严格参考上传的服装图片，保持服装的版型、颜色深浅、材质纹理和主体设计100%一致，但衣服上不要出现${accessory}，只保留衣服本体，不要任何附加挂饰；只改变穿着的人和场景`
      : `严格参考上传的服装图片，保持服装的版型、颜色深浅、材质纹理和主体设计100%一致，但要去掉${accessory}，做成简配版；只改变穿着的人和场景`)
    : '严格参考上传的服装图片，保持服装的花纹、图案、颜色深浅、材质纹理、纽扣、装饰等所有细节与原图100%一致，不得更改服装的款式和设计；只改变穿着的人和场景';

  // 画质约束：按风格区分「生活种草」和「白底影棚」
  const lifestyle = ((opts && opts.photoStyle) || S.arkCounts.photoStyle || 'lifestyle') === 'lifestyle';
  const quality = lifestyle
    ? '真实生活人像照片，暖色调室内自然光，皮肤质感自然有细节，发丝清晰，光线有柔和阴影，手机随拍感但画质高清，电商种草图质感，画面干净无水印无文字，不要卡通不要插画不要油画风'
    : '真实商业人像摄影，柔和影棚布光，皮肤质感自然，发丝清晰，光线均匀有落地阴影，高清细节，电商主图质感，画面干净无水印无文字，不要卡通不要插画不要油画风';

  const base = (model, scene) => {
    return `${model}，穿着${garment}。${constraint}。${scene}。${quality}。`;
  };

  // 生活种草场景：暖调、有生活气息，姿势自然抓拍（对标小红书爆款图）
  const style0 = (input.styles && input.styles[0]) || '温柔风';
  const STYLE_SCENE = {
    慵懒风: ['微卷长发，空气刘海，淡妆，表情放松', '居家客厅，米色墙面和白色置物架，暖色落地灯光，倚着柜子侧身站着，一只手轻抬到胸前，慵懒自然'],
    韩版: ['清爽气质，微卷长发，淡妆', '韩系咖啡店室内，木质桌面和暖黄灯光，坐姿半身，侧脸看向窗外，自然抓拍'],
    日系: ['素颜感淡妆，微卷中长发，表情平静', '日系清新卧室，浅色纱帘和木地板，晨光柔光，站在窗边侧身，手里拿着咖啡杯'],
    复古: ['复古气质，微卷长发，淡妆', '复古室内，木质家具与暖黄灯光，胶片质感，身体侧转回头看向镜头，色调偏暖'],
    法式: ['气质优雅，微卷长发，淡妆', '法式复古卧室，雕花墙面与窗边柔光，靠墙侧身站立，姿态松弛优雅'],
    学院风: ['青春感淡妆，自然微卷发', '校园图书馆或宿舍，书架背景虚化，明亮自然光，抱着一本书侧身站着'],
    通勤: ['干练气质，利落发型，淡妆', '写字楼走廊或咖啡店外景，简洁背景，自然日光，手提托特包侧身行走抓拍'],
    ins风: ['干净气质，微卷发，淡妆', '极简居家角落，白色置物架和绿植，柔和自然光，靠墙侧身站立，构图留白干净'],
    温柔风: ['气质温柔，微卷长发微垂，淡妆', '窗边居家场景，米色墙面和白色置物架，暖色灯光，身体侧转四分之三背对镜头，一手轻扶架子，温柔自然']
  };
  const st = STYLE_SCENE[style0] || STYLE_SCENE['温柔风'];

  // 生活种草：半身侧背 + 场景走动，两种角度换着出，避免每张都一样
  const lifeVariants = [
    {
      name: `生活种草图（${style0}）`,
      prompt: base(
        `一位25岁左右的亚洲女性模特，${st[0]}，中长微卷发`,
        `半身构图，人物占画面 70%，身体侧转四分之三、微微回头，不直视镜头，一只手自然抬起（拨头发或轻扶墙面/架子），${st[1]}`
      )
    },
    {
      name: '居家走动图',
      prompt: base(
        '一位25岁左右的亚洲女性模特，微卷长发，空气刘海，淡妆，自然放松的表情',
        '半身到七分身构图，人物占画面 75%，在温暖的居家空间里小幅走动，一只脚在前，手臂自然摆动，头发有轻微动态，背景是米色墙、木质地板和虚化的家具，暖色自然光'
      )
    }
  ];

  // 白底影棚：拼多多主图用，姿势也要自然，不能站桩
  const studioVariants = [
    {
      name: '白底主图',
      prompt: base(
        '一位25岁左右的亚洲女性模特，五官自然，淡妆，微卷长发，表情温和自然',
        '七分身构图，人物占画面 70%，浅灰白无缝背景，柔和影棚布光，肩膀微侧、重心落在一条腿上，一只手轻搭在腰间，姿势自然不僵直'
      )
    },
    {
      name: '白底半身细节',
      prompt: base(
        '一位25岁左右的亚洲女性模特，五官自然，淡妆，微卷长发，自然微笑看向镜头',
        '半身构图，浅灰白无缝背景，柔和影棚布光，身体微侧，展示领口和纽扣细节，构图干净'
      )
    }
  ];

  const variants = lifestyle ? lifeVariants : studioVariants;

  return variants;
}

// 即梦/方舟「详情图」提示词（面料、领口、袖口等局部特写）
function buildJimengDetailPrompts(input, opts) {
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

  const accessory = (opts && opts.simple) ? (opts.accessory || '丝带等装饰') : '';
  const constraint = accessory
    ? `严格参考上传的服装图片，保持服装的版型、颜色深浅、材质纹理和主体设计100%一致，但衣服上不要出现${accessory}，只保留衣服本体，局部特写里也不能拍到任何附加挂饰`
    : '严格参考上传的服装图片，保持服装的花纹、图案、颜色深浅、材质纹理、纽扣、装饰等所有细节与原图100%一致，不得更改服装的款式和设计';
  const quality = '真实商品摄影，细节清晰锐利，光线柔和有层次，浅灰色或纯白背景，无水印无文字，不要卡通不要插画';
  const base = (scene) => `局部特写照片，一位模特穿着${garment}。${constraint}。${scene}。${quality}。`;

  return [
    { name: '领口细节', prompt: base('镜头近景聚焦领口，展示领型、走线、拉链或纽扣和毛绒质感，模特下巴以下入镜') },
    { name: '面料纹理', prompt: base('镜头极近距离微距拍摄面料表面，展示针织纹理、纱线绒毛和真实质感，浅景深') },
    { name: '袖口与下摆', prompt: base('镜头近景展示袖口螺纹和下摆收口，模特手部轻拉衣摆，体现弹力和做工') },
    { name: '侧面版型', prompt: base('模特侧身半身展示，体现肩线、袖型和整体版型，室内影棚柔光') }
  ];
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
    S.data.materials.unshift({
      id: uid(),
      name: S.studioInput.category + ' · ' + (S.studioInput.colors || []).join('/'),
      imageUrl: url,
      input: Object.assign({}, S.studioInput),
      kit: S.studioKit,
      createdAt: Date.now()
    });
    S.data.materials = S.data.materials.slice(0, 50);
    persist();
    toast('已存入素材库');
  } catch (_) {
    toast('保存失败，检查网络');
  }
}

/* ================= 设置 ================= */

function viewSettings() {
  const d = S.data;
  return `
    <div class="page-head"><div><h2>设置</h2><p>数据、备份、使用说明 · 当前版本 v1117a</p></div></div>
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
        <div class="card-head"><h3>素材库</h3><span class="sub">最近 ${d.materials.length} 条</span></div>
        <div class="card-body">
          ${d.materials.length ? `<div class="canvas-grid">${d.materials.map((m) => `
            <div class="canvas-card">
              <img src="${m.imageUrl}" alt="${esc(m.name)}">
              <div class="cc-foot"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}</span></div>
            </div>`).join('')}</div>` : `<div class="tbl-empty">素材工坊里点「保存到素材库」后，会出现在这里</div>`}
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

function downloadText(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ================= 启动 ================= */

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
