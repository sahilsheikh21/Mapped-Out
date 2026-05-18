function appendQueryParam(params, key, value) {
  if (value == null) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item != null) params.append(key, String(item));
    }
    return;
  }

  params.append(key, String(value));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const params = new URLSearchParams();
    const query = req.query || {};

    for (const [key, value] of Object.entries(query)) {
      appendQueryParam(params, key, value);
    }

    if (!params.has('format')) params.set('format', 'json');
    if (!params.has('limit')) params.set('limit', '5');
    if (!params.has('addressdetails')) params.set('addressdetails', '1');

    const upstream = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        'User-Agent': 'Mapped-Out/1.0 (Vercel Proxy)',
      },
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (error) {
    return res.status(502).json({
      error: 'Failed to fetch geocoding data',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
