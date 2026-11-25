// ==UserScript==
// @name         编织台 · 售后申诉助手
// @namespace    knitstudio
// @version      0.1.0
// @description  拼多多商家后台售后申诉辅助：识别退货原因、生成申诉话术、自动填充，提交前停住等你确认
// @author       knitstudio
// @match        https://mms.pinduoduo.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return;

  var PANEL_ID = 'kt-appeal-panel';

  /* ---------- 话术模板 ---------- */
  function buildText(info) {
    var reason = info.reason || '';
    var order = info.orderNo || '';
    var goods = info.goods || '';
    var head = '订单号：' + (order || '（见本页）') + (goods ? '，商品：' + goods : '') + '。';

    if (/负向|体验/.test(reason)) {
      return head + '该订单买家反馈的体验问题与商品实际情况不符：商品按平台规则如实描述，尺码、面料、颜色均与详情页一致，发货前已逐件质检并留存实拍凭证。买家未提供有效问题凭证，恳请平台核实后撤销本次体验补偿判定。';
    }
    if (/质量/.test(reason)) {
      return head + '买家选择"质量问题"但未上传任何有效凭证。该批次商品发货前已逐件质检，商品材质、做工、尺码均符合详情页描述，不存在质量问题。若买家主张质量问题，应提供能证明商品本身缺陷的照片或视频。恳请平台核实凭证情况，驳回该笔质量问题退款或改判为其他原因，运费由责任方承担。';
    }
    if (/运费|邮费/.test(reason)) {
      return head + '本单退货责任不在商家：商品无质量问题，买家退货原因为个人原因（不喜欢/尺码不合适等），按平台规则退回运费不应由商家承担。恳请平台重新判定运费责任，退还已扣除的运费。';
    }
    return head + '本单申诉理由：商家已按平台规则如实发货且商品无质量问题，买家主张与事实不符，恳请平台核实并支持商家申诉。';
  }

  /* ---------- 页面读取 ---------- */
  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  }

  function textOf(el) {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function scanReason() {
    var body = textOf(document.body);
    var m = body.match(/(退款原因|退货原因|售后原因|申请原因)[：:\s]*([^\s，。;；]{2,20})/);
    if (m) return m[2];
    var keys = ['质量问题', '材质不符', '做工粗糙', '尺寸不符', '不喜欢', '效果不好', '未按约定', '少件漏发', '发错货'];
    for (var i = 0; i < keys.length; i++) {
      if (body.indexOf(keys[i]) > -1) return keys[i];
    }
    return '';
  }

  function scanOrderNo() {
    var body = textOf(document.body);
    var all = body.match(/\d{12,20}/g) || [];
    return all.length ? all[0] : '';
  }

  function scanGoods() {
    var t = document.title || '';
    var h = document.querySelector('h1, .goods-name, [class*="goodsName"]');
    return h ? textOf(h).slice(0, 40) : t.slice(0, 40);
  }

  function scanActions() {
    var out = [];
    var els = document.querySelectorAll('button, a, span, div[role="button"]');
    for (var i = 0; i < els.length && out.length < 60; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      var t = textOf(el);
      if (!t || t.length > 14) continue;
      if (/申诉|维权|处罚|负向|体验|运费|举证|上传凭证/.test(t)) {
        out.push({ tag: el.tagName.toLowerCase(), text: t, cls: String(el.className).slice(0, 60) });
      }
    }
    return out;
  }

  function scanFields() {
    var out = [];
    var els = document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
    for (var i = 0; i < els.length && out.length < 30; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      var ph = el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || '';
      out.push({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        placeholder: ph.slice(0, 50),
        cls: String(el.className).slice(0, 60)
      });
    }
    return out;
  }

  /* ---------- 填充 ---------- */
  function fillTextarea(text) {
    var els = document.querySelectorAll('textarea, [contenteditable="true"]');
    var target = null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      var ph = (el.getAttribute('placeholder') || '').toString();
      if (/申诉|说明|理由|描述|备注/.test(ph)) { target = el; break; }
      if (!target) target = el;
    }
    if (!target) return '没找到输入框，请手动点一下申诉说明框再试';

    var value = text;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      var proto = target.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(target, value);
    } else {
      target.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, value);
    }
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return '已填入申诉说明，请检查后手动点提交';
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  /* ---------- 界面 ---------- */
  function boot() {
    if (document.getElementById(PANEL_ID)) return;

    var box = document.createElement('div');
    box.id = PANEL_ID;
    box.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:90px', 'width:320px', 'max-height:70vh',
      'background:#fff', 'border:1px solid #e3e6ea', 'border-radius:12px',
      'box-shadow:0 8px 28px rgba(16,24,40,.16)', 'z-index:2147483000',
      'font:13px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif',
      'color:#14171a', 'display:none', 'flex-direction:column', 'overflow:hidden'
    ].join(';');

    box.innerHTML = [
      '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #eef0f3">',
      '  <b style="flex:1;font-size:13px">申诉助手</b>',
      '  <span id="kt-close" style="cursor:pointer;color:#8b929c;padding:0 4px">✕</span>',
      '</div>',
      '<div style="padding:10px 12px;display:flex;flex-wrap:wrap;gap:6px">',
      '  <button id="kt-scan" style="padding:6px 10px;border:1px solid #e3e6ea;background:#fff;border-radius:7px;font-size:12px">诊断本页</button>',
      '  <button id="kt-gen" style="padding:6px 10px;border:1px solid #e3e6ea;background:#fff;border-radius:7px;font-size:12px">生成话术</button>',
      '  <button id="kt-fill" style="padding:6px 10px;border:0;background:#1a1d21;color:#fff;border-radius:7px;font-size:12px">填入申诉框</button>',
      '  <button id="kt-copy" style="padding:6px 10px;border:1px solid #e3e6ea;background:#fff;border-radius:7px;font-size:12px">复制</button>',
      '</div>',
      '<div id="kt-out" style="padding:0 12px 12px;font-size:12px;color:#374151;white-space:pre-wrap;overflow:auto;max-height:46vh"></div>'
    ].join('');

    document.body.appendChild(box);

    var tab = document.createElement('div');
    tab.textContent = '申诉助手';
    tab.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:40px', 'z-index:2147483000',
      'background:#1a1d21', 'color:#fff', 'padding:9px 14px', 'border-radius:20px',
      'font:13px -apple-system,"PingFang SC",sans-serif', 'cursor:pointer',
      'box-shadow:0 6px 18px rgba(16,24,40,.24)'
    ].join(';');
    document.body.appendChild(tab);

    var out = box.querySelector('#kt-out');
    var lastText = '';

    tab.addEventListener('click', function () {
      box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
    });
    box.querySelector('#kt-close').addEventListener('click', function () {
      box.style.display = 'none';
    });

    function info() {
      return { orderNo: scanOrderNo(), reason: scanReason(), goods: scanGoods() };
    }

    box.querySelector('#kt-scan').addEventListener('click', function () {
      var i = info();
      var data = {
        url: location.href,
        orderNo: i.orderNo,
        reason: i.reason,
        goods: i.goods,
        actions: scanActions(),
        fields: scanFields()
      };
      lastText = JSON.stringify(data, null, 2);
      out.textContent = '已诊断，点「复制」发给我\n\n' + lastText.slice(0, 900);
    });

    box.querySelector('#kt-gen').addEventListener('click', function () {
      lastText = buildText(info());
      out.textContent = lastText;
    });

    box.querySelector('#kt-fill').addEventListener('click', function () {
      var msg = fillTextarea(lastText || buildText(info()));
      out.textContent = msg;
    });

    box.querySelector('#kt-copy').addEventListener('click', function () {
      if (!lastText) lastText = buildText(info());
      copy(lastText);
      out.textContent = '已复制到剪贴板';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
