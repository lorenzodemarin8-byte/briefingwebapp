/* js/navlog.js
   Rendering NavLog, Fuel Bar dinamica, input AFOB/Actual Time e delta orari/carburante.
*/

function mapSimbriefToNavLog(ofp, flightState) {
  let fixes = (ofp.navlog && ofp.navlog.fix) ? ofp.navlog.fix : [];
  if (!Array.isArray(fixes)) fixes = [fixes];

  const routeDistance = (ofp.general && ofp.general.route_distance) ? Number(ofp.general.route_distance) : 0;
  const schedOutUnix = (ofp.times && ofp.times.sched_out) ? Number(ofp.times.sched_out) : 0;

  const calcs = getFuelCalculations(ofp, flightState);

  const waypoints = [];
  let cumulativeDistance = 0;

  waypoints.push({
    id: (ofp.origin && ofp.origin.icao_code) ? ofp.origin.icao_code : 'ORIG',
    name: (ofp.origin && ofp.origin.name) ? ofp.origin.name : '',
    isOrigin: true,
    isAirwayInfo: false,
    dtdNm: routeDistance,
    plannedTimeUnix: schedOutUnix,
    plannedEfobKg: calcs.actualBlockFuel
  });

  fixes.forEach((fix) => {
    if (!fix) return;
    const legDistance = Number(fix.distance) || 0;
    cumulativeDistance += legDistance;
    const dtdNm = Math.max(0, Math.round(routeDistance - cumulativeDistance));

    waypoints.push({
      id: fix.ident + '_aw',
      isAirwayInfo: true,
      via: fix.via_airway || "DCT",
      trackStr: (fix.track_true && fix.track_mag) ? `${fix.track_true}T/${fix.track_mag}M` : "",
      dtwNm: legDistance,
      ttwMin: Number(fix.time_leg) / 60,
      ftwKg: Math.round(Number(fix.fuel_leg) || 0),
      flPlanned: Math.round((Number(fix.altitude_feet) || 0) / 100),
      mora: fix.mora || '---'
    });

    waypoints.push({
      id: fix.ident || '?',
      name: (fix.type === "apt" || fix.type === "vor" || fix.type === "ndb") ? fix.name : "",
      isAirwayInfo: false,
      dtdNm,
      plannedTimeUnix: schedOutUnix + Number(fix.time_total),
      plannedEfobKg: Math.round(Number(fix.fuel_plan_onboard) || 0),
    });
  });

  return {
    originIcao: (ofp.origin && ofp.origin.icao_code) ? ofp.origin.icao_code : "",
    destIcao: (ofp.destination && ofp.destination.icao_code) ? ofp.destination.icao_code : "",
    altnIcao: calcs.altnIcao,
    rampFuelKg: calcs.actualBlockFuel,
    finalReserveKg: calcs.finresFuel,
    totalReserveKg: calcs.totalReserveFuel,
    plannedLandingFuelKg: calcs.estimatedLandingFuel,
    schedOutUnix,
    waypoints,
  };
}

function renderNavLog(flightId) {
  try {
    const flight = getFlight(flightId);
    if (!flight) return;
    const nlData = mapSimbriefToNavLog(flight.raw, flight.state);

    navlogActuals = (flight.state && flight.state.navlogActuals) || {};

    const origEl = document.getElementById('nl-orig-icao');
    const destEl = document.getElementById('nl-dest-icao');
    if (origEl) origEl.textContent = nlData.originIcao;
    if (destEl) destEl.textContent = nlData.destIcao;

    function renderFuelBar() {
      const realWps = nlData.waypoints.filter(w => !w.isAirwayInfo);
      if (realWps.length === 0) return;

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
            <div class="navlog-fuel-finres-zone" style="width: ${finresPct}%;"></div>
            <div class="navlog-marker-totres" style="left: ${totalResPct}%;"></div>
            <div class="navlog-marker-landing ${landingLow ? 'bg-red-500' : 'bg-emerald-500'}" style="left: ${landingPct}%;"></div>
          </div>
          <div class="navlog-fuel-legend">
            <span class="navlog-legend-item"><span class="navlog-legend-dot-finres"></span> FINRES ${nlData.finalReserveKg}</span>
            <span class="navlog-legend-item"><span class="navlog-legend-line-totres"></span> TOTAL RESERVE ${Math.round(nlData.totalReserveKg)} ${nlData.altnIcao ? `(${nlData.altnIcao})` : ''}</span>
            <span class="navlog-legend-item font-medium ${landingLow ? 'text-red-500' : 'text-emerald-600'}">
              <span class="navlog-legend-line-land ${landingLow ? 'bg-red-500' : 'bg-emerald-500'}"></span> LANDING ${Math.round(expLandingKg)}
            </span>
          </div>
        </div>
      `;
      const container = document.getElementById('nl-fuel-bar-container');
      if (container) container.innerHTML = fbHtml;
    }

    function updateRowCalculations(wpid) {
      const wp = nlData.waypoints.find(w => w.id === wpid);
      if (!wp) return;
      const actual = navlogActuals[wpid] || { time: "", afob: "" };

      const timeDeltaEl = document.getElementById(`time-delta-${wpid}`);
      if (timeDeltaEl) {
        const actUnix = parseHHMM(actual.time, nlData.schedOutUnix);
        if (actUnix) {
          const timeDeltaMin = Math.round((actUnix - wp.plannedTimeUnix) / 60);
          timeDeltaEl.textContent = `${timeDeltaMin > 0 ? '+' : ''}${timeDeltaMin} min`;
          timeDeltaEl.style.color = timeDeltaMin <= 0 ? "#059669" : "#d97706";
        } else {
          timeDeltaEl.textContent = '—';
          timeDeltaEl.style.color = "#9ca3af";
        }
      }

      const fuelDeltaEl = document.getElementById(`fuel-delta-${wpid}`);
      if (fuelDeltaEl) {
        const afobKg = actual.afob !== "" ? Number(actual.afob) : null;
        if (afobKg !== null && !isNaN(afobKg)) {
          const fuelDeltaKg = afobKg - wp.plannedEfobKg;
          fuelDeltaEl.textContent = `${fuelDeltaKg > 0 ? '+' : ''}${Math.round(fuelDeltaKg)}`;
          fuelDeltaEl.style.color = fuelDeltaKg >= 0 ? "#059669" : "#d97706";
        } else {
          fuelDeltaEl.textContent = '—';
          fuelDeltaEl.style.color = "#9ca3af";
        }
      }
    }

    function renderWaypoints() {
      const container = document.getElementById('nl-waypoints-container');
      if (!container) return;
      container.innerHTML = '';

      nlData.waypoints.forEach(wp => {
        const row = document.createElement('div');

        if (wp.isAirwayInfo) {
          row.className = 'navlog-row-aw';

          let moraVal = parseInt(wp.mora, 10);
          let moraStyle = (!isNaN(moraVal) && moraVal > 10000) ? 'color:#ef4444; font-weight:700;' : '';

          row.innerHTML = `
            <div>${wp.via} ${wp.trackStr ? `<span style="color:#9ca3af;">${wp.trackStr}</span>` : ''}</div>
            <div>DTW ${wp.dtwNm}</div>
            <div>TTW ${minToHHMM(wp.ttwMin)}</div>
            <div></div><div></div>
            <div>FTW ${wp.ftwKg}</div>
            <div>FL ${wp.flPlanned}</div>
            <div style="${moraStyle}">MSA ${wp.mora || '---'}</div>
          `;
        } else {
          row.className = 'navlog-row-wp';

          const actual = navlogActuals[wp.id] || { time: "", afob: "" };
          const actUnix = parseHHMM(actual.time, nlData.schedOutUnix);
          const timeDeltaMin = actUnix ? Math.round((actUnix - wp.plannedTimeUnix) / 60) : null;
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
            <div style="color:#6b7280;">${unixToHHMM(wp.plannedTimeUnix)}</div>
            <div><input type="time" class="navlog-input wp-time-input" data-wpid="${wp.id}" value="${String(actual.time || '').replace(/^(\d{2})(\d{2})$/, '$1:$2')}"></div>
            <div id="time-delta-${wp.id}" style="${timeColor} font-weight:600;">${timeDeltaMin === null ? '—' : `${timeDeltaMin > 0 ? '+' : ''}${timeDeltaMin} min`}</div>
            <div style="color:#6b7280;">${wp.plannedEfobKg}</div>
            <div><input type="number" placeholder="AFOB" class="navlog-input wp-afob-input" data-wpid="${wp.id}" value="${actual.afob}"></div>
            <div id="fuel-delta-${wp.id}" style="${fuelColor} font-weight:600;">${fuelDeltaKg === null ? '—' : `${fuelDeltaKg > 0 ? '+' : ''}${Math.round(fuelDeltaKg)}`}</div>
          `;
        }
        container.appendChild(row);
      });

      container.querySelectorAll('.wp-time-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const wpid = e.target.dataset.wpid;
          if (!navlogActuals[wpid]) navlogActuals[wpid] = { time: "", afob: "" };
          navlogActuals[wpid].time = e.target.value;
          updateRowCalculations(wpid);
          updateFlightState(currentFlightId, { navlogActuals });
        });
      });

      container.querySelectorAll('.wp-afob-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const wpid = e.target.dataset.wpid;
          if (!navlogActuals[wpid]) navlogActuals[wpid] = { time: "", afob: "" };
          navlogActuals[wpid].afob = e.target.value;
          updateRowCalculations(wpid);
          renderFuelBar();
          updateFlightState(currentFlightId, { navlogActuals });
        });
      });
    }

    renderFuelBar();
    renderWaypoints();

  } catch (error) {
    console.error('Errore in renderNavLog:', error);
  }
}
