// ============================================================
//  СЛОЙ ДАННЫХ (Firestore)
// ============================================================

// ---------- дата в МСК (для группировки отчёта/событий по дню) ----------

function mskDateKey(d) {
  d = d || new Date();
  // МСК = UTC+3, без перехода на летнее время
  const msk = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  const y = msk.getUTCFullYear();
  const m = String(msk.getUTCMonth() + 1).padStart(2, '0');
  const day = String(msk.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mskDateLabel(dateKey) {
  const [y, m, d] = dateKey.split('-');
  return `${d}.${m}.${y.slice(2)}`;
}

// ---------- первичная инициализация базы (запускается из setup.html) ----------

async function seedDatabaseIfNeeded() {
  const settingsSnap = await db.collection('config').doc('settings').get();
  if (!settingsSnap.exists) {
    await db.collection('config').doc('settings').set(SEED_SETTINGS);
  }
  const participantsSnap = await db.collection('participants').limit(1).get();
  if (participantsSnap.empty) {
    const batch = db.batch();
    SEED_PARTICIPANTS.forEach(p => {
      const ref = db.collection('participants').doc(p.id);
      batch.set(ref, p);
    });
    await batch.commit();
    // создаём пустые документы прогресса
    const progressBatch = db.batch();
    SEED_PARTICIPANTS.forEach(p => {
      const ref = db.collection('progress').doc(p.id);
      progressBatch.set(ref, { counts: {}, engagement: 0 });
    });
    await progressBatch.commit();
  }
}

// ---------- realtime подписки ----------

function subscribeParticipants(cb) {
  return db.collection('participants').orderBy('order').onSnapshot(snap => {
    const list = [];
    snap.forEach(doc => list.push({ ...doc.data(), id: doc.id }));
    cb(list);
  }, err => console.error('participants listener error:', err));
}

function subscribeProgress(cb) {
  return db.collection('progress').onSnapshot(snap => {
    const map = {};
    snap.forEach(doc => map[doc.id] = doc.data());
    cb(map);
  }, err => console.error('progress listener error:', err));
}

function subscribeSettings(cb) {
  return db.collection('config').doc('settings').onSnapshot(snap => {
    // Мерджим с SEED_SETTINGS, чтобы новые поля настроек, добавленные уже
    // после первого запуска сайта, всегда имели безопасное значение по
    // умолчанию, даже если в самом документе Firestore их ещё нет.
    cb(snap.exists ? { ...SEED_SETTINGS, ...snap.data() } : SEED_SETTINGS);
  }, err => console.error('settings listener error:', err));
}

// ---------- запись прогресса (отметки задач / вовлечения) ----------

async function logEvent(entry) {
  try {
    await db.collection('events').add({
      ts: firebase.firestore.FieldValue.serverTimestamp(),
      dateKey: mskDateKey(),
      byUid: currentUser ? currentUser.uid : null,
      byName: currentUser ? currentUser.displayName : null,
      ...entry,
    });
  } catch (err) {
    console.error('Не удалось записать событие:', err);
  }
}

async function setTaskCount(participant, task, newValue) {
  const clamped = Math.max(0, Math.min(task.qty, newValue));
  const prevValue = (progressCache[participant.id]?.counts?.[task.id]) || 0;
  if (clamped === prevValue) return;
  await db.collection('progress').doc(participant.id).set({
    counts: { [task.id]: clamped }
  }, { merge: true });
  await logEvent({
    kind: 'task',
    participantId: participant.id,
    participantName: participant.name,
    taskId: task.id,
    taskText: task.text,
    qty: task.qty,
    prevValue, newValue: clamped,
    delta: clamped - prevValue,
  });
  invalidatePercentEventsCache();
}

async function setEngagement(participant, newValue) {
  const clamped = Math.max(0, newValue);
  const prevValue = (progressCache[participant.id]?.engagement) || 0;
  if (clamped === prevValue) return;
  await db.collection('progress').doc(participant.id).set({
    engagement: clamped
  }, { merge: true });
  await logEvent({
    kind: 'engagement',
    participantId: participant.id,
    participantName: participant.name,
    prevValue, newValue: clamped,
    delta: clamped - prevValue,
  });
}

// ---------- редактирование задач ----------

async function updateTask(participant, updatedTask) {
  const tasks = participant.tasks.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t);
  await db.collection('participants').doc(participant.id).update({ tasks });
  await logEvent({
    kind: 'edit_task',
    participantId: participant.id,
    participantName: participant.name,
    taskId: updatedTask.id,
    taskText: updatedTask.text,
  });
}

async function addTask(participant, newTask) {
  const id = `${participant.id}_${Date.now().toString(36)}`;
  const task = { id, text: newTask.text, qty: newTask.qty || 1, deadline: newTask.deadline || null, note: newTask.note || '' };
  const tasks = [...participant.tasks, task];
  await db.collection('participants').doc(participant.id).update({ tasks });
  await logEvent({
    kind: 'add_task',
    participantId: participant.id,
    participantName: participant.name,
    taskId: id,
    taskText: task.text,
  });
}

async function deleteTask(participant, taskId) {
  const removed = participant.tasks.find(t => t.id === taskId);
  const tasks = participant.tasks.filter(t => t.id !== taskId);
  await db.collection('participants').doc(participant.id).update({ tasks });
  await logEvent({
    kind: 'delete_task',
    participantId: participant.id,
    participantName: participant.name,
    taskId,
    taskText: removed ? removed.text : '',
  });
}

async function updateEngagementMin(participantId, engagementMin) {
  await db.collection('participants').doc(participantId).update({ engagementMin });
}

// ---------- настройки ----------

async function updateSettings(fields) {
  await db.collection('config').doc('settings').set(fields, { merge: true });
}

// ---------- события за конкретный день (для отчёта) ----------

async function getEventsForDate(dateKey) {
  const snap = await db.collection('events').where('dateKey', '==', dateKey).get();
  const list = [];
  snap.forEach(doc => list.push({ ...doc.data(), id: doc.id }));
  list.sort((a, b) => (a.ts?.toMillis?.() || 0) - (b.ts?.toMillis?.() || 0));
  return list;
}

// ---------- отмена действия из журнала (только task / engagement) ----------

async function undoEvent(ev) {
  if (ev.kind === 'task') {
    await db.collection('progress').doc(ev.participantId).set({
      counts: { [ev.taskId]: ev.prevValue }
    }, { merge: true });
  } else if (ev.kind === 'engagement') {
    await db.collection('progress').doc(ev.participantId).set({
      engagement: ev.prevValue
    }, { merge: true });
  } else {
    throw new Error('Это действие нельзя отменить автоматически');
  }
  await logEvent({
    kind: 'undo',
    participantId: ev.participantId,
    participantName: ev.participantName,
    undoOf: ev.kind,
    taskId: ev.taskId || null,
    taskText: ev.taskText || null,
    qty: ev.qty || null,
    prevValue: ev.newValue,
    newValue: ev.prevValue,
  });
  invalidatePercentEventsCache();
}

// ---------- надёжный разбор истории "закрыта / не закрыта" ----------
//
// Общий помощник для charts.js / daily-scores.js / report.js.
// Отслеживает РЕАЛЬНОЕ состояние каждой задачи по ходу истории, а не
// доверяет полю prevValue конкретного события — иначе одно и то же
// изменение, отменённое и через профиль участника, и через журнал
// администратора, посчиталось бы дважды. onChange вызывается только
// когда статус "закрыта" ДЕЙСТВИТЕЛЬНО меняется относительно уже
// отслеженного состояния (события должны идти в хронологическом порядке).
function replayTaskDoneTransitions(events, onChange, participantsForQtyFallback) {
  const doneState = {};
  const fallbackQty = (pid, taskId) => {
    if (!participantsForQtyFallback) return 1;
    const p = participantsForQtyFallback.find(p => p.id === pid);
    const t = p && (p.tasks || []).find(t => t.id === taskId);
    return (t && t.qty) || 1;
  };
  events.forEach(ev => {
    if (!ev.participantId) return;
    let taskId = null, qty = null, newCount = null, prevCount = null;
    if (ev.kind === 'task') {
      taskId = ev.taskId; qty = ev.qty || 1; newCount = ev.newValue; prevCount = ev.prevValue;
    } else if (ev.kind === 'undo' && ev.undoOf === 'task') {
      taskId = ev.taskId; qty = ev.qty || fallbackQty(ev.participantId, ev.taskId); newCount = ev.newValue; prevCount = ev.prevValue;
    } else {
      return;
    }
    if (taskId == null || newCount == null) return;
    const key = `${ev.participantId}__${taskId}`;
    // Первое событие по этой задаче в переданном списке — доверяем его
    // prevValue как реальному состоянию "на входе" (перенесённому из
    // истории до начала выборки). Дальше — только наше отслеженное
    // состояние, чтобы не считать одно и то же изменение дважды.
    if (!(key in doneState)) {
      doneState[key] = prevCount != null ? prevCount >= qty : false;
    }
    const wasDone = doneState[key];
    const isDone = newCount >= qty;
    if (wasDone !== isDone) {
      doneState[key] = isDone;
      onChange(ev, wasDone, isDone);
    }
  });
}

// ---------- % выполнения задач командой на конец произвольной даты ----------
// (обобщение "снимка на вчера": реплеим события до конца dateKey включительно)

let _percentEventsCache = null; // все task-события, читаются один раз и кэшируются
async function _loadAllTaskEvents() {
  if (_percentEventsCache) return _percentEventsCache;
  const snap = await db.collection('events').orderBy('ts', 'asc').get();
  const list = [];
  snap.forEach(doc => list.push(doc.data()));
  _percentEventsCache = list;
  return list;
}
function invalidatePercentEventsCache() { _percentEventsCache = null; }

async function computeGroupPercentAsOf(dateKey, participants) {
  const events = await _loadAllTaskEvents();
  const lastTaskValue = {};

  events.forEach(ev => {
    if (!ev.dateKey || ev.dateKey > dateKey || !ev.participantId) return;
    if (ev.kind === 'task') {
      lastTaskValue[`${ev.participantId}__${ev.taskId}`] = ev.newValue;
    } else if (ev.kind === 'undo' && ev.undoOf === 'task') {
      lastTaskValue[`${ev.participantId}__${ev.taskId}`] = ev.newValue;
    }
  });

  let fractionSum = 0, totalTasks = 0;
  participants.forEach(p => {
    p.tasks.forEach(t => {
      totalTasks++;
      const val = lastTaskValue[`${p.id}__${t.id}`] || 0;
      fractionSum += Math.min(val, t.qty) / t.qty;
    });
  });
  return totalTasks ? Math.round((fractionSum / totalTasks) * 100) : 0;
}

function previousDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return mskDateKey(dt);
}

// ---------- архив дневных баллов (Цели / % / Вовлечение по дням) ----------
// dayScores/{dateKey}: { goalsPoints, percentPoints, engagementPoints,
//                         goalsOverride, percentOverride, engagementOverride (bool) }
// Авто-значения считаются на лету из событий; override-флаги говорят,
// что число в документе — ручная правка админа, а не авторасчёт.

function subscribeDayScores(cb) {
  return db.collection('dayScores').onSnapshot(snap => {
    const map = {};
    snap.forEach(doc => map[doc.id] = doc.data());
    cb(map);
  }, err => console.error('dayScores listener error:', err));
}

async function setDayScoreOverride(dateKey, field, value) {
  await db.collection('dayScores').doc(dateKey).set({
    [field]: value,
    [`${field}Override`]: true,
  }, { merge: true });
}

async function clearDayScoreOverride(dateKey, field) {
  await db.collection('dayScores').doc(dateKey).set({
    [`${field}Override`]: false,
  }, { merge: true });
}

// авто-расчёт баллов за день (без учёта override) — цели и вовлечение из событий,
// % — из дельты между концом предыдущего дня и концом этого дня
async function computeAutoDayScore(dateKey, participants, settings) {
  const events = await getEventsForDate(dateKey);
  let goalsPoints = 0, engagementPoints = 0;

  const taskDoneState = {}; // `${pid}__${taskId}` -> закрыта ли сейчас (для goalsPoints ниже не нужен, но полезен для отладки)
  replayTaskDoneTransitions(events, (ev, wasDone, isDone) => {
    if (!wasDone && isDone) goalsPoints += settings.pointsPerTask;
    else if (wasDone && !isDone) goalsPoints -= settings.pointsPerTask;
  }, participants);
  events.forEach(ev => {
    if (ev.kind === 'engagement') engagementPoints += ev.delta * settings.pointsPerEngagement;
  });

  const startPercent = await computeGroupPercentAsOf(previousDateKey(dateKey), participants);
  const endPercent = await computeGroupPercentAsOf(dateKey, participants);
  const percentPoints = Math.round((endPercent - startPercent) * settings.pointsPerPercent);

  return {
    goalsPoints: Math.round(goalsPoints * 100) / 100,
    percentPoints,
    engagementPoints: Math.round(engagementPoints * 100) / 100,
    startPercent, endPercent,
  };
}

// сводит авто-расчёт и override в один объект эффективных значений
function effectiveDayScore(auto, override) {
  const o = override || {};
  return {
    goalsPoints: o.goalsOverride ? o.goalsPoints : auto.goalsPoints,
    percentPoints: o.percentOverride ? o.percentPoints : auto.percentPoints,
    engagementPoints: o.engagementOverride ? o.engagementPoints : auto.engagementPoints,
    goalsIsOverride: !!o.goalsOverride,
    percentIsOverride: !!o.percentOverride,
    engagementIsOverride: !!o.engagementOverride,
    startPercent: auto.startPercent,
    endPercent: auto.endPercent,
  };
}

// ---------- суммарный %-бонус за всё время (для дашборда и "Баллов") ----------

async function computeCumulativePercentBonus(participants, settings) {
  const eventsSnap = await db.collection('events').get();
  const dateKeys = new Set();
  eventsSnap.forEach(doc => { const dk = doc.data().dateKey; if (dk) dateKeys.add(dk); });
  dateKeys.add(mskDateKey());

  const overridesSnap = await db.collection('dayScores').get();
  const overrides = {};
  overridesSnap.forEach(doc => overrides[doc.id] = doc.data());

  let sum = 0;
  for (const dk of dateKeys) {
    const o = overrides[dk];
    if (o && o.percentOverride) {
      sum += o.percentPoints || 0;
    } else {
      const startPercent = await computeGroupPercentAsOf(previousDateKey(dk), participants);
      const endPercent = await computeGroupPercentAsOf(dk, participants);
      sum += Math.round((endPercent - startPercent) * settings.pointsPerPercent);
    }
  }
  return Math.round(sum * 100) / 100;
}

// глобальный кэш последнего известного прогресса — нужен для вычисления
// prevValue без лишнего чтения из базы
let progressCache = {};
subscribeProgressCacheOnce();
function subscribeProgressCacheOnce() {
  // откладываем до готовности auth/db
  const tryInit = () => {
    if (typeof db === 'object' && db) {
      db.collection('progress').onSnapshot(snap => {
        snap.forEach(doc => progressCache[doc.id] = doc.data());
      });
    } else {
      setTimeout(tryInit, 200);
    }
  };
  tryInit();
}

// ============================================================
//  УПРАВЛЕНИЕ ДОСТУПОМ — создание/деактивация admin- и guest-профилей.
//  Доступно только супер-админу (см. firestore.rules: isSuperAdmin()).
//  Пароли других людей нельзя "посмотреть" или "поменять на месте" —
//  это ограничение самого Firebase Auth (не наша недоработка): сменить
//  чужой пароль без входа под ним может только сервер с Admin SDK,
//  которого в этом бесплатном статическом проекте нет. Поэтому вместо
//  смены пароля используется "деактивировать старый вход + выдать новый
//  логин/пароль" — практически то же самое для конечного пользователя.
// ============================================================

function subscribeManagedAccounts(cb) {
  // "управляемые" — все, кроме участников (у участников отдельный
  // жизненный цикл, завязанный на задачи, их эта панель не трогает)
  return db.collection('users').onSnapshot(snap => {
    const list = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (d.role === 'admin' || d.role === 'guest') list.push({ uid: doc.id, ...d });
    });
    cb(list);
  }, err => console.error('managedAccounts listener error:', err));
}

async function createManagedAccount({ login, displayName, role, password }) {
  const existing = await db.collection('publicLogins').doc(login).get();
  if (existing.exists) throw new Error('Такой логин уже занят, выберите другой');

  const secondaryApp = firebase.apps.find(a => a.name === 'admin-secondary')
    || firebase.initializeApp(firebaseConfig, 'admin-secondary');
  const secAuth = secondaryApp.auth();

  const cred = await secAuth.createUserWithEmailAndPassword(loginIdToEmail(login), password);
  const newUid = cred.user.uid;
  await secAuth.signOut(); // сразу отключаемся от secondary — она нам больше не нужна

  // Пишем через ОСНОВНОЕ приложение (мы всё это время авторизованы как
  // супер-админ там) — так это честная админ-операция с точки зрения
  // правил безопасности, а не самозапись нового пользователя.
  await db.collection('users').doc(newUid).set({ login, displayName, role, participantId: null });
  await db.collection('publicLogins').doc(login).set({ displayName });
  return newUid;
}

async function deactivateManagedAccount(uid, login) {
  await db.collection('users').doc(uid).delete();
  await db.collection('publicLogins').doc(login).delete();
  // Сам Firebase Auth аккаунт при этом не удаляется (для этого нужен
  // сервер с Admin SDK) — технически по старому паролю ещё можно
  // "войти" на уровне Firebase, но без записи в users сайт сразу
  // покажет "Аккаунт не настроен" и не даст сделать вообще ничего —
  // то есть по факту доступ полностью закрыт.
}
