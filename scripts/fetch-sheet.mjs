// Download the Google spreadsheet as .xlsx at build time and write it to
// public/data.xlsx, which Vite copies into dist/. This runs in CI (or locally)
// where there is no browser CORS restriction, so GitHub Pages can serve the
// data as a same-origin static file.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

// Read VITE_SHEET_URL from the environment, falling back to the local .env file.
function fromEnvFile(key) {
  try {
    const txt = readFileSync('.env', 'utf8')
    const m = txt.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, 'm'))
    return m ? m[1].trim() : null
  } catch { return null }
}

// Fallback keeps CI working even if the VITE_SHEET_URL variable isn't set.
const FALLBACK_URL =
  'https://docs.google.com/spreadsheets/d/1I1itIjufqZUNzjqWEzkkwVaX3YLWUhCUojn9AgGF_r4/edit'
const url = process.env.VITE_SHEET_URL || process.env.SHEET_URL ||
            fromEnvFile('VITE_SHEET_URL') || FALLBACK_URL

const id = (url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) ||
            url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/) ||
            url.match(/[?&]id=([a-zA-Z0-9-_]+)/) || [])[1]
if (!id) {
  console.error('✗ Could not find a spreadsheet id in VITE_SHEET_URL.')
  process.exit(1)
}

const target = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`
const res = await fetch(target, { redirect: 'follow' })
if (!res.ok) {
  console.error(`✗ Google returned ${res.status}. Is the file shared as "Anyone with the link → Viewer"?`)
  process.exit(1)
}

const buf = Buffer.from(await res.arrayBuffer())
if (!existsSync('public')) mkdirSync('public')
writeFileSync('public/data.xlsx', buf)
console.log(`✓ Wrote public/data.xlsx (${buf.length.toLocaleString()} bytes) from sheet ${id}`)
