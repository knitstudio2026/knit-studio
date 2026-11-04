import { OPTIONS, generateKit, detailToText, skuToCsv } from './gen.js';
import { buildMainImages, buildDetailImage, downloadCanvas, loadImageFromFile } from './img.js';

/* å…¨å±€å¼‚å¸¸å…œåº•ï¼šä»»ä½•é™é»˜å¼‚å¸¸éƒ½å¼¹ toast */
window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason && (e.reason.message || e.reason.body)) || 'æœªçŸ¥é”™è¯¯';
  console.error('[unhandled promise]', e.reason);
  toast('å‡ºé”™äº†ï¼š' + msg);
});
window.addEventListener('error', (e) => {
  console.error('[runtime error]', e.error || e.message);
});

/* ================= åŸºç¡€è®¾æ–½ ================= */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const uid = () => 'id-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

const money = (n) => {
  if (!isFinite(n)) return 'â€”';
  return (n < 0 ? '-' : '') + 'Â¥' + Math.abs(n).toFixed(2);
};
const pct = (n) => (isFinite(n) ? (n * 100).toFixed(1) + '%' : 'â€”');
const num = (n, d) => (isFinite(n) ? n.toFixed(d == null ? 0 : d) : 'â€”');

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

/* ================= çŠ¶æ€ ================= */

const S = {
  data: null,
  rev: 0,
  route: 'dashboard',
  syncState: 'ok',
  studioImage: null,      // { img, dataUrl, aiUrl, assetUrl }
  swapImages: [],         // å¤šå¼ å§¿åŠ¿å‚è€ƒå›¾ [{ img, dataUrl, aiUrl }]
  swapStatus: '',
  studioKit: null,
  studioResultTab: 'titles',
  tagOpen: false,
  studioAiImages: [],     // æ–¹èˆŸç”Ÿæˆçš„æ¨¡ç‰¹å›¾ï¼ˆæœ¬æ¬¡ä¼šè¯ï¼‰
  arkFaceRef: null,       // ç¬¬ä¸€å¼ ç”Ÿæˆå›¾çš„äººè„¸å‚è€ƒï¼ˆæœ¬ä¼šè¯ï¼‰
  arkIdentity: null,      // æœ¬æ¬¾å•†å“ç”¨çš„æ¨¡ç‰¹é•¿ç›¸ï¼ˆæ¢å•†å“æ—¶é‡ç½®ï¼‰
  arkLight: null,         // æœ¬æ¬¾å•†å“ç”¨çš„ç¯å…‰/é•œå¤´è®¾å®šï¼ˆæ¢å•†å“æ—¶é‡ç½®ï¼‰
  arkRecentScenes: [],    // æœ€è¿‘ç”¨è¿‡çš„åœºæ™¯ï¼Œé¿å…ä¸åŒå•†å“æ’žèƒŒæ™¯
  libSearch: '',          // ç´ æåº“æœç´¢å…³é”®è¯
  libViewId: null,        // ç´ æåº“å½“å‰æŸ¥çœ‹çš„ç´ æ ID
  arkPendingJobs: null,   // é¢„è§ˆåŽå¾…ç”Ÿæˆçš„å‰©ä½™ jobs
  arkCounts: { mainPer: 2, detailPer: 1, simpleSku: false, simpleNote: 'ä¸å¸¦ä¸å¸¦', noAccessory: false, accessoryList: 'ä¸å¸¦ã€è•¾ä¸è´è¶ç»“ã€èƒ¸é’ˆç­‰è£…é¥°', photoStyle: 'auto', antiCompare: true },
  aiStatus: '',
  arkStatus: '',
  studioInput: {
    category: 'å¥—å¤´æ¯›è¡£',
    materials: ['ç¾Šæ¯›', 'è…ˆçº¶'],
    crafts: ['éº»èŠ±ç¼–ç»‡'],
    pattern: 'çº¯è‰²',
    wearStyle: 'å¥—å¤´',
    neck: 'åŠé«˜é¢†',
    fit: 'å®½æ¾',
    length: 'å¸¸è§„æ¬¾',
    sleeveLen: 'é•¿è¢–',
    sleeveType: 'å¸¸è§„',
    elements: ['çº½æ‰£'],
    fiber: 'é’ˆç»‡',
    age: 'ä¸­é’å¹´ï¼ˆ26-40å‘¨å²ï¼‰',
    fleece: 'ä¸åŠ ç»’',
    mainStyle: 'ç®€çº¦é€šå‹¤',
    subStyle: 'æ…µæ‡’é£Ž',
    styles: ['æ…µæ‡’é£Ž'],
    audience: ['å¥³å£«'],
    weight: 'åŠ åŽš',
    season: 'ç§‹å†¬',
    colors: ['ç‡•éº¦è‰²'],
    sizes: ['M', 'L', 'XL'],
    scene: ['å†…æ­æ‰“åº•'],
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
  setSync('pending', 'åŒæ­¥ä¸­â€¦');
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
    setSync('ok', 'å·²åŒæ­¥');
    localStorage.setItem('knit-cache', JSON.stringify(S.data));
  } catch (err) {
    if (err.status === 409) {
      setSync('error', 'æœ‰å†²çª');
      toast('æ•°æ®åœ¨å…¶ä»–è®¾å¤‡ä¸Šæ›´æ–°äº†ï¼Œæ­£åœ¨é‡æ–°è½½å…¥â€¦', 3000);
      await loadData();
      renderRoute();
      return;
    }
    setSync('error', 'ç¦»çº¿');
  }
}

async function loadData() {
  const d = await api('/api/data');
  S.data = d;
  S.rev = d.rev;
  localStorage.setItem('knit-cache', JSON.stringify(d));
  setSync('ok', 'å·²åŒæ­¥');
}

/* ================= è®¤è¯ ================= */

async function boot() {
  try {
    await enter();
  } catch (e) {
    authError('æ‰“å¼€å¤±è´¥ï¼š' + ((e && e.message) || 'æœªçŸ¥åŽŸå› '));
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
  authError('ç¨‹åºå‡ºé”™ï¼š' + (e.message || 'æœªçŸ¥é”™è¯¯'));
});
window.addEventListener('unhandledrejection', (e) => {
  if (!$('#authScreen') || $('#authScreen').hidden) return;
  authError('ç¨‹åºå‡ºé”™ï¼š' + ((e.reason && e.reason.message) || 'æœªçŸ¥é”™è¯¯'));
});

function showAuth(needsSetup) {
  const screen = $('#authScreen');
  screen.hidden = false;
  screen.style.display = 'grid';
  $('#shell').hidden = true;
  $('#authSub').textContent = needsSetup ? 'ç¬¬ä¸€æ¬¡ä½¿ç”¨ï¼Œè®¾ç½®ä¸€ä¸ªåªæœ‰ä½ çŸ¥é“çš„å£ä»¤' : 'è¾“å…¥å£ä»¤ï¼Œæ‰‹æœºå’Œç”µè„‘å…±ç”¨åŒä¸€ä»½æ•°æ®';
  $('#authTip').textContent = needsSetup ? 'å£ä»¤ä¿å­˜åœ¨æœåŠ¡å™¨ä¸Šï¼Œå¿˜è®°åŽéœ€è¦æ¸…ç©ºæ•°æ®ç›®å½•æ‰èƒ½é‡ç½®ã€‚' : 'ç™»å½•çŠ¶æ€ä¼šè®°ä½ 30 å¤©ã€‚';
  const input = $('#authInput');
  const btn = $('#authBtn');
  input.value = '';
  btn.textContent = needsSetup ? 'è®¾ç½®å¹¶è¿›å…¥' : 'è¿›å…¥';
  const submit = async () => {
    const password = input.value.trim();
    if (!password) { authError('è¯·è¾“å…¥å£ä»¤'); return; }
    btn.disabled = true;
    btn.textContent = 'æ­£åœ¨è¿›å…¥â€¦';
    try {
      await api('/api/health');
    } catch (_) {
      authError('è¿žä¸ä¸ŠæœåŠ¡å™¨ï¼šé»‘è‰²çª—å£å…³æŽ‰äº†ï¼Ÿè¯·é‡æ–°åŒå‡» knit-studio.exe');
      btn.disabled = false;
      btn.textContent = needsSetup ? 'è®¾ç½®å¹¶è¿›å…¥' : 'è¿›å…¥';
      return;
    }
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      screen.hidden = true;
      await enter();
    } catch (err) {
      authError(err.status === 401 ? 'å£ä»¤ä¸æ­£ç¡®' : ('å‡ºé”™äº†ï¼š' + (err.message || 'æœªçŸ¥åŽŸå› ')));
    } finally {
      btn.disabled = false;
      btn.textContent = needsSetup ? 'è®¾ç½®å¹¶è¿›å…¥' : 'è¿›å…¥';
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
      setSync('error', 'ç¦»çº¿æ¨¡å¼');
      renderRoute();
      registerTabs();
      toast('å½“å‰å¤„äºŽç¦»çº¿æ¨¡å¼ï¼Œæ”¹åŠ¨ä¼šåœ¨è”ç½‘åŽåŒæ­¥');
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

/* ================= è®¡ç®— ================= */

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

/* ================= æ¸²æŸ“å…¥å£ ================= */

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

/* ================= é€šç”¨ç»„ä»¶ ================= */

function openDrawer(title, bodyHtml, footHtml) {
  closeDrawer();
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.id = 'drawerOverlay';
  wrap.innerHTML = `
    <div class="drawer" role="dialog" aria-modal="true">
      <div class="drawer-head">
        <h3>${esc(title)}</h3>
        <div style="margin-left:auto"><button class="icon-btn" data-close>å…³é—­</button></div>
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

/* é¡µé¢å†…ç¡®è®¤å¯¹è¯æ¡†ï¼Œæ›¿ä»£åŽŸç”Ÿ confirmï¼ˆåŽŸç”Ÿ confirm åœ¨éƒ¨åˆ†æ‰‹æœºæµè§ˆå™¨å¯èƒ½ä¸å¼¹ï¼‰ */
function confirm2(msg) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.style.zIndex = '9999';
    wrap.innerHTML = `
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;color:#1a1a1a;padding:22px 20px 16px;border-radius:14px;max-width:340px;width:92vw;box-shadow:0 10px 40px rgba(0,0,0,.25);font-size:14px;line-height:1.6">
        <div style="font-weight:600;font-size:15px;margin-bottom:10px">ç¡®è®¤ä¸€ä¸‹</div>
        <div style="margin-bottom:18px;color:#333">${esc(msg)}</div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn sm" data-cancel>å–æ¶ˆ</button>
          <button class="btn sm primary" data-ok>ç»§ç»­</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.querySelector('[data-ok]').onclick = () => done(true);
    wrap.querySelector('[data-cancel]').onclick = () => done(false);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) done(false); });
  });
}

/* ================= çœ‹æ¿ ================= */

function viewDashboard() {
  const d = S.data;
  if (!d.shops.length) {
    return `
      <div class="empty">
        <div class="glyph">â—«</div>
        <h4>å…ˆæ·»åŠ ä½ çš„ç¬¬ä¸€å®¶åº—</h4>
        <p>ä¸€äººå¤šåº—ï¼šæ¯åŠ ä¸€å®¶åº—ï¼Œçœ‹æ¿å’Œåˆ©æ¶¦è¡¨éƒ½ä¼šè‡ªåŠ¨æ±‡æ€»ã€‚</p>
        <button class="btn primary" data-act="add-shop">ï¼‹ æ·»åŠ åº—é“º</button>
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
        <td class="num">${st.roi === Infinity ? 'â€”' : st.roi.toFixed(2)}</td>
        <td class="num">${pct(st.refundRate)}</td>
      </tr>`;
  }).join('');

  const series = buildSeries(14);

  return `
    <div class="page-head">
      <div>
        <h2>ç»è¥çœ‹æ¿</h2>
        <p>${todayStr} Â· ${d.shops.length} å®¶åº—åœ¨ç®¡</p>
      </div>
      <div class="spacer"></div>
      <button class="btn sm" data-act="export-daily">å¯¼å‡º</button>
      <button class="btn primary sm" data-act="add-daily">ï¼‹ å½•å…¥ä»Šæ—¥æ•°æ®</button>
    </div>

    <div class="grid four" style="margin-bottom:14px">
      <div class="stat accent">
        <div class="label">ä»Šæ—¥å‡€åˆ©</div>
        <div class="value">${money(t.net)}</div>
        <div class="hint">é”€å”®é¢ ${money(t.sales)}</div>
      </div>
      <div class="stat">
        <div class="label">è¿‘ 7 å¤©å‡€åˆ©</div>
        <div class="value">${money(w.net)}</div>
        <div class="hint">é”€å”®é¢ ${money(w.sales)}</div>
      </div>
      <div class="stat">
        <div class="label">è¿‘ 30 å¤©å‡€åˆ©</div>
        <div class="value">${money(m.net)}</div>
        <div class="hint">å¹¿å‘Šè´¹ ${money(m.adSpend)}</div>
      </div>
      <div class="stat">
        <div class="label">æ•´ä½“ ROI</div>
        <div class="value">${m.roi === Infinity ? 'â€”' : m.roi.toFixed(2)}</div>
        <div class="hint">é”€å”®é¢ / å¹¿å‘Šè´¹</div>
      </div>
    </div>

    <div class="stack">
      <div class="card">
        <div class="card-head">
          <h3>å„åº—ä»Šæ—¥è¡¨çŽ°</h3>
          <span class="sub">å‡€åˆ©å·²æ‰£æˆæœ¬ã€ä½£é‡‘ã€å¹¿å‘Šã€é€€æ¬¾</span>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>åº—é“º</th><th class="num">ä»Šæ—¥é”€å”®é¢</th><th class="num">è®¢å•</th><th class="num">ä»Šæ—¥å‡€åˆ©</th><th class="num">ROI</th><th class="num">é€€æ¬¾çŽ‡</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>è¿‘ 14 å¤©å‡€åˆ©è¶‹åŠ¿</h3><span class="sub">æŒ‰æ—¥æ±‡æ€»</span></div>
        <div class="card-body">
          ${series.hasData ? `<canvas id="spark" class="spark" width="800" height="160"></canvas>` : `<div class="tbl-empty">è¿˜æ²¡æœ‰æ¯æ—¥æ•°æ®ï¼Œå½•å…¥ 2 å¤©ä»¥ä¸Šå°±èƒ½çœ‹åˆ°è¶‹åŠ¿</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>éœ€è¦ä½ æ³¨æ„</h3></div>
        <div class="card-body">${attentionList()}</div>
      </div>
    </div>`;
}

function attentionList() {
  const items = [];
  const lowMargin = S.data.products.map((p) => ({ p, r: productProfit(p) })).filter((x) => x.r.net < 0);
  if (lowMargin.length) {
    items.push(`<div class="seg-row"><div class="sk">äºæŸ</div><div>${lowMargin.length} ä¸ªå•†å“æ‰£æŽ‰æŽ¨å¹¿è´¹åŽæ˜¯è´Ÿæ¯›åˆ©ï¼š${lowMargin.slice(0, 3).map((x) => esc(x.p.name)).join('ã€')}${lowMargin.length > 3 ? ' ç­‰' : ''}</div><span class="pill bad">çœ‹åˆ©æ¶¦é¡µ</span></div>`);
  }
  S.data.shops.forEach((shop) => {
    const st = shopStats(shop.id);
    if (st.refundRate > 0.05) items.push(`<div class="seg-row"><div class="sk">é€€æ¬¾</div><div>${esc(shop.name)} é€€æ¬¾çŽ‡ ${pct(st.refundRate)}ï¼Œé«˜äºŽ 5%</div><span class="pill warn">æŸ¥å”®åŽ</span></div>`);
    if (st.adSpend > 0 && st.roi < 2) items.push(`<div class="seg-row"><div class="sk">æŠ•æ”¾</div><div>${esc(shop.name)} ROI åªæœ‰ ${st.roi.toFixed(2)}ï¼Œå…ˆåˆ«åŠ é¢„ç®—</div><span class="pill warn">æŸ¥æŽ¨å¹¿</span></div>`);
  });
  if (!items.length) return `<div class="tbl-empty">ä¸€åˆ‡æ­£å¸¸ï¼Œæ²¡æœ‰éœ€è¦ç«‹åˆ»å¤„ç†çš„é—®é¢˜</div>`;
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
  if (!shops.length) { toast('å…ˆæ·»åŠ åº—é“º'); return; }
  const html = `
    <div class="stack">
      <div class="grid two">
        <div class="field"><label>æ—¥æœŸ</label><input class="input" type="date" id="dDate" value="${today()}"></div>
        <div class="field"><label>åº—é“º</label>
          <select class="select" id="dShop">${shops.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="grid two">
        <div class="field"><label>é”€å”®é¢ï¼ˆæˆäº¤é‡‘é¢ï¼‰</label><input class="input" id="dSales" type="number" inputmode="decimal" placeholder="0.00"></div>
        <div class="field"><label>è®¢å•æ•°</label><input class="input" id="dOrders" type="number" inputmode="numeric" placeholder="0"></div>
      </div>
      <div class="grid two">
        <div class="field"><label>é€€æ¬¾é‡‘é¢</label><input class="input" id="dRefunds" type="number" inputmode="decimal" placeholder="0.00"></div>
        <div class="field"><label>æŽ¨å¹¿èŠ±è´¹</label><input class="input" id="dAd" type="number" inputmode="decimal" placeholder="0.00"></div>
      </div>
      <div class="field"><label>è®¿å®¢æ•°ï¼ˆå¯é€‰ï¼‰</label><input class="input" id="dVisitors" type="number" inputmode="numeric" placeholder="0"></div>
      <p class="tip" style="font-size:12px;color:var(--ink-3)">æ•°æ®ä»Žæ‹¼å¤šå¤šå•†å®¶åŽå°ã€Œæ•°æ®ä¸­å¿ƒ â†’ ç»è¥æ¦‚å†µã€æŠ„å½•ï¼Œä¸€å¤©å½•ä¸€æ¬¡å³å¯ã€‚æˆæœ¬çŽ‡ã€ä½£é‡‘çŽ‡åœ¨åº—é“ºè®¾ç½®é‡Œé…ç½®ã€‚</p>
    </div>`;
  openDrawer('å½•å…¥æ¯æ—¥æ•°æ®', html, `<button class="btn ghost" data-close>å–æ¶ˆ</button><button class="btn primary" id="dSave">ä¿å­˜</button>`);

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
    toast('å·²ä¿å­˜ ' + date + ' çš„æ•°æ®');
  };
}

function exportDaily() {
  const head = 'æ—¥æœŸ,åº—é“º,é”€å”®é¢,è®¢å•æ•°,é€€æ¬¾,æŽ¨å¹¿è´¹,è®¿å®¢';
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

/* ================= åˆ©æ¶¦ ================= */

function viewProducts() {
  const products = S.data.products;
  const withR = products.map((p) => ({ p, r: productProfit(p) }));
  const avgMargin = withR.length ? withR.reduce((a, x) => a + x.r.grossMargin, 0) / withR.length : 0;
  const loss = withR.filter((x) => x.r.net < 0).length;

  const rows = withR.map(({ p, r }) => {
    const shop = S.data.shops.find((s) => s.id === p.shopId);
    return `
      <tr data-id="${p.id}" style="cursor:pointer">
        <td><strong>${esc(p.name)}</strong><div style="font-size:11px;color:var(--ink-3)">${esc(shop ? shop.name : 'æœªåˆ†é…åº—é“º')}</div></td>
        <td class="num">${money(r.price)}</td>
        <td class="num">${money(r.costSum)}</td>
        <td class="num">${money(r.gross)}</td>
        <td class="num"><span class="pill ${r.grossMargin >= 0.35 ? 'good' : r.grossMargin >= 0.15 ? 'warn' : 'bad'}">${pct(r.grossMargin)}</span></td>
        <td class="num" style="color:${r.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(r.net)}</td>
        <td class="num">${r.breakEvenRoi === Infinity ? 'â€”' : r.breakEvenRoi.toFixed(2)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="page-head">
      <div><h2>åˆ©æ¶¦æ ¸ç®—</h2><p>æŠŠæˆæœ¬æ‘Šå¼€ç®—æ¸…æ¥šï¼Œæ‰çŸ¥é“è¯¥ä¸è¯¥æŠ•æŽ¨å¹¿</p></div>
      <div class="spacer"></div>
      <button class="btn primary sm" data-act="add-product">ï¼‹ æ–°å¢žå•†å“æˆæœ¬å¡</button>
    </div>

    <div class="grid three" style="margin-bottom:14px">
      <div class="stat"><div class="label">å•†å“æ•°</div><div class="value">${products.length}<small>ä¸ª</small></div></div>
      <div class="stat"><div class="label">å¹³å‡æ¯›åˆ©çŽ‡</div><div class="value">${pct(avgMargin)}</div><div class="hint">æ‰£é™¤æˆæœ¬/è¿è´¹/ä½£é‡‘ï¼Œæœªæ‰£æŽ¨å¹¿</div></div>
      <div class="stat ${loss ? 'bad' : 'good'}"><div class="label">æ‰£æŽ¨å¹¿åŽäºæŸ</div><div class="value">${loss}<small>ä¸ª</small></div></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>æˆæœ¬å¡åˆ—è¡¨</h3><span class="sub">ç‚¹å‡»ä¸€è¡Œå¯ç¼–è¾‘</span></div>
      ${products.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>å•†å“</th><th class="num">å”®ä»·</th><th class="num">å•ä»¶æˆæœ¬</th><th class="num">æ¯›åˆ©</th><th class="num">æ¯›åˆ©çŽ‡</th><th class="num">å‡€åˆ©</th><th class="num">ä¿æœ¬ROI</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : `<div class="tbl-empty">è¿˜æ²¡æœ‰å•†å“ï¼Œå…ˆå»ºä¸€å¼ æˆæœ¬å¡è¯•è¯•</div>`}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-head"><h3>æ€Žä¹ˆç”¨è¿™å‡ åˆ—</h3></div>
      <div class="card-body" style="font-size:13px;color:var(--ink-2);line-height:1.9">
        <div><b>æ¯›åˆ©</b> = å”®ä»· âˆ’ å•†å“æˆæœ¬ âˆ’ è¿è´¹ âˆ’ å¹³å°ä½£é‡‘ï¼ˆæœªæ‰£æŽ¨å¹¿è´¹ï¼‰</div>
        <div><b>å‡€åˆ©</b> = æ¯›åˆ© âˆ’ å•ç¬”æŽ¨å¹¿è´¹ âˆ’ é€€æ¬¾æŸè€—ï¼ˆæŒ‰é€€æ¬¾çŽ‡ä¼°ç®—å¾€è¿”è¿è´¹ä¸ŽåŒ…è£…æŸè€—ï¼‰</div>
        <div><b>ä¿æœ¬ROI</b> = å”®ä»· Ã·ï¼ˆå”®ä»· âˆ’ æˆæœ¬ âˆ’ è¿è´¹ âˆ’ ä½£é‡‘ âˆ’ é€€æ¬¾æŸè€—ï¼‰ã€‚æŽ¨å¹¿ ROI ä½ŽäºŽè¿™ä¸ªæ•°å°±æ˜¯åœ¨äºé’±å–ã€‚</div>
        <div><b>ä¿æœ¬å”®ä»·</b> = æˆæœ¬ Ã·ï¼ˆ1 âˆ’ ä½£é‡‘çŽ‡ï¼‰ï¼Œç”¨æ¥åˆ¤æ–­è¿˜èƒ½ä¸èƒ½å†é™ä»·ã€‚</div>
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

  openDrawer(product ? 'ç¼–è¾‘æˆæœ¬å¡' : 'æ–°å¢žæˆæœ¬å¡', `
    <div class="stack">
      <div class="field"><label>å•†å“åç§°</label><input class="input" id="pName" value="${esc(p.name)}" placeholder="ä¾‹å¦‚ï¼šåŠé«˜é¢†åŠ åŽšæ¯›è¡£"></div>
      <div class="field"><label>æ‰€å±žåº—é“º</label><select class="select" id="pShop">${shopOpts}</select></div>
      <div class="grid two">
        <div class="field"><label>å”®ä»·ï¼ˆå…ƒï¼‰</label><input class="input" id="pPrice" type="number" value="${p.price}"></div>
        <div class="field"><label>å¹³å°ä½£é‡‘çŽ‡ï¼ˆ%ï¼‰</label><input class="input" id="pCommission" type="number" step="0.01" value="${p.commission}"><div class="tip">æ‹¼å¤šå¤šå¤šä¸º 0.6%</div></div>
      </div>
      <div class="card-head" style="padding:0;border:0;background:none"><h3 style="font-size:13px;color:var(--ink-2)">å•ä»¶æˆæœ¬</h3></div>
      <div class="grid two">
        <div class="field"><label>é‡‡è´­/ç”Ÿäº§</label><input class="input" id="cMaterial" type="number" value="${p.cost.material}"></div>
        <div class="field"><label>åŠ å·¥/å·¥è´¹</label><input class="input" id="cLabor" type="number" value="${p.cost.labor}"></div>
        <div class="field"><label>è¾…æ–™/åŠç‰Œ</label><input class="input" id="cAcc" type="number" value="${p.cost.accessories}"></div>
        <div class="field"><label>åŒ…è£…</label><input class="input" id="cPack" type="number" value="${p.cost.packaging}"></div>
      </div>
      <div class="grid two">
        <div class="field"><label>å•ä»¶è¿è´¹ï¼ˆå…ƒï¼‰</label><input class="input" id="pShip" type="number" value="${p.shipping}"></div>
        <div class="field"><label>å•ç¬”æŽ¨å¹¿è´¹ï¼ˆå…ƒï¼‰</label><input class="input" id="pAd" type="number" value="${p.adCost}"></div>
      </div>
      <div class="field"><label>é¢„ä¼°é€€æ¬¾çŽ‡ï¼ˆ%ï¼‰</label><input class="input" id="pRefund" type="number" value="${p.refundRate}"></div>
      <div class="card" style="background:var(--surface-2);box-shadow:none" id="pCalc"></div>
    </div>`, `<button class="btn danger" id="pDel">åˆ é™¤</button><button class="btn primary" id="pSave">ä¿å­˜</button>`);

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
          <div><div style="font-size:11px;color:var(--ink-3)">å•ä»¶æ€»æˆæœ¬</div><div style="font-weight:650">${money(r.costSum + r.shipping)}</div></div>
          <div><div style="font-size:11px;color:var(--ink-3)">æ¯›åˆ© / æ¯›åˆ©çŽ‡</div><div style="font-weight:650">${money(r.gross)} Â· ${pct(r.grossMargin)}</div></div>
          <div><div style="font-size:11px;color:var(--ink-3)">å‡€åˆ© / å‡€åˆ©çŽ‡</div><div style="font-weight:650;color:${r.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(r.net)} Â· ${pct(r.netMargin)}</div></div>
          <div><div style="font-size:11px;color:var(--ink-3)">ä¿æœ¬ ROI</div><div style="font-weight:650">${r.breakEvenRoi === Infinity ? 'â€”' : r.breakEvenRoi.toFixed(2)}</div></div>
          <div><div style="font-size:11px;color:var(--ink-3)">ä¿æœ¬å”®ä»·</div><div style="font-weight:650">${money(r.breakEvenPrice)}</div></div>
          <div><div style="font-size:11px;color:var(--ink-3)">é€€æ¬¾æŸè€—</div><div style="font-weight:650">${money(r.refundLoss)}</div></div>
        </div>
      </div>`;
  };

  $$('#drawerOverlay input').forEach((i) => (i.oninput = calc));
  calc();

  $('#pSave').onclick = () => {
    const name = $('#pName').value.trim();
    if (!name) { toast('ç»™å•†å“èµ·ä¸ªåå­—'); return; }
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
    toast('å·²ä¿å­˜');
  };

  $('#pDel').onclick = () => {
    if (!confirm('åˆ é™¤è¿™å¼ æˆæœ¬å¡ï¼Ÿ')) return;
    S.data.products = S.data.products.filter((x) => x.id !== p.id);
    persist();
    closeDrawer();
    renderRoute();
    toast('å·²åˆ é™¤');
  };
}

/* ================= åº—é“º ================= */

function viewShops() {
  const cards = S.data.shops.map((shop) => {
    const st = shopStats(shop.id);
    return `
      <div class="card shop-card" data-id="${shop.id}">
        <div class="accent-bar" style="background:${esc(shop.color || '#c4562b')}"></div>
        <div class="card-body">
          <div class="name">${esc(shop.name)}</div>
          <div class="meta">${esc(shop.note || 'æœªå¡«å†™å¤‡æ³¨')}</div>
          <div class="shop-kv">
            <div><div class="k">è¿è¥æ–¹å¼</div><div class="v" style="font-size:13px">${esc(shop.opMode || 'æœªè®¾ç½®')}</div></div>
            <div><div class="k">ä»·ä½æ®µ</div><div class="v" style="font-size:13px">${esc(shop.band || 'æœªè®¾ç½®')}</div></div>
            <div><div class="k">ç´¯è®¡å‡€åˆ©</div><div class="v" style="color:${st.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(st.net)}</div></div>
            <div><div class="k">å•†å“æ•°</div><div class="v">${S.data.products.filter((p) => p.shopId === shop.id).length}</div></div>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="page-head">
      <div><h2>æˆ‘çš„åº—é“º</h2><p>ä¸€äººå¤šåº—ï¼šæ–°å¼€åº—é“ºåŠ è¿›æ¥ï¼Œæ‰€æœ‰æ•°æ®è‡ªåŠ¨æ±‡æ€»</p></div>
      <div class="spacer"></div>
      <button class="btn primary sm" data-act="add-shop">ï¼‹ æ·»åŠ åº—é“º</button>
    </div>
    ${S.data.shops.length ? `<div class="shop-grid">${cards}</div>` : `<div class="empty"><div class="glyph">â—«</div><h4>è¿˜æ²¡æœ‰åº—é“º</h4><p>å…ˆæŠŠæ­£åœ¨ç»è¥çš„åº—åŠ è¿›æ¥</p><button class="btn primary" data-act="add-shop">ï¼‹ æ·»åŠ åº—é“º</button></div>`}
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3>ä¸ç”¨è‡ªå·±ç®—ï¼Œé€‰ä¸€ä¸‹å°±è¡Œ</h3></div>
      <div class="card-body" style="font-size:13px;color:var(--ink-2);line-height:1.9">
        <div>æ·»åŠ åº—é“ºåªéœ€è¦ï¼šåº—åã€è¿è¥æ–¹å¼ã€ä»·ä½æ®µã€‚ç³»ç»ŸæŒ‰ä»·ä½æ®µè‡ªåŠ¨ä¼°ç®—æˆæœ¬çŽ‡ï¼Œçœ‹æ¿ä¸Šçš„æ¯›åˆ©æ˜¯ä¼°ç®—å€¼ã€‚</div>
        <div>æƒ³ç®—å‡†æŸä¸€ä¸ªæ¬¾ï¼šåŽ»ã€Œåˆ©æ¶¦ã€é¡µå»ºæˆæœ¬å¡ï¼Œå¡«å”®ä»·ã€è¿›è´§ä»·ã€è¿è´¹ã€æ¯å¤©æŽ¨å¹¿è´¹ï¼Œç³»ç»Ÿè‡ªåŠ¨ç®—å‡ºæ¯›åˆ©çŽ‡å’Œä¿æœ¬ ROIã€‚</div>
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
  const s = shop || { id: uid(), name: '', note: '', opMode: 'è‡ªç„¶æµé‡', band: '30-60', costRate: 40, commission: 0.6, color: '#c4562b' };
  const colors = ['#c4562b', '#2f3a30', '#7a6a58', '#3f5b7a', '#8a4b63', '#a8781c'];
  const MODES = ['è‡ªç„¶æµé‡', 'ä»˜è´¹æŽ¨å¹¿', 'ç›´æ’­å¸¦è´§', 'æ´»åŠ¨ç§’æ€', 'å¤šåº—é“ºè´§'];
  const BANDS = ['30å…ƒä»¥ä¸‹', '30-60å…ƒ', '60-100å…ƒ', '100å…ƒä»¥ä¸Š'];
  const BAND_RATE = { '30å…ƒä»¥ä¸‹': 45, '30-60å…ƒ': 40, '60-100å…ƒ': 35, '100å…ƒä»¥ä¸Š': 30 };
  const mode = s.opMode || 'è‡ªç„¶æµé‡';
  let band = s.band || '30-60';
  openDrawer(shop ? 'ç¼–è¾‘åº—é“º' : 'æ·»åŠ åº—é“º', `
    <div class="stack">
      <div class="field"><label>åº—é“ºåç§°</label><input class="input" id="sName" value="${esc(s.name)}" placeholder="ä¾‹å¦‚ï¼šç»‡é—´æ——èˆ°åº—"></div>
      <div class="field"><label>ä¸»è¦è¿è¥æ–¹å¼</label><div class="chip-group" id="sMode">${MODES.map((m) => `<button class="chip ${m === mode ? 'active' : ''}" data-mode="${m}">${m}</button>`).join('')}</div></div>
      <div class="field"><label>ä¸»æµä»·ä½æ®µ</label><div class="chip-group" id="sBand">${BANDS.map((b) => `<button class="chip ${b === band ? 'active' : ''}" data-band="${b}">${b}</button>`).join('')}</div></div>
      <div class="field"><label>å¤‡æ³¨ï¼ˆå¯é€‰ï¼‰</label><input class="input" id="sNote" value="${esc(s.note)}" placeholder="ä¸»è¥ç±»ç›® / é£Žæ ¼ / å…¶ä»–è¦ç‚¹"></div>
      <div class="field"><label>è¯†åˆ«è‰²</label><div class="chip-group" id="sColors">${colors.map((c) => `<button class="chip ${c === s.color ? 'active' : ''}" data-color="${c}" style="width:34px;height:34px;padding:0;background:${c};border-color:${c}"></button>`).join('')}</div></div>
      <div class="hint" style="color:var(--ink-3);font-size:12px">æˆæœ¬çŽ‡ä¸ç”¨ä½ ç®—ï¼šç³»ç»ŸæŒ‰ä»·ä½æ®µè‡ªåŠ¨ä¼°ç®—ï¼Œçœ‹æ¿ä¸Šæ˜¯ä¼°ç®—å€¼ï¼›è¦ç²¾ç¡®åˆ°å•å“ï¼Œåœ¨ã€Œåˆ©æ¶¦ã€é¡µå»ºæˆæœ¬å¡ã€‚</div>
    </div>`, `<button class="btn danger" id="sDel">åˆ é™¤</button><button class="btn primary" id="sSave">ä¿å­˜</button>`);

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
    if (!name) { toast('å¡«ä¸€ä¸ªåº—é“ºå'); return; }
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
    toast('å·²ä¿å­˜');
  };

  $('#sDel').onclick = () => {
    if (!confirm('åˆ é™¤åº—é“ºï¼Ÿè¯¥åº—é“ºä¸‹çš„å•†å“æˆæœ¬å¡ä¸ä¼šè¢«åˆ é™¤ã€‚')) return;
    S.data.shops = S.data.shops.filter((x) => x.id !== s.id);
    persist();
    closeDrawer();
    renderRoute();
  };
}

/* ================= ç´ æå·¥åŠ ================= */

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
      <div><h2>ç´ æå·¥åŠ</h2><p>ä¸Šä¼ ä¸€å¼ å›¾ â†’ æ ‡é¢˜ã€å–ç‚¹ã€SKUã€ä¸»å›¾ã€è¯¦æƒ…é¡µå…¨éƒ¨å‡ºæ¥</p></div>
    </div>

    <div class="studio">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>1 Â· å•†å“å›¾</h3></div>
          <div class="card-body">
            ${S.studioImage
              ? `<div class="thumb"><img src="${S.studioImage.dataUrl}" alt="å•†å“å›¾"><button class="reup" id="reup">æ¢å›¾</button></div>`
              : `<div class="dropzone" id="dz"><div class="dz-icon">â¬†</div><p>ç‚¹å‡»ä¸Šä¼  / æ‹ç…§</p><div class="dz-hint">å»ºè®®ç™½åº•æˆ–å¹²å‡€èƒŒæ™¯ï¼Œæ­£æ–¹å½¢æœ€å¥½</div></div>`}
            <input type="file" id="fileInput" accept="image/*" hidden>
            ${S.studioImage && S.data.settings && S.data.settings.ai && S.data.settings.ai.apiKey ? `
              <div style="margin-top:12px"><button class="btn primary" id="arkGenTop" style="width:100%">ç”¨ç«å±±æ–¹èˆŸç”Ÿæˆæ¨¡ç‰¹å›¾ï¼ˆå…ˆå‡º 1 å¼ é¢„è§ˆï¼‰</button></div>
              <p style="font-size:12px;color:var(--ink-3);margin:6px 0 0">å…ˆå‡º 1 å¼ é¢„è§ˆçœ‹äººè„¸å’Œé£Žæ ¼ï¼Œæ»¡æ„äº†å†æ‰¹é‡å‡ºï¼Œä¸ç‚¹ä¸æ‰£é’±ã€‚</p>
            ` : (S.studioImage ? `
              <div class="no-key">
                <b>è¿˜æ²¡å¡«ç«å±±æ–¹èˆŸ Key</b>
                <p>æ‰€ä»¥è¿™å¼ å›¾ä¸ä¼šè¯†åˆ«é¢œè‰²ï¼Œä¹Ÿä¸ä¼šç”Ÿæˆæ¨¡ç‰¹å›¾ã€‚å¡«ä¸€æ¬¡ Key å°±èƒ½è‡ªåŠ¨è¯†åˆ«ã€‚</p>
                <button class="btn primary sm" id="goSettings">åŽ»è®¾ç½®å¡« Key</button>
              </div>` : '')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>ä¸€é”®æ¢è£…ï¼ˆå¯é€‰ï¼‰</h3><span class="sub">ä¿ç•™å§¿åŠ¿ï¼Œæ¢æˆä½ çš„è¡£æœ</span></div>
          <div class="card-body">
            <p style="font-size:12px;color:#7a5a1e;background:#fff7e6;border:1px solid #ffd591;border-radius:8px;padding:8px 10px;margin:0 0 10px;line-height:1.7">
              ä¸€æ¬¡å¯é€‰å¤šå¼ çˆ†æ¬¾å›¾åšå§¿åŠ¿å‚è€ƒã€‚å·¥å…·ä¼šè‡ªåŠ¨æ¢æˆæ–°é¢å­”ï¼Œé™ä½Žè‚–åƒæƒé£Žé™©ï¼›ä½†è¯·åªä½¿ç”¨ä½ æœ‰æƒä½¿ç”¨çš„å›¾ç‰‡ï¼Œä¸è¦ç›´æŽ¥æ‹¿åŒè¡Œæ¨¡ç‰¹æ­£è„¸ä¸Šæž¶ã€‚
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
              ${S.swapImages.map((im, i) => `
                <div style="position:relative;width:90px">
                  <img src="${im.dataUrl}" style="width:90px;height:120px;object-fit:cover;border-radius:6px;border:1px solid var(--line)" alt="å‚è€ƒå›¾${i+1}">
                  <button class="reup" data-swap-del="${i}" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#fff;border:1px solid var(--line);font-size:12px;line-height:1;padding:0">Ã—</button>
                  <div style="font-size:11px;color:var(--ink-3);text-align:center;margin-top:2px">å‚è€ƒå›¾ ${i+1}</div>
                </div>`).join('')}
              <div class="dropzone" id="swapDz" style="width:90px;height:120px;min-height:auto;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
                <div class="dz-icon" style="font-size:20px">+</div>
                <div style="font-size:11px;color:var(--ink-3)">æ·»åŠ </div>
              </div>
            </div>
            <input type="file" id="swapFile" accept="image/*" multiple hidden>
            <div style="margin-top:8px">
              <button class="btn primary" id="swapBtn" style="width:100%">${S.swapImages.length ? 'ä¸€é”®å…¨éƒ¨æ¢è£…ï¼ˆ' + S.swapImages.length + ' å¼ ï¼‰' : 'æ¢è£…ç”Ÿæˆï¼ˆæ”¶è´¹ï¼‰'}</button>
            </div>
            <div id="swapStatus" style="font-size:12px;color:var(--ink-3);margin-top:6px;min-height:18px">${esc(S.swapStatus || (S.swapImages.length ? 'ç‚¹ã€Œä¸€é”®å…¨éƒ¨æ¢è£…ã€ä¼šå¯¹æ¯å¼ å‚è€ƒå›¾å„å‡º 1 å¼ ' : 'ä¼šå…ˆæç¤ºè´¹ç”¨ï¼Œç¡®è®¤åŽæ‰æ‰£é’±'))}</div>
            ${S.studioAiImages && S.studioAiImages.some((x) => /æ¢è£…/.test(x.label)) ? `<div class="canvas-grid" style="margin-top:10px">${S.studioAiImages.filter((x) => /æ¢è£…/.test(x.label)).map((it) => `
              <div class="canvas-card">
                <a href="${it.url}" target="_blank" rel="noopener"><img src="${it.url}" alt="${esc(it.label)}"></a>
                <div class="cc-foot"><span>${esc(it.label)}</span><span style="margin-left:auto"></span><a class="btn sm dlOne" href="${it.url}" data-url="${it.url}" data-name="${esc(it.label)}">ä¸‹è½½</a></div>
              </div>`).join('')}</div>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>3 Â· å•†å“æ ‡ç­¾</h3><span class="sub">è‡ªåŠ¨è¯†åˆ«ï¼Œå¯æ”¹</span>
            <div style="margin-left:auto"><button class="btn sm" id="tagToggle">${S.tagOpen ? 'æ”¶èµ·' : 'ä¿®æ”¹æ ‡ç­¾'}</button></div>
          </div>
          <div class="card-body">
            <div style="font-size:13px;line-height:1.9;color:var(--ink-2)">
              ${esc([i.category, i.wearStyle, (i.materials || []).join('ã€'), i.fiber, i.pattern, i.neck, i.fit, i.length, i.sleeveLen, i.sleeveType, i.mainStyle, i.subStyle, i.weight, i.age, i.fleece, i.season, (i.colors || []).length ? (i.colors || []).join('ã€') + 'ï¼ˆ' + (i.colors || []).length + ' è‰²ï¼‰' : ''].filter(Boolean).join(' Â· '))}
              ${S.aiStatus
                ? `<div id="aiStatus" class="ai-status ${/å¤±è´¥/.test(S.aiStatus) ? 'bad' : (/è¯†åˆ«æˆåŠŸ/.test(S.aiStatus) ? 'good' : '')}">${esc(S.aiStatus)}</div>`
                : '<div style="color:var(--ink-3);font-size:12px">ä¸Šä¼ å›¾ç‰‡åŽè‡ªåŠ¨è¯†åˆ«ï¼Œä¸å‡†å¯ä»¥ç‚¹ã€Œä¿®æ”¹æ ‡ç­¾ã€æˆ–é‡æ–°è¯†åˆ«</div>'}
              ${S.data.settings && S.data.settings.ai && S.data.settings.ai.apiKey ? `<button class="btn sm" id="aiRecognizeBtn" style="margin-top:8px">é‡æ–°è¯†åˆ«ä¸€æ¬¡</button>` : ''}
            </div>
            ${S.tagOpen ? `
            <div style="margin-top:14px">
              <div class="param-block">
                <div class="plabel"><span>å“ç±»</span></div>
                ${chipGroup('category', OPTIONS.category, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>ä¸»é¢æ–™æˆåˆ†</span><span class="opt">å¯å¤šé€‰ï¼Œç¬¬ä¸€ä¸ªç®—ä¸»æˆåˆ†</span></div>
                ${chipGroup('materials', OPTIONS.material, true)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>ç©¿ç€æ–¹å¼</span></div>
                ${chipGroup('wearStyle', OPTIONS.wearStyle, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>é¢æ–™ä¿—ç§°</span></div>
                ${chipGroup('fiber', OPTIONS.fiber, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>å›¾æ¡ˆ</span></div>
                ${chipGroup('pattern', OPTIONS.pattern, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>é¢†åž‹</span></div>
                ${chipGroup('neck', OPTIONS.neck, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>ç‰ˆåž‹</span></div>
                ${chipGroup('fit', OPTIONS.fit, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>è¡£é•¿</span></div>
                ${chipGroup('length', OPTIONS.length, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>è¢–é•¿</span></div>
                ${chipGroup('sleeveLen', OPTIONS.sleeveLen, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>è¢–åž‹</span></div>
                ${chipGroup('sleeveType', OPTIONS.sleeveType, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>é€‚ç”¨å¹´é¾„</span></div>
                ${chipGroup('age', OPTIONS.age, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>æ˜¯å¦åŠ ç»’</span></div>
                ${chipGroup('fleece', OPTIONS.fleece, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>æµè¡Œå…ƒç´ </span><span class="opt">å¯å¤šé€‰</span></div>
                ${chipGroup('elements', OPTIONS.elements, true)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>ä¸»é£Žæ ¼</span><span class="opt">åªèƒ½é€‰ 1 ä¸ª</span></div>
                ${chipGroup('mainStyle', OPTIONS.mainStyle, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>é£Žæ ¼</span></div>
                ${chipGroup('subStyle', OPTIONS.subStyle, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>åŽšè–„</span></div>
                ${chipGroup('weight', OPTIONS.weight, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>é€‚ç”¨å­£èŠ‚</span></div>
                ${chipGroup('season', OPTIONS.season, false)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>é¢œè‰²</span><span class="opt">å¯å¤šé€‰ï¼Œæ¼äº†å°±æ‰‹åŠ¨åŠ </span></div>
                ${chipGroup('colors', Array.from(new Set([].concat(OPTIONS.color, (S.studioInput.colors || [])))), true)}
                <div style="display:flex;gap:8px;margin-top:8px">
                  <input class="input" id="colorCustom" placeholder="æ‰‹åŠ¨è¡¥é¢œè‰²ï¼Œå¦‚ï¼šæµ…ç´«è‰²">
                  <button class="btn sm" id="colorAdd" style="white-space:nowrap">æ·»åŠ </button>
                </div>
              </div>
              <div class="param-block">
                <div class="plabel"><span>å°ºç </span><span class="opt">å¯å¤šé€‰</span></div>
                ${chipGroup('sizes', OPTIONS.size, true)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>åœºæ™¯</span><span class="opt">å¯å¤šé€‰</span></div>
                ${chipGroup('scene', OPTIONS.scene, true)}
              </div>
              <div class="param-block">
                <div class="plabel"><span>å”®ä»·ï¼ˆå…ƒï¼‰</span></div>
                <input class="input" id="stuPrice" type="number" value="${esc(i.price)}">
              </div>
              <div class="param-block">
                <div class="plabel"><span>é¢å¤–å…³é”®è¯</span><span class="opt">é€‰å¡«ï¼Œé€—å·åˆ†éš”</span></div>
                <input class="input" id="stuExtra" value="${esc(i.extra)}" placeholder="å¦‚ï¼šå¤§ç ã€å­•å¦‡å¯ç©¿ã€å¯æœºæ´—">
              </div>
            </div>` : ''}
            <div style="margin-top:16px">
              <button class="btn primary block" id="genBtn">${hasKit ? 'é‡æ–°ç”Ÿæˆå…¨éƒ¨ç´ æ' : 'ä¸€é”®ç”Ÿæˆå…¨éƒ¨ç´ æ'}</button>
            </div>
          </div>
        </div>
      </div>

      <div>
        ${hasKit ? renderStudioResult() : `
          <div class="card"><div class="empty" style="padding:60px 20px">
            <div class="glyph">âœ³</div>
            <h4>å·¦è¾¹é€‰å¥½æ ‡ç­¾ï¼Œç‚¹ã€Œä¸€é”®ç”Ÿæˆã€</h4>
            <p>ä¼šç”Ÿæˆ 6 ç»„æ ‡é¢˜ã€8 æ¡å–ç‚¹ã€SKU è§„æ ¼è¡¨ã€5 å¼ ä¸»å›¾ã€1 å¼ è¯¦æƒ…é•¿å›¾ã€ä¸€æ•´å¥—å±žæ€§è¡¨</p>
          </div></div>`}
      </div>
    </div>`;
}

function renderStudioResult() {
  const kit = S.studioKit;
  const tab = S.studioResultTab;
  const tabs = [
    ['titles', 'æ ‡é¢˜'],
    ['points', 'å–ç‚¹'],
    ['skus', 'SKU'],
    ['images', 'æœ¬åœ°æ‹¼å›¾'],
    ['ark', 'ç«å±±æ¨¡ç‰¹å›¾'],
    ['jimeng', 'å³æ¢¦æç¤ºè¯'],
    ['detail', 'è¯¦æƒ…é¡µ'],
    ['attrs', 'å±žæ€§è¡¨']
  ];

  let body = '';

  if (tab === 'titles') {
    body = kit.titles.map((t, i) => `
      <div class="title-item">
        <div class="idx">${i + 1}</div>
        <div>
          <div class="txt">${esc(t.text)}</div>
          <div class="meta ${t.len > 60 ? 'over' : ''}">${t.kind} Â· ${t.len} å­—${t.len > 60 ? 'ï¼ˆè¶…å‡º 60ï¼Œéœ€åˆ å‡ï¼‰' : ''}</div>
        </div>
        <div class="acts"><button class="btn sm" data-copy="${esc(t.text)}">å¤åˆ¶</button></div>
      </div>`).join('');
  }

  if (tab === 'points') {
    body = `<div class="copy-list">${kit.sellingPoints.map((p) => `
      <div class="copy-block">
        <div class="cb-head"><span>${p.icon} ${esc(p.text)}</span><span class="spacer"></span><button class="btn sm" data-copy="${esc(p.text)}ï¼š${esc(p.desc)}">å¤åˆ¶</button></div>
        <pre>${esc(p.desc)}</pre>
      </div>`).join('')}</div>`;
  }

  if (tab === 'skus') {
    body = `
      <div class="card"><div class="card-head"><h3>${kit.skus.length} ä¸ª SKU</h3><span class="sub">ä»·æ ¼ã€åº“å­˜å¯ç›´æŽ¥æ”¹</span></div>
      <div class="table-wrap"><table class="tbl sku-table">
        <thead><tr><th>è§„æ ¼1</th><th>è§„æ ¼2</th><th>æ‹¼å¤šå¤šè§„æ ¼å</th><th class="num">ä»·æ ¼</th><th class="num">åº“å­˜</th><th>ç¼–ç </th></tr></thead>
        <tbody>${kit.skus.map((s, idx) => `<tr>
          <td>${esc(s.spec1)}</td><td>${esc(s.spec2)}</td><td>${esc(s.pddName)}</td>
          <td class="num"><input type="number" value="${s.price}" data-sku-price="${idx}"></td>
          <td class="num"><input type="number" value="${s.stock}" data-sku-stock="${idx}"></td>
          <td>${esc(s.code)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="card-body" style="border-top:1px solid var(--line)"><button class="btn sm" id="copySku">å¤åˆ¶ä¸º CSVï¼ˆå¯ç²˜è´´åˆ°è¡¨æ ¼ï¼‰</button></div>
      </div>`;
  }

  if (tab === 'images') {
    body = `
      <div class="row" style="margin-bottom:12px">
        <button class="btn sm primary" id="dlAll">ä¸‹è½½å…¨éƒ¨ä¸»å›¾</button>
        <button class="btn sm" id="dlDetail">ä¸‹è½½è¯¦æƒ…é•¿å›¾</button>
        <span class="sub" style="font-size:12px;color:var(--ink-3)">800Ã—800 PNG Â· è¯¦æƒ… 750px å®½</span>
      </div>
      <div class="canvas-grid" id="canvasGrid"></div>`;
  }

  if (tab === 'ark') {
    const ai = (S.data.settings && S.data.settings.ai) || {};
    const hasKey = Boolean(ai.apiKey);
    const aiImgs = S.studioAiImages || [];
    body = `
      <div class="card">
        <div class="card-head"><h3>ç«å±±æ–¹èˆŸç”Ÿæˆæ¨¡ç‰¹å›¾</h3><span class="sub">æ‰‹åŠ¨ç‚¹ï¼Œç¡®è®¤åŽæ‰£è´¹</span>
          <button class="btn sm" id="arkBalanceBtn" style="margin-left:auto">æŸ¥ä½™é¢</button>
        </div>
        <div class="card-body">
          <div id="arkBalanceBox" style="display:none;font-size:13px;background:#f6ffed;border:1px solid #b7eb8f;border-radius:8px;padding:8px 10px;margin-bottom:10px;line-height:1.7"></div>
          ${hasKey ? `
            <div style="font-size:13px;color:var(--ink-2);margin-bottom:10px">
              è¯†åˆ«åˆ°çš„é¢œè‰²ï¼š<strong>${esc((S.studioInput.colors && S.studioInput.colors.length ? S.studioInput.colors.join('ã€') : 'æœªè¯†åˆ«ï¼ˆæŒ‰ 1 ä¸ªé¢œè‰²ç®—ï¼‰'))}</strong>
              <span style="color:var(--ink-3)">ï¼ˆ${S.studioInput.colors && S.studioInput.colors.length ? S.studioInput.colors.length : 1} ä¸ªé¢œè‰²ï¼Œæ¯ä¸ªé¢œè‰²å•ç‹¬å‡ºï¼‰</span>
            </div>
            <div class="row" style="gap:16px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
              <label style="font-size:13px;color:var(--ink-2)">æ¯ä¸ªé¢œè‰²ä¸»å›¾
                <select id="arkMainCount" style="margin:0 4px">
                  ${[2,3,4,5].map((n) => `<option value="${n}" ${S.arkCounts.mainPer === n ? 'selected' : ''}>${n}</option>`).join('')}
                </select>å¼ 
              </label>
              <label style="font-size:13px;color:var(--ink-2)">æ¯ä¸ªé¢œè‰²è¯¦æƒ…å›¾
                <select id="arkDetailCount" style="margin:0 4px">
                  ${[0,1,2,3].map((n) => `<option value="${n}" ${S.arkCounts.detailPer === n ? 'selected' : ''}>${n}</option>`).join('')}
                </select>å¼ 
              </label>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:13px">
              <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">å‡ºå›¾é£Žæ ¼
                <select id="arkPhotoStyle" style="margin:0 4px">
                  <option value="auto" ${(S.arkCounts.photoStyle || 'auto') === 'auto' ? 'selected' : ''}>è‡ªåŠ¨éšæœºï¼ˆæ¯æ¬¾ç»Ÿä¸€é£Žæ ¼ï¼‰</option>
                  <option value="flatlay" ${S.arkCounts.photoStyle === 'flatlay' ? 'selected' : ''}>å…¨å¹³é“ºæŒ‚æ‹ï¼ˆæ— æ¨¡ç‰¹ï¼‰</option>
                  <option value="lifestyle" ${S.arkCounts.photoStyle === 'lifestyle' ? 'selected' : ''}>å…¨ç´ äººæ¨¡ç‰¹éšæ‰‹æ‹</option>
                </select>
              </label>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:13px">
              <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">
                <input type="checkbox" id="arkSimpleSku" ${S.arkCounts.simpleSku ? 'checked' : ''}>
                æœ‰ç®€é…ç‰ˆï¼ˆä½Žä»· SKU å¼•æµï¼Œå¤šå‡º 1 å¼ ï¼‰
              </label>
              <input id="arkSimpleNote" type="text" value="${esc(S.arkCounts.simpleNote)}" placeholder="ç®€é…å·®å¼‚ï¼Œä¾‹å¦‚ï¼šä¸å¸¦ä¸å¸¦" style="flex:1;min-width:140px">
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:13px">
              <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">
                <input type="checkbox" id="arkNoAcc" ${S.arkCounts.noAccessory ? 'checked' : ''}>
                ä¸å¸¦è£…é¥°ï¼ˆåªç”Ÿæˆè¡£æœæœ¬ä½“ï¼Œå…¨éƒ¨å›¾éƒ½ç”Ÿæ•ˆï¼‰
              </label>
              <input id="arkAccList" type="text" value="${esc(S.arkCounts.accessoryList)}" placeholder="è¦åŽ»æŽ‰çš„è£…é¥°ï¼Œä¾‹å¦‚ï¼šä¸å¸¦ã€è´è¶ç»“" style="flex:1;min-width:140px">
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:13px">
              <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">
                <input type="checkbox" id="arkAntiCompare" ${S.arkCounts.antiCompare ? 'checked' : ''}>
                é˜²æ¯”ä»·æ¨¡å¼ï¼ˆæ¢è§’åº¦/é®æŒ¡1/3/æ¢æž„å›¾ï¼Œè®©å¹³å°è®¤ä¸å‡ºæ˜¯åŒæ¬¾ï¼‰
              </label>
            </div>
            <div style="font-size:12px;color:var(--ink-3);line-height:1.6;margin:-4px 0 10px">
              é˜²æ¯”ä»·åŽŸç†ï¼šå¹³å°ä¼šæ¯”å¯¹ä¸»å›¾ã€SKUå›¾ã€SKUæ–‡å­—ï¼ˆæƒé‡æœ€é«˜ï¼‰ã€æ ‡é¢˜ã€å±žæ€§ï¼Œç›¸åŒç‰¹å¾è¶…é˜ˆå€¼å°±åˆ¤åŒæ¬¾ã€æŠ¥æ´»åŠ¨è¢«åŽ‹ä»·ã€‚SKU å›¾ç›´æŽ¥ç”¨ç”Ÿæˆå¥½çš„ä¸»å›¾å°±è¡Œï¼Œä¸ç”¨å¦å¤–èŠ±é’±ç”Ÿæˆï¼›SKU æ–‡å­—ä¼šè‡ªåŠ¨åšå˜ä½“ã€‚<br>
              æ–°å“æ ‡ï¼ˆæœè£…ç±»ç›®æœ‰æ•ˆæœŸ 30 å¤©ï¼‰ï¼šéœ€åº—é“ºè¿‘ 90 å¤© DSR ä¸‰é¡¹é«˜äºŽåŒè¡Œï¼Œä¸”å±žæ€§å¡«å…¨ã€å›¾ç‰‡åŽŸåˆ›ï¼Œç”±å¹³å°è‡ªåŠ¨åˆ¤å®šï¼Œæ— æ³•æ‰‹åŠ¨æŠ¥åã€‚
            </div>
            <div class="row" style="margin-bottom:8px;flex-wrap:wrap;gap:8px">
              ${S.arkPendingJobs && S.arkPendingJobs.length ? `
                <button class="btn primary" id="arkContinueBtn">ç»§ç»­ç”Ÿæˆå‰©ä½™ ${S.arkPendingJobs.length} å¼ </button>
                <button class="btn sm" id="arkRestartBtn">ä¸¢æŽ‰é¢„è§ˆï¼Œé‡æ–°å‡º</button>
              ` : `
                <button class="btn primary" id="arkGenBtn">å…ˆç”Ÿæˆ 1 å¼ é¢„è§ˆï¼ˆçº¦ 0.1~1 å…ƒï¼‰</button>
                ${aiImgs.length ? `<button class="btn sm" id="arkClearBtn">æ¸…ç©º</button>` : ''}
              `}
            </div>
            <div id="arkStatus" style="font-size:13px;color:var(--ink-2);min-height:20px;margin-bottom:12px">${esc(S.arkStatus || (S.arkPendingJobs && S.arkPendingJobs.length ? 'é¢„è§ˆå›¾å·²å‡ºï¼Œæ»¡æ„å°±ç‚¹ã€Œç»§ç»­ç”Ÿæˆã€ï¼Œä¸æ»¡æ„å°±ã€Œä¸¢æŽ‰é¢„è§ˆï¼Œé‡æ–°å‡ºã€' : (aiImgs.length ? 'å·²ç”Ÿæˆ ' + aiImgs.length + ' å¼ ' : 'å»ºè®®å…ˆå‡º 1 å¼ çœ‹çœ‹äººè„¸å’Œé£Žæ ¼ï¼Œæ»¡æ„äº†å†æ‰¹é‡å‡ºï¼Œçœå¾—æµªè´¹é’±')))}</div>
            ${aiImgs.length ? `<div class="row" style="margin-bottom:10px">
                <button class="btn sm primary" id="arkDlAll">å…¨éƒ¨ä¸‹è½½ï¼ˆ${aiImgs.length} å¼ ï¼‰</button>
                <span class="sub" style="font-size:12px;color:var(--ink-3)">æ‰“åŒ…æˆ 1 ä¸ª zip ä¸‹è½½ï¼Œä¸ä¼šä¸€å¼ å¼ å¼¹çª—</span>
              </div><div class="canvas-grid">${aiImgs.map((it) => `
              <div class="canvas-card">
                <a href="${it.url}" target="_blank" rel="noopener"><img src="${it.url}" alt="${esc(it.label)}"></a>
                <div class="cc-foot"><span>${esc(it.label)}</span><span style="margin-left:auto"></span>
                  <a class="btn sm dlOne" href="${it.url}" data-url="${it.url}" data-name="${esc(it.label)}">ä¸‹è½½</a></div>
              </div>`).join('')}</div>` : ''}
          ` : `
            <div class="tbl-empty" style="margin-bottom:12px">è¿˜æ²¡å¡«ç«å±±æ–¹èˆŸ Keyï¼Œä¸èƒ½ç›´æŽ¥å‡ºå›¾ã€‚</div>
            <button class="btn" id="arkGoSettings">åŽ»è®¾ç½®å¡« Key</button>
          `}
        </div>
      </div>`;
  }

  if (tab === 'jimeng') {
    const jmOpts = Object.assign({ photoStyle: S.arkCounts.photoStyle || 'blend', count: 4, seed: 0 }, arkAccOpts() || {});
    const variants = buildJimengPrompts(S.studioInput, jmOpts);
    const videoVariants = buildJimengVideoPrompts(S.studioInput);
    body = `
      <div class="card">
        <div class="card-head"><h3>å³æ¢¦å›¾ç‰‡æç¤ºè¯</h3><span class="sub">å…è´¹ï¼Œå¤åˆ¶çš„è¶Šå°‘è¶Šå¥½ç”¨</span></div>
        <div class="card-body">
          <p style="font-size:12px;color:var(--ink-3);margin:0 0 12px">å³æ¢¦é€‰ã€Œå›¾ç”Ÿå›¾ã€ï¼Œä¸Šä¼ åŒä¸€å¼ å®žæ‹å›¾ï¼Œç²˜è´´ä¸‹é¢ä»»æ„ä¸€æ¡å³å¯ã€‚</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:13px">
            <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">å‡ºå›¾é£Žæ ¼
              <select id="jimengPhotoStyle" style="margin:0 4px">
                <option value="blend" ${(S.arkCounts.photoStyle || 'blend') === 'blend' ? 'selected' : ''}>èžåˆæŽ¨èï¼ˆç§è‰æ°›å›´ + ä¸»å›¾è´¨æ„Ÿï¼‰</option>
                <option value="lifestyle" ${S.arkCounts.photoStyle === 'lifestyle' ? 'selected' : ''}>çº¯ç”Ÿæ´»ç§è‰</option>
                <option value="studio" ${S.arkCounts.photoStyle === 'studio' ? 'selected' : ''}>çº¯ç”µå•†å®žæ‹ä¸»å›¾</option>
              </select>
            </label>
            <label style="display:flex;align-items:center;gap:6px;color:var(--ink-2)">
              <input type="checkbox" id="jimengNoAcc" ${S.arkCounts.noAccessory ? 'checked' : ''}>
              ä¸å¸¦è£…é¥°ï¼ˆåªå–è¡£æœæœ¬ä½“ï¼‰
            </label>
            <input id="jimengAccList" type="text" value="${esc(S.arkCounts.accessoryList)}" placeholder="è¦åŽ»æŽ‰çš„è£…é¥°ï¼Œä¾‹å¦‚ï¼šä¸å¸¦ã€è´è¶ç»“" style="flex:1;min-width:140px" ${S.arkCounts.noAccessory ? '' : 'disabled'}>
          </div>
          ${S.studioImage ? '' : `<div class="tbl-empty" style="margin-bottom:12px">è¯·å…ˆä¸Šä¼ å•†å“å›¾</div>`}
          <div class="copy-list">
            ${variants.map((v, i) => `
              <div class="copy-block">
                <div class="cb-head">
                  <span><strong>${i + 1}. ${esc(v.name)}</strong></span>
                  <span class="spacer"></span>
                  <button class="btn sm primary" data-copy="${esc(v.prompt)}">å¤åˆ¶æç¤ºè¯</button>
                </div>
                <pre>${esc(v.prompt)}</pre>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>å³æ¢¦è§†é¢‘æç¤ºè¯</h3><span class="sub">5 ç§’ Â· 1:1</span></div>
        <div class="card-body">
          <p style="font-size:12px;color:var(--ink-3);margin:0 0 12px">å³æ¢¦é€‰ã€Œå›¾ç”Ÿè§†é¢‘ã€ï¼Œæ—¶é•¿ 5 ç§’ã€æ¯”ä¾‹ 1:1ï¼Œç²˜è´´ä¸‹é¢è¿™æ¡ã€‚</p>
          <div class="copy-list">
            ${videoVariants.map((v, i) => `
              <div class="copy-block">
                <div class="cb-head">
                  <span><strong>${i + 1}. ${esc(v.name)}</strong></span>
                  <span class="spacer"></span>
                  <button class="btn sm primary" data-copy="${esc(v.prompt)}">å¤åˆ¶æç¤ºè¯</button>
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
        <button class="btn sm" data-copy="${esc(s.lines.join('\n'))}">å¤åˆ¶</button></div>
        <pre>${esc(s.lines.join('\n'))}</pre>
      </div>`).join('')}
      <button class="btn block" data-copy="${esc(detailToText(kit))}">å¤åˆ¶æ•´ç¯‡è¯¦æƒ…é¡µæ–‡æ¡ˆ</button></div>`;
  }

  if (tab === 'attrs') {
    body = `<div class="card"><div class="card-head"><h3>æ‹¼å¤šå¤šå•†å“å±žæ€§</h3><span class="sub">ä¸Šæž¶æ—¶ç…§å¡«</span></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>å±žæ€§</th><th>å¡«å†™å€¼</th></tr></thead>
        <tbody>${kit.attrs.map(([k, v]) => `<tr><td style="color:var(--ink-2)">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</tbody>
      </table></div>
      <div class="card-body" style="border-top:1px solid var(--line)">
        <button class="btn sm" data-copy="${esc(kit.attrs.map(([k, v]) => k + 'ï¼š' + v).join('\n'))}">å¤åˆ¶å…¨éƒ¨å±žæ€§</button>
        <p style="font-size:12px;color:var(--ink-3);margin-top:10px">å­—æ®µä¸Žæ‹¼å¤šå¤šå¥³è£…æ¯›è¡£å‘å¸ƒé¡µä¸€è‡´ï¼ˆå“ç‰Œã€ç©¿ç€æ–¹å¼ã€åŽšè–„ã€è¡£é•¿ã€é¢†åž‹ã€è¢–é•¿ã€è¢–åž‹ã€æœè£…ç‰ˆåž‹ã€å›¾æ¡ˆã€ä¸»é¢æ–™æˆåˆ†ã€æˆåˆ†å«é‡ã€é¢æ–™ä¿—ç§°ã€é€‚ç”¨å¹´é¾„ã€æµè¡Œå…ƒç´ ã€æ˜¯å¦åŠ ç»’ã€ä¸Šå¸‚æ—¶èŠ‚ã€ä¸»é£Žæ ¼ã€é£Žæ ¼ï¼‰ã€‚æˆåˆ†å«é‡æ˜¯è‰ç¨¿å€¼ï¼ŒåŠ¡å¿…æŒ‰åŠç‰Œå®žé™…ç™¾åˆ†æ¯”æ”¹ï¼Œå¹³å°ä¼šæŠ½æ£€ã€‚</p>
      </div></div>`;
  }

  return `
    <div class="card">
      <div class="card-head">
        <h3>ç”Ÿæˆç»“æžœ</h3><span class="sub">${new Date(kit.generatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
        <div style="margin-left:auto"><button class="btn sm" id="saveMaterial">ä¿å­˜åˆ°ç´ æåº“</button></div>
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
      toast('å·²æ·»åŠ é¢œè‰²ï¼š' + v);
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
        if (file.size > 10 * 1024 * 1024) { toast(file.name + ' å¤ªå¤§ï¼Œè·³è¿‡'); continue; }
        try {
          const { img, dataUrl } = await loadImageFromFile(file);
          S.swapImages.push({ img, dataUrl, aiUrl: toAiJpeg(img, 1500) });
          added++;
        } catch (_) { toast(file.name + ' è¯»å–å¤±è´¥ï¼Œè·³è¿‡'); }
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
      if (file.size > 10 * 1024 * 1024) { toast('å›¾ç‰‡å¤ªå¤§ï¼Œè¯·åŽ‹ç¼©åˆ° 10MB ä»¥å†…'); return; }
      try {
        const { img, dataUrl } = await loadImageFromFile(file);
        // ç»™ AI ç”¨çš„å›¾ï¼šç»Ÿä¸€è½¬æˆ JPEGï¼Œæœ€é•¿è¾¹ 1500ï¼Œæ‹¼å›¾å¤šé¢œè‰²ä¹Ÿèƒ½çœ‹æ¸…
        const aiUrl = toAiJpeg(img, 1500);
        S.studioImage = { img, dataUrl, aiUrl, assetUrl: null };
        S.studioAiImages = [];
        S.arkFaceRef = null;
        S.arkIdentity = null;
        S.arkLight = null;
        S.arkPendingJobs = null;
        S.aiStatus = '';
        S.arkStatus = '';
        S.studioResultTab = 'ark';
        // å…ˆç”¨å½“å‰æ ‡ç­¾ç”Ÿæˆä¸€ç‰ˆï¼Œä¿è¯ã€Œç”Ÿæˆæ¨¡ç‰¹å›¾ã€æŒ‰é’®ç«‹åˆ»å¯è§
        S.studioKit = generateKit(S.studioInput, Number(S.studioInput.price) || 0);
        renderRoute();
        bindRoute();
        // é…äº† Key å°±è‡ªåŠ¨è¯†åˆ«é£Žæ ¼ï¼Œæ²¡é…å°±ç­‰ç”¨æˆ·æ‰‹åŠ¨é€‰æ ‡ç­¾
        if (S.data && S.data.settings && S.data.settings.ai && S.data.settings.ai.apiKey) {
          await autoRecognize();
        }
      } catch (_) {
        toast('å›¾ç‰‡è¯»å–å¤±è´¥');
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
      if (!S.studioImage) { toast('å…ˆä¸Šä¼ ä¸€å¼ å•†å“å›¾'); return; }
      S.studioKit = generateKit(S.studioInput, Number(S.studioInput.price));
      S.studioResultTab = 'titles';
      renderRoute();
      bindRoute();
      toast('ç´ æå·²ç”Ÿæˆ');
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
          <button class="btn sm" data-dl="${x.key}">ä¸‹è½½</button></div>
      </div>`).join('');
    $$('#view [data-dl]').forEach((b) => {
      b.onclick = () => {
        const item = images.find((x) => x.key === b.dataset.dl);
        if (item) downloadCanvas(item.c, item.label.replace(/[Â·\s]/g, '_') + '.png');
      };
    });
    const dlAll = $('#dlAll');
    if (dlAll) dlAll.onclick = () => images.forEach((x, i) => setTimeout(() => downloadCanvas(x.c, (i + 1) + '.png'), i * 350));
    const dlDetail = $('#dlDetail');
    if (dlDetail) dlDetail.onclick = () => {
      const d = buildDetailImage(S.studioImage.img, S.studioKit, input);
      downloadCanvas(d.c, 'è¯¦æƒ…é•¿å›¾.png');
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
    downloadAsZip(imgs, `æ¯›è¡£ç´ æ_${stamp}.zip`);
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
    S.aiStatus = 'æ­£åœ¨è¯†åˆ«æ‹¼å¤šå¤šå±žæ€§ï¼ˆæè´¨ã€å›¾æ¡ˆã€é¢†åž‹ã€ç‰ˆåž‹ã€è¡£é•¿ã€è¢–åž‹ã€é£Žæ ¼ã€é¢œè‰²ï¼‰â€¦ï¼ˆå·²è¯†åˆ« ' + Math.round((Date.now() - startedAt) / 1000) + ' ç§’ï¼‰';
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
    // æ¨¡åž‹å¶å°”æŠŠæ•°ç»„è¿”å›žæˆå­—ç¬¦ä¸²ï¼Œè¿™é‡Œç»Ÿä¸€æ•´ç†
    ['materials', 'crafts', 'styles', 'audience', 'colors', 'sizes', 'scene'].forEach((k) => {
      if (typeof s[k] === 'string') s[k] = s[k].split(/[,ï¼Œã€\/\s]+/).filter(Boolean);
    });
    if (Array.isArray(s.colors)) s.colors = Array.from(new Set(s.colors.map((c) => String(c).trim()).filter(Boolean))).slice(0, 12);
    if (Array.isArray(s.grid) && s.grid.length) {
      const g = Array.from(new Set(s.grid.map((c) => String(c).trim()).filter(Boolean)));
      if (g.length > (Array.isArray(s.colors) ? s.colors.length : 0)) s.colors = g.slice(0, 12);
    }
    if (Array.isArray(s.styles) && s.styles.length > 1) s.styles = [s.styles[0]];
    if (!Array.isArray(s.styles) || !s.styles.length) {
      s.styles = [s.subStyle || 'æ…µæ‡’é£Ž'];
    }
    if (!Array.isArray(s.crafts) || !s.crafts.length) {
      s.crafts = [s.pattern && s.pattern !== 'çº¯è‰²' ? s.pattern : (s.materials && /ç¾Šæ¯›|ç¾Šç»’|é©¬æµ·æ¯›/.test(s.materials.join('')) ? 'éº»èŠ±ç¼–ç»‡' : 'å‘æ¡')];
    }
    const map = ['category','materials','crafts','neck','fit','styles','audience','weight','season','colors','sizes','scene',
      'pattern','wearStyle','fiber','age','fleece','mainStyle','subStyle','length','sleeveLen','sleeveType','elements'];
    map.forEach((k) => { if (s[k] !== undefined && s[k] !== null) S.studioInput[k] = s[k]; });
    if (s.price) S.studioInput.price = String(s.price);
    if (s.extra) S.studioInput.extra = s.extra;
    S.studioKit = generateKit(S.studioInput, Number(S.studioInput.price) || 0);
    S.studioResultTab = 'ark';
    const colN = (S.studioInput.colors || []).length;
    S.aiStatus = 'âœ… è¯†åˆ«æˆåŠŸï¼š' + (colN ? `è®¤å‡º ${colN} ä¸ªé¢œè‰²ï¼ˆ${(S.studioInput.colors || []).join('ã€')}ï¼‰` : 'å·²å¡«å¥½å±žæ€§');
    renderRoute();
    bindRoute();
    toast('è¯†åˆ«å®Œæˆï¼Œå±žæ€§å·²è‡ªåŠ¨å¡«å¥½');
  } catch (e) {
    S.aiStatus = 'âŒ è¯†åˆ«å¤±è´¥ï¼š' + ((e.body && e.body.message) || e.message);
    renderRoute();
    bindRoute();
  } finally {
    clearInterval(timer);
  }
}

// å¦†å®¹ä¸Žçš®è‚¤çš„ç»Ÿä¸€è¦æ±‚ï¼šç´ äººçœŸå®žæ„Ÿï¼Œåˆ»æ„é¿å¼€ç½‘çº¢/AI å¡‘æ–™æ„Ÿ
const FACE_QUALITY = 'ç´ é¢œæ„Ÿåº•å¦†ï¼šåº•å¦†è½»è–„æŽ¥è¿‘ç´ é¢œã€ä¿ç•™çœŸå®žçš®è‚¤çº¹ç†ï¼Œè…®çº¢æžæ·¡å‡ ä¹Žçœ‹ä¸è§ã€å”‡è‰²è‡ªç„¶å¹¶ä¿ç•™å”‡çº¹ã€ä¸ç”»æµ“çœ¼çº¿ä¸æˆ´å‡ç«æ¯›ã€çœ¼å‘¨æœ‰è‡ªç„¶å§èš•ï¼›çš®è‚¤ç™½çš™ä½†å¯è§ç»†å°æ¯›å­”å’Œç»†å¾®ç»’æ¯›ã€æœ‰è½»å¾®è‚¤è‰²ä¸å‡å’Œä¸€ç‚¹ç‚¹ç—˜å°æˆ–é›€æ–‘ã€ä¸æ˜¯ç£¨çš®å‡é¢ä¸æ˜¯å¡‘æ–™æ„Ÿï¼›çœ‰å½¢è‡ªç„¶æœ‰å°‘é‡æ‚æ¯›ã€ä¸æ˜¯æµ“çœ‰ï¼›ä¸æ˜¯ç½‘çº¢è„¸ä¸æ˜¯æ•´å®¹è„¸ã€å·¦å³è„¸ç•¥æœ‰ä¸å¯¹ç§°ã€äº”å®˜ä¸è¿½æ±‚å®Œç¾Žï¼›å¤´å‘æ˜¯çœŸå®žå‘ä¸ä¸æ˜¯ä¸€æ•´ç‰‡è‰²å—ï¼šèƒ½çœ‹å‡ºå‘ä¸èµ°å‘å’Œå±‚æ¬¡ã€å‘ç¼è‡ªç„¶ã€å‘é™…çº¿æœ‰å°ç¢Žå‘ã€å‡ æ ¹é£žæ•£çš„æ¯›èºå‘ä¸ã€å‘æ ¹åˆ°å‘æ¢¢æœ‰è½»å¾®æ·±æµ…å˜åŒ–ï¼›å¤´å‘æ•´ä½“å“‘å…‰è´¨æ„Ÿï¼Œå®¤å†…å…‰ä¸‹åªæœ‰å‘ä¸è¾¹ç¼˜ä¸€ç‚¹ç‚¹è‡ªç„¶åå…‰ï¼Œä¸è¦å¤§é¢ç§¯é«˜å…‰ã€ä¸è¦æ²¹äº®åå…‰ã€ä¸è¦äº®æˆå¡‘æ–™ä¸ã€ä¸è¦å‡å‘æ„Ÿã€ä¸è¦å¤´ç›”æ„Ÿ';

// å½“å‰è¿™ä¸€æ¬¾å•†å“ç”¨å“ªä½æ¨¡ç‰¹ï¼šæ–°å•†å“é‡æ–°éšæœºï¼ŒåŒå•†å“å„é¢œè‰²ä¿æŒä¸€è‡´
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
  const studio = (style || S.arkCounts.photoStyle || 'blend') === 'studio';
  const quality = studio
    ? 'çœŸå®žç´ äººæ„Ÿï¼Œä¸æ˜¯ç½‘çº¢è„¸ï¼šäº”å®˜è‡ªç„¶ï¼Œå·¦å³è„¸æœ‰è½»å¾®ä¸å¯¹ç§°ï¼Œçœ¼ç›å¤§å°æ­£å¸¸ï¼Œé¼»å­å’Œå˜´å”‡ä¸è¿½æ±‚å®Œç¾Žï¼›åº•å¦†è½»è–„æŽ¥è¿‘ç´ é¢œï¼Œä¿ç•™çœŸå®žçš®è‚¤çº¹ç†ã€ç»†å°æ¯›å­”å’Œè½»å¾®è‚¤è‰²ä¸å‡ï¼Œä¸è¦æ°´å…‰è‚Œä¸è¦å‡ç«æ¯›ä¸è¦æµ“çœ¼çº¿ï¼›å¤´å‘è‡ªç„¶ï¼Œæœ‰å‡ æ ¹ç¢Žå‘ï¼Œå‘è‰²æŒ‰èº«ä»½æè¿°'
    : FACE_QUALITY;
  return `æ¨¡ç‰¹ï¼š${arkIdentity()}ï¼›${quality}ï¼›åŒä¸€ä¸ªå•†å“çš„æ‰€æœ‰é¢œè‰²å›¾å¿…é¡»æ˜¯åŒä¸€ä½æ¨¡ç‰¹ã€åŒä¸€å¼ è„¸`;
}

function arkStyleInfo() {
  const i = S.studioInput || {};
  const styles = (i.styles || []).filter(Boolean).join('ã€') || 'ç®€çº¦é€šå‹¤';
  const aud = (i.audience || []).filter(Boolean).join('ã€') || 'å¥³å£«';
  const scene = (i.scene || []).filter(Boolean).join('ã€') || 'æ—¥å¸¸';
  return `æ•´ä½“é£Žæ ¼ï¼š${styles}ï¼›ç›®æ ‡äººç¾¤ï¼š${aud}ï¼›ç©¿æ­åœºæ™¯ï¼š${scene}`;
}

async function swapGenerate() {
  if (!S.studioImage) { toast('å…ˆåœ¨ä¸Šé¢ä¸Šä¼ ä½ çš„è¡£æœå®žæ‹å›¾'); return; }
  if (!S.swapImages.length) { toast('å…ˆä¸Šä¼ è‡³å°‘ä¸€å¼ æ¨¡ç‰¹å§¿åŠ¿å›¾'); return; }
  const ai = (S.data && S.data.settings && S.data.settings.ai) || {};
  if (!ai.apiKey) { toast('å…ˆåŽ»ã€Œè®¾ç½®ã€é‡Œå¡«ç«å±±æ–¹èˆŸ Key'); return; }
  const n = S.swapImages.length;
  const low = (n * 0.1).toFixed(1);
  if (!confirm(`å¯¹ ${n} å¼ å‚è€ƒå›¾å„å‡º 1 å¼ æ¢è£…å›¾ï¼Œå…± ${n} å¼ ï¼Œçº¦ ${low}~${n} å…ƒï¼Œä»Žä½ çš„æ–¹èˆŸä½™é¢æ‰£ã€‚ç»§ç»­å—ï¼Ÿ`)) return;
  const btn = $('#swapBtn');
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const el = $('#swapStatus');
    if (el) el.textContent = `æ¢è£…ä¸­â€¦å·²ç­‰ ${Math.round((Date.now() - startedAt) / 1000)} ç§’ï¼Œåˆ«å…³é¡µé¢`;
  }, 1000);
  S.swapStatus = `æ­£åœ¨æ¢è£…ï¼ˆ1/${n}ï¼‰â€¦`;
  if (btn) { btn.disabled = true; btn.textContent = `æ¢è£…ä¸­â€¦ï¼ˆ0/${n}ï¼‰`; }
  renderRoute();
  bindRoute();

  // æ¢è£…å¿…é¡»ä¿ç•™å‚è€ƒå›¾1çš„å§¿åŠ¿å’ŒèƒŒæ™¯ï¼Œæ‰€ä»¥è¿™é‡Œä¸å¸¦ç”Ÿæ´»æ–¹å¼æ”¶å°¾è¯­
  const garment = S.studioImage.aiUrl || S.studioImage.dataUrl;
  const swapTail = S.arkCounts.noAccessory
    ? `ï¼Œé¢œè‰²ã€æè´¨çº¹ç†ã€èŠ±çº¹ã€çº½æ‰£ã€å£è¢‹å¿…é¡»ä¸Žå‚è€ƒå›¾2å®Œå…¨ä¸€è‡´ï¼Œä½†ä¸è¦ç”Ÿæˆ${S.arkCounts.accessoryList || 'ä¸å¸¦ã€è´è¶ç»“ç­‰è£…é¥°'}ï¼Œåªä¿ç•™è¡£æœæœ¬ä½“`
    : 'ï¼Œé¢œè‰²ã€æè´¨çº¹ç†ã€èŠ±çº¹ã€çº½æ‰£ã€å£è¢‹ã€è£…é¥°å¿…é¡»ä¸Žå‚è€ƒå›¾2å®Œå…¨ä¸€è‡´';
  let done = 0;
  for (let i = 0; i < n; i++) {
    try {
      const ref = S.swapImages[i];
      S.swapStatus = `æ­£åœ¨æ¢è£…ç¬¬ ${i + 1}/${n} å¼ â€¦`;
      const el = $('#swapStatus');
      if (el) el.textContent = S.swapStatus;
      const r = await api('/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: SWAP_PROMPT + swapTail + 'ã€‚çœŸå®žç”Ÿæ´»äººåƒæ‘„å½±ï¼šçš®è‚¤æœ‰çœŸå®žçº¹ç†å’Œç»†ç¢Žå‘ä¸ï¼Œä¸ç£¨çš®ä¸å¡‘æ–™æ„Ÿï¼Œéž 3D æ¸²æŸ“éžæ’ç”»ï¼ŒæŸ”å’Œè‡ªç„¶å…‰æœ‰è‡ªç„¶é˜´å½±ï¼ŒèƒŒæ™¯ä¿ç•™å‚è€ƒå›¾1çš„åœºæ™¯æ°›å›´ï¼›æ— æ°´å°ã€æ— æ–‡å­—ã€æ—  logo',
          images: [ref.aiUrl, garment],
          size: '1024x1536',
          negative_prompt: 'plastic skin, over-saturated, cartoon, AI look, glossy face, deformed hands'
        })
      });
      const raw = r.dataUrl || r.url;
      if (!raw) throw new Error('æ–¹èˆŸæ²¡è¿”å›žå›¾ç‰‡');
      const url = await gradePhoto(raw);
      S.studioAiImages.unshift({ url, label: `æ¢è£…å›¾ï¼ˆå‚è€ƒå›¾ ${i + 1}ï¼‰` });
      cacheImageNow(url);
      done++;
      if (btn) btn.textContent = `æ¢è£…ä¸­â€¦ï¼ˆ${done}/${n}ï¼‰`;
      renderRoute();
      bindRoute();
    } catch (e) {
      S.swapStatus = `ç¬¬ ${i + 1} å¼ å¤±è´¥ï¼š${(e.body && e.body.message) || e.message}ã€‚å·²æˆåŠŸ ${done} å¼ ï¼Œå¤±è´¥çš„ä¸æ‰£é’±ã€‚`;
      renderRoute();
      bindRoute();
      break;
    }
  }
  clearInterval(timer);
  if (btn) { btn.disabled = false; btn.textContent = S.swapImages.length ? 'ä¸€é”®å…¨éƒ¨æ¢è£…ï¼ˆ' + S.swapImages.length + ' å¼ ï¼‰' : 'æ¢è£…ç”Ÿæˆï¼ˆæ”¶è´¹ï¼‰'; }
  if (done === n) {
    S.swapStatus = `âœ… å…¨éƒ¨å®Œæˆï¼Œå…± ${n} å¼ ï¼Œå›¾åœ¨ä¸‹é¢`;
    toast('æ¢è£…å®Œæˆ');
  }
  renderRoute();
  bindRoute();
}

const ARK_PHOTO_LIFE = 'çœŸå®žæ‰‹æœºå®žæ‹ã€ä¸æ˜¯æ£šæ‹æµ·æŠ¥ï¼š__LIGHT__ï¼›æ‰‹æœºåŽç½®ä¸»æ‘„ __LENS__ æ‹æ‘„ï¼Œæœ‰ç»†å¾®èƒ¶ç‰‡é¢—ç²’ï¼›ä¸­æ™¯ååŠèº«æž„å›¾ã€é•œå¤´ç•¥å¾®åŽé€€ï¼Œäººç‰©å’Œæ¯›è¡£å ç”»é¢ 60%~75%ï¼Œå¤´éƒ¨ä¸Šæ–¹ç•™å‡ºç©ºé—´ã€ä¸è¦æŠŠè„¸é¡¶åˆ°ç”»é¢é¡¶éƒ¨ï¼Œè£¤å­åªéœ²ä¸€ç‚¹ï¼Œä¸æ‹å…¨èº«ä¸æ‹éž‹ï¼›èƒŒæ™¯æ˜¯çœŸå®žç”Ÿæ´»åœºæ™¯çš„è‡ªç„¶æµ…æ™¯æ·±ï¼Œè¿‘å¤„å¢™é¢æ¡Œæ¤…çª—æ¡†ç»¿æ¤èƒ½çœ‹å‡ºå½¢çŠ¶å’Œæè´¨ï¼Œè¿œå¤„é€æ¸æŸ”åŒ–ï¼Œä¸æ˜¯ç³Šæˆä¸€ç‰‡å¥¶æ²¹ï¼›çš®è‚¤æœ‰çœŸå®žè´¨æ„Ÿï¼šå¯è§ç»†å°æ¯›å­”å’Œç»’æ¯›ã€è½»å¾®è‚¤è‰²ä¸å‡ã€çœ¼ä¸‹å’Œé¼»ç¿¼æœ‰è‡ªç„¶é˜´å½±ï¼Œä¸æ˜¯ç£¨çš®ä¸æ˜¯å¡‘æ–™ï¼›æ¯›è¡£æ¯›ç»’è“¬æ¾æŸ”è½¯ã€ç»’æ„Ÿæ¸…æ™°å¯è§ï¼Œé¢æ–™å¹²å‡€å¹³æ•´æ²¡æœ‰èµ·çƒè„æ—§ï¼Œæœ‰è‡ªç„¶è¤¶çš±å’ŒåŽšåº¦ï¼Œçº½æ‰£è´¨æ„ŸçœŸå®žï¼›æ¨¡ç‰¹è¡¨æƒ…è‡ªç„¶æ”¾æ¾ã€åƒæœ‹å‹éšæ‰‹æŠ“æ‹çš„ä¸€çž¬é—´ï¼Œæž„å›¾ç•¥å¾®ä¸å®Œç¾Žï¼›å¤´å‘å“‘å…‰è‡ªç„¶ã€æœ‰ç¢Žå‘å’Œå±‚æ¬¡ï¼›åªå‡ºçŽ°ä¸¤åªæ‰‹ã€äº”æŒ‡æ•°é‡æ­£ç¡®ã€æ‰‹æŒ‡ç»“æž„è‡ªç„¶ï¼›æœè£…é¢œè‰²ã€èŠ±çº¹ã€æè´¨ã€çº½æ‰£ã€å£è¢‹ä¸Žå‚è€ƒå›¾å®Œå…¨ä¸€è‡´ï¼›æ— æ°´å°ã€æ— æ–‡å­—ã€æ—  logoï¼›ä¸è¦è¿‡åº¦ç£¨çš®ã€ä¸è¦å¡‘æ–™æ„Ÿã€ä¸è¦æµ·æŠ¥æ„Ÿã€ä¸è¦æ’ç”»æˆ– 3D æ¸²æŸ“æ„Ÿã€ä¸è¦æš–æ©™æ»¤é•œ';

// æ¯ä¸ªå•†å“éšæœºä¸€ä½æ¨¡ç‰¹ï¼ˆè„¸åž‹/å‘åž‹/èº«é«˜/å¹´çºªéƒ½ä¸åŒï¼‰ï¼ŒåŒä¸€å•†å“çš„å„é¢œè‰²ä»å…±ç”¨åŒä¸€å¼ è„¸
const ARK_IDENTITIES = [
  '23 å²äºšæ´²å¥³ç”Ÿï¼Œé¹…è›‹è„¸ã€é¼»æ¢ç§€æ°”ã€å•çœ¼çš®å†…åŒï¼Œæ£•é»‘è‰²ä¸­é•¿å‘å¾®å·ã€é½çœ‰ç¢Žåˆ˜æµ·ã€å‘æ¢¢åˆšè¿‡è‚©ï¼Œèº«é«˜ 163cmã€èº«å½¢çº¤ç»†',
  '25 å²äºšæ´²å¥³ç”Ÿï¼Œå°åœ†è„¸ã€çœ¼ç›ååœ†ã€è‹¹æžœè‚Œæ˜Žæ˜¾ï¼Œæ·±æ£•è‰²å¤§æ³¢æµªé•¿å·å‘ã€æ³•å¼ç©ºæ°”åˆ˜æµ·ã€å‘é‡è“¬æ¾ï¼Œèº«é«˜ 168cmã€èº«æåŒ€ç§°',
  '22 å²äºšæ´²å¥³ç”Ÿï¼Œç“œå­è„¸ã€çœ¼å°¾ç•¥å¾®ä¸Šæ‰¬ã€å”‡å½¢å°å·§ï¼Œé»‘è‰²é•¿ç›´å‘ä¸­åˆ†ã€å‘å°¾å¾®å†…æ‰£ï¼Œèº«é«˜ 170cmã€èº«å½¢é«˜æŒ‘åç˜¦',
  '26 å²äºšæ´²å¥³ç”Ÿï¼Œè„¸åž‹åé•¿ã€äº”å®˜ç«‹ä½“ã€é¼»å¤´å°å·§ï¼Œæ —æ£•è‰²çŸ­é”éª¨å‘å¸¦è½»å¾®å†…æ‰£ã€å…«å­—åˆ˜æµ·ï¼Œèº«é«˜ 165cmã€èº«æè‹—æ¡',
  '24 å²äºšæ´²å¥³ç”Ÿï¼Œè„¸é¢Šæœ‰ç‚¹å©´å„¿è‚¥ã€åœ†åœ†çš„çœ¼ç›ã€ç¬‘èµ·æ¥æœ‰å§èš•ï¼Œæ·±æ —è‰²å¤§æ³¢æµªåŠèƒ¸é•¿å‘ã€ä¾§åˆ†åˆ˜æµ·ï¼Œèº«é«˜ 160cmã€èº«å½¢å¨‡å°',
  '27 å²äºšæ´²å¥³ç”Ÿï¼Œé¹…è›‹è„¸ã€é¼»æ¢é«˜ã€çœ¼åž‹åç»†é•¿ï¼Œå†·æ£•è‰²é¡ºç›´é•¿å‘ã€ä¸­åˆ†ã€å‡ ç¼•ç¢Žå‘ï¼Œèº«é«˜ 172cmã€æ°”è´¨åæˆç†Ÿ',
  '21 å²äºšæ´²å¥³ç”Ÿï¼Œå°å°ä¸€å¼ è„¸ã€çœ¼ç›å¤§è€Œåœ†ã€å˜´å”‡é¥±æ»¡ï¼Œå¥¶èŒ¶æ£•å¾®å·é•¿å‘ã€æ¼«ç”»åˆ˜æµ·ã€å‘æ¢¢è“¬æ¾ï¼Œèº«é«˜ 158cmã€èº«å½¢å°å·§',
  '25 å²äºšæ´²å¥³ç”Ÿï¼Œé¢§éª¨ç•¥é«˜ã€é¢éƒ¨çº¿æ¡æ¸…æ¥šã€ä¸‹é¢Œçº¿åˆ©è½ï¼Œé»‘èŒ¶è‰²å¾®å·è¿‡è‚©å‘ã€ååˆ†ï¼Œèº«é«˜ 166cmã€èº«å½¢åŒ€ç§°',
  '23 å²äºšæ´²å¥³ç”Ÿï¼Œè„¸åž‹æŸ”å’Œã€çœ¼è·ç•¥å®½ã€çœ¼ç›æ¸…äº®ï¼Œé»‘è‰²å¤§æ³¢æµªé•¿å·å‘ã€ç©ºæ°”åˆ˜æµ·ï¼Œèº«é«˜ 164cmã€èº«æåŒ€ç§°',
  '28 å²äºšæ´²å¥³ç”Ÿï¼Œé¹…è›‹è„¸ã€çœ¼ç¥žæ¸©å©‰ã€å”‡å½¢è–„è€Œæ¸…æ™°ï¼Œæ·±æ£•è‰²ä½Žç›˜å‘ã€ä¸¤ä¾§å‡ ç¼•ç¢Žå‘ï¼Œèº«é«˜ 162cmã€æ°”è´¨çŸ¥æ€§',
  '24 å²äºšæ´²å¥³ç”Ÿï¼Œå°æ–¹è„¸åæŸ”ã€çœ¼å°¾ç•¥ä¸‹åž‚ã€é¼»å­å°å·§ï¼Œé»‘è‰²é•¿ç›´å‘ä½Žé©¬å°¾ã€é¢å‰ç¢Žå‘ï¼Œèº«é«˜ 169cmã€èº«å½¢ä¿®é•¿',
  '22 å²äºšæ´²å¥³ç”Ÿï¼Œåœ†æ¶¦å¨ƒå¨ƒè„¸ã€çœ¼ç›ç•¥åœ†ã€å§èš•è‡ªç„¶ï¼Œæµ…æ£•è‰²é½è‚©å¾®å·å‘ã€ç¢Žåˆ˜æµ·ï¼Œèº«é«˜ 161cmã€èº«å½¢çº¤ç»†',
  '29 å²äºšæ´²å¥³ç”Ÿï¼Œé¹…è›‹è„¸ã€çœ¼çªç¨æ·±ã€å”‡è‰²åæµ…ï¼Œæ·±æ£•è‰²é•¿ç›´å‘ä½Žå‘é«»ã€é¬“è§’ç¢Žå‘ï¼Œèº«é«˜ 167cmã€æ°”è´¨å®‰é™',
  '23 å²äºšæ´²å¥³ç”Ÿï¼Œè„¸åž‹æ¸…ç˜¦ã€é¢§éª¨æŸ”å’Œã€çœ¼ç›å†…åŒï¼Œé»‘è‰²åŠè…°é•¿ç›´å‘åŠæ‰Žã€å‰é¢ç•™ä¸¤ç¼•ç¢Žå‘ï¼Œèº«é«˜ 171cmã€èº«å½¢åç˜¦',
  '26 å²äºšæ´²å¥³ç”Ÿï¼Œåœ†è„¸ã€é¼»å¤´ç•¥åœ†ã€å˜´å”‡é¥±æ»¡ï¼Œçº¢æ£•è‰²å¤§å·å‘åŠèƒ¸ã€æ–œåˆ†åˆ˜æµ·ï¼Œèº«é«˜ 165cmã€å¾®èƒ–åŒ€ç§°',
  '24 å²äºšæ´²å¥³ç”Ÿï¼Œè±å½¢è„¸åæŸ”ã€çœ¼åž‹ç»†é•¿ã€é¼»æ¢ç›´ï¼Œç„¦ç³–æ£•è‰²ä¸­é•¿å¾®å·å‘ã€ä¸­åˆ†ã€å‘å°¾å¤–ç¿»ï¼Œèº«é«˜ 164cmã€èº«å½¢åŒ€ç§°',
  '25 å²äºšæ´²å¥³ç”Ÿï¼Œé¹…è›‹è„¸ã€çš®è‚¤åç™½ã€åŒçœ¼çš®æ¸…æ¥šï¼Œé»‘è‰²æ³¢æ³¢å¤´çŸ­å‘ã€é½åˆ˜æµ·ï¼Œèº«é«˜ 158cmã€èº«å½¢å¨‡å°',
  '22 å²äºšæ´²å¥³ç”Ÿï¼Œå°åœ†è„¸ã€çœ¼ç›åœ†è€Œäº®ã€å§èš•æ˜Žæ˜¾ï¼Œç°æ£•è‰²é½è‚©å·å‘ã€ç¢Žåˆ˜æµ·ï¼Œèº«é«˜ 162cmã€èº«å½¢çº¤ç»†',
  '27 å²äºšæ´²å¥³ç”Ÿï¼Œè„¸åž‹åçª„ã€ä¸‹å·´å°å·§ã€çœ¼ç¥žæ¸…å†·ï¼Œé»‘è‰²é•¿å‘ä¸­åˆ†é…çç å‘å¤¹ï¼Œèº«é«˜ 170cmã€èº«å½¢é«˜æŒ‘',
  '24 å²äºšæ´²å¥³ç”Ÿï¼Œé¹…è›‹è„¸ã€çœ¼ç›åœ†ã€å§èš•æ˜Žæ˜¾ï¼Œäºšéº»æ£•è‰²é½è‚©ç¾Šæ¯›å·ã€ä¸­åˆ†ï¼Œèº«é«˜ 165cmã€èº«å½¢åŒ€ç§°',
  '22 å²äºšæ´²å¥³ç”Ÿï¼Œå°åœ†è„¸ã€çš®è‚¤åç™½ã€å•çœ¼çš®ï¼Œé»‘è‰²é«˜é©¬å°¾ã€é¢å‰ç¢Žå‘ï¼Œèº«é«˜ 163cmã€èº«å½¢çº¤ç»†',
  '26 å²äºšæ´²å¥³ç”Ÿï¼Œçª„é•¿è„¸ã€é¼»æ¢æŒºã€å”‡å½¢è–„ï¼Œæ·±æ£•è‰²ä½Žä¸¸å­å¤´ã€é¬“è§’ç¢Žå‘ï¼Œèº«é«˜ 168cmã€æ°”è´¨å¹²å‡€',
  '23 å²äºšæ´²å¥³ç”Ÿï¼Œå¿ƒå½¢è„¸ã€ä¸‹å·´å°–ã€çœ¼ç›å†…åŒï¼Œé»‘è‰²é½è€³çŸ­å‘ã€ç¢Žåˆ˜æµ·ï¼Œèº«é«˜ 161cmã€èº«å½¢å°å·§',
  '25 å²äºšæ´²å¥³ç”Ÿï¼Œé¹…è›‹è„¸ã€çœ¼è·ç•¥çª„ã€é¼»å¤´å°å·§ï¼Œå¥¶èŒ¶è‰²ä¸­é•¿ç›´å‘ã€å…«å­—åˆ˜æµ·ï¼Œèº«é«˜ 167cmã€é•¿è…¿åŒ€ç§°',
  '24 å²äºšæ´²å¥³ç”Ÿï¼Œè„¸åž‹æŸ”å’Œã€è‹¹æžœè‚Œã€ç¬‘èµ·æ¥æœ‰æ¢¨æ¶¡ï¼Œæ·±æ£•è‰²ä¾§ç¼–å‘ã€å‘å°¾å¾®å·ï¼Œèº«é«˜ 162cmã€èº«å½¢çº¤ç»†',
  '28 å²äºšæ´²å¥³ç”Ÿï¼Œé¢§éª¨çº¿æ¡æŸ”å’Œã€çœ¼åž‹ç»†é•¿ã€æ°”è´¨æ¸©å©‰ï¼Œé»‘èŒ¶è‰²ä½Žé©¬å°¾ã€ä¸­åˆ†ï¼Œèº«é«˜ 166cmã€èº«å½¢ä¿®é•¿',
  '21 å²äºšæ´²å¥³ç”Ÿï¼Œå¨ƒå¨ƒè„¸ã€çœ¼ç›å¤§è€Œåœ†ã€å”‡å½¢é¥±æ»¡ï¼Œæ£•é»‘è‰²åŒéº»èŠ±è¾«ã€ç©ºæ°”åˆ˜æµ·ï¼Œèº«é«˜ 159cmã€èº«å½¢å¨‡å°',
  '27 å²äºšæ´²å¥³ç”Ÿï¼Œè„¸åž‹ç«‹ä½“ã€é¼»æ¢ç›´ã€ä¸‹é¢Œçº¿æ¸…æ¥šï¼Œå†·æ£•è‰²åŠè‚©å¤–ç¿»å·å‘ã€ååˆ†ï¼Œèº«é«˜ 171cmã€èº«å½¢é«˜ç˜¦',
  '23 å²äºšæ´²å¥³ç”Ÿï¼Œé¹…è›‹è„¸ã€çœ¼å°¾ç•¥ä¸Šæ‰¬ã€å§èš•è‡ªç„¶ï¼Œé»‘è‰²é•¿ç›´å‘åŠæ‰Žã€ç•™ä¸¤ç¼•ç¢Žå‘ï¼Œèº«é«˜ 164cmã€åŒ€ç§°',
  '25 å²äºšæ´²å¥³ç”Ÿï¼Œå°æ–¹è„¸åæŸ”ã€é¼»å­ç§€æ°”ã€å˜´å”‡é¥±æ»¡ï¼Œæ —æ£•è‰²ç¾Šæ¯›å·çŸ­å‘ã€æ³•å¼åˆ˜æµ·ï¼Œèº«é«˜ 160cmã€å¾®èƒ–å¯çˆ±',
  '26 å²äºšæ´²å¥³ç”Ÿï¼Œè„¸åž‹æ¸…ç˜¦ã€çœ¼çªå¾®æ·±ã€çœ¼ç¥žæ¸©æŸ”ï¼Œæ·±æ£•è‰²ä¸­é•¿å¾®å·å‘ã€ä¾§åˆ†åˆ«åœ¨è€³åŽï¼Œèº«é«˜ 169cmã€èº«å½¢çº¤ç»†',
  '22 å²äºšæ´²å¥³ç”Ÿï¼Œç“œå­è„¸ã€åŒçœ¼çš®æ¸…æ¥šã€çš®è‚¤ç™½çš™ï¼Œé»‘è‰²é«˜é¢…é¡¶ä¸¸å­å¤´ã€ç¢Žå‘ä¿®é¥°è„¸åž‹ï¼Œèº«é«˜ 162cmã€èº«å½¢å°å·§',
  '29 å²äºšæ´²å¥³ç”Ÿï¼Œé¹…è›‹è„¸ã€äº”å®˜èˆ’å±•ã€å”‡è‰²è‡ªç„¶ï¼Œç„¦ç³–æ£•å¤§æ³¢æµªé•¿å‘ã€ä¸­åˆ†ï¼Œèº«é«˜ 168cmã€æ°”è´¨æˆç†ŸçŸ¥æ€§',
  '24 å²äºšæ´²å¥³ç”Ÿï¼Œè„¸åž‹ååœ†ã€çœ¼ç›æ¸…äº®ã€é¼»å°–å¾®ç¿˜ï¼Œé»‘è‰²æ³¢æ³¢å¤´å¸¦å†…æ‰£ã€é½çœ‰åˆ˜æµ·ï¼Œèº«é«˜ 161cmã€èº«å½¢åŒ€ç§°',
  '27 å²äºšæ´²å¥³ç”Ÿï¼Œè±å½¢è„¸ã€çœ¼åž‹ç»†é•¿ã€é”éª¨æ˜Žæ˜¾ï¼Œæ·±æ£•åé»‘é•¿ç›´å‘ã€ä½Žå‘é«»ã€è€³è¾¹ç•™ç¢Žå‘ï¼Œèº«é«˜ 170cmã€èº«å½¢é«˜æŒ‘',
  '23 å²äºšæ´²å¥³ç”Ÿï¼Œé¹…è›‹è„¸ã€å§èš•æ˜Žæ˜¾ã€ç¬‘èµ·æ¥å¾ˆç”œï¼Œæµ…èŒ¶è‰²é½èƒ¸å·å‘ã€ç©ºæ°”åˆ˜æµ·ï¼Œèº«é«˜ 165cmã€èº«å½¢è‹—æ¡'
];

// ç¯å…‰å’Œé•œå¤´çš„ç»†å¾®å·®å¼‚ï¼Œä¿è¯ä¸åŒå•†å“èƒŒæ™¯ä¸Žæ°›å›´ä¸æ’ž
const ARK_LIGHTS = [
  'ä»Žä¸€ä¾§çª—æˆ·ç…§è¿›æ¥çš„æŸ”å’Œè‡ªç„¶å…‰ï¼Œé˜´å½±æŸ”å’Œè¿‡æ¸¡è‡ªç„¶',
  'é˜´å¤©æ¼«å°„çš„æ—¥å…‰ï¼Œæ˜Žäº®å‡åŒ€ã€é¢œè‰²çœŸå®žä¸åè‰²',
  'æ¸…æ™¨ä¾§é€†å…‰ï¼Œå‘ä¸æœ‰æŸ”å’Œè½®å»“å…‰ï¼Œé¢éƒ¨æœ‰è‡ªç„¶è¡¥å…‰',
  'é»„é‡‘æ—¶åˆ»çš„ä¾§å…‰ï¼Œé˜³å…‰ä»Žä¾§é¢45åº¦ç…§å…¥ï¼Œå…‰çº¿æ¸©æš–ä½†ä¸å‘æ©˜',
  'å’–å•¡é¦†çª—è¾¹æ—¥å…‰ï¼ŒèƒŒæ™¯æœ‰æŸ”å’Œå…‰æ–‘ï¼Œä¸»å…‰è‡ªç„¶æŸ”å’Œ',
  'ä¸Šåˆæ˜Žäº®çš„è‡ªç„¶å…‰ï¼Œåå†·ç™½ã€å¹²å‡€é€šé€',
  'çº±å¸˜æŸ”åŒ–åŽçš„æ—¥å…‰ï¼Œå…‰çº¿æŸ”å’Œå‘äº®ï¼Œæ•´ä½“æ¸…çˆ½',
  'å®¤å†…é¡¶ç¯åŠ çª—è¾¹æ—¥å…‰æ··åˆï¼Œæ˜Žäº®è‡ªç„¶ã€é¢œè‰²å‡†ç¡®'
];
const ARK_LENSES = ['50mm f/2.0', '85mm f/2.0', '35mm f/2.8', '50mm f/2.8'];
const ARK_WBS = ['çœŸå®žè‡ªç„¶è‰²å½©ï¼Œè‚¤è‰²é€šé€è‡ªç„¶', 'ä¸­æ€§ç™½å¹³è¡¡ï¼Œé¢œè‰²å‡†ç¡®ä¸åé»„', 'è½»å¾®åå†·ç™½ï¼Œå¹²å‡€é€šé€', 'è‡ªç„¶æ—¥å…‰ç™½å¹³è¡¡ï¼Œè‚¤è‰²é€šé€'];


const ARK_PHOTO_STUDIO = 'çœŸå®žç”µå•†å•†å“å®žæ‹ï¼Œä¸æ˜¯æµ·æŠ¥ã€ä¸æ˜¯å°çº¢ä¹¦ç§è‰å›¾ï¼šæ˜Žäº®å‡åŒ€çš„æŸ”å…‰ï¼Œä¸­æ€§ç™½å¹³è¡¡ï¼Œè‚¤è‰²è‡ªç„¶ä¸åé»„ä¸åæ©™ï¼›èƒŒæ™¯åªæœ‰ä¸€ä¸ªé¢œè‰²ã€å¹³æ•´å¹²å‡€ï¼Œæ²¡æœ‰æ‚ç‰©é“å…·æ–‡å­—å’Œ logoï¼ŒèƒŒæ™¯åœ¨æ¸…æ™°å¯¹ç„¦å†…ä¸è¦è™šåŒ–ç³ŠæŽ‰ï¼›é•œå¤´ 50mm f/4ï¼Œäººç‰©å’Œè¡£æœéƒ½æ¸…æ™°ï¼Œé’ˆç»‡çº¹ç†ã€ç»’æ¯›ã€çº½æ‰£ã€èµ°çº¿ã€å£è¢‹è¾¹ç¼˜éƒ½çœ‹å¾—æ¸…ï¼›æ¨¡ç‰¹çœŸå®žç´ äººæ„Ÿï¼Œäº”å®˜è‡ªç„¶ã€å·¦å³è„¸è½»å¾®ä¸å¯¹ç§°ã€çš®è‚¤æœ‰çœŸå®žæ¯›å­”å’Œç»†å¾®è‚¤è‰²ä¸å‡ã€å˜´å”‡æœ‰è‡ªç„¶å”‡çº¹ï¼Œä¸æ˜¯ç½‘çº¢è„¸ä¸æ˜¯æ•´å®¹è„¸ä¸æ˜¯ 3D å»ºæ¨¡è„¸ï¼›è¡¨æƒ…è‡ªç„¶çœ‹é•œå¤´ï¼›ä¸­æ™¯ååŠèº«æž„å›¾ã€é•œå¤´ç•¥å¾®åŽé€€ï¼Œä¸Šè¡£å ç”»é¢ 60%~78%ï¼Œå¤´éƒ¨ä¸Šæ–¹ç•™ç©ºé—´ï¼Œè£¤å­åªéœ²ä¸€ç‚¹ï¼Œä¸æ‹å…¨èº«ä¸æ‹éž‹ï¼›å§¿åŠ¿è‡ªç„¶æ”¾æ¾ï¼Œè‚©è†€å¾®ä¾§ï¼ŒåŒæ‰‹è‡ªç„¶ä¸æ‘†æ‹ï¼›æœè£…é¢œè‰²ã€èŠ±çº¹ã€æè´¨ã€çº½æ‰£ã€å£è¢‹ä¸Žå‚è€ƒå›¾å®Œå…¨ä¸€è‡´ï¼›æ— æ°´å°ã€æ— æ–‡å­—ã€æ—  logoï¼›ä¸è¦æš–æ©™æ»¤é•œã€ä¸è¦è¿‡åº¦ç£¨çš®ã€ä¸è¦å¡‘æ–™æ„Ÿã€ä¸è¦æ’ç”»æˆ– 3D æ¸²æŸ“æ„Ÿ';

const ARK_PHOTO = ARK_PHOTO_LIFE;

const SWAP_PROMPT = 'å‚è€ƒå›¾1æ˜¯æ¨¡ç‰¹å§¿åŠ¿å’Œæž„å›¾ï¼Œå‚è€ƒå›¾2æ˜¯æˆ‘è¦å–çš„è¡£æœå®žæ‹ã€‚è¯·ç”Ÿæˆä¸€å¼ å…¨æ–°ç…§ç‰‡ï¼šå®Œå…¨ä¿ç•™å‚è€ƒå›¾1çš„å§¿åŠ¿ã€é•œå¤´è§’åº¦ã€æž„å›¾å’ŒèƒŒæ™¯æ°›å›´ï¼›æŠŠäººç‰©è„¸æ¢æˆä¸€ä½å…¨æ–°çš„ã€ä¸Žå‚è€ƒå›¾1ä¸åŒçš„äºšæ´²å¹´è½»å¥³æ€§ï¼Œç²¾è‡´å°ç“œå­è„¸ã€å¤§çœ¼ç›åŒçœ¼çš®ã€é¼»æ¢æŒºç§€ã€å”‡å½¢å°å·§ã€çš®è‚¤ç™½çš™ã€ä¼ªç´ é¢œå¦†ï¼Œç¬¦åˆå½“ä¸‹æµè¡Œå®¡ç¾Žï¼Œä¸èƒ½æ˜¯å‚è€ƒå›¾1åŽŸå›¾çš„è„¸ï¼›æŠŠèº«ä¸Šçš„è¡£æœæ¢æˆå‚è€ƒå›¾2è¿™ä»¶';

/* ===== ç”Ÿæ´»ç§è‰ï¼šå§¿åŠ¿æ±  + åœºæ™¯æ± ï¼ˆæŒ‰é£Žæ ¼è‡ªåŠ¨åŒ¹é…ï¼Œéšæœºä¸é‡å¤ï¼‰ ===== */
const LIFE_POSES = [
  'ååœ¨æœ¨æ¡Œæ—ï¼Œä¸€åªæ‰‹æ’‘ç€ä¸‹å·´ï¼Œå¦ä¸€åªæ‰‹æ”¾åœ¨æ¡Œé¢ä¸Šæ‰¶ç€çŽ»ç’ƒæ¯ï¼Œä¾§è„¸çœ‹å‘é•œå¤´',
  'ååœ¨æ²™å‘ä¸Šï¼Œä¸€åªæ‰‹æ’‘ç€è„¸é¢Šï¼Œå¦ä¸€åªæ‰‹æ”¾åœ¨è…¿ä¸Šï¼Œèº«ä½“å¾®å¾®ä¾§å‘é•œå¤´',
  'ååœ¨æ¡Œè¾¹ï¼Œä¸€åªæ‰‹æ‰¶ç€æ¯å­ï¼Œå¦ä¸€åªæ‰‹è‡ªç„¶æ­åœ¨æ¡Œæ²¿ï¼Œè‚©è†€æ”¾æ¾',
  'ä¾§èº«é åœ¨æ²™å‘èƒŒä¸Šï¼Œä¸€åªæ‰‹æ­åœ¨æ‰¶æ‰‹ä¸Šï¼Œå¤´å¾®å¾®ä¾§å‘é•œå¤´',
  'ååœ¨æ¤…å­ä¸Šï¼Œèº«ä½“å‰å€¾ï¼ŒåŒæ‰‹æ§ç€æ¯å­ï¼Œè§†çº¿ä»Žæ¯å­ä¸ŠæŠ¬èµ·çœ‹å‘é•œå¤´',
  'ååœ¨æ²™å‘ä¸ŠåŒè…¿äº¤å ï¼Œä¸€åªæ‰‹æ’‘åœ¨èº«åŽï¼Œå¦ä¸€åªæ‰‹æ”¾åœ¨è†ç›–ä¸Š',
  'åŠèººåœ¨æ²™å‘ä¸Šï¼Œä¸€åªæ‰‹æ’‘ç€å¤´ï¼Œå¦ä¸€åªæ‰‹æ­åœ¨æŠ±æž•ä¸Šï¼Œæ…µæ‡’çœ‹å‘é•œå¤´',
  'è·ªååœ¨æ²™å‘æˆ–åœ°æ¯¯ä¸Šï¼Œä¸€åªæ‰‹æ’‘ç€åœ°é¢ï¼Œèº«ä½“å¾®ä¾§çœ‹å‘é•œå¤´',
  'ååœ¨åœ°æ¿ä¸ŠèƒŒé æ²™å‘ï¼ŒæŠ±è†ï¼Œä¾§è„¸çœ‹å‘é•œå¤´',
  'ç«™åœ¨çª—è¾¹ï¼Œä¸€åªæ‰‹æ‰¶çª—æ¡†ï¼Œä¾§è„¸çœ‹å‘çª—å¤–ï¼Œä¸ŠåŠèº«å æ»¡ç”»é¢',
  'ç«™åœ¨è¡£æŸœå‰ï¼Œä¸€åªæ‰‹ç¿»æŸœé—¨ï¼Œå¦ä¸€åªæ‰‹è½»æ­è¡£æž¶ï¼Œå›žå¤´çœ‹å‘é•œå¤´',
  'å¯¹ç€å…¨èº«é•œä¸¾æ‰‹æœºè‡ªæ‹ï¼Œæ‰‹æœºæŒ¡ä½åŠå¼ è„¸ï¼Œå¦ä¸€åªæ‰‹è‡ªç„¶åž‚ç€',
  'é åœ¨å¢™è¾¹ï¼ŒåŒæ‰‹æŠ±è‡‚ï¼Œä¾§å¤´çœ‹å‘é•œå¤´',
  'ååœ¨é«˜è„šå‡³ä¸Šï¼ŒåŒæ‰‹äº¤å æ”¾åœ¨æ¡Œé¢ä¸Šï¼Œèº«ä½“å‰å€¾',
  'ååœ¨æ¡Œå‰ï¼ŒåŒæ‰‹æ§ç€çº¸æ¯å’–å•¡ï¼Œèº«ä½“å¾®å¾®å‰å€¾ï¼ŒæŠ¬èµ·çœ¼ç›çœ‹å‘é•œå¤´',
  'æŠ¬æ‰‹æŠŠå¤´å‘åˆ«åˆ°è€³åŽï¼Œè„¸æ­£å¯¹é•œå¤´ï¼Œå¾®å¾®ä¾§å¤´',
  'ååœ¨åºŠè¾¹ï¼Œä¸€åªæ‰‹æ’‘ç€åºŠæ²¿ï¼Œå¦ä¸€åªæ‰‹æ”¾åœ¨è…¿ä¸Šï¼Œä¾§è„¸çœ‹å‘é•œå¤´',
  'ååœ¨é¤æ¡Œæ—ï¼Œä¸€åªæ‰‹æ‰˜ç€è„¸ï¼Œå¦ä¸€åªæ‰‹ç”¨å‹ºå­æ…åŠ¨æ¯å­ï¼Œçœ¼ç›çœ‹å‘é•œå¤´',
  'ååœ¨å’–å•¡åº—çª—è¾¹ï¼Œæ‰‹è‚˜æ’‘åœ¨æ¡Œä¸Šï¼Œæ‰‹æŒ‡è½»è½»æŠµç€ä¸‹å·´ï¼Œç›´è§†é•œå¤´',
  'ä¾§èº«ç«™ç€ï¼Œä¸€åªæ‰‹è½»æè¡£æ‘†å±•ç¤ºä¸‹æ‘†ï¼Œè„¸è½¬å‘é•œå¤´',
  'åŒæ‰‹æŠ±ç€æ¯å­é è¿‘èƒ¸å£ï¼Œè‚©è†€æ”¾æ¾ï¼Œçœ‹å‘é•œå¤´è‡ªç„¶å¾®ç¬‘',
  'ååœ¨æ²™å‘ä¸ŠæŠ±ç€æŠ±æž•ï¼Œä¸‹å·´è½»è½»æ­åœ¨æŠ±æž•ä¸Š',
  'è½¬èº«ç¦»å¼€çš„çž¬é—´å›žå¤´ï¼Œåªæ‹è‚©è†€ä»¥ä¸Šåˆ°è…°éƒ¨ï¼Œå¤´å‘æœ‰åŠ¨æ€',
  'ååœ¨çª—å°è¾¹ï¼Œä¸€åªæ‰‹æ‰¶çª—æ²¿ï¼Œä¾§è„¸çœ‹å‘è¿œå¤„',
  'ååœ¨å’–å•¡åº—æœ¨è´¨å§å°å‰ï¼Œä¸€åªæ‰‹æ­åœ¨å§å°è¾¹ç¼˜ï¼Œå¦ä¸€åªæ‰‹æ‰˜ç€æ‹¿é“æ¯ï¼Œå›žå¤´çœ‹å‘é•œå¤´',
  'è¹²åœ¨èŠ±åº—é—¨å£ï¼Œä¸€åªæ‰‹è½»ç¢°èŠ±æŸï¼Œä¾§è„¸çœ‹å‘é•œå¤´',
  'ååœ¨ä¹¦åº—åœ°æ¿ä¸ŠèƒŒé ä¹¦æž¶ï¼Œä¸€åªæ‰‹æ‹¿ç€ä¹¦ï¼ŒæŠ¬å¤´çœ‹å‘é•œå¤´',
  'ç«™åœ¨åœ°é“å£æ‰‹æ‰¶æ æ†ï¼Œä¾§èº«çœ‹å‘é•œå¤´ï¼Œå¤´å‘è¢«é£Žå¹èµ·',
  'ååœ¨å…¬å›­é•¿æ¤…ä¸Šï¼Œä¸€åªæ‰‹æ­åœ¨æ¤…èƒŒä¸Šï¼Œå¦ä¸€åªæ‰‹æ”¾åœ¨è…¿ä¸Šï¼Œçœ‹å‘è¿œå¤„å†è½¬å›žé•œå¤´',
  'ç«™åœ¨å¤å¤è¡£æž¶å‰ï¼Œä¸€åªæ‰‹è½»æ‘¸è¡£æž¶ä¸Šçš„è¡£æœï¼Œä¾§è„¸çœ‹å‘é•œå¤´',
  'ååœ¨åœ°æ¯¯ä¸Šï¼ŒåŒè…¿ç›˜èµ·ï¼Œä¸€åªæ‰‹æ’‘åœ¨èº«åŽï¼Œèº«ä½“å¾®å€¾çœ‹å‘é•œå¤´',
  'ç«™åœ¨è½åœ°çª—æ—ï¼Œä¸€åªæ‰‹è½»æ‰¶çª—æ¡†ï¼Œä¾§è„¸è®©å…‰æ‰“åœ¨è„¸ä¸Š',
  'ååœ¨é¤æ¡Œæ—åˆ‡è›‹ç³•ï¼Œä¸€åªæ‰‹æ‹¿åˆ€ï¼Œå¦ä¸€åªæ‰‹æ‰¶ç›˜ï¼ŒæŠ¬å¤´çœ‹å‘é•œå¤´',
  'ååœ¨æ²™å‘ä¸Šï¼Œä¸€åªæ‰‹æ­åœ¨æ²™å‘é èƒŒä¸Šï¼Œå¦ä¸€åªæ‰‹è‡ªç„¶åž‚ç€ï¼Œæ…µæ‡’æ­ªå¤´',
  'ç«™åœ¨ç»¿æ¤å¢™å‰ï¼Œä¸€åªæ‰‹æ’©å¤´å‘ï¼Œä¾§èº«çœ‹å‘é•œå¤´',
  'ååœ¨å’–å•¡åº—è§’è½ï¼Œæ‰‹è‚˜æ’‘åœ¨å°æ¡Œä¸Šï¼Œæ‰‹æ‰˜è…®ï¼Œå¾®å¾®å˜Ÿå˜´çœ‹å‘é•œå¤´',
  'ååœ¨æ¥¼æ¢¯å°é˜¶ä¸Šï¼Œä¸€åªæ‰‹æ­åœ¨è†ç›–ä¸Šï¼Œå¦ä¸€åªæ‰‹æ’‘åœ¨å°é˜¶ä¸Šï¼Œçœ‹å‘é•œå¤´',
  'ç«™åœ¨è¯•è¡£é•œå‰æ•´ç†è¡£é¢†ï¼Œä»Žé•œå­é‡Œçœ‹å‘é•œå¤´',
  'ååœ¨éœ²å°æ æ†æ—ï¼Œä¸€åªæ‰‹æ‰¶æ æ†ï¼Œå¦ä¸€åªæ‰‹ä¸¾ç€æ¯å­ï¼Œçœ‹å‘é•œå¤´',
  'ååœ¨åºŠä¸ŠèƒŒé åºŠå¤´ï¼ŒåŒè…¿å¼¯æ›²ï¼Œä¸€åªæ‰‹æ­åœ¨è†ç›–ä¸Šï¼Œçœ‹å‘é•œå¤´',
  'ç«™åœ¨ä¾¿åˆ©åº—å†·è—æŸœå‰ï¼Œä¸€åªæ‰‹æ‹¿ç€é¥®æ–™ï¼Œå›žå¤´çœ‹å‘é•œå¤´',
  'ååœ¨ç”œå“åº—çª—è¾¹ï¼Œä¸€åªæ‰‹æ‹¿ç€å‰å­ï¼Œé¢å‰æœ‰è›‹ç³•ï¼Œçœ‹å‘é•œå¤´',
  'é åœ¨è·¯ç¯æ†æ—ï¼Œä¸€åªæ‰‹æ’å£è¢‹ï¼Œä¾§è„¸çœ‹å‘é•œå¤´',
  'ååœ¨å¤å¤çš®æ²™å‘ä¸Šï¼Œä¸€åªæ‰‹æ­åœ¨æ‰¶æ‰‹ä¸Šï¼Œå¦ä¸€åªæ‰‹æ”¾åœ¨è…¿ä¸Šï¼Œæ…µæ‡’çœ‹å‘é•œå¤´',
  'ç«™åœ¨èŠ±æž¶å‰ï¼Œä¸€åªæ‰‹è½»æ‰¶èŠ±æž¶ï¼Œä¾§è„¸è®©å…‰æ‰“åœ¨æ¯›è¡£ä¸Š',
  'ååœ¨é£˜çª—ä¸Šï¼ŒåŒè…¿ä¼¸ç›´ï¼Œä¸€åªæ‰‹æ’‘åœ¨èº«åŽï¼Œçœ‹å‘é•œå¤´',
  'ç«™åœ¨æ—‹è½¬æ¥¼æ¢¯ä¸Šï¼Œä¸€åªæ‰‹æ‰¶æ‰¶æ‰‹ï¼Œå›žå¤´çœ‹å‘é•œå¤´',
  'ååœ¨éœ²è¥æ¤…ä¸Šï¼Œä¸€åªæ‰‹æ­åœ¨æ¤…èƒŒä¸Šï¼Œå¦ä¸€åªæ‰‹æ‹¿æ¯å­ï¼Œçœ‹å‘é•œå¤´',
  'ååœ¨æµ´ç¼¸è¾¹ç¼˜ï¼ˆå¹²çš„ï¼‰ï¼Œä¸€åªæ‰‹æ­åœ¨æµ´ç¼¸æ²¿ï¼Œçœ‹å‘é•œå¤´',
  'ç«™åœ¨é˜³å°æ™¾è¡£æž¶æ—ï¼Œä¸€åªæ‰‹æ‹¿ç€è¡£æž¶ï¼Œä¾§è„¸çœ‹å‘é•œå¤´',
  'ååœ¨å’–å•¡åº—çª—è¾¹ï¼ŒåŒæ‰‹æ§ç€æ¯å­æ”¾åœ¨æ¡Œä¸Šï¼Œå¾®å¾®ä½Žå¤´çœ‹ç€æ¯å­å†æŠ¬çœ¼',
  'ç«™åœ¨èŠ±åº—æŸœå°å‰ï¼Œä¸€åªæ‰‹è½»æ‰˜ä¸€æŸèŠ±ï¼Œä¾§èº«çœ‹å‘é•œå¤´',
  'ååœ¨æ²™å‘æ‰¶æ‰‹ä¸Šï¼Œä¸€åªæ‰‹æ‰¶ç€é èƒŒï¼Œå¦ä¸€åªæ‰‹è‡ªç„¶åž‚ç€ï¼Œçœ‹å‘é•œå¤´',
  'ç«™åœ¨ä¹¦åº—ä¹¦æž¶é—´ï¼Œä¸€åªæ‰‹æŠ½å‡ºä¸€æœ¬ä¹¦ï¼Œèº«ä½“ä¾§è½¬çœ‹å‘é•œå¤´',
  'ååœ¨æœ¨è´¨å°é˜¶ä¸Šï¼Œæ‰‹è‚˜æ’‘åœ¨è†ç›–ä¸Šï¼Œæ‰‹æ‰˜è…®çœ‹å‘é•œå¤´',
  'é åœ¨è½åœ°çª—è¾¹ï¼Œä¸€åªæ‰‹è½»ç¢°çª—å¸˜ï¼Œä¾§è„¸è®©å…‰è½åœ¨è„¸ä¾§',
  'ååœ¨é¤æ¤…ä¸Šï¼Œä¸€åªæ‰‹æ­åœ¨æ¤…èƒŒï¼Œå¦ä¸€åªæ‰‹æ”¾æ¡Œé¢ï¼Œæ­£è„¸çœ‹å‘é•œå¤´',
  'ç«™åœ¨è¡£æŸœé•œå‰ï¼Œä¸€åªæ‰‹æ•´ç†è¢–å£ï¼Œä»Žé•œä¸­çœ‹å‘é•œå¤´',
  'ååœ¨é˜³å…‰ä¸‹çš„é£˜çª—ä¸Šï¼Œä¸€åªæ‰‹æ’‘åœ¨çª—å°ï¼Œå¦ä¸€åªæ‰‹æ”¾åœ¨è…¿ä¸Šï¼Œçœ‹å‘é•œå¤´',
  'ç«™åœ¨å’–å•¡åº—é—¨å£ï¼Œä¸€åªæ‰‹æŽ¨é—¨ï¼Œå›žå¤´çœ‹å‘é•œå¤´',
  'ååœ¨ç”œå“åº—çª—è¾¹ï¼Œä¸€åªæ‰‹ç”¨å°å‰å­åˆ‡è›‹ç³•ï¼Œè§†çº¿çœ‹å‘é•œå¤´',
  'ç«™åœ¨æ¥¼æ¢¯è½¬è§’ï¼Œä¸€åªæ‰‹æ‰¶æ‰¶æ‰‹ï¼Œèº«ä½“å¾®ä¾§çœ‹å‘é•œå¤´',
  'ååœ¨æ²™å‘å‰çš„åœ°æ¯¯ä¸Šï¼ŒåŒæ‰‹æŠ±è†ï¼Œä¾§è„¸çœ‹å‘é•œå¤´',
  'ç«™åœ¨ç™½è‰²å¢™é¢å‰ï¼Œä¸€åªæ‰‹æŠŠå¤´å‘æ‹¨åˆ°è‚©åŽï¼Œè„¸æ­£å¯¹é•œå¤´',
  'ååœ¨çª—è¾¹çš„çŸ®å‡³ä¸Šï¼Œä¸€åªæ‰‹æ­åœ¨è†ä¸Šï¼Œæ‰‹è‚˜æ’‘ç€å°æ¡Œçœ‹å‘é•œå¤´',
  'ç«™åœ¨é˜³å°æ æ†æ—ï¼Œä¸€åªæ‰‹æ‰¶ç€æ æ†ï¼Œå¦ä¸€åªæ‰‹æ”¾åœ¨å£è¢‹ï¼Œçœ‹å‘è¿œå¤„å†å›žå¤´',
  'ååœ¨åŒ–å¦†é•œå‰ï¼Œä¸€åªæ‰‹æ‹¿ç€å£çº¢ï¼Œä¾§è„¸çœ‹å‘é•œå¤´',
  'ç«™åœ¨æŒ‚æ»¡è¡£æœçš„è¡£æž¶æ—ï¼Œä¸€åªæ‰‹è½»æè¡£æž¶ä¸Šçš„æ¯›è¡£ï¼Œè„¸è½¬å‘é•œå¤´',
  'ååœ¨ä¹¦åº—é˜¶æ¢¯ä¸Šï¼Œä¹¦æ”¾åœ¨è…¿ä¸Šï¼Œä¸€åªæ‰‹æ‰¶ç€ä¹¦é¡µï¼ŒæŠ¬å¤´çœ‹å‘é•œå¤´',
  'ç«™åœ¨åŽ¨æˆ¿å°é¢å‰ï¼Œä¸€åªæ‰‹æ‰¶ç€å°é¢ï¼Œå›žèº«çœ‹å‘é•œå¤´',
  'ååœ¨çª—è¾¹é«˜è„šå‡³ä¸Šï¼Œæ‰‹é‡Œæ¡ç€ä¸€æ¯çƒ­é¥®ï¼Œçœ‹å‘é•œå¤´',
  'ç«™ç›´åŠèº«ï¼ŒåŒæ‰‹ç¼©è¿›æ¯›è¡£è¢–å£é‡Œåªéœ²å‡ºæŒ‡å°–ï¼Œè‚©è†€æ”¾æ¾ï¼Œå¾®å¾®æ­ªå¤´çœ‹å‘é•œå¤´',
  'ç«™ç«‹åŠèº«ï¼Œä¸€åªæ‰‹æ’ç‰›ä»”è£¤å£è¢‹ï¼Œå¦ä¸€åªæ‰‹æ‹Žå°æ–¹åŒ…ï¼Œèº«ä½“å¾®ä¾§çœ‹å‘é•œå¤´',
  'å¯¹ç€é•œå­ä¸¾æ‰‹æœºè‡ªæ‹ï¼Œæ‰‹æœºæŒ¡ä½åŠå¼ è„¸ï¼Œå¦ä¸€åªæ‰‹æ’åœ¨å£è¢‹é‡Œ',
  'ååœ¨è½¦å†…é©¾é©¶åº§ï¼Œèº«ä½“ä¾§å‘é•œå¤´ï¼Œä¸€åªæ‰‹æ‰¶æ–¹å‘ç›˜ï¼Œå¦ä¸€åªæ‰‹æ­åœ¨è…¿ä¸Š',
  'é åœ¨è½¦é—¨è¾¹ï¼Œä¸€åªæ‰‹æ‹¿ç€æ‰‹æœºï¼Œä¾§è„¸çœ‹å‘é•œå¤´',
  'ç«™åœ¨æœºåœºå€™æœºåŽ…ï¼Œä¸€åªæ‰‹æ‰¶è¡ŒæŽç®±æ‹‰æ†ï¼Œå¦ä¸€åªæ‰‹æ•´ç†å›´å·¾ï¼Œå›žå¤´çœ‹å‘é•œå¤´',
  'ç«™åœ¨å•†åœºæ‰¶æ¢¯ä¸Šï¼Œèº«ä½“ä¾§è½¬å›žå¤´çœ‹å‘é•œå¤´ï¼Œå¤´å‘æœ‰åŠ¨æ€',
  'ç«™åœ¨ç”µæ¢¯å£ä½Žå¤´çœ‹æ‰‹æœºï¼Œè‹¥æœ‰æ‰€è§‰æŠ¬å¤´çœ‹å‘é•œå¤´',
  'èµ°åœ¨è¡—å¤´æ–‘é©¬çº¿ä¸Šï¼Œè¾¹èµ°è¾¹å›žå¤´çœ‹å‘é•œå¤´ï¼ŒæŠ“æ‹åŠ¨æ€',
  'ç«™åœ¨å¤©æ¡¥ä¸Šï¼Œä¸€åªæ‰‹æ‰¶æ æ†ï¼Œä¾§è„¸çœ‹å‘è¿œå¤„å†å›žå¤´',
  'é åœ¨æ°´æ³¥å¢™è¾¹ï¼ŒåŒæ‰‹æ’å…œï¼Œä¸€æ¡è…¿å¾®æ›²ï¼Œè§†çº¿çœ‹å‘é•œå¤´',
  'è¹²åœ¨è¡—è¾¹å°é˜¶ä¸Šï¼Œä¸€åªæ‰‹æ’‘è†ç›–ï¼Œå¦ä¸€åªæ‰‹æ‰˜è…®çœ‹å‘é•œå¤´',
  'ååœ¨å°é˜¶ä¸Šï¼Œä¸€åªæ‰‹æ‹¿æ‰‹æœºæŒ¡åœ¨ä¸‹å·´å‰ï¼Œçœ‹å‘é•œå¤´',
  'ç«™ç«‹åŠèº«ï¼ŒåŒæ‰‹æŠ±è‡‚ï¼Œè‚©è†€ä¸€é«˜ä¸€ä½Žï¼Œå†·æ·¡çœ‹å‘é•œå¤´',
  'ç«™ç«‹åŠèº«ï¼Œä¸€åªæ‰‹è½»è½»æ‹‰é¢†å£ï¼Œå±•ç¤ºé¢†åž‹ï¼Œçœ‹å‘é•œå¤´',
  'ç«™ç«‹åŠèº«ï¼Œä¸€åªæ‰‹æ•´ç†è¢–å£ï¼Œä½Žå¤´çœ‹è¢–å£å†æŠ¬çœ¼',
  'ç«™ç«‹åŠèº«ï¼ŒåŒæ‰‹æ§ç€è„¸é¢Šï¼Œæ‰‹è‚˜æ”¶åœ¨èƒ¸å‰ï¼Œçœ‹å‘é•œå¤´',
  'ç«™ç«‹åŠèº«ï¼Œä¸€åªæ‰‹ä¸¾åˆ°é¢å‰æŒ¡é˜³å…‰ï¼Œçœ¯çœ¼çœ‹å‘é•œå¤´',
  'ç«™ç«‹åŠèº«ï¼Œä¾§èº«å›žçœ¸ï¼Œä¸€åªæ‰‹æŠŠå¤´å‘æ‹¨åˆ°è€³åŽ',
  'ååœ¨å’–å•¡é¦†é«˜è„šå‡³ä¸Šï¼ŒåŒè…¿äº¤å ï¼Œä¸€åªæ‰‹æ’‘åœ¨å‡³é¢ï¼Œå¦ä¸€åªæ‰‹æ”¾è…¿ä¸Š',
  'ååœ¨é¤åŽ…å¡åº§é‡Œï¼Œä¸€åªæ‰‹æ‰˜è…®ï¼Œå¦ä¸€åªæ‰‹æ­åœ¨æ¡Œæ²¿ï¼Œçœ‹å‘é•œå¤´',
  'ååœ¨è½¦å†…å‰¯é©¾é©¶ï¼Œç³»ç€å®‰å…¨å¸¦ï¼Œèº«ä½“å¾®ä¾§çœ‹å‘é•œå¤´',
  'ç«™åœ¨å•†åœºå¥³è£…åº—çš„æŒ‚è¡£æ†æ—ï¼Œä¸€åªæ‰‹è½»æ‰¶è¡£æž¶ï¼Œå¦ä¸€åªæ‰‹æ’å…œ',
  'ç«™åœ¨æœè£…åº—é•œå­å‰ï¼Œä¸€åªæ‰‹æ•´ç†æ¯›è¡£ä¸‹æ‘†ï¼Œä»Žé•œä¸­çœ‹å‘é•œå¤´',
  'ååœ¨è¯•è¡£é—´å¤–çš„é•¿å‡³ä¸Šï¼Œä¸€æ¡è…¿æ­åœ¨å¦ä¸€æ¡è…¿ä¸Šï¼Œçœ‹å‘é•œå¤´',
  'ååœ¨åœ°æ¯¯ä¸Šï¼Œä¸€åªæ‰‹æ’‘åœ°ï¼Œå¦ä¸€åªæ‰‹æ­åœ¨è†ç›–ä¸Šï¼Œèº«ä½“ä¾§å€¾',
  'ç«™ç«‹åŠèº«ï¼Œä¸€åªæ‰‹æ’å…œï¼Œå¦ä¸€åªæ‰‹æ‹¿ç€æ‰‹æœºåž‚åœ¨èº«ä¾§',
  'ç«™ç«‹åŠèº«ï¼ŒåŒæ‰‹æ§ç€çƒ­å’–å•¡æ¯é è¿‘èƒ¸å£ï¼Œå¾®å¾®ä½Žå¤´å†æŠ¬çœ¼',
  'ç«™ç«‹åŠèº«ï¼Œä¸€åªæ‰‹æ‹Žç€è´­ç‰©è¢‹ï¼Œå¦ä¸€åªæ‰‹æ‹¨å¤´å‘ï¼Œçœ‹å‘é•œå¤´ä¾§é¢',
  'ç«™åœ¨é›ªæ™¯è¡—è¾¹ï¼ŒåŒæ‰‹æ’å…œï¼Œç¼©ç€è‚©è†€ï¼Œçœ‹å‘é•œå¤´',
  'ç«™åœ¨æµ·è¾¹æ æ†æ—ï¼Œä¸€åªæ‰‹åŽ‹ä½è¢«é£Žå¹èµ·çš„å¤´å‘ï¼Œä¾§è„¸çœ‹å‘é•œå¤´',
  'ååœ¨æˆ·å¤–éœ²è¥æ¤…ä¸Šï¼ŒåŒæ‰‹æ§ç€é©¬å…‹æ¯ï¼Œè…¿äº¤å ï¼Œçœ‹å‘é•œå¤´',
  'ç«™åœ¨åœ°é“è½¦åŽ¢é‡Œï¼Œä¸€åªæ‰‹æ‰¶åŠçŽ¯ï¼Œå¦ä¸€åªæ‰‹æ’å…œï¼Œçœ‹å‘é•œå¤´',
  'ååœ¨ä¹¦åº—çª—å°ï¼Œä¸€æ¡è…¿åž‚ä¸‹ï¼Œä¸€åªæ‰‹æ‰¶çª—æ¡†ï¼Œçœ‹å‘é•œå¤´',
  'ç«™ç«‹åŠèº«ï¼Œä¸€åªæ‰‹èƒŒåœ¨èº«åŽï¼Œå¦ä¸€åªæ‰‹è½»ç¢°è€³çŽ¯ï¼Œçœ‹å‘é•œå¤´',
  'ç«™ç«‹åŠèº«ï¼Œå¾®å¾®ä»°å¤´çœ‹å‘é•œå¤´ï¼Œå˜´å”‡è‡ªç„¶å¾®å¼ ',
  'ç«™ç«‹åŠèº«ï¼Œä½Žå¤´çœ‹æ‰‹æœºï¼Œå¤´å‘åž‚ä¸‹æ¥é®ä½ä¸€ç‚¹ä¾§è„¸',
  'ååœ¨åœ°æ¿ä¸Šï¼Œä¸€æ¡è…¿ä¼¸ç›´ä¸€æ¡è…¿å¼¯æ›²ï¼Œä¸€åªæ‰‹æ’‘åœ°çœ‹å‘é•œå¤´',
  'ç«™åœ¨æ¥¼æ¢¯ä¸Šï¼Œä¸€åªæ‰‹æ‰¶æ‰¶æ‰‹ï¼Œèº«ä½“å‰å€¾çœ‹å‘é•œå¤´',
  'ç«™ç«‹åŠèº«ï¼Œä¸€åªæ‰‹æ‹¿ç€å¸½å­åž‚åœ¨èº«ä¾§ï¼Œå¦ä¸€åªæ‰‹æ’å…œ'
];

// åœºæ™¯å¸¦é£Žæ ¼æ ‡ç­¾ï¼Œç”Ÿæˆæ—¶åªæŒ‘å’Œè¯†åˆ«å‡ºçš„é£Žæ ¼åŒ¹é…çš„ã€‚èƒŒæ™¯è¦æ¸…æ™°å¯è¾¨ï¼Œä¸è¦ç³ŠæŽ‰
const LIFE_SCENES = [
  { t: 'éŸ©ç³»å’–å•¡é¦†å†…ï¼Œæœ¨è´¨å§å°å’Œç™½è‰²ç“·ç –å¢™ï¼Œæš–é»„åŠç¯ï¼Œæ¡Œä¸Šæœ‰çº¸æ¯å’–å•¡å’Œä¸€å—è›‹ç³•ï¼ŒèƒŒæ™¯çš„å’–å•¡æœºã€èœå•æ¿ã€ç»¿æ¤éƒ½æ¸…æ™°å¯è¾¨ï¼Œæ•´ä½“æ˜Žäº®æ¸©æš–', s: ['éŸ©ç‰ˆ', 'insé£Ž', 'æ¸©æŸ”é£Ž', 'é€šå‹¤'] },
  { t: 'å’–å•¡é¦†é çª—åº§ä½ï¼Œæœ¨è´¨æ¡Œé¢ã€æ‹¿é“æ¯å’Œæœ¨æ‰˜ç›˜ï¼Œçª—å¤–è¡—æ™¯æ˜Žäº®æ¸…æ¥šï¼Œæš–å…‰æ‰“åœ¨æ¡Œé¢å’Œæ¯›è¡£ä¸Š', s: ['éŸ©ç‰ˆ', 'é€šå‹¤', 'insé£Ž'] },
  { t: 'å’–å•¡é¦†é•œå­å‰ï¼Œé•œé¢é‡Œèƒ½çœ‹åˆ°åº—å†…çš„æœ¨è´¨æŸœå°ã€åŠç¯å’Œç“·ç –å¢™ï¼Œæš–å…‰å……è¶³ï¼Œé•œè¾¹æ¡†æ˜¯æ·±è‰²æœ¨è´¨ï¼ŒèƒŒæ™¯ç»†èŠ‚æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'insé£Ž'] },
  { t: 'ç±³è‰²å¢™é¢å’Œç™½è‰²ç½®ç‰©æž¶çš„å±…å®¶è§’è½ï¼Œæš–è‰²è½åœ°ç¯å…‰ï¼ŒèƒŒæ™¯æœ‰ç»¿æ¤ã€æ¯å­å’Œæ‚ç‰©ï¼Œæ˜Žäº®æœ‰ç”Ÿæ´»æ°”æ¯ï¼Œç»†èŠ‚æ¸…æ¥š', s: ['æ…µæ‡’é£Ž', 'æ¸©æŸ”é£Ž', 'insé£Ž'] },
  { t: 'å§å®¤åºŠè¾¹ï¼Œæµ…è‰²åºŠå“å’Œé’ˆç»‡æ¯›æ¯¯ï¼Œæ™¨å…‰æ˜Žäº®æŸ”å’Œï¼Œçª—æœ‰ç™½è‰²çº±å¸˜ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ—¥ç³»', 'æ…µæ‡’é£Ž', 'æ¸©æŸ”é£Ž'] },
  { t: 'çª—è¾¹å§å®¤ï¼Œæµ…è‰²çº±å¸˜é€å…‰ï¼Œæµ…æœ¨åœ°æ¿ï¼Œæ˜Žäº®è‡ªç„¶å…‰ï¼Œçª—å°æœ‰å°ç›†æ ½ï¼ŒèƒŒæ™¯æ¸…æ™°', s: ['æ—¥ç³»', 'æ¸©æŸ”é£Ž', 'æ³•å¼'] },
  { t: 'å¤å¤æœ¨è´¨è¡£æž¶å‰ï¼Œæš–é»„ç¯å…‰ï¼ŒèƒŒæ™¯æŒ‚ç€æµ…è‰²è¡£æœå’Œé’ˆç»‡å•å“ï¼Œç»†èŠ‚æ¸…æ¥š', s: ['å¤å¤', 'æ³•å¼', 'æ…µæ‡’é£Ž'] },
  { t: 'å¤å¤å’–å•¡é¦†ï¼Œæ·±è‰²æœ¨è´¨å¢™æ¿ã€é»„é“œåŠç¯å’Œçš®æ²™å‘ï¼Œå¤§çª—æ—¥å…‰å……è¶³æ˜Žäº®ï¼Œæš–é‡‘è‰²è°ƒï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['å¤å¤', 'æ³•å¼', 'æ…µæ‡’é£Ž'] },
  { t: 'æ ¡å›­å›¾ä¹¦é¦†é çª—ä½ç½®ï¼ŒæˆæŽ’ä¹¦æœ¬å’Œæœ¨è´¨ä¹¦æž¶ï¼Œå¤§çª—æ—¥å…‰å¾ˆäº®ï¼Œæ¡Œé¢æœ‰æš–å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['å­¦é™¢é£Ž', 'å¤å¤'] },
  { t: 'æ•™å­¦æ¥¼èµ°å»Šï¼Œç»¿æ ‘èƒŒæ™¯ï¼Œæ˜Žäº®è‡ªç„¶å…‰ï¼Œç™½å¢™å’Œæœ¨æ‰¶æ‰‹ï¼ŒèƒŒæ™¯æ¸…æ™°', s: ['å­¦é™¢é£Ž', 'æ—¥ç³»'] },
  { t: 'å†™å­—æ¥¼çŽ»ç’ƒå¹•å¢™èµ°å»Šï¼Œç®€æ´çŽ°ä»£ï¼Œæ˜Žäº®è‡ªç„¶å…‰ï¼Œè¿œå¤„ç»¿æ¤æ¸…æ¥š', s: ['é€šå‹¤'] },
  { t: 'è¡—è¾¹ç»¿æ¤å¢™å‰ï¼ŒåŸŽå¸‚è¡—æ‹ï¼Œæ—¥å…‰æŸ”å’Œï¼ŒèƒŒæ™¯æœ‰å’–å•¡åº—æ‹›ç‰Œæ¸…æ¥šå¯è¾¨', s: ['éŸ©ç‰ˆ', 'insé£Ž'] },
  { t: 'ç§‹æ—¥è¡—æ™¯ï¼Œè½å¶å’Œè¡—é“ï¼Œæš–é»„æ—¥å…‰ï¼ŒèƒŒæ™¯æœ‰åº—é“ºæ©±çª—æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'é€šå‹¤', 'æ³•å¼'] },
  { t: 'èŠ±åº—é—¨å£ï¼ŒèŠ±æŸå’Œç»¿æ¤ï¼Œæš–å…‰ï¼Œæœ¨è´¨é—¨æ¡†ï¼ŒçŽ»ç’ƒçª—é€è¿›æ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ¸©æŸ”é£Ž', 'æ³•å¼', 'æ—¥ç³»'] },
  { t: 'ä¹¦åº—é çª—è¿‡é“ï¼Œæœ¨è´¨ä¹¦æž¶å’Œæ˜Žäº®é˜…è¯»åŒºï¼Œçª—è¾¹æ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['å­¦é™¢é£Ž', 'å¤å¤', 'æ¸©æŸ”é£Ž'] },
  { t: 'åœ°é“å£æˆ–æ–‘é©¬çº¿ï¼ŒåŸŽå¸‚æ—¥å¸¸èƒŒæ™¯ï¼Œæ˜Žäº®è‡ªç„¶å…‰ï¼Œè¿œå¤„è¡Œäººæ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'é€šå‹¤'] },
  { t: 'ç™½å¤©éœ²å°ï¼Œæ˜Žäº®æ—¥å…‰ã€ç™½è‰²æ æ†å’Œç»¿æ¤ï¼Œè¿œå¤„åŸŽå¸‚æ¸…æ¥šï¼Œæš–è°ƒ', s: ['insé£Ž', 'éŸ©ç‰ˆ'] },
  { t: 'æžç®€å±…å®¶è§’è½ï¼Œç™½å¢™ã€æµ…æœ¨åœ°æ¿ã€ä¸€ç›†ç»¿æ¤ï¼Œæ˜Žäº®çª—æˆ·å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'æ—¥ç³»'] },
  { t: 'æ²™å‘æ—ï¼Œç±³è‰²æŠ±æž•å’Œé’ˆç»‡æ¯›æ¯¯ï¼Œæš–è‰²ç¯å…‰ï¼Œæœ¨è´¨è¾¹å‡ ä¸Šæœ‰æ¯å­ï¼Œçª—å¤–æ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ…µæ‡’é£Ž', 'æ¸©æŸ”é£Ž'] },
  { t: 'æ‰“å¼€çš„è¡£æŸœå‰ï¼Œæ•´é½æŒ‚ç€çš„æµ…è‰²è¡£æœï¼Œæš–å…‰ï¼Œæœ¨è´¨æŸœä½“æ¸…æ¥š', s: ['æ…µæ‡’é£Ž', 'é€šå‹¤', 'insé£Ž'] },
  { t: 'å…¨èº«é•œå‰ï¼Œé•œé¢åå…‰ï¼Œæˆ¿é—´ä¸€è§’æœ‰ç»¿æ¤å’Œæœ¨è´¨è¡£æž¶ï¼Œæ˜Žäº®æ¸©æš–ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'éŸ©ç‰ˆ'] },
  { t: 'æœ¨è´¨é¤æ¡Œæ—ï¼Œæµ…è‰²é¤å…·ã€ç»¿æ¤å’Œçº¸æ¯å’–å•¡ï¼Œæ—¥é—´æ˜Žäº®æŸ”å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ—¥ç³»', 'æ¸©æŸ”é£Ž'] },
  { t: 'è½åœ°çª—å‰çš„åœ°æ¯¯ä¸Šï¼Œçª—å¤–åŸŽå¸‚æ˜Žäº®ï¼Œå®¤å†…æš–å…‰ï¼Œæœ‰æŠ±æž•ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'æ—¥ç³»', 'éŸ©ç‰ˆ'] },
  { t: 'ç™½å¤©è¡—è¾¹å’–å•¡åº—é—¨å£ï¼Œæµ…è‰²å¢™é¢ã€æœ¨è´¨é—¨çª—å’Œç»¿æ¤ï¼Œæ—¥å…‰å……è¶³ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'insé£Ž'] },
  { t: 'å…¬å›­é•¿æ¤…ï¼Œç»¿æ ‘å’ŒæŸ”å’Œæ—¥å…‰ï¼Œæœ¨è´¨é•¿æ¤…ï¼ŒèƒŒæ™¯æœ‰æ•£æ­¥çš„äººæ¸…æ¥š', s: ['æ—¥ç³»', 'å­¦é™¢é£Ž', 'æ¸©æŸ”é£Ž'] },
  { t: 'ç”œå“åº—åº—å†…ï¼Œæœ¨è´¨æ¡Œæ¤…ã€çŽ»ç’ƒæŸœé‡Œçš„è›‹ç³•ã€æš–é»„åŠç¯ï¼Œæ˜Žäº®æ¸©æš–ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'insé£Ž', 'æ¸©æŸ”é£Ž'] },
  { t: 'ä¾¿åˆ©åº—å†·è—æŸœå‰ï¼Œæ˜Žäº®å†·ç™½å…‰ï¼Œè´§æž¶ä¸Šé¥®æ–™æ¸…æ¥šï¼ŒèƒŒæ™¯æ¸…æ™°', s: ['é€šå‹¤', 'insé£Ž'] },
  { t: 'æ°‘å®¿å®¢åŽ…ï¼Œå¸ƒè‰ºæ²™å‘ã€åŽŸæœ¨èŒ¶å‡ ã€æš–é»„è½åœ°ç¯ï¼Œçª—å¤–æ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ…µæ‡’é£Ž', 'æ¸©æŸ”é£Ž', 'insé£Ž'] },
  { t: 'å¤å¤æ—‹è½¬æ¥¼æ¢¯ï¼Œæœ¨è´¨æ‰¶æ‰‹å’Œé“è‰ºæ æ†ï¼Œæš–å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['å¤å¤', 'æ³•å¼'] },
  { t: 'éœ²è¥é£Žé˜³å°ï¼ŒæŠ˜å æ¤…ã€å°æ¡Œã€ç»¿æ¤ï¼Œæ˜Žäº®æ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'éŸ©ç‰ˆ'] },
  { t: 'å©šçº±åº—è¯•è¡£é•œå‰ï¼Œæš–å…‰ï¼Œé•œé¢åå…‰æ¸…æ¥š', s: ['æ³•å¼', 'æ¸©æŸ”é£Ž'] },
  { t: 'è‰ºæœ¯å±•è§ˆé¦†èµ°å»Šï¼Œç™½å¢™ã€æœ¨åœ°æ¿ã€è¿œå¤„ç”»ä½œï¼Œæ˜Žäº®æŸ”å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ³•å¼', 'insé£Ž'] },
  { t: 'é¢åŒ…åº—æŸœå°å‰ï¼ŒçŽ»ç’ƒæŸœé‡Œçš„é¢åŒ…ã€æš–é»„ç¯å…‰ã€æœ¨è´¨è£…ä¿®ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'æ¸©æŸ”é£Ž'] },
  { t: 'æ—§ç‰©å¸‚é›†æ‘Šä½å‰ï¼Œæœ¨æ¡Œã€é™¶ç“·æ¯ã€ç»¿æ¤ï¼Œæš–å…‰ï¼ŒèƒŒæ™¯æœ‰ç”Ÿæ´»æ‚ç‰©æ¸…æ¥š', s: ['å¤å¤', 'æ…µæ‡’é£Ž'] },
  { t: 'ç‘œä¼½åž«æ—çš„å±…å®¶è§’è½ï¼Œæµ…è‰²åœ°æ¯¯ã€ç»¿æ¤ã€æš–è‰²ç¯å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'æ¸©æŸ”é£Ž'] },
  { t: 'é…’åº—æˆ¿é—´çª—è¾¹ï¼Œçº±å¸˜ã€å¤§åºŠã€æš–å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ³•å¼', 'æ¸©æŸ”é£Ž'] },
  { t: 'å¤å¤ç†å‘åº—ç­‰å€™åŒºï¼Œçš®æ¤…ã€ç»¿æ¤ã€æš–é»„åŠç¯ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['å¤å¤', 'insé£Ž'] },
  { t: 'æµ·è¾¹å’–å•¡åº—éœ²å°ï¼Œç™½è‰²æ æ†ã€ç»¿æ¤ã€è¿œå¤„æµ·é¢æ˜Žäº®ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'insé£Ž'] },
  { t: 'æ—§ä¹¦åº—äºŒæ¥¼ï¼Œæ»¡å¢™ä¹¦æž¶ã€æœ¨åœ°æ¿ã€æš–å…‰å°ç¯ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['å¤å¤', 'å­¦é™¢é£Ž'] },
  { t: 'ç¤¾åŒºä¾¿åˆ©åº—é—¨å£ï¼Œè‡ªåŠ¨é—¨ã€æš–è‰²ç¯å…‰ã€è´§æž¶ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['é€šå‹¤', 'æ—¥ç³»'] },
  { t: 'æ—¥å¼æ¦»æ¦»ç±³æˆ¿é—´ï¼Œè‰å¸­ã€éšœå­é—¨ã€æš–å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ—¥ç³»', 'æ¸©æŸ”é£Ž'] },
  { t: 'ç”»å®¤ä¸€è§’ï¼Œç”»æž¶ã€é¢œæ–™ã€æš–å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ³•å¼', 'insé£Ž'] },
  { t: 'èŠ±åº—å†…éƒ¨ï¼ŒèŠ±æž¶ä¸Šæ»¡æ˜¯é²œèŠ±ã€æš–å…‰ã€æœ¨åœ°æ¿ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ¸©æŸ”é£Ž', 'æ³•å¼', 'æ—¥ç³»'] },
  { t: 'å’–å•¡åº—å§å°æ—çš„é«˜è„šå‡³ï¼Œé»„é“œç¯ã€æœ¨è´¨å°é¢ã€èƒŒæ™¯å’–å•¡å™¨å…·æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'insé£Ž', 'é€šå‹¤'] },
  { t: 'åŒ—æ¬§é£Žå®¢åŽ…ï¼Œæµ…è‰²æ²™å‘ã€æœ¨è´¨èŒ¶å‡ ã€ç»¿æ¤ã€å¤§çª—æ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'æ—¥ç³»'] },
  { t: 'å¤å¤ç…§ç›¸é¦†ï¼Œæš–è‰²èƒŒæ™¯å¸ƒã€æœ¨è´¨é“å…·ã€æš–å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['å¤å¤', 'æ³•å¼'] },
  { t: 'éŸ©å¼ç”œå“å’–å•¡åº—äºŒæ¥¼ï¼Œç™½è‰²å¢™é¢ã€æœ¨è´¨æ¡Œæ¤…ã€ç”œå“æŸœã€æš–å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥šæ˜Žäº®', s: ['éŸ©ç‰ˆ', 'insé£Ž', 'æ¸©æŸ”é£Ž'] },
  { t: 'å®¶å±…åº—æ ·æ¿é—´å®¢åŽ…ï¼Œæµ…è‰²å¸ƒè‰ºæ²™å‘ã€æœ¨èŒ¶å‡ ã€å¹²èŠ±å’Œç»¿æ¤ï¼Œæ˜Žäº®æ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'æ…µæ‡’é£Ž'] },
  { t: 'èŠ±è‰ºå·¥ä½œå®¤ï¼ŒæˆæŽ’èŠ±æ¡¶å’Œæœ¨è´¨é•¿æ¡Œï¼Œè‡ªç„¶å…‰ä»Žçª—è¿›æ¥ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ¸©æŸ”é£Ž', 'æ³•å¼', 'æ—¥ç³»'] },
  { t: 'è€æ´‹æˆ¿æ¥¼æ¢¯é—´ï¼Œæœ¨è´¨æ¥¼æ¢¯ã€ç™½å¢™ã€ç»¿æ¤ï¼Œæš–å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ³•å¼', 'å¤å¤'] },
  { t: 'å•†åœºå¥³è£…åŒºè¯•è¡£é—´å¤–ï¼Œæµ…è‰²å¢™é¢å’ŒæŒ‚è¡£æ†ï¼Œæ˜Žäº®ç¯å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['é€šå‹¤', 'éŸ©ç‰ˆ'] },
  { t: 'æ—©åˆé¤åº—é çª—å¡åº§ï¼Œè—¤ç¼–æ¤…ã€æœ¨è´¨æ¡Œã€çª—å¤–è¡—æ™¯ï¼Œæ˜Žäº®æ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'éŸ©ç‰ˆ', 'æ¸©æŸ”é£Ž'] },
  { t: 'å­¦æ ¡æ•™å®¤çª—è¾¹ï¼Œæœ¨è´¨è¯¾æ¡Œã€é»‘æ¿å’Œçª—å¤–ç»¿æ ‘ï¼Œæ—¥å…‰æ˜Žäº®ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['å­¦é™¢é£Ž', 'æ—¥ç³»'] },
  { t: 'å’–å•¡åº—éœ²å°ï¼Œæœ¨è´¨å›´æ ã€ç»¿æ¤ã€è—¤æ¤…å’Œé®é˜³ä¼žï¼Œæ˜Žäº®æ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'insé£Ž'] },
  { t: 'æ–‡åˆ›å¸‚é›†æ‘Šä½ï¼Œæœ¨è´¨è´§æž¶ã€æ‰‹ä½œæ‘†ä»¶ã€æš–é»„ç¯ä¸²ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'å¤å¤'] },
  { t: 'æ—¥æ–™åº—é—¨å£ï¼Œæœ¨è´¨æŽ¨æ‹‰é—¨ã€ç¯ç¬¼ã€æš–å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ—¥ç³»', 'æ¸©æŸ”é£Ž'] },
  { t: 'ç¾Žæœ¯é¦†ç™½å¢™å±•åŽ…ï¼Œç”»ä½œå’ŒæŸ”å…‰å°„ç¯ï¼Œæ˜Žäº®å¹²å‡€ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ³•å¼', 'insé£Ž'] },
  { t: 'å†¬æ—¥è¡—è§’é¢åŒ…åº—ï¼Œæœ¨è´¨é—¨é¢ã€æš–é»„æ©±çª—ç¯ã€è·¯è¾¹è¡—æ™¯ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'æ¸©æŸ”é£Ž', 'å¤å¤'] },
  { t: 'é˜³å°èŠ±æž¶æ—ï¼Œè—¤æ¤…ã€å°åœ†æ¡Œã€ç™½è‰²èŠ±ç›†å’Œç»¿æ¤ï¼ŒåˆåŽæ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'æ¸©æŸ”é£Ž', 'æ—¥ç³»'] },
  { t: 'ç§å®¶è½¦å†…ï¼Œç±³è‰²çœŸçš®åº§æ¤…å’Œæš–è‰²æ°›å›´ç¯ï¼Œè½¦çª—å¤–æ˜¯åœ°ä¸‹è½¦åº“æˆ–è¡—æ™¯ï¼Œå…‰çº¿æŸ”å’Œï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'insé£Ž', 'æ¸©æŸ”é£Ž'] },
  { t: 'æœºåœºå€™æœºå¤§åŽ…ï¼Œè½åœ°çª—ã€è¡ŒæŽè½¦å’Œè¿œå¤„èˆªç­ä¿¡æ¯å±ï¼Œç™½å¤©æ˜Žäº®ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['é€šå‹¤', 'éŸ©ç‰ˆ', 'insé£Ž'] },
  { t: 'åœ°é“è½¦åŽ¢å†…ï¼Œæµ…è‰²åº§æ¤…å’Œæ‰¶æ‰‹ï¼Œè½¦åŽ¢ç¯å…‰æ˜Žäº®ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['é€šå‹¤', 'æ—¥ç³»', 'éŸ©ç‰ˆ'] },
  { t: 'å•†åœºå¥³è£…åŒºæ‰¶æ¢¯æ—ï¼Œæµ…è‰²å¢™é¢ã€æŒ‚è¡£æ†å’Œæ¨¡ç‰¹é“å…·ï¼Œç¯å…‰é€šæ˜Žï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['é€šå‹¤', 'éŸ©ç‰ˆ', 'insé£Ž'] },
  { t: 'åœ°ä¸‹è½¦åº“ç”µæ¢¯å£ï¼Œæ°´æ³¥å¢™å’Œæš–è‰²ç¯å¸¦ï¼Œå…‰æ¯”å¹²å‡€ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'éŸ©ç‰ˆ', 'é€šå‹¤'] },
  { t: 'åŸŽå¸‚è¡—å¤´æ–‘é©¬çº¿ï¼Œè½¦æµå’Œåº—é“ºæ‹›ç‰Œè™šåŒ–ä½†ä»å¯è¾¨è®¤ï¼Œç™½å¤©é˜³å…‰æ˜Žäº®', s: ['éŸ©ç‰ˆ', 'insé£Ž', 'é€šå‹¤'] },
  { t: 'å¤©æ¡¥æ æ†æ—ï¼Œè¿œå¤„é«˜æ¥¼å’Œè¡—é“ï¼Œå‚æ™šåæš–æ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['é€šå‹¤', 'éŸ©ç‰ˆ', 'æ³•å¼'] },
  { t: 'è¶…å¸‚è´§æž¶é—´ï¼Œæ˜Žäº®é¡¶ç¯ï¼Œè´§æž¶å•†å“æ¸…æ¥šï¼ŒèƒŒæ™¯å¹²å‡€', s: ['æ—¥ç³»', 'é€šå‹¤'] },
  { t: 'å’–å•¡é¦†å®¤å¤–åº§ä½ï¼Œè—¤æ¤…ã€å°åœ†æ¡Œã€é®é˜³ä¼žå’Œè¡—æ™¯ï¼ŒåˆåŽé˜³å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'éŸ©ç‰ˆ', 'æ³•å¼'] },
  { t: 'é…’åº—å¤§å ‚ï¼Œå¤§ç†çŸ³åœ°é¢ã€æš–è‰²å£ç¯å’Œç»¿æ¤ï¼Œæ˜Žäº®å¹²å‡€ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ³•å¼', 'æ¸©æŸ”é£Ž', 'insé£Ž'] },
  { t: 'è¡£å¸½é—´æŒ‚è¡£æ†å‰ï¼Œæœ¨è´¨æŸœä½“ã€æ•´é½æŒ‚ç€çš„ç§‹å†¬è¡£æœï¼Œæš–å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ…µæ‡’é£Ž', 'éŸ©ç‰ˆ', 'insé£Ž'] },
  { t: 'å¥¶æ²¹è‰²çº¯è‰²å½±æ£šèƒŒæ™¯ï¼ŒæŸ”å’Œå‡åŒ€å¸ƒå…‰ï¼Œåœ°é¢åŒè‰²ï¼Œç”»é¢å¹²å‡€', s: ['insé£Ž', 'éŸ©ç‰ˆ', 'æ¸©æŸ”é£Ž'] },
  { t: 'æµ…ç°æ¸å˜å½±æ£šèƒŒæ™¯ï¼ŒæŸ”å…‰ç®±å¸ƒå…‰ï¼Œå¹²å‡€ä½†æœ‰è½»å¾®å…‰å½±å±‚æ¬¡', s: ['éŸ©ç‰ˆ', 'é€šå‹¤', 'insé£Ž'] },
  { t: 'å§å®¤åœ°æ¯¯ä¸Šï¼Œæµ…è‰²åºŠå“å’Œæ¯›æ¯¯ï¼Œçª—å¤–é˜´å¤©æŸ”å…‰ï¼Œç”»é¢æ˜Žäº®ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ…µæ‡’é£Ž', 'æ—¥ç³»', 'æ¸©æŸ”é£Ž'] },
  { t: 'é›ªåŽçš„è¡—è¾¹ï¼Œç§¯é›ªå’Œäº®ç€çš„åº—é“ºæ©±çª—ï¼Œå†·è°ƒæ˜Žäº®ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'æ³•å¼', 'æ¸©æŸ”é£Ž'] },
  { t: 'æµ·è¾¹æœ¨æ ˆé“ï¼Œæ æ†ã€æ²™æ»©å’Œè¿œå¤„æµ·é¢ï¼Œæ—¥å…‰å……è¶³ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'éŸ©ç‰ˆ', 'æ³•å¼'] },
  { t: 'å°é…’é¦†å§å°ï¼Œæœ¨è´¨å°é¢ã€é»„é“œç¯å…·å’Œé…’ç“¶ï¼Œæš–é»„ç¯å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['å¤å¤', 'æ³•å¼', 'æ…µæ‡’é£Ž'] },
  { t: 'ç”µæ¢¯é•œé¢é‡Œèƒ½çœ‹åˆ°æ¥¼é“ç¯å’Œäººç‰©å€’å½±ï¼Œæš–å…‰å¹²å‡€ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'é€šå‹¤', 'éŸ©ç‰ˆ'] },
  { t: 'æœè£…åº—è¯•è¡£é—´å¤–ï¼Œæµ…è‰²å¢™é¢ã€æŒ‚è¡£é’©å’Œå…¨èº«é•œï¼Œç¯å…‰æ˜Žäº®ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['é€šå‹¤', 'éŸ©ç‰ˆ', 'insé£Ž'] },
  { t: 'å†¬æ—¥å’–å•¡é¦†çª—è¾¹ï¼Œçª—å¤–é£˜é›ªï¼Œå®¤å†…æš–é»„ç¯å…‰å’Œæœ¨è´¨æ¡Œé¢ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['éŸ©ç‰ˆ', 'æ¸©æŸ”é£Ž', 'å¤å¤'] },
  { t: 'å¥¶æ²¹é£Žå®¢åŽ…æ²™å‘æ—ï¼Œæµ…è‰²å¸ƒè‰ºæ²™å‘å’Œç¾Šæ¯›æ¯¯ï¼Œå¤§çª—æ—¥å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['insé£Ž', 'æ…µæ‡’é£Ž', 'æ¸©æŸ”é£Ž'] },
  { t: 'æ—¥å¼è¡—é“ä¾¿åˆ©åº—é—¨å£ï¼Œè‡ªåŠ¨è´©å–æœºå’Œæš–è‰²ç¯ç®±ï¼Œå¤œé—´åæš–å…‰ï¼ŒèƒŒæ™¯æ¸…æ¥š', s: ['æ—¥ç³»', 'éŸ©ç‰ˆ'] }
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

// ã€Œä¸å¸¦è£…é¥°ã€å¼€å…³ï¼šè¿”å›ž buildJimengPrompts ç”¨çš„å‚æ•°
function arkAccOpts() {
  return S.arkCounts.noAccessory
    ? { simple: true, noAccessory: true, accessory: S.arkCounts.accessoryList || 'ä¸å¸¦ã€è•¾ä¸è´è¶ç»“ç­‰è£…é¥°' }
    : null;
}

// ç”»è´¨æ”¶å°¾è¯­ï¼šæŒ‰ã€Œå‡ºå›¾é£Žæ ¼ã€é€‰ç”Ÿæ´»ç§è‰æˆ–ç™½åº•å½±æ£šï¼›å¼€äº†ã€Œä¸å¸¦è£…é¥°ã€æ—¶åŽ»æŽ‰ã€Œè£…é¥°ä¸ŽåŽŸå›¾ä¸€è‡´ã€
function arkPhotoTag(style) {
  const mode = style || S.arkCounts.photoStyle || 'blend';
  const life = mode !== 'studio';
  // å…‰ä½ä¿æŒç»Ÿä¸€ï¼Œé•œå¤´å’Œç™½å¹³è¡¡æ¯å¼ ç•¥å˜ï¼Œé¿å…æ•´æ‰¹åƒåŒä¸€å¼ å›¾å¤åˆ¶å‡ºæ¥çš„
  const lens = ARK_LENSES[Math.floor(Math.random() * ARK_LENSES.length)];
  let s = life
    ? ARK_PHOTO_LIFE
        .replace('__LIGHT__', arkLightSetup())
        .replace('__LENS__', lens)
    : ARK_PHOTO_STUDIO;
  if (mode === 'blend') {
    s += 'ï¼›è¿™å¼ å›¾è¦åŒæ—¶å…¼é¡¾ç”Ÿæ´»æ°›å›´å’Œå•†å“å¯å”®è´¨æ„Ÿï¼šè¡£æœæ˜¯ç»å¯¹ä¸»ä½“ï¼Œæ­£é¢æˆ–åŠä¾§é¢æœå‘é•œå¤´ã€ç‰ˆåž‹å®Œæ•´ï¼Œå ç”»é¢ 65%~80%ï¼Œé’ˆç»‡çº¹ç†ã€ç»’æ„Ÿã€çº½æ‰£ã€èµ°çº¿éƒ½æ¸…æ™°å¯è¾¨ï¼›èƒŒæ™¯ç”Ÿæ´»åŒ–ä½†ç®€æ´ã€ä¸æ‚ä¹±ä¸æŠ¢ä¸»ä½“ï¼›åƒçœŸå®žåº—é“ºæ‹çš„é«˜è´¨é‡ä¹°å®¶ç§€ï¼Œä¸æ˜¯æµ·æŠ¥ä¸æ˜¯ç²¾ä¿®å¤§ç‰‡';
  }
  if (S.arkCounts.noAccessory) {
    s = s.replace('æœè£…é¢œè‰²ã€èŠ±çº¹ã€æè´¨ã€çº½æ‰£ã€å£è¢‹ä¸Žå‚è€ƒå›¾å®Œå…¨ä¸€è‡´',
      `æœè£…é¢œè‰²ã€èŠ±çº¹ã€æè´¨ã€çº½æ‰£ã€å£è¢‹ä¸Žå‚è€ƒå›¾å®Œå…¨ä¸€è‡´ï¼Œä½†ä¸è¦ç”Ÿæˆ${S.arkCounts.accessoryList || 'ä¸å¸¦ã€è´è¶ç»“ã€èƒ¸é’ˆç­‰'}ï¼Œåªä¿ç•™è¡£æœæœ¬ä½“`);
  }
  return s;
}

function arkCheckReady() {
  if (!S.studioImage) { toast('å…ˆä¸Šä¼ ä¸€å¼ å•†å“å›¾'); return false; }
  const ai = (S.data && S.data.settings && S.data.settings.ai) || {};
  if (!ai.apiKey) { toast('å…ˆåŽ»ã€Œè®¾ç½®ã€é‡Œå¡«ç«å±±æ–¹èˆŸçš„ API Key'); return false; }
  if (!ai.imageModel) { toast('å…ˆåŽ»ã€Œè®¾ç½®ã€é‡Œå¡«ç”Ÿå›¾æ¨¡åž‹ ID'); return false; }
  return true;
}

function arkBuildJobs() {
  const colors = (S.studioInput.colors || []).filter(Boolean);
  const colorList = colors.length ? colors : ['å›¾ç‰‡æ‰€ç¤ºé¢œè‰²'];
  const mainPer = Number(S.arkCounts.mainPer) || 2;
  const detailPer = Number(S.arkCounts.detailPer) || 0;
  const mode = S.arkCounts.photoStyle || 'auto';
  const accOpts = arkAccOpts() || {};
  const accNote = S.arkCounts.noAccessory ? `ã€‚è¡£æœä¸Šä¸è¦å‡ºçŽ°${S.arkCounts.accessoryList || 'ä¸å¸¦ã€è•¾ä¸è´è¶ç»“ç­‰è£…é¥°'}ï¼Œåªä¿ç•™è¡£æœæœ¬ä½“` : '';
  const jobs = [];
  // æœ¬æ‰¹æ¬¡ç»Ÿä¸€é£Žæ ¼ï¼šauto æ¨¡å¼ä¸‹éšæœºé€‰ã€Œå…¨å¹³é“ºæŒ‚æ‹ã€æˆ–ã€Œå…¨ç´ äººæ¨¡ç‰¹ã€ï¼ŒåŒä¸€ä¸ªæ¬¾æ‰€æœ‰å›¾é£Žæ ¼ä¸€è‡´
  let batchMode = mode;
  if (mode === 'auto') {
    batchMode = Math.random() < 0.5 ? 'flatlay' : 'lifestyle';
  }
  // æ•´æ‰¹æ‰“ä¹±ä¸€æ¬¡ï¼šé¢œè‰²ä¹‹é—´ã€å¼ æ•°ä¹‹é—´éƒ½ä¸é‡å¤ï¼›æ¯æ¬¡ç‚¹ç”Ÿæˆéƒ½ä¼šé‡æ–°æ‰“ä¹±
  const styleKey = (S.studioInput.styles && S.studioInput.styles[0]) || 'æ¸©æŸ”é£Ž';
  const posePool = shuffleArr(LIFE_POSES);
  let scenePool = shuffleArr(scenesForStyle(styleKey));
  // ä¸åŒå•†å“ä¹‹é—´å°½é‡ä¸æ’žèƒŒæ™¯ï¼šæŠŠä¸Šä¸€æ¬¾ç”¨è¿‡çš„åœºæ™¯æŒªåˆ°é˜Ÿå°¾
  const recent = S.arkRecentScenes || [];
  const fresh = scenePool.filter((x) => recent.indexOf(x.t) < 0);
  const used = scenePool.filter((x) => recent.indexOf(x.t) >= 0);
  scenePool = fresh.concat(used);
  S.arkRecentScenes = scenePool.slice(0, 6).map((x) => x.t);
  let startIdx = 0;
  colorList.forEach((color, colorIdx) => {
    const ci = Object.assign({}, S.studioInput, { colors: [color] });
    const fc = color === 'å›¾ç‰‡æ‰€ç¤ºé¢œè‰²' ? '' : color;
    for (let i = 0; i < mainPer; i++) {
      const one = buildJimengPrompts(ci, Object.assign({ count: 1, start: startIdx + i, poses: posePool, scenes: scenePool, forceColor: fc, photoStyle: batchMode, antiCompare: !!S.arkCounts.antiCompare, heroShot: i === 0 }, accOpts))[0];
      jobs.push({ color, label: `${color} ä¸»å›¾ ${i + 1}`, prompt: one.prompt + accNote, photoStyle: batchMode });
    }
    const dv = buildJimengDetailPrompts(ci, Object.assign({}, accOpts, { forceColor: fc }));
    for (let i = 0; i < detailPer; i++) jobs.push({ color, label: `${color} è¯¦æƒ…å›¾ ${i + 1}`, isDetail: true, prompt: dv[(colorIdx + i) % dv.length].prompt + accNote });
    startIdx += mainPer;
  });
  if (S.arkCounts.simpleSku) {
    const ci = Object.assign({}, S.studioInput, { colors: [colorList[0]] });
    const p = buildJimengPrompts(ci, { simple: true, accessory: S.arkCounts.simpleNote || 'ä¸å¸¦ç­‰è£…é¥°', count: 1, photoStyle: batchMode })[0].prompt;
    jobs.push({ color: colorList[0], label: 'å¼•æµå›¾ï¼ˆç®€é…ï¼‰', prompt: p });
  }
  return jobs;
}

/* æŠŠç”Ÿæˆå›¾é‡Œçš„å¤´éƒ¨è£å‡ºæ¥å½“äººè„¸å‚è€ƒï¼šåªä¼ æ•´å¼ å›¾ä¼šè®©æ¨¡åž‹è¿žç¬¬ä¸€å¼ çš„èƒŒæ™¯å’ŒåŠ¨ä½œä¸€èµ·æŠ„ */
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

/* æ‰§è¡Œä¸€ç»„ jobsã€‚btnId æ˜¯è¦é”å®šçš„æŒ‰é’® idï¼›doneBase æ˜¯ä¹‹å‰å·²ç”Ÿæˆçš„å¼ æ•°ï¼ˆç”¨äºŽæ˜¾ç¤ºè¿›åº¦ï¼‰ */
async function arkRunJobs(jobs, btnId, doneBase) {
  const total = jobs.length;
  if (!total) return 0;
  let phase = 'å‡†å¤‡ä¸­';
  let done = 0;
  const startedAt = Date.now();
  const lockBtn = () => {
    const b = $('#' + btnId);
    if (b) { b.disabled = true; b.textContent = `ç”Ÿæˆä¸­â€¦ï¼ˆ${doneBase + done}/${doneBase + total}ï¼‰`; }
  };
  toast(`å¼€å§‹ç”Ÿæˆï¼Œå…± ${total} å¼ ï¼Œåˆ«å…³é¡µé¢â€¦`);
  const timer = setInterval(() => {
    const t = Math.round((Date.now() - startedAt) / 1000);
    setArkStatus(`${phase}ï¼Œå·²ç­‰ ${t} ç§’ï¼Œåˆ«å…³é¡µé¢`);
  }, 1000);
  lockBtn();

  const styleInfo = arkStyleInfo();
  const garment = S.studioImage.aiUrl || S.studioImage.dataUrl;
  // äººè„¸å‚è€ƒåªå–å¤´éƒ¨ï¼šæ•´å¼ å›¾å½“å‚è€ƒï¼Œä¼šæŠŠç¬¬ä¸€å¼ çš„å§¿åŠ¿ã€èƒŒæ™¯ã€æž„å›¾ä¸€èµ·æŠ„è¿›åŽé¢çš„å›¾
  const faceRef = S.arkFaceRef ? await faceCropUrl(S.arkFaceRef) : null;
  try {
    for (let i = 0; i < total; i++) {
      const job = jobs[i];
      phase = `æ­£åœ¨ç”Ÿæˆç¬¬ ${doneBase + i + 1}/${doneBase + total} å¼ ï¼ˆ${job.label}ï¼‰`;
      S.arkStatus = phase + 'â€¦';
      setArkStatus(S.arkStatus);
      // è¯¦æƒ…å›¾æ˜¯å±€éƒ¨ç‰¹å†™ï¼Œä¸å¥—ç”¨ç”Ÿæ´»ç§è‰çš„åŠèº«æž„å›¾å’Œæ¨¡ç‰¹æè¿°ï¼Œå…å¾—åˆè¢«å¸¦æˆä¸€å¼ åŠèº«ç…§
      let prompt = job.prompt + 'ã€‚' + styleInfo + (job.isDetail ? '' : 'ã€‚' + arkFaceSpec(job.photoStyle) + 'ã€‚' + arkPhotoTag(job.photoStyle));
      // é¢œè‰²å¿…é¡»ä»¥è¿™ä¸€å¼ å¯¹åº”çš„é¢œè‰²ä¸ºå‡†ï¼šå‚è€ƒå›¾åªå€Ÿæ¬¾å¼ï¼Œé¢œè‰²è¦é‡æ–°ä¸Š
      if (job.color && job.color !== 'å›¾ç‰‡æ‰€ç¤ºé¢œè‰²') {
        prompt += `ã€‚è¿™ä¸€å¼ çš„è¡£æœå¿…é¡»æ˜¯ã€Œ${job.color}ã€ï¼šå‚è€ƒå›¾1åªç”¨æ¥å¯¹ç…§æ¬¾å¼ã€ç‰ˆåž‹ã€é’ˆç»‡çº¹ç†ã€çº½æ‰£å’Œå£è¢‹çš„ä½ç½®ï¼Œé¢œè‰²ä¸è¦ç…§æ¬å‚è€ƒå›¾ï¼Œæ•´ä»¶è¡£æœï¼ˆå«é¢†å£ã€è¢–å£ã€é—¨è¥Ÿã€å£è¢‹ï¼‰éƒ½è¦å‘ˆçŽ°${job.color}ï¼Œé¢œè‰²è¦å‡†ç¡®ã€å‡åŒ€ã€é¥±å’Œè‡ªç„¶ï¼›ä½†çº½æ‰£ä¿æŒå‚è€ƒå›¾1åŽŸæ ·ï¼šæ•°é‡ã€å¤§å°ã€ä½ç½®ã€æŽ’åˆ—é¡ºåºå’Œæ¯ä¸€é¢—çš„é¢œè‰²éƒ½ä¸å˜ï¼Œå½©è‰²çº½æ‰£æŒ‰åŽŸé¡ºåºè¿˜åŽŸï¼Œä¸èƒ½åŒè‰²åŒ–ã€ä¸èƒ½ä¸²è‰²ã€ä¸èƒ½å¢žå‡`;
      } else {
        prompt += 'ã€‚é¢œè‰²ä¸¥æ ¼ä¿æŒå‚è€ƒå›¾1çš„åŽŸè‰²ï¼Œä¸è¦æ”¹è‰²';
      }
      const body = { prompt, size: '1024x1536', negative_prompt: 'plastic skin, over-saturated colors, cartoon, illustration, 3D render, watermark, text, AI look, glossy face, fake eyelashes, heavy makeup, deformed hands, extra fingers, extra limbs' };
      if (faceRef && !job.isDetail) {
        body.images = [garment, faceRef];
        prompt += 'ã€‚å‚è€ƒå›¾1 æ˜¯æœè£…å›¾ï¼Œåªå¯¹ç…§è¡£æœçš„æ¬¾å¼ã€ç‰ˆåž‹ã€é¢æ–™çº¹ç†ã€çº½æ‰£å’Œå£è¢‹ä½ç½®ï¼›å‚è€ƒå›¾2 åªæ˜¯æ¨¡ç‰¹çš„è„¸éƒ¨ç‰¹å†™ï¼Œåªå‚è€ƒäº”å®˜ã€è„¸åž‹ã€å‘åž‹ã€å‘è‰²å’Œå¦†å®¹ï¼Œç»å¯¹ä¸è¦å‚è€ƒå‚è€ƒå›¾2 çš„å§¿åŠ¿ã€åŠ¨ä½œã€æž„å›¾ã€èƒŒæ™¯ã€å…‰çº¿è§’åº¦å’Œè¡£æœ';
        body.prompt = prompt;
      } else {
        body.imageUrl = garment;
      }
      const r = await api('/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const raw = r.dataUrl || r.url;
      if (!raw) throw new Error('æ–¹èˆŸæ²¡è¿”å›žå›¾ç‰‡');
      const url = await gradePhoto(raw);
      if (!S.arkFaceRef && !job.isDetail && job.photoStyle === 'lifestyle') S.arkFaceRef = url;
      S.studioAiImages.unshift({ url, label: job.label });
      cacheImageNow(url);
      done += 1;
      S.arkStatus = `å·²ç”Ÿæˆ ${doneBase + done}/${doneBase + total} å¼ â€¦`;
      renderRoute();
      bindRoute();
      lockBtn();
    }
    return { done, ok: true };
  } catch (e) {
    S.arkStatus = `ç¬¬ ${doneBase + done + 1} å¼ å¤±è´¥äº†ï¼š${(e.body && e.body.message) || e.message}ã€‚å·²æˆåŠŸ ${doneBase + done} å¼ ï¼Œæ²¡å‡ºæ¥çš„é‚£å¼ ä¸æ‰£é’±ã€‚`;
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
    toast('å‡†å¤‡æž„å»ºä»»åŠ¡â€¦');
    const jobs = arkBuildJobs();
    const total = jobs.length;
    if (!total) { toast('å¼ æ•°éƒ½æ˜¯ 0ï¼Œå…ˆé€‰ä¸€ä¸‹'); return; }
    const msg = `å…ˆå‡º 1 å¼ é¢„è§ˆï¼ˆ${jobs[0].label}ï¼‰ï¼Œçœ‹çœ‹äººè„¸å’Œé£Žæ ¼å¯¹ä¸å¯¹ã€‚æ»¡æ„äº†å†ç»§ç»­ç”Ÿæˆå‰©ä¸‹çš„ ${total - 1} å¼ ã€‚è¿™ 1 å¼ çº¦ 0.1~1 å…ƒï¼Œä»Žä½ çš„æ–¹èˆŸä½™é¢æ‰£ã€‚ç»§ç»­å—ï¼Ÿ`;
    const ok = await confirm2(msg);
    if (!ok) { toast('å·²å–æ¶ˆ'); return; }

    toast('å¥½çš„ï¼Œå¼€å§‹ç”Ÿæˆé¢„è§ˆâ€¦');
    S.arkPendingJobs = jobs.slice(1);
    S.arkStatus = `æ­£åœ¨å‡ºé¢„è§ˆå›¾â€¦`;
    renderRoute();
    bindRoute();
    const res = await arkRunJobs([jobs[0]], 'arkGenBtn', 0);
    if (res.ok) {
      S.arkStatus = `é¢„è§ˆå›¾å·²å‡ºï¼ˆ${jobs[0].label}ï¼‰ã€‚æ»¡æ„å°±ç‚¹ã€Œç»§ç»­ç”Ÿæˆå‰©ä½™ ${S.arkPendingJobs.length} å¼ ã€ï¼Œä¸æ»¡æ„å°±ã€Œä¸¢æŽ‰é¢„è§ˆï¼Œé‡æ–°å‡ºã€ã€‚`;
      renderRoute();
      bindRoute();
      toast('âœ… é¢„è§ˆå›¾å·²å‡º');
    } else {
      // é¢„è§ˆå¤±è´¥ï¼šæ¸…ç©ºå¾…ç”Ÿæˆé˜Ÿåˆ—å’Œäººè„¸å‚è€ƒï¼Œè®©ç”¨æˆ·é‡æ–°å‡º
      S.arkPendingJobs = null;
      S.arkFaceRef = null;
      renderRoute();
      bindRoute();
    }
  } catch (e) {
    console.error('arkPreviewOne error:', e);
    toast('ç”Ÿæˆå‡ºé”™äº†ï¼š' + ((e.body && e.body.message) || e.message));
  }
}

async function arkContinueRest() {
  try {
    if (!arkCheckReady()) return;
    const jobs = S.arkPendingJobs;
    if (!jobs || !jobs.length) { toast('æ²¡æœ‰å¾…ç”Ÿæˆçš„å›¾ï¼Œå…ˆç‚¹ã€Œå…ˆç”Ÿæˆ 1 å¼ é¢„è§ˆã€'); return; }
    const total = jobs.length;
    const low = (total * 0.1).toFixed(1);
    const doneBase = S.studioAiImages.length;
    const msg = `ç»§ç»­ç”Ÿæˆå‰©ä¸‹çš„ ${total} å¼ ï¼Œçº¦ ${low}~${total} å…ƒï¼Œä»Žä½ çš„æ–¹èˆŸä½™é¢æ‰£ã€‚ä¹‹å‰çš„é¢„è§ˆå›¾ä¼šä¿ç•™ï¼Œç»§ç»­å¾€åŽåŠ ã€‚ç»§ç»­å—ï¼Ÿ`;
    const ok = await confirm2(msg);
    if (!ok) { toast('å·²å–æ¶ˆ'); return; }

    toast('å¥½çš„ï¼Œå¼€å§‹æ‰¹é‡ç”Ÿæˆâ€¦');
    S.arkStatus = `ç»§ç»­ç”Ÿæˆå‰©ä½™ ${total} å¼ â€¦`;
    renderRoute();
    bindRoute();
    const res = await arkRunJobs(jobs, 'arkContinueBtn', doneBase);
    if (res.ok) {
      S.arkPendingJobs = null;
      S.arkStatus = `å®Œæˆï¼šæœ¬æ¬¡å…±ç”Ÿæˆ ${doneBase + total} å¼ ã€‚ç‚¹å›¾ç‰‡çœ‹å¤§å›¾ï¼Œç‚¹ã€Œä¸‹è½½ã€ä¿å­˜ã€‚`;
      renderRoute();
      bindRoute();
      toast('âœ… å…¨éƒ¨ç”Ÿæˆå®Œæˆ');
    } else {
      // ä¸­é€”å¤±è´¥ï¼šæŠŠå·²æˆåŠŸçš„ä»Ž pending é‡ŒåŽ»æŽ‰ï¼Œå‰©ä¸‹çš„ç•™ç€è®©ç”¨æˆ·é‡è¯•
      S.arkPendingJobs = jobs.slice(res.done);
      renderRoute();
      bindRoute();
    }
  } catch (e) {
    console.error('arkContinueRest error:', e);
    toast('ç”Ÿæˆå‡ºé”™äº†ï¼š' + ((e.body && e.body.message) || e.message));
  }
}

function arkRestartPreview() {
  S.studioAiImages = [];
  S.arkFaceRef = null;
  S.arkPendingJobs = null;
  // é‡æ–°å‡ºé¢„è§ˆæ—¶æ¢ä¸€ä½æ¨¡ç‰¹å’Œä¸€å¥—ç¯å…‰ï¼Œé¿å…æ¯æ¬¡éƒ½æ˜¯åŒä¸€å¼ è„¸åŒä¸€ä¸ªæ¨¡å­
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
  if (btn) { btn.disabled = true; btn.textContent = 'æŸ¥è¯¢ä¸­â€¦'; }
  if (box) { box.style.display = 'block'; box.style.background = '#fff7e6'; box.style.borderColor = '#ffd591'; box.textContent = 'æ­£åœ¨æŸ¥ä½™é¢â€¦'; }
  try {
    const r = await api('/api/ai/balance', { method: 'POST', body: '{}' });
    if (!r.ok) {
      if (box) { box.style.background = '#fff1f0'; box.style.borderColor = '#ffa39e'; box.textContent = 'æŸ¥ä¸äº†ï¼š' + (r.message || r.error) + 'ã€‚æ²¡å¡« AK/SK çš„è¯åŽ»ã€Œè®¾ç½®ã€é‡Œå¡«ä¸€ä¸‹ã€‚'; }
    } else {
      const lines = [];
      if (r.available !== '' && r.available != null) lines.push('å¯ç”¨ä½™é¢ï¼š<b>Â¥' + r.available + '</b>');
      if (r.cash !== '' && r.cash != null) lines.push('çŽ°é‡‘ä½™é¢ï¼šÂ¥' + r.cash);
      if (r.frozen !== '' && r.frozen != null) lines.push('å†»ç»“é‡‘é¢ï¼šÂ¥' + r.frozen);
      if (!lines.length && r.raw) {
        // æŠŠåŽŸå§‹å­—æ®µé‡Œçœ‹èµ·æ¥åƒé‡‘é¢çš„åˆ—å‡ºæ¥
        for (const k in r.raw) {
          const v = r.raw[k];
          if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) lines.push(k + 'ï¼šÂ¥' + v);
        }
      }
      if (box) {
        box.style.background = '#f6ffed';
        box.style.borderColor = '#b7eb8f';
        box.innerHTML = lines.length ? lines.join('<br>') : ('æŸ¥è¯¢æˆåŠŸï¼Œä½†è¿”å›žå†…å®¹çœ‹ä¸æ‡‚ã€‚åŽŸå§‹æ•°æ®ï¼š' + JSON.stringify(r.raw).slice(0, 200));
      }
    }
  } catch (e) {
    if (box) { box.style.background = '#fff1f0'; box.style.borderColor = '#ffa39e'; box.textContent = 'æŸ¥è¯¢å¤±è´¥ï¼š' + ((e.body && e.body.message) || e.message); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'æŸ¥ä½™é¢'; }
  }
}

/* ç»™ AI ç”¨çš„åŽ‹ç¼©å›¾ï¼šæœ€é•¿è¾¹ä¸è¶…è¿‡ maxï¼Œè¿”å›ž dataURL */
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
  // å…¼å®¹æ—§è°ƒç”¨ï¼Œè¿”å›žç¬¬ä¸€ä¸ªæç¤ºè¯
  return buildJimengPrompts(input)[0].prompt;
}

// æ ¹æ®æ ‡ç­¾ç”Ÿæˆå³æ¢¦ AI ä¸“ç”¨æç¤ºè¯ï¼ˆå›¾ç”Ÿå›¾ï¼Œä»¥ä¸Šä¼ çš„æœè£…å›¾ä¸ºå‚è€ƒï¼‰
function buildJimengPrompts(input, opts) {
  const colors = (input.colors && input.colors.length) ? input.colors.join('ã€') : 'å›¾ç‰‡æ‰€ç¤ºé¢œè‰²';
  const category = input.category || 'æ¯›è¡£';
  const materials = (input.materials && input.materials.length) ? input.materials.join('ã€') : '';
  const crafts = (input.crafts && input.crafts.length) ? input.crafts.join('ã€') : '';
  const neck = input.neck || '';
  const fit = input.fit || '';
  const styles = (input.styles && input.styles.length) ? input.styles.join('ã€') : '';
  const weight = input.weight || '';
  const season = input.season || '';

  // æœè£…æè¿°ï¼ˆå„ç‰ˆæœ¬å…±ç”¨ï¼‰
  let garment = `${colors}çš„${category}`;
  const desc = [];
  if (materials) desc.push(`æè´¨ä¸º${materials}`);
  if (crafts) desc.push(`${crafts}å·¥è‰º`);
  if (neck) desc.push(`${neck}è®¾è®¡`);
  if (fit) desc.push(`${fit}ç‰ˆåž‹`);
  if (weight) desc.push(weight);
  if (season) desc.push(`${season}æ¬¾`);
  if (desc.length) garment += 'ï¼Œ' + desc.join('ï¼Œ');
  if (styles) garment += `ï¼Œ${styles}é£Žæ ¼`;

  // æ ¸å¿ƒçº¦æŸï¼šä¸¥æ ¼å‚è€ƒä¸Šä¼ çš„æœè£…å›¾ï¼ˆç®€é…ç‰ˆä¼šåŽ»æŽ‰æŒ‡å®šè£…é¥°ï¼‰
  const accessory = (opts && opts.simple) ? (opts.accessory || 'ä¸å¸¦ç­‰è£…é¥°') : '';
  const forceColor = (opts && opts.forceColor) || '';
  const colorFix = forceColor
    ? `ï¼›é¢œè‰²å¿…é¡»åšæˆ${forceColor}ï¼šå‚è€ƒå›¾åªå¯¹ç…§æ¬¾å¼ã€ç‰ˆåž‹ã€é’ˆç»‡çº¹ç†ã€çº½æ‰£å’Œå£è¢‹ä½ç½®ï¼Œé¢œè‰²ä¸è¦ç…§æ¬åŽŸå›¾`
    : 'ï¼Œé¢œè‰²æ·±æµ…ä¸ŽåŽŸå›¾ä¸€è‡´';
  const buttonFix = 'ï¼›çº½æ‰£å¿…é¡»å’Œå‚è€ƒå›¾å®Œå…¨ä¸€è‡´ï¼šæ•°é‡ã€å¤§å°ã€ä½ç½®ã€æŽ’åˆ—é¡ºåºéƒ½ä¸å˜ï¼Œå‚è€ƒå›¾æ˜¯å½©è‰²çº½æ‰£çš„ï¼ˆä¾‹å¦‚é»„ã€è“ã€ç²‰ã€ç»¿ä¾æ¬¡æŽ’åˆ—ï¼‰ï¼Œè¦æŒ‰åŽŸé¡ºåºä¿ç•™æ¯ä¸€ç§é¢œè‰²ï¼Œä¸èƒ½å…¨éƒ¨åšæˆåŒè‰²ã€ä¸èƒ½ä¸²è‰²ã€ä¸èƒ½å¢žå‡çº½æ‰£ã€ä¸èƒ½æ¢ä½ç½®';
  const constraint = accessory
    ? `ä¸¥æ ¼å‚è€ƒä¸Šä¼ çš„æœè£…å›¾ç‰‡ï¼Œä¿æŒæœè£…çš„ç‰ˆåž‹ã€æè´¨çº¹ç†å’Œä¸»ä½“è®¾è®¡100%ä¸€è‡´${colorFix}${buttonFix}ï¼Œä½†è¡£æœä¸Šä¸è¦å‡ºçŽ°${accessory}ï¼Œåªä¿ç•™è¡£æœæœ¬ä½“ï¼Œä¸è¦ä»»ä½•é™„åŠ æŒ‚é¥°ï¼›åªæ”¹å˜ç©¿ç€çš„äººå’Œåœºæ™¯`
    : `ä¸¥æ ¼å‚è€ƒä¸Šä¼ çš„æœè£…å›¾ç‰‡ï¼Œä¿æŒæœè£…çš„èŠ±çº¹ã€å›¾æ¡ˆã€æè´¨çº¹ç†ã€çº½æ‰£ã€è£…é¥°ç­‰æ‰€æœ‰ç»†èŠ‚100%ä¸€è‡´ï¼Œä¸å¾—æ›´æ”¹æœè£…çš„æ¬¾å¼å’Œè®¾è®¡${colorFix}${buttonFix}ï¼›åªæ”¹å˜ç©¿ç€çš„äººå’Œåœºæ™¯`;

  // ç”»è´¨çº¦æŸï¼šæ ¸å¿ƒæ˜¯å…·ä½“ç›¸æœº + çœŸå®žå…‰çº¿ + èƒ¶ç‰‡é¢—ç²’ï¼ŒåŽ» AI å‘³
  const photoMode = (opts && opts.photoStyle) || S.arkCounts.photoStyle || 'auto';
  const useLife = true;
  const CAMERA = 'photorealistic, shot on Canon EOS R5, 85mm f/1.8 prime lens, soft natural daylight, neutral white balance, shallow depth of field, subtle film grain, fine texture detail';
  const NEG = 'no plastic skin, no over-saturated colors, no cartoon, no illustration, no 3D render, no watermark, no text, no AI look, no glossy face, no heavy makeup, no fake eyelashes, no dark skin, no african features';
  const quality = `${CAMERA}; è‡ªç„¶å…‰ä¸‹çš„çœŸå®žéšæ‰‹æ‹ï¼Œæ›å…‰æ­£å¸¸ä¸å‘ç™½ã€ä¸å¥—æ»¤é•œï¼›äººç‰©å’Œè¡£æœæ¸…æ™°å¯¹ç„¦ï¼ŒèƒŒæ™¯ä¿ç•™å¯è¾¨è¯†çœŸå®žç»†èŠ‚ã€è‡ªç„¶æµ…æ™¯æ·±ï¼›æ¯›ç»’é’ˆç»‡ç»’æ„Ÿè‡ªç„¶ã€èƒ½çœ‹åˆ°çº¤ç»´èµ°å‘ï¼›${NEG}`;

  // é˜²æ¯”ä»·ï¼šè®©ä¸»å›¾/å•†å“å›¾åœ¨æž„å›¾ç»“æž„ä¸Šä¸Žå¸¸è§åŒæ¬¾å›¾ä¸åŒï¼Œå¹³å°çš„åŒæ¬¾è¯†åˆ«ç½®ä¿¡åº¦ä¼šé™ä¸‹æ¥
  // å‚è€ƒå®žæµ‹ï¼šæ¢è§’åº¦ + å•†å“è¢«é®æŒ¡çº¦ 1/3 + æ¢ä¸ªèƒŒæ™¯ç»“æž„ï¼Œä¸»å›¾é˜²æ¯”ä»·çŽ‡å¯åˆ° 95%
  const ANTI_STRUCT = [
    'æž„å›¾æ•…æ„ä¸å±…ä¸­ï¼šè¡£æœä¸»ä½“åç”»é¢å·¦ä¾§ä¸‰åˆ†ä¹‹ä¸€ï¼Œå³ä¾§ç•™å‡ºçŽ¯å¢ƒç©ºç™½',
    'æž„å›¾åç”»é¢å³ä¾§ï¼Œå·¦ä¾§æœ‰å®¶å…·æˆ–é“å…·è‡ªç„¶å…¥é•œ',
    'æ‰‹æŒæ‹æ‘„çš„è½»å¾®å€¾æ–œæž„å›¾ï¼Œç”»é¢æ°´å¹³çº¿ä¸æ˜¯å®Œå…¨æ°´å¹³',
    'ç•¥é«˜è§’åº¦ä¿¯æ‹ï¼Œè¡£æ‘†è¢«ç”»é¢ä¸‹è¾¹ç¼˜è£æŽ‰ä¸€éƒ¨åˆ†ï¼Œæž„å›¾ä¸å®Œæ•´',
    'ç•¥ä½Žè§’åº¦ä»°æ‹ï¼Œå‰æ™¯æœ‰æ¡Œé¢æˆ–æ¤…èƒŒå…¥é•œã€è‡ªç„¶é®ä½è¡£æœä¸‹æ²¿',
    'å‰æ™¯æœ‰ç»¿è‰²æžå¶æˆ–å¹²èŠ±è‡ªç„¶é®æŒ¡è¡£æœçº¦ä¸‰åˆ†ä¹‹ä¸€ï¼Œä¸»ä½“ä¸åœ¨æ­£ä¸­',
    'å‰æ™¯æœ‰ä¸€åªæ‰‹æˆ–ä¸€åªå’–å•¡æ¯å…¥é•œï¼Œè‡ªç„¶æŒ¡ä½è¡£æœä¸€éƒ¨åˆ†',
    'ç”»é¢è¾¹ç¼˜æœ‰çª—æ¡†æˆ–é—¨æ¡†å…¥é•œï¼ŒæŠŠæž„å›¾åˆ‡å¾—ä¸è§„æ•´',
    'è¡£æœåªå ç”»é¢ä¸€åŠï¼Œå¦ä¸€ä¾§æ˜¯æ˜Žæ˜¾çš„çŽ¯å¢ƒç»†èŠ‚ï¼ˆä¹¦æž¶/åºŠå¤´/æ¡Œé¢ï¼‰',
    'ç«–æž„å›¾å¯¹è§’çº¿å–æ™¯ï¼Œè¡£æœæ–œæ”¾åœ¨ç”»é¢é‡Œï¼Œä¸æ˜¯æ ‡å‡†å±…ä¸­å•†å“å›¾'
  ];
  const antiOn = opts && opts.antiCompare;
  const antiClause = (idx) => {
    if (!antiOn || idx == null) return '';
    const s = ANTI_STRUCT[idx % ANTI_STRUCT.length];
    return `ï¼›è¿™å¼ å›¾çš„æž„å›¾è¦ä¸Žå¸¸è§åŒæ¬¾å•†å“å›¾æ˜Žæ˜¾ä¸åŒï¼š${s}ã€‚ä¸è¦æ­£é¢å±…ä¸­çš„æ ‡å‡†å•†å“å›¾ï¼Œæž„å›¾å’ŒèƒŒæ™¯éƒ½ä¸èƒ½å’Œå‚è€ƒå›¾æˆ–å¸¸è§åŒæ¬¾å›¾é‡å¤`;
  };
  // é“¾æŽ¥ç¬¬ 1 å¼ ä¸»å›¾å•ç‹¬åŠ ç ï¼šåªéœ²åŠä¾§é¢/ä¸å®Œæ•´å…¥é•œï¼ˆåŒè¡Œä¸»å›¾åŸºæœ¬éƒ½æ˜¯æ­£é¢å®Œæ•´å±•ç¤ºï¼Œè¿™æ¡æœ€èƒ½æ‹‰å¼€å·®å¼‚ï¼‰
  const heroOn = !!(opts && opts.heroShot && opts.antiCompare);
  const heroClause = heroOn
    ? 'ï¼›è¿™å¼ æ˜¯é“¾æŽ¥ç¬¬ 1 å¼ ä¸»å›¾ï¼šæ¨¡ç‰¹ä¾§èº«çº¦ 45Â° åŠä¾§é¢ç«™ç«‹æˆ–åï¼Œèº«ä½“ä¸è¦æ­£å¯¹é•œå¤´ï¼Œè¡£æœåªéœ²å‡ºå¤§åŠï¼Œè¡£æ‘†æˆ–è‚©çº¿è¢«ç”»é¢ä¸Šè¾¹ç¼˜æˆ–ä¾§è¾¹è£æŽ‰ä¸€éƒ¨åˆ†ï¼Œå±žäºŽä¸å®Œæ•´æž„å›¾ï¼›ä¸è¦æ­£å¯¹é•œå¤´çš„å®Œæ•´æ­£é¢å•†å“å±•ç¤º'
    : '';

  const base = (model, scene, antiIdx) => {
    return `åœºæ™¯å’ŒåŠ¨ä½œå¿…é¡»æ˜¯è¿™é‡Œæè¿°çš„è¿™ä¸€å¤„ï¼š${scene}ã€‚${model}ï¼Œç©¿ç€${garment}ã€‚${quality}ã€‚${constraint}ã€‚èƒŒæ™¯ã€æˆ¿é—´ã€å¢™é¢ã€å®¶å…·éƒ½è¦æŒ‰ä¸Šé¢è¿™æ®µé‡æ–°å¸ƒç½®ï¼Œä¸è¦å¤åˆ¶å‚è€ƒå›¾é‡Œçš„èƒŒæ™¯å’ŒçŽ¯å¢ƒï¼Œä¸è¦æ²¿ç”¨å‚è€ƒå›¾çš„æž„å›¾${antiClause(antiIdx)}${heroClause}ã€‚`;
  };

  // ç”Ÿæ´»ç§è‰åœºæ™¯ï¼šæš–è°ƒã€æœ‰ç”Ÿæ´»æ°”æ¯ï¼Œå§¿åŠ¿è‡ªç„¶æŠ“æ‹ï¼ˆå¯¹æ ‡å°çº¢ä¹¦çˆ†æ¬¾å›¾ï¼‰
  const style0 = (input.styles && input.styles[0]) || 'æ¸©æŸ”é£Ž';
  const STYLE_SCENE = {
    æ…µæ‡’é£Ž: ['æ·¡å¦†ï¼Œè¡¨æƒ…æ”¾æ¾æ…µæ‡’', 'å±…å®¶å®¢åŽ…ï¼Œç±³è‰²å¢™é¢å’Œç™½è‰²ç½®ç‰©æž¶ï¼Œæš–è‰²è½åœ°ç¯å…‰ï¼Œå€šç€æŸœå­ä¾§èº«ç«™ç€ï¼Œä¸€åªæ‰‹è½»æŠ¬åˆ°èƒ¸å‰ï¼Œæ…µæ‡’è‡ªç„¶'],
    éŸ©ç‰ˆ: ['æ¸…çˆ½æ°”è´¨ï¼Œæ·¡å¦†', 'éŸ©ç³»å’–å•¡åº—å®¤å†…ï¼Œæœ¨è´¨æ¡Œé¢å’Œæš–é»„ç¯å…‰ï¼Œåå§¿åŠèº«ï¼Œä¾§è„¸çœ‹å‘çª—å¤–ï¼Œè‡ªç„¶æŠ“æ‹'],
    æ—¥ç³»: ['ç´ é¢œæ„Ÿæ·¡å¦†ï¼Œè¡¨æƒ…å¹³é™', 'æ—¥ç³»æ¸…æ–°å§å®¤ï¼Œæµ…è‰²çº±å¸˜å’Œæœ¨åœ°æ¿ï¼Œæ™¨å…‰æŸ”å…‰ï¼Œç«™åœ¨çª—è¾¹ä¾§èº«ï¼Œæ‰‹é‡Œæ‹¿ç€å’–å•¡æ¯'],
    å¤å¤: ['å¤å¤æ·¡å¦†ï¼Œå”‡è‰²è‡ªç„¶', 'å¤å¤å®¤å†…ï¼Œæœ¨è´¨å®¶å…·ä¸Žæš–é»„ç¯å…‰ï¼Œèƒ¶ç‰‡è´¨æ„Ÿï¼Œèº«ä½“ä¾§è½¬å›žå¤´çœ‹å‘é•œå¤´ï¼Œè‰²è°ƒåæš–'],
    æ³•å¼: ['æ°”è´¨ä¼˜é›…ï¼Œæ·¡å¦†', 'æ³•å¼å¤å¤å§å®¤ï¼Œé›•èŠ±å¢™é¢ä¸Žçª—è¾¹æŸ”å…‰ï¼Œé å¢™ä¾§èº«ç«™ç«‹ï¼Œå§¿æ€æ¾å¼›ä¼˜é›…'],
    å­¦é™¢é£Ž: ['é’æ˜¥æ„Ÿæ·¡å¦†', 'æ ¡å›­å›¾ä¹¦é¦†æˆ–å®¿èˆï¼Œä¹¦æž¶èƒŒæ™¯è™šåŒ–ï¼Œæ˜Žäº®è‡ªç„¶å…‰ï¼ŒæŠ±ç€ä¸€æœ¬ä¹¦ä¾§èº«ç«™ç€'],
    é€šå‹¤: ['å¹²ç»ƒæ°”è´¨ï¼Œæ·¡å¦†', 'å†™å­—æ¥¼èµ°å»Šæˆ–å’–å•¡åº—å¤–æ™¯ï¼Œç®€æ´èƒŒæ™¯ï¼Œè‡ªç„¶æ—¥å…‰ï¼Œæ‰‹ææ‰˜ç‰¹åŒ…ä¾§èº«è¡Œèµ°æŠ“æ‹'],
    insé£Ž: ['å¹²å‡€æ°”è´¨ï¼Œæ·¡å¦†', 'æžç®€å±…å®¶è§’è½ï¼Œç™½è‰²ç½®ç‰©æž¶å’Œç»¿æ¤ï¼ŒæŸ”å’Œè‡ªç„¶å…‰ï¼Œé å¢™ä¾§èº«ç«™ç«‹ï¼Œæž„å›¾ç•™ç™½å¹²å‡€'],
    æ¸©æŸ”é£Ž: ['æ¸©æŸ”æ°”è´¨ï¼Œæ·¡å¦†', 'çª—è¾¹å±…å®¶åœºæ™¯ï¼Œç±³è‰²å¢™é¢å’Œç™½è‰²ç½®ç‰©æž¶ï¼Œæš–è‰²ç¯å…‰ï¼Œèº«ä½“ä¾§è½¬å››åˆ†ä¹‹ä¸‰èƒŒå¯¹é•œå¤´ï¼Œä¸€æ‰‹è½»æ‰¶æž¶å­ï¼Œæ¸©æŸ”è‡ªç„¶']
  };
  const st = STYLE_SCENE[style0] || STYLE_SCENE['æ¸©æŸ”é£Ž'];

  const count = Math.max(1, Number(opts && opts.count) || 2);
  // å§¿åŠ¿/åœºæ™¯/æ‹æ³•/é…é¥°/è¡¨æƒ…å„è‡ªæ‰“ä¹±ï¼Œæ•´æ‰¹è½®æ¢ä¸é‡æ ·ï¼›æ¯æ¬¡ç”Ÿæˆéƒ½æ¢ä¸€æ‰¹
  const posePool = (opts && opts.poses) || shuffleArr(LIFE_POSES);
  const scenePool = (opts && opts.scenes) || shuffleArr(scenesForStyle(style0));
  const start = Number(opts && opts.start) || 0;
  // æ‹¼å¤šå¤š/å°çº¢ä¹¦çˆ†æ¬¾å¸¸è§çš„æ‹æ³•ï¼šåŠèº«ç‰¹å†™ã€å¯¹é•œè‡ªæ‹ã€æ‰‹æœºæŒ¡è„¸ã€å±€éƒ¨æž„å›¾ç­‰
  const SHOT_TYPES = [
    'åŠèº«è¿‘æ™¯ï¼Œå–æ™¯ä»Žå¤´é¡¶åˆ°å¤§è…¿ä¸­éƒ¨ï¼Œæ¯›è¡£å ç”»é¢ 60%~75%',
    'åå§¿åŠèº«ï¼Œé•œå¤´ç•¥é«˜äºŽè§†å¹³çº¿ï¼Œæ¯›è¡£å ç”»é¢ 60%~75%',
    'ç«™ç«‹åŠèº«ï¼Œé•œå¤´å¹³è§†èƒ¸å£é«˜åº¦ï¼Œæ¯›è¡£å ç”»é¢ 55%~70%',
    'å¯¹é•œè‡ªæ‹æž„å›¾ï¼Œæ‰‹æœºå‡ºçŽ°åœ¨ç”»é¢ä¸€è§’ï¼Œæ¯›è¡£å ç”»é¢ 55%~70%',
    'æ‰‹æœºæŒ¡è„¸è‡ªæ‹æž„å›¾ï¼Œåªéœ²å‡ºä¸‹å·´å’Œé¢†å£ï¼Œæ¯›è¡£å ç”»é¢ 60%~75%',
    'ä¾§èº«å›žçœ¸åŠèº«ï¼Œè‚©è†€è½¬å‘é•œå¤´ï¼Œæ¯›è¡£å ç”»é¢ 55%~70%',
    'èƒ¸å‰å±€éƒ¨æž„å›¾ï¼Œé‡ç‚¹æ‹é¢†å£ã€è‚©çº¿å’Œæ¯›è¡£çº¹ç†',
    'ç•¥å¾®ä¿¯æ‹åŠèº«ï¼Œå¤´åœ¨ä¸Šæ–¹ã€è¡£æ‘†åœ¨ä¸‹ï¼Œæ¯›è¡£å ç”»é¢ 60%~75%',
    'ç•¥å¾®ä»°æ‹åŠèº«ï¼Œæ˜¾è…¿é•¿ï¼Œæ¯›è¡£å ç”»é¢ 55%~70%'
  ];
  const ACC_POOL = [
    'ä¸æˆ´é¡¹é“¾ï¼Œè„–é¢ˆå¹²å‡€',
    'ä¸€æ¡ç»†é‡‘é¡¹é“¾æ­åœ¨é¢†å£',
    'ä¸€æ¡çç é¡¹é“¾',
    'ä¸€å¯¹å°åœ†è€³çŽ¯',
    'ä¸€é¡¶è´é›·å¸½',
    'ä¸€æ¡ç¾Šæ¯›å›´å·¾æ­åœ¨è‚©ä¸Š',
    'ä¸€ä¸ªæ–œæŒŽå°åŒ…',
    'ä¸€æžšç´ åœˆæˆ’æŒ‡'
  ];
  const EXPR_POOL = [
    'çœ‹é•œå¤´è‡ªç„¶å¾®ç¬‘',
    'ä¾§è„¸çœ‹å‘é•œå¤´ï¼Œå˜´å”‡å¾®å¼ ',
    'ä½Žå¤´æµ…ç¬‘å†æŠ¬çœ¼',
    'ä¸çœ‹é•œå¤´ï¼Œçœ‹å‘ä¾§å‰æ–¹',
    'è¡¨æƒ…æ”¾æ¾ï¼Œå˜´è§’è½»å¾®ä¸Šæ‰¬'
  ];
  const shotPool = shuffleArr(SHOT_TYPES);
  const accPool = shuffleArr(ACC_POOL);
  const exprPool = shuffleArr(EXPR_POOL);

  const lifeVariants = [];
  for (let i = 0; i < count; i++) {
    const pose = posePool[(start + i) % posePool.length];
    const scene = scenePool[(start + i) % scenePool.length];
    const shot = shotPool[(start + i) % shotPool.length];
    const acc = accPool[(start + i) % accPool.length];
    const expr = exprPool[(start + i) % exprPool.length];
    lifeVariants.push({
      name: `ç”Ÿæ´»ç§è‰å›¾ ${i + 1}ï¼ˆ${style0}ï¼‰`,
      prompt: base(
        `ä¸€ä½å¹´è½»çš„ä¸œäºšå¥³ç”Ÿï¼ˆä¸­å›½å¥³ç”Ÿé¢å­”ï¼‰ï¼Œçš®è‚¤ç™½çš™å¹²å‡€ï¼Œå¹²å‡€æ¸…çˆ½çš„ç´ äººæ°”è´¨ï¼Œä¸æ˜¯ç½‘çº¢è„¸ï¼›äº”å®˜è‡ªç„¶ã€å·¦å³è„¸ç•¥æœ‰å·®åˆ«ã€çœ¼ç›å¤§å°æ­£å¸¸ã€é¼»æ¢ä¸é«˜ä¸çŸ®ï¼›ç´ é¢œæ„Ÿï¼Œå‡ ä¹Žçœ‹ä¸å‡ºåŒ–å¦†ï¼Œè‡ªç„¶å”‡è‰²ï¼Œæ²¡æœ‰æµ“çœ¼çº¿æ²¡æœ‰å‡ç«æ¯›ï¼Œçš®è‚¤æœ‰çœŸå®žæ¯›å­”å’Œç»†å¾®ç»’æ¯›ã€è½»å¾®è‚¤è‰²ä¸å‡ï¼›${st[0]}ï¼›å‘è‰²ã€å‘åž‹ã€è„¸åž‹ä¸¥æ ¼æŒ‰æ¨¡ç‰¹èº«ä»½æè¿°æ¥ï¼Œä¸è¦ä¸€å¾‹åšæˆå¾®å·é•¿å‘åŠ ç©ºæ°”åˆ˜æµ·`,
        `${shot}ï¼Œ${pose}ï¼Œ${scene}ï¼Œ${acc}ï¼Œ${expr}ï¼Œè£¤å­åªéœ²å‡ºä¸€ç‚¹ï¼Œä¸è¦å…¨èº«ã€ä¸è¦æ‹åˆ°éž‹å­`,
        start + i
      )
    });
  }

  // ç”µå•†ä¸»å›¾ï¼šå¹²å‡€èƒŒæ™¯ + è‡ªç„¶ç«™å§¿ï¼ŒèƒŒæ™¯é¢œè‰²å’Œå§¿åŠ¿éƒ½éšæœºè½®æ¢ï¼Œé¿å…æ•´æ‰¹ä¸€ä¸ªæ ·
  const STUDIO_BGS = [
    'æµ…ç°è‰²æ— ç¼æ‘„å½±èƒŒæ™¯ï¼Œå¹²å‡€å¹³æ•´ï¼Œæœ‰æžç»†çš„å¢™é¢çº¹ç†',
    'ç±³ç™½è‰²æ‘„å½±èƒŒæ™¯ï¼Œå¹²å‡€é€šé€',
    'å¥¶æ²¹ç™½è‰²æ‘„å½±èƒŒæ™¯ï¼ŒæŸ”å’Œå¹²å‡€',
    'æµ…è“ç°è‰²æ‘„å½±èƒŒæ™¯ï¼Œå†·é™å¹²å‡€',
    'æµ…ç²‰è‰²æ‘„å½±èƒŒæ™¯ï¼ŒæŸ”å’Œå¹²å‡€',
    'æµ…å¡å…¶è‰²æ‘„å½±èƒŒæ™¯ï¼Œæ¸©æš–å¹²å‡€',
    'çª—è¾¹ç™½å¢™ï¼Œç™½å¤©æ˜Žäº®è‡ªç„¶å…‰ï¼Œå¢™é¢å¹²å‡€',
    'æžç®€å±•åŽ…ç™½å¢™ï¼Œå¹²å‡€æ˜Žäº®ï¼Œæ— ä»»ä½•è£…é¥°',
    'æµ…ç°è‰²æ°´æ³¥è‚Œç†å¢™ï¼Œå“‘å…‰å¹²å‡€ï¼Œå…‰çº¿å‡åŒ€',
    'æš–ç™½è‰²æ‘„å½±èƒŒæ™¯ï¼Œå¹²å‡€æŸ”å’Œ',
    'æµ…æœ¨è‰²å¢™æ¿å‰ï¼Œæ•´æ´æ˜Žäº®ï¼Œè‡ªç„¶å…‰',
    'ç™½è‰²çº±å¸˜å‰çš„çª—è¾¹ï¼ŒæŸ”å…‰é€è¿›æ¥ï¼ŒèƒŒæ™¯å¹²å‡€',
    'æµ…è±†ç»¿è‰²æ‘„å½±èƒŒæ™¯ï¼Œå¹²å‡€æŸ”å’Œ',
    'æ·±ç°è‰²æ‘„å½±èƒŒæ™¯ï¼Œèƒ½è¡¬å‡ºæµ…è‰²æ¯›è¡£'
  ];
  const STUDIO_POSES = [
    'ç«™ç«‹åŠèº«ï¼Œè‚©è†€å¾®ä¾§ã€é‡å¿ƒè½åœ¨ä¸€æ¡è…¿ä¸Šï¼Œä¸€åªæ‰‹è½»æ­åœ¨è…°é—´',
    'ç«™ç«‹åŠèº«ï¼ŒåŒæ‰‹è‡ªç„¶åž‚åœ¨èº«ä¾§ï¼Œèº«ä½“å¾®å¾®ä¾§è½¬',
    'ç«™ç«‹åŠèº«ï¼Œä¸€åªæ‰‹æ’å£è¢‹ï¼Œå¦ä¸€åªæ‰‹è‡ªç„¶åž‚ä¸‹',
    'åå§¿åŠèº«ï¼Œååœ¨ç®€æ´çš„ç™½è‰²æ–¹å‡³ä¸Šï¼ŒåŒæ‰‹äº¤å æ”¾åœ¨è…¿ä¸Š',
    'ç«™ç«‹åŠèº«ï¼Œä¸€åªæ‰‹è½»æ‹‰è¡£æ‘†å±•ç¤ºä¸‹æ‘†',
    'ç«™ç«‹åŠèº«ï¼Œä¸€åªæ‰‹æ•´ç†é¢†å£ï¼Œå±•ç¤ºé¢†åž‹',
    'åå§¿åŠèº«ï¼Œååœ¨ç™½è‰²æ–¹å‡³ä¸Šï¼Œèº«ä½“å¾®å¾®å‰å€¾',
    'ç«™ç«‹åŠèº«ï¼Œä¾§èº«å››åˆ†ä¹‹ä¸‰é¢å¯¹é•œå¤´ï¼Œä¸€åªæ‰‹è½»æ‰¶å£è¢‹'
  ];
  const bgPool = shuffleArr(STUDIO_BGS);
  const stPosePool = shuffleArr(STUDIO_POSES);
  const studioVariants = Array.from({ length: Math.max(2, count) }, (_, i) => ({
    name: `ç”µå•†ä¸»å›¾ ${i + 1}`,
    prompt: base(
      'ä¸€ä½å¹´è½»çš„äºšæ´²å¥³ç”Ÿæ¨¡ç‰¹ï¼ŒçœŸå®žç´ äººæ„Ÿï¼Œäº”å®˜è‡ªç„¶ã€å·¦å³è„¸æœ‰è½»å¾®ä¸å¯¹ç§°ï¼Œçš®è‚¤æœ‰çœŸå®žæ¯›å­”å’Œç»†å¾®è‚¤è‰²ä¸å‡ï¼Œç´ é¢œæˆ–å¾ˆæ·¡çš„å¦†ï¼Œå‘è‰²å‘åž‹æŒ‰æ¨¡ç‰¹èº«ä»½æè¿°æ¥ï¼Œä¸æ˜¯ç½‘çº¢è„¸ä¸æ˜¯æ•´å®¹è„¸',
      `${stPosePool[(start + i) % stPosePool.length]}ï¼Œ${bgPool[(start + i) % bgPool.length]}ï¼ŒåŠèº«æž„å›¾ï¼Œä¸Šè¡£å ç”»é¢ 60%~78%ï¼Œè£¤å­åªéœ²ä¸€ç‚¹ï¼Œä¸è¦æ‹å…¨èº«ã€ä¸è¦æ‹åˆ°éž‹å­`
    )
  }));

  /* ===== æ— æ¨¡ç‰¹å•†å“å›¾ï¼ˆå¹³é“º/æŒ‚æ‹/å æ‹/äººå°ï¼‰â€”â€” æ‹¼å¤šå¤šçˆ†æ¬¾æœ€å¸¸ç”¨ï¼Œå¤©ç„¶æ—  AI å‘³ ===== */
  const FLATLAY_SCENES = [
    { t: 'å¹³é“ºÂ·æœ¨åœ°æ¿', d: 'è¡£æœå¹³é“ºåœ¨æµ…åŽŸæœ¨åœ°æ¿ä¸Šï¼Œæ—è¾¹éšæ„æ”¾ä¸€æ¯å’–å•¡å’Œä¸€æœ¬æ‚å¿—ï¼Œè‡ªç„¶å…‰ä»Žçª—è¾¹æ–œç…§è¿›æ¥ï¼Œæœ‰æŸ”å’Œé˜´å½±ï¼Œä¿¯æ‹ 45 åº¦' },
    { t: 'å¹³é“ºÂ·å¤§ç†çŸ³', d: 'è¡£æœå¹³é“ºåœ¨ç™½è‰²å¤§ç†çŸ³çº¹å°é¢ä¸Šï¼Œæ—è¾¹æ”¾ä¸€å‰¯å¢¨é•œå’Œä¸€å°æŸå¹²èŠ±ï¼Œå¹²å‡€æ˜Žäº®çš„è‡ªç„¶å…‰ï¼Œä¿¯æ‹' },
    { t: 'å¹³é“ºÂ·æ£‰éº»å¸ƒ', d: 'è¡£æœå¹³é“ºåœ¨æµ…ç±³è‰²æ£‰éº»èƒŒæ™¯å¸ƒä¸Šï¼Œæ—è¾¹æ”¾ä¸€ä¸ªè—¤ç¼–å°åŒ…ï¼ŒæŸ”å’Œçš„å®¤å†…è‡ªç„¶å…‰ï¼Œä¿¯æ‹ 45 åº¦' },
    { t: 'å¹³é“ºÂ·åœ°æ¯¯', d: 'è¡£æœå¹³é“ºåœ¨æµ…ç°è‰²çŸ­ç»’åœ°æ¯¯ä¸Šï¼Œæ—è¾¹æ”¾ä¸€åŒå¸†å¸ƒéž‹å’Œä¸€é¡¶æ£’çƒå¸½ï¼Œè‡ªç„¶å…‰ï¼Œä¿¯æ‹' },
    { t: 'æŒ‚æ‹Â·ç™½å¢™', d: 'è¡£æœæŒ‚åœ¨ç®€çº¦æœ¨è´¨è¡£æž¶ä¸Šï¼ŒèƒŒæ™¯æ˜¯å¹²å‡€çš„ç™½è‰²å¢™é¢ï¼ŒæŸ”å’Œçš„ä¾§å…‰ï¼Œæ­£é¢å¹³è§†æ‹æ‘„' },
    { t: 'æŒ‚æ‹Â·ç™¾å¶çª—', d: 'è¡£æœæŒ‚åœ¨è¡£æž¶ä¸Šï¼ŒèƒŒæ™¯æ˜¯ç™½è‰²ç™¾å¶çª—ï¼Œé˜³å…‰é€è¿‡ç™¾å¶çª—æŠ•ä¸‹æ¡çº¹å…‰å½±ï¼Œæ­£é¢æ‹æ‘„' },
    { t: 'æŒ‚æ‹Â·ç»¿æ¤', d: 'è¡£æœæŒ‚åœ¨è¡£æž¶ä¸Šï¼ŒèƒŒæ™¯æ˜¯ä¸€é¢æµ…è‰²å¢™ï¼Œæ—è¾¹æœ‰ä¸€ç›†é¾ŸèƒŒç«¹ç»¿æ¤ï¼Œè‡ªç„¶å…‰ï¼Œæ­£é¢å¹³è§†' },
    { t: 'å æ‹Â·å¤šè‰²', d: 'åŒæ¬¾ä¸åŒè‰²çš„å‡ ä»¶æ¯›è¡£æ•´é½å æ”¾åœ¨ä¸€èµ·ï¼Œå±•ç¤ºæ‰€æœ‰é¢œè‰²ï¼Œæµ…æœ¨è‰²èƒŒæ™¯ï¼Œä¿¯æ‹' },
    { t: 'å æ‹Â·å•æ¬¾', d: 'ä¸€ä»¶æ¯›è¡£æ•´é½å æ”¾ï¼Œæ—è¾¹æ”¾ç€åŒè‰²çš„å›´å·¾å’Œæ‰‹å¥—ï¼Œæµ…ç°è‰²èƒŒæ™¯ï¼Œè‡ªç„¶å…‰ï¼Œä¿¯æ‹ 45 åº¦' },
    { t: 'äººå°', d: 'è¡£æœç©¿åœ¨ç®€çº¦çš„åŠèº«é«˜æ¨¡å¾…äººå°ï¼ˆmannequinï¼‰ä¸Šï¼Œæ²¡æœ‰äººçš„å¤´å’Œæ‰‹ï¼Œåªæœ‰èº¯å¹²ï¼ŒèƒŒæ™¯æ˜¯æµ…ç°è‰²çº¯è‰²å¢™ï¼ŒæŸ”å…‰ï¼Œæ­£é¢åŠèº«' },
    { t: 'æ¤…å­æ­æ”¾', d: 'è¡£æœéšæ„æ­åœ¨ä¸€æŠŠç®€çº¦çš„æœ¨è´¨é¤æ¤…é èƒŒä¸Šï¼ŒèƒŒæ™¯æ˜¯å¹²å‡€çš„å®¤å†…å¢™é¢ï¼Œè‡ªç„¶å…‰ï¼Œå¹³è§†æ‹æ‘„' },
    { t: 'åºŠè¾¹å¹³é“º', d: 'è¡£æœå¹³é“ºåœ¨é“ºç€ç™½è‰²åºŠå•çš„åºŠä¸Šï¼Œæ—è¾¹æ”¾ä¸€æ¯æ°´å’Œä¸€æœ¬æ‰“å¼€çš„ä¹¦ï¼Œæ¸…æ™¨æŸ”å’Œè‡ªç„¶å…‰ï¼Œä¿¯æ‹ 45 åº¦' }
  ];
  const flatPool = shuffleArr(FLATLAY_SCENES);
  const flatConstraint = accessory
    ? `ä¸¥æ ¼å‚è€ƒä¸Šä¼ çš„æœè£…å›¾ç‰‡ï¼Œä¿æŒæœè£…çš„ç‰ˆåž‹ã€æè´¨çº¹ç†å’Œä¸»ä½“è®¾è®¡100%ä¸€è‡´${colorFix}${buttonFix}ï¼Œä½†è¡£æœä¸Šä¸è¦å‡ºçŽ°${accessory}ï¼Œåªä¿ç•™è¡£æœæœ¬ä½“`
    : `ä¸¥æ ¼å‚è€ƒä¸Šä¼ çš„æœè£…å›¾ç‰‡ï¼Œä¿æŒæœè£…çš„èŠ±çº¹ã€å›¾æ¡ˆã€æè´¨çº¹ç†ã€çº½æ‰£ã€è£…é¥°ç­‰æ‰€æœ‰ç»†èŠ‚100%ä¸€è‡´ï¼Œä¸å¾—æ›´æ”¹æœè£…çš„æ¬¾å¼å’Œè®¾è®¡${colorFix}${buttonFix}`;
  const flatQuality = 'photorealistic, shot on Canon EOS R5, 50mm f/2.8 lens, soft natural daylight from a window, neutral white balance, subtle film grain, sharp fine detail on fabric texture; çœŸå®žå•†å“å¹³é“ºå®žæ‹è´¨æ„Ÿï¼Œä¸æ˜¯æ£šæ‹ç¯ã€ä¸æ˜¯æµ·æŠ¥ï¼›no plastic texture, no cartoon, no illustration, no 3D render, no watermark, no text, no AI look';
  const FLAT_ANTI = [
    'è¡£æœä¸å¹³é“ºå±…ä¸­ï¼Œè€Œæ˜¯æ–œæ”¾åœ¨ç”»é¢é‡Œã€æž„å›¾åå·¦ï¼Œå³ä¾§ç•™ä¸€æŽ’é“å…·',
    'é•œå¤´ç•¥é«˜ä¿¯æ‹ï¼Œè¡£æ‘†è¢«ç”»é¢ä¸‹è¾¹ç¼˜è£æŽ‰ä¸€éƒ¨åˆ†ï¼Œå±žäºŽä¸å®Œæ•´æž„å›¾',
    'å‰æ™¯æœ‰ä¸€ç‰‡æžå¶ã€ä¸€æ¡å›´å·¾æˆ–ä¸€åªæ¯å­è‡ªç„¶åŽ‹ä½è¡£æœçº¦ä¸€è§’ï¼Œé®ä½å°‘é‡ä¸»ä½“',
    'è¡£æœå æ”¾åœ¨å…¶ä»–è¡£ç‰©ä¸Šï¼Œåªéœ²å‡ºå¤§åŠä¸ªä¸»ä½“ï¼Œä¸å®Œæ•´å±•ç¤º',
    'æž„å›¾åå³ï¼Œå·¦ä¾§æ˜¯æ˜Žæ˜¾çš„æ¡Œé¢/åœ°æ¿/åºŠæ²¿çŽ¯å¢ƒç»†èŠ‚'
  ];
  const flatVariants = Array.from({ length: Math.max(2, count) }, (_, i) => {
    const sc = flatPool[(start + i) % flatPool.length];
    const antiFlat = antiOn ? `ï¼›è¿™å¼ å›¾çš„æž„å›¾è¦å’Œå¸¸è§å¹³é“ºå›¾æ˜Žæ˜¾ä¸åŒï¼š${FLAT_ANTI[i % FLAT_ANTI.length]}ï¼Œä¸æ˜¯æ ‡å‡†å±…ä¸­å¹³é“ºã€‚` : '';
    const heroFlat = (opts && opts.heroShot && opts.antiCompare)
      ? 'ï¼›è¿™å¼ æ˜¯é“¾æŽ¥ç¬¬ 1 å¼ ä¸»å›¾ï¼šè¡£æœæ–œå‘æ‘†æ”¾ä¸å±…ä¸­ï¼Œåªéœ²å‡ºå¤§åŠä¸ªä¸»ä½“ï¼Œè¡£æ‘†æˆ–ä¸€è§’è¢«ç”»é¢ä¸Šè¾¹ç¼˜æˆ–ä¾§è¾¹è£æŽ‰ï¼Œå±žäºŽä¸å®Œæ•´æž„å›¾ï¼›ä¸è¦å¹³é“ºå±…ä¸­ã€å®Œæ•´å±•ç¤ºçš„æ ‡å‡†å•†å“å›¾'
      : '';
    return {
      name: `å•†å“å›¾Â·${sc.t}`,
      prompt: `${sc.d}ã€‚ä¸€ä»¶${garment}ã€‚${flatConstraint}ã€‚${flatQuality}ã€‚ç”»é¢é‡Œç»å¯¹ä¸èƒ½å‡ºçŽ°äººã€äººè„¸ã€æ‰‹ã€æ‰‹è‡‚ã€è…¿æˆ–ä»»ä½•èº«ä½“éƒ¨ä½ï¼Œåªæœ‰è¡£æœæœ¬èº«å’Œé“å…·ï¼›è¡£æœå ç”»é¢ 65%~80%ï¼Œæž„å›¾é¥±æ»¡ã€ä¸è¦ç•™å¤ªå¤šç©ºç™½${antiFlat}${heroFlat}ï¼›èƒŒæ™¯ä¸è¦å¤åˆ¶å‚è€ƒå›¾ï¼ŒæŒ‰æè¿°é‡æ–°å¸ƒç½®ã€‚`
    };
  });

  const useFlat = photoMode === 'flatlay';
  let variants;
  if (useFlat) {
    variants = flatVariants.slice(0, count);
  } else {
    variants = useLife ? lifeVariants : studioVariants.slice(0, count);
  }

  return variants;
}

// å³æ¢¦/æ–¹èˆŸã€Œè¯¦æƒ…å›¾ã€æç¤ºè¯ï¼ˆé¢æ–™ã€é¢†å£ã€è¢–å£ç­‰å±€éƒ¨ç‰¹å†™ï¼‰
function buildJimengDetailPrompts(input, opts) {
  const colors = (input.colors && input.colors.length) ? input.colors.join('ã€') : 'å›¾ç‰‡æ‰€ç¤ºé¢œè‰²';
  const category = input.category || 'æ¯›è¡£';
  const materials = (input.materials && input.materials.length) ? input.materials.join('ã€') : '';
  const crafts = (input.crafts && input.crafts.length) ? input.crafts.join('ã€') : '';
  const neck = input.neck || '';
  const fit = input.fit || '';
  const styles = (input.styles && input.styles.length) ? input.styles.join('ã€') : '';
  const weight = input.weight || '';
  const season = input.season || '';

  let garment = `${colors}çš„${category}`;
  const desc = [];
  if (materials) desc.push(`æè´¨ä¸º${materials}`);
  if (crafts) desc.push(`${crafts}å·¥è‰º`);
  if (neck) desc.push(`${neck}è®¾è®¡`);
  if (fit) desc.push(`${fit}ç‰ˆåž‹`);
  if (weight) desc.push(weight);
  if (season) desc.push(`${season}æ¬¾`);
  if (desc.length) garment += 'ï¼Œ' + desc.join('ï¼Œ');
  if (styles) garment += `ï¼Œ${styles}é£Žæ ¼`;

  const accessory = (opts && opts.simple) ? (opts.accessory || 'ä¸å¸¦ç­‰è£…é¥°') : '';
  const forceColor = (opts && opts.forceColor) || '';
  const colorFix = forceColor
    ? `ï¼›é¢œè‰²å¿…é¡»åšæˆ${forceColor}ï¼Œå‚è€ƒå›¾åªå¯¹ç…§æ¬¾å¼ã€ç‰ˆåž‹ã€é’ˆç»‡çº¹ç†å’Œçº½æ‰£ä½ç½®ï¼Œé¢œè‰²ä¸è¦ç…§æ¬åŽŸå›¾`
    : 'ï¼Œé¢œè‰²æ·±æµ…ä¸ŽåŽŸå›¾ä¸€è‡´';
  const buttonFix = 'ï¼›çº½æ‰£çš„é¢œè‰²ã€æ•°é‡ã€å¤§å°ã€ä½ç½®å’ŒæŽ’åˆ—é¡ºåºå¿…é¡»ä¸Žå‚è€ƒå›¾å®Œå…¨ä¸€è‡´ï¼Œå½©è‰²çº½æ‰£æŒ‰åŽŸé¡ºåºè¿˜åŽŸï¼Œä¸èƒ½åŒè‰²åŒ–ã€ä¸èƒ½ä¸²è‰²ã€ä¸èƒ½å¢žå‡';
  const constraint = accessory
    ? `ä¸¥æ ¼å‚è€ƒä¸Šä¼ çš„æœè£…å›¾ç‰‡ï¼Œä¿æŒæœè£…çš„ç‰ˆåž‹ã€æè´¨çº¹ç†å’Œä¸»ä½“è®¾è®¡100%ä¸€è‡´${colorFix}${buttonFix}ï¼Œä½†è¡£æœä¸Šä¸è¦å‡ºçŽ°${accessory}ï¼Œåªä¿ç•™è¡£æœæœ¬ä½“ï¼Œå±€éƒ¨ç‰¹å†™é‡Œä¹Ÿä¸èƒ½æ‹åˆ°ä»»ä½•é™„åŠ æŒ‚é¥°`
    : `ä¸¥æ ¼å‚è€ƒä¸Šä¼ çš„æœè£…å›¾ç‰‡ï¼Œä¿æŒæœè£…çš„èŠ±çº¹ã€å›¾æ¡ˆã€æè´¨çº¹ç†ã€çº½æ‰£ã€è£…é¥°ç­‰æ‰€æœ‰ç»†èŠ‚100%ä¸€è‡´ï¼Œä¸å¾—æ›´æ”¹æœè£…çš„æ¬¾å¼å’Œè®¾è®¡${colorFix}${buttonFix}`;
  const quality2 = 'photorealistic, shot on Canon EOS R5, 100mm macro lens, soft diffused studio light, neutral white balance, subtle film grain, sharp fine detail; ç”»é¢åªæ‹è¡£æœçš„ä¸€ä¸ªå±€éƒ¨ï¼Œä¸è¦å‡ºçŽ°å®Œæ•´ä¸ŠåŠèº«ã€ä¸è¦æ‹åˆ°è„¸ã€ä¸è¦æ‹åˆ°æˆ¿é—´æˆ–çŽ¯å¢ƒèƒŒæ™¯ï¼Œåªå‡ºçŽ°ä¸¤åªæ‰‹ã€æ‰‹æŒ‡æ•°é‡æ­£ç¡®ã€ç»“æž„è‡ªç„¶ï¼Œä¸è¦å¤šä½™çš„æ‰‹æˆ–æ‰‹è‡‚ï¼›no plastic texture, no cartoon, no watermark, no text';
  const base = (scene) => `å±€éƒ¨ç‰¹å†™ç…§ç‰‡ï¼Œä¸€ä½æ¨¡ç‰¹ç©¿ç€${garment}ã€‚${constraint}ã€‚${scene}ã€‚${quality2}ã€‚`;

  return [
    { name: 'é¢†å£ç»†èŠ‚', prompt: base('é•œå¤´è¿‘æ™¯èšç„¦é¢†å£ï¼Œå±•ç¤ºé¢†åž‹ã€èµ°çº¿ã€æ‹‰é“¾æˆ–çº½æ‰£å’Œæ¯›ç»’è´¨æ„Ÿï¼Œæ¨¡ç‰¹ä¸‹å·´ä»¥ä¸‹å…¥é•œ') },
    { name: 'é¢æ–™çº¹ç†', prompt: base('é•œå¤´æžè¿‘è·ç¦»å¾®è·æ‹æ‘„é¢æ–™è¡¨é¢ï¼Œå±•ç¤ºé’ˆç»‡çº¹ç†ã€çº±çº¿ç»’æ¯›å’ŒçœŸå®žè´¨æ„Ÿï¼Œæµ…æ™¯æ·±') },
    { name: 'è¢–å£ä¸Žä¸‹æ‘†', prompt: base('é•œå¤´è¿‘æ™¯å±•ç¤ºè¢–å£èžºçº¹å’Œä¸‹æ‘†æ”¶å£ï¼Œæ¨¡ç‰¹æ‰‹éƒ¨è½»æ‹‰è¡£æ‘†ï¼Œä½“çŽ°å¼¹åŠ›å’Œåšå·¥') },
    { name: 'ä¾§é¢ç‰ˆåž‹', prompt: base('æ¨¡ç‰¹ä¾§èº«åŠèº«å±•ç¤ºï¼Œä½“çŽ°è‚©çº¿ã€è¢–åž‹å’Œæ•´ä½“ç‰ˆåž‹ï¼Œå®¤å†…å½±æ£šæŸ”å…‰') }
  ];
}

// å³æ¢¦ã€Œå›¾ç”Ÿè§†é¢‘ã€æç¤ºè¯ï¼ˆæ‹¼å¤šå¤šä¸»å›¾å°è§†é¢‘ï¼Œ5~10 ç§’ï¼Œ1:1ï¼‰
function buildJimengVideoPrompts(input) {
  const colors = (input.colors && input.colors.length) ? input.colors.join('ã€') : 'å›¾ç‰‡æ‰€ç¤ºé¢œè‰²';
  const category = input.category || 'æ¯›è¡£';
  const materials = (input.materials && input.materials.length) ? input.materials.join('ã€') : '';
  const crafts = (input.crafts && input.crafts.length) ? input.crafts.join('ã€') : '';
  const neck = input.neck || '';
  const fit = input.fit || '';
  const styles = (input.styles && input.styles.length) ? input.styles.join('ã€') : '';
  const weight = input.weight || '';
  const season = input.season || '';

  let garment = `${colors}çš„${category}`;
  const desc = [];
  if (materials) desc.push(`æè´¨ä¸º${materials}`);
  if (crafts) desc.push(`${crafts}å·¥è‰º`);
  if (neck) desc.push(`${neck}è®¾è®¡`);
  if (fit) desc.push(`${fit}ç‰ˆåž‹`);
  if (weight) desc.push(weight);
  if (season) desc.push(`${season}æ¬¾`);
  if (desc.length) garment += 'ï¼Œ' + desc.join('ï¼Œ');
  if (styles) garment += `ï¼Œ${styles}é£Žæ ¼`;

  const constraint = 'ä¸¥æ ¼å‚è€ƒä¸Šä¼ çš„æœè£…å›¾ç‰‡ï¼Œä¿æŒæœè£…çš„èŠ±çº¹ã€å›¾æ¡ˆã€é¢œè‰²æ·±æµ…ã€æè´¨çº¹ç†ã€çº½æ‰£å’Œè£…é¥°ç­‰æ‰€æœ‰ç»†èŠ‚ä¸ŽåŽŸå›¾100%ä¸€è‡´ï¼Œä¸å¾—æ”¹å˜æœè£…çš„æ¬¾å¼å’Œè®¾è®¡ï¼›åªè®©æ¨¡ç‰¹åŠ¨ä½œå’Œé•œå¤´è¿åŠ¨ï¼Œè¡£æœæœ¬èº«ä¸å˜å½¢ä¸é—ªçƒ';
  const quality = 'çœŸå®žæ‘„å½±è´¨æ„Ÿï¼Œ24å¸§æ¯ç§’ï¼Œç”»é¢ç¨³å®šä¸æŠ–åŠ¨ï¼Œå…‰å½±è‡ªç„¶æœ‰çœŸå®žé˜´å½±ï¼Œé«˜æ¸…ç»†èŠ‚ï¼Œæ— æ°´å°æ— æ–‡å­—æ— logoï¼Œä¸è¦å¡é€šä¸è¦æ’ç”»ï¼Œç”µå•†ä¸»å›¾è§†é¢‘è´¨æ„Ÿ';
  const base = (model, action, camera, extra) => `${model}ï¼Œç©¿ç€${garment}ã€‚${constraint}ã€‚${action}ã€‚${camera}${extra ? 'ã€‚' + extra : ''}ã€‚${quality}ã€‚`;

  return [
    {
      name: 'å½±æ£šæ­£é¢å±•ç¤ºï¼ˆ5ç§’ Â· 1:1ï¼‰',
      prompt: base(
        'ä¸€ä½25å²å·¦å³çš„äºšæ´²å¥³æ€§æ¨¡ç‰¹ï¼Œäº”å®˜è‡ªç„¶ï¼Œæ·¡å¦†ï¼Œé•¿ç›´å‘ï¼Œè¡¨æƒ…æ¸©å’Œå¾®ç¬‘',
        'æ¨¡ç‰¹æ­£é¢ç«™ç«‹ï¼ŒåŒæ‰‹è‡ªç„¶ä¸‹åž‚ï¼Œå…ˆè½»å¾®ä¾§èº«å†å›žæ­£çœ‹å‘é•œå¤´ï¼ŒåŠ¨ä½œç¼“æ…¢è‡ªç„¶',
        'é•œå¤´å›ºå®šä¸­æ™¯ï¼Œçº¦è…°ä»¥ä¸ŠåŠèº«ï¼Œæµ…ç°è‰²æ¸å˜èƒŒæ™¯ï¼ŒæŸ”å’Œå‡åŒ€å¸ƒå…‰'
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
    // ä¿å­˜å…¨éƒ¨ï¼šåŽŸå›¾ã€ç«å±±æ¨¡ç‰¹å›¾ã€å³æ¢¦æç¤ºè¯ã€å±žæ€§ã€SKUã€æ ‡é¢˜ã€å–ç‚¹ç­‰
    const jmOpts = Object.assign({ photoStyle: S.arkCounts.photoStyle || 'blend', count: 4, seed: 0 }, arkAccOpts() || {});
    const jmVariants = buildJimengPrompts(S.studioInput, jmOpts).map((v) => ({ name: v.name, prompt: v.prompt }));
    S.data.materials.unshift({
      id: uid(),
      name: S.studioInput.category + ' Â· ' + (S.studioInput.colors || []).join('/'),
      imageUrl: url,
      input: Object.assign({}, S.studioInput),
      kit: S.studioKit,
      aiImages: (S.studioAiImages || []).map((x) => ({ url: x.url, label: x.label })),
      jimengPrompts: jmVariants,
      createdAt: Date.now()
    });
    S.data.materials = S.data.materials.slice(0, 500);
    persist();
    toast('å·²å­˜å…¥ç´ æåº“ï¼ˆå«æ¨¡ç‰¹å›¾ã€æç¤ºè¯ã€SKU ç­‰å…¨éƒ¨ç´ æï¼‰');
  } catch (_) {
    toast('ä¿å­˜å¤±è´¥ï¼Œæ£€æŸ¥ç½‘ç»œ');
  }
}

/* ================= æ‰¹é‡ä¸‹è½½ï¼ˆæ‰“åŒ… zipï¼‰ ================= */
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

/* ===== å›¾ç‰‡æœ¬åœ°ç¼“å­˜ï¼šæ–¹èˆŸå›¾ç‰‡é“¾æŽ¥ 24 å°æ—¶åŽä¼šå¤±æ•ˆï¼Œç”Ÿæˆæ—¶å°±å­˜ä¸€ä»½åˆ°æµè§ˆå™¨ ===== */
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
// ç”Ÿæˆå®Œé©¬ä¸Šç¼“å­˜ï¼Œä¹‹åŽä¸‹è½½ä¸å†ä¾èµ–æ–¹èˆŸé“¾æŽ¥
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
  if (!resp.ok) throw new Error('è¿™å¼ å›¾çš„æ–¹èˆŸé“¾æŽ¥å·²å¤±æ•ˆï¼ˆæ–¹èˆŸå›¾ç‰‡åªä¿ç•™ 24 å°æ—¶ï¼‰ï¼Œé‡æ–°ç”Ÿæˆä¸€ä¸‹è¿™å¼ å°±è¡Œ');
  const type = resp.headers.get('content-type') || '';
  const blob = await resp.blob();
  if (!/^image\//.test(type) || blob.size < 20000) {
    throw new Error('è¿™å¼ å›¾çš„æ–¹èˆŸé“¾æŽ¥å·²å¤±æ•ˆï¼ˆæ–¹èˆŸå›¾ç‰‡åªä¿ç•™ 24 å°æ—¶ï¼‰ï¼Œé‡æ–°ç”Ÿæˆä¸€ä¸‹è¿™å¼ å°±è¡Œ');
  }
  imgCachePut(url, blob);
  return blob;
}

async function downloadOne(url, name) {
  try {
    const blob = await fetchImageBlob(url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (name || 'å›¾ç‰‡').replace(/[\\/:*?"<>|]/g, '_') + '.jpg';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 30000);
  } catch (e) {
    toast(e.message || 'ä¸‹è½½å¤±è´¥ï¼Œé•¿æŒ‰å›¾ç‰‡å¯ä¿å­˜');
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
  toastMsg(`æ­£åœ¨æ‰“åŒ… ${items.length} å¼ å›¾ç‰‡â€¦`);
  try {
    const files = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let buf;
      try {
        const blob = await fetchImageBlob(it.url);
        buf = new Uint8Array(await blob.arrayBuffer());
      } catch (e) {
        throw new Error(`ç¬¬ ${i + 1} å¼ ï¼ˆ${it.label || 'æœªå‘½å'}ï¼‰ï¼š${e.message}`);
      }
      const safe = (it.label || ('å›¾ç‰‡' + (i + 1))).replace(/[\\/:*?"<>|]/g, '_');
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
    toastMsg(`å·²æ‰“åŒ… ${items.length} å¼ ï¼Œä¸‹è½½ 1 ä¸ª zip æ–‡ä»¶å³å¯`);
  } catch (e) {
    toast('æ‰“åŒ…å¤±è´¥ï¼š' + (e.message || e));
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
  if (!m) return '<div class="tbl-empty">ç´ æä¸å­˜åœ¨</div>';
  const i = m.input || {};
  const k = m.kit || {};
  const tags = [i.category, (i.materials || []).join('ã€'), i.neck, i.fit, (i.styles || []).join('ã€'), i.weight, i.season, (i.colors || []).join('ã€')].filter(Boolean).join(' Â· ');
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
        <div style="font-weight:600;margin:12px 0 8px">ç«å±±æ¨¡ç‰¹å›¾ï¼ˆ${aiImgs.length} å¼ ï¼‰</div>
        <div class="canvas-grid">${aiImgs.map((a) => `
          <div class="canvas-card">
            <a href="${a.url}" target="_blank" rel="noopener"><img src="${a.url}" alt="${esc(a.label)}"></a>
            <div class="cc-foot"><span>${esc(a.label)}</span><span style="margin-left:auto"><a class="btn sm dlOne" href="${a.url}" data-url="${a.url}" data-name="${esc(a.label)}">ä¸‹è½½</a></span></div>
          </div>`).join('')}</div>
        <div style="margin-top:8px"><a class="btn sm" id="libDlAll">å…¨éƒ¨ä¸‹è½½ï¼ˆ${aiImgs.length} å¼ ï¼‰</a></div>
      ` : '<div style="color:var(--ink-3);font-size:12px;margin-bottom:12px">ï¼ˆä¿å­˜æ—¶æ²¡æœ‰ç«å±±æ¨¡ç‰¹å›¾ï¼‰</div>'}
      ${titles.length ? `
        <div style="font-weight:600;margin:16px 0 8px">æ ‡é¢˜</div>
        <div style="display:flex;flex-direction:column;gap:6px">${titles.map((t) => `<div style="background:var(--surface-2);padding:8px 12px;border-radius:8px;font-size:13px">${esc(t)}</div>`).join('')}</div>
      ` : ''}
      ${skus.length ? `
        <div style="font-weight:600;margin:16px 0 8px">SKU è§„æ ¼</div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>é¢œè‰²</th><th>å°ºç </th><th>æ‹¼å¤šå¤šè§„æ ¼å</th><th class="num">ä»·æ ¼</th><th class="num">åº“å­˜</th></tr></thead><tbody>${skus.map((s) => `<tr><td>${esc(s.spec1)}</td><td>${esc(s.spec2)}</td><td>${esc(s.pddName)}</td><td class="num">${s.price}</td><td class="num">${s.stock}</td></tr>`).join('')}</tbody></table></div>
      ` : ''}
      ${jm.length ? `
        <div style="font-weight:600;margin:16px 0 8px">å³æ¢¦æç¤ºè¯ï¼ˆ${jm.length} ç»„ï¼‰</div>
        <div style="display:flex;flex-direction:column;gap:8px">${jm.map((p) => `
          <div style="background:var(--surface-2);padding:10px 12px;border-radius:8px">
            <div style="font-size:12px;color:var(--ink-3);margin-bottom:4px">${esc(p.name)}</div>
            <div style="font-size:12px;color:var(--ink-2);line-height:1.6;word-break:break-all">${esc(p.prompt)}</div>
          </div>`).join('')}</div>
      ` : ''}
      <div style="margin-top:16px">
        <button class="btn sm" id="libDel">åˆ é™¤è¿™æ¡ç´ æ</button>
      </div>
    </div>`;
}

function viewSettings() {
  const d = S.data;
  return `
    <div class="page-head"><div><h2>è®¾ç½®</h2><p>æ•°æ®ã€å¤‡ä»½ã€ä½¿ç”¨è¯´æ˜Ž Â· å½“å‰ç‰ˆæœ¬ v1156a</p></div></div>
    <div class="stack">
      <div class="card">
        <div class="card-head"><h3>æ•°æ®åŒæ­¥</h3><span class="sub">æ‰‹æœºä¸Žç”µè„‘å…±ç”¨åŒä¸€ä»½æ•°æ®</span></div>
        <div class="card-body">
          <div class="seg-row"><div class="sk">åŒæ­¥çŠ¶æ€</div><div id="syncStateText">${S.syncState === 'ok' ? 'å·²åŒæ­¥åˆ°äº‘ç«¯' : 'æœªåŒæ­¥'}</div><span class="pill ${S.syncState === 'ok' ? 'good' : 'warn'}">${S.syncState === 'ok' ? 'æ­£å¸¸' : 'æ³¨æ„'}</span></div>
          <div class="seg-row"><div class="sk">æœ€è¿‘æ›´æ–°</div><div>${d.updatedAt ? new Date(d.updatedAt).toLocaleString('zh-CN') : 'â€”'}</div></div>
          <div class="row" style="margin-top:14px">
            <a class="btn" href="/api/backup" download>ä¸‹è½½å¤‡ä»½ï¼ˆJSONï¼‰</a>
            <button class="btn" id="importBtn">ä»Žå¤‡ä»½æ¢å¤</button>
            <input type="file" id="importFile" accept="application/json" hidden>
          </div>
          <p style="font-size:12px;color:var(--ink-3);margin-top:12px">å»ºè®®æ¯å‘¨ä¸‹è½½ä¸€æ¬¡å¤‡ä»½ã€‚æœåŠ¡å™¨é‡å»ºåŽï¼Œç”¨å¤‡ä»½æ–‡ä»¶å¯ä»¥å®Œæ•´æ¢å¤åº—é“ºã€å•†å“ã€æ¯æ—¥æ•°æ®å’Œç´ æåº“ã€‚</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>AI ç”Ÿå›¾é…ç½®</h3><span class="sub">è‡ªåŠ¨è¯†åˆ«å±žæ€§ + æ‰‹åŠ¨ç”Ÿæˆæ¨¡ç‰¹å›¾</span></div>
        <div class="card-body">
          <div class="seg-row"><div class="sk">æœåŠ¡å¹³å°</div>
            <select id="aiProvider">
              <option value="volc" ${(S.data.settings.ai.provider||'volc')==='volc'?'selected':''}>ç«å±±æ–¹èˆŸï¼ˆè±†åŒ…è¯†å›¾ + Seedream å‡ºå›¾ï¼‰</option>
              <option value="custom" ${(S.data.settings.ai.provider)==='custom'?'selected':''}>è‡ªå®šä¹‰ï¼ˆOpenAI å…¼å®¹æŽ¥å£ï¼‰</option>
            </select>
          </div>
          <div class="seg-row"><div class="sk">API Keyï¼ˆå¯†é’¥ï¼‰</div>
            <input id="aiApiKey" type="password" style="flex:1" placeholder="ç²˜è´´ç«å±±æ–¹èˆŸçš„ API Key" value="${esc(S.data.settings.ai.apiKey||'')}">
          </div>
          <div class="seg-row"><div class="sk">æŽ¥å£åœ°å€ï¼ˆBase URLï¼‰</div>
            <input id="aiBaseUrl" type="text" style="flex:1" value="${esc(S.data.settings.ai.baseUrl||'')}">
          </div>
          <div class="seg-row"><div class="sk">è¯†åˆ«æ¨¡åž‹ï¼ˆè±†åŒ…è§†è§‰ï¼‰</div>
            <input id="aiVisionModel" type="text" style="flex:1" placeholder="å¡«è±†åŒ…è§†è§‰æ¨¡åž‹ ID" value="${esc(S.data.settings.ai.visionModel||'')}">
          </div>
          <p style="font-size:12px;color:var(--ink-3);margin-top:4px">åªç”¨äºŽè¯†åˆ«æè´¨ã€é¢†åž‹ã€ç‰ˆåž‹ã€é£Žæ ¼ï¼Œçº¦ 0.001 å…ƒä¸€å¼ ï¼ˆåŸºæœ¬å¯ä»¥å¿½ç•¥ï¼‰ã€‚ä¸Šä¼ å›¾ç‰‡åŽè‡ªåŠ¨è·‘ï¼Œä¸ç”¨ä½ ç‚¹ã€‚</p>
          <div class="seg-row" style="margin-top:10px"><div class="sk">ç”Ÿå›¾æ¨¡åž‹ï¼ˆSeedreamï¼‰</div>
            <input id="aiImageModel" type="text" style="flex:1" placeholder="å¡« Seedream ç”Ÿå›¾æ¨¡åž‹ ID" value="${esc(S.data.settings.ai.imageModel||'')}">
          </div>
          <p style="font-size:12px;color:var(--ink-3);margin-top:4px">åªç”¨äºŽã€Œç”Ÿæˆæ¨¡ç‰¹å›¾ã€ï¼Œä¸€å¼ çº¦ 0.1~1 å…ƒã€‚å¿…é¡»ä½ æ‰‹åŠ¨ç‚¹æŒ‰é’®æ‰ä¼šç”Ÿæˆï¼Œä¸ä¼šè‡ªåŠ¨æ‰£é’±ã€‚</p>
          <div class="seg-row" style="margin-top:10px"><div class="sk">Access Key ID</div>
            <input id="aiAkId" type="text" style="flex:1" placeholder="ç«å±±å¼•æ“Ž AK IDï¼ˆå¯é€‰ï¼Œä»…ç”¨äºŽæŸ¥ä½™é¢ï¼‰" value="${esc(S.data.settings.ai.accessKeyId||'')}">
          </div>
          <div class="seg-row"><div class="sk">Secret Access Key</div>
            <input id="aiAkSecret" type="password" style="flex:1" placeholder="ç«å±±å¼•æ“Ž SKï¼ˆå¯é€‰ï¼Œä»…ç”¨äºŽæŸ¥ä½™é¢ï¼‰" value="${esc(S.data.settings.ai.secretAccessKey||'')}">
          </div>
          <p style="font-size:12px;color:var(--ink-3);margin-top:4px">å¡«äº†è¿™ä¸¤ä¸ªæ‰èƒ½åœ¨å·¥å…·é‡ŒæŸ¥æ–¹èˆŸä½™é¢ã€‚åªå¡« API Key æŸ¥ä¸äº†ä½™é¢ï¼ˆæ–¹èˆŸæ²¡å¼€æ”¾è¿™ä¸ªæŽ¥å£ï¼‰ã€‚AK/SK åœ¨ç«å±±å¼•æ“ŽæŽ§åˆ¶å°ã€Œè®¿é—®æŽ§åˆ¶ - API è®¿é—®å¯†é’¥ã€é‡Œåˆ›å»ºï¼Œåªå­˜åœ¨ä½ è‡ªå·±æµè§ˆå™¨é‡Œã€‚</p>
          <div class="seg-row" style="margin-top:10px"><div class="sk">å›¾ç”Ÿå›¾å‚è€ƒ</div>
            <label style="display:flex;align-items:center;gap:6px"><input id="aiImg2img" type="checkbox" ${S.data.settings.ai.img2img!==false?'checked':''}> ä¸Šä¼ å®žæ‹å›¾ä½œä¸ºç”Ÿæˆå‚è€ƒï¼ˆæ›´åƒä½ çš„è¡£æœï¼‰</label>
          </div>
          <div class="row" style="margin-top:14px">
            <button class="btn primary" id="aiSaveBtn">ä¿å­˜é…ç½®</button>
            <button class="btn" id="aiTestBtn">æµ‹è¯•è¿žæŽ¥</button>
          </div>
          <p style="font-size:12px;color:var(--ink-3);margin-top:12px">æ¨¡åž‹ ID åœ¨ç«å±±æ–¹èˆŸæŽ§åˆ¶å°ã€Œå¼€é€šç®¡ç†ã€é‡Œå¤åˆ¶ï¼Œå½¢å¦‚ doubao-seedream-4-5-xxxxã€‚å¡«å®Œå…ˆç‚¹ã€Œæµ‹è¯•è¿žæŽ¥ã€ï¼Œæ˜¾ç¤ºèƒ½ç”¨å†å›žç´ æå·¥åŠç”Ÿæˆï¼Œé¿å…ç™½æ‰£é’±ã€‚ä¸å¡« Key ä¹Ÿèƒ½ç”¨ï¼šç´ æå·¥åŠé‡Œæ‰‹åŠ¨é€‰æ ‡ç­¾ï¼Œå³æ¢¦æç¤ºè¯ç…§æ ·è‡ªåŠ¨ç”Ÿæˆï¼Œæ‹¿åŽ»å³æ¢¦å…è´¹å‡ºå›¾ã€‚<br>æ–¹èˆŸä½™é¢ç”¨å®Œå°±åŽ»æŽ§åˆ¶å°å……å€¼ï¼Œå·¥å…·æœ¬èº«ä¸ä»£æ”¶ä»»ä½•è´¹ç”¨ã€‚</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>è´¦å·</h3></div>
        <div class="card-body">
          <div class="row"><button class="btn" id="logoutBtn2">é€€å‡ºç™»å½•</button>
          <span style="font-size:12px;color:var(--ink-3)">å£ä»¤æš‚ä¸æ”¯æŒåœ¨çº¿ä¿®æ”¹ï¼Œå¦‚éœ€é‡ç½®è¯·è”ç³»ç®¡ç†å‘˜æ¸…ç©ºæœåŠ¡å™¨ data ç›®å½•ã€‚</span></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>æ•°æ®æ¥æºè¯´æ˜Ž</h3></div>
        <div class="card-body" style="font-size:13px;color:var(--ink-2);line-height:1.9">
          <div><b>å½“å‰ç‰ˆæœ¬</b>ï¼šæ‰‹åŠ¨å½•å…¥ + å¯¼å…¥ï¼Œé›¶å°åº—é£Žé™©ã€‚æ¯æ—¥æ•°æ®ä»Žå•†å®¶åŽå°ã€Œæ•°æ®ä¸­å¿ƒã€æŠ„å½•ï¼Œ30 ç§’å½•å®Œä¸€å®¶åº—ã€‚</div>
          <div><b>ä¸ºä»€ä¹ˆä¸åšè‡ªåŠ¨æŠ“å–</b>ï¼šæ’ä»¶æŠ“å–è¿åå¹³å°åè®®ï¼Œæœ‰å°åº—é£Žé™©ï¼Œä¸”åŽå°ä¸€æ”¹ç‰ˆå°±å¤±æ•ˆï¼Œä¸é€‚åˆä½œä¸ºé•¿æœŸä¾èµ–ã€‚</div>
          <div><b>ä»¥åŽå¯ä»¥æŽ¥</b>ï¼šæ‹¼å¤šå¤šå¼€æ”¾å¹³å°çš„è®¢å•/ç‰©æµ/å•†å“æŽ¥å£ï¼Œéœ€è¦ä¼ä¸šèµ„è´¨ä¸Žåº”ç”¨å®¡æ ¸ï¼›å±Šæ—¶çœ‹æ¿å¯ä»¥ç›´æŽ¥è‡ªåŠ¨å‡ºæ•°ã€‚</div>
          <div><b>ç´ æç”Ÿæˆ</b>ï¼šæŒ‰æ¯›è¡£ç±»ç›®çš„å…³é”®è¯è§„åˆ™ç”Ÿæˆï¼Œä¸è”ç½‘ã€ä¸ä¸Šä¼ ä½ çš„å›¾åˆ°ç¬¬ä¸‰æ–¹ï¼›ç”Ÿæˆç»“æžœæŒ‰å¹³å°è§„åˆ™åšè¿‡å­—æ•°æŽ§åˆ¶ã€‚</div>
          <div><b>AI æ¨¡ç‰¹å›¾</b>ï¼šä¸¤æ¡è·¯éƒ½ä¿ç•™ã€‚å…è´¹è·¯çº¿ = å¤åˆ¶å³æ¢¦æç¤ºè¯åŽ»å³æ¢¦ AI ç½‘é¡µç‰ˆå‡ºå›¾ï¼›èŠ±é’±è·¯çº¿ = åœ¨ç´ æå·¥åŠæ‰‹åŠ¨ç‚¹ã€Œç”¨ç«å±±æ–¹èˆŸç”Ÿæˆã€ï¼Œä¸€å¼ çº¦ 0.1~1 å…ƒï¼Œä»Žæ–¹èˆŸä½™é¢æ‰£ï¼Œä¸ç‚¹ä¸æ‰£ã€‚ä¸Šä¼ å›¾ç‰‡åŽçš„æè´¨è¯†åˆ«çº¦ 0.001 å…ƒä¸€å¼ ï¼Œè‡ªåŠ¨è·‘ã€‚</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>ç´ æåº“</h3><span class="sub">å…± ${d.materials.length} æ¡</span></div>
        <div class="card-body">
          <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
            <input type="text" id="libSearchInput" placeholder="æœç´¢ï¼šå“ç±» / é¢œè‰² / é£Žæ ¼ / æè´¨â€¦" value="${esc(S.libSearch)}" style="flex:1;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;background:var(--bg)">
            ${S.libViewId ? `<button class="btn sm" id="libBack">è¿”å›žåˆ—è¡¨</button>` : ''}
          </div>
          ${S.libViewId ? renderMaterialDetail(d.materials.find((m) => m.id === S.libViewId)) : (d.materials.length ? `<div class="canvas-grid">${filteredMaterials(d.materials, S.libSearch).map((m) => `
            <div class="canvas-card" data-mat-id="${m.id}" style="cursor:pointer">
              <img src="${m.imageUrl}" alt="${esc(m.name)}">
              <div class="cc-foot"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}</span>${m.aiImages && m.aiImages.length ? `<span style="color:var(--brand);font-size:11px;margin-left:6px">${m.aiImages.length}å›¾</span>` : ''}</div>
            </div>`).join('')}</div>${filteredMaterials(d.materials, S.libSearch).length === 0 && S.libSearch ? `<div class="tbl-empty">æ²¡æœ‰åŒ¹é…ã€Œ${esc(S.libSearch)}ã€çš„ç´ æ</div>` : ''}` : `<div class="tbl-empty">ç´ æå·¥åŠé‡Œç‚¹ã€Œä¿å­˜åˆ°ç´ æåº“ã€åŽï¼Œä¼šå‡ºçŽ°åœ¨è¿™é‡Œ</div>`)}
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
        toast('å¤‡ä»½å·²æ¢å¤ï¼Œæ­£åœ¨åŒæ­¥');
      } catch (_) {
        toast('å¤‡ä»½æ–‡ä»¶æ ¼å¼ä¸å¯¹');
      }
    };
  }
  const logout = $('#logoutBtn2');
  if (logout) logout.onclick = doLogout;

  // ç´ æåº“ï¼šæœç´¢
  const libSearchInput = $('#libSearchInput');
  if (libSearchInput) {
    libSearchInput.oninput = (e) => {
      S.libSearch = e.target.value;
      S.libViewId = null;
      renderRoute();
      bindSettings();
      // é‡æ–°èšç„¦æœç´¢æ¡†å¹¶æŠŠå…‰æ ‡æ”¾åˆ°æœ«å°¾
      const inp = $('#libSearchInput');
      if (inp) { inp.focus(); const v = inp.value; inp.value = ''; inp.value = v; }
    };
  }
  // ç´ æåº“ï¼šç‚¹å‡»ç´ ææŸ¥çœ‹è¯¦æƒ…
  $$('[data-mat-id]').forEach((el) => {
    el.onclick = () => {
      S.libViewId = el.dataset.matId;
      renderRoute();
      bindSettings();
    };
  });
  // ç´ æåº“ï¼šè¿”å›žåˆ—è¡¨
  const libBack = $('#libBack');
  if (libBack) libBack.onclick = () => { S.libViewId = null; renderRoute(); bindSettings(); };
  // ç´ æåº“ï¼šæ‰¹é‡ä¸‹è½½
  const libDlAll = $('#libDlAll');
  if (libDlAll) libDlAll.onclick = () => {
    const m = S.data.materials.find((x) => x.id === S.libViewId);
    const imgs = (m && m.aiImages) || [];
    if (!imgs.length) return;
    downloadAsZip(imgs, `${(m.name || 'ç´ æ').replace(/[\\/:*?"<>|]/g, '_')}.zip`);
  };
  // ç´ æåº“ï¼šåˆ é™¤
  const libDel = $('#libDel');
  if (libDel) libDel.onclick = () => {
    if (!confirm('ç¡®å®šåˆ é™¤è¿™æ¡ç´ æï¼Ÿæ­¤æ“ä½œä¸å¯æ¢å¤ã€‚')) return;
    S.data.materials = S.data.materials.filter((x) => x.id !== S.libViewId);
    S.libViewId = null;
    persist();
    renderRoute();
    bindSettings();
    toast('å·²åˆ é™¤');
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
    toast('AI é…ç½®å·²ä¿å­˜');
  };
  const aiTest = $('#aiTestBtn');
  if (aiTest) aiTest.onclick = async () => {
    // å…ˆç”¨å½“å‰è¾“å…¥æ¡†çš„å€¼ä¸´æ—¶ä¿å­˜ä¸€ä¸‹å†æµ‹è¯•
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
    aiTest.textContent = 'æµ‹è¯•ä¸­â€¦';
    try {
      const r = await api('/api/ai/test', { method: 'POST', body: '{}' });
      if (r.ok) toast('Key èƒ½ç”¨ï¼Œæµè§ˆå™¨èƒ½ç›´è¿žæ–¹èˆŸï¼Œå¯ä»¥åŽ»ç”Ÿæˆæ¨¡ç‰¹å›¾äº†');
      else toast('è¿žæŽ¥å¤±è´¥ï¼š' + (r.message || r.error));
    } catch (e) {
      toast('è¿žæŽ¥å¤±è´¥ï¼š' + ((e.body && e.body.message) || e.message));
    } finally {
      aiTest.disabled = false;
      aiTest.textContent = 'æµ‹è¯•è¿žæŽ¥';
    }
  };
}

async function doLogout() {
  try { await api('/api/logout', { method: 'POST' }); } catch (_) {}
  location.reload();
}

/* ================= å·¥å…· ================= */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('å·²å¤åˆ¶');
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('å·²å¤åˆ¶');
  }
}

/* å‡ºå›¾åŽè‡ªåŠ¨è°ƒè‰²ï¼šæäº® + æš–è°ƒ + é«˜å…‰æŸ”å…‰ï¼ŒæŽ¥è¿‘æ‰‹æœºç›´å‡ºå’–å•¡é¦†çš„äº®åº¦ */
function gradePhoto(url) {
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
        // åªåšè½»å¾®ã€ä¸­æ€§çš„æäº®ï¼Œä¸åŠ æš–æ©™æ»¤é•œï¼Œé¿å…æ•´æ‰¹å˜æˆåŒä¸€ç§ AI è‰²è°ƒ
        const lift = 1.02 + Math.random() * 0.04;
        x.filter = `brightness(${lift.toFixed(2)}) saturate(1.02) contrast(1.01)`;
        x.drawImage(img, 0, 0, W, H);
        x.filter = 'none';
        // é˜²æ¯”ä»·ï¼šæ¯å¼ å›¾åŠ æžè½»å¾®çš„éšæœºè‰²è°ƒå’Œäº®åº¦åç§»ï¼Œä¿è¯åƒç´ çº§å”¯ä¸€
        const randHue = (Math.random() - 0.5) * 3;
        const randBri = 1 + (Math.random() - 0.5) * 0.02;
        x.globalCompositeOperation = 'source-over';
        x.filter = `hue-rotate(${randHue}deg) brightness(${randBri})`;
        x.drawImage(c, 0, 0);
        x.filter = 'none';
        const b = document.createElement('canvas');
        b.width = Math.max(1, Math.round(W / 5));
        b.height = Math.max(1, Math.round(H / 5));
        const bx = b.getContext('2d');
        bx.filter = 'blur(6px) brightness(1.1)';
        bx.drawImage(img, 0, 0, b.width, b.height);
        x.globalCompositeOperation = 'screen';
        x.globalAlpha = 0.04;
        x.drawImage(b, 0, 0, W, H);
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';
        // æžè½»é¢—ç²’ï¼Œé¿å…è¿‡åº¦ç£¨çš®çš„å¡‘æ–™æ„Ÿï¼ŒåŒæ—¶ä¸æ˜¾ç²—ç³™
        const grain = x.getImageData(0, 0, W, H);
        const gd = grain.data;
        for (let i = 0; i < gd.length; i += 4) {
          const n = (Math.random() - 0.5) * 8;
          gd[i] += n;
          gd[i + 1] += n;
          gd[i + 2] += n;
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

function openImgViewer(url, label) {
  if (!url) return;
  const old = $('#imgViewer');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'imgViewer';
  wrap.className = 'img-viewer';
  wrap.innerHTML = `
    <div class="iv-top"><span>${esc(label || 'æŸ¥çœ‹å¤§å›¾')}</span><button class="iv-close" type="button">å…³é—­</button></div>
    <div class="iv-body"><img src="${url}" alt="${esc(label || '')}"></div>
    <div class="iv-foot"><a class="btn sm primary" href="${url}" download="${esc(label || 'å›¾ç‰‡')}.png">ä¸‹è½½è¿™å¼ </a></div>`;
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

/* ================= å¯åŠ¨ ================= */

// ç”Ÿæˆå›¾ç»Ÿä¸€åœ¨åº”ç”¨å†…æŸ¥çœ‹å¤§å›¾ï¼šdata: å›¾ç‰‡åœ¨æ–°æ ‡ç­¾é¡µä¼šè¢«æµè§ˆå™¨æ‹¦æˆªæˆé»‘å±
document.addEventListener('click', (e) => {
  const img = e.target.closest('.canvas-card img');
  if (!img) return;
  const card = img.closest('.canvas-card');
  const labelEl = card && card.querySelector('.cc-foot span');
  const link = img.closest('a');
  if (link) e.preventDefault();
  openImgViewer(img.getAttribute('src'), labelEl ? labelEl.textContent : 'æŸ¥çœ‹å¤§å›¾');
});

$('#logoutBtn').onclick = doLogout;
window.addEventListener('resize', () => { if (S.route === 'dashboard') drawSpark(); });
window.addEventListener('online', () => { toast('ç½‘ç»œå·²æ¢å¤'); flush(); });
window.addEventListener('offline', () => setSync('error', 'ç¦»çº¿'));

if ('serviceWorker' in navigator) {
  // ä¸å†ä½¿ç”¨ç¦»çº¿ç¼“å­˜ï¼Œé¿å…æ—§ç‰ˆæœ¬é¡µé¢å¡ä½ï¼›åŒæ—¶æ³¨é”€åŽ†å²æ³¨å†Œ
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
}

boot().catch((err) => {
  console.error(err);
  showAuth(false);
});
