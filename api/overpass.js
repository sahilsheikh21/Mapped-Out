function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function extractOverpassQuery(body) {
  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    return params.get('data') || '';
  }

  if (body && typeof body === 'object' && typeof body.data === 'string') {
    return body.data;
  }

  return '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsedBody = req.body ?? (await readBody(req));
    const query = extractOverpassQuery(parsedBody);

    if (!query) {
      return res.status(400).json({ error: 'Missing Overpass query payload' });
    }

    const overpassMirrors = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ];

    let lastStatus = 502;
    let lastBody = '';
    let lastContentType = 'application/json';

    for (const mirror of overpassMirrors) {
      const upstream = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Overpass may reject anonymous client signatures (406/429).
          'User-Agent': 'Mapped-Out/1.0 (+https://mapped-out.vercel.app)',
          'Accept': 'application/json,text/plain,*/*',
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      const text = await upstream.text();
      if (upstream.ok) {
        res.status(upstream.status);
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
        return res.send(text);
      }

      lastStatus = upstream.status;
      lastBody = text;
      lastContentType = upstream.headers.get('content-type') || 'text/plain';

      // Retry on endpoints that are temporarily unavailable or rate-limited.
      if (![406, 408, 409, 425, 429, 500, 502, 503, 504].includes(upstream.status)) {
        break;
      }
    }

    res.status(lastStatus);
    res.setHeader('Content-Type', lastContentType);
    return res.send(lastBody || 'Overpass request failed');
  } catch (error) {
    return res.status(502).json({
      error: 'Failed to fetch Overpass data',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
