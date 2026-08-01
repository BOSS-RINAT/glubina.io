// ============================================================
//  БАЛЛЫ ПО ДНЯМ — архив (Цели / % / Вовлечение), редактирует только админ
// ============================================================

let dsParticipants = [];
let dsSettings = SEED_SETTINGS;
let dsOverrides = {}; // dateKey -> doc из dayScores
let dsIsAdmin = false;
let dsRowCache = {}; // dateKey -> { auto, lines: {goals:[], engagement:[]} }

function dsPointsWord(n) {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10, mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'баллов';
  if (mod10 === 1) return 'балл';
  if (mod10 >= 2 && mod10 <= 4) return 'балла';
  return 'баллов';
}

async function dsAllDateKeys() {
  const snap = await db.collection('events').get();
  const set = new Set();
  snap.forEach(doc => { const dk = doc.data().dateKey; if (dk) set.add(dk); });
  set.add(mskDateKey()); // сегодняшний день всегда показываем, даже без событий
  return Array.from(set).sort((a, b) => b.localeCompare(a)); // новые сверху
}

// авто-расчёт + построчная детализация (кто закрыл какую цель / вовлечение)
async function dsComputeRow(dateKey) {
  const events = await getEventsForDate(dateKey);
  const auto = await computeAutoDayScore(dateKey, dsParticipants, dsSettings);

  const goalLines = [];
  const engLines = [];
  const byParticipant = {};
  events.forEach(ev => {
    if (!ev.participantId) return;
    if (!byParticipant[ev.participantId]) byParticipant[ev.participantId] = { tasks: {}, engagementDelta: 0, name: ev.participantName };
    const b = byParticipant[ev.participantId];
    if (ev.kind === 'task') {
      if (!b.tasks[ev.taskId]) b.tasks[ev.taskId] = { netDelta: 0, lastValue: 0, qty: ev.qty, text: ev.taskText };
      b.tasks[ev.taskId].netDelta += ev.delta;
      b.tasks[ev.taskId].lastValue = ev.newValue;
      b.tasks[ev.taskId].qty = ev.qty;
      b.tasks[ev.taskId].text = ev.taskText;
    } else if (ev.kind === 'engagement') {
      b.engagementDelta += ev.delta;
    }
  });
  dsParticipants.forEach(p => {
    const b = byParticipant[p.id];
    if (!b) return;
    Object.values(b.tasks).forEach(t => {
      if (t.netDelta > 0 && t.lastValue >= t.qty) goalLines.push(`✅ ${p.name}: «${t.text}»`);
    });
    if (b.engagementDelta > 0) engLines.push(`🤝 ${p.name}: +${b.engagementDelta}`);
  });

  return { auto, goalLines, engLines };
}

function dsFieldRowHtml(dateKey, field, label, effective, isOverride, lines) {
  const value = effective[field];
  const colorClass = value > 0 ? 'stat-delta-up' : value < 0 ? 'stat-delta-down' : 'stat-delta-flat';
  const editable = dsIsAdmin ? `
    <input type="number" class="login-input ds-edit-input" style="width:80px;display:inline-block;padding:6px 8px"
      data-date="${dateKey}" data-field="${field}" value="${value}" />
    ${isOverride ? `<button class="modal-btn modal-btn-secondary ds-reset-btn" data-date="${dateKey}" data-field="${field}" style="padding:6px 10px;font-size:12px">Авто</button>` : ''}
  ` : `<span class="${colorClass}" style="font-weight:700">${value > 0 ? '+' : ''}${value}</span>`;

  return `
    <div class="task-row glass" style="align-items:center">
      <div class="task-body">
        <div class="task-title-row">
          <div class="task-title" style="cursor:default">${label}${isOverride ? ' <span class="readonly-tag">ручное</span>' : ''}</div>
          <div class="task-qty">${editable}</div>
        </div>
        ${lines && lines.length ? `<div class="task-note">${lines.join('<br>')}</div>` : ''}
      </div>
    </div>
  `;
}

async function dsRenderDay(dateKey) {
  const cacheKey = dateKey;
  const row = dsRowCache[cacheKey] || await dsComputeRow(dateKey);
  dsRowCache[cacheKey] = row;

  const override = dsOverrides[dateKey];
  const eff = effectiveDayScore(row.auto, override);
  const total = Math.round((eff.goalsPoints + eff.percentPoints + eff.engagementPoints) * 100) / 100;

  const percentLabel = `% выполнения команды: ${row.auto.startPercent}% → ${row.auto.endPercent}% (Δ ${row.auto.endPercent - row.auto.startPercent}%)`;

  return `
    <div class="glass" style="padding:16px;margin-bottom:14px">
      <div class="task-title-row" style="margin-bottom:10px">
        <div class="section-title" style="margin:0;font-size:16px">${mskDateLabel(dateKey)}</div>
        <div style="font-weight:800;font-size:16px">${total > 0 ? '+' : ''}${total} ${dsPointsWord(total)}</div>
      </div>
      ${dsFieldRowHtml(dateKey, 'goalsPoints', '🎯 Цели', eff, eff.goalsIsOverride, row.goalLines)}
      ${dsFieldRowHtml(dateKey, 'percentPoints', percentLabel, eff, eff.percentIsOverride, null)}
      ${dsFieldRowHtml(dateKey, 'engagementPoints', '🤝 Вовлечение', eff, eff.engagementIsOverride, row.engLines)}
    </div>
  `;
}

async function renderDailyScoresPage() {
  const root = document.getElementById('ds-root');
  if (!root) return;
  root.innerHTML = `<div class="loading-placeholder">Собираю архив…</div>`;

  const dateKeys = await dsAllDateKeys();
  const dayBlocks = await Promise.all(dateKeys.map(dk => dsRenderDay(dk)));

  root.innerHTML = `
    ${dsIsAdmin ? `<div class="task-note" style="margin-bottom:14px">Числа считаются автоматически из отметок задач и вовлечения. Чтобы поправить вручную — измените число в поле, чтобы вернуть автосчёт — нажмите «Авто».</div>` : ''}
    ${dayBlocks.join('')}
  `;

  if (dsIsAdmin) {
    root.querySelectorAll('.ds-edit-input').forEach(input => {
      input.addEventListener('change', async () => {
        const val = parseFloat(input.value) || 0;
        await setDayScoreOverride(input.dataset.date, input.dataset.field, val);
      });
    });
    root.querySelectorAll('.ds-reset-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await clearDayScoreOverride(btn.dataset.date, btn.dataset.field);
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthReady(user => {
    if (!user) return;
    dsIsAdmin = user.role === 'admin';
    let ready = { participants: false, settings: false };
    const tryRender = () => { if (ready.participants && ready.settings) renderDailyScoresPage(); };

    subscribeParticipants(list => { dsParticipants = list; ready.participants = true; tryRender(); });
    subscribeSettings(s => { dsSettings = s; ready.settings = true; tryRender(); });
    subscribeDayScores(map => {
      dsOverrides = map;
      if (ready.participants && ready.settings) renderDailyScoresPage();
    });
    subscribeProgress(() => {
      // прогресс изменился — сегодняшняя строка могла устареть, пересчитаем именно её
      delete dsRowCache[mskDateKey()];
      if (ready.participants && ready.settings) renderDailyScoresPage();
    });
  });
});
