// ============================================================
//  ИСТОРИЯ НАЧИСЛЕНИЯ БАЛЛОВ (живой список, не архивный лог)
// ============================================================
//
// В отличие от журнала действий (journal.html), этот список показывает
// только то, за что баллы начислены ПРЯМО СЕЙЧАС. Если задачу сняли —
// строка сама пропадёт (список пересчитывается из текущего состояния,
// а не хранится отдельно).

let phParticipants = [];
let phSettings = SEED_SETTINGS;

async function loadEventsForLookup() {
  const snap = await db.collection('events').orderBy('ts', 'asc').get();
  const list = [];
  snap.forEach(doc => list.push(doc.data()));
  return list;
}

// последнее известное значение (dateKey) для конкретной задачи/вовлечения,
// с учётом обычных событий и их отмен (undo)
function buildLastKnownIndex(events) {
  const lastTaskDate = {}; // `${pid}__${taskId}` -> dateKey последнего изменения
  const lastEngDate = {};  // pid -> dateKey последнего изменения вовлечения

  events.forEach(ev => {
    if (!ev.participantId || !ev.dateKey) return;
    if (ev.kind === 'task') {
      lastTaskDate[`${ev.participantId}__${ev.taskId}`] = ev.dateKey;
    } else if (ev.kind === 'engagement') {
      lastEngDate[ev.participantId] = ev.dateKey;
    } else if (ev.kind === 'undo') {
      if (ev.undoOf === 'task') lastTaskDate[`${ev.participantId}__${ev.taskId}`] = ev.dateKey;
      else if (ev.undoOf === 'engagement') lastEngDate[ev.participantId] = ev.dateKey;
    }
  });

  return { lastTaskDate, lastEngDate };
}

function getCount(participantId, taskId) {
  return (PH_PROGRESS[participantId]?.counts?.[taskId]) || 0;
}
function getEngagement(participantId) {
  return (PH_PROGRESS[participantId]?.engagement) || 0;
}

let PH_PROGRESS = {};

async function buildLedger() {
  const events = await loadEventsForLookup();
  const { lastTaskDate, lastEngDate } = buildLastKnownIndex(events);
  const partial = !!phSettings.allowPartialStepPoints;

  const rows = [];

  phParticipants.forEach(p => {
    p.tasks.forEach(t => {
      const count = getCount(p.id, t.id);
      const frac = Math.min(count, t.qty) / t.qty;
      const dateKey = lastTaskDate[`${p.id}__${t.id}`] || null;

      if (partial) {
        if (frac <= 0) return;
        const points = Math.round(frac * phSettings.pointsPerTask * 100) / 100;
        const label = frac >= 1
          ? `${t.text} — выполнено полностью`
          : `${t.text} — шаг ${count}/${t.qty} (${Math.round(frac * 100)}%)`;
        rows.push({ pid: p.id, name: p.name, color: p.color, icon: frac >= 1 ? '✅' : '▫️', text: label, points, dateKey });
      } else {
        if (frac < 1) return;
        rows.push({
          pid: p.id, name: p.name, color: p.color, icon: '✅',
          text: `${t.text} — выполнено`, points: phSettings.pointsPerTask, dateKey,
        });
      }
    });

    const eng = getEngagement(p.id);
    if (eng > 0) {
      const points = Math.round(eng * phSettings.pointsPerEngagement * 100) / 100;
      rows.push({
        pid: p.id, name: p.name, color: p.color, icon: '🤝',
        text: `Вовлечение: ${eng} ${engagementWord(eng)}`, points,
        dateKey: lastEngDate[p.id] || null,
      });
    }
  });

  // сортировка: сначала свежие даты, записи без даты (старые, до включения журнала) — в конец
  rows.sort((a, b) => {
    if (a.dateKey && b.dateKey) return b.dateKey.localeCompare(a.dateKey) || a.name.localeCompare(b.name, 'ru');
    if (a.dateKey) return -1;
    if (b.dateKey) return 1;
    return a.name.localeCompare(b.name, 'ru');
  });

  return rows;
}

function engagementWord(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'человек';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'человека';
  return 'человек';
}

function pointsWord(n) {
  const abs = Math.abs(n);
  const mod10 = abs % 10, mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'балл';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'балла';
  return 'баллов';
}

async function renderPointsHistory() {
  const root = document.getElementById('points-history-root');
  if (!root) return;
  root.innerHTML = `<div class="loading-placeholder">Собираю историю…</div>`;

  const rows = await buildLedger();
  const totalFromRows = Math.round(rows.reduce((s, r) => s + r.points, 0) * 100) / 100;
  const goalsBaseline = phSettings.scoreBaselineAdjustmentGoals || 0;
  const percentBaseline = phSettings.scoreBaselineAdjustmentPercent || 0;
  let percentBonus = 0;
  let percentError = null;
  try {
    const percentBonusRaw = await computeCumulativePercentBonus(phParticipants, phSettings);
    percentBonus = Math.round((percentBonusRaw + percentBaseline) * 100) / 100;
  } catch (err) {
    console.error('Не удалось посчитать %-бонус:', err);
    percentError = err.code || err.message || String(err);
  }
  const total = Math.round((totalFromRows + goalsBaseline + percentBonus) * 100) / 100;
  const count = phSettings.participantsCount || phParticipants.length || 1;
  const avg = Math.round((total / count) * 100) / 100;

  let groupedByDate = {};
  rows.forEach(r => {
    const key = r.dateKey || 'без даты';
    if (!groupedByDate[key]) groupedByDate[key] = [];
    groupedByDate[key].push(r);
  });

  root.innerHTML = `
    <div class="report-controls glass" style="margin-bottom:18px">
      <div class="hero-sub">Цели + вовлечение (по текущим отметкам): <b>${totalFromRows} ${pointsWord(totalFromRows)}</b></div>
      <div class="hero-sub">% выполнения командой (накопительно): <b>${percentBonus > 0 ? '+' : ''}${percentBonus} ${pointsWord(percentBonus)}</b></div>
      ${percentError ? `<div class="hero-sub" style="color:#D70015">⚠️ %-бонус не посчитан: ${percentError}. Проверьте правила Firestore (dayScores).</div>` : ''}
      ${goalsBaseline !== 0 ? `<div class="hero-sub">Ручная корректировка целей (настройки): <b>${goalsBaseline > 0 ? '+' : ''}${goalsBaseline}</b></div>` : ''}
      <div class="hero-sub" style="font-size:18px;font-weight:800;margin-top:6px">Итого: ${total} ${pointsWord(total)} · среднее ${avg} на игрока (÷${count})</div>
    </div>
    <div id="ph-list"></div>
  `;

  const list = document.getElementById('ph-list');
  if (!rows.length) {
    list.innerHTML = `<div class="loading-placeholder">Пока нет начисленных баллов</div>`;
    return;
  }

  const dateKeys = Object.keys(groupedByDate).sort((a, b) => {
    if (a === 'без даты') return 1;
    if (b === 'без даты') return -1;
    return b.localeCompare(a);
  });

  list.innerHTML = dateKeys.map(dk => `
    <div class="section-title" style="font-size:15px;margin:18px 4px 8px">${dk === 'без даты' ? 'Без даты (старые записи)' : mskDateLabel(dk)}</div>
    <div class="rank-list">
      ${groupedByDate[dk].map(r => `
        <div class="task-row glass" style="border-left:4px solid ${r.color}">
          <div class="task-body">
            <div class="task-title-row">
              <div class="task-title">${r.icon} <b>${r.name}</b> — ${r.text}</div>
              <div class="task-qty" style="color:${r.points >= 0 ? '#1B7F35' : '#D70015'}">${r.points > 0 ? '+' : ''}${r.points} ${pointsWord(r.points)}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthReady(user => {
    if (!user) return;
    let ready = { participants: false, settings: false, progress: false };
    const tryRender = () => { if (ready.participants && ready.settings && ready.progress) renderPointsHistory(); };

    subscribeParticipants(list => { phParticipants = list; ready.participants = true; tryRender(); });
    subscribeSettings(s => { phSettings = s; ready.settings = true; tryRender(); });
    subscribeProgress(map => { PH_PROGRESS = map; ready.progress = true; tryRender(); });
  });
});
