import React, { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, PieChart, Pie, Cell, ReferenceLine
} from 'recharts'
import { SHEET_URL, DASHBOARD_TITLE, REFRESH_SECONDS } from './config.js'
import {
  fetchWorkbook, buildModel, fmtINR, inrShort, monthKey, keyToLabel, todayKey,
  categorize, CAT_COLORS, CATEGORY_ORDER
} from './sheet.js'

const axisTick = { fill: '#8b93a3', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }
const tip = {
  contentStyle: {
    background: '#1d212a', border: '1px solid #2a2f3a', borderRadius: 10,
    fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#e7e9ee'
  },
  labelStyle: { color: '#f0b429', marginBottom: 4 }
}
const catColor = c => CAT_COLORS[c] || '#8b93a3'
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-')

export default function App() {
  const [model, setModel] = useState(null)
  const [status, setStatus] = useState('loading')
  const [err, setErr] = useState('')
  const [updated, setUpdated] = useState(null)
  const [asOf, setAsOf] = useState(null)          // month key we're viewing "as of"
  const [query, setQuery] = useState('')

  async function load() {
    setStatus('loading'); setErr('')
    try {
      const m = buildModel(await fetchWorkbook(SHEET_URL))
      setModel(m); setUpdated(new Date()); setStatus('ok')
      // default to the real current month, clamped into the schedule range
      if (m.months.length) {
        const lo = m.months[0].key, hi = m.months[m.months.length - 1].key
        setAsOf(Math.min(hi, Math.max(lo, todayKey())))
      }
    } catch (e) {
      setErr(e.message || String(e)); setStatus('error')
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!REFRESH_SECONDS) return
    const t = setInterval(load, REFRESH_SECONDS * 1000)
    return () => clearInterval(t)
  }, [])

  // ---- everything that depends on the selected "as of" month ----
  const snap = useMemo(() => {
    if (!model || asOf == null) return null
    const cur = model.monthly.find(m => m.key === asOf) || model.monthly[0]
    const loans = model.loans.map(l => {
      const active = isFinite(l.endKey) ? l.endKey >= asOf : true
      const emisLeft = active && isFinite(l.endKey) ? l.endKey - asOf + 1 : (active ? l.emisLeft : 0)
      return { ...l, active, emisLeftNow: emisLeft, remainingNow: Math.max(0, emisLeft) * l.emi }
    })
    const active = loans.filter(l => l.active)
    const income = cur?.income || model.baseIncome || 0
    const expenses = cur?.expenses || 0
    const totalEMI = active.reduce((a, l) => a + l.emi, 0)
    const remaining = active.reduce((a, l) => a + l.remainingNow, 0)
    const freeCash = income - totalEMI - expenses

    const byCat = {}
    for (const l of active) {
      const c = byCat[l.category] || { name: l.category, remaining: 0, emi: 0, count: 0 }
      c.remaining += l.remainingNow; c.emi += l.emi; c.count++
      byCat[l.category] = c
    }
    const byCategory = Object.values(byCat)
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.name) - CATEGORY_ORDER.indexOf(b.name))

    const debtFreeKey = Math.max(...model.loans.map(l => l.endKey).filter(isFinite))
    return {
      cur, loans, active, income, expenses, totalEMI, remaining, freeCash, byCategory,
      monthsToFree: Math.max(0, debtFreeKey - asOf), debtFree: keyToLabel(debtFreeKey),
    }
  }, [model, asOf])

  // ---- expense ledger aggregations (not as-of dependent) ----
  const expenseAgg = useMemo(() => {
    if (!model?.expenses?.length) return null
    const byMonth = new Map(), byItem = new Map()
    let total = 0
    for (const e of model.expenses) {
      total += e.amount
      const m = byMonth.get(e.monthKey) || { key: e.monthKey, name: e.monthLabel, value: 0 }
      m.value += e.amount; byMonth.set(e.monthKey, m)
      const key = e.label.replace(/\s+$/, '')
      byItem.set(key, (byItem.get(key) || 0) + e.amount)
    }
    return {
      total,
      months: [...byMonth.values()].sort((a, b) => a.key - b.key),   // chronological
      items: [...byItem.entries()].map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value).slice(0, 10),
    }
  }, [model])

  const loansView = useMemo(() => {
    if (!snap) return []
    const q = query.trim().toLowerCase()
    let v = snap.loans
    if (q) v = v.filter(l => [l.name, l.category, l.endDate, l.notes].some(x => String(x).toLowerCase().includes(q)))
    return [...v].sort((a, b) =>
      (b.active - a.active) || (b.remainingNow - a.remainingNow))
  }, [snap, query])

  const atToday = model && asOf === Math.min(model.months.at(-1)?.key ?? asOf, Math.max(model.months[0]?.key ?? asOf, todayKey()))
  const deficit = snap && snap.freeCash < 0

  return (
    <div className="app">
      <header className="head">
        <div className="head-main">
          <div className="eyebrow">family debt payoff · live</div>
          <h1>{DASHBOARD_TITLE.split(' ')[0]} <em>{DASHBOARD_TITLE.split(' ').slice(1).join(' ')}</em></h1>
          {model?.subtitle && <span className="income-pill">{model.subtitle}</span>}
        </div>
        <div className="head-actions">
          <LiveClock />
          <div className="head-buttons">
            <button className="refresh" onClick={load}>↻ Refresh</button>
            {updated && <span className="updated">synced {updated.toLocaleTimeString()}</span>}
          </div>
        </div>
      </header>

      {status === 'loading' && <div className="state"><div className="spin" /><span>Loading sheet…</span></div>}

      {status === 'error' && (
        <div className="state error">
          <strong>Couldn’t load the sheet.</strong>
          <span>{err}</span>
          <p className="tip">Check that the link in <code>.env</code> (<code>VITE_SHEET_URL</code>) is shared as
            “Anyone with the link → Viewer”, then hit Refresh.</p>
        </div>
      )}

      {status === 'ok' && model && snap && (
        <>
          {/* ---------- AS-OF scrubber ---------- */}
          <div className="scrubber">
            <div className="scrub-top">
              <div className="scrub-now">
                <span className="scrub-eyebrow">Viewing as of</span>
                <span className="scrub-month">{keyToLabel(asOf)}</span>
              </div>
              <div className="scrub-meta">
                <span><b>{snap.active.length}</b> active loans</span>
                <span><b>{snap.monthsToFree}</b> months to debt-free</span>
                {atToday
                  ? <span className="asof-badge live">● today</span>
                  : <button className="asof-badge jump" onClick={() => jumpToday()}>↩ jump to today</button>}
              </div>
            </div>
            <div className="scrub-track-wrap">
              <button className="step" onClick={() => stepMonth(-1)} aria-label="previous month">‹</button>
              <div className="scrub-rail">
                <input type="range" className="scrub-range"
                       min={0} max={model.months.length - 1}
                       value={Math.max(0, model.months.findIndex(m => m.key === asOf))}
                       style={{ '--pct': `${(model.months.findIndex(m => m.key === asOf) / (model.months.length - 1)) * 100}%` }}
                       onChange={e => setAsOf(model.months[+e.target.value].key)} />
                <div className="scrub-marks">
                  {model.events.map((e, i) => {
                    const lo = model.months[0].key, hi = model.months.at(-1).key
                    const pct = ((e.key - lo) / (hi - lo)) * 100
                    return <i key={i} className={e.key <= asOf ? 'hit' : ''} style={{ left: `${pct}%` }} title={`${e.month} — ${e.text}`} />
                  })}
                </div>
              </div>
              <button className="step" onClick={() => stepMonth(1)} aria-label="next month">›</button>
            </div>
            <div className="scrub-ends">
              <span>{model.months[0].label}</span>
              <span className="scrub-mid">drag to time-travel · dots = loan closures</span>
              <span>{model.months.at(-1).label}</span>
            </div>
          </div>

          {/* ---------- KPIs ---------- */}
          <section className="kpis">
            <Kpi label="Active loans" value={snap.active.length} sub={`of ${model.loans.length} · ${model.loans.length - snap.active.length} closed`} accent />
            <Kpi label="Remaining to pay" value={fmtINR(snap.remaining)} sub="all future EMIs" />
            <Kpi label="Monthly EMI now" value={fmtINR(snap.totalEMI)} sub="this month's outflow" />
            <Kpi label="Income" value={fmtINR(snap.income)} sub="per month" />
            <Kpi label="Free cash / month" value={fmtINR(snap.freeCash)} sub={deficit ? 'deficit — over budget' : 'surplus'} tone={deficit ? 'neg' : 'pos'} />
            <Kpi label="Debt-free by" value={snap.debtFree} sub={`${snap.monthsToFree} months left`} />
          </section>

          {/* ---------- EMI burn-down ---------- */}
          <section className="charts">
            <Card title="Monthly EMI burn-down by category — ▸ marks where you are" wide>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={model.monthly} margin={{ top: 8, right: 16, bottom: 4, left: 6 }}>
                  <defs>
                    {CATEGORY_ORDER.map(c => (
                      <linearGradient key={c} id={`g-${slug(c)}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={catColor(c)} stopOpacity={0.85} />
                        <stop offset="100%" stopColor={catColor(c)} stopOpacity={0.25} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid stroke="#262b35" vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={{ stroke: '#2a2f3a' }} minTickGap={28} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={inrShort} />
                  <Tooltip {...tip} formatter={(v, n) => [fmtINR(v), n]} />
                  <ReferenceLine x={keyToLabel(asOf)} stroke="#fff" strokeDasharray="3 3"
                                 label={{ value: 'now', position: 'top', fill: '#fff', fontSize: 11 }} />
                  {CATEGORY_ORDER.filter(c => model.monthly.some(m => m[c])).map(c => (
                    <Area key={c} type="monotone" dataKey={c} stackId="emi"
                          stroke={catColor(c)} strokeWidth={1} fill={`url(#g-${slug(c)})`} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              <Legend items={CATEGORY_ORDER.filter(c => model.monthly.some(m => m[c])).map(c => ({ name: c, color: catColor(c) }))} />
            </Card>
          </section>

          <section className="charts">
            <Card title={`Remaining debt by category — as of ${keyToLabel(asOf)}`}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={snap.byCategory} dataKey="remaining" nameKey="name"
                       innerRadius={56} outerRadius={94} paddingAngle={2} stroke="none">
                    {snap.byCategory.map(d => <Cell key={d.name} fill={catColor(d.name)} />)}
                  </Pie>
                  <Tooltip {...tip} formatter={(v, n) => [fmtINR(v), n]} />
                </PieChart>
              </ResponsiveContainer>
              <Legend items={snap.byCategory.map(d => ({ name: `${d.name} · ${fmtINR(d.remaining)}`, color: catColor(d.name) }))} />
            </Card>

            <Card title="Income vs EMI vs free cash per month">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={model.monthly} margin={{ top: 8, right: 16, bottom: 4, left: 6 }}>
                  <defs>
                    <linearGradient id="g-cash" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5ed18b" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#5ed18b" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#262b35" vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={{ stroke: '#2a2f3a' }} minTickGap={28} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={inrShort} />
                  <Tooltip {...tip} formatter={(v, n) => [fmtINR(v), n]} />
                  <ReferenceLine y={0} stroke="#ff6b6b" strokeDasharray="4 4" />
                  <ReferenceLine x={keyToLabel(asOf)} stroke="#fff" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="freeCash" name="Free cash" stroke="#5ed18b" strokeWidth={2} fill="url(#g-cash)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </section>

          <section className="charts">
            <Card title={`Monthly EMI by active loan — as of ${keyToLabel(asOf)}`} wide>
              <ResponsiveContainer width="100%" height={Math.max(180, snap.active.length * 28)}>
                <BarChart data={[...snap.active].sort((a, b) => b.emi - a.emi)} layout="vertical"
                          margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid stroke="#262b35" horizontal={false} />
                  <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={inrShort} />
                  <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={{ stroke: '#2a2f3a' }} width={150} />
                  <Tooltip {...tip} cursor={{ fill: 'rgba(240,180,41,.06)' }} formatter={(v) => [fmtINR(v), 'EMI']} />
                  <Bar dataKey="emi" radius={[0, 5, 5, 0]}>
                    {[...snap.active].sort((a, b) => b.emi - a.emi).map(l => <Cell key={l.name} fill={catColor(l.category)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </section>

          {/* ---------- Loans table ---------- */}
          <section className="table-block">
            <div className="table-bar">
              <h2 className="section-title">Loans <span className="muted-sub">as of {keyToLabel(asOf)}</span></h2>
              <input className="search" placeholder="Filter loans…" value={query} onChange={e => setQuery(e.target.value)} />
              <span className="count">{loansView.filter(l => l.active).length} active</span>
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Status</th><th>Loan</th><th>Category</th>
                    <th className="num">Monthly EMI</th><th>End date</th>
                    <th className="num">EMIs left</th><th className="num">Remaining</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {loansView.map((l, i) => (
                    <tr key={l.name + i} className={l.active ? '' : 'closed-row'}>
                      <td>{l.active ? <span className="badge ok">active</span> : <span className="badge done">closed</span>}</td>
                      <td className="loan-name">{l.name}</td>
                      <td><span className="chip" style={{ '--c': catColor(l.category) }}>{l.category}</span></td>
                      <td className="num">{fmtINR(l.emi)}</td>
                      <td>{l.endDate}</td>
                      <td className="num">{l.active ? l.emisLeftNow : '—'}</td>
                      <td className="num strong">{l.active ? fmtINR(l.remainingNow) : '✓'}</td>
                      <td className={`note-cell ${/urgent|highest/i.test(l.notes) ? 'warn' : ''}`}>{l.notes}</td>
                    </tr>
                  ))}
                  {!loansView.length && <tr><td className="empty" colSpan={8}>No matching loans.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- Expenses + closures ---------- */}
          <section className="cols2">
            {expenseAgg && (
              <div className="panel">
                <h2 className="section-title">Monthly expenses <span className="muted-sub">{fmtINR(expenseAgg.total)} logged</span></h2>
                {expenseAgg.months.length > 1 && (
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={expenseAgg.months} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke="#262b35" vertical={false} />
                      <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={{ stroke: '#2a2f3a' }} />
                      <YAxis tick={axisTick} tickLine={false} axisLine={false} width={46} tickFormatter={inrShort} />
                      <Tooltip {...tip} formatter={(v) => [fmtINR(v), 'Spent']} />
                      <Bar dataKey="value" fill="#5aa9ff" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="exp-list">
                  {expenseAgg.items.map(it => {
                    const pct = Math.round(it.value / expenseAgg.items[0].value * 100)
                    return (
                      <div key={it.name} className="exp-row">
                        <span className="exp-name" title={it.name}>{it.name}</span>
                        <span className="exp-bar"><i style={{ width: `${pct}%` }} /></span>
                        <span className="exp-amt">{fmtINR(it.value)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {model.events.length > 0 && (
              <div className="panel">
                <h2 className="section-title">Loan closures
                  <span className="muted-sub">{model.events.filter(e => e.key >= asOf).length} ahead · {model.events.filter(e => e.key < asOf).length} done</span>
                </h2>
                <ul className="closures">
                  {model.events.map((e, i) => (
                    <li key={i} className={e.key < asOf ? 'past' : (e.key === asOf ? 'now' : '')}>
                      <span className="cl-dot" />
                      <span className="cl-month">{e.month}</span>
                      <span className="cl-text" title={e.text}>{e.text.replace(/\s*✓/g, '').replace(/\s*\|\s*/g, ' + ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {model.goldLoans.length > 0 && (() => {
            const todayDay = Math.floor(Date.now() / 86400000)
            // days held + interest accrued from "date of kept" until today
            const g = model.goldLoans.map(x => {
              const days = isFinite(x.keptTs) ? Math.max(0, todayDay - Math.floor(x.keptTs / 86400000)) : NaN
              const perDay = isFinite(x.interestToPay) ? x.interestToPay / 30
                : (isFinite(x.amount) && isFinite(x.interest) ? x.amount * x.interest / 100 / 365 : NaN)
              const accrued = isFinite(perDay) && isFinite(days) ? perDay * days : NaN
              return { ...x, days, accrued }
            })
            const total = g.reduce((a, x) => a + x.amount, 0)
            const grams = g.reduce((a, x) => a + x.gram, 0)
            const interestDue = g.reduce((a, x) => a + (isFinite(x.interestToPay) ? x.interestToPay : 0), 0)
            const accruedTotal = g.reduce((a, x) => a + (isFinite(x.accrued) ? x.accrued : 0), 0)
            return (
              <section className="gold-block">
                <h2 className="section-title">Gold loans
                  <span className="muted-sub">{g.length} pledge{g.length > 1 ? 's' : ''} · {new Set(g.map(x => x.bank)).size} bank(s)</span>
                </h2>
                <section className="kpis gold-kpis">
                  <Kpi label="Total pledged" value={fmtINR(total)} sub={grams ? `${grams} g · ${fmtINR(total / grams)}/g` : 'against gold'} accent />
                  <Kpi label="Interest / month" value={fmtINR(interestDue)} sub={`₹${Math.round(interestDue * 12).toLocaleString('en-IN')} / yr`} tone="neg" />
                  <Kpi label="Interest till today" value={fmtINR(accruedTotal)} sub="accrued since kept" tone="neg" />
                  <Kpi label="Payoff today" value={fmtINR(total + accruedTotal)} sub="principal + interest" />
                </section>
                <div className="gold-grid">
                  {g.map((x, i) => (
                    <div key={i} className="gold-card">
                      <div className="gold-top">
                        <span className="gold-bank">{x.bank || '—'}</span>
                        <span className="gold-gram">{x.gram} g</span>
                      </div>
                      <div className="gold-amt">{fmtINR(x.amount)}</div>
                      <div className="gold-meta">
                        <span><i>Holder</i>{x.holder || '—'}</span>
                        <span><i>Rate</i>{isFinite(x.interest) ? `${x.interest}% · ${fmtINR(x.interestToPay)}/mo` : '—'}</span>
                        <span><i>Kept</i>{x.date || '—'}{isFinite(x.days) ? ` · ${x.days}d ago` : ''}</span>
                        <span className="gold-accrued"><i>Interest till today</i><b>{isFinite(x.accrued) ? fmtINR(x.accrued) : '—'}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })()}
        </>
      )}
    </div>
  )

  function stepMonth(dir) {
    const ks = model.months.map(m => m.key)
    const i = ks.indexOf(asOf)
    const ni = Math.min(ks.length - 1, Math.max(0, i + dir))
    setAsOf(ks[ni])
  }
  function jumpToday() {
    const lo = model.months[0].key, hi = model.months.at(-1).key
    setAsOf(Math.min(hi, Math.max(lo, todayKey())))
  }
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const date = now.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <div className="clock" title={now.toString()}>
      <span className="clock-time">{time}</span>
      <span className="clock-date">{date}</span>
    </div>
  )
}

function Kpi({ label, value, sub, accent, tone }) {
  return (
    <div className={`kpi ${accent ? 'accent' : ''} ${tone ? `tone-${tone}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}
function Card({ title, children, wide }) {
  return (
    <div className={`card ${wide ? 'wide' : ''}`}>
      <div className="card-title">{title}</div>
      {children}
    </div>
  )
}
function Legend({ items }) {
  return (
    <div className="legend">
      {items.map(it => <span key={it.name}><i style={{ background: it.color }} />{it.name}</span>)}
    </div>
  )
}
