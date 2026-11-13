/* js/journeylog.js
   Gestione Journey Log (Flight Times OOOI, Fuel on Board) e Duty Assignment / Delays.
*/

function renderJourneyTimes(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const times = data.times || {};
  const fuel = data.fuel || {};
  const jlState = (flight.state && flight.state.journeyLog) || {};
  const jlTimes = jlState.times || {};
  const jlFuel = jlState.fuel || {};

  const setT = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

  setT('jl-sched-out', unixToHHMM(times.sched_out));
  setT('jl-est-out', unixToHHMM(times.est_out || times.sched_out));
  setVal('jl-act-out', jlTimes.actOut);

  setT('jl-sched-off', unixToHHMM(times.sched_off));
  setT('jl-est-off', unixToHHMM(times.est_off || times.sched_off));
  setVal('jl-act-off', jlTimes.actOff);

  setT('jl-sched-on', unixToHHMM(times.sched_on));
  setT('jl-est-on', unixToHHMM(times.est_on || times.sched_on));
  setVal('jl-act-on', jlTimes.actOn);

  setT('jl-sched-in', unixToHHMM(times.sched_in));
  setT('jl-est-in', unixToHHMM(times.est_in || times.sched_in));
  setVal('jl-act-in', jlTimes.actIn);

  setT('jl-fuel-plan-ramp', fuel.plan_ramp || '---');
  setVal('jl-fuel-act-ramp', jlFuel.actRamp);

  setT('jl-fuel-plan-tkof', fuel.plan_takeoff || (Number(fuel.plan_ramp) - Number(fuel.taxi)) || '---');
  setVal('jl-fuel-act-tkof', jlFuel.actTkof);

  setT('jl-fuel-plan-lnd', fuel.plan_landing || '---');
  setVal('jl-fuel-act-lnd', jlFuel.actLnd);

  setT('jl-fuel-plan-in', fuel.plan_landing || '---');
  setVal('jl-fuel-act-in', jlFuel.actIn);

  function updateJlCalculations() {
    const actOut = document.getElementById('jl-act-out')?.value;
    const actOff = document.getElementById('jl-act-off')?.value;
    const actOn = document.getElementById('jl-act-on')?.value;
    const actIn = document.getElementById('jl-act-in')?.value;

    const baseUnix = Number(times.sched_out) || Math.floor(Date.now() / 1000);
    const actOutUnix = parseHHMM(actOut, baseUnix);
    const actOffUnix = parseHHMM(actOff, baseUnix);
    const actOnUnix = parseHHMM(actOn, baseUnix);
    const actInUnix = parseHHMM(actIn, baseUnix);

    if (actOutUnix && times.sched_out) {
      const d = Math.round((actOutUnix - Number(times.sched_out)) / 60);
      setT('jl-delta-out', `${d > 0 ? '+' : ''}${d}m`);
    } else { setT('jl-delta-out', '—'); }

    if (actOffUnix && times.sched_off) {
      const d = Math.round((actOffUnix - Number(times.sched_off)) / 60);
      setT('jl-delta-off', `${d > 0 ? '+' : ''}${d}m`);
    } else { setT('jl-delta-off', '—'); }

    if (actOnUnix && times.sched_on) {
      const d = Math.round((actOnUnix - Number(times.sched_on)) / 60);
      setT('jl-delta-on', `${d > 0 ? '+' : ''}${d}m`);
    } else { setT('jl-delta-on', '—'); }

    if (actInUnix && times.sched_in) {
      const d = Math.round((actInUnix - Number(times.sched_in)) / 60);
      setT('jl-delta-in', `${d > 0 ? '+' : ''}${d}m`);
    } else { setT('jl-delta-in', '—'); }

    if (actOffUnix && actOnUnix && actOnUnix >= actOffUnix) {
      setT('jl-total-flight-time', formatHHMM(actOnUnix - actOffUnix));
    } else {
      setT('jl-total-flight-time', formatHHMM(times.est_time_enroute || times.sched_time_enroute));
    }

    if (actOutUnix && actInUnix && actInUnix >= actOutUnix) {
      setT('jl-total-block-time', formatHHMM(actInUnix - actOutUnix));
    } else {
      setT('jl-total-block-time', formatHHMM(times.est_block || times.sched_block));
    }

    if (currentFlightId) {
      const f = getFlight(currentFlightId);
      if (f) {
        if (!f.state) f.state = {};
        if (!f.state.journeyLog) f.state.journeyLog = {};
        f.state.journeyLog.times = { actOut, actOff, actOn, actIn };
        f.state.journeyLog.fuel = {
          actRamp: document.getElementById('jl-fuel-act-ramp')?.value,
          actTkof: document.getElementById('jl-fuel-act-tkof')?.value,
          actLnd: document.getElementById('jl-fuel-act-lnd')?.value,
          actIn: document.getElementById('jl-fuel-act-in')?.value
        };
        updateFlightState(currentFlightId, { journeyLog: f.state.journeyLog });
      }
    }
  }

  ['jl-act-out', 'jl-act-off', 'jl-act-on', 'jl-act-in', 'jl-fuel-act-ramp', 'jl-fuel-act-tkof', 'jl-fuel-act-lnd', 'jl-fuel-act-in'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = updateJlCalculations;
  });

  updateJlCalculations();
}

function renderJourneyDelays(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const crew = data.crew || {};

  const setT = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  let cptReal = (crew.cpt && crew.cpt.trim() && !crew.cpt.includes('.......')) ? crew.cpt.trim() : '---';
  setT('jl-crew-cpt', cptReal);
  setT('jl-crew-fo', (crew.fo && crew.fo.trim() && !crew.fo.includes('.......')) ? crew.fo.trim() : 'FIRST OFFICER');
  setT('jl-crew-dx', (crew.dx && crew.dx.trim() && !crew.dx.includes('......')) ? crew.dx.trim() : 'DISPATCH OPS');

  const jlState = (flight.state && flight.state.journeyLog) || {};
  const savedDelays = jlState.delays || [];

  function renderSavedDelays() {
    const listEl = document.getElementById('jl-saved-delays-list');
    if (!listEl) return;
    if (savedDelays.length === 0) {
      listEl.innerHTML = '<p class="hint" style="text-align:center;">No delays recorded for this flight.</p>';
      return;
    }
    listEl.innerHTML = savedDelays.map((d, idx) => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--dash-band-bg); padding:8px 12px; border-radius:6px; margin-bottom:6px; font-size:13px;">
        <div>
          <strong>Code ${d.code}</strong> - ${d.min} min ${d.remarks ? `(${d.remarks})` : ''}
        </div>
        <button class="icon-btn" style="color:#dc2626;" onclick="deleteJourneyDelay(${idx})">✕</button>
      </div>
    `).join('');
  }

  const saveBtn = document.getElementById('jl-save-delay-btn');
  if (saveBtn) {
    saveBtn.onclick = () => {
      const codeSelect = document.getElementById('jl-delay-code-select');
      const minInp = document.getElementById('jl-delay-min');
      const remInp = document.getElementById('jl-delay-remarks');
      const code = codeSelect?.value;
      const min = Number(minInp?.value) || 0;
      const remarks = remInp?.value || '';

      if (!code || min <= 0) {
        showToast("Seleziona un codice ritardo e inserisci i minuti.");
        return;
      }

      savedDelays.push({ code, min, remarks, time: new Date().toISOString() });
      if (currentFlightId) {
        const f = getFlight(currentFlightId);
        if (f) {
          if (!f.state) f.state = {};
          if (!f.state.journeyLog) f.state.journeyLog = {};
          f.state.journeyLog.delays = savedDelays;
          updateFlightState(currentFlightId, { journeyLog: f.state.journeyLog });
        }
      }
      if (minInp) minInp.value = '';
      if (remInp) remInp.value = '';
      showToast(`Ritardo di ${min}m (Codice ${code}) registrato.`);
      renderSavedDelays();
    };
  }

  window.deleteJourneyDelay = function(idx) {
    savedDelays.splice(idx, 1);
    if (currentFlightId) {
      const f = getFlight(currentFlightId);
      if (f && f.state?.journeyLog) {
        f.state.journeyLog.delays = savedDelays;
        updateFlightState(currentFlightId, { journeyLog: f.state.journeyLog });
      }
    }
    renderSavedDelays();
  };

  renderSavedDelays();
}
