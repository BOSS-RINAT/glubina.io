// ============================================================
//  ЖУРНАЛ ДЕЙСТВИЙ (только для админа) — архив, кто что нажал
// ============================================================

let journalDateKey = mskDateKey();
let journalParticipants = [];

function eventDescription(ev) {
  const time = ev.ts?.toDate ? ev.ts.toDate().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  const dateShort = ev.dateKey ? ev.dateKey.split('-').slice(1).reverse().join('.') : '';
  const when = dateShort ? `${dateShort} ${time}` : time;
  const who = ev.byName || '—';
  switch (ev.kind) {
    case 'task':
      return `${when} · ${who} → ${ev.participantName}: «${ev.taskText}» ${ev.prevValue}→${ev.newValue}`;
    case 'engagement':
      return `${when} · ${who} → ${ev.participantName}: вовлечение ${ev.prevValue}→${ev.newValue}`;
    case 'edit_task':
      return `${when} · ${who} изменил(а) задачу «${ev.taskText}» у ${ev.participantName}`;
    case 'add_task':
      return `${when} · ${who} добавил(а) задачу «${ev.taskText}» у ${ev.participantName}`;
    case 'delete_task':
      return `${when} · ${who} удалил(а) задачу «${ev.taskText}» у ${ev.participantName}`;
    case 'undo':
      return `${when} · ${who} отменил(а) действие (${ev.undoOf}) у ${ev.participantName}`;
    default:
      return `${when} · ${who}: ${ev.kind}`;
  }
}

function canUndo(ev) {
  return ev.kind === 'task' || ev.kind === 'engagement';
}

// ---------- страница ----------

async function renderJournalPage() {
  const root = document.getElementById('journal-root');
  if (!root) return;

  root.innerHTML = `
    <div class="report-controls glass">
      <div class="report-controls-row">
        <label class="login-label">Дата</label>
        <input id="jr-date" type="date" class="login-input" value="${journalDateKey}" />
      </div>
      <div class="report-controls-row">
        <label class="login-label">Участник</label>
        <select id="jr-participant" class="login-input">
          <option value="">Все</option>
          ${journalParticipants.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>
    </div>

    <h2 class="section-title">Действия за день</h2>
    <div id="jr-list"></div>
  `;

  document.getElementById('jr-date').addEventListener('change', e => {
    journalDateKey = e.target.value;
    refreshJournalList();
  });
  document.getElementById('jr-participant').addEventListener('change', refreshJournalList);

  await refreshJournalList();
}

async function refreshJournalList() {
  const list = document.getElementById('jr-list');
  if (!list) return;
  list.innerHTML = `<div class="loading-placeholder">Загрузка…</div>`;

  let events = await getEventsForDate(journalDateKey);
  events = events.slice().reverse(); // новые сверху

  const filterPid = document.getElementById('jr-participant')?.value;
  if (filterPid) events = events.filter(ev => ev.participantId === filterPid);

  if (!events.length) {
    list.innerHTML = `<div class="loading-placeholder">За эту дату действий нет.</div>`;
    return;
  }

  list.innerHTML = events.map(ev => `
    <div class="task-row glass" data-eid="${ev.id}">
      <div class="task-body">
        <div class="task-title" style="cursor:default">${eventDescription(ev)}</div>
      </div>
      <div class="task-actions">
        ${canUndo(ev) ? `<button class="modal-btn modal-btn-secondary jr-undo-btn" data-eid="${ev.id}">Отменить</button>` : ''}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.jr-undo-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ev = events.find(e => e.id === btn.dataset.eid);
      if (!ev) return;
      if (!confirm('Отменить это действие? Значение будет откачено к предыдущему.')) return;
      btn.disabled = true;
      btn.textContent = 'Отменяю…';
      try {
        await undoEvent(ev);
        await refreshJournalList();
      } catch (err) {
        alert('Не удалось отменить: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Отменить';
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthReady(user => {
    if (!user) return;
    if (user.role !== 'admin') {
      const root = document.getElementById('journal-root');
      if (root) root.innerHTML = `<div class="loading-placeholder">Эта страница доступна только администратору.</div>`;
      return;
    }
    subscribeParticipants(list => { journalParticipants = list; });
    renderJournalPage();
  });
});
