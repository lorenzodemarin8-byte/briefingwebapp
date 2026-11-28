/* js/dashboard.js
   Rendering Dashboard (Pagina 1 & Pagina 2), polling VATSIM A-CDM, Flight Checklist,
   Weight & Fuel, Route, Weather (con Ceiling/Visibility SimBrief + HWC/CWC),
   NOTAM, Dispatch, Crew, Pager e Firme.
*/

var cdmInterval = null;
var prevCdmState = { tobt: "", tsat: "", ctot: "" };
var isFirstCdmFetch = true;

var isDrawing = false;
var ctx = null;
var canvas = null;

var submitIsDrawing = false;
var submitCtx = null;
var submitCanvas = null;

var activeDashWxTab = 'origin';
var activeDashNotamTab = 'origin';
var activeNotamFilter = 'all';
var airportNotamFilters = Object.create(null);

/* ---------- NAVIGAZIONE RAPIDA VERSO BRIEFING ---------- */
function navigateToBriefingSection(sectionName) {
  const brfTab = document.querySelector('.tab-btn[data-tab="briefing"]');
  if (brfTab) brfTab.click();
  const targetItem = document.querySelector(`.briefing-page-item[data-section="${sectionName}"]`);
  if (targetItem) targetItem.click();
}

function navigateToBriefingAirport(icaoCode, scrollTargetId) {
  const brfTab = document.querySelector('.tab-btn[data-tab="briefing"]');
  if (brfTab) brfTab.click();
  if (!icaoCode || !Array.isArray(currentAirportsData)) return;
  const idx = currentAirportsData.findIndex(a => a.icao === icaoCode);
  if (idx !== -1) {
    const aptItem = document.querySelector(`.briefing-page-item[data-apt-index="${idx}"]`);
    if (aptItem) aptItem.click();
    if (scrollTargetId) {
      setTimeout(() => {
        const el = document.getElementById(scrollTargetId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }
}

/* ---------- VATSIM A-CDM API ---------- */
async function fetchCdmData(callsign) {
  if (!callsign) return null;
  try {
    const res = await fetch(`https://api.viffsys.com/ifps/callsign?callsign=${callsign}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("Errore fetch CDM ufficiale:", err);
    return null;
  }
}

/* ---------- NAVIGRAPH ---------- */
function buildNavigraphImportUrl(ofp) {
  if (!ofp || !ofp.origin || !ofp.destination || !ofp.general) return '';
  const origin = `${ofp.origin.icao_code}/${ofp.origin.plan_rwy}`;
  const dest = `${ofp.destination.icao_code}/${ofp.destination.plan_rwy}`;
  const route = `${origin} ${ofp.general.route} ${dest}`;
  const rulesMap = { I: "IFR", V: "VFR", Y: "IFR/VFR", Z: "VFR/IFR" };
  const rules = rulesMap[ofp.atc.flight_rules] || "IFR";
  const title = `${ofp.general.icao_airline || ''}${ofp.general.flight_number || ''}`;
  const cruisingAltitude = ofp.atc.initial_alt || "";
  const alternate = (ofp.alternate && ofp.alternate.icao_code) ? ofp.alternate.icao_code : "";
  const params = new URLSearchParams({ route, title, rules, cruisingAltitude, alternate });
  return `https://charts.navigraph.com/flights/import?${params.toString()}`;
}

/* ---------- TOP FLIGHT INFO BAR ---------- */
function renderFlightInfoBar(flight) {
  if (!flight) return;
  const data = flight.raw || {};
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
  const etopsBadge = document.getElementById('fib-etops');

  if (fibFlightnum) fibFlightnum.textContent = extractCallsign(data);
  if (fibReg) fibReg.textContent = aircraft.reg || '----';
  if (fibCallsign) fibCallsign.textContent = (data.atc && data.atc.callsign) || '----';
  if (fibRoute) {
    fibRoute.innerHTML = `<strong>${origin.icao_code || '----'}</strong> (${unixToHHMM(times.sched_out)}) - <strong>${destination.icao_code || '----'}</strong> (${unixToHHMM(times.sched_in)})`;
  }
  if (fibOfp) fibOfp.textContent = `OFP ${extractOfpEdition(data)}`;
  if (fibOfpdate) fibOfpdate.textContent = params.time_generated ? formatObsDateTime(new Date(Number(params.time_generated) * 1000).toISOString()) : '--';

  const isAccepted = flight.state && flight.state.accepted;
  if (badge) {
    badge.textContent = isAccepted ? 'CONFIRMED' : 'NOT ACCEPTED';
    badge.className = isAccepted ? 'status-badge accepted' : 'status-badge not-accepted';
  }
  if (etopsBadge) {
    const hasEtops = typeof getEtopsData === 'function' && Boolean(getEtopsData(data));
    etopsBadge.hidden = !hasEtops;
  }
}

/* ---------- MAIN DASHBOARD RENDERING ---------- */
function renderDashboard(flight) {
  try {
    const data = flight.raw;
    const general = data.general || {};
    const origin = data.origin || {};
    const destination = data.destination || {};
    const times = data.times || {};
    const aircraft = data.aircraft || {};
    const calcs = getFuelCalculations(data, flight.state);

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

    if (elActype) elActype.textContent = aircraft.icaocode || '----';
    if (elFlightnum) elFlightnum.textContent = extractCallsign(data);
    if (elReg) elReg.textContent = aircraft.reg || '----';
    if (elOrig) elOrig.textContent = origin.icao_code || '----';
    if (elDest) elDest.textContent = destination.icao_code || '----';
    if (elAltn) elAltn.textContent = calcs.altnIcao ? `(${calcs.altnIcao})` : '';
    if (elFlighttime) elFlighttime.textContent = formatHHMM(times.est_time_enroute || times.sched_time_enroute);
    if (elBlocktime) elBlocktime.textContent = formatHHMM(times.est_block || times.sched_block);
    if (elRwyDep) elRwyDep.textContent = origin.plan_rwy || '--';
    if (elSid) elSid.textContent = general.sid_ident || 'NONE';
    if (elDate) elDate.textContent = formatDateFromUnix(times.sched_out);
    if (elStd) elStd.textContent = unixToHHMM(times.sched_out);

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
    if (ctotVal) ctotVal.textContent = '-';
    const stdUnix = Number(times.sched_out);
    const staUnix = Number(times.sched_in);

    function refreshCDM() {
      const callsign = (data.atc && data.atc.callsign) || (data.general && data.general.atc_callsign);
      if (!callsign) return;
      fetchCdmData(callsign).then(cdmDataObj => {
        if (cdmDataObj) {
          const cleanTime = (t) => (t && String(t).trim().length >= 4) ? String(t).trim().substring(0, 4) : "";
          let rawCtot = (cdmDataObj.cdmData && cdmDataObj.cdmData.ctot) ? cdmDataObj.cdmData.ctot : cdmDataObj.ctot;
          let rawTsat = (cdmDataObj.cdmData && cdmDataObj.cdmData.tsat) ? cdmDataObj.cdmData.tsat : cdmDataObj.tsat;
          let rawTobt = (cdmDataObj.cdmData && cdmDataObj.cdmData.tobt) ? cdmDataObj.cdmData.tobt : (cdmDataObj.obt || cdmDataObj.tobt);

          const newTobt = cleanTime(rawTobt);
          const newTsat = cleanTime(rawTsat);
          const newCtot = cleanTime(rawCtot);

          if (isFirstCdmFetch) {
            prevCdmState = { tobt: newTobt, tsat: newTsat, ctot: newCtot };
            isFirstCdmFetch = false;
          } else {
            const fmt = (t) => t ? `${t.substring(0, 2)}:${t.substring(2, 4)}z` : "";
            let reason = cdmDataObj.mostPenalizingAirspace || (cdmDataObj.cdmData && cdmDataObj.cdmData.reason) || "";
            let reasonText = reason ? `\nReason: ${reason}` : "";

            if (newCtot && newCtot !== prevCdmState.ctot) addNotification(`SLOT notification: you have a new CTOT at ${fmt(newCtot)}${reasonText}`);
            if (prevCdmState.ctot && !newCtot) addNotification(`SLOT notification: your CTOT has been cancelled`);
            if (newTsat && newTsat !== prevCdmState.tsat) addNotification(`TSAT notification: new TSAT at ${fmt(newTsat)}`);
            if (newTobt && newTobt !== prevCdmState.tobt) addNotification(`TOBT notification: new TOBT at ${fmt(newTobt)}`);

            prevCdmState = { tobt: newTobt, tsat: newTsat, ctot: newCtot };
          }

          if (ctotVal) {
            if (newCtot) {
              ctotVal.textContent = `${newCtot.substring(0, 2)}:${newCtot.substring(2, 4)}z`;
            } else {
              ctotVal.textContent = '-';
            }
          }

          let effectiveEtdUnix = (times.est_out ? Number(times.est_out) : stdUnix);
          if (newTsat) {
            effectiveEtdUnix = parseHHMM(newTsat, stdUnix);
          } else if (newTobt) {
            effectiveEtdUnix = parseHHMM(newTobt, stdUnix);
          }
          const cdmEstimates = calculateCdmEstimatedTimes(data, {
            ...(flight.state || {}),
            effectiveEtd: effectiveEtdUnix,
            ctot: newCtot || 'NA'
          }, newCtot);

          if (etdEl) {
            etdEl.textContent = unixToHHMM(cdmEstimates.effectiveOut);
            etdEl.style.color = cdmEstimates.effectiveOut > stdUnix ? "var(--orange-text)" : "";
          }

          const newEtaUnix = cdmEstimates.estimatedIn || staUnix;
          if (etaEl) etaEl.textContent = unixToHHMM(newEtaUnix);
          updateDelta(staUnix, newEtaUnix);

          if (currentFlightId) {
            updateFlightState(currentFlightId, {
              ctot: newCtot ? `${newCtot.substring(0, 2)}:${newCtot.substring(2, 4)}z` : 'NA',
              effectiveEtd: effectiveEtdUnix,
              effectiveEta: newEtaUnix
            });
            if (typeof renderGeneralCdmTimes === 'function') renderGeneralCdmTimes(flight, effectiveEtdUnix, newCtot);
          }
        }
      });
    }

    const initialCdm = calculateCdmEstimatedTimes(data, flight.state || {}, (flight.state && flight.state.ctot) || null);
    if (etdEl) etdEl.textContent = unixToHHMM(initialCdm.effectiveOut);
    if (etaEl) etaEl.textContent = unixToHHMM(initialCdm.estimatedIn || times.est_in || times.sched_in);
    updateDelta(times.sched_in, (initialCdm.estimatedIn || times.est_in || times.sched_in));
    refreshCDM();
    cdmInterval = setInterval(refreshCDM, 60000);

    if (elRwyArr) elRwyArr.textContent = destination.plan_rwy || '--';
    if (elStar) elStar.textContent = general.star_ident || 'NONE';
    if (elDateArr) elDateArr.textContent = formatDateFromUnix(times.sched_in);
    if (elSta) elSta.textContent = unixToHHMM(times.sched_in);

    applyAcceptanceUI(flight.state && flight.state.accepted);

    // ---- FLIGHT CHECKLIST (PAGINA 1 - SINISTRA) ----
    renderFlightChecklist(flight);

    // ---- WEIGHT & FUEL UNIFICATO (PAGINA 2 - CENTRO) ----
    const w = data.weights || {};
    const savedWeights = (flight.state && flight.state.actualWeights) || {};
    const setW = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = (val != null && val !== '') ? val : '---'; };
    setW('w-dow', w.oew);
    setW('w-dow-limit', '---');
    setW('w-load', savedWeights.load || w.payload);
    setW('w-load-limit', w.max_payload || '---');
    setW('w-zfw', savedWeights.zfw || w.est_zfw);
    setW('w-zfw-limit', w.max_zfw);
    setW('w-tow', savedWeights.tow || Math.round(calcs.updatedTow));
    setW('w-tow-limit', w.max_tow);
    setW('w-lw', savedWeights.lw || Math.round(calcs.updatedLw));
    setW('w-lw-limit', w.max_ldw);

    const tripSec = Number(times.est_time_enroute) || 0;
    const taxiOutSec = Number(times.taxi_out) || 0;
    setW('f-trip-kg', calcs.tripFuel);
    setW('f-mtow-kg', calcs.tkofFuel);
    setW('f-taxi-kg', calcs.taxiFuel);
    setW('f-block-kg', calcs.actualBlockFuel);
    setW('f-landing-time', calcs.estLndTimeSecs > 0 ? formatHHMM(calcs.estLndTimeSecs) : '--:--');
    setW('f-landing-kg', Math.round(calcs.estimatedLandingFuel));

    const elTripTime = document.getElementById('f-trip-time');
    if (elTripTime) elTripTime.textContent = formatHHMM(tripSec);
    const elMtowTime = document.getElementById('f-mtow-time');
    if (elMtowTime) elMtowTime.textContent = calcs.tkofTime ? formatHHMM(calcs.tkofTime) : '--:--';
    const elTaxiTime = document.getElementById('f-taxi-time');
    if (elTaxiTime) elTaxiTime.textContent = taxiOutSec ? formatHHMM(taxiOutSec) : '--:--';
    setW('f-block-time', '--:--');

    let discTimeMaxSecs = calcs.maxDiscKg > 0 ? Math.round((calcs.maxDiscKg / calcs.holdingFuelFlow) * 3600) : 0;
    setW('f-disc-time', discTimeMaxSecs > 0 ? formatHHMM(discTimeMaxSecs) : '--:--');
    setW('f-disc-kg', calcs.maxDiscKg);
    setW('f-disc-bottleneck', calcs.bottleneckReason);

    const openFuelBtn = document.getElementById('open-fuel-btn');
    if (openFuelBtn) {
      openFuelBtn.onclick = () => navigateToBriefingSection('Fuel');
    }

    // ---- WEATHER (PAGINA 1 - DESTRA) ----
    const altsList = getAlternatesList(data);
    const activeAltnObj = altsList[calcs.altnIdx] || getFirstAlternate(data) || {};
    const wxAirports = {
      origin,
      destination,
      alternate: activeAltnObj
    };

    const wtabOrig = document.getElementById('wx-tab-origin');
    const wtabDest = document.getElementById('wx-tab-destination');
    const wtabAltn = document.getElementById('wx-tab-alternate');
    if (wtabOrig) wtabOrig.textContent = origin.icao_code || 'ORIG';
    if (wtabDest) wtabDest.textContent = destination.icao_code || 'DEST';
    if (wtabAltn) wtabAltn.textContent = activeAltnObj.icao_code || 'ALTN';

    if (!wxAirports[activeDashWxTab] || !wxAirports[activeDashWxTab].icao_code) {
      activeDashWxTab = 'origin';
    }

    document.querySelectorAll('.weather-widget .wx-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.wx === activeDashWxTab);
      tab.onclick = () => {
        activeDashWxTab = tab.dataset.wx;
        document.querySelectorAll('.weather-widget .wx-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        renderWeather(data, wxAirports, activeDashWxTab);
      };
    });
    renderWeather(data, wxAirports, activeDashWxTab);

    const viewAirportWxBtn = document.getElementById('view-airport-wx-btn');
    if (viewAirportWxBtn) {
      viewAirportWxBtn.onclick = () => {
        const selectedApt = wxAirports[activeDashWxTab] || origin;
        navigateToBriefingAirport(selectedApt.icao_code);
      };
    }

    // ---- NOTAM WIDGET (PAGINA 2 - SINISTRA) ----
    const ntabOrig = document.getElementById('notam-tab-origin');
    const ntabDest = document.getElementById('notam-tab-destination');
    const ntabAltn = document.getElementById('notam-tab-alternate');
    if (ntabOrig) ntabOrig.textContent = origin.icao_code || 'ORIG';
    if (ntabDest) ntabDest.textContent = destination.icao_code || 'DEST';
    if (ntabAltn) ntabAltn.textContent = activeAltnObj.icao_code || 'ALTN';

    if (!wxAirports[activeDashNotamTab] || !wxAirports[activeDashNotamTab].icao_code) {
      activeDashNotamTab = 'origin';
    }

    document.querySelectorAll('#dash-notam-tabs .wx-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.notamApt === activeDashNotamTab);
      tab.onclick = () => {
        activeDashNotamTab = tab.dataset.notamApt;
        document.querySelectorAll('#dash-notam-tabs .wx-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        renderDashNotams(wxAirports, activeDashNotamTab);
      };
    });
    renderDashNotams(wxAirports, activeDashNotamTab);

    const viewAirportNotamsBtn = document.getElementById('view-airport-notams-btn');
    if (viewAirportNotamsBtn) {
      viewAirportNotamsBtn.onclick = () => {
        const selectedApt = wxAirports[activeDashNotamTab] || origin;
        navigateToBriefingAirport(selectedApt.icao_code, 'brf-apt-notam-widget');
      };
    }

    // ---- DISPATCH & CREW (PAGINA 2 - DESTRA) ----
    renderDashDispatchAndCrew(data);

    // ---- ROUTE (PAGINA 1 - CENTRO) ----
    renderRouteMap(data);
    renderRouteSummary(data, origin, destination, general);

    if (typeof renderClassicOfpText === 'function') {
      renderClassicOfpText(data);
    }

    // ---- VIEW WX CHARTS & NAVIGRAPH BUTTONS ----
    const wxChartsBtn = document.getElementById('view-wx-charts-btn');
    if (wxChartsBtn) {
      const newWxBtn = wxChartsBtn.cloneNode(true);
      wxChartsBtn.parentNode.replaceChild(newWxBtn, wxChartsBtn);
      newWxBtn.addEventListener('click', () => {
        const sigwxUrl = findMapUrl(data, 'weather') || findMapUrl(data, 'sigwx') || findMapUrl(data, 'wind');
        if (sigwxUrl) {
          window.open(sigwxUrl, "_blank", "noopener,noreferrer");
        } else {
          showToast("WX Charts non disponibili per questo OFP.");
        }
      });
    }

    const navBtn = document.getElementById('navigraph-btn');
    if (navBtn) {
      const newNavBtn = navBtn.cloneNode(true);
      navBtn.parentNode.replaceChild(newNavBtn, navBtn);
      newNavBtn.addEventListener('click', () => {
        const url = buildNavigraphImportUrl(data);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      });
    }
  } catch (err) {
    console.error('Errore nel rendering della Dashboard:', err);
  }
}

/* ---------- FLIGHT CHECKLIST (PAGINA 1 - SINISTRA) ---------- */
function renderFlightChecklist(flight) {
  const container = document.getElementById('dash-checklist-body');
  if (!container || !flight) return;

  const state = flight.state || {};
  const data = flight.raw || {};
  const general = data.general || {};
  const isAccepted = Boolean(state.accepted);
  const isFuelOrdered = Boolean(state.fuelState && state.fuelState.fuelOrdered);
  const hasWeights = Boolean(state.actualWeights && (state.actualWeights.load || state.actualWeights.zfw || state.actualWeights.tow));
  const flaggedCount = Array.isArray(state.flaggedNotams) ? state.flaggedNotams.length : 0;
  const manualChecks = state.manualChecklist || {};

  const items = [
    {
      id: 'ofp_review',
      title: 'OFP & Briefing Review',
      sub: `OFP ${general.release || '1'} • ${isAccepted ? 'Accepted & Signed' : 'Pending Acceptance'}`,
      done: isAccepted,
      onClick: () => openSignatureModal()
    },
    {
      id: 'fuel_order',
      title: 'Fuel Order',
      sub: isFuelOrdered ? 'Fuel uplift ordered' : 'Order required in Briefing > Fuel',
      done: isFuelOrdered,
      onClick: () => navigateToBriefingSection('Fuel')
    },
    {
      id: 'loadsheet',
      title: 'Loadsheet & Actual Weights',
      sub: hasWeights ? 'Actual weights entered' : 'Verify ZFW / TOW / LW',
      done: hasWeights || Boolean(manualChecks.loadsheet),
      onClick: () => navigateToBriefingSection('Fuel')
    },
    {
      id: 'notams',
      title: 'NOTAMs & Weather Check',
      sub: flaggedCount > 0 ? `${flaggedCount} NOTAM(s) flagged` : 'Tap to mark reviewed',
      done: flaggedCount > 0 || Boolean(manualChecks.notams),
      onClick: () => toggleManualChecklistItem('notams')
    },
    {
      id: 'journey_log',
      title: 'Journey Log & OOOI',
      sub: state.submitted ? 'Submitted' : 'Record OUT / OFF / ON / IN times',
      done: Boolean(state.submitted) || Boolean(state.journeyLog && state.journeyLog.times && state.journeyLog.times.actOut),
      onClick: () => navigateToBriefingSection('Flight Times and Fuel')
    }
  ];

  container.innerHTML = items.map(item => `
    <div class="chk-item" data-chk-id="${item.id}">
      <div class="chk-icon ${item.done ? 'done' : 'pending'}">${item.done ? '&#10003;' : ''}</div>
      <div class="chk-body">
        <div class="chk-title">${item.title}</div>
        <div class="chk-sub">${item.sub}</div>
      </div>
    </div>
  `).join('');

  items.forEach(item => {
    const el = container.querySelector(`.chk-item[data-chk-id="${item.id}"]`);
    if (el && item.onClick) {
      el.addEventListener('click', item.onClick);
    }
  });
}

function toggleManualChecklistItem(key) {
  if (!currentFlightId) return;
  const flight = getFlight(currentFlightId);
  if (!flight) return;
  if (!flight.state) flight.state = {};
  if (!flight.state.manualChecklist) flight.state.manualChecklist = {};
  flight.state.manualChecklist[key] = !flight.state.manualChecklist[key];
  updateFlightState(currentFlightId, { manualChecklist: flight.state.manualChecklist });
  renderFlightChecklist(flight);
}

/* ---------- WEATHER RENDERING (DASHBOARD - 3 SOTTO-BLOCCHI) ---------- */
function findTlrRunwayForAirport(data, which, icaoCode, planRwy) {
  if (!data || !data.tlr) return null;
  let list = [];
  if (which === 'origin' && data.tlr.takeoff && data.tlr.takeoff.runway) {
    list = Array.isArray(data.tlr.takeoff.runway) ? data.tlr.takeoff.runway : [data.tlr.takeoff.runway];
  } else if (which === 'destination' && data.tlr.landing && data.tlr.landing.runway) {
    list = Array.isArray(data.tlr.landing.runway) ? data.tlr.landing.runway : [data.tlr.landing.runway];
  } else if (which === 'alternate' && data.tlr.alternate) {
    const altTlr = Array.isArray(data.tlr.alternate)
      ? data.tlr.alternate.find(a => a.icao_code === icaoCode) || data.tlr.alternate[0]
      : data.tlr.alternate;
    if (altTlr && altTlr.runway) {
      list = Array.isArray(altTlr.runway) ? altTlr.runway : [altTlr.runway];
    }
  }
  if (list.length === 0) return null;
  if (planRwy) {
    const match = list.find(r => String(r.identifier).padStart(2, '0') === String(planRwy).padStart(2, '0'));
    if (match) return match;
  }
  return list[0];
}

function parseMetarCeilingVisibility(metar) {
  const raw = String(metar || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!raw) return { ceiling: null, visibility: null, noCeiling: false };

  let visibility = null;
  if (/\bCAVOK\b/.test(raw)) {
    visibility = 10000;
  } else {
    const metricVisibility = raw.match(/(?:^|\s)(\d{4})(?=\s|$)/);
    if (metricVisibility) {
      visibility = Number(metricVisibility[1]);
    } else {
      const statute = raw.match(/(?:^|\s)(\d+(?:\s+\d+\/\d+|\/\d+)?)SM(?=\s|$)/);
      if (statute) {
        const parts = statute[1].split(/\s+/);
        let miles = 0;
        parts.forEach(part => {
          if (part.includes('/')) {
            const fraction = part.split('/');
            miles += Number(fraction[0]) / Number(fraction[1]);
          } else {
            miles += Number(part);
          }
        });
        if (Number.isFinite(miles)) visibility = Math.round(miles * 1609.344);
      }
    }
  }

  const ceilingLayers = Array.from(raw.matchAll(/\b(?:BKN|OVC|VV)(\d{3})\b/g))
    .map(match => Number(match[1]) * 100)
    .filter(Number.isFinite);
  const ceiling = ceilingLayers.length ? Math.min(...ceilingLayers) : null;
  const unknownCeiling = /\b(?:BKN|OVC|VV)\/\/\/(?:\s|$)/.test(raw);
  const noCeiling = !unknownCeiling && (
    /\b(?:CAVOK|NSC|NCD|SKC|CLR)\b/.test(raw) || !ceilingLayers.length
  );

  return { ceiling, visibility, noCeiling };
}

function getAirportWeatherMetrics(data, which, airport) {
  airport = airport || {};
  const airportCode = airport.icao_code || airport.icao || '';
  const formatMetric = (value, unit) => {
    if (value === undefined || value === null || String(value).trim() === '') return '-';
    const numeric = Number(value);
    return Number.isNaN(numeric) ? String(value) : `${numeric} ${unit}`;
  };

  const parsedMetar = parseMetarCeilingVisibility(airport.metar);
  const ceilingValue = airport.metar_ceiling !== undefined && airport.metar_ceiling !== null && String(airport.metar_ceiling).trim() !== ''
    ? airport.metar_ceiling : parsedMetar.ceiling;
  const visibilityValue = airport.metar_visibility !== undefined && airport.metar_visibility !== null && String(airport.metar_visibility).trim() !== ''
    ? airport.metar_visibility : parsedMetar.visibility;
  const ceiling = formatMetric(ceilingValue, 'ft');
  const visibility = formatMetric(visibilityValue, 'm');

  let hwc = '-';
  let cwc = '-';
  const runway = findTlrRunwayForAirport(data, which, airportCode, airport.plan_rwy)
    || (airport.plan_rwy ? { identifier: airport.plan_rwy } : null);
  if (runway && airport.metar) {
    const wind = computeRunwayWind(runway, airport.metar);
    if (!Number.isNaN(wind.hw)) {
      hwc = wind.hw > 0 ? `H${wind.hw} kt` : wind.hw < 0 ? `T${Math.abs(wind.hw)} kt` : '0 kt';
    }
    if (!Number.isNaN(wind.xw)) cwc = `${Math.abs(wind.xw)} kt`;
  }

  const category = String(airport.metar_category || '').toLowerCase();
  let vmcLabel = category === 'vfr' || category === 'mvfr' ? 'VMC'
    : category === 'ifr' || category === 'lifr' ? 'IMC' : '--';
  if (vmcLabel === '--' && (ceilingValue !== null || visibilityValue !== null || parsedMetar.noCeiling)) {
    const lowCeiling = ceilingValue !== null && ceilingValue !== undefined && Number(ceilingValue) < 1000;
    const lowVisibility = visibilityValue !== null && visibilityValue !== undefined && Number(visibilityValue) < 5000;
    vmcLabel = lowCeiling || lowVisibility ? 'IMC' : 'VMC';
  }
  return {
    ceiling, visibility, hwc, cwc, vmcLabel,
    vmcClass: vmcLabel === 'VMC' ? 'vmc' : vmcLabel === 'IMC' ? 'imc' : ''
  };
}

function setVmcBadge(badge, metrics) {
  if (!badge) return;
  badge.textContent = metrics.vmcLabel;
  badge.className = `wx-badge${metrics.vmcClass ? ' ' + metrics.vmcClass : ''}`;
}

function renderWeather(data, wxAirports, which) {
  const airport = wxAirports[which] || {};
  const setT = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  const metrics = getAirportWeatherMetrics(data, which, airport);

  const codeStr = airport.icao_code
    ? (airport.iata_code ? `${airport.icao_code}/${airport.iata_code}` : airport.icao_code)
    : '----';
  setT('wx-apt-code', codeStr);
  setT('wx-apt-name', airport.name || '---');

  setT('wx-param-ceiling', metrics.ceiling);
  setT('wx-param-vis', metrics.visibility);
  setT('wx-param-hwc', metrics.hwc);
  setT('wx-param-cwc', metrics.cwc);
  setT('wx-metar-text', airport.metar || 'METAR non disponibile');
  setT('wx-taf-text', airport.taf || 'TAF non disponibile');
  setT('wx-metar-age', formatObsDateTime(airport.metar_time));
  setT('wx-taf-age', airport.taf_time ? `Issued ${formatObsDateTime(airport.taf_time)}` : '');
  setVmcBadge(document.getElementById('wx-vmc-badge'), metrics);
}

function escapeNotamHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNotamText(rawText) {
  let formatted = escapeNotamHtml(rawText);
  formatted = formatted.replace(/\bRWY(?:\s*([0-9]{2}[LCR]?(?:\/[0-9]{2}[LCR]?)*))?/gi, (match, runwayGroup) => {
    const identifiers = runwayGroup
      ? ' ' + runwayGroup.split('/').map(id => '<span class="notam-rwy-ident">' + id + '</span>').join('/')
      : '';
    return '<span class="notam-hl-warn">RWY</span>' + identifiers;
  });
  formatted = formatted.replace(/\b(TWY|VOR|DVOR|VORTAC|TACAN|LOC|LLZ|NDB|ADF|ILS|GS|RNP|RNAV|DME|PAPI|GLS|GBAS|GNSS|GPS)\b/gi,
    '<span class="notam-hl-warn">$1</span>');
  formatted = formatted.replace(/\b(CLSD|NOT AVAILABLE|NOT AVBL|NOT USABLE|DO NOT USE|UNSERVICEABLE)\b|U\/S/gi,
    match => '<span class="notam-hl-danger">' + match + '</span>');
  return formatted;
}

function getAirportNotamFilter(icao) {
  return icao && airportNotamFilters[icao] === 'flagged' ? 'flagged' : 'all';
}

function setAirportNotamFilter(icao, filter) {
  if (!icao) return;
  airportNotamFilters[icao] = filter === 'flagged' ? 'flagged' : 'all';
  syncAirportNotamFilterControls(icao);
  applyDashboardNotamFilter();
  applyBriefingNotamFilter();
}

function syncAirportNotamFilterControls(icao) {
  document.querySelectorAll('[data-airport-notam-filter]').forEach(control => {
    if (!icao || control.dataset.icao === icao) {
      control.value = getAirportNotamFilter(control.dataset.icao);
    }
  });
}

function bindAirportNotamFilterControls(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-airport-notam-filter]').forEach(control => {
    control.onchange = () => setAirportNotamFilter(control.dataset.icao, control.value);
  });
  syncAirportNotamFilterControls();
}

function getFlaggedNotamIds() {
  const flight = getFlight(currentFlightId);
  const ids = flight && flight.state && flight.state.flaggedNotams;
  return Array.isArray(ids) ? ids.map(String) : [];
}

function applyDashboardNotamFilter() {
  const listEl = document.getElementById('dash-notam-list');
  if (!listEl) return;
  const filter = getAirportNotamFilter(listEl.dataset.airportIcao);
  listEl.querySelectorAll('.dash-notam-category-wrapper').forEach(wrapper => {
    let visibleCount = 0;
    wrapper.querySelectorAll('.dash-notam-item').forEach(card => {
      const visible = filter !== 'flagged' || getFlaggedNotamIds().includes(card.dataset.notamId);
      card.style.display = visible ? '' : 'none';
      if (visible) visibleCount++;
    });
    wrapper.style.display = visibleCount ? '' : 'none';
  });
}

function applyBriefingNotamFilter() {
  const body = document.getElementById('brf-apt-notam-body');
  if (!body) return;
  const filter = getAirportNotamFilter(body.dataset.airportIcao);
  body.querySelectorAll('.notam-category-wrapper').forEach(wrapper => {
    let visibleCount = 0;
    wrapper.querySelectorAll('.notam-box').forEach(card => {
      const visible = filter !== 'flagged' || getFlaggedNotamIds().includes(card.dataset.notamId);
      card.style.display = visible ? '' : 'none';
      if (visible) visibleCount++;
    });
    wrapper.style.display = visibleCount ? '' : 'none';
  });
}

function syncNotamFilterControls() {
  document.querySelectorAll('[data-notam-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.notamFilter === activeNotamFilter);
  });
}

function bindNotamFilterControls() {
  document.querySelectorAll('[data-notam-filter]').forEach(button => {
    button.onclick = () => setActiveNotamFilter(button.dataset.notamFilter);
  });
  syncNotamFilterControls();
}

function setActiveNotamFilter(filter) {
  activeNotamFilter = filter === 'flagged' ? 'flagged' : 'all';
  syncNotamFilterControls();
  if (typeof applyBriefingAirportMenuFilter === 'function') applyBriefingAirportMenuFilter();
}

function refreshNotamFlagViews() {
  const flagged = getFlaggedNotamIds();
  document.querySelectorAll('.notam-flag, .dash-notam-flag').forEach(button => {
    const card = button.closest('[data-notam-id]');
    if (!card) return;
    const isFlagged = flagged.includes(card.dataset.notamId);
    button.classList.toggle('flagged', isFlagged);
    button.setAttribute('aria-pressed', String(isFlagged));
  });
  applyDashboardNotamFilter();
  applyBriefingNotamFilter();
  syncAirportNotamFilterControls();
  if (typeof applyBriefingAirportMenuFilter === 'function') applyBriefingAirportMenuFilter();
  const flight = getFlight(currentFlightId);
  if (flight && typeof renderFlightChecklist === 'function') renderFlightChecklist(flight);
}

function toggleNotamFlag(notamId) {
  const flight = getFlight(currentFlightId);
  if (!flight) return;
  if (!flight.state) flight.state = {};
  const current = Array.isArray(flight.state.flaggedNotams) ? flight.state.flaggedNotams.map(String) : [];
  const next = current.includes(notamId)
    ? current.filter(id => id !== notamId)
    : [...current, notamId];
  flight.state.flaggedNotams = next;
  updateFlightState(currentFlightId, { flaggedNotams: next });
  refreshNotamFlagViews();
}

/* ---------- NOTAM WIDGET (PAGINA 2 - SINISTRA) ---------- */
function renderDashNotams(wxAirports, which) {
  const listEl = document.getElementById('dash-notam-list');
  if (!listEl) return;

  const airport = wxAirports[which] || {};
  const icao = airport.icao_code || '';
  listEl.dataset.airportIcao = icao;
  const aptEntry = Array.isArray(currentAirportsData)
    ? currentAirportsData.find(a => a.icao === icao)
    : null;
  const notams = (aptEntry && Array.isArray(aptEntry.notams)) ? aptEntry.notams : [];

  if (notams.length === 0) {
    listEl.innerHTML = '<p class="hint" style="text-align:center; margin-top:24px;">Nessun NOTAM attivo per ' +
      escapeNotamHtml(icao || '---') + '.</p>';
    return;
  }

  const grouped = {};
  notams.forEach(notam => {
    const category = decodeQCodeCategory(notam.notam_qcode);
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(notam);
  });

  const catOrder = { RUNWAY: 1, SID: 2, STAR: 3, 'APPROACH PROCEDURES': 4, AIRPORT: 5 };
  const sortedCats = Object.keys(grouped).sort((a, b) => (catOrder[a] || 99) - (catOrder[b] || 99));
  const flagged = getFlaggedNotamIds();
  const selectedFilter = getAirportNotamFilter(icao);

  let html = '';
  sortedCats.forEach((category, categoryIndex) => {
    const firstCategory = categoryIndex === 0;
    if (firstCategory) {
      html += '<div class="notam-category-heading-row"><div class="dash-notam-cat-title">' +
        escapeNotamHtml(category) + '</div>' +
        '<label class="notam-airport-filter"><span class="notam-airport-filter-label">Show:</span>' +
        '<select class="brf-select notam-airport-filter-select" data-airport-notam-filter data-icao="' +
        escapeNotamHtml(icao) + '" aria-label="Show all or flagged NOTAMs">' +
        '<option value="all"' + (selectedFilter === 'all' ? ' selected' : '') + '>All</option>' +
        '<option value="flagged"' + (selectedFilter === 'flagged' ? ' selected' : '') + '>Flagged</option>' +
        '</select></label></div>';
      html += '<div class="dash-notam-category-wrapper">';
    } else {
      html += '<div class="dash-notam-category-wrapper"><div class="dash-notam-cat-title">' +
        escapeNotamHtml(category) + '</div>';
    }
    grouped[category].forEach(notam => {
      const notamId = String(notam.notam_id || 'UNKNOWN');
      const safeId = escapeNotamHtml(notamId);
      const start = formatNotamDate(notam.notam_effective_dtg || notam.notam_created_dtg);
      const end = formatNotamDate(notam.notam_expire_dtg || notam.notam_expire_dtg_estimated);
      const isFlagged = flagged.includes(notamId);
      html += '<div class="notam-box dash-notam-item" data-notam-id="' + safeId + '">' +
        '<div class="notam-top-row"><div class="notam-badge">' + escapeNotamHtml(category) + '</div>' +
        '<button type="button" class="notam-flag dash-notam-flag' + (isFlagged ? ' flagged' : '') +
        '" data-notam-id="' + safeId + '" aria-label="Flag NOTAM" aria-pressed="' + isFlagged + '">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg></button></div>' +
        '<div class="notam-header">' + safeId + ' - ' + escapeNotamHtml(start) + ' - ' + escapeNotamHtml(end) + '</div>' +
        '<div class="notam-body">' + formatNotamText(notam.notam_report || notam.notam_text || '') + '</div></div>';
    });
    html += '</div>';
  });

  listEl.innerHTML = html;
  listEl.querySelectorAll('.dash-notam-flag').forEach(button => {
    button.addEventListener('click', () => toggleNotamFlag(button.dataset.notamId));
  });
  bindAirportNotamFilterControls(listEl);
  applyDashboardNotamFilter();
}

/* ---------- DISPATCH & CREW (PAGINA 2 - DESTRA) ---------- */
function renderDashDispatchAndCrew(data) {
  const crew = data.crew || {};
  const general = data.general || {};

  const dxNameEl = document.getElementById('dash-dx-name');
  const dxPhoneEl = document.getElementById('dash-dx-phone');
  const dxRmkEl = document.getElementById('dash-dx-rmk');

  const cleanStr = (val, fallback) => {
    if (!val || typeof val !== 'string') return fallback;
    const trimmed = val.trim();
    if (!trimmed || trimmed.includes('......')) return fallback;
    return trimmed;
  };

  if (dxNameEl) dxNameEl.textContent = cleanStr(crew.dx, 'OPS / DISPATCH');
  if (dxPhoneEl) dxPhoneEl.textContent = cleanStr(crew.dx_phone || general.dx_phone, '+39 02 0000 0000');
  if (dxRmkEl) {
    dxRmkEl.textContent = (general.dx_rmk && general.dx_rmk.trim() !== '') ? general.dx_rmk.trim() : 'NIL';
  }

  const crewBody = document.getElementById('dash-crew-body');
  if (!crewBody) return;

  const rows = [];
  const cpt = cleanStr(crew.cpt, '');
  const fo = cleanStr(crew.fo, '');
  const pu = cleanStr(crew.pu, '');
  if (cpt) rows.push({ role: 'CPT', name: cpt });
  if (fo) rows.push({ role: 'FO', name: fo });
  if (pu) rows.push({ role: 'PU', name: pu });

  if (crew.fa) {
    const faList = Array.isArray(crew.fa) ? crew.fa : [crew.fa];
    faList.forEach((faName, i) => {
      const cleaned = cleanStr(faName, '');
      if (cleaned) rows.push({ role: `FA${i + 1}`, name: cleaned });
    });
  }

  if (rows.length === 0) {
    crewBody.innerHTML = '<p class="hint" style="text-align:center; margin:auto;">Nessun dato equipaggio disponibile.</p>';
    return;
  }

  crewBody.innerHTML = rows.map(r => `
    <div class="crew-row">
      <span class="crew-role-badge">${r.role}</span>
      <span class="crew-name">${r.name}</span>
    </div>
  `).join('');
}

/* ---------- ROUTE MAP & SUMMARY ---------- */
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
    if (img) img.style.display = 'none';
    if (fallback) {
      fallback.style.display = 'block';
      fallback.innerHTML = 'Mappa rotta non disponibile. Controlla che "Maps" sia attivo tra le opzioni del dispatch su SimBrief.';
    }
    return;
  }

  if (img) {
    img.onload = () => { if (fallback) fallback.style.display = 'none'; };
    img.onerror = () => {
      img.style.display = 'none';
      if (fallback) {
        fallback.style.display = 'block';
        fallback.innerHTML = `Impossibile mostrare la mappa qui dentro. <a href="${url}" target="_blank" rel="noopener">Aprila in una nuova scheda</a>.`;
      }
    };
    img.style.display = 'block';
    img.src = url;
  }
}

function renderRouteSummary(data, origin, destination, general, targetId) {
  const el = document.getElementById(targetId || 'route-summary');
  if (!el) return;
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
  if (!scroller) return;

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
function initSignaturePad() {
  canvas = document.getElementById('signature-pad');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  function resizeCanvas() {
    if (!canvas.parentElement) return;
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
  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);
  canvas.addEventListener('touchcancel', stopDrawing);
  return resizeCanvas;
}

function clearSignature() {
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cb = document.getElementById('acceptance-checkbox');
  if (cb) cb.checked = false;
}

function openSignatureModal() {
  const overlay = document.getElementById('signature-modal-overlay');
  const modal = document.getElementById('signature-modal');
  if (overlay) overlay.classList.add('open');
  if (modal) modal.classList.add('open');
  setTimeout(() => {
    const resize = initSignaturePad();
    if (resize) resize();
  }, 50);
}

function closeSignatureModal() {
  const overlay = document.getElementById('signature-modal-overlay');
  const modal = document.getElementById('signature-modal');
  if (overlay) overlay.classList.remove('open');
  if (modal) modal.classList.remove('open');
}

function setupAcceptanceLogic() {
  const btn = document.getElementById('accept-flight-btn');
  if (btn) btn.addEventListener('click', openSignatureModal);

  const cancelBtn = document.getElementById('sig-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    clearSignature();
    closeSignatureModal();
  });

  const saveBtn = document.getElementById('sig-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    if (currentFlightId) {
      updateFlightState(currentFlightId, { accepted: true });
    }
    closeSignatureModal();
    applyAcceptanceUI(true);
    const f = getFlight(currentFlightId);
    if (f) renderFlightChecklist(f);
  });
}

function applyAcceptanceUI(isAccepted) {
  const btn = document.getElementById('accept-flight-btn');
  const badge = document.getElementById('fib-status');
  const submitBtn = document.getElementById('submit-flight-btn');

  if (submitBtn) {
    submitBtn.disabled = !isAccepted;
  }

  if (isAccepted) {
    if (btn) {
      btn.textContent = 'Flight Accepted';
      btn.classList.add('btn-accepted');
    }
    if (badge) {
      badge.textContent = 'CONFIRMED';
      badge.className = 'status-badge accepted';
    }
  } else {
    if (btn) {
      btn.textContent = 'Accept Flight';
      btn.classList.remove('btn-accepted');
    }
    if (badge) {
      badge.textContent = 'NOT ACCEPTED';
      badge.className = 'status-badge not-accepted';
    }
  }
}

/* ---------- SUBMIT FLIGHT LOGIC ---------- */
function initSubmitSignaturePad() {
  submitCanvas = document.getElementById('submit-signature-pad');
  if (!submitCanvas) return;
  submitCtx = submitCanvas.getContext('2d');

  function resizeCanvas() {
    if (!submitCanvas.parentElement) return;
    const rect = submitCanvas.parentElement.getBoundingClientRect();
    submitCanvas.width = rect.width;
    submitCanvas.height = rect.height;
    submitCtx.lineCap = 'round';
    submitCtx.lineJoin = 'round';
    submitCtx.lineWidth = 2;
    submitCtx.strokeStyle = getTheme() === 'dark' ? '#fff' : '#000';
  }
  window.addEventListener('resize', resizeCanvas);

  function getPos(e) {
    const rect = submitCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDrawing(e) {
    submitIsDrawing = true;
    const pos = getPos(e);
    submitCtx.beginPath();
    submitCtx.moveTo(pos.x, pos.y);
    e.preventDefault();
  }
  function draw(e) {
    if (!submitIsDrawing) return;
    const pos = getPos(e);
    submitCtx.lineTo(pos.x, pos.y);
    submitCtx.stroke();
    e.preventDefault();
  }
  function stopDrawing() { submitIsDrawing = false; }

  submitCanvas.addEventListener('mousedown', startDrawing);
  submitCanvas.addEventListener('mousemove', draw);
  submitCanvas.addEventListener('mouseup', stopDrawing);
  submitCanvas.addEventListener('mouseout', stopDrawing);
  submitCanvas.addEventListener('touchstart', startDrawing, { passive: false });
  submitCanvas.addEventListener('touchmove', draw, { passive: false });
  submitCanvas.addEventListener('touchend', stopDrawing);
  submitCanvas.addEventListener('touchcancel', stopDrawing);
  return resizeCanvas;
}

function openSubmitModal() {
  const overlay = document.getElementById('submit-modal-overlay');
  const modal = document.getElementById('submit-modal');
  if (overlay) overlay.classList.add('open');
  if (modal) modal.classList.add('open');
  setTimeout(() => {
    const resize = initSubmitSignaturePad();
    if (resize) resize();
  }, 50);
}

function closeSubmitModal() {
  const overlay = document.getElementById('submit-modal-overlay');
  const modal = document.getElementById('submit-modal');
  if (overlay) overlay.classList.remove('open');
  if (modal) modal.classList.remove('open');
  const cb = document.getElementById('submit-acceptance-checkbox');
  if (cb) cb.checked = false;
  if (submitCtx && submitCanvas) submitCtx.clearRect(0, 0, submitCanvas.width, submitCanvas.height);
}

function setupSubmitLogic() {
  const submitBtn = document.getElementById('submit-flight-btn');
  if (submitBtn) submitBtn.addEventListener('click', openSubmitModal);

  const cancelBtn = document.getElementById('submit-sig-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeSubmitModal);

  const saveBtn = document.getElementById('submit-sig-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    if (currentFlightId) {
      updateFlightState(currentFlightId, {
        submitted: true,
        submittedAt: Date.now()
      });
      showToast("Volo archiviato con successo in 'Submitted'!");
    }
    closeSubmitModal();
    window.location.hash = '#/home';
  });
}
