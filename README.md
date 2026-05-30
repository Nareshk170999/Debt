# Sheet Dashboard (Vite + React)

A configurable dashboard that pulls data from a Google Sheets / Google Drive
spreadsheet link and renders KPI cards, auto-generated charts, multi-tab
support, and a searchable / sortable table.

Works with **both** native Google Sheets **and** uploaded Excel files
(the kind whose URL contains `rtpof=true`).

## 1. Configure your sheet

**Preferred — environment file.** Copy `.env.example` to `.env` and set your link:

```bash
VITE_SHEET_URL="https://docs.google.com/spreadsheets/d/YOUR_ID/edit?usp=sharing"
VITE_DASHBOARD_TITLE="Data Dashboard"
VITE_REFRESH_SECONDS="0"
```

Vite exposes any `VITE_*` variable to the app as `import.meta.env.VITE_*`.
`.env` is git-ignored; `.env.example` is the committed template.

**Fallback — `src/config.js`.** If an env var is missing, the defaults baked
into `src/config.js` are used, so editing that file directly still works.

Either way, share the file as **Anyone with the link → Viewer**.

## 2. Run

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Why the URL works here (but failed in the browser before)

A browser cannot fetch `docs.google.com` directly — it's blocked by CORS, and
Google's export endpoint also redirects across hosts. This project includes a
small dev-server middleware (`/api/sheet` in `vite.config.js`) that fetches the
file **server-side** following redirects, then streams the `.xlsx` bytes back to
the page as same-origin. SheetJS parses it in the browser.

## 3. Deploy free (GitHub + Vercel)

GitHub Pages can't host this (it's static-only and can't run the `/api/sheet`
proxy). Use **Vercel's free tier**, which runs the proxy as a serverless
function (`api/sheet.js`) and auto-deploys on every push.

```bash
# one-time: put the repo on GitHub
git init
git add -A
git commit -m "Sheet dashboard"
git branch -M main
git remote add origin https://github.com/<you>/sheet-dashboard.git
git push -u origin main
```

Then on https://vercel.com:
1. **Add New → Project → Import** your GitHub repo (Vercel auto-detects Vite).
2. **Settings → Environment Variables**, add `VITE_SHEET_URL` (and optionally
   `VITE_DASHBOARD_TITLE`) — because `.env` is git-ignored.
3. **Deploy.** You get a free `https://<project>.vercel.app` URL. Every
   `git push` redeploys automatically.

> Netlify works the same way; move `api/sheet.js` to
> `netlify/functions/sheet.js` and add a `/api/sheet → /.netlify/functions/sheet`
> redirect.

## Notes
- Set `VITE_REFRESH_SECONDS` in `.env` for auto-refresh.
- `/api/sheet` is served by Vite middleware in dev and by `api/sheet.js`
  (serverless) in production — both fetch the file server-side to dodge CORS.
