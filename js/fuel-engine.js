/* js/fuel-engine.js
   Motore di calcolo carburante, riserve, pesi reattivi, collo di bottiglia e 8 check limiti Lido.
*/

function getFuelCalculations(data, state) {
  if (!data) return {};
  const fuel = data.fuel || {};
  const times = data.times || {};
  const weights = data.weights || {};
  const savedFuel = (state && state.fuelState) || {};
  const alternates = getAlternatesList(data);

  const tripFuel = Number(fuel.enroute_burn) || 0;
  const contFuel = Number(fuel.contingency) || 0;
  const finresFuel = Number(fuel.reserve) || 0;
  const taxiFuel = Number(fuel.taxi) || 0;

  const tripTime = Number(times.est_time_enroute) || 0;
  const contTime = Number(times.contfuel_time) || 0;
  const finresTime = Number(times.reserve_time) || 0;
  const taxiTime = Number(times.taxi_out) || 0;

  let altnIdx = savedFuel.altnIndex !== undefined ? parseInt(savedFuel.altnIndex, 10) : 0;
  let activeAltn = alternates[altnIdx] || alternates[0] || {};
  let defaultAltn = alternates[0] || {};

  let altnFuel = Number(activeAltn.burn) || Number(fuel.alternate_burn) || 0;
  let altnTime = Number(activeAltn.ete) || Number(times.alternate_time) || 0;
  let altnIcao = activeAltn.icao_code || (getFirstAlternate(data) && getFirstAlternate(data).icao_code) || '';

  let defaultAltnBurn = Number(defaultAltn.burn) || Number(fuel.alternate_burn) || 0;
  let deltaAltnFuel = altnFuel - defaultAltnBurn;

  const tkofFuel = tripFuel + contFuel + altnFuel + finresFuel;
  const tkofTime = tripTime + contTime + altnTime + finresTime;
  const minBlockFuel = tkofFuel + taxiFuel;

  let discFuel = Number(savedFuel.discFuel) || 0;
  let calcBlockFuel = Math.ceil((minBlockFuel + discFuel) / 100) * 100;

  const hasStoredBlockFuel = savedFuel.blockFuel !== undefined && savedFuel.blockFuel !== "";
  // Preserve legacy manual values, but do not mistake an automatically calculated value for a manual override.
  const isBlockFuelManual = savedFuel.blockFuelManual !== undefined
    ? savedFuel.blockFuelManual === true
    : hasStoredBlockFuel;
  let actualBlockFuel = (isBlockFuelManual && hasStoredBlockFuel)
    ? Number(savedFuel.blockFuel)
    : calcBlockFuel;

  let extraFuel = Math.max(0, actualBlockFuel - minBlockFuel);

  // Holding Fuel Flow: Final Reserve copre 30 min (0.5 h) -> Holding FF = Final Reserve * 2
  const holdingFuelFlow = finresFuel > 0 ? (finresFuel * 2) : 2400;

  let discTimeSecs = 0;
  if (discFuel > 0 && holdingFuelFlow > 0) {
    discTimeSecs = Math.round((discFuel / holdingFuelFlow) * 3600);
  }

  const totalReserveFuel = contFuel + altnFuel + finresFuel;
  const totalReserveTime = contTime + altnTime + finresTime;

  // Estimated Landing Fuel sincronizzato
  const basePlanLanding = Number(fuel.plan_landing) || totalReserveFuel;
  const estimatedLandingFuel = basePlanLanding + deltaAltnFuel + extraFuel;

  let estLndTimeSecs = 0;
  if (estimatedLandingFuel > 0 && holdingFuelFlow > 0) {
    estLndTimeSecs = Math.round((estimatedLandingFuel / holdingFuelFlow) * 3600);
  }

  // Pesi aggiornati in funzione dell'extra fuel e dell'alternato
  const deltaTotalFuel = deltaAltnFuel + extraFuel;
  const baseEstZfw = Number(weights.est_zfw) || 0;
  const baseEstTow = Number(weights.est_tow) || (baseEstZfw + tkofFuel);
  const baseEstLdw = Number(weights.est_ldw) || (baseEstZfw + estimatedLandingFuel);

  const updatedTow = baseEstTow + deltaTotalFuel;
  const updatedLw = baseEstLdw + deltaTotalFuel;

  // Limiti strutturali e operativi da TLR
  const maxTowStruct = Number(weights.max_tow_struct || weights.max_tow) || Infinity;
  const maxLdwStruct = Number(weights.max_ldw) || Infinity;
  const maxTankCap = Number(fuel.max_tanks || (data.aircraft && data.aircraft.max_fuel)) || Infinity;

  let opTow = Infinity;
  if (data.tlr && data.tlr.takeoff && data.tlr.takeoff.runway) {
    let rwyList = Array.isArray(data.tlr.takeoff.runway) ? data.tlr.takeoff.runway : [data.tlr.takeoff.runway];
    let r = rwyList.find(rw => String(rw.identifier).padStart(2, '0') === String(data.origin && data.origin.plan_rwy).padStart(2, '0'));
    if (r && r.max_weight) opTow = Number(r.max_weight);
  }

  let opLdw = Infinity;
  if (data.tlr && data.tlr.landing && data.tlr.landing.runway) {
    let rwyList = Array.isArray(data.tlr.landing.runway) ? data.tlr.landing.runway : [data.tlr.landing.runway];
    let r = rwyList.find(rw => String(rw.identifier).padStart(2, '0') === String(data.destination && data.destination.plan_rwy).padStart(2, '0'));
    if (r && r.max_weight) opLdw = Number(r.max_weight);
  }

  const effectiveMaxTow = Math.min(maxTowStruct, opTow);
  const effectiveMaxLdw = Math.min(maxLdwStruct, opLdw);

  const marginTow = effectiveMaxTow - (baseEstZfw + tkofFuel);
  const marginLdw = effectiveMaxLdw - (baseEstZfw + (tkofFuel - tripFuel));
  const marginTank = maxTankCap - minBlockFuel;

  let maxDiscKg = Math.max(0, Math.floor(Math.min(marginTow, marginLdw, marginTank)));
  let bottleneckReason = "LAND";
  if (maxDiscKg === Math.max(0, Math.floor(marginTank))) bottleneckReason = "TANK";
  else if (maxDiscKg === Math.max(0, Math.floor(marginTow))) bottleneckReason = "TOW";

  return {
    tripFuel, tripTime,
    contFuel, contTime,
    finresFuel, finresTime,
    taxiFuel, taxiTime,
    altnFuel, altnTime, altnIcao, altnIdx,
    tkofFuel, tkofTime,
    minBlockFuel,
    discFuel, discTimeSecs,
    actualBlockFuel, extraFuel,
    totalReserveFuel, totalReserveTime,
    estimatedLandingFuel, estLndTimeSecs,
    maxDiscKg, bottleneckReason,
    holdingFuelFlow,
    effectiveMaxTow, effectiveMaxLdw, maxTankCap,
    zfw: baseEstZfw,
    updatedTow, updatedLw, maxTowStruct, maxLdwStruct, opTow, opLdw
  };
}

/* CONTROLLO RIGOROSO DEI LIMITI DI CARBURANTE (8 REGOLE LIDO) */
function checkFuelLimits(data, flightState) {
  if (!data) return true;
  const curCalcs = getFuelCalculations(data, flightState);
  const alertBox = document.getElementById('fuel-limits-warning');
  const alertText = document.getElementById('fuel-limits-warning-text');

  const actualZfw = (flightState && flightState.actualWeights && Number(flightState.actualWeights.zfw)) || curCalcs.zfw;
  const estTow = actualZfw + curCalcs.tkofFuel + curCalcs.extraFuel;
  const estLdw = actualZfw + curCalcs.estimatedLandingFuel;
  const estTaxiWeight = actualZfw + curCalcs.actualBlockFuel;

  const weightsRaw = data.weights || {};
  const maxTaxiWeight = Number(weightsRaw.max_ramp || weightsRaw.max_taxi) || (Number(weightsRaw.max_tow_struct || weightsRaw.max_tow) + curCalcs.taxiFuel);
  const maxTowStruct = Number(weightsRaw.max_tow_struct || weightsRaw.max_tow) || Infinity;

  let errors = [];

  // 1. Block Fuel + ZFW <= Max Taxi Weight
  if (estTaxiWeight > maxTaxiWeight) {
    errors.push(`Taxi weight (${Math.round(estTaxiWeight)} kg) exceeds Maximum Taxi/Ramp Weight (${Math.round(maxTaxiWeight)} kg).`);
  }

  // 2. Takeoff Fuel + ZFW <= MTOW strutturale
  if (estTow > maxTowStruct) {
    errors.push(`Takeoff weight (${Math.round(estTow)} kg) exceeds Structural MTOW (${Math.round(maxTowStruct)} kg).`);
  }

  // 3. Takeoff Fuel + ZFW <= Restricted TOW (operativo TLR)
  if (curCalcs.effectiveMaxTow < maxTowStruct && estTow > curCalcs.effectiveMaxTow) {
    errors.push(`Takeoff weight (${Math.round(estTow)} kg) exceeds Runway Restricted TOW (${Math.round(curCalcs.effectiveMaxTow)} kg).`);
  }

  // 4. Takeoff Fuel + ZFW - Trip Fuel <= MLW
  if (estLdw > curCalcs.effectiveMaxLdw) {
    errors.push(`Landing weight (${Math.round(estLdw)} kg) exceeds Maximum Landing Weight (${Math.round(curCalcs.effectiveMaxLdw)} kg).`);
  }

  // 5. Block Fuel <= Tank Capacity
  if (curCalcs.actualBlockFuel > curCalcs.maxTankCap) {
    errors.push(`Block fuel (${curCalcs.actualBlockFuel} kg) exceeds Aircraft Tank Capacity (${curCalcs.maxTankCap} kg).`);
  }

  // 6. Block Fuel - Taxi Fuel >= Takeoff Fuel
  if ((curCalcs.actualBlockFuel - curCalcs.taxiFuel) < curCalcs.tkofFuel) {
    errors.push(`Block fuel is insufficient to cover Taxi and Takeoff fuel.`);
  }

  // 7. Discretionary Fuel: controllo motivazione obbligatoria
  const reasonInput = document.getElementById('brf-disc-reason-input');
  const reasonVal = (flightState && flightState.fuelState && flightState.fuelState.discReason) || (reasonInput ? reasonInput.value.trim() : '');
  if (curCalcs.discFuel > 0 && String(reasonVal).trim() === '') {
    errors.push(`Discretionary fuel added (${curCalcs.discFuel} kg) but no Reason was specified.`);
  }

  // 8. Discretionary Fuel non superiore al Maximum Allowed
  if (curCalcs.discFuel > curCalcs.maxDiscKg) {
    errors.push(`Discretionary fuel (${curCalcs.discFuel} kg) exceeds Maximum Allowed Discretionary Fuel (${curCalcs.maxDiscKg} kg, limited by ${curCalcs.bottleneckReason}).`);
  }

  if (errors.length > 0) {
    if (alertBox && alertText) {
      alertBox.style.display = 'flex';
      alertText.textContent = `FUEL LIMIT ALERT: ${errors.join(' ')}`;
    }
    return false;
  } else {
    if (alertBox && alertText) {
      alertBox.style.display = 'none';
      alertText.textContent = '';
    }
    return true;
  }
}
