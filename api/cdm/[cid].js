export default async function handler(req, res) {
  const { cid } = req.query;
  
  try {
    const r = await fetch(`https://vatsim-radar.com/api/data/vatsim/pilot/${cid}/ipfs`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://vatsim-radar.com/",
      },
    });
    
    if (!r.ok) return res.status(r.status).json({ error: "upstream error", status: r.status });
    
    const data = await r.json();
    res.status(200).json(data);
    
  } catch (e) {
    res.status(502).json({ error: "vatsim-radar unreachable" });
  }
}
