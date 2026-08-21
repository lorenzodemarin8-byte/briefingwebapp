let currentFlightId = null;

/* ---------- THEME ---------- */
const SUN_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.5" y1="4.5" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.5" y2="19.5"/><line x1="4.5" y1="19.5" x2="6.2" y2="17.8"/><line x1="17.8" y1="6.2" x2="19.5" y2="4.5"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  const btn = document.getElementById('theme-toggle');
  btn.innerHTML = theme === 'dark' ? MOON_ICON : SUN_ICON;
}

function initTheme() {
  applyTheme(getTheme());
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  });
}

/* ---------- ROUTING ---------- */
function router() {
  const hash = window.location.hash || '#/home';
  const parts = hash.replace('#/', '').split('/');
  if (parts[0] === 'flight' && parts[1]) {
    currentFlightId = parts[1];
    showDashboard(currentFlightId);
  } else {
    showHome();
  }
}

function showHome() {
  document.getElementById('view-home').style.display = 'block';
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('topbar-title').textContent = 'My Flights';
  document.querySelector('.bottombar').style.display = 'none';
  document.body.classList.remove('in-flight');
  renderFlightsList();
}

function showDashboard(id) {
  const flight = getFlight(id);
  document.getElementById('view-home').style.display = 'none';
  document.getElementById('view-dashboard').style.display = 'block';
  document.querySelector('.bottombar').style.display = 'flex';
  document.body.classList.add('in-flight');
  if (!flight) {
    document.getElementById('topbar-title').textContent = 'Volo non trovato';
    return;
  }
  document.getElementById('topbar-title').textContent = extractCallsign(flight.raw);
  renderDashboard(flight);
}

/* ---------- HOME: LISTA VOLI ---------- */
function renderFlightsList() {
  const all = getFlights();
  const ids = Object.keys(all);
  const list = document.getElementById('flights-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';
  if (ids.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  ids.sort((a, b) => (all[b].fetchedAt || 0) - (all[a].fetchedAt || 0)).forEach((id) => {
    const flight = all[id];
    const data = flight.raw;
    const orig = data.origin ? data.origin.icao_code : '????';
    const dest = data.destination ? data.destination.icao_code : '????';
    const callsign = extractCallsign(data);
    const std = data.times ? unixToHHMM(data.times.sched_out) : '--:--';
    const card = document.createElement('div');
    card.className = 'flight-card';
    card.innerHTML = `
      <div class="fc-callsign">${callsign}</div>
      <div class="fc-route">${orig} → ${dest}</div>
      <div class="fc-meta">STD ${std} - ${flight.state && flight.state.accepted ? 'Accepted' : 'Not accepted'}</div>
    `;
    card.addEventListener('click', () => {
      window.location.hash = `#/flight/${id}`;
    });
    list.appendChild(card);
  });
}

/* ---------- SIMBRIEF REFRESH ---------- */
async function handleRefresh() {
  const input = document.getElementById('sb-username');
  const status = document.getElementById('sb-status');
  const username = input.value.trim();
  if (!username) {
    status.textContent = 'Inserisci prima uno username o Pilot ID SimBrief.';
    return;
  }
  status.textContent = 'Recupero l\'ultimo OFP da SimBrief...';
  try {
    const data = await fetchSimBriefOFP(username);
    const id = extractFlightId(data);
    saveFlight(id, {
      raw: data,
      fetchedAt: Date.now(),
      state: (getFlight(id) && getFlight(id).state) || { accepted: false, fuelOrdered: false }
    });
    status.textContent = `Volo importato: ${extractCallsign(data)} (${data.origin ? data.origin.icao_code : '?'} → ${data.destination ? data.destination.icao_code : '?'})`;
    renderFlightsList();
  } catch (err) {
    console.error(err);
    status.textContent = 'Errore: ' + err.message;
  }
}

/* ---------- DASHBOARD ---------- */
function formatHHMM(totalSeconds) {
  if (!totalSeconds && totalSeconds !== 0) return '--:--';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m`;
}

function formatDateFromUnix(unixSeconds) {
  if (!unixSeconds) return '--';
  const d = new Date(Number(unixSeconds) * 1000);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function renderDashboard(flight) {
  try {
    const data = flight.raw;
    const general = data.general || {};
    const origin = data.origin || {};
    const destination = data.destination || {};
    const alternate = data.alternate || {};
    const times = data.times || {};
    
    document.getElementById('fi-orig').textContent = origin.icao_code || '----';
    document.getElementById('fi-dest').textContent = destination.icao_code || '----';
    document.getElementById('fi-altn').textContent = alternate.icao_code ? `(${alternate.icao_code})` : '';
    document.getElementById('fi-flighttime').textContent = formatHHMM(times.est_time_enroute || times.sched_time_enroute);
    document.getElementById('fi-blocktime').textContent = formatHHMM(times.est_block || times.sched_block);
    
    document.getElementById('fi-rwy-dep').textContent = origin.plan_rwy || '--';
    document.getElementById('fi-sid').textContent = general.sid_ident || 'NONE';
    document.getElementById('fi-date-dep').textContent = formatDateFromUnix(times.sched_out);
    document.getElementById('fi-std').textContent = unixToHHMM(times.sched_out);
    document.getElementById('fi-etd').textContent = unixToHHMM(times.est_out || times.sched_out);
    
    document.getElementById('fi-rwy-arr').textContent = destination.plan_rwy || '--';
    document.getElementById('fi-star').textContent = general.star_ident || 'NONE';
    document.getElementById('fi-date-arr').textContent = formatDateFromUnix(times.sched_in);
    document.getElementById('fi-sta').textContent = unixToHHMM(times.sched_in);
    document.getElementById('fi-eta').textContent = unixToHHMM(times.est_in || times.sched_in);
    
    const deltaEl = document.getElementById('fi-eta-delta');
    if (times.sched_in && times.est_in) {
      const diffMin = Math.round((Number(times.est_in) - Number(times.sched_in)) / 60);
      if (diffMin === 0) {
        deltaEl.textContent = '';
      } else if (diffMin < 0) {
        deltaEl.textContent = `-${String(Math.abs(diffMin)).padStart(2, '0')}m`;
        deltaEl.className = 'val delta-early';
      } else {
        deltaEl.textContent = `+${String(diffMin).padStart(2, '0')}m`;
        deltaEl.className = 'val delta-late';
      }
    } else {
      deltaEl.textContent = '';
    }
    
    document.getElementById('debug-json').textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    console.error('Errore nel rendering della Dashboard:', err);
    document.getElementById('debug-json').textContent = 'ERRORE: ' + err.message + '\n\n' + JSON.stringify(flight.raw, null, 2);
  }
}

/* ---------- INTERAZIONI ---------- */
function openDrawer() {
  document.getElementById('side-drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('side-drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('open');
}

function initInteractions() {
  const lastId = localStorage.getItem('mbriefing_sb_id');
  if (lastId) document.getElementById('sb-username').value = lastId;
  
  document.getElementById('menu-toggle').addEventListener('click', openDrawer);
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);
  document.getElementById('sb-refresh').addEventListener('click', async () => {
    await handleRefresh();
    localStorage.setItem('mbriefing_sb_id', document.getElementById('sb-username').value.trim());
  });
  
  document.getElementById('content-refresh-btn').addEventListener('click', async () => {
    const saved = localStorage.getItem('mbriefing_sb_id');
    if (!saved) {
      openDrawer();
      return;
    }
    document.getElementById('sb-username').value = saved;
    await handleRefresh();
  });
  
  document.getElementById('dashboard-back').addEventListener('click', () => {
    window.location.hash = '#/home';
  });

  // PAGER EVENT LISTENERS (CLICK E SWIPE)
  const scrollArea = document.getElementById('pager-scroll-area');
  const dots = document.querySelectorAll('.pager-dot');

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const pageIndex = parseInt(dot.dataset.page);
      const width = scrollArea.clientWidth;
      scrollArea.scrollTo({ left: width * pageIndex, behavior: 'smooth' });
    });
  });

  scrollArea.addEventListener('scroll', () => {
    const pageIndex = Math.round(scrollArea.scrollLeft / scrollArea.clientWidth);
    dots.forEach((d, idx) => {
      d.classList.toggle('active', idx === pageIndex);
    });
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

/* ---------- BOOT ---------- */
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initInteractions();
  router();
});
