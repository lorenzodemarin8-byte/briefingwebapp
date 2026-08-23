/* simbrief.js
   Comunicazione con l'API pubblica di SimBrief.
   Endpoint: https://www.simbrief.com/api/xml.fetcher.php?username=...&json=1
   (oppure userid=... se viene passato un Pilot ID numerico)
*/

async function fetchSimBriefOFP(usernameOrId) {
  const isNumeric = /^\d+$/.test(usernameOrId.trim());
  const param = isNumeric ? 'userid' : 'username';
  const url = `https://www.simbrief.com/api/xml.fetcher.php?${param}=${encodeURIComponent(usernameOrId.trim())}&json=1`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Errore HTTP ${response.status} dal server SimBrief`);
  }

  const data = await response.json();

  if (data.fetch && data.fetch.status && data.fetch.status !== 'Success') {
    throw new Error('SimBrief: ' + data.fetch.status);
  }

  return data;
}

/* Estrae un identificatore stabile per il volo, in modo da poterlo
   salvare senza duplicati quando premi "refresh" più volte sullo stesso OFP.
   NB: non sono sicuro al 100% del nome esatto del campo "request id" nel JSON
   SimBrief: proviamo alcuni percorsi noti e, se non li troviamo, costruiamo
   un id di fallback. Il pannello "Debug: dati grezzi" nella Dashboard ti fa
   vedere la struttura reale così, se serve, sistemiamo questa funzione insieme.
*/
function extractFlightId(data) {
  const candidate =
    (data.params && (data.params.request_id || data.params.static_id)) ||
    (data.fetch && data.fetch.time) ||
    null;

  if (candidate) return String(candidate);

  const orig = data.origin && (data.origin.icao_code || data.origin.iata_code) || 'ZZZZ';
  const dest = data.destination && (data.destination.icao_code || data.destination.iata_code) || 'ZZZZ';
  const sched = data.times && data.times.sched_out || Date.now();
  return `${orig}-${dest}-${sched}`;
}

function extractCallsign(data) {
  if (data.general) {
    const airline = data.general.icao_airline || data.general.iata_airline || '';
    const num = data.general.flight_number || '';
    if (airline || num) return `${airline}${num}`;
  }
  if (data.atc && data.atc.callsign) return data.atc.callsign;
  return '—';
}

function unixToHHMM(unixSeconds) {
  if (!unixSeconds) return '—';
  const d = new Date(Number(unixSeconds) * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}z`;
}
