// ============================================================
//  CONFIGURE YOUR DATA SOURCE
//  Preferred: set values in the project-root ".env" file
//    (VITE_SHEET_URL / VITE_DASHBOARD_TITLE / VITE_REFRESH_SECONDS).
//  The defaults below are used only when the env var is missing,
//  so editing this file directly still works.
//
//  Works with BOTH:
//    - native Google Sheets
//    - uploaded Excel files (the URL with rtpof=true)
//  Requirement: the file must be shared as
//    "Anyone with the link  ->  Viewer"
// ============================================================

const env = import.meta.env

export const SHEET_URL =
  env.VITE_SHEET_URL ||
  "https://docs.google.com/spreadsheets/d/1I1itIjufqZUNzjqWEzkkwVaX3YLWUhCUojn9AgGF_r4/edit?usp=sharing"

// Title shown in the dashboard header.
// Change this default to rename it everywhere (local + hosted), or override per
// environment with VITE_DASHBOARD_TITLE (.env locally / Actions variable on CI).
export const DASHBOARD_TITLE = env.VITE_DASHBOARD_TITLE || "Debt Freedom Plan"

// Auto-refresh interval in seconds (0 = off)
export const REFRESH_SECONDS = Number(env.VITE_REFRESH_SECONDS) || 0

// Optional realtime proxy URL (Cloudflare Worker) for live data on a static
// host. When set, the production site fetches the sheet live instead of the
// build-time snapshot. Leave empty to use the snapshot. See cloudflare-worker.js
export const PROXY_URL = env.VITE_PROXY_URL || ""
