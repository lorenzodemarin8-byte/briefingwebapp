/* route-weather-map.js
   ============================================================
   Mappa rotta + radar meteo (RainViewer) + SIGMET colorati per tipo
   di pericolo (TURB/ICE/TS/MTW/VA), con fallback testuale.
   Modulo indipendente: non richiede modifiche al resto del progetto,
   basta chiamare initRouteWeatherMap() con l'oggetto dati SimBrief
   (quello che nel resto dell'app chiamiamo "flight.raw").

   DIPENDENZE ESTERNE (da aggiungere nell'<head> di index.html):
     <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   e prima della chiusura di </body>, DOPO gli altri script:
     <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
     <script src="js/route-weather-map.js?v=1"></script>

   USO:
     initRouteWeatherMap('id-del-div-contenitore', flight.raw);

   Il div contenitore deve avere una altezza reale (non 0), es.:
     <div id="route-weather-map" style="width:100%; height:100%; min-height:380px;"></div>
   ============================================================ */

let _rwMapInstance = null;

async function initRouteWeatherMap(containerId, simbriefData) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('[route-weather-map] contenitore non trovato:', containerId);
    return;
  }

  // Se la mappa esiste già (es. si torna su questa sezione una seconda volta),
  // distruggiamola e ricreiamola: Leaflet non permette di reinizializzare
  // due volte lo stesso div.
  if (_rwMapInstance) {
    _rwMapInstance.remove();
    _rwMapInstance = null;
  }

  const points = extractRoutePoints(simbriefData);

  if (points.length === 0) {
    container.innerHTML = '<p style="padding:16px;color:#888;font-size:13px;">Nessuna coordinata trovata nel navlog per disegnare la rotta.</p>';
    return;
  }

  const map = L.map(container, { scrollWheelZoom: true });
  _rwMapInstance = map;

  // ---- base map (OpenStreetMap, gratuita, richiede solo attribuzione) ----
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 12,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // ---- rotta e waypoint ----
  const latlngs = points.map((p) => [p.lat, p.lon]);
  L.polyline(latlngs, { color: '#1f3a63', weight: 3 }).addTo(map);

  points.forEach((p) => {
    L.circleMarker([p.lat, p.lon], {
      radius: 4,
      color: '#1f3a63',
      fillColor: '#ffffff',
      fillOpacity: 1,
      weight: 2
    })
      .addTo(map)
      .bindPopup(`<strong>${p.ident}</strong>${p.altitudeFt ? `<br>FL${Math.round(p.altitudeFt / 100)}` : ''}`);
  });

  map.fitBounds(latlngs, { padding: [24, 24] });

  // ---- radar meteo RainViewer (gratuito per uso personale, richiede attribuzione) ----
  await addRainviewerLayer(map);

  // ---- SIGMET, se presenti nell'OFP: poligoni colorati per tipo di pericolo ----
  renderSigmets(map, container, simbriefData);
}

/* Estrae {ident, lat, lon, altitudeFt} da data.navlog.fix.
   NOTA: non ho un esempio reale di navlog con lat/lon popolati sottomano
   in questa conversazione, quindi provo alcuni nomi di campo plausibili
   (pos_lat/pos_long sono quelli documentati da SimBrief, ma se non
   dovessero corrispondere, apri il pannello "Debug: dati grezzi" già
   presente nella Dashboard, guarda un oggetto dentro navlog.fix e
   correggi i nomi qui sotto — sono isolati in un unico punto). */
function extractRoutePoints(data) {
  if (!data || !data.navlog || !data.navlog.fix) return [];
  const fixes = Array.isArray(data.navlog.fix) ? data.navlog.fix : [data.navlog.fix];

  return fixes
    .map((f) => {
      const lat = parseFloat(f.pos_lat ?? f.lat ?? f.latitude);
      const lon = parseFloat(f.pos_long ?? f.pos_lon ?? f.lon ?? f.longitude);
      if (isNaN(lat) || isNaN(lon)) return null;
      return {
        ident: f.ident || '?',
        lat,
        lon,
        altitudeFt: f.altitude_feet ? parseInt(f.altitude_feet, 10) : null
      };
    })
    .filter(Boolean);
}

async function addRainviewerLayer(map) {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const apiData = await res.json();
    const frames = (apiData.radar && apiData.radar.past) || [];
    if (frames.length === 0) return;

    const latest = frames[frames.length - 1]; // frame più recente disponibile
    const tileSize = 256;
    const colorScheme = 2;   // "Universal Blue", schema colori standard RainViewer
    const smooth = 1;
    const snow = 1;

    L.tileLayer(
      `${apiData.host}${latest.path}/${tileSize}/{z}/{x}/{y}/${colorScheme}/${smooth}_${snow}.png`,
      {
        opacity: 0.65,
        zIndex: 5,
        attribution: 'Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>'
      }
    ).addTo(map);
  } catch (err) {
    console.error('[route-weather-map] radar RainViewer non disponibile:', err);
    // non blocchiamo la mappa se il radar non si carica, la rotta resta comunque visibile
  }
}

/* ============================================================
   SIGMET: poligono colorato per tipo di pericolo + testo grezzo
   ============================================================
   LIMITE ONESTO: non abbiamo mai avuto sottomano un OFP con SIGMET
   davvero popolati, quindi non sappiamo con certezza se SimBrief
   fornisce già le coordinate dell'area in forma strutturata (array di
   punti) o solo il testo grezzo ICAO da cui estrarle noi. Il codice
   sotto prova ENTRAMBE le strade:
     1) cerca campi strutturati con nomi plausibili (area/coords/
        points/vertices/polygon)
     2) se non li trova, prova a leggere le coordinate direttamente
        dal testo del SIGMET (formato tipo "N4500 E00500 - N4600 ...")
   Il parser testuale copre i pattern più comuni ma i SIGMET reali
   variano parecchio: se un'area non viene disegnata, il testo grezzo
   resta comunque visibile sotto la mappa come fallback, così non si
   perde mai l'informazione anche quando il disegno fallisce. */

const SIGMET_COLORS = {
  TURB: '#e58a2a',   // arancione, coerente con i ritardi nella dashboard
  ICE:  '#3aa0d1',   // azzurro
  TS:   '#c0392b',   // rosso (temporali/CB)
  MTW:  '#8e6fb0',   // viola (onda orografica)
  VA:   '#6b4f3a',   // marrone (cenere vulcanica)
  OTHER: '#888888'
};

function detectSigmetHazard(text) {
  const t = (text || '').toUpperCase();
  if (t.includes('VA ') || t.includes('VOLCANIC')) return 'VA';
  if (t.includes('TURB')) return 'TURB';
  if (t.includes('ICE') || t.includes('ICING')) return 'ICE';
  if (t.includes('TS') || t.includes('CB') || t.includes('TSGR')) return 'TS';
  if (t.includes('MTW') || t.includes('MOUNTAIN WAVE')) return 'MTW';
  return 'OTHER';
}

/* Cerca campi già strutturati (nomi plausibili, non verificati). */
function extractStructuredSigmetArea(sigmetObj) {
  const raw = sigmetObj.area || sigmetObj.coords || sigmetObj.coordinates ||
              sigmetObj.points || sigmetObj.vertices || sigmetObj.polygon;
  if (!Array.isArray(raw) || raw.length < 3) return null;

  const pts = raw
    .map((p) => {
      if (Array.isArray(p)) return [parseFloat(p[0]), parseFloat(p[1])];
      if (p && (p.lat !== undefined || p.latitude !== undefined)) {
        return [parseFloat(p.lat ?? p.latitude), parseFloat(p.lon ?? p.lng ?? p.longitude)];
      }
      return null;
    })
    .filter((p) => p && !isNaN(p[0]) && !isNaN(p[1]));

  return pts.length >= 3 ? pts : null;
}

/* Fallback: legge le coordinate direttamente dal testo ICAO del SIGMET.
   Copre due notazioni comuni:
     "N4500 E00500"  (gradi interi + minuti opzionali, spazio separato)
     "4500N 00500E"  (stessa cosa ma lettera dopo il numero)      */
function parseSigmetTextArea(text) {
  if (!text) return null;
  const pts = [];

  const regexA = /([NS])(\d{2,4})\s+([EW])(\d{3,5})/g; // N4500 E00500
  const regexB = /(\d{2,4})([NS])\s+(\d{3,5})([EW])/g; // 4500N 00500E

  let m;
  while ((m = regexA.exec(text)) !== null) {
    pts.push(dmToDecimal(m[2], m[1], m[4], m[3]));
  }
  if (pts.length < 3) {
    while ((m = regexB.exec(text)) !== null) {
      pts.push(dmToDecimal(m[1], m[2], m[3], m[4]));
    }
  }

  return pts.length >= 3 ? pts : null;
}

/* "4500" + "N" + "00500" + "E" -> [45.0, 5.0] (gestisce sia DD che DDMM) */
function dmToDecimal(latStr, latHem, lonStr, lonHem) {
  const toDecimal = (str) => {
    if (str.length <= 3) return parseFloat(str); // solo gradi, es. "45"
    const deg = parseInt(str.slice(0, -2), 10);
    const min = parseInt(str.slice(-2), 10);
    return deg + min / 60;
  };
  let lat = toDecimal(latStr);
  let lon = toDecimal(lonStr);
  if (latHem === 'S') lat = -lat;
  if (lonHem === 'W') lon = -lon;
  return [lat, lon];
}

function renderSigmets(map, container, data) {
  const existing = container.parentElement.querySelector('.rw-sigmet-list');
  if (existing) existing.remove();

  const sigmetsRaw = data && data.sigmets;
  if (!sigmetsRaw) return;

  const list = Array.isArray(sigmetsRaw) ? sigmetsRaw : [sigmetsRaw];
  if (list.length === 0) return;

  const hazardsDrawn = new Set();
  const textLines = [];

  list.forEach((s) => {
    const text = typeof s === 'string' ? s : (s.text || s.raw || s.sigmet_text || JSON.stringify(s));
    const hazard = detectSigmetHazard(text);
    const color = SIGMET_COLORS[hazard] || SIGMET_COLORS.OTHER;

    const structured = typeof s === 'object' ? extractStructuredSigmetArea(s) : null;
    const area = structured || parseSigmetTextArea(text);

    if (area) {
      L.polygon(area, {
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.22,
        dashArray: '5,4'
      })
        .addTo(map)
        .bindPopup(`<strong>${hazard}</strong><br><span style="font-size:11px;">${text.slice(0, 200)}</span>`);
      hazardsDrawn.add(hazard);
    }

    textLines.push(text);
  });

  // legenda, solo se abbiamo disegnato almeno un poligono
  if (hazardsDrawn.size > 0) {
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div');
      div.style.cssText = 'background:rgba(255,255,255,0.9);padding:6px 10px;border-radius:6px;font-size:11px;line-height:1.6;';
      div.innerHTML = [...hazardsDrawn]
        .map((h) => `<span style="display:inline-block;width:10px;height:10px;background:${SIGMET_COLORS[h]};border-radius:2px;margin-right:5px;"></span>${h}`)
        .join('<br>');
      return div;
    };
    legend.addTo(map);
  }

  // testo grezzo sempre visibile sotto la mappa, anche per i SIGMET non disegnati
  const box = document.createElement('div');
  box.className = 'rw-sigmet-list';
  box.style.cssText = 'margin-top:10px;font-size:12px;font-family:ui-monospace,monospace;white-space:pre-wrap;';
  box.innerHTML = '<strong style="font-family:inherit;">SIGMET attivi sulla rotta</strong><br>' + textLines.join('\n---\n');
  container.parentElement.appendChild(box);
}
