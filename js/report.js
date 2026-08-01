// ============================================================
//  ОТЧЁТ ДНЯ (для копирования в чат) — только для админа
// ============================================================

let reportParticipants = [];
let reportSettings = SEED_SETTINGS;
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

  // группировка по участнику -> задаче / вовлечению
  const byParticipant = {};
  events.forEach(ev => {
    if (!ev.participantId) return;
    if (!byParticipant[ev.participantId]) byParticipant[ev.participantId] = { tasks: {}, engagementDelta: 0, name: ev.participantName };
    const bucket = byParticipant[ev.participantId];
    if (ev.kind === 'task') {
      if (!bucket.tasks[ev.taskId]) bucket.tasks[ev.taskId] = { netDelta: 0, lastValue: 0, qty: ev.qty, text: ev.taskText };
      bucket.tasks[ev.taskId].netDelta += ev.delta;
      bucket.tasks[ev.taskId].lastValue = ev.newValue;
      bucket.tasks[ev.taskId].qty = ev.qty;
      bucket.tasks[ev.taskId].text = ev.taskText;
    } else if (ev.kind === 'engagement') {
      bucket.engagementDelta += ev.delta;
    }
  });

  let total = 0;
  const lines = [];

  // сохраняем порядок участников как на дашборде
  reportParticipants.forEach(p => {
    const bucket = byParticipant[p.id];
    if (!bucket) return;
    const personLines = [];

    Object.values(bucket.tasks).forEach(t => {
      if (t.netDelta === 0) return; // отметили и сняли — не показываем
      const isDone = t.lastValue >= t.qty;
      if (isDone && t.netDelta > 0) {
        const pts = reportSettings.pointsPerTask;
        total += pts;
        personLines.push(`✅ ${p.name} ${t.text} — ${pts} ${pointsWord(pts)}`);
      } else if (t.netDelta > 0) {
        personLines.push(`▫️ ${p.name} Шаг +${t.netDelta} (${t.text}) — ${t.lastValue}/${t.qty}`);
      }
      // netDelta < 0 (сняли прогресс, но не до нуля от начала дня) — не отражаем в отчёте
    });

    if (bucket.engagementDelta > 0) {
      const pts = bucket.engagementDelta * reportSettings.pointsPerEngagement;
      total += pts;
      personLines.push(`🤝 ${p.name} Вовлечение: ${bucket.engagementDelta} человек — ${pts} ${pointsWord(pts)}`);
    }

    lines.push(...personLines);
  });

  const avg = Math.round((total / (reportSettings.participantsCount || 1)) * 100) / 100;
  const dateLabel = mskDateLabel(selectedDateKey);
  const title = (reportSettings.reportTitleTemplate || 'Отчёт по турниру "{tournament}"').replace('{tournament}', reportSettings.tournamentName || '');

  const parts = [
    title,
    `${reportSettings.reportAuthorName || ''} ${dateLabel}`.trim(),
    `Роль на сегодня: ${reportSettings.roleToday || '—'}`,
    'Отчёт:',
    lines.length ? lines.join('\n') : '(пока нет изменений за этот день)',
    '',
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
    subscribeParticipants(list => { reportParticipants = list; });
    subscribeSettings(s => {
      reportSettings = s;
      const roleInput = document.getElementById('report-role');
      if (roleInput && document.activeElement !== roleInput) roleInput.value = s.roleToday || '';
    });
    renderReportPage();
  });
});
