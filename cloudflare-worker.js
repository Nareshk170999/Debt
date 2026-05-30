// Free realtime proxy for the dashboard, deployable on Cloudflare Workers
// (free tier, no credit card). It fetches the Google spreadsheet server-side
// (dodging browser CORS) and returns the live .xlsx with permissive CORS so a
// static site (GitHub Pages) can load fresh data on every refresh.
//
// Deploy:
//   1. https://dash.cloudflare.com → Workers & Pages → Create → Worker
//   2. Replace the code with this file, click Deploy
//   3. Copy the URL (e.g. https://sheet-proxy.<you>.workers.dev)
//   4. Set it as VITE_PROXY_URL (GitHub Actions variable + .env for local prod)
//
// Usage:  GET https://<worker-url>/?id=<spreadsheetId>
export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    const id = new URL(request.url).searchParams.get('id')
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing spreadsheet id' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const target = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`
    const upstream = await fetch(target, { redirect: 'follow' })
    if (!upstream.ok) {
      return new Response(JSON.stringify({
        error: `Google returned ${upstream.status}. Is the file shared as "Anyone with the link"?`
      }), { status: upstream.status, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    return new Response(upstream.body, {
      headers: {
        ...cors,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Cache-Control': 'no-store',
      },
    })
  },
}
