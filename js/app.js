// ============================================================
//  ЛОГИКА ПРИЛОЖЕНИЯ (дашборд + страница участника)
// ============================================================

let PARTICIPANTS = [];
let PROGRESS = {};
let SETTINGS = SEED_SETTINGS;
let dataLoaded = { participants: false, progress: false, settings: false };

function allDataLoaded() {
  return dataLoaded.participants && dataLoaded.progress && dataLoaded.settings;
}

// ---------- права доступа ----------

function canCheckOff(participant) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  if (currentUser.role === 'participant') return currentUser.participantId === participant.id;
  return false; // guest
}

function canEditTasks(participant) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  if (currentUser.role === 'participant' && currentUser.participantId === participant.id) {
    return !SETTINGS.editLocked;
  }
  return false;
}

// ---------- задачи / прогресс ----------

function getCount(participantId, taskId) {
  return (PROGRESS[participantId]?.counts?.[taskId]) || 0;
}

function getEngagement(participantId) {
  return (PROGRESS[participantId]?.engagement) || 0;
}

function taskFraction(participant, task) {
  const count = getCount(participant.id, task.id);
  return Math.min(count, task.qty) / task.qty;
}

function isTaskDone(participant, task) {
  return getCount(participant.id, task.id) >= task.qty;
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

function deadlineStatus(participant, task) {
  if (isTaskDone(participant, task)) return 'done';
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
    const frac = taskFraction(participant, task);
    fractionSum += frac;
    if (frac >= 1) doneCount++;
    const status = deadlineStatus(participant, task);
    if (status === 'overdue') overdue++;
    if (status === 'soon') soon++;
  });

  const total = participant.tasks.length;
  const percent = total ? Math.round((fractionSum / total) * 100) : 0;

  const engagement = getEngagement(participant.id);
  const engagementMin = participant.engagementMin || 0;
  const engagementMet = engagement >= engagementMin;

  // Баллы за задачи: либо только за полностью закрытые цели (по умолчанию),
  // либо пропорционально прогрессу шаговых задач — переключается в настройках.
  const taskPoints = SETTINGS.allowPartialStepPoints
    ? fractionSum * SETTINGS.pointsPerTask
    : doneCount * SETTINGS.pointsPerTask;
  const score = Math.round((taskPoints + engagement * SETTINGS.pointsPerEngagement) * 100) / 100;

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
  // Ручная корректировка (настройки → «Ручная корректировка суммарного балла»)
  // применяется только к общему баллу группы, не к баллам конкретных
  // участников в рейтинге — чтобы не искажать честное сравнение между ними.
  totalScore = Math.round((totalScore + (SETTINGS.scoreBaselineAdjustmentGoals || 0)) * 100) / 100;
  const participantsCount = SETTINGS.participantsCount || PARTICIPANTS.length || 1;
  const avgScore = Math.round((totalScore / participantsCount) * 100) / 100;

  return { percent, totalTasks, overdue, soon, totalScore, avgScore, totalEngagement, totalEngagementMin, engagementPercent };
}

function initials(name) {
  return name.trim()[0].toUpperCase();
}

// ---------- динамика "с вчера" (кружки на дашборде) ----------

let yesterdaySnapshotCache = null; // { dateKey, percent, engagementPercent }

async function computeYesterdaySnapshot() {
  const yesterdayKey = mskDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (yesterdaySnapshotCache && yesterdaySnapshotCache.dateKey === yesterdayKey) {
    return yesterdaySnapshotCache;
  }

  const snap = await db.collection('events').orderBy('ts', 'asc').get();
  const lastTaskValue = {};
  const lastEngValue = {};

  snap.forEach(doc => {
    const ev = doc.data();
    if (!ev.dateKey || ev.dateKey > yesterdayKey || !ev.participantId) return;
    if (ev.kind === 'task') {
      lastTaskValue[`${ev.participantId}__${ev.taskId}`] = ev.newValue;
    } else if (ev.kind === 'engagement') {
      lastEngValue[ev.participantId] = ev.newValue;
    } else if (ev.kind === 'undo') {
      if (ev.undoOf === 'task') lastTaskValue[`${ev.participantId}__${ev.taskId}`] = ev.newValue;
      else if (ev.undoOf === 'engagement') lastEngValue[ev.participantId] = ev.newValue;
    }
  });

  let fractionSum = 0, totalTasks = 0, engagementSum = 0, engagementMinSum = 0;
  PARTICIPANTS.forEach(p => {
    p.tasks.forEach(t => {
      totalTasks++;
      const val = lastTaskValue[`${p.id}__${t.id}`] || 0;
      fractionSum += Math.min(val, t.qty) / t.qty;
    });
    engagementSum += lastEngValue[p.id] || 0;
    engagementMinSum += p.engagementMin || 0;
  });

  yesterdaySnapshotCache = {
    dateKey: yesterdayKey,
    percent: totalTasks ? Math.round((fractionSum / totalTasks) * 100) : 0,
    engagementPercent: engagementMinSum ? Math.round((engagementSum / engagementMinSum) * 100) : 0,
  };
  return yesterdaySnapshotCache;
}

function deltaBadgeHtml(diff) {
  if (diff > 0) return `<span class="stat-delta-up">▲ +${diff}% с вчера</span>`;
  if (diff < 0) return `<span class="stat-delta-down">▼ ${diff}% с вчера</span>`;
  return `<span class="stat-delta-flat">• без изменений с вчера</span>`;
}

async function attachYesterdayDeltas(gStats) {
  try {
    const y = await computeYesterdaySnapshot();
    const elPercent = document.getElementById('delta-percent');
    const elEngagement = document.getElementById('delta-engagement');
    if (elPercent) elPercent.innerHTML = deltaBadgeHtml(gStats.percent - y.percent);
    if (elEngagement) elEngagement.innerHTML = deltaBadgeHtml(gStats.engagementPercent - y.engagementPercent);
  } catch (err) {
    console.error('Не удалось посчитать динамику с вчера:', err);
  }
}

async function attachPercentBonus(gStats) {
  const valueEl = document.getElementById('total-score-value');
  const avgEl = document.getElementById('total-score-avg');
  try {
    const bonus = await computeCumulativePercentBonus(PARTICIPANTS, SETTINGS);
    const finalBonus = Math.round((bonus + (SETTINGS.scoreBaselineAdjustmentPercent || 0)) * 100) / 100;
    const grandTotal = Math.round((gStats.totalScore + finalBonus) * 100) / 100;
    const participantsCount = SETTINGS.participantsCount || PARTICIPANTS.length || 1;
    const avg = Math.round((grandTotal / participantsCount) * 100) / 100;

    if (valueEl) valueEl.textContent = grandTotal;
    if (avgEl) avgEl.innerHTML = `Средний балл на игрока: <b>${avg}</b> (÷${participantsCount}) · вкл. +${finalBonus} за %`;
  } catch (err) {
    console.error('Не удалось посчитать %-бонус для общего балла:', err);
    if (avgEl) avgEl.innerHTML = `<span style="color:#D70015">⚠️ %-бонус не посчитан: ${err.code || err.message || err}. Проверьте, опубликованы ли правила Firestore для dayScores.</span>`;
  }
}

function medalFor(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

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
  if (!root) { console.log('[mm] renderDashboard: нет #dashboard-root на этой странице, пропускаю'); return; }

  const brand = document.querySelector('.top-nav .brand');
  if (brand) brand.innerHTML = `${SETTINGS.tournamentName || 'Мастермайнд'} <span>•</span> Дашборд`;

  const gStats = groupStats();
  const ranked = rankedParticipants();

  root.innerHTML = `
    <div class="stats-row">
      <a href="charts.html?metric=percent" class="stat-card glass stat-card-link">
        <div class="stat-card-text">
          <div class="hero-label">Прогресс группы</div>
          <div class="stat-value">${gStats.percent}%</div>
          <div class="hero-sub">${gStats.totalTasks} задач · ${PARTICIPANTS.length} участников</div>
          <div class="stat-delta" id="delta-percent">&nbsp;</div>
        </div>
        <div class="stat-card-ring">
          ${ringSVG(gStats.percent, 84, 8, '#0A84FF')}
          <div class="ring-center-label ring-center-label-sm">${gStats.percent}%</div>
        </div>
      </a>

      <a href="charts.html?metric=engagement" class="stat-card glass stat-card-link">
        <div class="stat-card-text">
          <div class="hero-label">Вовлечение группы</div>
          <div class="stat-value">${gStats.totalEngagement}<span class="stat-value-of">/${gStats.totalEngagementMin}</span></div>
          <div class="hero-sub">минимум по группе</div>
          <div class="stat-delta" id="delta-engagement">&nbsp;</div>
        </div>
        <div class="stat-card-ring">
          ${ringSVG(gStats.engagementPercent, 84, 8, '#BF5AF2')}
          <div class="ring-center-label ring-center-label-sm">${Math.min(gStats.engagementPercent,100)}%${gStats.engagementPercent > 100 ? '+' : ''}</div>
        </div>
      </a>

      <a href="points-history.html" class="stat-card glass stat-card-score stat-card-link">
        <div class="stat-card-text">
          <div class="hero-label">Суммарный балл группы</div>
          <div class="stat-value" id="total-score-value">${gStats.totalScore}</div>
          <div class="hero-sub">${SETTINGS.pointsPerTask} балла / задача · ${SETTINGS.pointsPerEngagement} балла / вовлечение · ${SETTINGS.pointsPerPercent} балл / % команды</div>
          <div class="hero-sub" id="total-score-avg">Средний балл на игрока: <b>${gStats.avgScore}</b> (÷${SETTINGS.participantsCount})</div>
        </div>
        <div class="stat-card-icon">🏆</div>
      </a>
    </div>

    <div class="task-note" style="text-align:center;margin:-10px 0 16px">Нажмите на плитку прогресса/вовлечения — график 📈, на баллы — история начислений 📜</div>

    <div class="group-alerts group-alerts-top">
      ${gStats.overdue ? `<span class="chip chip-red">🔴 просрочено: ${gStats.overdue}</span>` : `<span class="chip chip-green">✅ всё в графике</span>`}
      ${gStats.soon ? `<span class="chip chip-yellow">🟡 скоро дедлайн: ${gStats.soon}</span>` : ''}
    </div>

    <h2 class="section-title">Рейтинг участников</h2>
    <div class="rank-list" id="rank-list"></div>
  `;

  attachYesterdayDeltas(gStats);
  attachPercentBonus(gStats);


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
  const root = document.getElementById('participant-header');
  if (!root) { console.log('[mm] renderParticipantPage: нет #participant-header на этой странице, пропускаю'); return; }

  const participant = getParticipantFromURL();
  if (!participant) return;
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
  const readOnly = !canCheckOff(participant);

  header.innerHTML = `
    <div class="hero-card glass participant-hero">
      <div class="hero-left">
        <div class="avatar avatar-lg" style="background:${participant.color}">${initials(participant.name)}</div>
        <div>
          <div class="hero-label">Участник ${medal ? medal : `· место ${myRank}`} ${readOnly ? '<span class="readonly-tag">👁 только просмотр</span>' : ''}</div>
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
  const editable = canCheckOff(participant);

  container.innerHTML = `
    <h2 class="section-title">Вовлечение <span class="section-title-sub">(отдельно от задач · без максимума)</span></h2>
    <div class="task-row glass engagement-row ${s.engagementMet ? 'status-border-done' : 'status-border-soon'}">
      <div class="task-check-wrap">
        <button class="stepper-btn minus" id="eng-minus" ${(!editable || s.engagement <= 0) ? 'disabled' : ''} aria-label="минус">−</button>
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
        <div class="task-note">${SETTINGS.pointsPerEngagement} балла за каждого вовлечённого человека · максимума нет</div>
      </div>
      <div class="task-actions">
        <button class="stepper-btn plus" id="eng-plus" ${editable ? '' : 'disabled'} aria-label="плюс">+</button>
      </div>
    </div>
  `;

  if (!editable) return;
  document.getElementById('eng-minus').addEventListener('click', () => {
    setEngagement(participant, getEngagement(participant.id) - 1);
  });
  document.getElementById('eng-plus').addEventListener('click', () => {
    setEngagement(participant, getEngagement(participant.id) + 1);
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

// сортировка: невыполненные по возрастанию дедлайна (без дедлайна — в конце
// невыполненных), выполненные на 100% — все внизу списка.
function sortedTasks(participant) {
  const withDone = participant.tasks.map(t => ({ t, done: isTaskDone(participant, t) }));
  const notDone = withDone.filter(x => !x.done);
  const done = withDone.filter(x => x.done);
  notDone.sort((a, b) => {
    const da = a.t.deadline ? parseDate(a.t.deadline).getTime() : Infinity;
    const db = b.t.deadline ? parseDate(b.t.deadline).getTime() : Infinity;
    return da - db;
  });
  return [...notDone, ...done].map(x => x.t);
}

function renderTaskList(participant) {
  const list = document.getElementById('task-list');
  list.innerHTML = '';

  const editable = canEditTasks(participant);

  const tasks = sortedTasks(participant);
  tasks.forEach(task => {
    const row = document.createElement('div');
    row.id = `task-${task.id}`;
    row.className = 'task-row glass';
    renderTaskRow(row, task, participant);
    list.appendChild(row);
  });

  const addWrap = document.getElementById('add-task-wrap');
  if (addWrap) {
    addWrap.innerHTML = editable ? `<button id="add-task-btn" class="add-task-btn">+ Добавить задачу</button>` : '';
    const btn = document.getElementById('add-task-btn');
    if (btn) btn.addEventListener('click', () => openTaskForm(null, participant));
  }
}

function renderTaskRow(row, task, participant) {
  const count = getCount(participant.id, task.id);
  const status = deadlineStatus(participant, task);
  const meta = statusMeta(status, task);
  const frac = taskFraction(participant, task);
  const done = frac >= 1;
  const canCheck = canCheckOff(participant);
  const canEdit = canEditTasks(participant);

  row.className = `task-row glass status-border-${status}`;

  const isMulti = task.qty > 1;

  row.innerHTML = `
    <div class="task-check-wrap">
      ${isMulti ? `
        <button class="stepper-btn minus" ${(!canCheck || count <= 0) ? 'disabled' : ''} aria-label="минус">−</button>
      ` : `
        <button class="checkbox ${done ? 'checked' : ''}" ${canCheck ? '' : 'disabled'} aria-label="выполнено">
          ${done ? '✓' : ''}
        </button>
      `}
    </div>
    <div class="task-body">
      <div class="task-title-row">
        <div class="task-title ${done ? 'task-title-done' : ''}" ${canCheck ? '' : 'style="cursor:default"'}>${task.text}</div>
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
      ${isMulti ? `<button class="stepper-btn plus" ${canCheck ? '' : 'disabled'} aria-label="плюс">+</button>` : ''}
      ${canEdit ? `<button class="edit-btn" aria-label="редактировать">✏️</button>` : ''}
    </div>
  `;

  if (canCheck) {
    if (isMulti) {
      row.querySelector('.minus').addEventListener('click', () => setTaskCount(participant, task, count - 1));
      row.querySelector('.plus').addEventListener('click', () => setTaskCount(participant, task, count + 1));
      row.querySelector('.task-title').addEventListener('click', () => setTaskCount(participant, task, done ? 0 : task.qty));
    } else {
      row.querySelector('.checkbox').addEventListener('click', () => setTaskCount(participant, task, done ? 0 : 1));
      row.querySelector('.task-title').addEventListener('click', () => setTaskCount(participant, task, done ? 0 : 1));
    }
  }

  if (canEdit) {
    row.querySelector('.edit-btn').addEventListener('click', () => openTaskForm(task, participant));
  }
}

// ---------- форма редактирования / добавления задачи ----------

function openTaskForm(task, participant) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const isNew = !task;
  const initialQty = task ? task.qty : 1;
  const initialStepMode = initialQty > 1;
  overlay.innerHTML = `
    <div class="modal-card glass">
      <div class="modal-title">${isNew ? 'Новая задача' : 'Редактировать задачу'}</div>
      <label class="login-label">Текст задачи</label>
      <input id="tf-text" class="login-input" value="${task ? task.text.replace(/"/g, '&quot;') : ''}" />

      <label class="login-checkbox-row">
        <input id="tf-step-mode" type="checkbox" ${initialStepMode ? 'checked' : ''} />
        Пошаговая задача (можно закрывать по частям, кнопками + / −)
      </label>
      <div id="tf-qty-wrap" style="${initialStepMode ? '' : 'display:none'}">
        <label class="login-label">Количество шагов до полного закрытия</label>
        <input id="tf-qty" class="login-input" type="number" min="2" value="${initialStepMode ? initialQty : 2}" />
      </div>

      <label class="login-label">Дедлайн (можно оставить пустым)</label>
      <input id="tf-deadline" class="login-input" type="date" value="${task && task.deadline ? task.deadline : ''}" />
      <label class="login-label">Заметка (необязательно)</label>
      <input id="tf-note" class="login-input" value="${task && task.note ? task.note.replace(/"/g, '&quot;') : ''}" />
      <div class="modal-actions">
        ${!isNew ? `<button id="tf-delete" class="modal-btn modal-btn-danger">Удалить</button>` : '<span></span>'}
        <div>
          <button id="tf-cancel" class="modal-btn modal-btn-secondary">Отмена</button>
          <button id="tf-save" class="modal-btn modal-btn-primary">Сохранить</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#tf-step-mode').addEventListener('change', e => {
    overlay.querySelector('#tf-qty-wrap').style.display = e.target.checked ? '' : 'none';
  });

  overlay.querySelector('#tf-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  if (!isNew) {
    overlay.querySelector('#tf-delete').addEventListener('click', async () => {
      if (!confirm('Удалить эту задачу? Это действие нельзя отменить.')) return;
      await deleteTask(participant, task.id);
      overlay.remove();
    });
  }

  overlay.querySelector('#tf-save').addEventListener('click', async () => {
    const text = overlay.querySelector('#tf-text').value.trim();
    const stepMode = overlay.querySelector('#tf-step-mode').checked;
    const qty = stepMode
      ? Math.max(2, parseInt(overlay.querySelector('#tf-qty').value, 10) || 2)
      : 1;
    const deadline = overlay.querySelector('#tf-deadline').value || null;
    const note = overlay.querySelector('#tf-note').value.trim();
    if (!text) { alert('Введите текст задачи'); return; }
    if (isNew) {
      await addTask(participant, { text, qty, deadline, note });
    } else {
      await updateTask(participant, { id: task.id, text, qty, deadline, note });
    }
    overlay.remove();
  });
}

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================

function rerenderCurrent() {
  if (!allDataLoaded() || !currentUser) return;
  if (dataStallTimeout) { clearTimeout(dataStallTimeout); dataStallTimeout = null; }
  console.log('[mm] rerenderCurrent: рендерю');
  try {
    renderDashboard();
    console.log('[mm] renderDashboard: ок');
  } catch (err) {
    console.error('[mm] ОШИБКА в renderDashboard:', err);
    showFatalError('Ошибка отрисовки дашборда', `${err.message}\n${err.stack || ''}`);
    return;
  }
  try {
    renderParticipantPage();
    console.log('[mm] renderParticipantPage: ок');
  } catch (err) {
    console.error('[mm] ОШИБКА в renderParticipantPage:', err);
    showFatalError('Ошибка отрисовки страницы участника', `${err.message}\n${err.stack || ''}`);
  }
}

function setSyncStatus() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.className = 'sync-status sync-online';
  el.innerHTML = '🟢 Синхронизировано со всеми участниками';
}

let dataStallTimeout = null;

function showDataStallError() {
  const missing = Object.entries(dataLoaded).filter(([, v]) => !v).map(([k]) => k);
  console.error('[mm] Данные не загрузились за 10с, отсутствуют:', missing);
  const target = document.getElementById('participant-header') || document.getElementById('dashboard-root') || document.body;
  const box = document.createElement('div');
  box.className = 'loading-placeholder';
  box.innerHTML = `⚠️ Не удалось загрузить данные (${missing.join(', ')}). Проверьте правила Firestore и интернет-соединение.
    <br><button id="data-retry-btn" style="margin-top:10px" class="login-btn">Повторить</button>`;
  target.prepend(box);
  const btn = document.getElementById('data-retry-btn');
  if (btn) btn.addEventListener('click', () => location.reload());
}

function startDataListeners() {
  console.log('[mm] startDataListeners: старт подписок');
  dataStallTimeout = setTimeout(() => {
    if (!allDataLoaded()) showDataStallError();
  }, 10000);

  subscribeParticipants(list => {
    console.log('[mm] participants загружены:', list.length);
    PARTICIPANTS = list;
    dataLoaded.participants = true;
    setSyncStatus();
    rerenderCurrent();
  });
  subscribeProgress(map => {
    console.log('[mm] progress загружен:', Object.keys(map).length);
    PROGRESS = map;
    dataLoaded.progress = true;
    rerenderCurrent();
  });
  subscribeSettings(settings => {
    console.log('[mm] settings загружены');
    SETTINGS = settings;
    dataLoaded.settings = true;
    rerenderCurrent();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[mm] DOMContentLoaded');
  onAuthReady(user => {
    console.log('[mm] onAuthReady:', user ? user.displayName : 'нет');
    if (user) startDataListeners();
  });
});
