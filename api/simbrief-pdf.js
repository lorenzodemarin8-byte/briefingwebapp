export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawFile = Array.isArray(req.query.file) ? req.query.file[0] : req.query.file;
  const file = String(rawFile || "").trim();

  // Accept only SimBrief-generated PDF filenames; never proxy arbitrary URLs.
  if (!/^[A-Z0-9_-]+_PDF_[0-9]+\.pdf$/i.test(file)) {
    return res.status(400).json({ error: "Invalid SimBrief PDF filename" });
  }

  const upstreamUrl = "https://www.simbrief.com/ofp/flightplans/" + encodeURIComponent(file);
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).json({ error: "SimBrief PDF unavailable" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"" + file + "\"");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=180");
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);

    if (req.method === "HEAD") {
      return res.status(upstream.status).end();
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(bytes);
  } catch (error) {
    return res.status(502).json({ error: "Unable to retrieve SimBrief PDF" });
  }
}
