import * as XLSX from 'xlsx'

// Pull the spreadsheet id out of any Google Sheets / Drive URL.
export function extractId(url) {
  if (!url) return null
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) ||
            url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/) ||
            url.match(/[?&]id=([a-zA-Z0-9-_]+)/)
  return m ? m[1] : null
}

// Fetch the workbook through the dev-server proxy and return raw rows per sheet.
export async function fetchWorkbook(url) {
  const id = extractId(url)
  if (!id) throw new Error('Could not find a spreadsheet id in that URL.')

  const res = await fetch(`/api/sheet?id=${encodeURIComponent(id)}`)
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`
    try { const j = await res.json(); if (j.error) msg = j.error } catch {}
    throw new Error(msg)
  }
  const buf = await res.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })

  return wb.SheetNames.map(name => ({
    name,
    aoa: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: false })
  }))
}

// ---------- helpers ----------
export function toNumber(v) {
  if (typeof v === 'number') return v
  if (v == null || v === '') return NaN
  const s = String(v).replace(/[(]/, '-').replace(/[^0-9.\-]/g, '')
  const n = parseFloat(s)
  return isFinite(n) ? n : NaN
}
const clean = s => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim()
const num = toNumber

export function fmtINR(n) {
  if (!isFinite(n)) return '—'
  const neg = n < 0
  return (neg ? '-₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN')
}
export function inrShort(n) {
  const a = Math.abs(n)
  let s
  if (a >= 1e7) s = (n / 1e7).toFixed(a % 1e7 ? 2 : 0) + 'Cr'
  else if (a >= 1e5) s = (n / 1e5).toFixed(a % 1e5 ? 1 : 0) + 'L'
  else if (a >= 1e4) s = Math.round(n / 1e3) + 'k'
  else if (a >= 1e3) s = (n / 1e3).toFixed(1) + 'k'
  else s = String(Math.round(n))
  return '₹' + s
}

// ---------- month math ----------
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
const MON_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// "Jun 2026" -> sortable integer key (year*12 + monthIndex)
export function monthKey(s) {
  const m = String(s).match(/([a-z]{3})[a-z]*\.?\s+(\d{4})/i)
  if (!m) return NaN
  const mo = MON[m[1].toLowerCase()]
  if (mo == null) return NaN
  return (+m[2]) * 12 + mo
}
export const keyToLabel = k => `${MON_ABBR[k % 12]} ${Math.floor(k / 12)}`
export function todayKey() {
  const d = new Date()
  return d.getFullYear() * 12 + d.getMonth()
}
function toDate(v) {
  if (v instanceof Date && !isNaN(v)) return v
  if (typeof v === 'string') { const d = new Date(v); if (!isNaN(d)) return d }
  return null
}
// SheetJS shifts Google-Sheet dates back by the local TZ offset (e.g. an
// intended Jul-01 midnight comes through as Jun-30 18:29 IST), which pushes
// boundary dates into the wrong month. Snap to the nearest whole UTC day.
function normDay(d) {
  return new Date(Math.round(d.getTime() / 86400000) * 86400000)
}

// ---------- categories ----------
export const CATEGORY_ORDER = ['Credit Card', 'Personal', 'Vehicle', 'Microfinance', 'Home Loan']
export const CAT_COLORS = {
  'Credit Card': '#ff6b6b',
  'Personal':    '#f0b429',
  'Vehicle':     '#c98bff',
  'Microfinance':'#5aa9ff',
  'Home Loan':   '#5ed18b',
}
function categorize(name = '') {
  const s = String(name).toLowerCase()
  if (s.includes('credit card')) return 'Credit Card'
  if (s.includes('home') || s.includes('equitas')) return 'Home Loan'
  if (s.includes('tvs') || s.includes('dio') || s.includes('vehicle')) return 'Vehicle'
  if (s.includes('smfg') || s.includes('sbi') || s.includes('personal')) return 'Personal'
  return 'Microfinance'
}

// ============================================================
//  Build the structured model (Tips sheet is intentionally ignored).
// ============================================================
export function buildModel(sheets) {
  const byName = frag => sheets.find(s => s.name.toLowerCase().includes(frag))
  const loansSheet   = byName('loan') && !byName('loan').name.toLowerCase().includes('gold')
                       ? byName('loan') : sheets.find(s => /^loans$/i.test(s.name)) || sheets[0]
  const monthlySheet = byName('month view') || byName('monthly view') || sheets.find(s => /month/i.test(s.name) && !/expense/i.test(s.name))
  const goldSheet    = byName('gold')

  const loans = parseLoans(loansSheet?.aoa || [])
  const monthly = parseMonthly(monthlySheet?.aoa || [])
  const expenses = parseExpenses(sheets)
  const goldLoans = parseGold(goldSheet?.aoa || [])

  // header / income / as-of text from the Loans sheet
  const aoa = loansSheet?.aoa || []
  const incomeLine = (aoa.find(r => /combined income/i.test(String(r[0]))) || [])[0] || ''
  const sheetAsOf = (clean(incomeLine).match(/as of\s+([^|]+)$/i) || [])[1]?.trim() || ''

  let baseIncome = num((clean(incomeLine).match(/₹\s*([\d,]+)\s*\/?\s*month/i) || [])[1])
  if (!isFinite(baseIncome) && monthly.length) baseIncome = monthly[0].income

  // closure events extracted from the Monthly View "Events" column
  const events = []
  for (const m of monthly) {
    if (!m.events) continue
    for (const e of m.events.split('|').map(x => x.trim()).filter(Boolean))
      events.push({ key: m.key, month: m.month, text: e })
  }

  const months = monthly.map(m => ({ key: m.key, label: m.month }))

  return {
    subtitle: clean(incomeLine),
    sheetAsOf, baseIncome,
    loans, monthly, months, events, expenses, goldLoans,
  }
}

function parseLoans(aoa) {
  const h = aoa.findIndex(r => /loan name/i.test(String(r[0])))
  if (h < 0) return []
  const out = []
  for (let i = h + 1; i < aoa.length; i++) {
    const r = aoa[i]
    const name = clean(r[0])
    const emi = num(r[1])
    const category = clean(r[2])
    if (!name || /^total|free cash|color legend/i.test(name)) continue
    if (!isFinite(emi) || !category) continue
    const endDate = clean(r[3])
    out.push({
      name, emi, category, endDate,
      endKey: monthKey(endDate),
      emisLeft: num(r[4]),
      remaining: num(r[5]),
      notes: clean(r[6]),
    })
  }
  return out
}

// Header-driven: tolerant to added/re-ordered columns (Income, Expenses, …).
function parseMonthly(aoa) {
  const h = aoa.findIndex(r => /^month$/i.test(clean(r[0])))
  if (h < 0) return []
  const H = aoa[h].map(clean)
  const find = re => H.findIndex(x => re.test(x))
  const iIncome = find(/^income$/i)
  const iEMI    = find(/total emi/i)
  const iExp    = find(/^expense/i)
  const iFree   = find(/free cash/i)
  const iEvents = find(/event/i)
  const known = new Set([0, iIncome, iEMI, iExp, iFree, iEvents].filter(x => x >= 0))
  const loanCols = H.map((_, i) => i).filter(i => !known.has(i))

  const rows = []
  for (let i = h + 1; i < aoa.length; i++) {
    const r = aoa[i]
    const key = monthKey(r[0])
    if (!isFinite(key)) continue
    const cats = {}
    const loanAmts = {}
    for (const c of loanCols) {
      const v = num(r[c])
      if (!isFinite(v) || v === 0) continue
      const cat = categorize(H[c])
      cats[cat] = (cats[cat] || 0) + v
      loanAmts[H[c]] = (loanAmts[H[c]] || 0) + v
    }
    const totalEMI = iEMI >= 0 ? num(r[iEMI]) : Object.values(cats).reduce((a, b) => a + b, 0)
    const income = iIncome >= 0 ? num(r[iIncome]) : NaN
    const expenses = iExp >= 0 ? num(r[iExp]) : 0
    let freeCash = iFree >= 0 ? num(r[iFree]) : NaN
    if (!isFinite(freeCash) && isFinite(income)) freeCash = income - totalEMI - (expenses || 0)
    rows.push({
      key, month: clean(r[0]),
      income: isFinite(income) ? income : 0,
      totalEMI: isFinite(totalEMI) ? totalEMI : 0,
      expenses: isFinite(expenses) ? expenses : 0,
      freeCash: isFinite(freeCash) ? freeCash : 0,
      events: clean(r[iEvents] ?? ''),
      ...cats,
    })
  }
  return rows
}

// Expense ledger — read ONLY from the "Monthly Expenses" sheet (dated rows).
function parseExpenses(sheets) {
  const out = []
  for (const sh of sheets) {
    if (!/monthly expenses/i.test(sh.name)) continue
    for (const r of sh.aoa) {
      const d = toDate(r[0])
      const amt = num(r[2])
      const label = clean(r[1])
      if (!d || !isFinite(amt) || amt <= 0 || !label) continue
      if (/^total|^expense$/i.test(label)) continue
      const nd = normDay(d)
      out.push({
        date: nd, label, amount: amt,
        monthKey: nd.getUTCFullYear() * 12 + nd.getUTCMonth(),
        monthLabel: `${MON_ABBR[nd.getUTCMonth()]} ${nd.getUTCFullYear()}`,
        source: sh.name,
      })
    }
  }
  return out.sort((a, b) => b.date - a.date)
}

function parseGold(aoa) {
  const h = aoa.findIndex(r => /gram/i.test(String(r[0])))
  if (h < 0) return []
  const out = []
  for (let i = h + 1; i < aoa.length; i++) {
    const r = aoa[i]
    const bank = clean(r[2]), amount = num(r[4]), gram = num(r[0])
    if (!bank && !isFinite(amount) && !isFinite(gram)) continue
    out.push({
      gram: isFinite(gram) ? gram : 0,
      interest: num(r[1]),
      bank, holder: clean(r[3]),
      amount: isFinite(amount) ? amount : 0,
      date: fmtDate(toDate(r[5])),
      interestToPay: num(r[6]),
    })
  }
  return out
}

// "10 May 2026" from a (TZ-shifted) sheet date.
export function fmtDate(d) {
  if (!d) return ''
  const x = normDay(d)
  return `${x.getUTCDate()} ${MON_ABBR[x.getUTCMonth()]} ${x.getUTCFullYear()}`
}

export { categorize }
