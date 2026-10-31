/* 本地存储版：把原来的服务器接口改为浏览器本地存储（IndexedDB），AI 接口直连火山方舟 */
(function () {
  var DB = 'knit-local', STORE = 'kv';
  function open() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function get(k) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE).objectStore(STORE).get(k);
        t.onsuccess = function () { res(t.result); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function set(k, v) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k);
        t.onsuccess = function () { res(); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function json(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  var VISION_PROMPT = [
    '你是一个拼多多服装类目运营专家。请仔细观察用户上传的服装实拍图，识别它的商品信息，严格只返回一个 JSON 对象，不要任何解释或 markdown。字段含义：',
    '- category: 品类，从 ["套头毛衣","针织开衫","毛衣马甲","针织连衣裙","毛衣外套","打底针织衫"] 选一个最接近的',
    '- materials: 材质数组，从 ["羊毛","山羊绒","兔绒","羊毛混纺","棉","雪尼尔","腈纶","冰丝","马海毛"] 选 1-2 个最接近的',
    '- crafts: 工艺数组，从 ["麻花编织","提花","镂空","钩花","拼色","条纹","纯色","绞花","坑条"] 选 1-2 个最接近的',
    '- neck: 领型，从 ["圆领","半高领","V领","高领","翻领","连帽","方领","一字领"] 选一个',
    '- fit: 版型，从 ["宽松","修身","落肩","短款","中长款","oversize"] 选一个',
    '- styles: 风格数组，从 ["慵懒风","韩版","日系","复古","法式","学院风","通勤","ins风","温柔风"] 选 1-2 个',
    '- audience: 人群数组，从 ["女士","学生","妈妈","大码","情侣","青少年"] 选 1-2 个',
    '- weight: 厚薄，从 ["薄款","常规","加厚","厚实"] 选一个',
    '- season: 季节，从 ["春秋","秋冬","冬季"] 选一个',
    '- colors: 颜色数组，从 ["燕麦色","奶白色","雾霾蓝","奶茶色","焦糖色","墨绿色","藏青色","黑色","灰色","粉色","浅杏色","酒红色"] 选 1-3 个最接近的',
    '- sizes: 尺码数组，从 ["S","M","L","XL","2XL","3XL","均码"] 选',
    '- scene: 场景数组，从 ["内搭打底","单穿外穿","通勤上班","约会日常","校园","居家"] 选 1-2 个',
    '- price: 预估售价（数字，单位元），不确定填 59.9',
    '- extra: 额外卖点关键词字符串（逗号分隔，如"不起球,可机洗"），没有就空字符串',
    '',
    '只返回 JSON。'
  ].join('\n');

  function parseJsonText(text) {
    if (!text) return null;
    var s = String(text).replace(/```json/gi, '```').replace(/```/g, '');
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  }

  function aiConfig() {
    return get('data').then(function (d) {
      var ai = d && d.settings && d.settings.ai;
      if (!ai || !ai.apiKey) return null;
      return ai;
    });
  }

  function aiHeaders(cfg) {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey };
  }

  function aiFail(j, status) {
    var msg = (j && j.error && (j.error.message || j.error.code)) || ('HTTP ' + status);
    return json({ error: 'AI_FAIL', message: msg }, 502);
  }

  var orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var p = url.indexOf(location.origin) === 0 ? url.slice(location.origin.length) : url;
    p = p.split('?')[0];
    var base = location.pathname.replace(/index\.html$/, '');
    if (base && base !== '/' && p.indexOf(base) === 0) p = p.slice(base.length - 1);
    if (p.indexOf('/api/') !== 0) return orig(input, init);
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    return Promise.resolve().then(function () {
      if (p === '/api/health') return json({ ok: true });
      if (p === '/api/session') return json({ authed: true, needsSetup: false });
      if (p === '/api/login' || p === '/api/logout') return json({ ok: true, authed: true });
      if (p === '/api/data') {
        if (method === 'GET') {
          return get('data').then(function (d) {
            return json(d || {
              rev: 0,
              updatedAt: new Date().toISOString(),
              shops: [], products: [], daily: [], materials: [],
              settings: {
                storeName: '我的毛衣工作室',
                currency: '¥',
                onboard: false,
                ai: {
                  provider: 'volc', apiKey: '',
                  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
                  visionModel: 'doubao-1.5-vision-pro-32k-250115',
                  imageModel: 'doubao-seedream-4.5-251028',
                  img2img: true
                }
              }
            });
          });
        }
        var body = JSON.parse((init && init.body) || '{}');
        var next = Object.assign({}, body.data || {});
        next.rev = Number(body.rev || 0) + 1;
        next.updatedAt = new Date().toISOString();
        return set('data', next).then(function () {
          return json({ rev: next.rev, updatedAt: next.updatedAt });
        });
      }
      if (p === '/api/asset') {
        var b = JSON.parse((init && init.body) || '{}');
        return json({ url: b.dataUrl });
      }
      if (p === '/api/ai/test') {
        return aiConfig().then(function (cfg) {
          if (!cfg) return json({ error: 'NO_API_KEY', message: '还没填火山方舟的 API Key' }, 400);
          var baseUrl3 = (cfg.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');
          return orig(baseUrl3 + '/chat/completions', {
            method: 'POST',
            headers: aiHeaders(cfg),
            body: JSON.stringify({
              model: cfg.visionModel,
              max_tokens: 10,
              messages: [{ role: 'user', content: '只回复两个字母：OK' }]
            })
          }).then(function (r) {
            return r.json().then(function (j) {
              if (!r.ok) return aiFail(j, r.status);
              return json({ ok: true, message: 'Key 能用，识别模型正常' });
            });
          }).catch(function (e) {
            return json({ error: 'AI_NETWORK', message: '浏览器没拿到方舟的返回：请先核对 API Key 和模型 ID 有没有填错；都填对了还这样，告诉我，我换成中转通道。' }, 502);
          });
        });
      }
      if (p === '/api/ai/recognize') {
        var rb = JSON.parse((init && init.body) || '{}');
        return aiConfig().then(function (cfg) {
          if (!cfg) return json({ error: 'NO_API_KEY', message: '还没填火山方舟的 API Key，去「设置」里填一下' }, 400);
          if (!rb.imageUrl) return json({ error: 'BAD_IMAGE', message: '没读到图片' }, 400);
          var baseUrl = (cfg.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');
          return orig(baseUrl + '/chat/completions', {
            method: 'POST',
            headers: aiHeaders(cfg),
            body: JSON.stringify({
              model: cfg.visionModel,
              temperature: 0.1,
              max_tokens: 800,
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: VISION_PROMPT },
                  { type: 'image_url', image_url: { url: rb.imageUrl } }
                ]
              }]
            })
          }).then(function (r) {
            return r.json().then(function (j) {
              if (!r.ok) return aiFail(j, r.status);
              var text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
              var parsed = parseJsonText(text);
              if (!parsed) return json({ error: 'AI_PARSE_FAIL', message: '识别结果没看懂，再点一次试试' }, 502);
              return json({ ok: true, style: parsed });
            });
          }).catch(function (e) {
            return json({ error: 'AI_NETWORK', message: '浏览器没拿到方舟的返回：请先核对 API Key 和模型 ID 有没有填错；都填对了还这样，告诉我，我换成中转通道。' }, 502);
          });
        });
      }
      if (p === '/api/ai/generate') {
        var gb = JSON.parse((init && init.body) || '{}');
        return aiConfig().then(function (cfg) {
          if (!cfg) return json({ error: 'NO_API_KEY', message: '还没填火山方舟的 API Key，去「设置」里填一下' }, 400);
          if (!gb.prompt) return json({ error: 'NO_PROMPT', message: '缺少提示词' }, 400);
          var baseUrl2 = (cfg.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');
          var payload = {
            model: cfg.imageModel,
            prompt: gb.prompt,
            size: gb.size || '1024x1024',
            response_format: 'b64_json',
            n: 1
          };
          if (cfg.img2img !== false && gb.imageUrl) payload.image = gb.imageUrl;
          return orig(baseUrl2 + '/images/generations', {
            method: 'POST',
            headers: aiHeaders(cfg),
            body: JSON.stringify(payload)
          }).then(function (r) {
            return r.json().then(function (j) {
              if (!r.ok) return aiFail(j, r.status);
              var img0 = j.data && j.data[0];
              if (!img0) return json({ error: 'AI_EMPTY', message: '方舟没返回图片' }, 502);
              if (img0.b64_json) {
                return json({ ok: true, dataUrl: 'data:image/png;base64,' + img0.b64_json });
              }
              if (img0.url) return json({ ok: true, url: img0.url });
              return json({ error: 'AI_EMPTY', message: '方舟返回格式看不懂' }, 502);
            });
          }).catch(function (e) {
            return json({ error: 'AI_NETWORK', message: '浏览器没拿到方舟的返回：请先核对 API Key 和模型 ID 有没有填错；都填对了还这样，告诉我，我换成中转通道。' }, 502);
          });
        });
      }
      return json({ error: 'OFFLINE_NO_SERVER' }, 501);
    });
  };
})();
window.__shim = "yes";
