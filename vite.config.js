import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// --- The piece that makes Google Sheet / Drive Excel URLs work ---
// Browsers can't fetch docs.google.com directly (CORS + cross-host redirects).
// This middleware runs INSIDE the dev server (Node), fetches the file
// server-side following all redirects, and streams the .xlsx bytes back
// to the browser as same-origin. Works for BOTH native Google Sheets and
// uploaded Excel files (the rtpof=true kind), as long as the file is shared
// "Anyone with the link -> Viewer".
function sheetProxy() {
  return {
    name: 'sheet-proxy',
    configureServer(server) {
      server.middlewares.use('/api/sheet', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost')
          const id = url.searchParams.get('id')
          if (!id) {
            res.statusCode = 400
            return res.end(JSON.stringify({ error: 'Missing spreadsheet id' }))
          }
          const target = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`
          const upstream = await fetch(target, { redirect: 'follow' })
          if (!upstream.ok) {
            res.statusCode = upstream.status
            return res.end(JSON.stringify({
              error: `Google returned ${upstream.status}. Is the file shared as "Anyone with the link"?`
            }))
          }
          const buf = Buffer.from(await upstream.arrayBuffer())
          res.setHeader('Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          res.setHeader('Cache-Control', 'no-store')
          res.end(buf)
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(e) }))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), sheetProxy()],
  server: { port: 5173, open: true }
})
