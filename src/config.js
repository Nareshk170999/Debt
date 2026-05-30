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
  "https://docs.google.com/spreadsheets/d/1kwj35wMPCAhRjK7q07iFEr8WtnGaMDF2/edit?usp=sharing"

// Title shown in the dashboard header
export const DASHBOARD_TITLE = env.VITE_DASHBOARD_TITLE || "Data Dashboard"

// Auto-refresh interval in seconds (0 = off)
export const REFRESH_SECONDS = Number(env.VITE_REFRESH_SECONDS) || 0
