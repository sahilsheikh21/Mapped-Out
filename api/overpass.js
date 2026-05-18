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

    const upstream = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (error) {
    return res.status(502).json({
      error: 'Failed to fetch Overpass data',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
