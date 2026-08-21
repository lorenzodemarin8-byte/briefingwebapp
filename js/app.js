/* app.js
   Routing semplice basato su hash: #/home  |  #/flight/<id>
*/

let currentFlightId = null;

/* ---------- THEME ---------- */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
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
  renderFlightsList();
}

function showDashboard(id) {
  const flight = getFlight(id);
  document.getElementById('view-home').style.display = 'none';
  document.getElementById('view-dashboard').style.display = 'block';
  document.querySelector('.bottombar').style.display = 'flex';

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

  ids
    .sort((a, b) => (all[b].fetchedAt || 0) - (all[a].fetchedAt || 0))
    .forEach((id) => {
      const flight = all[id];
      const data = flight.raw;
      const orig = data.origin ? data.origin.icao_code : '????';
      const dest = data.destination ? data.destination.icao_code : '????';
      const callsign = extractCallsign(data);
      const std = data.times ? unixToHHMM(data.times.sched_out) : '—';

      const card = document.createElement('div');
      card.className = 'flight-card';
      card.innerHTML = `
        <div class="fc-callsign">${callsign}</div>
        <div class="fc-route">${orig} → ${dest}</div>
        <div class="fc-meta">STD ${std} · ${flight.state && flight.state.accepted ? 'Accepted' : 'Not accepted'}</div>
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

function renderDashboard(flight) {
  const data = flight.raw;
  const state = flight.state || {};

  document.getElementById('fi-callsign').textContent = extractCallsign(data);
  document.getElementById('fi-badge').textContent = state.accepted ? 'Accepted' : 'On time';
  document.getElementById('fi-orig').textContent = data.origin ? data.origin.icao_code : '—';
  document.getElementById('fi-dest').textContent = data.destination ? data.destination.icao_code : '—';
  document.getElementById('fi-rwy-orig').textContent = (data.origin && data.origin.plan_rwy) || '—';
  document.getElementById('fi-rwy-dest').textContent = (data.destination && data.destination.plan_rwy) || '—';

  const times = data.times || {};
  document.getElementById('fi-std').textContent = unixToHHMM(times.sched_out);
  document.getElementById('fi-etd').textContent = unixToHHMM(times.est_out || times.sched_out);
  document.getElementById('fi-sta').textContent = unixToHHMM(times.sched_in);
  document.getElementById('fi-eta').textContent = unixToHHMM(times.est_in || times.sched_in);

  document.getElementById('cl-status').textContent = state.accepted ? 'Accepted' : 'Not accepted';
  document.getElementById('cl-fuel').textContent = state.fuelOrdered ? 'Ordered' : 'Not ordered';

  const acceptBtn = document.getElementById('accept-flight-btn');
  acceptBtn.textContent = state.accepted ? 'Flight Accepted ✓' : 'Accept Flight';
  acceptBtn.disabled = !!state.accepted;

  const fuelBtn = document.getElementById('order-fuel-btn');
  fuelBtn.textContent = state.fuelOrdered ? 'Fuel Ordered ✓' : 'Order Fuel';
  fuelBtn.disabled = !!state.fuelOrdered;

  // Route: lista waypoint dal navlog
  const routeList = document.getElementById('route-list');
  routeList.innerHTML = '';
  const fixes = (data.navlog && data.navlog.fix) || [];
  if (fixes.length === 0) {
    routeList.innerHTML = '<li>Nessun waypoint trovato nel navlog</li>';
  } else {
    fixes.forEach((fix) => {
      const li = document.createElement('li');
      li.textContent = `${fix.ident || '?'} ${fix.via_airway && fix.via_airway !== 'DCT' ? 'via ' + fix.via_airway : ''} — FL${Math.round((fix.altitude_feet || 0) / 100)}`;
      routeList.appendChild(li);
    });
  }

  // Weather
  renderWeather(data, 'origin');
  document.querySelectorAll('.wx-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.wx === 'origin');
    tab.onclick = () => {
      document.querySelectorAll('.wx-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      renderWeather(data, tab.dataset.wx);
    };
  });

  // Weight & Fuel
  const w = data.weights || {};
  document.getElementById('w-zfw').textContent = w.est_zfw || '—';
  document.getElementById('w-zfw-max').textContent = w.max_zfw || '—';
  document.getElementById('w-tow').textContent = w.est_tow || '—';
  document.getElementById('w-tow-max').textContent = w.max_tow || '—';
  document.getElementById('w-lw').textContent = w.est_ldw || '—';
  document.getElementById('w-lw-max').textContent = w.max_ldw || '—';

  const f = data.fuel || {};
  document.getElementById('f-trip').textContent = f.plan_takeoff || f.trip || '—';
  document.getElementById('f-block').textContent = f.plan_ramp || '—';
  document.getElementById('f-landing').textContent = f.plan_landing || '—';

  // Debug raw JSON, utile finché verifichiamo i nomi esatti dei campi
  document.getElementById('debug-json').textContent = JSON.stringify(data, null, 2);
}

function renderWeather(data, which) {
  const airport = which === 'origin' ? data.origin : data.destination;
  document.getElementById('wx-airport-name').textContent = airport ? `${airport.icao_code || ''} — ${airport.name || ''}` : '—';
  document.getElementById('wx-metar').textContent = (airport && airport.metar) || 'METAR non disponibile';
  document.getElementById('wx-taf').textContent = (airport && airport.taf) || 'TAF non disponibile';
}

/* ---------- INTERAZIONI ---------- */

function initInteractions() {
  document.getElementById('sb-refresh').addEventListener('click', handleRefresh);

  document.getElementById('dashboard-back').addEventListener('click', () => {
    window.location.hash = '#/home';
  });

  document.getElementById('accept-flight-btn').addEventListener('click', () => {
    if (!currentFlightId) return;
    updateFlightState(currentFlightId, { accepted: true });
    showDashboard(currentFlightId);
  });

  document.getElementById('order-fuel-btn').addEventListener('click', () => {
    if (!currentFlightId) return;
    updateFlightState(currentFlightId, { fuelOrdered: true });
    showDashboard(currentFlightId);
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // Briefing e NavLog arrivano nella prossima fase: per ora restiamo sulla Dashboard
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
