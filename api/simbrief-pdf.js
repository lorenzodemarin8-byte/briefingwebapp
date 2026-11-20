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

    res.status(upstream.status);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"" + file + "\"");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=180");

    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const etag = upstream.headers.get("etag");
    const lastModified = upstream.headers.get("last-modified");
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (etag) res.setHeader("ETag", etag);
    if (lastModified) res.setHeader("Last-Modified", lastModified);

    if (req.method === "HEAD") return res.end();
    if (!upstream.body) {
      const bytes = Buffer.from(await upstream.arrayBuffer());
      return res.end(bytes);
    }

    // Stream the upstream response instead of buffering the entire PDF in server memory.
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise(resolve => res.once("drain", resolve));
        }
      }
      return res.end();
    } catch (streamError) {
      try { await reader.cancel(); } catch (e) {}
      if (!res.headersSent) {
        return res.status(502).json({ error: "Unable to stream SimBrief PDF" });
      }
      return res.end();
    }
  } catch (error) {
    if (!res.headersSent) {
      return res.status(502).json({ error: "Unable to retrieve SimBrief PDF" });
    }
    return res.end();
  }
}
