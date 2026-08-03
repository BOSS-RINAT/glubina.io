// ============================================================
//  ОТЧЁТ ДНЯ (для копирования в чат) — только для админа
// ============================================================

let reportParticipants = [];
let reportSettings = SEED_SETTINGS;
let reportDayScoreOverrides = {};
let selectedDateKey = mskDateKey();

function pointsWord(n) {
  const abs = Math.abs(n);
  const mod10 = abs % 10, mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'баллов';
  if (mod10 === 1) return 'балл';
  if (mod10 >= 2 && mod10 <= 4) return 'балла';
  return 'баллов';
}

async function buildReportText() {
  const events = await getEventsForDate(selectedDateKey);

  // группировка по участнику -> вовлечению (цели считаются отдельно, ниже,
  // через replayTaskDoneTransitions — это защищает от двойного счёта, если
  // одно и то же изменение отменили и через профиль, и через журнал)
  const byParticipant = {};
  events.forEach(ev => {
    if (!ev.participantId) return;
    if (!byParticipant[ev.participantId]) byParticipant[ev.participantId] = { engagementDelta: 0, name: ev.participantName };
    const bucket = byParticipant[ev.participantId];
    if (ev.kind === 'engagement') {
      bucket.engagementDelta += ev.delta;
    } else if (ev.kind === 'undo' && ev.undoOf === 'engagement') {
      bucket.engagementDelta += (ev.newValue - ev.prevValue);
    }
  });

  let goalsPoints = 0;
  let engagementPoints = 0;
  const nameById = {};
  reportParticipants.forEach(p => nameById[p.id] = p.name);

  // финальная строка на задачу за день (перезаписывается, если задачу
  // за день несколько раз закрывали/отменяли — показываем только итог)
  const finalGoalLine = {}; // `${pid}__${taskId}` -> текст строки
  replayTaskDoneTransitions(events, (ev, wasDone, isDone) => {
    const key = `${ev.participantId}__${ev.taskId}`;
    if (isDone) {
      const name = ev.participantName || nameById[ev.participantId] || '';
      const pts = reportSettings.pointsPerTask;
      finalGoalLine[key] = { pid: ev.participantId, text: `✅ ${name} ${ev.taskText} — ${pts} ${pointsWord(pts)}` };
    } else {
      delete finalGoalLine[key];
    }
  }, reportParticipants);
  goalsPoints = Object.keys(finalGoalLine).length * reportSettings.pointsPerTask;

  const lines = [];
  // сохраняем порядок участников как на дашборде
  reportParticipants.forEach(p => {
    const bucket = byParticipant[p.id];
    const personLines = Object.values(finalGoalLine).filter(l => l.pid === p.id).map(l => l.text);

    if (bucket && bucket.engagementDelta > 0) {
      const pts = bucket.engagementDelta * reportSettings.pointsPerEngagement;
      engagementPoints += pts;
      personLines.push(`🤝 ${p.name} Вовлечение: ${bucket.engagementDelta} человек — ${pts} ${pointsWord(pts)}`);
    }

    lines.push(...personLines);
  });

  // % выполнения задач командой за день (старт → сейчас), 1% = pointsPerPercent баллов
  const auto = await computeAutoDayScore(selectedDateKey, reportParticipants, reportSettings);
  const override = reportDayScoreOverrides[selectedDateKey];
  const eff = effectiveDayScore(auto, override);

  const percentLine = `📈 % выполнения задач командой: ${auto.startPercent}% → ${auto.endPercent}% (Δ ${auto.endPercent - auto.startPercent}%) — ${eff.percentPoints} ${pointsWord(eff.percentPoints)}${eff.percentIsOverride ? ' (ручное значение)' : ''}`;

  const finalGoals = eff.goalsIsOverride ? eff.goalsPoints : goalsPoints;
  const finalEngagement = eff.engagementIsOverride ? eff.engagementPoints : engagementPoints;
  const total = Math.round((finalGoals + eff.percentPoints + finalEngagement) * 100) / 100;

  const avg = Math.round((total / (reportSettings.participantsCount || 1)) * 100) / 100;
  const dateLabel = mskDateLabel(selectedDateKey);
  const title = (reportSettings.reportTitleTemplate || 'Отчёт по турниру "{tournament}"').replace('{tournament}', reportSettings.tournamentName || '');

  const parts = [
    title,
    `${reportSettings.reportAuthorName || ''} ${dateLabel}`.trim(),
    `Роль на сегодня: ${reportSettings.roleToday || '—'}`,
    'Отчёт:',
    lines.length ? lines.join('\n') : '(пока нет закрытых целей за этот день)',
    percentLine,
    '',
    `Цели: ${finalGoals}${eff.goalsIsOverride ? ' (ручное значение)' : ''} + % выполнения: ${eff.percentPoints} + Вовлечение: ${finalEngagement}${eff.engagementIsOverride ? ' (ручное значение)' : ''}`,
    `Итого баллов за день команды: ${total} ${pointsWord(total)}.`,
    `Средний балл: ${avg} ${pointsWord(Math.round(avg))} (÷${reportSettings.participantsCount})`,
  ];

  return parts.join('\n');
}

async function renderReportPage() {
  const root = document.getElementById('report-root');
  if (!root) return;

  root.innerHTML = `
    <div class="report-controls glass">
      <div class="report-controls-row">
        <label class="login-label">Дата отчёта</label>
        <input id="report-date" type="date" class="login-input" value="${selectedDateKey}" />
      </div>
      <div class="report-controls-row">
        <label class="login-label">Роль на сегодня</label>
        <input id="report-role" class="login-input" value="${reportSettings.roleToday || ''}" placeholder="например: Суетолог" />
      </div>
      <button id="report-refresh" class="modal-btn modal-btn-primary">Обновить отчёт</button>
    </div>
    <h2 class="section-title">Готовый текст</h2>
    <textarea id="report-text" class="report-textarea glass" readonly></textarea>
    <button id="report-copy" class="add-task-btn">📋 Скопировать</button>
    <div id="report-copy-msg" class="report-copy-msg"></div>
  `;

  document.getElementById('report-date').addEventListener('change', async e => {
    selectedDateKey = e.target.value;
    await refreshReportText();
  });

  document.getElementById('report-role').addEventListener('change', async e => {
    await updateSettings({ roleToday: e.target.value });
  });

  document.getElementById('report-refresh').addEventListener('click', refreshReportText);
  document.getElementById('report-copy').addEventListener('click', () => {
    const ta = document.getElementById('report-text');
    ta.select();
    navigator.clipboard.writeText(ta.value).then(() => {
      const msg = document.getElementById('report-copy-msg');
      msg.textContent = 'Скопировано ✓';
      setTimeout(() => msg.textContent = '', 2000);
    });
  });

  await refreshReportText();
}

async function refreshReportText() {
  const ta = document.getElementById('report-text');
  if (ta) ta.value = 'Собираю отчёт…';
  const text = await buildReportText();
  if (ta) ta.value = text;
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthReady(user => {
    if (!user) return;
    if (user.role !== 'admin') {
      const root = document.getElementById('report-root');
      if (root) root.innerHTML = `<div class="loading-placeholder">Эта страница доступна только администратору.</div>`;
      return;
    }
    subscribeParticipants(list => {
      reportParticipants = list;
      if (document.getElementById('report-text')) refreshReportText();
    });
    subscribeSettings(s => {
      reportSettings = s;
      const roleInput = document.getElementById('report-role');
      if (roleInput && document.activeElement !== roleInput) roleInput.value = s.roleToday || '';
    });
    subscribeDayScores(map => {
      reportDayScoreOverrides = map;
      if (document.getElementById('report-text')) refreshReportText();
    });
    subscribeProgress(() => {
      // прогресс изменился где-то ещё (например, участник отметил задачу) —
      // если сейчас открыт отчёт за сегодня, пересчитываем его вживую
      if (selectedDateKey === mskDateKey() && document.getElementById('report-text')) refreshReportText();
    });
    renderReportPage();
  });
});
