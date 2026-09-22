/* =====================================================================================
   知止 · 静态快照适配层

   这个文件让「完整系统」的**原版前端**在没有后端的情况下也能跑起来：
   把真实运行时捕获的 API 响应喂给同一份 app.js，不改动任何业务代码。

   为什么要这样做：
       完整系统是 FastAPI + 求解器的形态，公开托管需要一台常驻的 Python 服务。
       为了让链接能长期、零成本、任何人可看，我们把一次**真实运行**的全部 API
       响应冻结下来，在这里做一层 fetch / WebSocket 适配。

   诚实的边界（页面上也会写明）：
       · 展示的数据全部来自真实运行的求解器输出，不是示意数据；
       · 但它是**快照** —— 点击「推进」「注入事件」这类会改变状态的按钮不会产生新计算；
       · 需要真正交互时，按页面上的说明在本地把服务跑起来。
   ===================================================================================== */

import DATA from './static-api.js';

const PRESETS = Object.keys(DATA).filter((k) => k.includes('::'));

/** 把请求归一化成快照里的键。 */
function keyFor(url, opts) {
  const raw = typeof url === 'string' ? url : (url && url.url) || '';
  const path = raw.replace(/^https?:\/\/[^/]+/, '');

  // 带 body 的 POST：键里带上关键参数，才能区分同一端点的不同输入
  if (opts && opts.body) {
    try {
      const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
      if (body && body.text) return `${path.split('?')[0]}::${body.text}`;
    } catch { /* body 不是 JSON，退回按路径匹配 */ }
  }
  return path;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/* ---------------------------------------------------------------- fetch */

const realFetch = window.fetch.bind(window);

window.fetch = async (url, opts) => {
  const key = keyFor(url, opts);

  if (key in DATA) return jsonResponse(DATA[key]);

  // 同一路径的任意输入：退回该路径的默认快照（例如诊断卡片换一句话问）
  const base = key.split('::')[0];
  if (base in DATA) return jsonResponse(DATA[base]);

  // 会改变状态的端点：静态快照无法计算，明确告知而不是假装成功
  const mutating = ['/api/event', '/api/advance', '/api/ledger/tamper-demo'];
  if (mutating.some((m) => base.startsWith(m))) {
    return jsonResponse({
      detail: '这是静态快照：改变系统状态的操作需要真实后端。请按页脚说明在本地启动服务。',
      static_snapshot: true,
    }, 200);
  }

  // 其余未知请求交给原 fetch（静态资源等）
  try {
    return await realFetch(url, opts);
  } catch {
    return jsonResponse({ detail: `静态快照中没有 ${key}`, static_snapshot: true }, 200);
  }
};

/* ------------------------------------------------------------ WebSocket */

const Snapshot = DATA['/api/snapshot'];

class StaticWebSocket {
  constructor() {
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen({});
      if (this.onmessage && Snapshot) {
        this.onmessage({ data: JSON.stringify(Snapshot) });
      }
    }, 30);
  }
  send() { /* 静态快照不需要回应 ping */ }
  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose({});
  }
  addEventListener(type, fn) { this[`on${type}`] = fn; }
  removeEventListener() {}
}

StaticWebSocket.CONNECTING = 0;
StaticWebSocket.OPEN = 1;
StaticWebSocket.CLOSING = 2;
StaticWebSocket.CLOSED = 3;
window.WebSocket = StaticWebSocket;

/* ---------------------------------------------------------------- 提示条 */

window.__ZHIZHI_STATIC__ = { keys: Object.keys(DATA), presets: PRESETS };
