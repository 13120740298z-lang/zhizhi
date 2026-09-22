/* ==================================================================================
   知止 · 前端应用（零构建，ES module）
   ================================================================================== */

import { actionSocChart, bandChart } from './charts.js';

const $ = (id) => document.getElementById(id);
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const num = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));

const LEVEL_NAMES = { 0: '只读', 1: '建议', 2: '例外审批', 3: '全托管' };

let ws = null;
let lastScenario = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/** 把替代方案的 cost 字典渲染成人话，而不是把裸 JSON 丢给用户。 */
const COST_LABELS = {
  capacity_kwh: (v) => `需要容量 ${num(v, 1)} kWh`,
  relative_cost: (v) => `成本约 ${num(v, 1)} 倍`,
  grid_import_kwh: (v) => `电网取电 ${num(v, 2)} kWh`,
  saved_kwh: (v) => `少买 ${num(v, 2)} kWh`,
  cost: (v) => `电费约 ${num(v, 2)} 元`,
};

function fmtCost(cost) {
  if (!cost || typeof cost !== 'object') return '';
  return Object.entries(cost)
    .map(([k, v]) => (COST_LABELS[k] ? COST_LABELS[k](v) : `${k}: ${v}`))
    .join('　·　');
}

/* ------------------------------------------------------------------ 连接 */

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    $('conn-dot').className = 'dot';
    $('conn-text').textContent = '实时连接';
  };
  ws.onclose = () => {
    $('conn-dot').className = 'dot off';
    $('conn-text').textContent = '连接断开，重连中…';
    setTimeout(connect, 2000);
  };
  ws.onerror = () => { $('conn-dot').className = 'dot off'; };
  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.pong) return;
    renderSnapshot(data);
  };
}

/* ------------------------------------------------------------------ 快照渲染 */

function renderSnapshot(d) {
  const lvl = d.level ?? 3;
  $('level-badge').textContent = `L${lvl}`;
  $('level-badge').className = `level-badge L${lvl}`;
  $('level-name').textContent = LEVEL_NAMES[lvl] || '';
  $('level-sub').textContent = `${d.level_label || ''} · ${d.now ? d.now.slice(11, 19) : ''}`;

  const conf = d.confidence || {};
  const overall = conf.overall ?? 0;
  $('conf-overall').textContent = pct(overall);
  const fill = $('conf-bar-fill');
  fill.style.width = `${overall * 100}%`;
  fill.style.background = overall > 0.72 ? 'var(--accent)' : overall > 0.55 ? 'var(--info)'
    : overall > 0.35 ? 'var(--warn)' : 'var(--danger)';

  for (const key of ['forecast', 'data', 'decision']) {
    const v = conf[key] ?? 0;
    $(`conf-${key}`).textContent = pct(v);
    const bar = $(`bar-${key}`);
    bar.style.width = `${v * 100}%`;
    bar.style.background = v > 0.7 ? 'var(--accent)' : v > 0.45 ? 'var(--warn)' : 'var(--danger)';
  }
  $('explain-box').innerHTML = conf.explain || '—';

  const b = d.boundary || {};
  $('boundary-promises').innerHTML = (b.promises || []).map((p) => `<li>${escapeHtml(p)}</li>`).join('') || '<li>—</li>';
  $('boundary-refusals').innerHTML = (b.refusals || []).map((p) => `<li>${escapeHtml(p)}</li>`).join('') || '<li>—</li>';

  const dev = d.device || {};
  $('device-name').textContent = dev.name || '—';
  $('m-soc').innerHTML = `${pct(dev.soc)}<span class="u">${num(dev.soc_kwh, 2)} kWh</span>`;
  $('m-pv').innerHTML = `${num(dev.pv_power_w, 0)}<span class="u">W</span>`;
  $('m-load').innerHTML = `${num(dev.load_power_w, 0)}<span class="u">W</span>`;
  $('m-mode').textContent = dev.mode || '—';
  $('m-scope').textContent = dev.stale ? '本地实测（数据陈旧）' : '本地实测（非云端聚合）';

  const act = d.last_action;
  $('m-action').textContent = act
    ? `${act.action}${act.power_w ? ' ' + Math.round(act.power_w) + 'W' : ''}${act.accepted === false ? '（未执行）' : ''}`
    : '—';

  const p = d.plan || {};
  $('m-cost').innerHTML = `${num(p.cost_p50)}<span class="u">元</span>`;
  $('m-cost-band').textContent = `区间 ${num(p.cost_p10)} – ${num(p.cost_p90)} 元`;
  $('m-mode-plan').textContent = p.planning_mode === 'p10' ? 'p10（悲观分位保底）' : 'p50（期望优化）';
  $('m-solver').textContent = `${p.solver || '—'} / ${num(p.solve_seconds, 2)}s`;
  $('m-peak').textContent = `${num(p.peak_import_kwh)} kWh`;
  $('m-cycles').textContent = `${num(p.throughput_kwh)} kWh`;

  const f = d.forecast || {};
  if (f.pv_kwh) $('f-pv').textContent = `${num(f.pv_kwh.p50)} kWh（${num(f.pv_kwh.p10)}–${num(f.pv_kwh.p90)}）`;
  $('f-load').textContent = `${num(f.load_kwh)} kWh`;
  $('f-price').textContent = `${num(f.price_mean, 3)} 元/度`;
  $('f-priceunc').textContent = num(f.price_uncertainty, 3);
  $('f-pvunc').textContent = num(f.pv_uncertainty, 3);

  const c = d.counters || {};
  $('c-loops').textContent = `${c.fast_loops ?? 0} / ${c.slow_loops ?? 0}`;
  $('c-writes').textContent = `${c.writes ?? 0}`;
  $('c-rejects').textContent = `${c.rejects ?? 0}`;
  $('c-levels').textContent = `${c.downgrades ?? 0} / ${c.upgrades ?? 0}`;
  $('c-emergency').textContent = `${c.emergency_raises ?? 0}`;

  $('alert-list').innerHTML = (d.alerts || []).slice().reverse()
    .map((a) => `<div class="row">${escapeHtml(a)}</div>`).join('') || '<div class="row muted">暂无事件</div>';

  const sc = d.scenario || {};
  $('demo-scenario').textContent = JSON.stringify(sc);

  const scKey = JSON.stringify(sc);
  if (scKey !== lastScenario) { lastScenario = scKey; loadSeries(); }
  $('clock').textContent = d.now ? d.now.slice(11, 19) : '--:--:--';
}

/* ------------------------------------------------------------------ 图表 */

async function loadSeries() {
  try {
    const res = await fetch('/api/series');
    if (!res.ok) return;
    const d = await res.json();

    bandChart($('chart-price'), {
      times: d.times, p10: d.price.p10, p50: d.price.p50, p90: d.price.p90,
      color: '#9b7dff', fill: 'rgba(155,125,255,0.18)', unit: '元/度',
      height: 190, zeroLine: true, label: '电价',
    });
    bandChart($('chart-pv'), {
      times: d.times, p10: d.pv.p10, p50: d.pv.p50, p90: d.pv.p90,
      color: '#f5a524', fill: 'rgba(245,165,36,0.16)', unit: 'W', height: 170, yMin: 0, label: '光伏',
    });
    bandChart($('chart-load'), {
      times: d.times, p10: d.load.p10, p50: d.load.p50, p90: d.load.p90,
      color: '#4c8dff', fill: 'rgba(76,141,255,0.16)', unit: 'W', height: 170, yMin: 0, label: '负荷',
    });
    actionSocChart($('chart-plan'), {
      times: d.times, actions: d.action, power: d.power_w, soc: d.soc_end, height: 200,
    });

    $('reason-list').innerHTML = d.reason.slice(0, 96).map((r, i) =>
      `<div class="row">${d.times[i] ? d.times[i].slice(5, 16).replace('T', ' ') : ''} · ${escapeHtml(r)}</div>`
    ).join('') || '<div class="row muted">暂无</div>';
  } catch (e) {
    console.warn('加载时序失败', e);
  }
}

/* ------------------------------------------------------------------ Tab */

document.querySelectorAll('nav.tabs button').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    $(`view-${btn.dataset.view}`).classList.add('active');
    if (btn.dataset.view === 'dash') loadSeries();
    if (btn.dataset.view === 'audit') loadLedger();
    if (btn.dataset.view === 'about') loadDeviceSupport();
  };
});

/* ------------------------------------------------------------------ 审计 */

async function loadLedger() {
  const res = await fetch('/api/ledger?limit=60');
  const d = await res.json();
  const rows = d.level_changes.slice().reverse();
  $('level-changes').innerHTML = rows.length
    ? rows.map((c) => `
      <div class="row">
        <b>L${c.from_level} → L${c.to_level}</b>
        <span class="muted">（${c.source}）</span>
        ${escapeHtml(c.reason)}
        <div class="chain">置信度 预测${pct(c.confidence.forecast)} / 数据${pct(c.confidence.data)} / 决策${pct(c.confidence.decision)}
        · <span class="hash">${c.hash.slice(0, 16)}…</span> ← ${c.prev_hash.slice(0, 12)}…</div>
      </div>`).join('')
    : '<div class="row muted">暂无等级变更（系统一直很确定）</div>';
  $('chain-total').textContent = `${d.counts.level_changes} / ${d.counts.records}`;
}

$('verify-btn').onclick = async () => {
  const res = await fetch('/api/ledger/verify', { method: 'POST' });
  const d = await res.json();
  $('chain-level').innerHTML = d.level_chain.ok
    ? `<span class="badge ok">完整 · ${d.level_chain.total} 条</span>`
    : `<span class="badge bad">断裂于第 ${d.level_chain.broken_at} 条</span>`;
  $('chain-record').innerHTML = d.record_chain.ok
    ? `<span class="badge ok">完整 · ${d.record_chain.total} 条</span>`
    : `<span class="badge bad">断裂于第 ${d.record_chain.broken_at} 条</span>`;
};

$('tamper-btn').onclick = async () => {
  const res = await fetch('/api/ledger/tamper-demo', { method: 'POST' });
  const d = await res.json();
  $('chain-level').innerHTML = d.detected
    ? `<span class="badge bad">检测到篡改：第 ${d.tampered_index} 条被改写（${escapeHtml(d.detail.reason || '')}）</span>`
    : '<span class="badge warn">未检测到（异常）</span>';
  setTimeout(() => $('verify-btn').click(), 2500);
};

/* ------------------------------------------------------------------ 诊断 */

async function runDiagnose(text) {
  const box = $('diag-result');
  box.innerHTML = '<div class="card"><span class="spinner"></span> 求解并诊断中（需要多次 MILP 求解）…</div>';
  try {
    const res = await fetch('/api/diagnose', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const d = await res.json();
    if (!res.ok) {
      box.innerHTML = `<div class="card"><span class="badge bad">${escapeHtml(d.detail || '诊断失败')}</span></div>`;
      return;
    }
    if (d.satisfiable) {
      box.innerHTML = `<div class="diag-card ok"><div class="diag-title">✅ 目标可达</div>
        <div class="diag-narr">${escapeHtml(d.narrative)}</div></div>`;
      return;
    }
    const alts = (d.alternatives || []).map((a) => `
      <div class="alt">
        <div class="name">${escapeHtml(a.name)}</div>
        <div class="desc">${escapeHtml(a.description)}</div>
        <div class="cost">${escapeHtml(fmtCost(a.cost))}</div>
      </div>`).join('');
    box.innerHTML = `
      <div class="diag-card">
        <div class="diag-title">❌ 做不到</div>
        <div class="diag-conflict">冲突集：${escapeHtml((d.conflicts?.constraints || []).join('  ∩  '))}</div>
        ${d.window ? `<div class="diag-window">评估窗口：${escapeHtml(d.window)}</div>` : ''}
        <div class="diag-narr">${escapeHtml(d.conflicts?.explanation || '')}</div>
        <h3>替代路径</h3>${alts}
      </div>`;
  } catch (e) {
    box.innerHTML = `<div class="card"><span class="badge bad">${escapeHtml(String(e))}</span></div>`;
  }
}

$('diag-run').onclick = () => runDiagnose($('diag-input').value);
document.querySelectorAll('[data-diag]').forEach((b) => {
  b.onclick = () => { $('diag-input').value = b.dataset.diag; runDiagnose(b.dataset.diag); };
});

/* ------------------------------------------------------------------ 验证 */

$('calib-btn').onclick = async () => {
  const box = $('calib-result');
  box.innerHTML = '<span class="spinner"></span> 跑多轮滚动校准研究…';
  const res = await fetch('/api/calibration?rounds=8');
  const d = await res.json();
  const names = { pv: '光伏', load: '负荷', price: '电价' };
  box.innerHTML = `
    <table class="tbl">
      <tr><th>预测源</th><th class="num">校准前覆盖率</th><th class="num">校准后覆盖率</th><th class="num">锐度</th><th class="num">区间分数</th></tr>
      ${['pv', 'load', 'price'].map((k) => `<tr><td class="name">${names[k]}</td>
        <td class="num">${num(d.raw[k].coverage_80, 3)}</td>
        <td class="num">${num(d.calibrated[k].coverage_80, 3)}</td>
        <td class="num">${num(d.calibrated[k].sharpness_median, 3)}</td>
        <td class="num">${num(d.calibrated[k].interval_score, 3)}</td></tr>`).join('')}
    </table>
    <div class="muted mt12">${escapeHtml(d.notes)}</div>`;
};

$('baseline-btn').onclick = async () => {
  const box = $('baseline-result');
  box.innerHTML = '<span class="spinner"></span> 跑三场景 × 三策略对照…';
  const res = await fetch('/api/baseline');
  const d = await res.json();
  box.innerHTML = Object.entries(d.scenarios).map(([name, data]) => `
    <h3 class="mt16">${escapeHtml(name)}</h3>
    <table class="tbl">
      <tr><th>策略</th><th class="num">乐观世界电费</th><th class="num">峰段取电</th><th class="num">跨天命中率</th><th class="num">悲观世界电费</th><th class="num">备电违约</th></tr>
      ${data.rows.map((r) => `<tr><td class="name">${escapeHtml(r.strategy)}</td>
        <td class="num">${num(r.cost_p50)}</td><td class="num">${num(r.peak_import_kwh)}</td>
        <td class="num">${num(r.cross_day_hit_rate)}</td><td class="num">${num(r.pessimistic_cost)}</td>
        <td class="num">${r.reserve_violations}</td></tr>`).join('')}
    </table>`).join('');
};

/* ------------------------------------------------------------------ 演示 */

document.querySelectorAll('[data-act]').forEach((b) => {
  b.onclick = async () => {
    const box = $('demo-console');
    box.textContent = `运行幕 ${b.dataset.act} 中…（含多次 MILP 求解，约 5–10 秒）`;
    const res = await fetch(`/api/demo/${b.dataset.act}`, { method: 'POST' });
    const d = await res.json();
    box.textContent = `${d.title}\n结果：${d.passed ? '✅ 通过' : '❌ 未通过'}\n\n`
      + d.steps.map((s) => `[${s.elapsed_s.toFixed(2)}s] ${s.label}\n    ${s.narration || ''}`).join('\n')
      + `\n\n证据：\n${JSON.stringify(d.evidence, null, 2)}`;
  };
});

document.querySelectorAll('[data-event]').forEach((b) => {
  b.onclick = async () => {
    await fetch('/api/event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: b.dataset.event, payload: {} }),
    });
  };
});

$('advance-15').onclick = () => advance(15);
$('advance-60').onclick = () => advance(60);
async function advance(minutes) {
  await fetch('/api/advance', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minutes }),
  });
}

$('goal-btn').onclick = async () => {
  const box = $('goal-result');
  box.textContent = '编译中…';
  const res = await fetch('/api/goal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: $('goal-input').value }),
  });
  const d = await res.json();
  box.textContent = `${d.narrative}\n\n来源：${d.source}（llm = 大模型，rules = 规则降级路径）\n编译出的约束：\n${JSON.stringify(d.constraints, null, 2)}`;
};

/* ------------------------------------------------------------------ 关于 */

async function loadDeviceSupport() {
  if ($('device-support').dataset.loaded) return;
  const res = await fetch('/api/device/support');
  const d = await res.json();
  $('device-support').innerHTML = `
    <div class="kv"><span class="k">Modbus 轮询</span><span class="v">${d.scan_interval_s}s</span></div>
    <div class="kv"><span class="k">写入步长 / 最小动作</span><span class="v">${d.write_step_w}W / ${d.min_action_w}W</span></div>
    <div class="mt12"><b>支持机型</b></div>
    <div class="muted">${d.supported.map(escapeHtml).join('<br>')}</div>
    <div class="mt12"><b class="badge bad">不支持（选型需避开）</b></div>
    <div class="muted">${d.unsupported.map(escapeHtml).join('<br>')}</div>`;
  $('device-support').dataset.loaded = '1';
}

$('modbus-btn').onclick = async () => {
  const box = $('modbus-result');
  box.textContent = '生成中…';
  const res = await fetch('/api/modbus/dry-run');
  const d = await res.json();
  box.textContent = `适配器：${d.adapter}\n\n${JSON.stringify(d.report, null, 2)}\n\n${d.note}`;
};

/* ------------------------------------------------------------------ 启动 */

connect();
loadSeries();
setInterval(loadSeries, 30000);
