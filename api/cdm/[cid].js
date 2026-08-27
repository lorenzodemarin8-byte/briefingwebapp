export default async function handler(req, res) {
  const { cid } = req.query;
  try {
    const r = await fetch(`https://vatsim-radar.com/api/data/vatsim/pilot/${cid}/ipfs`);
    if (!r.ok) return res.status(r.status).json({ error: "upstream error" });
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "vatsim-radar unreachable" });
  }
}