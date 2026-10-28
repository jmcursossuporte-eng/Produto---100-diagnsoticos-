const PIXEL_ID = '1137181765536171';
const GRAPH_API_VERSION = 'v26.0';

function safeCookie(value, pattern) {
  return typeof value === 'string' && value.length <= 512 && pattern.test(value)
    ? value
    : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(503).json({ error: 'capi_not_configured' });
  }

  const allowedHosts = new Set(
    [req.headers.host, req.headers['x-forwarded-host']].filter(Boolean)
  );

  try {
    const origin = req.headers.origin;
    if (origin && !allowedHosts.has(new URL(origin).host)) {
      return res.status(403).json({ error: 'origin_not_allowed' });
    }

    const source = new URL(req.headers.referer || (origin && origin + '/'));
    if (!allowedHosts.has(source.host)) {
      return res.status(403).json({ error: 'source_not_allowed' });
    }

    const body = req.body || {};
    const eventId = body.event_id;
    if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(eventId)) {
      return res.status(400).json({ error: 'invalid_event_id' });
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : '';
    const userAgent = req.headers['user-agent'] || '';
    const userData = {
      client_ip_address: clientIp,
      client_user_agent: userAgent
    };

    const fbp = safeCookie(body.fbp, /^fb\.1\.\d+\.[A-Za-z0-9_-]+$/);
    const fbc = safeCookie(body.fbc, /^fb\.1\.\d+\.[A-Za-z0-9_-]+$/);
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;

    const event = {
      event_name: 'PageView',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: source.href,
      user_data: userData
    };

    const metaResponse = await fetch(
      'https://graph.facebook.com/' + GRAPH_API_VERSION + '/' + PIXEL_ID +
        '/events?access_token=' + encodeURIComponent(accessToken),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [event] })
      }
    );

    const result = await metaResponse.json().catch(function () { return {}; });
    if (!metaResponse.ok) {
      console.error('Meta CAPI rejected event; HTTP status:', metaResponse.status);
      return res.status(502).json({ error: 'meta_event_failed' });
    }

    return res.status(200).json({ events_received: result.events_received || 0 });
  } catch (error) {
    console.error('Meta CAPI request failed');
    return res.status(502).json({ error: 'meta_request_failed' });
  }
};
