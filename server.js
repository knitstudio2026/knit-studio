'use strict';

/**
 * 零依赖 Node 服务端
 * - 单用户口令登录
 * - 全量状态云端存储（多设备同步）
 * - 素材图片文件存储
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || (process.pkg ? path.join(path.dirname(process.execPath), 'data') : path.join(ROOT, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const ASSET_DIR = path.join(DATA_DIR, 'assets');
const MAX_BODY = 12 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(ASSET_DIR, { recursive: true });

const sessions = new Set();

function defaultState() {
  return {
    rev: 0,
    updatedAt: new Date().toISOString(),
    auth: { salt: null, hash: null },
    shops: [],
    products: [],
    daily: [],
    materials: [],
    settings: {
      storeName: '我的毛衣工作室',
      currency: '¥',
      onboard: false,
      ai: {
        provider: 'volc',
        apiKey: '',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        visionModel: 'doubao-1.5-vision-pro-32k-250115',
        imageModel: 'doubao-seedream-4.5-251028',
        img2img: true
      }
    }
  };
}

let state = null;

function loadState() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      state = JSON.parse(raw);
      state.shops = state.shops || [];
      state.products = state.products || [];
      state.daily = state.daily || [];
      state.materials = state.materials || [];
      state.settings = Object.assign(defaultState().settings, state.settings || {});
      const defAi = defaultState().settings.ai;
      state.settings.ai = state.settings.ai
        ? Object.assign({}, defAi, state.settings.ai)
        : defAi;
      state.auth = state.auth || { salt: null, hash: null };
      return;
    } catch (err) {
      console.error('[state] 读取失败，备份原文件后重建', err.message);
      try {
        fs.renameSync(DATA_FILE, DATA_FILE + '.broken-' + Date.now());
      } catch (_) {}
    }
  }
  state = defaultState();
  persist();
}

function persist() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function publicState() {
  const { auth, ...rest } = state;
  return Object.assign({}, rest, { needsSetup: !auth.hash });
}

function hashPass(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function isAuthed(_req) {
  // 个人自用：不做登录校验，打开即可使用
  return true;
}

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  return JSON.parse(buf.toString('utf8'));
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, { error: 'NOT_FOUND' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const cache = 'no-cache';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
    res.end(data);
  });
}

async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/health') return send(res, 200, { ok: true, time: Date.now() });

  if (p === '/api/login' && req.method === 'POST') {
    const body = await readJson(req);
    if (!state.auth.hash) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPass(body.password, salt);
      state.auth = { salt, hash };
      state.rev += 1;
      state.updatedAt = new Date().toISOString();
      persist();
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.add(sid);
      return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` });
    }
    if (!body.password || hashPass(body.password, state.auth.salt) !== state.auth.hash) {
      return send(res, 401, { error: 'BAD_PASSWORD', message: '口令不正确' });
    }
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.add(sid);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` });
  }

  if (p === '/api/logout' && req.method === 'POST') {
    const sid = parseCookies(req).sid;
    if (sid) sessions.delete(sid);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' });
  }

  if (p === '/api/session') {
    return send(res, 200, { authed: isAuthed(req), needsSetup: false });
  }

  if (!isAuthed(req)) return send(res, 401, { error: 'UNAUTHORIZED' });

  if (p === '/api/data' && req.method === 'GET') {
    return send(res, 200, publicState());
  }

  if (p === '/api/data' && req.method === 'PUT') {
    const body = await readJson(req);
    const incoming = body.data || {};
    if (typeof body.rev === 'number' && body.rev !== state.rev) {
      return send(res, 409, { error: 'REV_CONFLICT', rev: state.rev, data: publicState() });
    }
    const auth = state.auth;
    state = {
      rev: state.rev + 1,
      updatedAt: new Date().toISOString(),
      auth,
      shops: incoming.shops || [],
      products: incoming.products || [],
      daily: incoming.daily || [],
      materials: incoming.materials || [],
      settings: Object.assign(defaultState().settings, incoming.settings || {})
    };
    const defAi = defaultState().settings.ai;
    state.settings.ai = state.settings.ai
      ? Object.assign({}, defAi, state.settings.ai)
      : defAi;
    persist();
    return send(res, 200, { ok: true, rev: state.rev, updatedAt: state.updatedAt });
  }

  if (p === '/api/asset' && req.method === 'POST') {
    const body = await readJson(req);
    const match = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(body.dataUrl || '');
    if (!match) return send(res, 400, { error: 'BAD_IMAGE' });
    const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
    const buf = Buffer.from(match[3], 'base64');
    if (buf.length > MAX_BODY) return send(res, 413, { error: 'IMAGE_TOO_LARGE' });
    const name = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20) + '.' + ext;
    fs.writeFileSync(path.join(ASSET_DIR, name), buf);
    return send(res, 200, { url: '/assets/' + name, size: buf.length });
  }

  /* ================= AI 能力 ================= */

  function aiConfig() {
    return state.settings.ai || {};
  }

  function jsonToDataUrl(buf, mime) {
    return 'data:' + (mime || 'image/png') + ';base64,' + buf.toString('base64');
  }

  async function resolveImageDataUrl(imageUrl) {
    if (!imageUrl) return null;
    if (/^data:image\//.test(imageUrl)) return imageUrl;
    if (imageUrl.startsWith('/assets/')) {
      const name = path.basename(imageUrl);
      const file = path.join(ASSET_DIR, name);
      if (fs.existsSync(file)) {
        const ext = path.extname(name).slice(1).replace('jpg', 'jpeg');
        return jsonToDataUrl(fs.readFileSync(file), 'image/' + ext);
      }
    }
    try {
      const r = await fetch(imageUrl);
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      const mime = r.headers.get('content-type') || 'image/png';
      return jsonToDataUrl(buf, mime);
    } catch (_) {
      return null;
    }
  }

  function extractJson(text) {
    if (!text) return null;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fence ? fence[1] : text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end < 0) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch (_) {
      return null;
    }
  }

  const VISION_PROMPT = `你是一个拼多多服装类目运营专家。请仔细观察用户上传的服装实拍图，识别它的商品信息，严格只返回一个 JSON 对象，不要任何解释或 markdown。字段含义：
- category: 品类，从 ["套头毛衣","针织开衫","毛衣马甲","针织连衣裙","毛衣外套","打底针织衫"] 选一个最接近的
- materials: 材质数组，从 ["羊毛","山羊绒","兔绒","羊毛混纺","棉","雪尼尔","腈纶","冰丝","马海毛"] 选 1-2 个最接近的
- crafts: 工艺数组，从 ["麻花编织","提花","镂空","钩花","拼色","条纹","纯色","绞花","坑条"] 选 1-2 个最接近的
- neck: 领型，从 ["圆领","半高领","V领","高领","翻领","连帽","方领","一字领"] 选一个
- fit: 版型，从 ["宽松","修身","落肩","短款","中长款","oversize"] 选一个
- styles: 风格数组，从 ["慵懒风","韩版","日系","复古","法式","学院风","通勤","ins风","温柔风"] 选 1-2 个
- audience: 人群数组，从 ["女士","学生","妈妈","大码","情侣","青少年"] 选 1-2 个
- weight: 厚薄，从 ["薄款","常规","加厚","厚实"] 选一个
- season: 季节，从 ["春秋","秋冬","冬季"] 选一个
- colors: 颜色数组，从 ["燕麦色","奶白色","雾霾蓝","奶茶色","焦糖色","墨绿色","藏青色","黑色","灰色","粉色","浅杏色","酒红色"] 选 1-3 个最接近的
- sizes: 尺码数组，从 ["S","M","L","XL","2XL","3XL","均码"] 选
- scene: 场景数组，从 ["内搭打底","单穿外穿","通勤上班","约会日常","校园","居家"] 选 1-2 个
- price: 预估售价（数字，单位元），不确定填 59.9
- extra: 额外卖点关键词字符串（逗号分隔，如"不起球,可机洗"），没有就空字符串

只返回 JSON。`;

  if (p === '/api/ai/recognize' && req.method === 'POST') {
    const cfg = aiConfig();
    if (!cfg.apiKey) return send(res, 400, { error: 'NO_API_KEY', message: '请先在「设置」里填入 AI 接口的 API Key' });
    const body = await readJson(req);
    const dataUrl = await resolveImageDataUrl(body.imageUrl);
    if (!dataUrl) return send(res, 400, { error: 'BAD_IMAGE', message: '无法读取图片' });

    try {
      const r = await fetch((cfg.baseUrl || '').replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({
          model: cfg.visionModel,
          temperature: 0.1,
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }]
        })
      });
      const j = await r.json();
      if (!r.ok) return send(res, 502, { error: 'AI_FAIL', message: (j.error && (j.error.message || j.error.code)) || ('HTTP ' + r.status) });
      const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      const parsed = extractJson(text);
      if (!parsed) return send(res, 502, { error: 'AI_PARSE_FAIL', message: 'AI 返回结果无法解析，请重试', raw: text });
      return send(res, 200, { ok: true, style: parsed });
    } catch (err) {
      return send(res, 502, { error: 'AI_NETWORK', message: err.message });
    }
  }

  if (p === '/api/ai/generate' && req.method === 'POST') {
    const cfg = aiConfig();
    if (!cfg.apiKey) return send(res, 400, { error: 'NO_API_KEY', message: '请先在「设置」里填入 AI 接口的 API Key' });
    const body = await readJson(req);
    if (!body.prompt) return send(res, 400, { error: 'NO_PROMPT' });

    const payload = {
      model: cfg.imageModel,
      prompt: body.prompt,
      size: body.size || '1024x1024',
      response_format: 'b64_json',
      n: 1
    };

    // 图生图：把参考图一起发过去（兼容支持 image 参数的接口）
    if (cfg.img2img !== false && body.imageUrl) {
      const ref = await resolveImageDataUrl(body.imageUrl);
      if (ref) payload.image = ref.replace(/^data:image\/\w+;base64,/, '');
    }

    try {
      const r = await fetch((cfg.baseUrl || '').replace(/\/$/, '') + '/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      if (!r.ok) return send(res, 502, { error: 'AI_FAIL', message: (j.error && (j.error.message || j.error.code)) || ('HTTP ' + r.status) });
      const img0 = j.data && j.data[0];
      if (!img0) return send(res, 502, { error: 'AI_EMPTY', message: 'AI 没返回图片' });
      const b64 = img0.b64_json;
      if (b64) {
        const mime = /jpeg/.test(cfg.imageModel) ? 'image/jpeg' : 'image/png';
        return send(res, 200, { ok: true, dataUrl: 'data:' + mime + ';base64,' + b64 });
      }
      if (img0.url) return send(res, 200, { ok: true, url: img0.url });
      return send(res, 502, { error: 'AI_EMPTY', message: 'AI 返回格式无法识别' });
    } catch (err) {
      return send(res, 502, { error: 'AI_NETWORK', message: err.message });
    }
  }

  if (p === '/api/backup' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="knit-studio-backup-' + new Date().toISOString().slice(0, 10) + '.json"'
    });
    const { auth, ...rest } = state;
    return res.end(JSON.stringify(rest, null, 2));
  }

  return send(res, 404, { error: 'UNKNOWN_ENDPOINT' });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch (_) {
    return send(res, 400, { error: 'BAD_REQUEST' });
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname.startsWith('/assets/')) {
      const name = path.basename(url.pathname);
      if (!/^[a-f0-9]{20}\.(png|jpg|webp)$/.test(name)) return send(res, 404, { error: 'NOT_FOUND' });
      return serveFile(res, path.join(ASSET_DIR, name));
    }

    let filePath = path.normalize(path.join(PUBLIC_DIR, url.pathname));
    if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'FORBIDDEN' });

    if (url.pathname === '/' || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    return serveFile(res, filePath);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) {
      if (err && err.message === 'BODY_TOO_LARGE') return send(res, 413, { error: 'BODY_TOO_LARGE' });
      send(res, 500, { error: 'SERVER_ERROR' });
    }
  }
});

loadState();

server.listen(PORT, '0.0.0.0', () => {
  console.log('[knit-studio] listening on ' + PORT + ' | data: ' + DATA_DIR);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
