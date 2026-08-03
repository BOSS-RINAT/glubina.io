// ============================================================
//  ГРАФИКИ ДИНАМИКИ (баллы / цели / вовлечение по дням)
// ============================================================

let chartsParticipants = [];
let chartsSettings = SEED_SETTINGS;
let allEvents = null; // кэш всех событий, чтобы не перезапрашивать при смене фильтров
let chartInstances = { points: null, tasks: null, engagement: null };

const CHART_META = {
  points: { label: 'Баллы', color: '#FFBF00', metricParam: 'score' },
  tasks: { label: 'Цели (выполненные задачи)', color: '#0A84FF', metricParam: 'percent' },
  engagement: { label: 'Вовлечение', color: '#BF5AF2', metricParam: 'engagement' },
};

// состояние фильтров (в памяти страницы, не сохраняется)
let visibleCharts = { points: true, tasks: true, engagement: true };
let selectedParticipantIds = null; // null = все
let periodDays = 30; // 7 / 30 / 0(=всё)
let customFrom = null, customTo = null;

// ---------- загрузка и агрегация событий ----------

async function loadAllEventsOnce() {
  if (allEvents) return allEvents;
  const snap = await db.collection('events').orderBy('ts', 'asc').get();
  const list = [];
  snap.forEach(doc => list.push(doc.data()));
  allEvents = list;
  return list;
}

// dateKey -> participantId -> { taskDelta, engDelta }
function aggregateByDay(events) {
  const map = {};
  const bump = (dk, pid, field, amount) => {
    if (!map[dk]) map[dk] = {};
    if (!map[dk][pid]) map[dk][pid] = { taskDelta: 0, engDelta: 0 };
    map[dk][pid][field] += amount;
  };

  events.forEach(ev => {
    if (!ev.participantId || !ev.dateKey) return;
    if (ev.kind === 'engagement') {
      bump(ev.dateKey, ev.participantId, 'engDelta', ev.delta || 0);
    } else if (ev.kind === 'undo' && ev.undoOf === 'engagement') {
      bump(ev.dateKey, ev.participantId, 'engDelta', (ev.newValue - ev.prevValue));
    }
  });

  // события должны быть в хронологическом порядке (обеспечивается orderBy
  // в loadAllEventsOnce) — replayTaskDoneTransitions отслеживает РЕАЛЬНОЕ
  // состояние по каждой задаче, поэтому одно и то же изменение, отменённое
  // и через профиль участника, и через журнал администратора, не
  // засчитывается дважды.
  replayTaskDoneTransitions(events, (ev, wasDone, isDone) => {
    bump(ev.dateKey, ev.participantId, 'taskDelta', isDone ? 1 : -1);
  }, chartsParticipants);

  return map;
}

// строит кумулятивные ряды по всей истории (без учёта фильтра периода —
// он применяется позже, при отрисовке, чтобы точка на начало окна была верной)
function buildCumulativeSeries() {
  const byDay = aggregateByDay(allEvents);
  const dateKeys = Object.keys(byDay).sort();
  const running = {};
  chartsParticipants.forEach(p => running[p.id] = { task: 0, eng: 0 });

  const series = {}; // participantId -> { dates:[], tasks:[], engagement:[], points:[] }
  chartsParticipants.forEach(p => series[p.id] = { dates: [], tasks: [], engagement: [], points: [] });

  dateKeys.forEach(dk => {
    chartsParticipants.forEach(p => {
      const d = (byDay[dk] && byDay[dk][p.id]) || { taskDelta: 0, engDelta: 0 };
      running[p.id].task += d.taskDelta;
      running[p.id].eng += d.engDelta;
      const pts = running[p.id].task * (chartsSettings.pointsPerTask || 0)
        + running[p.id].eng * (chartsSettings.pointsPerEngagement || 0);
      series[p.id].dates.push(dk);
      series[p.id].tasks.push(running[p.id].task);
      series[p.id].engagement.push(running[p.id].eng);
      series[p.id].points.push(pts);
    });
  });

  return { dateKeys, series };
}

// ---------- фильтр периода ----------

function periodRange() {
  if (periodDays === 0) {
    if (customFrom && customTo) return { from: customFrom, to: customTo };
    return null; // всё время
  }
  const to = mskDateKey();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - periodDays + 1);
  const from = mskDateKey(fromDate);
  return { from, to };
}

function filterDateKeys(dateKeys) {
  const range = periodRange();
  if (!range) return dateKeys;
  return dateKeys.filter(dk => dk >= range.from && dk <= range.to);
}

// ---------- рендер ----------

function participantColor(pid) {
  const p = chartsParticipants.find(p => p.id === pid);
  return p ? p.color : '#999';
}

function buildDatasets(dateKeys, series, field) {
  const ids = selectedParticipantIds || chartsParticipants.map(p => p.id);
  return ids.map(pid => {
    const s = series[pid];
    if (!s) return null;
    const p = chartsParticipants.find(p => p.id === pid);
    // сопоставляем полный ряд с отфильтрованными датами (значение = кумулятивное на эту дату,
    // либо последнее известное значение до начала окна, если в окне для даты нет точки)
    const fullDates = s.dates;
    const data = dateKeys.map(dk => {
      let idx = -1;
      for (let i = 0; i < fullDates.length; i++) { if (fullDates[i] <= dk) idx = i; else break; }
      return idx >= 0 ? s[field][idx] : 0;
    });
    return {
      label: p ? p.name : pid,
      data,
      borderColor: p ? p.color : '#999',
      backgroundColor: p ? p.color : '#999',
      tension: 0.25,
      pointRadius: 3,
      borderWidth: 2,
    };
  }).filter(Boolean);
}

function renderChart(key, dateKeys, series) {
  const canvas = document.getElementById(`chart-${key}`);
  if (!canvas) return;
  if (chartInstances[key]) { chartInstances[key].destroy(); chartInstances[key] = null; }
  if (!visibleCharts[key]) return;

  const labels = dateKeys.map(mskDateLabel);
  const datasets = buildDatasets(dateKeys, series, key === 'points' ? 'points' : key);

  chartInstances[key] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { ticks: { maxRotation: 0, autoSkip: true, font: { size: 10 } } },
      },
    },
  });
}

async function refreshCharts() {
  await loadAllEventsOnce();
  const { dateKeys: fullDateKeys, series } = buildCumulativeSeries();
  const dateKeys = filterDateKeys(fullDateKeys);

  if (!dateKeys.length) {
    Object.keys(CHART_META).forEach(key => {
      const wrap = document.getElementById(`chart-wrap-${key}`);
      if (wrap) wrap.querySelector('.chart-empty').style.display = visibleCharts[key] ? 'block' : 'none';
      const canvas = document.getElementById(`chart-${key}`);
      if (canvas) canvas.style.display = 'none';
    });
    return;
  }

  Object.keys(CHART_META).forEach(key => {
    const wrap = document.getElementById(`chart-wrap-${key}`);
    if (!wrap) return;
    wrap.querySelector('.chart-empty').style.display = 'none';
    const canvas = document.getElementById(`chart-${key}`);
    if (canvas) canvas.style.display = visibleCharts[key] ? 'block' : 'none';
    renderChart(key, dateKeys, series);
  });
}

// ---------- UI ----------

function renderChartsPage() {
  const root = document.getElementById('charts-root');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const focusMetric = params.get('metric'); // score | percent | engagement
  if (focusMetric) {
    const map = { score: 'points', percent: 'tasks', engagement: 'engagement' };
    const only = map[focusMetric];
    if (only) visibleCharts = { points: only === 'points', tasks: only === 'tasks', engagement: only === 'engagement' };
  }

  root.innerHTML = `
    <div class="report-controls glass">
      <div class="chart-toggle-row">
        ${Object.entries(CHART_META).map(([key, meta]) => `
          <label class="chart-toggle">
            <input type="checkbox" data-chart="${key}" ${visibleCharts[key] ? 'checked' : ''} />
            <span class="chart-toggle-dot" style="background:${meta.color}"></span>
            ${meta.label}
          </label>
        `).join('')}
        <button id="charts-toggle-all" class="modal-btn modal-btn-secondary">Показать все / скрыть все</button>
      </div>

      <div class="chart-toggle-row" style="margin-top:12px">
        <button class="period-btn" data-days="7">7 дней</button>
        <button class="period-btn" data-days="30">30 дней</button>
        <button class="period-btn" data-days="0">Всё время</button>
        <input type="date" id="period-from" class="login-input period-date" />
        <span style="align-self:center;color:var(--text-secondary)">—</span>
        <input type="date" id="period-to" class="login-input period-date" />
      </div>

      <div class="chart-toggle-row" id="participant-filter" style="margin-top:12px"></div>
    </div>

    ${Object.entries(CHART_META).map(([key, meta]) => `
      <div class="chart-card glass" id="chart-wrap-${key}">
        <div class="section-title" style="margin:0 0 10px">${meta.label}</div>
        <div class="chart-canvas-wrap"><canvas id="chart-${key}"></canvas></div>
        <div class="loading-placeholder chart-empty" style="display:none">Пока нет данных за выбранный период</div>
      </div>
    `).join('')}

    <div class="task-note" style="text-align:center;margin-top:8px">
      График строится по журналу отметок. Баллы за задачу/вовлечение считаются по текущим настройкам сайта.
    </div>
  `;

  // переключатели графиков
  root.querySelectorAll('input[data-chart]').forEach(cb => {
    cb.addEventListener('change', () => {
      visibleCharts[cb.dataset.chart] = cb.checked;
      refreshCharts();
    });
  });
  document.getElementById('charts-toggle-all').addEventListener('click', () => {
    const anyOn = Object.values(visibleCharts).some(Boolean);
    Object.keys(visibleCharts).forEach(k => visibleCharts[k] = !anyOn);
    root.querySelectorAll('input[data-chart]').forEach(cb => cb.checked = visibleCharts[cb.dataset.chart]);
    refreshCharts();
  });

  // период
  root.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      periodDays = parseInt(btn.dataset.days, 10);
      customFrom = null; customTo = null;
      document.getElementById('period-from').value = '';
      document.getElementById('period-to').value = '';
      root.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b === btn));
      refreshCharts();
    });
  });
  root.querySelector(`.period-btn[data-days="${periodDays}"]`)?.classList.add('active');

  const applyCustomRange = () => {
    const from = document.getElementById('period-from').value;
    const to = document.getElementById('period-to').value;
    if (from && to) {
      customFrom = from; customTo = to; periodDays = 0;
      root.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      refreshCharts();
    }
  };
  document.getElementById('period-from').addEventListener('change', applyCustomRange);
  document.getElementById('period-to').addEventListener('change', applyCustomRange);

  // фильтр участников
  const pf = document.getElementById('participant-filter');
  pf.innerHTML = chartsParticipants.map(p => `
    <label class="chart-toggle">
      <input type="checkbox" data-pid="${p.id}" checked />
      <span class="chart-toggle-dot" style="background:${p.color}"></span>
      ${p.name}
    </label>
  `).join('') + `<button id="participants-toggle-all" class="modal-btn modal-btn-secondary">Все / никого</button>`;

  pf.querySelectorAll('input[data-pid]').forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = Array.from(pf.querySelectorAll('input[data-pid]:checked')).map(c => c.dataset.pid);
      selectedParticipantIds = checked.length ? checked : [];
      refreshCharts();
    });
  });
  document.getElementById('participants-toggle-all').addEventListener('click', () => {
    const boxes = pf.querySelectorAll('input[data-pid]');
    const anyOn = Array.from(boxes).some(b => b.checked);
    boxes.forEach(b => b.checked = !anyOn);
    selectedParticipantIds = anyOn ? [] : chartsParticipants.map(p => p.id);
    refreshCharts();
  });

  refreshCharts();
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthReady(user => {
    if (!user) return;
    subscribeParticipants(list => {
      chartsParticipants = list;
      if (document.getElementById('chart-wrap-points')) refreshCharts();
    });
    subscribeSettings(s => { chartsSettings = s; });
    renderChartsPage();
  });
});
