// ============================================================
//  ЛОГИКА ПРИЛОЖЕНИЯ
// ============================================================
//
// Хранилище данных работает в двух режимах:
//  1. FIREBASE — если в js/firebase-config.js указана настоящая
//     конфигурация проекта: данные хранятся в Firestore, все участники
//     видят изменения друг друга в реальном времени (без перезагрузки).
//  2. ЛОКАЛЬНЫЙ — если конфигурация не заполнена (заглушка): данные
//     хранятся в localStorage только на этом устройстве, как раньше.
//     Сайт полностью работоспособен и без Firebase.

const LOCAL_STORAGE_KEY = 'mm_progress_v1';

const FIREBASE_ENABLED =
  typeof firebaseConfig !== 'undefined' &&
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'YOUR_API_KEY';

let STATE = {};
let stateLoaded = false;
let firestoreDocRef = null;

function loadLocalState() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveLocalState(state) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
}

// Вызывается один раз при загрузке страницы.
// onReady вызывается сразу после первой загрузки данных,
// а затем — при каждом изменении (в том числе от других участников).
function initState(onReady) {
  if (FIREBASE_ENABLED) {
    try {
      firebase.initializeApp(firebaseConfig);
      const db = firebase.firestore();
      firestoreDocRef = db.collection('mastermind').doc('progress');
      firestoreDocRef.onSnapshot(
        snap => {
          STATE = snap.data() || {};
          stateLoaded = true;
          setSyncStatus('online');
          onReady();
        },
        err => {
          console.error('Firestore недоступен, переключаюсь на локальный режим:', err);
          STATE = loadLocalState();
          stateLoaded = true;
          setSyncStatus('error');
          onReady();
        }
      );
    } catch (e) {
      console.error('Ошибка инициализации Firebase:', e);
      STATE = loadLocalState();
      stateLoaded = true;
      setSyncStatus('error');
      onReady();
    }
  } else {
    STATE = loadLocalState();
    stateLoaded = true;
    setSyncStatus('local');
    onReady();
  }
}

// Записывает одно поле в хранилище (Firestore или localStorage)
// и оптимистично обновляет локальную копию, чтобы интерфейс
// откликался мгновенно, не дожидаясь ответа сервера.
function persistField(key, value) {
  STATE[key] = value;
  if (FIREBASE_ENABLED && firestoreDocRef) {
    firestoreDocRef.set({ [key]: value }, { merge: true }).catch(err => {
      console.error('Не удалось сохранить в Firestore:', err);
    });
  } else {
    saveLocalState(STATE);
  }
}

function setSyncStatus(mode) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  if (mode === 'online') {
    el.className = 'sync-status sync-online';
    el.innerHTML = '🟢 Синхронизировано со всеми участниками';
  } else if (mode === 'error') {
    el.className = 'sync-status sync-error';
    el.innerHTML = '⚠️ Firebase недоступен — работаем локально на этом устройстве';
  } else {
    el.className = 'sync-status sync-local';
    el.innerHTML = '💻 Локальный режим (виден только на этом устройстве) — <a href="README.md" target="_blank">как включить общий доступ</a>';
  }
}

// ---------- задачи ----------

function getCount(taskId) {
  return STATE[taskId] || 0;
}

function setCount(taskId, value, qty) {
  const clamped = Math.max(0, Math.min(qty, value));
  persistField(taskId, clamped);
}

function taskFraction(task) {
  const count = getCount(task.id);
  return Math.min(count, task.qty) / task.qty;
}

function isTaskDone(task) {
  return getCount(task.id) >= task.qty;
}

// ---------- вовлечение ----------

function engagementKey(participantId) {
  return `eng__${participantId}`;
}

function getEngagement(participantId) {
  return STATE[engagementKey(participantId)] || 0;
}

function setEngagement(participantId, value) {
  const clamped = Math.max(0, value);
  persistField(engagementKey(participantId), clamped);
}

// ---------- даты ----------

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayMidnight() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function daysLeft(deadlineStr) {
  if (!deadlineStr) return null;
  const deadline = parseDate(deadlineStr);
  const today = todayMidnight();
  return Math.round((deadline - today) / 86400000);
}

function formatDate(deadlineStr) {
  const d = parseDate(deadlineStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}

function deadlineStatus(task) {
  if (isTaskDone(task)) return 'done';
  if (!task.deadline) return 'none';
  const dl = daysLeft(task.deadline);
  if (dl < 0) return 'overdue';
  if (dl <= 5) return 'soon';
  return 'ok';
}

// ---------- статистика участника ----------

function participantStats(participant) {
  let fractionSum = 0;
  let overdue = 0;
  let soon = 0;
  let doneCount = 0;

  participant.tasks.forEach(task => {
    const frac = taskFraction(task);
    fractionSum += frac;
    if (frac >= 1) doneCount++;
    const status = deadlineStatus(task);
    if (status === 'overdue') overdue++;
    if (status === 'soon') soon++;
  });

  const total = participant.tasks.length;
  const percent = total ? Math.round((fractionSum / total) * 100) : 0;

  const engagement = getEngagement(participant.id);
  const engagementMin = participant.engagementMin || 0;
  const engagementMet = engagement >= engagementMin;

  const score = doneCount * POINTS_PER_TASK + engagement * POINTS_PER_ENGAGEMENT;

  return {
    percent, total, doneCount, overdue, soon, fractionSum,
    engagement, engagementMin, engagementMet, score
  };
}

function rankedParticipants() {
  const withStats = PARTICIPANTS.map(p => ({ p, s: participantStats(p) }));
  withStats.sort((a, b) => {
    if (b.s.score !== a.s.score) return b.s.score - a.s.score;
    if (b.s.percent !== a.s.percent) return b.s.percent - a.s.percent;
    return a.p.name.localeCompare(b.p.name, 'ru');
  });
  return withStats.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

function groupStats() {
  let fractionSum = 0;
  let totalTasks = 0;
  let overdue = 0;
  let soon = 0;
  let totalScore = 0;
  let totalEngagement = 0;
  let totalEngagementMin = 0;

  PARTICIPANTS.forEach(p => {
    const s = participantStats(p);
    fractionSum += s.fractionSum;
    totalTasks += s.total;
    overdue += s.overdue;
    soon += s.soon;
    totalScore += s.score;
    totalEngagement += s.engagement;
    totalEngagementMin += (p.engagementMin || 0);
  });

  const percent = totalTasks ? Math.round((fractionSum / totalTasks) * 100) : 0;
  const engagementPercent = totalEngagementMin
    ? Math.round((totalEngagement / totalEngagementMin) * 100)
    : 0;

  return { percent, totalTasks, overdue, soon, totalScore, totalEngagement, totalEngagementMin, engagementPercent };
}

function initials(name) {
  return name.trim()[0].toUpperCase();
}

function medalFor(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

// ============================================================
//  ПРОГРЕСС-КОЛЬЦО (SVG)
// ============================================================

function ringSVG(percent, size = 120, stroke = 10, color = '#0A84FF') {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c - (clamped / 100) * c;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ring">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="rgba(120,120,128,0.16)" stroke-width="${stroke}" fill="none"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"
        transform="rotate(-90 ${size/2} ${size/2})" class="ring-progress"/>
    </svg>`;
}

// ============================================================
//  СТРАНИЦА: ДАШБОРД (index.html)
// ============================================================

function taskFlagsHtml(s) {
  // overdue -> красный, иначе зелёный "всё в графике".
  // жёлтый добавляется отдельно и независимо, если есть задачи с дедлайном < 5 дней.
  let html = '';
  if (s.overdue > 0) {
    html += `<span class="chip chip-red">🔴 просрочено: ${s.overdue}</span>`;
  } else {
    html += `<span class="chip chip-green">✅ всё в графике</span>`;
  }
  if (s.soon > 0) {
    html += `<span class="chip chip-yellow">🟡 скоро дедлайн: ${s.soon}</span>`;
  }
  return html;
}

function renderDashboard() {
  const root = document.getElementById('dashboard-root');
  if (!root) return;

  const gStats = groupStats();
  const ranked = rankedParticipants();

  root.innerHTML = `
    <div class="stats-row">
      <section class="stat-card glass">
        <div class="stat-card-text">
          <div class="hero-label">Прогресс группы</div>
          <div class="stat-value">${gStats.percent}%</div>
          <div class="hero-sub">${gStats.totalTasks} задач · ${PARTICIPANTS.length} участников</div>
        </div>
        <div class="stat-card-ring">
          ${ringSVG(gStats.percent, 84, 8, '#0A84FF')}
          <div class="ring-center-label ring-center-label-sm">${gStats.percent}%</div>
        </div>
      </section>

      <section class="stat-card glass">
        <div class="stat-card-text">
          <div class="hero-label">Вовлечение группы</div>
          <div class="stat-value">${gStats.totalEngagement}<span class="stat-value-of">/${gStats.totalEngagementMin}</span></div>
          <div class="hero-sub">минимум по группе</div>
        </div>
        <div class="stat-card-ring">
          ${ringSVG(gStats.engagementPercent, 84, 8, '#BF5AF2')}
          <div class="ring-center-label ring-center-label-sm">${Math.min(gStats.engagementPercent,100)}%${gStats.engagementPercent > 100 ? '+' : ''}</div>
        </div>
      </section>

      <section class="stat-card glass stat-card-score">
        <div class="stat-card-text">
          <div class="hero-label">Суммарный балл группы</div>
          <div class="stat-value">${gStats.totalScore}</div>
          <div class="hero-sub">2 балла / задача · 3 балла / вовлечение</div>
        </div>
        <div class="stat-card-icon">🏆</div>
      </section>
    </div>

    <div class="group-alerts group-alerts-top">
      ${gStats.overdue ? `<span class="chip chip-red">🔴 просрочено: ${gStats.overdue}</span>` : `<span class="chip chip-green">✅ всё в графике</span>`}
      ${gStats.soon ? `<span class="chip chip-yellow">🟡 скоро дедлайн: ${gStats.soon}</span>` : ''}
    </div>

    <h2 class="section-title">Рейтинг участников</h2>
    <div class="rank-list" id="rank-list"></div>
  `;

  const list = document.getElementById('rank-list');
  list.innerHTML = '';
  ranked.forEach(({ p, s, rank }) => {
    const medal = medalFor(rank);
    const card = document.createElement('a');
    card.href = `participant.html?id=${p.id}`;
    card.className = `rank-card glass ${rank <= 3 ? `rank-card-top rank-card-top-${rank}` : ''}`;
    card.style.setProperty('--accent', p.color);
    card.innerHTML = `
      <div class="rank-badge ${rank <= 3 ? 'rank-badge-medal' : ''}">${medal ? medal : rank}</div>
      <div class="avatar" style="background:${p.color}">${initials(p.name)}</div>
      <div class="rank-card-main">
        <div class="rank-card-top-row">
          <div class="rank-card-name">${p.name}</div>
          <div class="rank-card-score">🏆 ${s.score} баллов</div>
        </div>
        <div class="rank-card-progress-row">
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${s.percent}%; background:${p.color}"></div>
          </div>
          <div class="rank-card-percent">${s.percent}%</div>
        </div>
        <div class="rank-card-bottom-row">
          <span class="rank-card-tasks">${s.doneCount}/${s.total} задач</span>
          <span class="engagement-tag ${s.engagementMet ? 'engagement-met' : 'engagement-low'}">🤝 ${s.engagement}/${s.engagementMin}</span>
          ${s.overdue ? `<span class="chip chip-red">🔴 ${s.overdue}</span>` : ''}
          ${s.soon ? `<span class="chip chip-yellow">🟡 ${s.soon}</span>` : ''}
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

// ============================================================
//  СТРАНИЦА: УЧАСТНИК (participant.html)
// ============================================================

function getParticipantFromURL() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  return PARTICIPANTS.find(p => p.id === id) || PARTICIPANTS[0];
}

function renderParticipantPage() {
  const root = document.getElementById('participant-root');
  if (!root) return;

  const participant = getParticipantFromURL();
  document.title = `${participant.name} — задачи`;

  renderParticipantHeader(participant);
  renderEngagementSection(participant);
  renderTaskList(participant);

  const switcher = document.getElementById('participant-switcher');
  if (switcher) {
    switcher.innerHTML = PARTICIPANTS.map(p => `
      <a href="participant.html?id=${p.id}"
         class="switch-pill ${p.id === participant.id ? 'active' : ''}"
         style="${p.id === participant.id ? `background:${p.color};border-color:${p.color}` : ''}">
        ${p.name}
      </a>
    `).join('');
  }
}

function renderParticipantHeader(participant) {
  const header = document.getElementById('participant-header');
  const s = participantStats(participant);
  const ranked = rankedParticipants();
  const myRank = ranked.find(r => r.p.id === participant.id).rank;
  const medal = medalFor(myRank);

  header.innerHTML = `
    <div class="hero-card glass participant-hero">
      <div class="hero-left">
        <div class="avatar avatar-lg" style="background:${participant.color}">${initials(participant.name)}</div>
        <div>
          <div class="hero-label">Участник ${medal ? medal : `· место ${myRank}`}</div>
          <div class="participant-name">${participant.name}</div>
          <div class="hero-sub">${s.doneCount}/${s.total} задач завершено · 🏆 ${s.score} баллов</div>
          <div class="group-alerts">
            ${taskFlagsHtml(s)}
          </div>
        </div>
      </div>
      <div class="hero-right">
        ${ringSVG(s.percent, 140, 12, participant.color)}
        <div class="ring-center-label">${s.percent}%</div>
      </div>
    </div>
  `;
}

function renderEngagementSection(participant) {
  const container = document.getElementById('engagement-section');
  if (!container) return;

  const s = participantStats(participant);

  container.innerHTML = `
    <h2 class="section-title">Вовлечение <span class="section-title-sub">(отдельно от задач · без максимума)</span></h2>
    <div class="task-row glass engagement-row ${s.engagementMet ? 'status-border-done' : 'status-border-soon'}">
      <div class="task-check-wrap">
        <button class="stepper-btn minus" id="eng-minus" ${s.engagement <= 0 ? 'disabled' : ''} aria-label="минус">−</button>
      </div>
      <div class="task-body">
        <div class="task-title-row">
          <div class="task-title">Вовлечённые люди</div>
          <div class="task-qty">${s.engagement} / мин. ${s.engagementMin}</div>
        </div>
        <div class="progress-bar-track small">
          <div class="progress-bar-fill" style="width:${Math.min(100, s.engagementMin ? (s.engagement/s.engagementMin)*100 : 100)}%; background:${participant.color}"></div>
        </div>
        <div class="chip status-chip ${s.engagementMet ? 'status-done' : 'status-soon'}">
          ${s.engagementMet ? `✅ планка выполнена (+${Math.max(0, s.engagement - s.engagementMin)} сверх)` : `Нужно ещё: ${s.engagementMin - s.engagement}`}
        </div>
        <div class="task-note">3 балла за каждого вовлечённого человека · максимума нет</div>
      </div>
      <div class="task-actions">
        <button class="stepper-btn plus" id="eng-plus" aria-label="плюс">+</button>
      </div>
    </div>
  `;

  document.getElementById('eng-minus').addEventListener('click', () => {
    setEngagement(participant.id, getEngagement(participant.id) - 1);
    rerenderCurrent();
  });
  document.getElementById('eng-plus').addEventListener('click', () => {
    setEngagement(participant.id, getEngagement(participant.id) + 1);
    rerenderCurrent();
  });
}

function statusMeta(status, task) {
  switch (status) {
    case 'done':
      return { label: 'Готово', cls: 'status-done' };
    case 'overdue':
      return { label: `Просрочено (${formatDate(task.deadline)})`, cls: 'status-overdue' };
    case 'soon': {
      const dl = daysLeft(task.deadline);
      const dayWord = dl === 0 ? 'сегодня' : dl === 1 ? 'завтра' : `${dl} дн.`;
      return { label: `Срок: ${dayWord} (${formatDate(task.deadline)})`, cls: 'status-soon' };
    }
    case 'ok':
      return { label: `До ${formatDate(task.deadline)}`, cls: 'status-ok' };
    default:
      return { label: 'Без срока', cls: 'status-none' };
  }
}

function renderTaskList(participant) {
  const list = document.getElementById('task-list');
  list.innerHTML = '';

  participant.tasks.forEach(task => {
    const row = document.createElement('div');
    row.id = `task-${task.id}`;
    row.className = 'task-row glass';
    updateTaskRow(row, task, participant);
    list.appendChild(row);
  });
}

function updateTaskRow(row, task, participant) {
  const count = getCount(task.id);
  const status = deadlineStatus(task);
  const meta = statusMeta(status, task);
  const frac = taskFraction(task);
  const done = frac >= 1;

  row.className = `task-row glass status-border-${status}`;

  const isMulti = task.qty > 1;

  row.innerHTML = `
    <div class="task-check-wrap">
      ${isMulti ? `
        <button class="stepper-btn minus" ${count <= 0 ? 'disabled' : ''} aria-label="минус">−</button>
      ` : `
        <button class="checkbox ${done ? 'checked' : ''}" aria-label="выполнено">
          ${done ? '✓' : ''}
        </button>
      `}
    </div>
    <div class="task-body">
      <div class="task-title-row">
        <div class="task-title ${done ? 'task-title-done' : ''}">${task.text}</div>
        ${isMulti ? `<div class="task-qty">${count}/${task.qty}</div>` : ''}
      </div>
      ${task.note ? `<div class="task-note">${task.note}</div>` : ''}
      ${isMulti ? `
        <div class="progress-bar-track small">
          <div class="progress-bar-fill" style="width:${frac*100}%; background:${participant.color}"></div>
        </div>
      ` : ''}
      <div class="chip status-chip ${meta.cls}">${meta.label}</div>
    </div>
    <div class="task-actions">
      ${isMulti ? `<button class="stepper-btn plus" ${count >= task.qty ? 'disabled' : ''} aria-label="плюс">+</button>` : ''}
    </div>
  `;

  if (isMulti) {
    row.querySelector('.minus').addEventListener('click', () => {
      setCount(task.id, count - 1, task.qty);
      rerenderCurrent();
    });
    row.querySelector('.plus').addEventListener('click', () => {
      setCount(task.id, count + 1, task.qty);
      rerenderCurrent();
    });
    row.querySelector('.task-title').addEventListener('click', () => {
      setCount(task.id, done ? 0 : task.qty, task.qty);
      rerenderCurrent();
    });
  } else {
    row.querySelector('.checkbox').addEventListener('click', () => {
      setCount(task.id, done ? 0 : 1, task.qty);
      rerenderCurrent();
    });
    row.querySelector('.task-title').addEventListener('click', () => {
      setCount(task.id, done ? 0 : 1, task.qty);
      rerenderCurrent();
    });
  }
}

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================

// Полный перерендер текущей страницы (вызывается и после локального клика,
// и при получении изменений от других участников через Firestore).
function rerenderCurrent() {
  if (!stateLoaded) return;
  renderDashboard();
  renderParticipantPage();
}

function showLoadingPlaceholder() {
  ['dashboard-root', 'participant-header'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="loading-placeholder">Загрузка данных…</div>';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  showLoadingPlaceholder();
  initState(rerenderCurrent);
});
