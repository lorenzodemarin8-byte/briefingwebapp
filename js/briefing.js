/* js/briefing.js
   Navigazione sidebar Briefing, General, Fuel UI, MEL/CDL, Crew Alert/Bulletins, ATC, Dispatch, WX/RAIM/NOTAM, Classic OFP.
*/

function extractAirportsData(data) {
  currentAirportsData = [];
  if (!data) return;

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
      icao_code: data.origin.icao_code,
      plan_rwy: data.origin.plan_rwy,
      name: data.origin.name,
      metar_ceiling: data.origin.metar_ceiling,
      metar_visibility: data.origin.metar_visibility,
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
      icao_code: data.destination.icao_code,
      plan_rwy: data.destination.plan_rwy,
      name: data.destination.name,
      metar_ceiling: data.destination.metar_ceiling,
      metar_visibility: data.destination.metar_visibility,
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
          icao_code: alt.icao_code,
          plan_rwy: alt.plan_rwy,
          name: alt.name,
          metar_ceiling: alt.metar_ceiling,
          metar_visibility: alt.metar_visibility,
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

  if (data.takeoff_altn) {
    let toAltns = Array.isArray(data.takeoff_altn) ? data.takeoff_altn : [data.takeoff_altn];
    toAltns.forEach(alt => {
      if (alt && alt.icao_code) {
        currentAirportsData.push({
          type: 'Takeoff Alternate',
          icao: alt.icao_code,
          iata: alt.iata_code,
          icao_code: alt.icao_code,
          plan_rwy: alt.plan_rwy,
          name: alt.name,
          metar_ceiling: alt.metar_ceiling,
          metar_visibility: alt.metar_visibility,
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

  if (data.enroute_altn) {
    let erAltns = Array.isArray(data.enroute_altn) ? data.enroute_altn : [data.enroute_altn];
    erAltns.forEach(alt => {
      if (alt && alt.icao_code) {
        currentAirportsData.push({
          type: 'Enroute Alternate',
          icao: alt.icao_code,
          iata: alt.iata_code,
          icao_code: alt.icao_code,
          plan_rwy: alt.plan_rwy,
          name: alt.name,
          metar_ceiling: alt.metar_ceiling,
          metar_visibility: alt.metar_visibility,
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
  if (!listEl) return;
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
  bindNotamFilterControls();
  applyBriefingAirportMenuFilter();
}

function applyBriefingAirportMenuFilter() {
  const flaggedIds = getFlaggedNotamIds();
  document.querySelectorAll('#brf-wx-menu-list .brf-apt-item').forEach(item => {
    const apt = currentAirportsData[Number(item.dataset.aptIndex)];
    const hasFlagged = Boolean(apt && Array.isArray(apt.notams) &&
      apt.notams.some(notam => flaggedIds.includes(String(notam.notam_id || 'UNKNOWN'))));
    item.style.display = activeNotamFilter === 'flagged' && !hasFlagged ? 'none' : '';
  });
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

  const setT = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };

  setT('gen-dep', origin.iata_code ? `${origin.icao_code}/${origin.iata_code}` : (origin.icao_code || '----'));
  setT('gen-arr', destination.iata_code ? `${destination.icao_code}/${destination.iata_code}` : (destination.icao_code || '----'));
  setT('gen-callsign', atc.callsign || '—');
  const depL = origin.timezone !== undefined ? ` (${formatLocalTime(times.sched_out, origin.timezone)})` : '';
  const arrL = destination.timezone !== undefined ? ` (${formatLocalTime(times.sched_in, destination.timezone)})` : '';
  setT('gen-std', `${unixToHHMM(times.sched_out)}z${depL}`);
  setT('gen-sta', `${unixToHHMM(times.sched_in)}z${arrL}`);
  setT('gen-actype', aircraft.name || aircraft.icaocode || '—');
  setT('gen-reg', aircraft.reg || '—');
  const machStr = general.cruise_mach ? `M${general.cruise_mach}` : '';
  const ciStr = general.costindex ? `CI ${general.costindex}` : '';
  setT('gen-crzsys', [machStr, ciStr].filter(Boolean).join(' / ') || general.cruise_profile || '—');
  setT('gen-gnddist', general.route_distance ? `${general.route_distance}NM` : '—');
  setT('gen-airdist', general.air_distance ? `${general.air_distance}NM` : '—');
  setT('gen-tocwind', toc ? `${toc.wind_dir}°/${toc.wind_spd}KT` : '—');

  let avgWindStr = '—';
  if (general.avg_wind_dir && general.avg_wind_spd) {
    avgWindStr = `${general.avg_wind_dir}°/${parseInt(general.avg_wind_spd, 10)}KT`;
  }
  setT('gen-avgwind', avgWindStr);

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
}

function setupWeightLimitCheck(inputId, opId, structId, weightKey) {
  const inp = document.getElementById(inputId);
  if (!inp) return;

  const flight = getFlight(currentFlightId);
  const savedWeights = (flight && flight.state && flight.state.actualWeights) || {};

  const newInp = inp.cloneNode(true);
  inp.parentNode.replaceChild(newInp, inp);

  if (weightKey && savedWeights[weightKey]) {
    newInp.value = savedWeights[weightKey];
  }

  const checkLimit = () => {
    newInp.classList.remove('limit-exceeded');
    const val = parseFloat(newInp.value);
    if (isNaN(val)) return;

    let opLim = opId ? parseFloat(document.getElementById(opId).textContent) : NaN;
    let strLim = structId ? parseFloat(document.getElementById(structId).textContent) : NaN;

    if ((!isNaN(opLim) && val > opLim) || (!isNaN(strLim) && val > strLim)) {
      newInp.classList.add('limit-exceeded');
    }
  };

  checkLimit();

  newInp.addEventListener('input', (e) => {
    checkLimit();
    if (weightKey && flight) {
      if (!flight.state) flight.state = {};
      if (!flight.state.actualWeights) flight.state.actualWeights = {};
      flight.state.actualWeights[weightKey] = e.target.value;
      updateFlightState(currentFlightId, { actualWeights: flight.state.actualWeights });

      renderFuelSection(flight);
    }
  });
}

function renderFuelSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const dest = data.destination || {};
  const orig = data.origin || {};
  const alternates = getAlternatesList(data);

  const savedFuel = (flight.state && flight.state.fuelState) || {};
  const setT = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };

  const calcs = getFuelCalculations(data, flight.state);

  // Pesi aggiornati reattivamente
  setT('gen-w-dow-plan', data.weights.oew || '—');
  setT('gen-w-load-plan', data.weights.payload || '—');
  setT('gen-w-zfw-plan', data.weights.est_zfw || '—');
  setT('gen-w-tow-plan', Math.round(calcs.updatedTow));
  setT('gen-w-lw-plan', Math.round(calcs.updatedLw));
  setT('gen-w-zfw-struct', data.weights.max_zfw || '—');
  setT('gen-w-tow-struct', data.weights.max_tow_struct || data.weights.max_tow || '—');
  setT('gen-w-lw-struct', data.weights.max_ldw || '—');

  let opTow = '—';
  if (data.tlr && data.tlr.takeoff && data.tlr.takeoff.runway) {
    let rwyList = Array.isArray(data.tlr.takeoff.runway) ? data.tlr.takeoff.runway : [data.tlr.takeoff.runway];
    let rwy = rwyList.find(r => String(r.identifier).padStart(2, '0') === String(data.origin && data.origin.plan_rwy).padStart(2, '0'));
    if (rwy && rwy.max_weight) opTow = rwy.max_weight;
  }
  setT('gen-w-tow-op', opTow);

  let opLw = '—';
  if (data.tlr && data.tlr.landing && data.tlr.landing.runway) {
    let rwyList = Array.isArray(data.tlr.landing.runway) ? data.tlr.landing.runway : [data.tlr.landing.runway];
    let rwy = rwyList.find(r => String(r.identifier).padStart(2, '0') === String(data.destination && data.destination.plan_rwy).padStart(2, '0'));
    if (rwy) {
      let cond = data.tlr.landing.conditions && data.tlr.landing.conditions.surface_condition;
      if (cond === 'wet' && rwy.max_weight_wet) opLw = rwy.max_weight_wet;
      else if (rwy.max_weight_dry) opLw = rwy.max_weight_dry;
      else if (rwy.max_weight) opLw = rwy.max_weight;
    }
  }
  setT('gen-w-lw-op', opLw);

  const savedWeights = (flight.state && flight.state.actualWeights) || {};
  const loadInp = document.getElementById('gen-w-load-act');
  if (loadInp) {
    const newLoadInp = loadInp.cloneNode(true);
    loadInp.parentNode.replaceChild(newLoadInp, loadInp);
    newLoadInp.value = savedWeights.load || '';
    newLoadInp.addEventListener('input', (e) => {
      if (!flight.state) flight.state = {};
      if (!flight.state.actualWeights) flight.state.actualWeights = {};
      flight.state.actualWeights.load = e.target.value;
      updateFlightState(currentFlightId, { actualWeights: flight.state.actualWeights });
    });
  }

  setupWeightLimitCheck('gen-w-zfw-act', null, 'gen-w-zfw-struct', 'zfw');
  setupWeightLimitCheck('gen-w-tow-act', 'gen-w-tow-op', 'gen-w-tow-struct', 'tow');
  setupWeightLimitCheck('gen-w-lw-act', 'gen-w-lw-op', 'gen-w-lw-struct', 'lw');

  // Dati Carburante
  setT('brf-f-dest', dest.icao_code || '');
  setT('brf-f-orig', orig.icao_code || '');

  setT('brf-f-trip-fuel', calcs.tripFuel);
  setT('brf-f-trip-time', formatHHMM(calcs.tripTime));
  setT('brf-f-cont-fuel', calcs.contFuel);
  setT('brf-f-cont-time', formatHHMM(calcs.contTime));
  setT('brf-f-finres-fuel', calcs.finresFuel);
  setT('brf-f-finres-time', formatHHMM(calcs.finresTime));
  setT('brf-f-taxi-fuel', calcs.taxiFuel);
  setT('brf-f-taxi-time', formatHHMM(calcs.taxiTime));

  const discInfoContainer = document.getElementById('brf-f-max-disc-container');
  if (discInfoContainer) {
    discInfoContainer.innerHTML = `Maximum Discretionary: <strong>${calcs.maxDiscKg} kg</strong>, <strong>${calcs.bottleneckReason}</strong>`;
  }

  const sel = document.getElementById('brf-f-altn-select');
  if (sel) {
    sel.innerHTML = '';
    if (alternates.length > 0) {
      alternates.forEach((alt, idx) => {
        let opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = alt.icao_code || `ALT${idx + 1}`;
        sel.appendChild(opt);
      });
    } else {
      let opt = document.createElement('option');
      opt.value = '-1';
      opt.textContent = 'NONE';
      sel.appendChild(opt);
    }
    if (savedFuel.altnIndex !== undefined) {
      sel.value = savedFuel.altnIndex;
    }
  }

  const blockInput = document.getElementById('brf-block-input');
  const orderBtn = document.getElementById('brf-order-btn');
  const discInput = document.getElementById('brf-disc-fuel-input');
  const discTimeVal = document.getElementById('brf-disc-time-val');
  const discReason = document.getElementById('brf-disc-reason-input');

  let isBlockFuelManual = savedFuel.blockFuelManual !== undefined
    ? savedFuel.blockFuelManual === true
    : (savedFuel.blockFuel !== undefined && savedFuel.blockFuel !== "");

  function saveCurrentFuelState(isOrdered) {
    const f = getFlight(currentFlightId);
    if (!f) return;
    if (!f.state) f.state = {};
    if (!f.state.fuelState) f.state.fuelState = {};

    if (isOrdered !== undefined) {
      f.state.fuelState.fuelOrdered = isOrdered;
    }
    const bInp = document.getElementById('brf-block-input');
    const dInp = document.getElementById('brf-disc-fuel-input');
    const rInp = document.getElementById('brf-disc-reason-input');
    const aSel = document.getElementById('brf-f-altn-select');

    if (bInp) f.state.fuelState.blockFuel = bInp.value;
    f.state.fuelState.blockFuelManual = isBlockFuelManual;
    if (dInp) f.state.fuelState.discFuel = dInp.value;
    if (rInp) f.state.fuelState.discReason = rInp.value;
    if (aSel) f.state.fuelState.altnIndex = aSel.value;
    updateFlightState(currentFlightId, { fuelState: f.state.fuelState });

    renderDashboard(f);
  }

  function updateFuelCalcs() {
    const currentCalcs = getFuelCalculations(data, flight.state);

    setT('brf-f-altn-fuel', currentCalcs.altnFuel);
    setT('brf-f-altn-time', formatHHMM(currentCalcs.altnTime));
    setT('brf-f-tkof-fuel', currentCalcs.tkofFuel);
    setT('brf-f-tkof-time', formatHHMM(currentCalcs.tkofTime));
    setT('brf-f-minblock-fuel', Math.round(currentCalcs.minBlockFuel));

    const blockInputEl = document.getElementById('brf-block-input');
    if (!isBlockFuelManual && blockInputEl) {
      blockInputEl.value = currentCalcs.actualBlockFuel;
    }

    setT('brf-f-estlnd-fuel', Math.round(currentCalcs.estimatedLandingFuel));
    const estLndTimeEl = document.getElementById('brf-f-estlnd-time');
    if (estLndTimeEl) {
      estLndTimeEl.textContent = `(${formatHHMM(currentCalcs.estLndTimeSecs)})`;
    }

    setT('brf-f-totfinres-fuel', Math.round(currentCalcs.totalReserveFuel));
    setT('brf-f-totfinres-time', '(' + formatHHMM(currentCalcs.totalReserveTime) + ')');

    setT('gen-w-tow-plan', Math.round(currentCalcs.updatedTow));
    setT('gen-w-lw-plan', Math.round(currentCalcs.updatedLw));

    const orderBtnEl = document.getElementById('brf-order-btn');
    const wasOrdered = flight.state && flight.state.fuelState && flight.state.fuelState.fuelOrdered;
    if (orderBtnEl) {
      if (wasOrdered) {
        orderBtnEl.classList.add('btn-ordered');
        orderBtnEl.textContent = 'ORDER SENT';
      } else {
        orderBtnEl.classList.remove('btn-ordered');
        orderBtnEl.textContent = 'ORDER';
      }
    }

    checkFuelLimits(data, flight.state);
  }

  if (sel) {
    const newSel = sel.cloneNode(true);
    sel.parentNode.replaceChild(newSel, sel);
    newSel.addEventListener('change', () => {
      isBlockFuelManual = false;
      if (!flight.state) flight.state = {};
      if (!flight.state.fuelState) flight.state.fuelState = {};
      flight.state.fuelState.blockFuel = '';
      flight.state.fuelState.blockFuelManual = false;
      flight.state.fuelState.altnIndex = newSel.value;
      updateFuelCalcs();
      saveCurrentFuelState();
    });
  }

  if (discInput) {
    const newDisc = discInput.cloneNode(true);
    discInput.parentNode.replaceChild(newDisc, discInput);
    newDisc.value = savedFuel.discFuel || '';

    if (calcs.discTimeSecs > 0) {
      if (discTimeVal) discTimeVal.textContent = formatHHMM(calcs.discTimeSecs);
    } else {
      if (discTimeVal) discTimeVal.textContent = '--:--';
    }

    newDisc.addEventListener('input', () => {
      let val = Number(newDisc.value);
      if (val > 0 && calcs.holdingFuelFlow > 0) {
        let secs = Math.round((val / calcs.holdingFuelFlow) * 3600);
        if (discTimeVal) discTimeVal.textContent = formatHHMM(secs);
      } else {
        if (discTimeVal) discTimeVal.textContent = '--:--';
      }
      isBlockFuelManual = false;
      if (!flight.state) flight.state = {};
      if (!flight.state.fuelState) flight.state.fuelState = {};
      // Discard stale manual block fuel so the engine recomputes the new total.
      flight.state.fuelState.blockFuel = '';
      flight.state.fuelState.blockFuelManual = false;
      flight.state.fuelState.discFuel = newDisc.value;
      updateFuelCalcs();
      saveCurrentFuelState();
    });
  }

  if (discReason) {
    const newReason = discReason.cloneNode(true);
    discReason.parentNode.replaceChild(newReason, discReason);
    newReason.value = savedFuel.discReason || '';
    newReason.addEventListener('input', () => {
      checkFuelLimits(data, flight.state);
      saveCurrentFuelState();
    });
  }

  if (blockInput) {
    const newBlockInput = blockInput.cloneNode(true);
    blockInput.parentNode.replaceChild(newBlockInput, blockInput);
    if (isBlockFuelManual && savedFuel.blockFuel !== undefined && savedFuel.blockFuel !== '') {
      newBlockInput.value = savedFuel.blockFuel;
    } else {
      newBlockInput.value = calcs.actualBlockFuel;
    }
    newBlockInput.addEventListener('input', () => {
      isBlockFuelManual = true;
      if (!flight.state) flight.state = {};
      if (!flight.state.fuelState) flight.state.fuelState = {};
      flight.state.fuelState.blockFuel = newBlockInput.value;
      flight.state.fuelState.blockFuelManual = true;
      updateFuelCalcs();
      saveCurrentFuelState();
    });
  }

  if (orderBtn) {
    const newOrderBtn = orderBtn.cloneNode(true);
    orderBtn.parentNode.replaceChild(newOrderBtn, orderBtn);
    if (savedFuel.fuelOrdered) {
      newOrderBtn.classList.add('btn-ordered');
      newOrderBtn.textContent = 'ORDER SENT';
    }
    newOrderBtn.addEventListener('click', () => {
      if (!checkFuelLimits(data, flight.state)) {
        showToast("Fuel limits check failed. Please adjust values before ordering.");
        return;
      }
      newOrderBtn.classList.add('btn-ordered');
      newOrderBtn.textContent = 'ORDER SENT';
      saveCurrentFuelState(true);
      showToast("Fuel Order inviato con successo!");
    });
  }

  // Tasto Reset in Fuel
  const resetBtn = document.getElementById('brf-fuel-reset-btn');
  if (resetBtn) {
    const newResetBtn = resetBtn.cloneNode(true);
    resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
    newResetBtn.addEventListener('click', () => {
      if (!flight.state) flight.state = {};
      flight.state.fuelState = {
        altnIndex: 0,
        discFuel: '',
        discReason: '',
        blockFuel: '',
        blockFuelManual: false,
        fuelOrdered: false
      };
      isBlockFuelManual = false;
      updateFlightState(currentFlightId, { fuelState: flight.state.fuelState });
      renderFuelSection(flight);
      renderDashboard(flight);
      showToast("Fuel values reset to original OFP dispatch.");
    });
  }

  // Operational Impacts strip & popup modal
  const impacts = data.impacts || {};
  const wUp = impacts.zfw_plus_1000 || impacts.plus_1000 || impacts.weight_up || null;
  const wDn = impacts.zfw_minus_1000 || impacts.minus_1000 || impacts.weight_down || null;
  const fUp = impacts.plus_2000ft || impacts.plus_2000 || impacts.level_up || null;
  const fDn = impacts.minus_2000ft || impacts.minus_2000 || impacts.level_down || null;
  const sDn = impacts.lower_ci || impacts.speed_down || impacts.m54 || null;
  const sUp = impacts.higher_ci || impacts.speed_up || impacts.p54 || null;

  const fmtUp = formatImpact(wUp);
  const fmtDn = formatImpact(wDn);

  const summaryText = document.getElementById('brf-impacts-summary-text');
  if (summaryText) {
    summaryText.textContent = `ZFW INCR 1000 KG TKOF ${fmtUp.burn} KG / ZFW DECR 1000 KG TKOF ${fmtDn.burn} KG`;
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
  if (tBody) tBody.innerHTML = impHtml;

  const openModalBtn = document.getElementById('brf-open-impacts-modal-btn');
  const closeModalBtn = document.getElementById('impacts-modal-close');
  const impactsModal = document.getElementById('impacts-modal');
  const impactsOverlay = document.getElementById('impacts-modal-overlay');

  if (openModalBtn) {
    openModalBtn.onclick = () => {
      if (impactsModal && impactsOverlay) {
        impactsModal.classList.add('open');
        impactsOverlay.classList.add('open');
      }
    };
  }
  if (closeModalBtn) {
    closeModalBtn.onclick = () => {
      if (impactsModal && impactsOverlay) {
        impactsModal.classList.remove('open');
        impactsOverlay.classList.remove('open');
      }
    };
  }
  if (impactsOverlay) {
    impactsOverlay.onclick = () => {
      if (impactsModal) impactsModal.classList.remove('open');
      impactsOverlay.classList.remove('open');
    };
  }

  updateFuelCalcs();
}

function renderAtcSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const atc = data.atc || {};
  const atcText = atc.flightplan_text || 'ATC Flight Plan non disponibile.';
  const atcEl = document.getElementById('brf-atc-text');
  if (atcEl) atcEl.textContent = atcText.trim();
}

function renderDispatchSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const general = data.general || {};
  const rmk = (general.dx_rmk && general.dx_rmk.trim() !== '') ? general.dx_rmk : 'NONE';
  const dxEl = document.getElementById('brf-dispatch-text');
  if (dxEl) dxEl.textContent = rmk;
}

function renderCrewAlertSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const dxEl = document.getElementById('brf-crew-alert-dx');
  if (dxEl) {
    dxEl.textContent = (data.general && data.general.dx_rmk && data.general.dx_rmk.trim() !== '') ? data.general.dx_rmk : 'NIL DISPATCH REMARKS';
  }
}

function renderAirportSection(index) {
  const flight = getFlight(currentFlightId);
  if (!flight) return;
  if (!flight.state.flaggedNotams) flight.state.flaggedNotams = [];

  const apt = currentAirportsData[index];
  if (!apt) return;

  const setT = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  const weatherType = apt.type === 'Departure' ? 'origin'
    : apt.type === 'Arrival' ? 'destination' : 'alternate';
  const metrics = getAirportWeatherMetrics(flight.raw || {}, weatherType, apt);

  setT('brf-apt-param-ceiling', metrics.ceiling);
  setT('brf-apt-param-vis', metrics.visibility);
  setT('brf-apt-param-hwc', metrics.hwc);
  setT('brf-apt-param-cwc', metrics.cwc);
  setT('brf-apt-metar-text', apt.metar || 'METAR non disponibile');
  setT('brf-apt-taf-text', apt.taf || 'TAF non disponibile');
  setT('brf-apt-metar-age', formatObsDateTime(apt.metar_time));
  setT('brf-apt-taf-age', apt.taf_time ? `Issued ${formatObsDateTime(apt.taf_time)}` : '');

  setVmcBadge(document.getElementById('brf-apt-vmc-badge'), metrics);

  // Runway con calcolo dinamico del vento
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

      const windComps = computeRunwayWind(r, apt.metar);
      let hwRaw = windComps.hw;
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

      let xwRaw = windComps.xw;
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

    let notamHtml = '';

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

        const rawText = n.notam_report || n.notam_text || '';
        const safeText = formatNotamText(rawText);
        const safeNotamId = escapeNotamHtml(notamId);
        const safeCategory = escapeNotamHtml(cat);
        const safeStart = escapeNotamHtml(start);
        const safeEnd = escapeNotamHtml(end);

        let isFlagged = getFlaggedNotamIds().includes(String(notamId));
        let flagClass = isFlagged ? 'flagged' : '';

        notamHtml += `
          <div class="notam-box" data-notam-id="${safeNotamId}">
            <div class="notam-top-row">
              <div class="notam-badge">${safeCategory}</div>
              <button type="button" class="notam-flag ${flagClass}" aria-label="Flag NOTAM" aria-pressed="${isFlagged}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
              </button>
            </div>
            <div class="notam-header">${safeNotamId} - ${safeStart} - ${safeEnd}</div>
            <div class="notam-body">${safeText}</div>
          </div>
        `;
      });
      notamHtml += `</div>`;
    }

    notamBody.innerHTML = notamHtml;

    notamBody.querySelectorAll('.notam-flag').forEach(button => {
      button.addEventListener('click', () => {
        const card = button.closest('.notam-box');
        if (card) toggleNotamFlag(card.dataset.notamId);
      });
    });
    bindNotamFilterControls();
    applyBriefingNotamFilter();
    applyBriefingAirportMenuFilter();

  } else if (notamWidget) {
    notamWidget.style.display = 'none';
  }
}

function renderClassicOfpText(data) {
  const container = document.getElementById('classic-ofp-container');
  if (!container) return;

  const html = data && data.text && data.text.plan_html;
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
      const melContainer = document.getElementById('briefing-mel-container');
      const crewAlertContainer = document.getElementById('briefing-crew-alert-container');
      const journeyTimesContainer = document.getElementById('briefing-journey-times-container');
      const journeyDelaysContainer = document.getElementById('briefing-journey-delays-container');
      const placeholder = document.getElementById('briefing-placeholder');

      if (ofpContainer) ofpContainer.style.display = 'none';
      if (generalContainer) generalContainer.style.display = 'none';
      if (fuelContainer) fuelContainer.style.display = 'none';
      if (atcContainer) atcContainer.style.display = 'none';
      if (dispatchContainer) dispatchContainer.style.display = 'none';
      if (airportContainer) airportContainer.style.display = 'none';
      if (melContainer) melContainer.style.display = 'none';
      if (crewAlertContainer) crewAlertContainer.style.display = 'none';
      if (journeyTimesContainer) journeyTimesContainer.style.display = 'none';
      if (journeyDelaysContainer) journeyDelaysContainer.style.display = 'none';
      if (placeholder) placeholder.style.display = 'none';

      if (newItem.dataset.section) {
        const title = document.getElementById('topbar-title');
        if (title) title.textContent = newItem.dataset.section;

        if (newItem.dataset.section === 'Classic OFP') {
          if (ofpContainer) ofpContainer.style.display = 'flex';
        } else if (newItem.dataset.section === 'General') {
          if (generalContainer) generalContainer.style.display = 'flex';
          renderGeneralSection(getFlight(currentFlightId));
        } else if (newItem.dataset.section === 'Fuel') {
          if (fuelContainer) fuelContainer.style.display = 'flex';
          renderFuelSection(getFlight(currentFlightId));
        } else if (newItem.dataset.section === 'MEL/CDL Information') {
          if (melContainer) melContainer.style.display = 'flex';
        } else if (newItem.dataset.section === 'ATC') {
          if (atcContainer) atcContainer.style.display = 'flex';
          renderAtcSection(getFlight(currentFlightId));
        } else if (newItem.dataset.section === 'Dispatch Info') {
          if (dispatchContainer) dispatchContainer.style.display = 'flex';
          renderDispatchSection(getFlight(currentFlightId));
        } else if (newItem.dataset.section === 'Crew Alert and Bulletin') {
          if (crewAlertContainer) crewAlertContainer.style.display = 'flex';
          renderCrewAlertSection(getFlight(currentFlightId));
        } else if (newItem.dataset.section === 'Flight Times and Fuel') {
          if (journeyTimesContainer) journeyTimesContainer.style.display = 'flex';
          if (typeof renderJourneyTimes === 'function') renderJourneyTimes(getFlight(currentFlightId));
        } else if (newItem.dataset.section === 'Duty Assignment & Delays') {
          if (journeyDelaysContainer) journeyDelaysContainer.style.display = 'flex';
          if (typeof renderJourneyDelays === 'function') renderJourneyDelays(getFlight(currentFlightId));
        } else {
          if (placeholder) placeholder.style.display = 'block';
        }
      } else if (newItem.dataset.aptIndex !== undefined) {
        if (airportContainer) airportContainer.style.display = 'flex';
        const apt = currentAirportsData[newItem.dataset.aptIndex];
        let titleText = apt.icao || '????';
        if (apt.iata) titleText += `/${apt.iata}`;
        if (apt.name) titleText += ` - ${apt.name}`;
        const title = document.getElementById('topbar-title');
        if (title) title.textContent = titleText;
        renderAirportSection(newItem.dataset.aptIndex);
      }
    });
  });
}

function initBriefingInteractions() {
  bindBriefingTabs();
}
