/* app.js 
   Routing semplice basato su hash: #/home  |  #/flight/<id>
*/

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
  document.getElementById('view-home').style.display = 'flex';
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('view-briefing').style.display = 'none';
  document.getElementById('topbar-title').textContent = 'My Flights';
  document.getElementById('home-nav-btn').style.visibility = 'hidden';
  document.getElementById('flight-info-bar').style.display = 'none';
  document.querySelector('.bottombar').style.display = 'none';
  document.body.classList.remove('in-flight');
  renderFlightsList();
}

function showDashboard(id) {
  const flight = getFlight(id);
  document.getElementById('view-home').style.display = 'none';
  document.getElementById('view-dashboard').style.display = 'flex';
  document.getElementById('view-briefing').style.display = 'none';
  document.getElementById('home-nav-btn').style.visibility = 'visible';
  document.querySelector('.bottombar').style.display = 'flex';
  document.body.classList.add('in-flight');
  
  // Resetta la barra inferiore su Dashboard
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="dashboard"]').classList.add('active');

  if (!flight) {
    document.getElementById('topbar-title').textContent = 'Volo non trovato';
    document.getElementById('flight-info-bar').style.display = 'none';
    return;
  }
  document.getElementById('topbar-title').textContent = 'Dashboard';
  document.getElementById('flight-info-bar').style.display = 'flex';
  renderFlightInfoBar(flight);
  renderDashboard(flight);
  resetPager();
}

function renderFlightInfoBar(flight) {
  const data = flight.raw;
  const general = data.general || {};
  const aircraft = data.aircraft || {};
  const origin = data.origin || {};
  const destination = data.destination || {};
  const times = data.times || {};
  const params = data.params || {};

  document.getElementById('fib-flightnum').textContent = extractCallsign(data);
  document.getElementById('fib-reg').textContent = aircraft.reg || '----';
  document.getElementById('fib-callsign').textContent = (data.atc && data.atc.callsign) || '----';
  
  document.getElementById('fib-route').innerHTML = 
    `<strong>${origin.icao_code || '----'}</strong> (${unixToHHMM(times.sched_out)}) - <strong>${destination.icao_code || '----'}</strong> (${unixToHHMM(times.sched_in)})`;
  
  document.getElementById('fib-ofp').textContent = general.release ? `OFP ${general.release}` : 'OFP --';
  document.getElementById('fib-ofpdate').textContent = params.time_generated ? formatObsDateTime(new Date(Number(params.time_generated) * 1000).toISOString()) : '--';

  const isAccepted = flight.state && flight.state.accepted;
  const badge = document.getElementById('fib-status');
  badge.textContent = isAccepted ? 'CONFIRMED' : 'NOT ACCEPTED';
  badge.className = isAccepted ? 'status-badge accepted' : 'status-badge not-accepted';
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

/* ---------- DASHBOARD: formattazione ---------- */
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

/* ---------- DASHBOARD: rendering ---------- */
function renderDashboard(flight) {
  try {
    const data = flight.raw;
    const general = data.general || {};
    const origin = data.origin || {};
    const destination = data.destination || {};
    const times = data.times || {};
    const aircraft = data.aircraft || {};

    const altn = getFirstAlternate(data);

    document.getElementById('fi-header-actype').textContent = aircraft.icaocode || '----';
    document.getElementById('fi-header-flightnum').textContent = extractCallsign(data);
    document.getElementById('fi-header-reg').textContent = aircraft.reg || '----';

    document.getElementById('fi-orig').textContent = origin.icao_code || '----';
    document.getElementById('fi-dest').textContent = destination.icao_code || '----';
    document.getElementById('fi-altn').textContent = altn.icao_code ? `(${altn.icao_code})` : '';

    document.getElementById('fi-flighttime').textContent = formatHHMM(times.est_time_enroute || times.sched_time_enroute);
    document.getElementById('fi-blocktime').textContent = formatHHMM(times.est_block || times.sched_block);

    document.getElementById('fi-rwy-dep').textContent = origin.plan_rwy || '--';
    document.getElementById('fi-sid').textContent = general.sid_ident || 'NONE';
    document.getElementById('fi-date').textContent = formatDateFromUnix(times.sched_out);
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
        deltaEl.className = 'fi-delta delta-early';
      } else {
        deltaEl.textContent = `+${String(diffMin).padStart(2, '0')}m`;
        deltaEl.className = 'fi-delta delta-late';
      }
    } else {
      deltaEl.textContent = '';
    }

    applyAcceptanceUI(flight.state && flight.state.accepted);

    // ---- WEIGHT ----
    const w = data.weights || {};
    document.getElementById('w-dow').textContent = w.oew ?? '---';
    document.getElementById('w-dow-limit').textContent = '---';
    document.getElementById('w-load').textContent = w.payload ?? '---';
    document.getElementById('w-load-limit').textContent = '---';
    document.getElementById('w-zfw').textContent = w.est_zfw ?? '---';
    document.getElementById('w-zfw-limit').textContent = w.max_zfw ?? '---';
    document.getElementById('w-tow').textContent = w.est_tow ?? '---';
    document.getElementById('w-tow-limit').textContent = w.max_tow ?? '---';
    document.getElementById('w-lw').textContent = w.est_ldw ?? '---';
    document.getElementById('w-lw-limit').textContent = w.max_ldw ?? '---';

    // ---- FUEL ----
    const f = data.fuel || {};
    const tripSec = Number(times.est_time_enroute) || 0;
    const contSec = Number(times.contfuel_time) || 0;
    const finresSec = Number(times.reserve_time) || 0;
    const altnSec = Number(altn.ete) || 0;
    const taxiOutSec = Number(times.taxi_out) || 0;
    const minTakeoffSec = tripSec + contSec + finresSec + altnSec;

    document.getElementById('f-trip-time').textContent = formatHHMM(tripSec);
    document.getElementById('f-trip-kg').textContent = f.enroute_burn ?? '---';
    document.getElementById('f-mtow-time').textContent = minTakeoffSec ? formatHHMM(minTakeoffSec) : '--:--';
    document.getElementById('f-mtow-kg').textContent = f.min_takeoff ?? '---';
    document.getElementById('f-taxi-time').textContent = taxiOutSec ? formatHHMM(taxiOutSec) : '--:--';
    document.getElementById('f-taxi-kg').textContent = f.taxi ?? '---';
    document.getElementById('f-block-time').textContent = '--:--';
    document.getElementById('f-block-kg').textContent = f.plan_ramp ?? '---';
    document.getElementById('f-landing-time').textContent = '--:--';
    document.getElementById('f-landing-kg').textContent = f.plan_landing ?? '---';
    document.getElementById('f-disc-time').textContent = '--:--';
    document.getElementById('f-disc-kg').textContent = (w.max_ldw != null && w.est_ldw != null) ? (w.max_ldw - w.est_ldw) : '---';

    // ---- WEATHER ----
    const wxAirports = { origin, destination, alternate: altn };
    document.getElementById('wx-tab-origin').textContent = origin.icao_code || 'ORIG';
    document.getElementById('wx-tab-destination').textContent = destination.icao_code || 'DEST';
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

    // ---- BRIEFING TAB: Classic OFP come testo formattato (niente iframe/PDF) ----
    renderClassicOfpText(data);

  } catch (err) {
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

  const origIcao = origin.icao_code || '----';
  const origIata = origin.iata_code ? origin.iata_code : '';
  document.getElementById('gen-dep').textContent = origIata ? `${origIcao}/${origIata}` : origIcao;

  const destIcao = destination.icao_code || '----';
  const destIata = destination.iata_code ? destination.iata_code : '';
  document.getElementById('gen-arr').textContent = destIata ? `${destIcao}/${destIata}` : destIcao;

  document.getElementById('gen-callsign').textContent = atc.callsign || '—';
  document.getElementById('gen-std').textContent = `${unixToHHMM(times.sched_out)}/${unixToHHMM(times.sched_off)}`;
  document.getElementById('gen-sta').textContent = `${unixToHHMM(times.sched_on)}/${unixToHHMM(times.sched_in)}`;
  document.getElementById('gen-actype').textContent = aircraft.name || aircraft.icaocode || '—';
  document.getElementById('gen-reg').textContent = aircraft.reg || '—';

  document.getElementById('gen-crzsys').textContent = general.cruise_profile || (general.costindex ? `CI ${general.costindex}` : '—');
  document.getElementById('gen-gnddist').textContent = general.route_distance ? `${general.route_distance}NM` : '—';
  document.getElementById('gen-airdist').textContent = general.air_distance ? `${general.air_distance}NM` : '—';
  document.getElementById('gen-tocwind').textContent = toc ? `${toc.wind_dir}°/${toc.wind_spd}KT` : '—';
  document.getElementById('gen-avgwind').textContent = (general.avg_wind_dir && general.avg_wind_spd) ? `${general.avg_wind_dir}°/${general.avg_wind_spd}KT` : '—';
  
  let avgWcStr = '—';
  if (general.avg_wind_comp) {
    let wcStr = String(general.avg_wind_comp).toUpperCase();
    let isNegative = wcStr.includes('M') || wcStr.includes('-');
    let num = Math.abs(parseInt(wcStr.replace(/[^\d]/g, ''), 10));
    if (!isNaN(num)) {
      avgWcStr = (isNegative ? 'M ' : 'P ') + num.toString().padStart(3, '0');
    }
  }
  document.getElementById('gen-avgwc').textContent = avgWcStr;

  let initialAltStr = '—';
  if (general.initial_altitude) {
    let m = String(general.initial_altitude).match(/\d+/);
    if (m) {
      let n = parseInt(m[0], 10);
      if (n >= 1000) n = Math.round(n / 100);
      initialAltStr = n.toString();
    }
  }
  document.getElementById('gen-alt').textContent = initialAltStr;
  
  if (toc && toc.oat_isa_dev !== undefined) {
     const isa = Number(toc.oat_isa_dev);
     const sign = isa >= 0 ? 'P ' : 'M ';
     const val = Math.abs(isa).toString().padStart(3, '0');
     document.getElementById('gen-tocisa').textContent = `${sign}${val}`;
  } else {
     document.getElementById('gen-tocisa').textContent = '—';
  }

  document.getElementById('gen-avgff').textContent = fuel.avg_fuel_flow ? `${fuel.avg_fuel_flow}` : '—';
  
  if (aircraft.fuelfactor) {
     const bias = (Number(aircraft.fuelfactor) - 1) * 100;
     const sign = bias >= 0 ? 'P ' : 'M ';
     document.getElementById('gen-fuelbias').textContent = `${sign}${Math.abs(bias).toFixed(1)}`;
  } else {
     document.getElementById('gen-fuelbias').textContent = '—';
  }
  
  const tkofAltn = data.takeoff_altn && data.takeoff_altn.icao_code;
  document.getElementById('gen-tkofaltn').textContent = tkofAltn || '-';

  // WIDGET PESI
  document.getElementById('gen-w-dow-plan').textContent = data.weights.oew || '—';
  document.getElementById('gen-w-load-plan').textContent = data.weights.payload || '—';
  document.getElementById('gen-w-zfw-plan').textContent = data.weights.est_zfw || '—';
  document.getElementById('gen-w-tow-plan').textContent = data.weights.est_tow || '—';
  document.getElementById('gen-w-lw-plan').textContent = data.weights.est_ldw || '—';

  document.getElementById('gen-w-zfw-struct').textContent = data.weights.max_zfw || '—';
  document.getElementById('gen-w-tow-struct').textContent = data.weights.max_tow_struct || data.weights.max_tow || '—';
  document.getElementById('gen-w-lw-struct').textContent = data.weights.max_ldw || '—';

  let opTow = '—';
  if (data.tlr && data.tlr.takeoff && data.tlr.takeoff.runway) {
    let rwyList = Array.isArray(data.tlr.takeoff.runway) ? data.tlr.takeoff.runway : [data.tlr.takeoff.runway];
    let rwy = rwyList.find(r => String(r.identifier).padStart(2, '0') === String(origin.plan_rwy).padStart(2, '0'));
    if (rwy && rwy.max_weight) opTow = rwy.max_weight;
  }
  document.getElementById('gen-w-tow-op').textContent = opTow;

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
  document.getElementById('gen-w-lw-op').textContent = opLw;

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

  document.getElementById('brf-f-dest').textContent = dest.icao_code || '';
  document.getElementById('brf-f-orig').textContent = orig.icao_code || '';

  const tripFuel = Number(fuel.enroute_burn) || 0;
  const contFuel = Number(fuel.contingency) || 0;
  const finresFuel = Number(fuel.reserve) || 0;
  const taxiFuel = Number(fuel.taxi) || 0;
  const avgFF = Number(fuel.avg_fuel_flow) || 0;

  const tripTime = Number(times.est_time_enroute) || 0;
  const contTime = Number(times.contfuel_time) || 0;
  const finresTime = Number(times.reserve_time) || 0;
  const taxiTime = Number(times.taxi_out) || 0;

  document.getElementById('brf-f-trip-fuel').textContent = tripFuel;
  document.getElementById('brf-f-trip-time').textContent = formatHHMM(tripTime);
  document.getElementById('brf-f-cont-fuel').textContent = contFuel;
  document.getElementById('brf-f-cont-time').textContent = formatHHMM(contTime);
  document.getElementById('brf-f-finres-fuel').textContent = finresFuel;
  document.getElementById('brf-f-finres-time').textContent = formatHHMM(finresTime);
  document.getElementById('brf-f-taxi-fuel').textContent = taxiFuel;
  document.getElementById('brf-f-taxi-time').textContent = formatHHMM(taxiTime);

  // Maximum Discretionary Fuel (Max LW - Est LW)
  let maxDisc = '---';
  if (weights.max_ldw != null && weights.est_ldw != null) {
      maxDisc = weights.max_ldw - weights.est_ldw;
  }
  document.getElementById('brf-f-max-disc').textContent = maxDisc;

  const sel = document.getElementById('brf-f-altn-select');
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

    document.getElementById('brf-f-altn-fuel').textContent = altnFuel;
    document.getElementById('brf-f-altn-time').textContent = formatHHMM(altnTime);

    const tkofFuel = tripFuel + contFuel + altnFuel + finresFuel;
    const tkofTime = tripTime + contTime + altnTime + finresTime;

    document.getElementById('brf-f-tkof-fuel').textContent = tkofFuel;
    document.getElementById('brf-f-tkof-time').textContent = formatHHMM(tkofTime);

    const minBlockFuel = tkofFuel + taxiFuel;
    document.getElementById('brf-f-minblock-fuel').textContent = minBlockFuel;

    let discFuel = Number(document.getElementById('brf-disc-fuel-input').value) || 0;
    // ROUNDING FIX: Math.ceil per arrotondare al NEXT hundred
    let calcBlockFuel = Math.ceil((minBlockFuel + discFuel) / 100) * 100;

    const blockInputEl = document.getElementById('brf-block-input');
    if (!isBlockFuelManual) {
      blockInputEl.value = calcBlockFuel;
    }

    // Estimated Landing Fuel prelevato direttamente dall'XML per esattezza
    const estLndFuel = fuel.plan_landing || '---';
    document.getElementById('brf-f-estlnd-fuel').textContent = estLndFuel;

    let totFinresFuel = finresFuel + altnFuel;
    let totFinresTime = finresTime + altnTime;
    document.getElementById('brf-f-totfinres-fuel').textContent = totFinresFuel;
    document.getElementById('brf-f-totfinres-time').textContent = '(' + formatHHMM(totFinresTime) + ')';

    const orderBtnEl = document.getElementById('brf-order-btn');
    orderBtnEl.classList.remove('btn-ordered');
    orderBtnEl.textContent = 'ORDER';
  }

  // Clona e sostituisci per evitare doppi listener sul Select
  const newSel = sel.cloneNode(true);
  sel.parentNode.replaceChild(newSel, sel);
  newSel.addEventListener('change', () => {
    isBlockFuelManual = false;
    updateFuelCalcs();
  });
  
  // Clona e sostituisci Discretionary
  const newDisc = discInput.cloneNode(true);
  discInput.parentNode.replaceChild(newDisc, discInput);
  newDisc.value = '';
  discTimeVal.textContent = '--:--';
  discReason.value = '';

  newDisc.addEventListener('input', () => {
    let val = Number(newDisc.value);
    if (val > 0 && avgFF > 0) {
      let secs = Math.round((val / avgFF) * 3600);
      document.getElementById('brf-disc-time-val').textContent = formatHHMM(secs);
    } else {
      document.getElementById('brf-disc-time-val').textContent = '--:--';
    }
    isBlockFuelManual = false;
    updateFuelCalcs();
  });

  // Clona e sostituisci Block Input
  const newBlockInput = blockInput.cloneNode(true);
  blockInput.parentNode.replaceChild(newBlockInput, blockInput);
  newBlockInput.addEventListener('input', () => {
    isBlockFuelManual = true;
    updateFuelCalcs();
  });

  // Clona e sostituisci pulsante Order
  const newOrderBtn = orderBtn.cloneNode(true);
  orderBtn.parentNode.replaceChild(newOrderBtn, orderBtn);
  newOrderBtn.addEventListener('click', () => {
    newOrderBtn.classList.add('btn-ordered');
    newOrderBtn.textContent = 'ORDER SENT';
  });

  // WIDGET OPERATIONAL IMPACTS
  // SimBrief mette gli impact nell'oggetto principale data.impacts
  const impacts = data.impacts || {};

  // Formattazione esatta con SPAZIO (Fuel: raw number -> P/M 0000; Time: seconds -> HHMM -> P/M 0000)
  function formatImpact(imp) {
    let bPrefix = 'P', bVal = '0000', tPrefix = 'P', tVal = '0000';
    if (imp) {
      let bDiff = parseInt(imp.burn_difference, 10) || 0;
      let tDiff = parseInt(imp.time_difference, 10) || 0;
      
      bPrefix = bDiff < 0 ? 'M' : 'P';
      tPrefix = tDiff < 0 ? 'M' : 'P';
      
      bVal = Math.abs(bDiff).toString().padStart(4, '0');
      
      let tSec = Math.abs(tDiff);
      let tMins = Math.floor(tSec / 60); // Tronca i minuti (come l'OFP originale)
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

  // Pesca in modo sicuro le chiavi dirette dall'oggetto impacts
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

  document.getElementById('brf-impacts-tbody').innerHTML = impHtml;

  // Prima chiamata per popolare la tabella carburante all'apertura
  updateFuelCalcs();
}

/* ---------- BRIEFING: ATC ---------- */
function renderAtcSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const atc = data.atc || {};
  const atcText = atc.flightplan_text || 'ATC Flight Plan non disponibile.';
  document.getElementById('brf-atc-text').textContent = atcText.trim();
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
  document.getElementById('wx-metar-text').textContent = airport.metar || 'METAR non disponibile';
  document.getElementById('wx-taf-text').textContent = airport.taf || 'TAF non disponibile';
  document.getElementById('wx-metar-age').textContent = formatObsDateTime(airport.metar_time);
  document.getElementById('wx-taf-age').textContent = airport.taf_time ? `Issued ${formatObsDateTime(airport.taf_time)}` : '';

  const badge = document.getElementById('wx-vmc-badge');
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
    img.style.display = 'none';
    fallback.style.display = 'block';
    fallback.innerHTML = 'Mappa rotta non disponibile. Controlla che "Maps" sia attivo tra le opzioni del dispatch su SimBrief.';
    return;
  }

  img.onload = () => { fallback.style.display = 'none'; };
  img.onerror = () => {
    img.style.display = 'none';
    fallback.style.display = 'block';
    fallback.innerHTML = `Impossibile mostrare la mappa qui dentro. <a href="${url}" target="_blank" rel="noopener">Aprila in una nuova scheda</a>.`;
  };
  img.style.display = 'block';
  img.src = url;
}

/* ROTTA: logica TOC/TOD e Stepclimbs ripristinata */
function renderRouteSummary(data, origin, destination, general) {
  const el = document.getElementById('route-summary');
  const route = general.route || '';
  const routeArray = route.split(' ');

  if (!data.navlog || !data.navlog.fix) {
    el.innerHTML = `<strong>${origin.icao_code || '----'}</strong>/${origin.plan_rwy || '--'} ${route} <strong>${destination.icao_code || '----'}</strong>/${destination.plan_rwy || '--'}`;
    return;
  }

  const fixes = Array.isArray(data.navlog.fix) ? data.navlog.fix : [data.navlog.fix];
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
  document.getElementById('acceptance-checkbox').checked = false;
}

function openSignatureModal() {
  document.getElementById('signature-modal-overlay').classList.add('open');
  document.getElementById('signature-modal').classList.add('open');
  setTimeout(() => {
    const resize = initSignaturePad();
    if(resize) resize();
  }, 50); 
}

function closeSignatureModal() {
  document.getElementById('signature-modal-overlay').classList.remove('open');
  document.getElementById('signature-modal').classList.remove('open');
}

function setupAcceptanceLogic() {
  document.getElementById('accept-flight-btn').addEventListener('click', openSignatureModal);
  
  document.getElementById('sig-cancel-btn').addEventListener('click', () => {
    clearSignature();
    closeSignatureModal();
  });
  
  document.getElementById('sig-save-btn').addEventListener('click', () => {
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
    btn.textContent = 'Flight Accepted';
    btn.classList.add('btn-accepted');
    if(badge) {
      badge.textContent = 'CONFIRMED';
      badge.className = 'status-badge accepted';
    }
  } else {
    btn.textContent = 'Accept Flight';
    btn.classList.remove('btn-accepted');
    if(badge) {
      badge.textContent = 'NOT ACCEPTED';
      badge.className = 'status-badge not-accepted';
    }
  }
}

/* ---------- GESTIONE INTERFACCIA BRIEFING ---------- */
function initBriefingInteractions() {
  document.querySelectorAll('.briefing-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.briefing-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      document.getElementById('topbar-title').textContent = item.dataset.section;

      const ofpContainer = document.getElementById('classic-ofp-container');
      const generalContainer = document.getElementById('briefing-general-container');
      const fuelContainer = document.getElementById('briefing-fuel-container');
      const atcContainer = document.getElementById('briefing-atc-container');
      const placeholder = document.getElementById('briefing-placeholder');

      ofpContainer.style.display = 'none';
      generalContainer.style.display = 'none';
      fuelContainer.style.display = 'none';
      atcContainer.style.display = 'none';
      placeholder.style.display = 'none';

      if (item.dataset.section === 'Classic OFP') {
        ofpContainer.style.display = 'flex';
      } else if (item.dataset.section === 'General') {
        generalContainer.style.display = 'flex';
        renderGeneralSection(getFlight(currentFlightId));
      } else if (item.dataset.section === 'Fuel') {
        fuelContainer.style.display = 'flex';
        renderFuelSection(getFlight(currentFlightId));
      } else if (item.dataset.section === 'ATC') {
        atcContainer.style.display = 'flex';
        renderAtcSection(getFlight(currentFlightId));
      } else {
        placeholder.style.display = 'block';
      }
    });
  });
}


/* ---------- INTERAZIONI GENERALI ---------- */
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

  document.getElementById('home-nav-btn').addEventListener('click', () => {
    window.location.hash = '#/home';
  });

  initPager();
  setupAcceptanceLogic();
  initBriefingInteractions();

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tab = btn.dataset.tab;
      
      document.getElementById('view-dashboard').style.display = tab === 'dashboard' ? 'flex' : 'none';
      document.getElementById('view-briefing').style.display = tab === 'briefing' ? 'flex' : 'none';
      
      if (tab === 'dashboard') {
        document.getElementById('topbar-title').textContent = 'Dashboard';
      } else if (tab === 'briefing') {
        const activeItem = document.querySelector('.briefing-item.active');
        document.getElementById('topbar-title').textContent = activeItem ? activeItem.dataset.section : 'Briefing';
      } else {
        document.getElementById('topbar-title').textContent = btn.textContent;
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