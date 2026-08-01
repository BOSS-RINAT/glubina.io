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
    cb(snap.exists ? snap.data() : SEED_SETTINGS);
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
