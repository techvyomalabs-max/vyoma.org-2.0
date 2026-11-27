// Forces a genuine browser "Save As" download for a PDF that's hosted on a
// different origin than this site (the HTML `download` attribute on an
// <a> tag is silently ignored by every browser for a cross-origin URL —
// confirmed the root cause of "Download buttons open the PDF instead of
// downloading it" across every Credibility/Newsletter document, since none
// of those files are hosted on this site's own origin).
//
// Fetches the remote file server-side (no CORS restriction applies to a
// server-to-server fetch) and streams it back with a real
// Content-Disposition: attachment header, which is the only way to force a
// download of a resource that lives on another origin.
//
// SECURITY: this must never become an open proxy. Only a fixed allowlist of
// hostnames that this project actually hosts real documents on may be
// fetched — anything else is rejected before any network request is made,
// closing off SSRF (e.g. fetching internal/private network addresses or
// cloud metadata endpoints through this endpoint).
const ALLOWED_HOSTNAMES = new Set(['vyoma.org', 'vyomalabs-lms.b-cdn.net']);

export async function downloadDocument(req, res) {
  const rawUrl = req.query.url;
  if (typeof rawUrl !== 'string' || !rawUrl) {
    return res.status(400).json({ success: false, message: 'Missing url query parameter.' });
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid url.' });
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return res.status(400).json({ success: false, message: 'Only http(s) URLs are supported.' });
  }
  if (!ALLOWED_HOSTNAMES.has(target.hostname)) {
    return res.status(403).json({ success: false, message: 'This host is not an approved document source.' });
  }

  // The abort only bounds how long we wait for the upstream server to start
  // responding (connect + headers) — it is cleared as soon as that happens,
  // so a large, slow-but-still-downloading file is never killed mid-stream
  // by this same timer (a real bug caught in testing: reusing one timeout
  // across the whole fetch+stream lifetime aborted a legitimate in-progress
  // 5MB download, which in turn crashed the whole process — see below).
  const connectTimeout = new AbortController();
  const timeoutId = setTimeout(() => connectTimeout.abort(), 20000);

  let upstream;
  try {
    upstream = await fetch(target.toString(), { signal: connectTimeout.signal });
  } catch {
    clearTimeout(timeoutId);
    return res.status(502).json({ success: false, message: 'Could not reach the document source.' });
  }
  clearTimeout(timeoutId);

  if (!upstream.ok || !upstream.body) {
    return res.status(502).json({ success: false, message: `Document source responded with ${upstream.status}.` });
  }

  const filenameFromUrl = decodeURIComponent(target.pathname.split('/').pop() || 'document.pdf');
  const safeFilename = filenameFromUrl.replace(/[\r\n"]/g, '_');

  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);

  const { Readable } = await import('node:stream');
  const nodeStream = Readable.fromWeb(upstream.body);

  // CRITICAL: an unhandled 'error' on a Readable crashes the entire Node
  // process, not just this request (confirmed — a dropped/slow upstream
  // connection took the whole backend down during testing). This listener
  // is what makes that impossible: any stream failure now just ends this
  // one response instead.
  nodeStream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ success: false, message: 'Download interrupted.' });
    else res.destroy();
  });
  res.on('error', () => nodeStream.destroy());

  nodeStream.pipe(res);
}
