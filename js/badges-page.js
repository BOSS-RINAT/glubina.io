// ============================================================
//  СТРАНИЦА НАГРАД — своя витрина у каждого участника, доступна всем
// ============================================================

function bdGetParticipantIdFromURL() {
  return new URLSearchParams(location.search).get('id');
}

function bdRenderSwitcher(participants, activeId) {
  const box = document.getElementById('bd-switcher');
  if (!box) return;
  box.innerHTML = participants.map(p => `
    <a href="badges.html?id=${p.id}"
       class="switch-pill ${p.id === activeId ? 'active' : ''}"
       style="${p.id === activeId ? `background:${p.color};border-color:${p.color}` : ''}">
      ${p.name}
    </a>
  `).join('');
}

function bdRenderGrid(participant, badgeState) {
  const earnedMap = {};
  (badgeState?.badges || []).forEach(b => { if (!earnedMap[b.id]) earnedMap[b.id] = b.date; });

  const earnedCount = Object.keys(earnedMap).length;
  const totalCount = Object.keys(BADGE_CATALOG).length;

  const cards = Object.entries(BADGE_CATALOG).map(([id, b]) => {
    const locked = !earnedMap[id];
    const dateLabel = earnedMap[id] ? mskDateLabel(earnedMap[id]) : '';
    return `
      <div class="badge-card glass ${locked ? 'badge-card-locked' : ''}" title="${b.desc}">
        <div class="badge-card-icon-wrap">${badgeIconSvg(id, locked)}</div>
        <div class="badge-card-name">${b.name}</div>
        ${locked
          ? `<div class="badge-card-desc">${b.desc}</div>`
          : `<div class="badge-card-date">${dateLabel ? 'получено ' + dateLabel : 'получено'}</div>`}
      </div>
    `;
  }).join('');

  return `
    <div class="task-note" style="margin-bottom:14px">Открыто наград: <b>${earnedCount} из ${totalCount}</b></div>
    <div class="badges-grid">${cards}</div>
  `;
}

async function renderBadgesPage() {
  const root = document.getElementById('bd-root');
  if (!root) return;

  const id = bdGetParticipantIdFromURL();
  const participant = bdParticipants.find(p => p.id === id) || bdParticipants[0];
  if (!participant) { root.innerHTML = `<div class="loading-placeholder">Нет участников</div>`; return; }

  document.title = `${participant.name} — награды`;
  bdRenderSwitcher(bdParticipants, participant.id);

  root.innerHTML = `<div class="loading-placeholder">Считаю награды…</div>`;
  try {
    const allBadges = await computeAllBadges(bdParticipants, bdSettings);
    root.innerHTML = bdRenderGrid(participant, allBadges[participant.id]);
  } catch (err) {
    console.error('Не удалось посчитать награды:', err);
    root.innerHTML = `<div class="loading-placeholder">⚠️ Не удалось посчитать награды: ${err.code || err.message || err}</div>`;
  }
}

let bdParticipants = [];
let bdSettings = SEED_SETTINGS;

document.addEventListener('DOMContentLoaded', () => {
  onAuthReady(user => {
    if (!user) return;
    let ready = { participants: false, settings: false };
    const tryRender = () => { if (ready.participants && ready.settings) renderBadgesPage(); };
    subscribeParticipants(list => { bdParticipants = list; ready.participants = true; tryRender(); });
    subscribeSettings(s => { bdSettings = s; ready.settings = true; tryRender(); });
  });
});
