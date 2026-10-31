/* 本地存储版：把原来的服务器接口改为浏览器本地存储（IndexedDB） */
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
  var orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var p = url.indexOf(location.origin) === 0 ? url.slice(location.origin.length) : url;
    p = p.split('?')[0].replace(/^\/[^/]+\//, '/');
    if (p.indexOf('/api/') !== 0) return orig(input, init);
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    return Promise.resolve().then(function () {
      if (p === '/api/health') return json({ ok: true });
      if (p === '/api/session') return json({ authed: true, needsSetup: false });
      if (p === '/api/login' || p === '/api/logout') return json({ ok: true, authed: true });
      if (p === '/api/data') {
        if (method === 'GET') {
          return get('data').then(function (d) {
            return json(d || { rev: 0, shops: [], products: [], daily: {}, materials: [], settings: {} });
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
      return json({ error: 'OFFLINE_NO_SERVER' }, 501);
    });
  };
})();
