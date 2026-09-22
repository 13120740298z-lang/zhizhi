/* ==================================================================================
   手绘 SVG 图表 —— 零依赖，完全可控。
   核心图表是「区间带状图」：中位数折线 + P10–P90 阴影带。
   这正是我们要传达的：每个数字都带误差棒。
   ================================================================================== */

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function fmtTime(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/* ------------------------------------------------------------------ 区间带状图 */

export function bandChart(container, opts) {
  const {
    times = [], p10 = [], p50 = [], p90 = [],
    color = '#4c8dff', fill = 'rgba(76,141,255,0.18)',
    unit = '', height = 200, yMin = null, yMax = null,
    zeroLine = false, label = '', markers = [],
  } = opts;

  container.innerHTML = '';
  const n = times.length;
  if (!n) { container.innerHTML = '<div class="muted">暂无数据</div>'; return; }

  const W = 1000, H = height;
  const pad = { l: 52, r: 16, t: 14, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const lo = yMin !== null ? yMin : Math.min(...p10);
  const hi = yMax !== null ? yMax : Math.max(...p90);
  const span = (hi - lo) || 1;
  const y0 = lo - span * 0.08;
  const y1 = hi + span * 0.08;

  const x = (i) => pad.l + (i / Math.max(n - 1, 1)) * iw;
  const y = (v) => pad.t + ih - ((v - y0) / (y1 - y0)) * ih;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', style: `height:${H}px` });

  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const v = y0 + ((y1 - y0) * t) / ticks;
    const yy = y(v);
    svg.appendChild(el('line', { x1: pad.l, y1: yy, x2: W - pad.r, y2: yy, class: 'gridline' }));
    svg.appendChild(el('text', { x: pad.l - 8, y: yy + 3.5, class: 'axis-label', 'text-anchor': 'end' },
      [v.toFixed(Math.abs(v) < 10 ? 2 : 0)]));
  }

  if (zeroLine && y0 < 0 && y1 > 0) {
    svg.appendChild(el('line', { x1: pad.l, y1: y(0), x2: W - pad.r, y2: y(0),
      stroke: 'rgba(240,77,90,.5)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
  }

  const upper = p90.map((v, i) => `${x(i)},${y(v)}`);
  const lower = p10.map((v, i) => `${x(i)},${y(v)}`).reverse();
  svg.appendChild(el('polygon', { points: [...upper, ...lower].join(' '), fill }));

  svg.appendChild(el('polyline', {
    points: p50.map((v, i) => `${x(i)},${y(v)}`).join(' '),
    class: 'series-line', stroke: color,
  }));

  const step = Math.max(1, Math.floor(n / 8));
  for (let i = 0; i < n; i += step) {
    svg.appendChild(el('text', { x: x(i), y: H - 8, class: 'axis-label', 'text-anchor': 'middle' }, [fmtTime(times[i])]));
  }

  for (const m of markers) {
    const i = m.index;
    if (i === undefined || i < 0 || i >= n) continue;
    svg.appendChild(el('line', { x1: x(i), y1: pad.t, x2: x(i), y2: pad.t + ih,
      stroke: m.color || '#f5a524', 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }));
  }

  container.appendChild(svg);

  if (label) {
    const lg = document.createElement('div');
    lg.className = 'legend';
    lg.innerHTML = `<span><i style="background:${fill};border:1px solid ${color}"></i>P10–P90 区间</span>
                    <span><i style="background:${color}"></i>中位数 P50</span>
                    <span class="muted">${label}${unit ? '（' + unit + '）' : ''}</span>`;
    container.appendChild(lg);
  }
}

/* ------------------------------------------------------------------ 动作条 + SOC */

export function actionSocChart(container, opts) {
  const { times = [], actions = [], power = [], soc = [], height = 190 } = opts;
  container.innerHTML = '';
  const n = times.length;
  if (!n) { container.innerHTML = '<div class="muted">暂无数据</div>'; return; }

  const W = 1000, H = height;
  const pad = { l: 46, r: 46, t: 12, b: 26 };
  const iw = W - pad.l - pad.r;
  const barH = 26;
  const socTop = pad.t + barH + 12;
  const socH = H - socTop - pad.b;

  const x = (i) => pad.l + (i / Math.max(n - 1, 1)) * iw;
  const ySoc = (v) => socTop + socH - v * socH;
  const maxP = Math.max(...power, 1);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', style: `height:${H}px` });

  const bw = Math.max(iw / n - 0.4, 0.8);
  actions.forEach((a, i) => {
    const color = a === 'charge' ? '#35d0a5' : a === 'discharge' ? '#f5a524' : '#232f42';
    const h = a === 'idle' ? barH * 0.28 : barH * (0.35 + 0.65 * (power[i] / maxP));
    svg.appendChild(el('rect', { x: x(i) - bw / 2, y: pad.t + barH - h, width: bw, height: h, fill: color, rx: 1 }));
  });
  svg.appendChild(el('text', { x: pad.l - 8, y: pad.t + barH - 6, class: 'axis-label', 'text-anchor': 'end' }, ['动作']));

  svg.appendChild(el('line', { x1: pad.l, y1: socTop, x2: W - pad.r, y2: socTop, class: 'gridline' }));
  const socPts = soc.map((v, i) => `${x(i)},${ySoc(v)}`);
  svg.appendChild(el('polygon', {
    points: [`${pad.l},${socTop + socH}`, ...socPts, `${x(n - 1)},${socTop + socH}`].join(' '),
    fill: 'rgba(155,125,255,0.14)',
  }));
  svg.appendChild(el('polyline', { points: socPts.join(' '), class: 'series-line', stroke: '#9b7dff' }));

  for (const v of [0, 0.5, 1]) {
    svg.appendChild(el('text', { x: pad.l - 8, y: ySoc(v) + 3.5, class: 'axis-label', 'text-anchor': 'end' }, [`${(v * 100).toFixed(0)}%`]));
  }
  svg.appendChild(el('text', { x: W - pad.r + 6, y: ySoc(1) + 4, class: 'axis-label', fill: '#9b7dff' }, ['SOC']));

  const step = Math.max(1, Math.floor(n / 8));
  for (let i = 0; i < n; i += step) {
    svg.appendChild(el('text', { x: x(i), y: H - 8, class: 'axis-label', 'text-anchor': 'middle' }, [fmtTime(times[i])]));
  }

  container.appendChild(svg);

  const lg = document.createElement('div');
  lg.className = 'legend';
  lg.innerHTML = `<span><i style="background:#35d0a5"></i>充电</span>
                  <span><i style="background:#f5a524"></i>放电</span>
                  <span><i style="background:#232f42"></i>待机</span>
                  <span><i style="background:#9b7dff"></i>SOC</span>`;
  container.appendChild(lg);
}

export { fmtTime };
