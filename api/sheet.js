// Vercel serverless function — the production equivalent of the dev-server
// proxy in vite.config.js. Fetches the Google spreadsheet server-side
// (browsers can't, due to CORS + cross-host redirects) and streams the
// .xlsx bytes back to the page as same-origin.
//
// Lives at /api/sheet because the file is api/sheet.js at the repo root.
export default async function handler(req, res) {
  try {
    const id = req.query?.id
    if (!id) {
      res.status(400).json({ error: 'Missing spreadsheet id' })
      return
    }
    const target = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`
    const upstream = await fetch(target, { redirect: 'follow' })
    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: `Google returned ${upstream.status}. Is the file shared as "Anyone with the link"?`
      })
      return
    }
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.status(200).send(buf)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
}
