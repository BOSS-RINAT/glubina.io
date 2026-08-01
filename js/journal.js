// ============================================================
//  ЖУРНАЛ ДЕЙСТВИЙ (только для админа)
// ============================================================

let journalDateKey = mskDateKey();
let journalParticipants = [];
let journalProgress = {};

function eventDescription(ev) {
  const time = ev.ts?.toDate ? ev.ts.toDate().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  const who = ev.byName || '—';
  switch (ev.kind) {
    case 'task':
      return `${time} · ${who} → ${ev.participantName}: «${ev.taskText}» ${ev.prevValue}→${ev.newValue}`;
    case 'engagement':
      return `${time} · ${who} → ${ev.participantName}: вовлечение ${ev.prevValue}→${ev.newValue}`;
    case 'edit_task':
      return `${time} · ${who} изменил(а) задачу «${ev.taskText}» у ${ev.participantName}`;
    case 'add_task':
      return `${time} · ${who} добавил(а) задачу «${ev.taskText}» у ${ev.participantName}`;
    case 'delete_task':
      return `${time} · ${who} удалил(а) задачу «${ev.taskText}» у ${ev.participantName}`;
    case 'undo':
      return `${time} · ${who} отменил(а) действие (${ev.undoOf}) у ${ev.participantName}`;
    default:
      return `${time} · ${who}: ${ev.kind}`;
  }
}

function canUndo(ev) {
  return ev.kind === 'task' || ev.kind === 'engagement';
}

// ---------- дедлайны: локальные копии дата-хелперов (без зависимости от app.js) ----------

function jrParseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function jrDaysLeft(deadlineStr, refDateKey) {
  const deadline = jrParseDate(deadlineStr);
  const ref = jrParseDate(refDateKey);
  return Math.round((deadline - ref) / 86400000);
}

function burningTasksHtml(refDateKey) {
  const rows = [];
  journalParticipants.forEach(p => {
    (p.tasks || []).forEach(t => {
      if (!t.deadline) return;
      const done = ((journalProgress[p.id]?.counts?.[t.id]) || 0) >= t.qty;
      if (done) return;
      const dl = jrDaysLeft(t.deadline, refDateKey);
      if (dl <= 5) {
        rows.push({ p, t, dl });
      }
    });
  });
  rows.sort((a, b) => a.dl - b.dl);
  if (!rows.length) return `<div class="loading-placeholder">На эту дату горящих дедлайнов нет 🎉</div>`;
  return rows.map(r => `
    <div class="task-row glass status-border-${r.dl < 0 ? 'overdue' : 'soon'}">
      <div class="task-body">
        <div class="task-title" style="cursor:default">${r.p.name}: «${r.t.text}»</div>
        <div class="chip status-chip ${r.dl < 0 ? 'status-overdue' : 'status-soon'}">
          ${r.dl < 0 ? `Просрочено на ${Math.abs(r.dl)} дн.` : r.dl === 0 ? 'Срок сегодня' : `Осталось ${r.dl} дн.`}
        </div>
      </div>
    </div>
  `).join('');
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

    <h2 class="section-title">🔥 Горящие дедлайны на эту дату</h2>
    <div id="jr-burning">${burningTasksHtml(journalDateKey)}</div>

    <h2 class="section-title">Действия за день</h2>
    <div id="jr-list"></div>
  `;

  document.getElementById('jr-date').addEventListener('change', e => {
    journalDateKey = e.target.value;
    document.getElementById('jr-burning').innerHTML = burningTasksHtml(journalDateKey);
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
    subscribeParticipants(list => {
      journalParticipants = list;
      const box = document.getElementById('jr-burning');
      if (box) box.innerHTML = burningTasksHtml(journalDateKey);
    });
    subscribeProgress(map => {
      journalProgress = map;
      const box = document.getElementById('jr-burning');
      if (box) box.innerHTML = burningTasksHtml(journalDateKey);
    });
    renderJournalPage();
  });
});
