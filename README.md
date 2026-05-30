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

## 3. Deploy free on GitHub Pages

GitHub Pages is static-only, so the browser can't fetch Google directly (CORS).
Instead, a **GitHub Action fetches the sheet during the build** (server-side, no
CORS), bakes it into the site as `data.xlsx`, and publishes to Pages. A schedule
re-runs it hourly so the data stays fresh. The whole flow is in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

**One-time setup:**

```bash
git init
git add -A
git commit -m "Sheet dashboard"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then in the GitHub repo:
1. **Settings → Secrets and variables → Actions → Variables → New variable**
   - `VITE_SHEET_URL` = your spreadsheet link (required)
   - `VITE_DASHBOARD_TITLE`, `VITE_REFRESH_SECONDS` (optional)
2. **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. Push to `main` (or run the workflow from the **Actions** tab). Your site goes
   live at `https://<you>.github.io/<repo>/`.

The sheet refreshes on every push, hourly via cron, or on-demand via
**Actions → Deploy to GitHub Pages → Run workflow**.

### Build a static copy locally
```bash
npm run build:static   # downloads the sheet, then builds into dist/
npm run preview
```

## Notes
- Set `VITE_REFRESH_SECONDS` in `.env` for auto-refresh.
- Data source: in **dev** the Vite middleware proxies Google live; in
  **production** the app loads the `data.xlsx` baked by the Action. Both avoid
  the browser CORS block by fetching server-side.
