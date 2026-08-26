/* app.js 
   Routing semplice basato su hash: #/home  |  #/flight/<id>
*/

let currentFlightId = null;
let currentAirportsData = []; 
let cdmInterval = null; 

let prevCdmState = { tobt: "", tsat: "", ctot: "" };
let isFirstCdmFetch = true;
let navlogActuals = {}; 

/* ---------- TOAST NOTIFICATIONS ---------- */
function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 6000);
}

/* ---------- THEME ---------- */
const SUN_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.5" y1="4.5" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.5" y2="19.5"/><line x1="4.5" y1="19.5" x2="6.2" y2="17.8"/><line x1="17.8" y1="6.2" x2="19.5" y2="4.5"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = theme === 'dark' ? MOON_ICON : SUN_ICON;
}

function initTheme() {
  applyTheme(getTheme());
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = getTheme() === 'dark' ? 'light' : 'dark';
      setTheme(next);
      applyTheme(next);
    });
  }
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
  if (cdmInterval) {
    clearInterval(cdmInterval);
    cdmInterval = null;
  }
  
  const viewHome = document.getElementById('view-home');
  const viewDash = document.getElementById('view-dashboard');
  const viewBrf = document.getElementById('view-briefing');
  const viewNav = document.getElementById('view-navlog'); 

  if (viewHome) viewHome.style.display = 'flex';
  if (viewDash) viewDash.style.display = 'none';
  if (viewBrf) viewBrf.style.display = 'none';
  if (viewNav) viewNav.style.display = 'none'; 
  
  const title = document.getElementById('topbar-title');
  if (title) title.textContent = 'My Flights';
  
  const homeBtn = document.getElementById('home-nav-btn');
  if (homeBtn) homeBtn.style.visibility = 'hidden';
  
  const infoBar = document.getElementById('flight-info-bar');
  if (infoBar) infoBar.style.display = 'none';
  
  const bottomBar = document.querySelector('.bottombar');
  if (bottomBar) bottomBar.style.display = 'none';
  
  document.body.classList.remove('in-flight');
  renderFlightsList();
}

function showDashboard(id) {
  try {
    prevCdmState = { tobt: "", tsat: "", ctot: "" };
    isFirstCdmFetch = true;

    const flight = getFlight(id);
    
    const viewHome = document.getElementById('view-home');
    const viewDash = document.getElementById('view-dashboard');
    const viewBrf = document.getElementById('view-briefing');
    const viewNav = document.getElementById('view-navlog');

    if (viewHome) viewHome.style.display = 'none';
    if (viewDash) viewDash.style.display = 'flex';
    if (viewBrf) viewBrf.style.display = 'none';
    if (viewNav) viewNav.style.display = 'none'; 
    
    const homeBtn = document.getElementById('home-nav-btn');
    if (homeBtn) homeBtn.style.visibility = 'visible';
    
    const bottomBar = document.querySelector('.bottombar');
    if (bottomBar) bottomBar.style.display = 'flex';
    
    document.body.classList.add('in-flight');
    
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    const dashTab = document.querySelector('.tab-btn[data-tab="dashboard"]');
    if (dashTab) dashTab.classList.add('active');

    if (!flight) {
      const title = document.getElementById('topbar-title');
      if (title) title.textContent = 'Volo non trovato';
      const infoBar = document.getElementById('flight-info-bar');
      if (infoBar) infoBar.style.display = 'none';
      return;
    }
    
    const title = document.getElementById('topbar-title');
    if (title) title.textContent = 'Dashboard';
    
    const infoBar = document.getElementById('flight-info-bar');
    if (infoBar) infoBar.style.display = 'flex';
    
    if (!flight.state.flaggedNotams) {
      flight.state.flaggedNotams = [];
      updateFlightState(id, { flaggedNotams: [] });
    }
    
    extractAirportsData(flight.raw); 
    renderBriefingMenu(); 

    renderFlightInfoBar(flight);
    renderDashboard(flight);
    resetPager();

  } catch (error) {
    alert("CRASH IN SHOWDASHBOARD: " + error.message);
    console.error(error);
  }
}

function renderFlightInfoBar(flight) {
  const data = flight.raw;
  const general = data.general || {};
  const aircraft = data.aircraft || {};
  const origin = data.origin || {};
  const destination = data.destination || {};
  const times = data.times || {};
  const params = data.params || {};

  const fibFlightnum = document.getElementById('fib-flightnum');
  const fibReg = document.getElementById('fib-reg');
  const fibCallsign = document.getElementById('fib-callsign');
  const fibRoute = document.getElementById('fib-route');
  const fibOfp = document.getElementById('fib-ofp');
  const fibOfpdate = document.getElementById('fib-ofpdate');
  const badge = document.getElementById('fib-status');

  if (fibFlightnum) fibFlightnum.textContent = extractCallsign(data);
  if (fibReg) fibReg.textContent = aircraft.reg || '----';
  if (fibCallsign) fibCallsign.textContent = (data.atc && data.atc.callsign) || '----';
  
  if (fibRoute) {
    fibRoute.innerHTML = `<strong>${origin.icao_code || '----'}</strong> (${unixToHHMM(times.sched_out)}) - <strong>${destination.icao_code || '----'}</strong> (${unixToHHMM(times.sched_in)})`;
  }
  
  if (fibOfp) fibOfp.textContent = general.release ? `OFP ${general.release}` : 'OFP --';
  if (fibOfpdate) fibOfpdate.textContent = params.time_generated ? formatObsDateTime(new Date(Number(params.time_generated) * 1000).toISOString()) : '--';

  const isAccepted = flight.state && flight.state.accepted;
  if (badge) {
    badge.textContent = isAccepted ? 'CONFIRMED' : 'NOT ACCEPTED';
    badge.className = isAccepted ? 'status-badge accepted' : 'status-badge not-accepted';
  }
}

/* ---------- HOME: LISTA VOLI ---------- */
function renderFlightsList() {
  const all = getFlights();
  const ids = Object.keys(all);
  const list = document.getElementById('flights-list');
  const empty = document.getElementById('empty-state');
  if(!list) return;

  list.innerHTML = '';
  if (ids.length === 0) {
    if(empty) empty.style.display = 'block';
    return;
  }
  if(empty) empty.style.display = 'none';

  ids
    .sort((a, b) => (all[b].fetchedAt || 0) - (all[a].fetchedAt || 0))
    .forEach((id) => {
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
  if (!input || !status) return;

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
      state: (getFlight(id) && getFlight(id).state) || { accepted: false, fuelOrdered: false, flaggedNotams: [] }
    });
    status.textContent = `Volo importato: ${extractCallsign(data)} (${data.origin ? data.origin.icao_code : '?'} → ${data.destination ? data.destination.icao_code : '?'})`;
    renderFlightsList();
  } catch (err) {
    console.error(err);
    status.textContent = 'Errore: ' + err.message;
  }
}

/* ---------- FUNZIONI VATSIM (A-CDM VIA MULTI-PROXY ANTICACHE) ---------- */
async function fetchVatsimCDM(cid) {
  if (!cid) return null;
  
  const url = `https://vatsim-radar.com/api/data/vatsim/pilot/${cid}/ipfs?_t=${Date.now()}`;
  let data = null;

  try {
    const resDirect = await fetch(url, { cache: 'no-store' });
    if (resDirect.ok) data = await resDirect.json();
  } catch (e) { }

  if (!data) {
    try {
      const proxyUrl1 = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
      const resProxy1 = await fetch(proxyUrl1, { cache: 'no-store' });
      if (resProxy1.ok) data = await resProxy1.json();
    } catch (e) { }
  }

  if (!data) {
    try {
      const proxyUrl2 = 'https://corsproxy.io/?' + encodeURIComponent(url);
      const resProxy2 = await fetch(proxyUrl2, { cache: 'no-store' });
      if (resProxy2.ok) data = await resProxy2.json();
    } catch (e) { }
  }

  if (!data) return null;
  
  let ctot = null;
  let tsat = null;
  let tobt = null;
  
  let rawCtot = (data.cdmData && data.cdmData.ctot) ? data.cdmData.ctot : data.ctot;
  let rawTsat = (data.cdmData && data.cdmData.tsat) ? data.cdmData.tsat : data.tsat;
  let rawTobt = (data.cdmData && data.cdmData.tobt) ? data.cdmData.tobt : (data.obt || data.tobt);

  if (rawCtot && String(rawCtot).trim() !== "") ctot = String(rawCtot).trim().substring(0, 4);
  if (rawTsat && String(rawTsat).trim() !== "") tsat = String(rawTsat).trim().substring(0, 4);
  if (rawTobt && String(rawTobt).trim() !== "") tobt = String(rawTobt).trim().substring(0, 4);
  
  return { ctot, tsat, tobt };
}

/* ---------- DASHBOARD: formattazione ---------- */
function unixToHHMM(unixSeconds) {
  if (!unixSeconds) return '--:--';
  const d = new Date(Number(unixSeconds) * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function minToHHMM(totalMin) {
  if (totalMin === "" || totalMin === null || totalMin === undefined || isNaN(totalMin)) return "--:--";
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hhmmToMin(str) {
  if (!str || !/^\d{1,2}:\d{2}$/.test(str)) return null;
  const parts = str.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

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

function getFirstAlternate(data) {
  if (!data.alternate) return {};
  if (Array.isArray(data.alternate)) return data.alternate[0] || {};
  return data.alternate;
}

function isoToUnix(isoString) {
  if (!isoString) return null;
  const t = Date.parse(isoString);
  return isNaN(t) ? null : Math.floor(t / 1000);
}

function formatObsDateTime(isoString) {
  const unix = isoToUnix(isoString);
  if (!unix) return '--';
  const d = new Date(unix * 1000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${hh}:${mm}z`;
}

function formatNotamDate(dtg) {
  if (!dtg || dtg.length < 12) return 'UFN';
  const y = parseInt(dtg.substring(0,4), 10);
  const m = parseInt(dtg.substring(4,6), 10) - 1;
  const d = parseInt(dtg.substring(6,8), 10);
  const hh = parseInt(dtg.substring(8,10), 10);
  const mm = parseInt(dtg.substring(10,12), 10);
  const date = new Date(Date.UTC(y, m, d, hh, mm));
  if (isNaN(date.getTime())) return 'UFN';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(date.getUTCDate()).padStart(2,'0')} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${String(date.getUTCHours()).padStart(2,'0')}:${String(date.getUTCMinutes()).padStart(2,'0')}z`;
}

function parseHHMM(str, baseUnixTimestamp) {
  if (!str || str.length !== 4) return null;
  const h = parseInt(str.slice(0, 2), 10);
  const m = parseInt(str.slice(2, 4), 10);
  let d = new Date(baseUnixTimestamp * 1000);
  const schedHH = d.getUTCHours();
  d.setUTCHours(h, m, 0, 0);
  
  if (h < schedHH && (schedHH - h) > 12) {
      d.setUTCDate(d.getUTCDate() + 1);
  } else if (h > schedHH && (h - schedHH) > 12) {
      d.setUTCDate(d.getUTCDate() - 1);
  }
  return Math.floor(d.getTime() / 1000);
}

/* ---------- NAVLOG DATA MAPPER ---------- */
function mapSimbriefToNavLog(ofp) {
  let fixes = (ofp.navlog && ofp.navlog.fix) ? ofp.navlog.fix : []; 
  if (!Array.isArray(fixes)) fixes = [fixes]; 

  const routeDistance = (ofp.general && ofp.general.route_distance) ? Number(ofp.general.route_distance) : 0;
  const schedOutUnix = (ofp.times && ofp.times.sched_out) ? Number(ofp.times.sched_out) : 0; 
  const altn = getFirstAlternate(ofp);

  const waypoints = [];
  let cumulativeDistance = 0;

  fixes.forEach((fix, idx) => {
    if(!fix) return;
    const legDistance = Number(fix.distance) || 0;
    cumulativeDistance += legDistance;
    const dtdNm = Math.max(0, Math.round(routeDistance - cumulativeDistance));
    const isBoundary = !!(fix.fir_crossing && fix.fir_crossing.fir);

    if (idx > 0) {
      waypoints.push({
        id: fix.ident + '_aw',
        isAirwayInfo: true,
        via: fix.via_airway || "DCT",
        trackStr: (fix.track_true && fix.track_mag) ? `${fix.track_true}T/${fix.track_mag}M` : "",
        dtwNm: legDistance,
        ttwMin: Number(fix.time_leg) / 60,
        ftwKg: Math.round(Number(fix.fuel_leg) || 0),
        flPlanned: Math.round((Number(fix.altitude_feet) || 0) / 100),
      });
    }

    waypoints.push({
      id: fix.ident || '?',
      name: (fix.type === "apt" || fix.type === "vor" || fix.type === "ndb") ? fix.name : "",
      isBoundary,
      isAirwayInfo: false,
      dtdNm,
      plannedTimeMin: Number(fix.time_total) / 60,
      plannedEfobKg: Math.round(Number(fix.fuel_plan_onboard) || 0),
    });
  });

  const fuel = ofp.fuel || {};
  return {
    originIcao: (ofp.origin && ofp.origin.icao_code) ? ofp.origin.icao_code : "",
    destIcao: (ofp.destination && ofp.destination.icao_code) ? ofp.destination.icao_code : "",
    altnIcao: (altn && altn.icao_code) ? altn.icao_code : "",
    rampFuelKg: Number(fuel.plan_ramp) || 0,
    finalReserveKg: Number(fuel.reserve) || 0,
    totalReserveKg: (Number(fuel.reserve) || 0) + (Number(fuel.alternate_burn) || 0) + (Number(fuel.contingency) || 0),
    plannedLandingFuelKg: Number(fuel.plan_landing) || 0,
    schedOutUnix,
    waypoints,
  };
}

/* ---------- RENDER NAVLOG ---------- */
function renderNavLog(flightId) {
  try {
    const flight = getFlight(flightId);
    if (!flight) return;
    const nlData = mapSimbriefToNavLog(flight.raw);
    
    const origEl = document.getElementById('nl-orig-icao');
    const destEl = document.getElementById('nl-dest-icao');
    if(origEl) origEl.textContent = nlData.originIcao;
    if(destEl) destEl.textContent = nlData.destIcao;

    function renderFuelBar() {
      const realWps = nlData.waypoints.filter(w => !w.isAirwayInfo);
      if(realWps.length === 0) return;
      
      const lastPlanned = realWps[realWps.length - 1];
      
      let lastEnteredIdx = -1;
      for (let i = 0; i < realWps.length; i++) {
        const a = navlogActuals[realWps[i].id] || { time: "", afob: "" };
        if (a.afob !== "" && !isNaN(Number(a.afob))) lastEnteredIdx = i;
      }

      let expLandingKg = nlData.plannedLandingFuelKg;
      let progressPct = 0;

      if (lastEnteredIdx !== -1) {
        const wp = realWps[lastEnteredIdx];
        const actualAfob = Number((navlogActuals[wp.id] || {}).afob);
        const remainingPlannedBurn = lastPlanned.plannedEfobKg ? (wp.plannedEfobKg - lastPlanned.plannedEfobKg) : 0;
        expLandingKg = actualAfob - remainingPlannedBurn;
        progressPct = (lastEnteredIdx / (realWps.length - 1)) * 100;
      }

      const pct = (kg) => Math.min(100, Math.max(0, (kg / nlData.rampFuelKg) * 100));
      const finresPct = pct(nlData.finalReserveKg);
      const totalResPct = pct(nlData.totalReserveKg);
      const landingPct = pct(expLandingKg);
      const landingLow = expLandingKg < nlData.totalReserveKg;

      const fbHtml = `
        <div class="navlog-fuel-bar">
          <div class="navlog-fuel-track">
            <div class="navlog-fuel-fill" style="width: ${progressPct}%;"></div>
            <div class="navlog-marker-totres" style="left: ${totalResPct}%;"></div>
            <div class="navlog-marker-landing ${landingLow ? 'bg-amber-400' : 'bg-emerald-500'}" style="left: ${landingPct}%;"></div>
            <div class="navlog-marker-finres" style="left: calc(${finresPct}% - 4px);"></div>
          </div>
          <div class="navlog-fuel-legend">
            <span class="navlog-legend-item"><span class="navlog-legend-dot-finres"></span> FINRES ${nlData.finalReserveKg}</span>
            <span class="navlog-legend-item"><span class="navlog-legend-line-totres"></span> TOTAL RESERVE ${nlData.totalReserveKg} ${nlData.altnIcao ? `(${nlData.altnIcao})` : ''}</span>
            <span class="navlog-legend-item font-medium ${landingLow ? 'text-amber-600' : 'text-emerald-600'}">
              <span class="navlog-legend-line-land ${landingLow ? 'bg-amber-400' : 'bg-emerald-500'}"></span> LANDING ${Math.round(expLandingKg)}
            </span>
          </div>
        </div>
      `;
      const container = document.getElementById('nl-fuel-bar-container');
      if(container) container.innerHTML = fbHtml;
    }

    function renderWaypoints() {
      const container = document.getElementById('nl-waypoints-container');
      if(!container) return;
      container.innerHTML = '';
      
      nlData.waypoints.forEach(wp => {
        const row = document.createElement('div');
        
        if (wp.isAirwayInfo) {
          row.className = 'navlog-row-aw';
          row.innerHTML = `
            <div>${wp.via} ${wp.trackStr ? `<span style="color:#9ca3af;">${wp.trackStr}</span>` : ''}</div>
            <div>DTW ${wp.dtwNm}</div>
            <div>TTW ${minToHHMM(wp.ttwMin)}</div>
            <div></div><div></div>
            <div>FTW ${wp.ftwKg}</div>
            <div>FL ${wp.flPlanned}</div>
            <div></div>
          `;
        } else {
          row.className = `navlog-row-wp ${wp.isBoundary ? 'is-boundary' : ''}`;
          
          const actual = navlogActuals[wp.id] || { time: "", afob: "" };
          const actTimeMin = hhmmToMin(actual.time);
          const timeDeltaMin = actTimeMin !== null ? actTimeMin - wp.plannedTimeMin : null;
          const afobKg = actual.afob !== "" ? Number(actual.afob) : null;
          const fuelDeltaKg = afobKg !== null && !isNaN(afobKg) ? afobKg - wp.plannedEfobKg : null;

          const timeColor = timeDeltaMin === null ? "color:#9ca3af;" : timeDeltaMin <= 0 ? "color:#059669;" : "color:#d97706;";
          const fuelColor = fuelDeltaKg === null ? "color:#9ca3af;" : fuelDeltaKg >= 0 ? "color:#059669;" : "color:#d97706;";
          
          row.innerHTML = `
            <div>
              <div class="navlog-wp-ident">${wp.id}</div>
              ${wp.name ? `<div class="navlog-wp-name">${wp.name}</div>` : ''}
            </div>
            <div>${wp.dtdNm}</div>
            <div style="color:#6b7280;">${minToHHMM(wp.plannedTimeMin)}</div>
            <div><input type="text" placeholder="--:--" class="navlog-input wp-time-input" data-wpid="${wp.id}" value="${actual.time}"></div>
            <div style="${timeColor} font-weight:600;">${timeDeltaMin === null ? '—' : `${timeDeltaMin > 0 ? '+' : ''}${timeDeltaMin} min`}</div>
            <div style="color:#6b7280;">${wp.plannedEfobKg}</div>
            <div><input type="number" placeholder="AFOB" class="navlog-input wp-afob-input" data-wpid="${wp.id}" value="${actual.afob}"></div>
            <div style="${fuelColor} font-weight:600;">${fuelDeltaKg === null ? '—' : `${fuelDeltaKg > 0 ? '+' : ''}${Math.round(fuelDeltaKg)}`}</div>
          `;
        }
        container.appendChild(row);
      });

      container.querySelectorAll('.wp-time-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const wpid = e.target.dataset.wpid;
          if(!navlogActuals[wpid]) navlogActuals[wpid] = { time:"", afob:"" };
          navlogActuals[wpid].time = e.target.value;
          renderWaypoints(); 
        });
      });
      container.querySelectorAll('.wp-afob-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const wpid = e.target.dataset.wpid;
          if(!navlogActuals[wpid]) navlogActuals[wpid] = { time:"", afob:"" };
          navlogActuals[wpid].afob = e.target.value;
          renderWaypoints(); 
          renderFuelBar(); 
        });
      });
    }

    renderFuelBar();
    renderWaypoints();

  } catch (error) {
    alert("CRASH IN NAVLOG: " + error.message);
    console.error(error);
  }
}

/* ---------- DASHBOARD: rendering main ---------- */
function renderDashboard(flight) {
  try {
    const data = flight.raw;
    const general = data.general || {};
    const origin = data.origin || {};
    const destination = data.destination || {};
    const times = data.times || {};
    const aircraft = data.aircraft || {};

    const altn = getFirstAlternate(data);

    const elActype = document.getElementById('fi-header-actype');
    const elFlightnum = document.getElementById('fi-header-flightnum');
    const elReg = document.getElementById('fi-header-reg');
    const elOrig = document.getElementById('fi-orig');
    const elDest = document.getElementById('fi-dest');
    const elAltn = document.getElementById('fi-altn');
    const elFlighttime = document.getElementById('fi-flighttime');
    const elBlocktime = document.getElementById('fi-blocktime');
    const elRwyDep = document.getElementById('fi-rwy-dep');
    const elSid = document.getElementById('fi-sid');
    const elDate = document.getElementById('fi-date');
    const elStd = document.getElementById('fi-std');
    const elRwyArr = document.getElementById('fi-rwy-arr');
    const elStar = document.getElementById('fi-star');
    const elDateArr = document.getElementById('fi-date-arr');
    const elSta = document.getElementById('fi-sta');

    if(elActype) elActype.textContent = aircraft.icaocode || '----';
    if(elFlightnum) elFlightnum.textContent = extractCallsign(data);
    if(elReg) elReg.textContent = aircraft.reg || '----';
    if(elOrig) elOrig.textContent = origin.icao_code || '----';
    if(elDest) elDest.textContent = destination.icao_code || '----';
    if(elAltn) elAltn.textContent = altn.icao_code ? `(${altn.icao_code})` : '';

    if(elFlighttime) elFlighttime.textContent = formatHHMM(times.est_time_enroute || times.sched_time_enroute);
    if(elBlocktime) elBlocktime.textContent = formatHHMM(times.est_block || times.sched_block);

    if(elRwyDep) elRwyDep.textContent = origin.plan_rwy || '--';
    if(elSid) elSid.textContent = general.sid_ident || 'NONE';
    if(elDate) elDate.textContent = formatDateFromUnix(times.sched_out);
    if(elStd) elStd.textContent = unixToHHMM(times.sched_out);
    
    const etdEl = document.getElementById('fi-etd');
    const etaEl = document.getElementById('fi-eta');
    const deltaEl = document.getElementById('fi-eta-delta');
    
    function updateDelta(baseUnixIn, calcUnixIn) {
      if (!baseUnixIn || !deltaEl) return;
      const diffMin = Math.round((calcUnixIn - Number(baseUnixIn)) / 60);
      if (diffMin === 0) {
        deltaEl.textContent = '';
      } else if (diffMin < 0) {
        deltaEl.textContent = `-${String(Math.abs(diffMin)).padStart(2, '0')}m`;
        deltaEl.className = 'fi-delta delta-early';
      } else {
        deltaEl.textContent = `+${String(diffMin).padStart(2, '0')}m`;
        deltaEl.className = 'fi-delta delta-late';
      }
    }

    if (cdmInterval) {
      clearInterval(cdmInterval);
      cdmInterval = null;
    }

    const ctotVal = document.getElementById('fi-ctot');
    if(ctotVal) ctotVal.textContent = '-'; 
    
    const stdUnix = Number(times.sched_out);
    const staUnix = Number(times.sched_in);

    function refreshCDM() {
      let cid = localStorage.getItem('mbriefing_vt_cid');
      const cidInput = document.getElementById('vt-cid');
      if (!cid && cidInput && cidInput.value.trim() !== '') cid = cidInput.value.trim();
      if (!cid) return; 

      fetchVatsimCDM(cid).then(cdmDataObj => {
        if (cdmDataObj) {
          const cleanTime = (t) => (t && String(t).trim().length >= 4) ? String(t).trim().substring(0, 4) : "";
          
          const newTobt = cleanTime(cdmDataObj.tobt);
          const newTsat = cleanTime(cdmDataObj.tsat);
          const newCtot = cleanTime(cdmDataObj.ctot);

          if (isFirstCdmFetch) {
            prevCdmState = { tobt: newTobt, tsat: newTsat, ctot: newCtot };
            isFirstCdmFetch = false;
          } else {
            const fmt = (t) => t ? `${t.substring(0, 2)}:${t.substring(2, 4)}z` : "";
            if (newCtot && newCtot !== prevCdmState.ctot) showToast(`SLOT notification: you have a new CTOT at ${fmt(newCtot)}`);
            if (prevCdmState.ctot && !newCtot) showToast(`SLOT notification: your CTOT has been cancelled`);
            if (newTsat && newTsat !== prevCdmState.tsat) showToast(`TSAT notification: new TSAT at ${fmt(newTsat)}`);
            if (newTobt && newTobt !== prevCdmState.tobt) showToast(`TOBT notification: new TOBT at ${fmt(newTobt)}`);
            
            prevCdmState = { tobt: newTobt, tsat: newTsat, ctot: newCtot };
          }

          if(ctotVal) {
            if (newCtot) {
              ctotVal.textContent = `${newCtot.substring(0,2)}:${newCtot.substring(2,4)}z`;
            } else {
              ctotVal.textContent = '-';
            }
          }

          let effectiveEtdUnix = stdUnix; 
          if (newTsat) {
            effectiveEtdUnix = parseHHMM(newTsat, stdUnix);
          } else if (newCtot) {
            effectiveEtdUnix = parseHHMM(newCtot, stdUnix) - 900;
          } else if (newTobt) {
            effectiveEtdUnix = parseHHMM(newTobt, stdUnix);
          }

          if(etdEl) etdEl.textContent = unixToHHMM(effectiveEtdUnix);
          
          const delaySecs = effectiveEtdUnix - stdUnix;
          const newEtaUnix = staUnix + delaySecs;
          
          if(etaEl) etaEl.textContent = unixToHHMM(newEtaUnix);
          updateDelta(staUnix, newEtaUnix);
        }
      });
    }

    if(etdEl) etdEl.textContent = unixToHHMM(times.est_out || times.sched_out);
    if(etaEl) etaEl.textContent = unixToHHMM(times.est_in || times.sched_in);
    updateDelta(times.sched_in, (times.est_in || times.sched_in));

    refreshCDM();
    cdmInterval = setInterval(refreshCDM, 60000); 

    if(elRwyArr) elRwyArr.textContent = destination.plan_rwy || '--';
    if(elStar) elStar.textContent = general.star_ident || 'NONE';
    if(elDateArr) elDateArr.textContent = formatDateFromUnix(times.sched_in);
    if(elSta) elSta.textContent = unixToHHMM(times.sched_in);

    applyAcceptanceUI(flight.state && flight.state.accepted);

    // ---- WEIGHT ----
    const w = data.weights || {};
    const setW = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = (val != null) ? val : '---'; };
    setW('w-dow', w.oew);
    setW('w-load', w.payload);
    setW('w-zfw', w.est_zfw);
    setW('w-zfw-limit', w.max_zfw);
    setW('w-tow', w.est_tow);
    setW('w-tow-limit', w.max_tow);
    setW('w-lw', w.est_ldw);
    setW('w-lw-limit', w.max_ldw);

    // ---- FUEL ----
    const f = data.fuel || {};
    const tripSec = Number(times.est_time_enroute) || 0;
    const contSec = Number(times.contfuel_time) || 0;
    const finresSec = Number(times.reserve_time) || 0;
    const altnSec = Number(altn.ete) || 0;
    const taxiOutSec = Number(times.taxi_out) || 0;
    const minTakeoffSec = tripSec + contSec + finresSec + altnSec;

    setW('f-trip-kg', f.enroute_burn);
    setW('f-mtow-kg', f.min_takeoff);
    setW('f-taxi-kg', f.taxi);
    setW('f-block-kg', f.plan_ramp);
    setW('f-landing-kg', f.plan_landing);

    const elTripTime = document.getElementById('f-trip-time');
    if(elTripTime) elTripTime.textContent = formatHHMM(tripSec);
    const elMtowTime = document.getElementById('f-mtow-time');
    if(elMtowTime) elMtowTime.textContent = minTakeoffSec ? formatHHMM(minTakeoffSec) : '--:--';
    const elTaxiTime = document.getElementById('f-taxi-time');
    if(elTaxiTime) elTaxiTime.textContent = taxiOutSec ? formatHHMM(taxiOutSec) : '--:--';
    
    setW('f-block-time', '--:--');
    setW('f-landing-time', '--:--');
    setW('f-disc-time', '--:--');
    setW('f-disc-kg', (w.max_ldw != null && w.est_ldw != null) ? (w.max_ldw - w.est_ldw) : '---');

    // ---- WEATHER ----
    const wxAirports = { origin, destination, alternate: altn };
    const wtabOrig = document.getElementById('wx-tab-origin');
    const wtabDest = document.getElementById('wx-tab-destination');
    if(wtabOrig) wtabOrig.textContent = origin.icao_code || 'ORIG';
    if(wtabDest) wtabDest.textContent = destination.icao_code || 'DEST';
    renderWeather(wxAirports, 'origin');

    document.querySelectorAll('.wx-tab').forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll('.wx-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        renderWeather(wxAirports, tab.dataset.wx);
      };
    });

    // ---- ROUTE ----
    renderRouteMap(data);
    renderRouteSummary(data, origin, destination, general);
    renderClassicOfpText(data);

  } catch (err) {
    alert("CRASH IN RENDER DASHBOARD: " + err.message);
    console.error('Errore nel rendering della Dashboard:', err);
  }
}

/* ---------- BRIEFING: GENERAL ---------- */
function findTocFix(data) {
  const list = data.navlog && data.navlog.fix;
  if (!list) return null;
  const arr = Array.isArray(list) ? list : [list];
  return arr.find((f) => f.ident === 'TOC') || null;
}

function renderGeneralSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const general = data.general || {};
  const aircraft = data.aircraft || {};
  const origin = data.origin || {};
  const destination = data.destination || {};
  const times = data.times || {};
  const fuel = data.fuel || {};
  const atc = data.atc || {};
  const toc = findTocFix(data);

  const setT = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };

  setT('gen-dep', origin.iata_code ? `${origin.icao_code}/${origin.iata_code}` : (origin.icao_code || '----'));
  setT('gen-arr', destination.iata_code ? `${destination.icao_code}/${destination.iata_code}` : (destination.icao_code || '----'));
  setT('gen-callsign', atc.callsign || '—');
  setT('gen-std', `${unixToHHMM(times.sched_out)}/${unixToHHMM(times.sched_off)}`);
  setT('gen-sta', `${unixToHHMM(times.sched_on)}/${unixToHHMM(times.sched_in)}`);
  setT('gen-actype', aircraft.name || aircraft.icaocode || '—');
  setT('gen-reg', aircraft.reg || '—');
  setT('gen-crzsys', general.cruise_profile || (general.costindex ? `CI ${general.costindex}` : '—'));
  setT('gen-gnddist', general.route_distance ? `${general.route_distance}NM` : '—');
  setT('gen-airdist', general.air_distance ? `${general.air_distance}NM` : '—');
  setT('gen-tocwind', toc ? `${toc.wind_dir}°/${toc.wind_spd}KT` : '—');

  let avgWcStr = '—';
  if (general.avg_wind_comp) {
    let wcStr = String(general.avg_wind_comp).toUpperCase();
    let isNegative = wcStr.includes('M') || wcStr.includes('-');
    let num = Math.abs(parseInt(wcStr.replace(/[^\d]/g, ''), 10));
    if (!isNaN(num)) {
      avgWcStr = (isNegative ? 'M ' : 'P ') + num.toString().padStart(3, '0');
    }
  }
  setT('gen-avgwc', avgWcStr);

  let initialAltStr = '—';
  if (general.initial_altitude) {
    let m = String(general.initial_altitude).match(/\d+/);
    if (m) {
      let n = parseInt(m[0], 10);
      if (n >= 1000) n = Math.round(n / 100);
      initialAltStr = n.toString();
    }
  }
  setT('gen-alt', initialAltStr);
  
  if (toc && toc.oat_isa_dev !== undefined) {
     const isa = Number(toc.oat_isa_dev);
     const sign = isa >= 0 ? 'P ' : 'M ';
     const val = Math.abs(isa).toString().padStart(3, '0');
     setT('gen-tocisa', `${sign}${val}`);
  } else {
     setT('gen-tocisa', '—');
  }

  setT('gen-avgff', fuel.avg_fuel_flow ? `${fuel.avg_fuel_flow}` : '—');
  
  if (aircraft.fuelfactor) {
     const bias = (Number(aircraft.fuelfactor) - 1) * 100;
     const sign = bias >= 0 ? 'P ' : 'M ';
     setT('gen-fuelbias', `${sign}${Math.abs(bias).toFixed(1)}`);
  } else {
     setT('gen-fuelbias', '—');
  }
  
  setT('gen-tkofaltn', (data.takeoff_altn && data.takeoff_altn.icao_code) || '-');

  // WIDGET PESI
  setT('gen-w-dow-plan', data.weights.oew || '—');
  setT('gen-w-load-plan', data.weights.payload || '—');
  setT('gen-w-zfw-plan', data.weights.est_zfw || '—');
  setT('gen-w-tow-plan', data.weights.est_tow || '—');
  setT('gen-w-lw-plan', data.weights.est_ldw || '—');
  setT('gen-w-zfw-struct', data.weights.max_zfw || '—');
  setT('gen-w-tow-struct', data.weights.max_tow_struct || data.weights.max_tow || '—');
  setT('gen-w-lw-struct', data.weights.max_ldw || '—');

  let opTow = '—';
  if (data.tlr && data.tlr.takeoff && data.tlr.takeoff.runway) {
    let rwyList = Array.isArray(data.tlr.takeoff.runway) ? data.tlr.takeoff.runway : [data.tlr.takeoff.runway];
    let rwy = rwyList.find(r => String(r.identifier).padStart(2, '0') === String(origin.plan_rwy).padStart(2, '0'));
    if (rwy && rwy.max_weight) opTow = rwy.max_weight;
  }
  setT('gen-w-tow-op', opTow);

  let opLw = '—';
  if (data.tlr && data.tlr.landing && data.tlr.landing.runway) {
    let rwyList = Array.isArray(data.tlr.landing.runway) ? data.tlr.landing.runway : [data.tlr.landing.runway];
    let rwy = rwyList.find(r => String(r.identifier).padStart(2, '0') === String(destination.plan_rwy).padStart(2, '0'));
    if (rwy) {
      let cond = data.tlr.landing.conditions && data.tlr.landing.conditions.surface_condition;
      if (cond === 'wet' && rwy.max_weight_wet) opLw = rwy.max_weight_wet;
      else if (rwy.max_weight_dry) opLw = rwy.max_weight_dry;
      else if (rwy.max_weight) opLw = rwy.max_weight;
    }
  }
  setT('gen-w-lw-op', opLw);

  setupWeightLimitCheck('gen-w-zfw-act', null, 'gen-w-zfw-struct');
  setupWeightLimitCheck('gen-w-tow-act', 'gen-w-tow-op', 'gen-w-tow-struct');
  setupWeightLimitCheck('gen-w-lw-act', 'gen-w-lw-op', 'gen-w-lw-struct');
}

function setupWeightLimitCheck(inputId, opId, structId) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  
  const newInp = inp.cloneNode(true);
  inp.parentNode.replaceChild(newInp, inp);
  
  newInp.addEventListener('input', () => {
    newInp.classList.remove('limit-exceeded');
    const val = parseFloat(newInp.value);
    if (isNaN(val)) return;
    
    let opLim = opId ? parseFloat(document.getElementById(opId).textContent) : NaN;
    let strLim = structId ? parseFloat(document.getElementById(structId).textContent) : NaN;
    
    if ((!isNaN(opLim) && val > opLim) || (!isNaN(strLim) && val > strLim)) {
      newInp.classList.add('limit-exceeded');
    }
  });
}

/* ---------- BRIEFING: FUEL ---------- */
function renderFuelSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const fuel = data.fuel || {};
  const times = data.times || {};
  const dest = data.destination || {};
  const orig = data.origin || {};
  const weights = data.weights || {};
  const alternates = data.alternate ? (Array.isArray(data.alternate) ? data.alternate : [data.alternate]) : [];

  const setT = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };

  setT('brf-f-dest', dest.icao_code || '');
  setT('brf-f-orig', orig.icao_code || '');

  const tripFuel = Number(fuel.enroute_burn) || 0;
  const contFuel = Number(fuel.contingency) || 0;
  const finresFuel = Number(fuel.reserve) || 0;
  const taxiFuel = Number(fuel.taxi) || 0;
  const avgFF = Number(fuel.avg_fuel_flow) || 0;

  const tripTime = Number(times.est_time_enroute) || 0;
  const contTime = Number(times.contfuel_time) || 0;
  const finresTime = Number(times.reserve_time) || 0;
  const taxiTime = Number(times.taxi_out) || 0;

  setT('brf-f-trip-fuel', tripFuel);
  setT('brf-f-trip-time', formatHHMM(tripTime));
  setT('brf-f-cont-fuel', contFuel);
  setT('brf-f-cont-time', formatHHMM(contTime));
  setT('brf-f-finres-fuel', finresFuel);
  setT('brf-f-finres-time', formatHHMM(finresTime));
  setT('brf-f-taxi-fuel', taxiFuel);
  setT('brf-f-taxi-time', formatHHMM(taxiTime));

  let maxDisc = '---';
  if (weights.max_ldw != null && weights.est_ldw != null) {
      maxDisc = weights.max_ldw - weights.est_ldw;
  }
  setT('brf-f-max-disc', maxDisc);

  const sel = document.getElementById('brf-f-altn-select');
  if(sel) {
    sel.innerHTML = '';
    if (alternates.length > 0) {
      alternates.forEach((alt, idx) => {
        let opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = alt.icao_code || `ALT${idx+1}`;
        sel.appendChild(opt);
      });
    } else {
      let opt = document.createElement('option');
      opt.value = '-1';
      opt.textContent = 'NONE';
      sel.appendChild(opt);
    }
  }

  const blockInput = document.getElementById('brf-block-input');
  const orderBtn = document.getElementById('brf-order-btn');
  const discInput = document.getElementById('brf-disc-fuel-input');
  const discTimeVal = document.getElementById('brf-disc-time-val');
  const discReason = document.getElementById('brf-disc-reason-input');

  let isBlockFuelManual = false;

  function updateFuelCalcs() {
    const activeSel = document.getElementById('brf-f-altn-select');
    let altnFuel = 0;
    let altnTime = 0;
    if (activeSel) {
        let idx = parseInt(activeSel.value, 10);
        if (idx >= 0 && alternates[idx]) {
          altnFuel = Number(alternates[idx].burn) || 0;
          altnTime = Number(alternates[idx].ete) || 0;
        }
    }

    setT('brf-f-altn-fuel', altnFuel);
    setT('brf-f-altn-time', formatHHMM(altnTime));

    const tkofFuel = tripFuel + contFuel + altnFuel + finresFuel;
    const tkofTime = tripTime + contTime + altnTime + finresTime;

    setT('brf-f-tkof-fuel', tkofFuel);
    setT('brf-f-tkof-time', formatHHMM(tkofTime));

    const minBlockFuel = tkofFuel + taxiFuel;
    setT('brf-f-minblock-fuel', minBlockFuel);

    let discFuel = 0;
    if(document.getElementById('brf-disc-fuel-input')) {
      discFuel = Number(document.getElementById('brf-disc-fuel-input').value) || 0;
    }
    let calcBlockFuel = Math.ceil((minBlockFuel + discFuel) / 100) * 100;

    const blockInputEl = document.getElementById('brf-block-input');
    if (!isBlockFuelManual && blockInputEl) {
      blockInputEl.value = calcBlockFuel;
    }

    const estLndFuel = fuel.plan_landing || '---';
    setT('brf-f-estlnd-fuel', estLndFuel);

    let totFinresFuel = finresFuel + altnFuel;
    let totFinresTime = finresTime + altnTime;
    setT('brf-f-totfinres-fuel', totFinresFuel);
    setT('brf-f-totfinres-time', '(' + formatHHMM(totFinresTime) + ')');

    const orderBtnEl = document.getElementById('brf-order-btn');
    if(orderBtnEl) {
      orderBtnEl.classList.remove('btn-ordered');
      orderBtnEl.textContent = 'ORDER';
    }
  }

  if(sel) {
    const newSel = sel.cloneNode(true);
    sel.parentNode.replaceChild(newSel, sel);
    newSel.addEventListener('change', () => {
      isBlockFuelManual = false;
      updateFuelCalcs();
    });
  }
  
  if(discInput) {
    const newDisc = discInput.cloneNode(true);
    discInput.parentNode.replaceChild(newDisc, discInput);
    newDisc.value = '';
    if(discTimeVal) discTimeVal.textContent = '--:--';
    if(discReason) discReason.value = '';

    newDisc.addEventListener('input', () => {
      let val = Number(newDisc.value);
      if (val > 0 && avgFF > 0) {
        let secs = Math.round((val / avgFF) * 3600);
        if(discTimeVal) discTimeVal.textContent = formatHHMM(secs);
      } else {
        if(discTimeVal) discTimeVal.textContent = '--:--';
      }
      isBlockFuelManual = false;
      updateFuelCalcs();
    });
  }

  if(blockInput) {
    const newBlockInput = blockInput.cloneNode(true);
    blockInput.parentNode.replaceChild(newBlockInput, blockInput);
    newBlockInput.addEventListener('input', () => {
      isBlockFuelManual = true;
      updateFuelCalcs();
    });
  }

  if(orderBtn) {
    const newOrderBtn = orderBtn.cloneNode(true);
    orderBtn.parentNode.replaceChild(newOrderBtn, orderBtn);
    newOrderBtn.addEventListener('click', () => {
      newOrderBtn.classList.add('btn-ordered');
      newOrderBtn.textContent = 'ORDER SENT';
    });
  }

  const impacts = data.impacts || {};

  function formatImpact(imp) {
    let bPrefix = 'P', bVal = '0000', tPrefix = 'P', tVal = '0000';
    if (imp) {
      let bDiff = parseInt(imp.burn_difference, 10) || 0;
      let tDiff = parseInt(imp.time_difference, 10) || 0;
      
      bPrefix = bDiff < 0 ? 'M' : 'P';
      tPrefix = tDiff < 0 ? 'M' : 'P';
      
      bVal = Math.abs(bDiff).toString().padStart(4, '0');
      
      let tSec = Math.abs(tDiff);
      let tMins = Math.floor(tSec / 60); 
      let h = Math.floor(tMins / 60);
      let m = tMins % 60;
      tVal = String(h).padStart(2, '0') + String(m).padStart(2, '0');
    }
    return { burn: `${bPrefix} ${bVal}`, time: `${tPrefix} ${tVal}` };
  }

  function rowHtml(col1, col2, imp) {
    const fmt = formatImpact(imp);
    return `<tr>
      <td class="imp-bold">${col1}</td>
      <td>${col2}</td>
      <td>TRIP ${fmt.burn} kgs</td>
      <td>TIME ${fmt.time}</td>
    </tr>`;
  }

  const wUp = impacts.zfw_plus_1000 || impacts.plus_1000 || impacts.weight_up || null;
  const wDn = impacts.zfw_minus_1000 || impacts.minus_1000 || impacts.weight_down || null;
  const fUp = impacts.plus_2000ft || impacts.plus_2000 || impacts.level_up || null;
  const fDn = impacts.minus_2000ft || impacts.minus_2000 || impacts.level_down || null;
  const sDn = impacts.lower_ci || impacts.speed_down || impacts.m54 || null;
  const sUp = impacts.higher_ci || impacts.speed_up || impacts.p54 || null;

  let impHtml = '';
  impHtml += rowHtml('WEIGHT CHANGE', 'UP 1.0', wUp);
  impHtml += rowHtml('', 'DN 1.0', wDn);
  impHtml += '<tr class="brf-row-separator"><td colspan="4"></td></tr>';
  impHtml += rowHtml('FL CHANGE', '2000 ABOVE', fUp);
  impHtml += rowHtml('', '2000 BELOW', fDn);
  impHtml += '<tr class="brf-row-separator"><td colspan="4"></td></tr>';
  impHtml += rowHtml('SPEED CHANGE', 'CI 0', sDn);
  impHtml += rowHtml('', 'CI 100', sUp);

  const tBody = document.getElementById('brf-impacts-tbody');
  if(tBody) tBody.innerHTML = impHtml;
  updateFuelCalcs();
}

/* ---------- BRIEFING: ATC ---------- */
function renderAtcSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const atc = data.atc || {};
  const atcText = atc.flightplan_text || 'ATC Flight Plan non disponibile.';
  const atcEl = document.getElementById('brf-atc-text');
  if(atcEl) atcEl.textContent = atcText.trim();
}

/* ---------- BRIEFING: DISPATCH INFO ---------- */
function renderDispatchSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const general = data.general || {};
  const rmk = (general.dx_rmk && general.dx_rmk.trim() !== '') ? general.dx_rmk : 'NONE';
  const dxEl = document.getElementById('brf-dispatch-text');
  if(dxEl) dxEl.textContent = rmk;
}

/* ---------- BRIEFING: MENU AEROPORTI & WX/RUNWAYS/NOTAMS ---------- */
function decodeQCodeCategory(qcode) {
  if (!qcode || qcode.length < 3) return 'AIRPORT';
  const sub2 = qcode.substring(1, 3).toUpperCase();
  
  if (sub2 === 'PD') return 'SID';
  if (sub2 === 'PA') return 'STAR';
  if (sub2 === 'PI') return 'APPROACH PROCEDURES';
  if (sub2 === 'MR') return 'RUNWAY';
  
  return 'AIRPORT';
}

function extractAirportsData(data) {
  currentAirportsData = [];
  
  let allNotams = [];
  if (data.notams && data.notams.notamdrec) {
    allNotams = Array.isArray(data.notams.notamdrec) ? data.notams.notamdrec : [data.notams.notamdrec];
  }

  function getAptNotams(icao) {
    return allNotams.filter(n => n.cns_location_id === icao || n.icao_id === icao || n.location_icao === icao);
  }

  if (data.origin) {
    currentAirportsData.push({
      type: 'Departure',
      icao: data.origin.icao_code,
      iata: data.origin.iata_code,
      name: data.origin.name,
      metar: data.origin.metar,
      metar_time: data.origin.metar_time,
      metar_category: data.origin.metar_category,
      taf: data.origin.taf,
      taf_time: data.origin.taf_time,
      runways: (data.tlr && data.tlr.takeoff) ? data.tlr.takeoff.runway : null,
      notams: getAptNotams(data.origin.icao_code)
    });
  }
  
  if (data.destination) {
    currentAirportsData.push({
      type: 'Arrival',
      icao: data.destination.icao_code,
      iata: data.destination.iata_code,
      name: data.destination.name,
      metar: data.destination.metar,
      metar_time: data.destination.metar_time,
      metar_category: data.destination.metar_category,
      taf: data.destination.taf,
      taf_time: data.destination.taf_time,
      runways: (data.tlr && data.tlr.landing) ? data.tlr.landing.runway : null,
      notams: getAptNotams(data.destination.icao_code)
    });
  }

  if (data.alternate) {
    let altns = Array.isArray(data.alternate) ? data.alternate : [data.alternate];
    altns.forEach(alt => {
      if (alt && alt.icao_code) {
        currentAirportsData.push({
          type: 'Arrival Alternate',
          icao: alt.icao_code,
          iata: alt.iata_code,
          name: alt.name,
          metar: alt.metar,
          metar_time: alt.metar_time,
          metar_category: alt.metar_category,
          taf: alt.taf,
          taf_time: alt.taf_time,
          runways: null,
          notams: getAptNotams(alt.icao_code)
        });
      }
    });
  }
}

function renderBriefingMenu() {
  const listEl = document.getElementById('brf-wx-menu-list');
  if(!listEl) return;
  listEl.innerHTML = '';

  currentAirportsData.forEach((apt, index) => {
    const div = document.createElement('div');
    div.className = 'briefing-item brf-apt-item';
    div.dataset.aptIndex = index;
    
    let title = apt.icao || '????';
    if (apt.iata) title += `/${apt.iata}`;

    div.innerHTML = `
      <div class="brf-apt-item-main">${title}</div>
      <div class="brf-apt-item-sub">${apt.type}</div>
    `;
    listEl.appendChild(div);
  });

  bindBriefingTabs();
}

function renderAirportSection(index) {
  const flight = getFlight(currentFlightId);
  if (!flight) return;
  if (!flight.state.flaggedNotams) flight.state.flaggedNotams = [];
  
  const apt = currentAirportsData[index];
  if (!apt) return;

  const setT = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };

  setT('brf-apt-metar-text', apt.metar || 'METAR non disponibile');
  setT('brf-apt-taf-text', apt.taf || 'TAF non disponibile');
  setT('brf-apt-metar-age', formatObsDateTime(apt.metar_time));
  setT('brf-apt-taf-age', apt.taf_time ? `Issued ${formatObsDateTime(apt.taf_time)}` : '');

  const badge = document.getElementById('brf-apt-vmc-badge');
  if(badge) {
    const category = (apt.metar_category || '').toLowerCase();
    if (category === 'vfr' || category === 'mvfr') {
      badge.textContent = 'VMC';
      badge.className = 'wx-badge vmc';
    } else if (category === 'ifr' || category === 'lifr') {
      badge.textContent = 'IMC';
      badge.className = 'wx-badge imc';
    } else {
      badge.textContent = '--';
      badge.className = 'wx-badge';
    }
  }

  // RUNWAYS
  const rwyWidget = document.getElementById('brf-apt-rwy-widget');
  const rwyTbody = document.getElementById('brf-apt-rwy-tbody');
  
  if ((apt.type === 'Departure' || apt.type === 'Arrival') && apt.runways && rwyWidget && rwyTbody) {
    rwyWidget.style.display = 'flex';
    rwyTbody.innerHTML = '';
    
    let rwyList = Array.isArray(apt.runways) ? apt.runways : [apt.runways];
    
    rwyList.forEach(r => {
      let rName = r.identifier ? `RW${String(r.identifier).padStart(2, '0')}` : '---';
      let rLenFt = parseFloat(r.length || r.length_tora || r.length_lda);
      let rLen = !isNaN(rLenFt) ? Math.round(rLenFt * 0.3048) + ' m' : '---';
      let rElev = r.elevation ? r.elevation + ' ft' : '---';
      let rMag = r.magnetic_course || '---';
      let rTrue = r.true_course || '---';
      
      let hwRaw = Number(r.headwind_component);
      let hwVal = '---';
      let hwClass = 'wind-green';
      let hwArrow = '';
      
      if (!isNaN(hwRaw)) {
        if (hwRaw < 0) {
          hwArrow = '↑'; 
          hwVal = Math.abs(hwRaw);
          hwClass = hwVal > 10 ? 'wind-red' : 'wind-amber';
        } else {
          hwArrow = '↓'; 
          hwVal = hwRaw;
          hwClass = 'wind-green';
        }
      }

      let xwRaw = Number(r.crosswind_component);
      let xwVal = '---';
      let xwClass = 'wind-green';
      if (!isNaN(xwRaw)) {
        xwVal = Math.abs(xwRaw);
        xwClass = xwVal > 10 ? 'wind-amber' : 'wind-green';
      }

      let row = document.createElement('tr');
      row.innerHTML = `
        <td>${rName}</td>
        <td>${rLen}</td>
        <td>${rElev}</td>
        <td>${rMag}</td>
        <td>${rTrue}</td>
        <td>
          <div class="wind-comp-cell">
            <div class="wind-box ${hwClass}"><span>${hwArrow}</span><span>${hwVal}</span></div>
            <div class="wind-box ${xwClass}"><span>${xwVal}</span></div>
          </div>
        </td>
      `;
      rwyTbody.appendChild(row);
    });
  } else if (rwyWidget) {
    rwyWidget.style.display = 'none';
  }

  // NOTAMs
  const notamWidget = document.getElementById('brf-apt-notam-widget');
  const notamBody = document.getElementById('brf-apt-notam-body');
  
  if (apt.notams && apt.notams.length > 0 && notamWidget && notamBody) {
    notamWidget.style.display = 'flex';
    
    let notamHtml = `
      <div class="notam-filter-bar">
        <label for="brf-notam-filter">Show:</label>
        <select id="brf-notam-filter" class="brf-select">
          <option value="all">All</option>
          <option value="flagged">Flagged</option>
        </select>
      </div>
    `;
    
    const grouped = {};
    apt.notams.forEach(n => {
      const cat = decodeQCodeCategory(n.notam_qcode);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(n);
    });
    
    const catOrder = { 'RUNWAY': 1, 'SID': 2, 'STAR': 3, 'APPROACH PROCEDURES': 4, 'AIRPORT': 5 };
    const sortedCats = Object.keys(grouped).sort((a, b) => (catOrder[a] || 99) - (catOrder[b] || 99));
    
    for (const cat of sortedCats) {
      const list = grouped[cat];
      notamHtml += `<div class="notam-category-wrapper">`;
      notamHtml += `<div class="notam-category-title">${cat}</div>`;
      
      list.forEach(n => {
        const notamId = n.notam_id || 'UNKNOWN';
        const start = formatNotamDate(n.notam_effective_dtg || n.notam_created_dtg);
        const end = formatNotamDate(n.notam_expire_dtg || n.notam_expire_dtg_estimated);
        
        let rawText = n.notam_report || n.notam_text || '';
        
        let safeText = rawText
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/\b(TWY|RWY|VOR|LOC|NDB|ILS|RNP|RNAV|DME|STAR|SID|GLS|GNSS|GPS)\b/g, '<span class="notam-hl-warn">$1</span>')
          .replace(/(\bCLSD\b|U\/S|\bNOT AVAILABLE\b|\bNOT AVBL\b|\bDO NOT USE\b)/g, '<span class="notam-hl-danger">$1</span>');
          
        let isFlagged = flight.state.flaggedNotams.includes(notamId);
        let flagClass = isFlagged ? 'flagged' : '';

        notamHtml += `
          <div class="notam-box" data-notam-id="${notamId}">
            <div class="notam-top-row">
              <div class="notam-badge">${cat}</div>
              <button class="notam-flag ${flagClass}" aria-label="Flag NOTAM">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
              </button>
            </div>
            <div class="notam-header">${notamId} - ${start} - ${end}</div>
            <div class="notam-body">${safeText}</div>
          </div>
        `;
      });
      notamHtml += `</div>`;
    }
    
    notamBody.innerHTML = notamHtml;

    const filterSelect = document.getElementById('brf-notam-filter');
    const flagBtns = notamBody.querySelectorAll('.notam-flag');

    function applyNotamFilter() {
      if(!filterSelect) return;
      const mode = filterSelect.value;
      notamBody.querySelectorAll('.notam-category-wrapper').forEach(wrapper => {
        let visibleCount = 0;
        wrapper.querySelectorAll('.notam-box').forEach(box => {
          const isFlagged = box.querySelector('.notam-flag').classList.contains('flagged');
          if (mode === 'flagged' && !isFlagged) {
            box.style.display = 'none';
          } else {
            box.style.display = 'block';
            visibleCount++;
          }
        });
        wrapper.style.display = visibleCount > 0 ? 'block' : 'none';
      });
    }

    if(filterSelect) filterSelect.addEventListener('change', applyNotamFilter);

    flagBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const box = e.currentTarget.closest('.notam-box');
        const nid = box.dataset.notamId;
        
        let fState = flight.state || {};
        let fNotams = fState.flaggedNotams || [];
        
        if (fNotams.includes(nid)) {
          fNotams = fNotams.filter(id => id !== nid);
          e.currentTarget.classList.remove('flagged');
        } else {
          fNotams.push(nid);
          e.currentTarget.classList.add('flagged');
        }
        
        updateFlightState(currentFlightId, { flaggedNotams: fNotams });
        flight.state.flaggedNotams = fNotams;
        
        if (filterSelect && filterSelect.value === 'flagged') {
          applyNotamFilter();
        }
      });
    });

  } else if (notamWidget) {
    notamWidget.style.display = 'none';
  }
}

function renderClassicOfpText(data) {
  const container = document.getElementById('classic-ofp-container');
  if (!container) return;

  const html = data.text && data.text.plan_html;
  if (!html) {
    container.innerHTML = '<p class="classic-ofp-empty">Testo OFP non disponibile per questo volo.</p>';
    return;
  }

  const pages = html
    .split(/<h2[^>]*page-break-after[^>]*>[\s\S]*?<\/h2>/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  container.innerHTML = pages
    .map((page) => `<div class="ofp-page"><pre class="ofp-page-text">${page}</pre></div>`)
    .join('');
}

function renderWeather(wxAirports, which) {
  const airport = wxAirports[which] || {};
  const setT = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
  
  setT('wx-metar-text', airport.metar || 'METAR non disponibile');
  setT('wx-taf-text', airport.taf || 'TAF non disponibile');
  setT('wx-metar-age', formatObsDateTime(airport.metar_time));
  setT('wx-taf-age', airport.taf_time ? `Issued ${formatObsDateTime(airport.taf_time)}` : '');

  const badge = document.getElementById('wx-vmc-badge');
  if(badge) {
    const category = (airport.metar_category || '').toLowerCase();
    if (category === 'vfr' || category === 'mvfr') {
      badge.textContent = 'VMC';
      badge.className = 'wx-badge vmc';
    } else if (category === 'ifr' || category === 'lifr') {
      badge.textContent = 'IMC';
      badge.className = 'wx-badge imc';
    } else {
      badge.textContent = '--';
      badge.className = 'wx-badge';
    }
  }
}

function getMapList(data) {
  const images = data.images || {};
  if (!images.map) return [];
  return Array.isArray(images.map) ? images.map : [images.map];
}

function findMapUrl(data, nameContains) {
  const images = data.images || {};
  if (!images.directory) return null;
  const entry = getMapList(data).find((m) => (m.name || '').toLowerCase().includes(nameContains));
  return entry ? images.directory + entry.link : null;
}

function renderRouteMap(data) {
  const img = document.getElementById('route-map-img');
  const fallback = document.getElementById('route-map-fallback');
  const url = findMapUrl(data, 'route');

  if (!url) {
    if(img) img.style.display = 'none';
    if(fallback) {
      fallback.style.display = 'block';
      fallback.innerHTML = 'Mappa rotta non disponibile. Controlla che "Maps" sia attivo tra le opzioni del dispatch su SimBrief.';
    }
    return;
  }

  if(img) {
    img.onload = () => { if(fallback) fallback.style.display = 'none'; };
    img.onerror = () => {
      img.style.display = 'none';
      if(fallback) {
        fallback.style.display = 'block';
        fallback.innerHTML = `Impossibile mostrare la mappa qui dentro. <a href="${url}" target="_blank" rel="noopener">Aprila in una nuova scheda</a>.`;
      }
    };
    img.style.display = 'block';
    img.src = url;
  }
}

function renderRouteSummary(data, origin, destination, general) {
  const el = document.getElementById('route-summary');
  if(!el) return;
  const route = general.route || '';
  const routeArray = route.split(' ');

  if (!data.navlog || !data.navlog.fix) {
    el.innerHTML = `<strong>${origin.icao_code || '----'}</strong>/${origin.plan_rwy || '--'} ${route} <strong>${destination.icao_code || '----'}</strong>/${destination.plan_rwy || '--'}`;
    return;
  }

  let fixes = data.navlog.fix;
  if (!Array.isArray(fixes)) fixes = [fixes];
  
  const tocIndex = fixes.findIndex((f) => (f.ident || '').toUpperCase().includes('TOC'));
  const todIndex = fixes.findIndex((f) => (f.ident || '').toUpperCase().includes('TOD'));

  let currentFL = 0;
  if (tocIndex !== -1 && fixes[tocIndex].altitude_feet) {
    currentFL = Math.round(parseInt(fixes[tocIndex].altitude_feet, 10) / 100);
  } else if (general.initial_altitude) {
    currentFL = Math.round(general.initial_altitude / 100);
  }

  if (currentFL && routeArray.length > 0) {
    routeArray[0] = `${routeArray[0]} F${currentFL}`;
  }

  if (tocIndex !== -1 && todIndex !== -1 && todIndex > tocIndex) {
    let activeFL = currentFL;
    for (let i = tocIndex + 1; i < todIndex; i++) {
      const fix = fixes[i];
      if (!fix.ident || !fix.altitude_feet) continue;
      const fixFL = Math.round(parseInt(fix.altitude_feet, 10) / 100);
      if (fixFL > 0 && fixFL !== activeFL) {
        const idx = routeArray.indexOf(fix.ident);
        if (idx !== -1) {
          routeArray[idx] = `${fix.ident}/F${fixFL}`;
          activeFL = fixFL;
        }
      }
    }
  }

  const finalRoute = routeArray.join(' ');
  el.innerHTML = `<strong>${origin.icao_code || '----'}</strong>/${origin.plan_rwy || '--'} ${finalRoute} <strong>${destination.icao_code || '----'}</strong>/${destination.plan_rwy || '--'}`;
}

/* ---------- PAGER ---------- */
function resetPager() {
  const scroller = document.getElementById('pager-scroll');
  if (scroller) scroller.scrollLeft = 0;
  document.querySelectorAll('.pager-dot').forEach((d, i) => d.classList.toggle('active', i === 0));
}

function initPager() {
  const scroller = document.getElementById('pager-scroll');
  const dots = document.querySelectorAll('.pager-dot');
  if(!scroller) return;

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const pageIndex = Number(dot.dataset.page);
      scroller.scrollTo({ left: pageIndex * scroller.clientWidth, behavior: 'smooth' });
    });
  });

  scroller.addEventListener('scroll', () => {
    const pageIndex = Math.round(scroller.scrollLeft / scroller.clientWidth);
    dots.forEach((d, i) => d.classList.toggle('active', i === pageIndex));
  });
}

/* ---------- SIGNATURE PAD E ACCETTAZIONE ---------- */
let isDrawing = false;
let ctx = null;
let canvas = null;

function initSignaturePad() {
  canvas = document.getElementById('signature-pad');
  if(!canvas) return;
  ctx = canvas.getContext('2d');
  
  function resizeCanvas() {
    if(!canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = getTheme() === 'dark' ? '#fff' : '#000';
  }
  
  window.addEventListener('resize', resizeCanvas);
  
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
  
  function startDrawing(e) {
    isDrawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
  }
  
  function draw(e) {
    if (!isDrawing) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    e.preventDefault();
  }
  
  function stopDrawing() { isDrawing = false; }
  
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  
  canvas.addEventListener('touchstart', startDrawing, {passive: false});
  canvas.addEventListener('touchmove', draw, {passive: false});
  canvas.addEventListener('touchend', stopDrawing);
  canvas.addEventListener('touchcancel', stopDrawing);
  
  return resizeCanvas;
}

function clearSignature() {
  if(ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cb = document.getElementById('acceptance-checkbox');
  if(cb) cb.checked = false;
}

function openSignatureModal() {
  const overlay = document.getElementById('signature-modal-overlay');
  const modal = document.getElementById('signature-modal');
  if(overlay) overlay.classList.add('open');
  if(modal) modal.classList.add('open');
  setTimeout(() => {
    const resize = initSignaturePad();
    if(resize) resize();
  }, 50); 
}

function closeSignatureModal() {
  const overlay = document.getElementById('signature-modal-overlay');
  const modal = document.getElementById('signature-modal');
  if(overlay) overlay.classList.remove('open');
  if(modal) modal.classList.remove('open');
}

function setupAcceptanceLogic() {
  const btn = document.getElementById('accept-flight-btn');
  if(btn) btn.addEventListener('click', openSignatureModal);
  
  const cancelBtn = document.getElementById('sig-cancel-btn');
  if(cancelBtn) cancelBtn.addEventListener('click', () => {
    clearSignature();
    closeSignatureModal();
  });
  
  const saveBtn = document.getElementById('sig-save-btn');
  if(saveBtn) saveBtn.addEventListener('click', () => {
    if (currentFlightId) {
      updateFlightState(currentFlightId, { accepted: true });
    }
    closeSignatureModal();
    applyAcceptanceUI(true);
  });
}

function applyAcceptanceUI(isAccepted) {
  const btn = document.getElementById('accept-flight-btn');
  const badge = document.getElementById('fib-status');
  
  if (isAccepted) {
    if(btn) {
      btn.textContent = 'Flight Accepted';
      btn.classList.add('btn-accepted');
    }
    if(badge) {
      badge.textContent = 'CONFIRMED';
      badge.className = 'status-badge accepted';
    }
  } else {
    if(btn) {
      btn.textContent = 'Accept Flight';
      btn.classList.remove('btn-accepted');
    }
    if(badge) {
      badge.textContent = 'NOT ACCEPTED';
      badge.className = 'status-badge not-accepted';
    }
  }
}

/* ---------- GESTIONE INTERFACCIA BRIEFING ---------- */
function bindBriefingTabs() {
  document.querySelectorAll('.briefing-item').forEach(item => {
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);
    
    newItem.addEventListener('click', () => {
      document.querySelectorAll('.briefing-item').forEach(i => i.classList.remove('active'));
      newItem.classList.add('active');
      
      const ofpContainer = document.getElementById('classic-ofp-container');
      const generalContainer = document.getElementById('briefing-general-container');
      const fuelContainer = document.getElementById('briefing-fuel-container');
      const atcContainer = document.getElementById('briefing-atc-container');
      const dispatchContainer = document.getElementById('briefing-dispatch-container');
      const airportContainer = document.getElementById('briefing-airport-container');
      const placeholder = document.getElementById('briefing-placeholder');

      if(ofpContainer) ofpContainer.style.display = 'none';
      if(generalContainer) generalContainer.style.display = 'none';
      if(fuelContainer) fuelContainer.style.display = 'none';
      if(atcContainer) atcContainer.style.display = 'none';
      if(dispatchContainer) dispatchContainer.style.display = 'none';
      if(airportContainer) airportContainer.style.display = 'none';
      if(placeholder) placeholder.style.display = 'none';

      if (newItem.dataset.section) {
        const title = document.getElementById('topbar-title');
        if(title) title.textContent = newItem.dataset.section;
        
        if (newItem.dataset.section === 'Classic OFP') {
          if(ofpContainer) ofpContainer.style.display = 'flex';
        } else if (newItem.dataset.section === 'General') {
          if(generalContainer) generalContainer.style.display = 'flex';
          renderGeneralSection(getFlight(currentFlightId));
        } else if (newItem.dataset.section === 'Fuel') {
          if(fuelContainer) fuelContainer.style.display = 'flex';
          renderFuelSection(getFlight(currentFlightId));
        } else if (newItem.dataset.section === 'ATC') {
          if(atcContainer) atcContainer.style.display = 'flex';
          renderAtcSection(getFlight(currentFlightId));
        } else if (newItem.dataset.section === 'Dispatch Info') {
          if(dispatchContainer) dispatchContainer.style.display = 'flex';
          renderDispatchSection(getFlight(currentFlightId));
        } else {
          if(placeholder) placeholder.style.display = 'block';
        }
      } 
      else if (newItem.dataset.aptIndex !== undefined) {
        if(airportContainer) airportContainer.style.display = 'flex';
        const apt = currentAirportsData[newItem.dataset.aptIndex];
        let titleText = apt.icao || '????';
        if (apt.iata) titleText += `/${apt.iata}`;
        if (apt.name) titleText += ` - ${apt.name}`;
        const title = document.getElementById('topbar-title');
        if(title) title.textContent = titleText;
        renderAirportSection(newItem.dataset.aptIndex);
      }
    });
  });
}

function initBriefingInteractions() {
  bindBriefingTabs();
}

/* ---------- INTERAZIONI GENERALI ---------- */
function openDrawer() {
  const sd = document.getElementById('side-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if(sd) sd.classList.add('open');
  if(overlay) overlay.classList.add('open');
}

function closeDrawer() {
  const sd = document.getElementById('side-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if(sd) sd.classList.remove('open');
  if(overlay) overlay.classList.remove('open');
}

function initInteractions() {
  const lastId = localStorage.getItem('mbriefing_sb_id');
  const sbUsername = document.getElementById('sb-username');
  if (lastId && sbUsername) sbUsername.value = lastId;
  
  const lastCid = localStorage.getItem('mbriefing_vt_cid');
  const vtCid = document.getElementById('vt-cid');
  if (lastCid && vtCid) vtCid.value = lastCid;

  const menuToggle = document.getElementById('menu-toggle');
  if(menuToggle) menuToggle.addEventListener('click', openDrawer);
  
  const drawerClose = document.getElementById('drawer-close');
  if(drawerClose) drawerClose.addEventListener('click', closeDrawer);
  
  const drawerOverlay = document.getElementById('drawer-overlay');
  if(drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);
  
  const sbRefresh = document.getElementById('sb-refresh');
  if(sbRefresh) {
    sbRefresh.addEventListener('click', async () => {
      if(sbUsername) localStorage.setItem('mbriefing_sb_id', sbUsername.value.trim());
      if(vtCid) localStorage.setItem('mbriefing_vt_cid', vtCid.value.trim());
      await handleRefresh();
    });
  }

  const contentRefresh = document.getElementById('content-refresh-btn');
  if(contentRefresh) {
    contentRefresh.addEventListener('click', async () => {
      const saved = localStorage.getItem('mbriefing_sb_id');
      const savedCid = localStorage.getItem('mbriefing_vt_cid');
      
      if (!saved) {
        openDrawer();
        return;
      }
      
      if(sbUsername) sbUsername.value = saved;
      if (savedCid && vtCid) vtCid.value = savedCid;
      
      await handleRefresh();
    });
  }

  const homeBtn = document.getElementById('home-nav-btn');
  if(homeBtn) {
    homeBtn.addEventListener('click', () => {
      window.location.hash = '#/home';
    });
  }

  initPager();
  setupAcceptanceLogic();
  initBriefingInteractions();

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tab = btn.dataset.tab;
      
      const viewDash = document.getElementById('view-dashboard');
      const viewBrf = document.getElementById('view-briefing');
      const viewNav = document.getElementById('view-navlog');
      const viewMap = document.getElementById('view-map');
      
      if(viewDash) viewDash.style.display = tab === 'dashboard' ? 'flex' : 'none';
      if(viewBrf) viewBrf.style.display = tab === 'briefing' ? 'flex' : 'none';
      if(viewNav) viewNav.style.display = tab === 'navlog' ? 'flex' : 'none';
      if(viewMap) viewMap.style.display = tab === 'map' ? 'flex' : 'none';
      
      const title = document.getElementById('topbar-title');
      
      if (tab === 'dashboard') {
        if(title) title.textContent = 'Dashboard';
      } else if (tab === 'briefing') {
        const activeItem = document.querySelector('.briefing-item.active');
        if (activeItem) {
          if (activeItem.dataset.section) {
            if(title) title.textContent = activeItem.dataset.section;
          } else if (activeItem.dataset.aptIndex !== undefined) {
             const apt = currentAirportsData[activeItem.dataset.aptIndex];
             if(apt) {
               let tText = apt.icao || '????';
               if (apt.iata) tText += `/${apt.iata}`;
               if (apt.name) tText += ` - ${apt.name}`;
               if(title) title.textContent = tText;
             }
          }
        } else {
           if(title) title.textContent = 'Briefing';
        }
      } else if (tab === 'navlog') {
        if(title) title.textContent = 'NavLog';
        if (currentFlightId) renderNavLog(currentFlightId);
      } else if (tab === 'map') {
        if(title) title.textContent = 'Map';
        if (currentFlightId) {
          const flight = getFlight(currentFlightId);
          if (flight && flight.raw && typeof initRouteWeatherMap === 'function') {
            initRouteWeatherMap('route-weather-map', flight.raw);
          }
        }
      } else {
        if(title) title.textContent = btn.textContent;
      }
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
