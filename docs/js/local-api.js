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
    '你是一个拼多多女装类目运营专家。请仔细观察用户上传的服装实拍图，识别它的商品信息，严格只返回一个 JSON 对象，不要任何解释或 markdown。所有取值必须从给定选项里选，不许自己造词，字段含义：',
    '- category: 商品类目，从 ["套头毛衣","针织开衫","毛衣马甲","针织连衣裙","毛衣外套","打底针织衫"] 选一个最接近的',
    '- materials: 主面料成分数组，从 ["羊毛","山羊绒","兔绒","羊毛混纺","棉","雪尼尔","腈纶","冰丝","马海毛","其他"] 选 1-2 个最接近的',
    '- pattern: 图案，从 ["纯色","条纹","格子","印花","提花","拼色","刺绣","字母","动物纹"] 选一个',
    '- neck: 领型，从 ["圆领","V领","高领","半高领","翻领","连帽","方领","一字领","娃娃领","立领"] 选一个',
    '- fit: 版型，从 ["宽松","修身","直筒","收腰","A字","常规"] 选一个',
    '- length: 衣长，从 ["短款","常规","中长款","长款"] 选一个',
    '- sleeveLen: 袖长，从 ["长袖","短袖","七分袖","九分袖","无袖"] 选一个',
    '- sleeveType: 袖型，从 ["常规袖","泡泡袖","灯笼袖","蝙蝠袖","插肩袖"] 选一个',
    '- weight: 厚薄，从 ["薄款","常规","加厚","加绒"] 选一个',
    '- elements: 流行元素数组，从 ["纽扣","口袋","拉链","蝴蝶结","蕾丝","荷叶边","流苏","刺绣","拼接","钉珠","镂空"] 选 1-3 个图里真实有的',
    '- mainStyle: 主风格，只能从这 6 个选一个：["甜美清新","个性街头","气质名媛","简约通勤","文艺复古","小众特色"]',
    '- subStyle: 风格，从 ["韩版","日系","法式","复古","学院风","ins风","慵懒风","温柔风","小香风","运动风"] 选一个',
    '- season: 适用季节，从 ["春秋","秋冬","冬季","四季"] 选一个',
    '- colors: 颜色数组。先数清楚图里有几件不同颜色的同款衣服（拼图要一格一格看），有几个就列几个，最多 12 个，一个都不能漏、也不能把相近色合并；用常见中文色名（如 奶白色、浅蓝色、浅粉色、浅黄色、浅紫色、黑色、灰色、燕麦色、驼色、焦糖色、雾霾蓝、酒红色）',
    '- grid: 如果图片是多格拼图，请逐格识别，按「从左到右、从上到下」的顺序，把每一格衣服的颜色写进数组（例如 ["奶白色","浅蓝色","浅粉色","浅黄色","浅紫色","黑色"]）；不是拼图就返回空数组。colors 必须是 grid 去重后的结果，不能少',
    '- sizes: 尺码数组，从 ["S","M","L","XL","2XL","3XL","均码"] 选',
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

  var AI_DEFAULT = {
    provider: 'volc', apiKey: '',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    visionModel: 'doubao-seed-2-1-pro-260915',
    imageModel: 'doubao-seedream-5-0-pro-260628',
    img2img: true,
    accessKeyId: '',
    secretAccessKey: ''
  };

  // 旧版本默认的模型已下线，回来自动换新，用户不用手打
  function fixAi(d) {
    if (!d || !d.settings) return false;
    var ai = d.settings.ai;
    if (!ai) { d.settings.ai = Object.assign({}, AI_DEFAULT); return true; }
    var changed = false;
    var vm = String(ai.visionModel || '');
    var im = String(ai.imageModel || '');
    if (!vm || /doubao-1\.5-vision/.test(vm)) { ai.visionModel = AI_DEFAULT.visionModel; changed = true; }
    if (!im || /seedream-4\.5|seedream-4-5/.test(im)) { ai.imageModel = AI_DEFAULT.imageModel; changed = true; }
    if (!ai.baseUrl) { ai.baseUrl = AI_DEFAULT.baseUrl; changed = true; }
    if (ai.accessKeyId === undefined) { ai.accessKeyId = ''; changed = true; }
    if (ai.secretAccessKey === undefined) { ai.secretAccessKey = ''; changed = true; }
    return changed;
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

  /* ===== 火山引擎 V4 签名（用于查余额） ===== */
  function toHex(buf) {
    var b = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < b.length; i++) {
      var h = b[i].toString(16);
      s += h.length < 2 ? '0' + h : h;
    }
    return s;
  }
  function str2ab(s) { return new TextEncoder().encode(s); }
  function hmacSha256(keyBuf, dataBuf) {
    return crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then(function (k) { return crypto.subtle.sign('HMAC', k, dataBuf); });
  }
  function sha256Hex(buf) {
    return crypto.subtle.digest('SHA-256', buf).then(toHex);
  }

  /* 给火山引擎 OpenAPI 生成带签名的 headers。service 如 billing，region 如 cn-beijing */
  function volcSignHeaders(cfg, service, region, host, queryString) {
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var dateStr = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate());
    var xDate = dateStr + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
    var canonicalHeaders = 'host:' + host + '\nx-date:' + xDate + '\n';
    var signedHeaders = 'host;x-date';
    var payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // 空 body
    var canonicalRequest = 'GET\n/\n' + queryString + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + payloadHash;
    var credentialScope = dateStr + '/' + region + '/' + service + '/request';
    return sha256Hex(str2ab(canonicalRequest)).then(function (canonHash) {
      var stringToSign = 'HMAC-SHA256\n' + xDate + '\n' + credentialScope + '\n' + canonHash;
      var secret = cfg.secretAccessKey;
      return hmacSha256(str2ab(secret), str2ab(dateStr))
        .then(function (kDate) { return hmacSha256(kDate, str2ab(region)); })
        .then(function (kRegion) { return hmacSha256(kRegion, str2ab(service)); })
        .then(function (kService) { return hmacSha256(kService, str2ab('request')); })
        .then(function (kSigning) { return hmacSha256(kSigning, str2ab(stringToSign)); })
        .then(function (sigBuf) {
          var signature = toHex(sigBuf);
          var auth = 'HMAC-SHA256 Credential=' + cfg.accessKeyId + '/' + credentialScope +
            ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
          return { 'Host': host, 'X-Date': xDate, 'Authorization': auth };
        });
    });
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
            if (d && fixAi(d)) return set('data', d).then(function () { return json(d); });
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
                  visionModel: AI_DEFAULT.visionModel,
                  imageModel: AI_DEFAULT.imageModel,
                  img2img: true,
                  accessKeyId: '',
                  secretAccessKey: ''
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
            return json({ error: 'AI_NETWORK', message: '连不上火山方舟：' + (e && e.message || '网络错误') }, 502);
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
              max_tokens: 1200,
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
            return json({ error: 'AI_NETWORK', message: '连不上火山方舟：' + (e && e.message || '网络错误') }, 502);
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
            size: gb.size || '1024x1536',
            response_format: 'b64_json',
            watermark: false,
            n: 1,
            seed: Math.floor(Math.random() * 1e9)
          };
          if (cfg.img2img !== false) {
            if (Array.isArray(gb.images) && gb.images.length) payload.image = gb.images;
            else if (gb.imageUrl) payload.image = gb.imageUrl;
          }
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
            return json({ error: 'AI_NETWORK', message: '连不上火山方舟：' + (e && e.message || '网络错误') }, 502);
          });
        });
      }
      if (p === '/api/ai/balance') {
        return aiConfig().then(function (cfg) {
          if (!cfg) return json({ error: 'NO_API_KEY', message: '还没填火山方舟的 API Key' }, 400);
          if (!cfg.accessKeyId || !cfg.secretAccessKey) {
            return json({ error: 'NO_AK', message: '还没填火山引擎的 Access Key（ID + Secret），只填 API Key 查不了余额' }, 400);
          }
          var service = 'billing';
          var region = 'cn-beijing';
          var host = 'billing.volcengineapi.com';
          var queryString = 'Action=QueryBalanceAcct&Version=2022-01-01';
          return volcSignHeaders(cfg, service, region, host, queryString).then(function (headers) {
            return orig('https://' + host + '/?' + queryString, {
              method: 'GET',
              headers: headers
            }).then(function (r) {
              return r.json().then(function (j) {
                if (!r.ok) {
                  var msg = (j && j.ResponseMetadata && j.ResponseMetadata.Error && j.ResponseMetadata.Error.Message) ||
                            (j && j.error && (j.error.message || j.error.code)) || ('HTTP ' + r.status);
                  return json({ error: 'BALANCE_FAIL', message: msg }, 502);
                }
                var res = j && j.Result ? j.Result : {};
                // 可用余额、现金余额、冻结金额、信控额度等
                return json({
                  ok: true,
                  available: res.AvailableCash || res.AvailableBalance || '',
                  cash: res.CashBalance || '',
                  frozen: res.FrozenAmount || '',
                  raw: res
                });
              });
            }).catch(function (e) {
              return json({ error: 'BALANCE_NETWORK', message: '连不上火山引擎：' + (e && e.message || '网络错误') }, 502);
            });
          });
        });
      }
      return json({ error: 'OFFLINE_NO_SERVER' }, 501);
    });
  };
})();
window.__shim = "yes";
