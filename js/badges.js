// ============================================================
//  НАГРАДЫ — считаются каждый раз заново из журнала событий.
//  Ничего не пишется в базу, поэтому уже выданная награда никогда
//  не может "слететь", даже если кто-то отменит отметку задачи.
// ============================================================

// shape — какой значок рисовать (см. badgeIconSvg), color — переменная
// палитры сайта (совпадает с css/style.css)
const BADGE_CATALOG = {
  first_goal:    { shape: 'star',      color: 'blue',   name: 'Первый шаг',          desc: 'Закрыли свою первую цель' },
  milestone_3:   { shape: 'spark',     color: 'blue',   name: 'Разгон',              desc: '3 закрытые цели' },
  milestone_5:   { shape: 'target',    color: 'purple', name: 'Пятёрка',             desc: '5 закрытых целей' },
  milestone_10:  { shape: 'medal',     color: 'orange', name: 'Десятка',             desc: '10 закрытых целей' },
  milestone_15:  { shape: 'trophy',    color: 'yellow', name: 'Пятнашка',            desc: '15 закрытых целей' },
  milestone_20:  { shape: 'diamond',   color: 'purple', name: 'Двадцатка',           desc: '20 закрытых целей' },
  double_day:    { shape: 'bolt',      color: 'yellow', name: 'Двойной рывок',       desc: '2 закрытые цели за один день' },
  triple_day:    { shape: 'flame',     color: 'orange', name: 'Тройной рывок',       desc: '3 закрытые цели за один день' },
  engaged_5:     { shape: 'handshake', color: 'green',  name: 'Первое вовлечение',   desc: '5 очков вовлечения суммарно' },
  engaged_10:    { shape: 'handshake', color: 'green',  name: 'Командный дух',       desc: '10 очков вовлечения суммарно' },
  engaged_20:    { shape: 'shield',    color: 'green',  name: 'Опора команды',       desc: '20 очков вовлечения суммарно' },
  halfway:       { shape: 'burst',     color: 'blue',   name: 'Половина пути',       desc: 'Закрыто 50% своих целей' },
  finisher:      { shape: 'flag',      color: 'red',    name: 'Финишер',             desc: 'Закрыли вообще все свои цели' },
  streak_3:      { shape: 'crown',     color: 'purple', name: 'Три дня на вершине',  desc: '3 дня подряд — лидер по баллам' },
  streak_5:      { shape: 'crown',     color: 'red',    name: 'Пять дней на вершине', desc: '5 дней подряд — лидер по баллам' },
  active_days_5: { shape: 'calendar',  color: 'blue',   name: 'Активная неделя',     desc: 'Закрывали цели в 5 разных днях' },
};

const MILESTONE_BADGE_ID = { 1: 'first_goal', 3: 'milestone_3', 5: 'milestone_5', 10: 'milestone_10', 15: 'milestone_15', 20: 'milestone_20' };

async function computeAllBadges(participants, settings) {
  const events = await _loadAllTaskEvents(); // общий кэш, уже используется для % — доп. чтений не будет

  const state = {};
  participants.forEach(p => {
    state[p.id] = {
      everCompleted: new Set(),  // taskId — раз закрыта, навсегда считается закрытой для наград
      completedCount: 0,
      activeDays: new Set(),     // дни, в которые закрыли хотя бы одну цель
      perDay: {},                // dateKey -> сколько целей закрыто в этот день
      engagementTotal: 0,
      badges: [],                // [{id, date}]
    };
  });

  events.forEach(ev => {
    if (!ev.participantId || !state[ev.participantId]) return;
    const r = state[ev.participantId];

    if (ev.kind === 'task') {
      const nowDone = ev.newValue >= ev.qty;
      if (nowDone && !r.everCompleted.has(ev.taskId)) {
        r.everCompleted.add(ev.taskId);
        r.completedCount++;
        const day = ev.dateKey;
        r.perDay[day] = (r.perDay[day] || 0) + 1;
        r.activeDays.add(day);

        const badgeId = MILESTONE_BADGE_ID[r.completedCount];
        if (badgeId) r.badges.push({ id: badgeId, date: day });
        if (r.perDay[day] === 2) r.badges.push({ id: 'double_day', date: day });
        if (r.perDay[day] === 3) r.badges.push({ id: 'triple_day', date: day });
      }
    } else if (ev.kind === 'engagement' && ev.delta > 0) {
      r.engagementTotal += ev.delta;
    }
  });

  // пороговые награды — проверяем по итоговому состоянию
  participants.forEach(p => {
    const r = state[p.id];
    if (r.engagementTotal >= 5) r.badges.push({ id: 'engaged_5', date: null });
    if (r.engagementTotal >= 10) r.badges.push({ id: 'engaged_10', date: null });
    if (r.engagementTotal >= 20) r.badges.push({ id: 'engaged_20', date: null });
    if (r.activeDays.size >= 5) r.badges.push({ id: 'active_days_5', date: null });

    const totalTasks = (p.tasks || []).length;
    if (totalTasks > 0) {
      if (r.everCompleted.size >= Math.ceil(totalTasks / 2)) r.badges.push({ id: 'halfway', date: null });
      if (r.everCompleted.size >= totalTasks) r.badges.push({ id: 'finisher', date: null });
    }
  });

  // "N дней на вершине" — считаем накопительный балл по дням и ищем серию побед
  await attachStreakBadges(state, participants, settings);

  return state;
}

async function attachStreakBadges(state, participants, settings) {
  const events = await _loadAllTaskEvents();
  const dateKeys = new Set();
  events.forEach(ev => { if (ev.dateKey) dateKeys.add(ev.dateKey); });
  dateKeys.add(mskDateKey());
  const sortedDays = Array.from(dateKeys).sort();

  const pointsPerTask = settings?.pointsPerTask ?? 2;
  const pointsPerEngagement = settings?.pointsPerEngagement ?? 3;

  // очки на конец каждого дня по каждому участнику (цели + вовлечение, без %-бонуса —
  // он командный, а не личный, для рейтинга дня он не нужен)
  const running = {};
  participants.forEach(p => running[p.id] = 0);
  const scoreByDay = {}; // dateKey -> { pid: score }
  let idx = 0;
  sortedDays.forEach(day => {
    while (idx < events.length && events[idx].dateKey === day) {
      const ev = events[idx];
      if (ev.participantId && running[ev.participantId] !== undefined) {
        if (ev.kind === 'task') {
          const wasDone = ev.prevValue >= ev.qty, nowDone = ev.newValue >= ev.qty;
          if (!wasDone && nowDone) running[ev.participantId] += pointsPerTask;
          else if (wasDone && !nowDone) running[ev.participantId] -= pointsPerTask;
        } else if (ev.kind === 'engagement') {
          running[ev.participantId] += ev.delta * pointsPerEngagement;
        }
      }
      idx++;
    }
    scoreByDay[day] = { ...running };
  });

  let streak = {}; // pid -> текущая серия дней подряд в лидерах
  participants.forEach(p => streak[p.id] = 0);

  sortedDays.forEach(day => {
    const scores = scoreByDay[day];
    const max = Math.max(...Object.values(scores));
    const leaders = Object.keys(scores).filter(pid => scores[pid] === max && max > 0);
    participants.forEach(p => {
      if (leaders.length === 1 && leaders[0] === p.id) {
        streak[p.id]++;
        if (streak[p.id] === 3) state[p.id].badges.push({ id: 'streak_3', date: day });
        if (streak[p.id] === 5) state[p.id].badges.push({ id: 'streak_5', date: day });
      } else {
        streak[p.id] = 0;
      }
    });
  });
}

// ---------- отрисовка значка (плоский кружок + простой силуэт, без внешних картинок) ----------
// locked=true -> серый, пригашенный (значит награда ещё не выдана)

const BADGE_SHAPE_PATHS = {
  star:      '<path d="M0,-15 L4.4,-4.4 16,-3.7 7,3.4 10,15 0,8.3 -10,15 -7,3.4 -16,-3.7 -4.4,-4.4 Z"/>',
  spark:     '<path d="M0,-16 L4,-4 16,0 4,4 0,16 -4,4 -16,0 -4,-4 Z"/>',
  bolt:      '<path d="M3,-16 L-9,1 -1,1 -3,16 9,-3 1,-3 Z"/>',
  flame:     '<path d="M0,-15c8,9 4,10 4,15a4,4 0 11-8,0c0-3 1,-4 0,-6-2,3-3,5-3,7a7,7 0 1014,0c0-9-4,-11-7,-16z"/>',
  diamond:   '<path d="M0,-15 L11,-3 0,15 -11,-3 Z"/>',
  medal:     '<path d="M-9,-16 h18 v6 a9,9 0 11-18,0 Z"/><rect x="-2" y="-3" width="4" height="8"/><rect x="-10" y="5" width="20" height="5" rx="1.5"/>',
  trophy:    '<path d="M-8,-14 h16 v6 a8,8 0 01-16,0z"/><rect x="-5" y="-4" width="10" height="9"/><rect x="-9" y="6" width="18" height="5" rx="1.5"/>',
  crown:     '<path d="M-13,4 L-9,-9 -3,0 0,-13 3,0 9,-9 13,4 Z"/>',
  handshake: '<circle cx="-6.5" cy="0" r="12" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="6.5" cy="0" r="12" fill="none" stroke="currentColor" stroke-width="4"/>',
  shield:    '<path d="M0,-15 12,-9 v9c0,9-6,13-12,15-6-2-12-6-12-15v-9z"/>',
  flag:      '<rect x="-11" y="-15" width="4" height="30"/><path d="M-7,-15 h18 l-5,7 5,7 h-18 z"/>',
  calendar:  '<rect x="-13" y="-11" width="26" height="22" rx="3" fill="none" stroke="currentColor" stroke-width="3"/><line x1="-13" y1="-4" x2="13" y2="-4" stroke="currentColor" stroke-width="3"/><rect x="-8" y="1" width="5" height="5"/><rect x="1" y="1" width="5" height="5"/>',
  target:    '<circle r="14" fill="none" stroke="currentColor" stroke-width="4.5"/><circle r="5.5"/>',
  burst:     '<path d="M0,-14 L2.5,-3 13,-2 3.5,2 6,13 0,6.5 -6,13 -3.5,2 -13,-2 -2.5,-3 Z"/>',
};

function badgeIconSvg(id, locked) {
  const b = BADGE_CATALOG[id];
  if (!b) return '';
  const path = BADGE_SHAPE_PATHS[b.shape] || BADGE_SHAPE_PATHS.star;
  const cls = locked ? 'badge-icon badge-icon-locked' : `badge-icon badge-icon-${b.color}`;
  return `<svg class="${cls}" viewBox="-20 -20 40 40" width="100%" height="100%">
    <circle r="20" class="badge-icon-bg"/>
    <g fill="currentColor">${path}</g>
  </svg>`;
}
