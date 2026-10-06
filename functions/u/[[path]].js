const ORIGIN = 'https://cloud.umami.is'

export async function onRequest(context) {
  const { request } = context
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/u/script.js') {
    const upstream = await fetch(`${ORIGIN}/script.js`)
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }

  if (request.method === 'POST' && url.pathname === '/u/api/send') {
    const headers = new Headers()
    headers.set('Content-Type', request.headers.get('Content-Type') || 'application/json')
    const userAgent = request.headers.get('User-Agent')
    if (userAgent) headers.set('User-Agent', userAgent)
    const ip = request.headers.get('CF-Connecting-IP')
    if (ip) headers.set('X-Forwarded-For', ip)
    const upstream = await fetch(`${ORIGIN}/api/send`, {
      method: 'POST',
      headers,
      body: request.body,
    })
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
    })
  }

  return new Response('Not found', { status: 404 })
}
