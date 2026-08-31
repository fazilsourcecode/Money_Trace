'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Route,
  Search,
  X,
} from 'lucide-react'
import { Badge, Logo, stateLabel, stateTone } from '@/components/mt/shared'
import { MoneyRail } from '@/components/mt/trace'
import { clockTime, money, timeAgo } from '@/lib/format'
import { logout, useOrders, useSession } from '@/lib/hooks'
import { applyRefund, resolveOrder } from '@/lib/store'
import type { Order } from '@/lib/types'
import { assistantAnswer, evaluation, evaluationQuestions } from '@/lib/evaluation'

type Tab = 'Overview' | 'Transactions' | 'Reconciliation' | 'Exceptions' | 'Audit'
const TABS: Tab[] = ['Overview', 'Transactions', 'Reconciliation', 'Exceptions', 'Audit']

const REVIEW_STATES = ['NEEDS_REVIEW', 'RECONCILIATION_REOPENED', 'EXCEPTION']
const isReview = (o: Order) => REVIEW_STATES.includes(o.reconciliation.state)

export default function MerchantPage() {
  const router = useRouter()
  const session = useSession()
  const orders = useOrders()
  const [tab, setTab] = useState<Tab>('Overview')
  const [openId, setOpenId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantText, setAssistantText] = useState('')
  const [assistantReply, setAssistantReply] = useState('')

  useEffect(() => {
    if (session === null) router.replace('/')
    if (session && session.role === 'customer') router.replace('/shop')
  }, [session, router])

  const open = orders.find((o) => o.id === openId) ?? null
  const reviewCount = orders.filter(isReview).length

  const goto = (t: Tab) => { setTab(t); setOpenId(null); setMenuOpen(false) }

  if (!session) return <div className="route-loading">Loading…</div>

  return (
    <main className="console">
      <aside className={`console-side ${menuOpen ? 'open' : ''}`}>
        <div className="side-top">
          <Logo variant="trace" sub="Control center" />
          <button className="close-menu" onClick={() => setMenuOpen(false)}><X /></button>
        </div>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav">
          {TABS.map((t) => (
            <button key={t} className={tab === t && !open ? 'active' : ''} onClick={() => goto(t)}>
              {t === 'Overview' ? <LayoutDashboard /> : t === 'Transactions' ? <CreditCard /> : t === 'Reconciliation' ? <RefreshCw /> : t === 'Exceptions' ? <CircleAlert /> : <FileCheck2 />}
              {t}
              {t === 'Exceptions' && reviewCount > 0 && <span className="nav-count">{reviewCount}</span>}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="ws-card"><span className="ws-avatar">AC</span><span><strong>Aria Commerce</strong><small>{session.email}</small></span><ChevronRight /></div>
          <button className="side-signout" onClick={() => { logout(); router.replace('/') }}><LogOut /> Sign out</button>
        </div>
      </aside>

      <section className="console-main">
        <header className="console-header">
          <button className="menu-btn" onClick={() => setMenuOpen(true)}><Menu /></button>
          <div>
            <span className="mobile-kicker">MONEYTRACE COMMERCE</span>
            <h1>{open ? 'Transaction trace' : tab}</h1>
          </div>
          <div className="header-actions">
            <span className="sync"><span className="live-pulse" /> Live · synced {orders.length ? timeAgo(orders[0].createdAt) : 'now'}</span>
            <button className="assistant-trigger" onClick={() => setAssistantOpen((open) => !open)}><Route /> Trace Assistant</button>
          </div>
        </header>

        {assistantOpen && (
          <section className="assistant-panel">
            <div><span className="section-kicker">BOUNDED COPILOT</span><h3>Trace Assistant</h3><p>Evidence-first answers. Every recommended action still needs human approval.</p></div>
            <div className="assistant-questions">{evaluationQuestions.map((question) => <button key={question} onClick={() => setAssistantReply(assistantAnswer(question))}>{question}</button>)}</div>
            <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); setAssistantReply(assistantAnswer(assistantText)); setAssistantText('') }}>
              <input value={assistantText} onChange={(event) => setAssistantText(event.target.value)} placeholder="Ask about the close…" aria-label="Ask Trace Assistant" />
              <button className="primary-btn" type="submit">Ask</button>
            </form>
            {assistantReply && <div className="assistant-reply"><strong>Controller analysis</strong><p>{assistantReply}</p></div>}
          </section>
        )}
        {open ? (
          <TraceDetail order={open} onBack={() => setOpenId(null)} />
        ) : tab === 'Overview' ? (
          <Overview orders={orders} onOpen={setOpenId} goto={goto} />
        ) : tab === 'Transactions' ? (
          <Transactions orders={orders} onOpen={setOpenId} />
        ) : tab === 'Reconciliation' ? (
          <Reconciliation orders={orders} onOpen={setOpenId} />
        ) : tab === 'Exceptions' ? (
          <Exceptions orders={orders} onOpen={setOpenId} />
        ) : (
          <Audit orders={orders} onOpen={setOpenId} />
        )}
      </section>
    </main>
  )
}

function useMetrics(orders: Order[]) {
  return useMemo(() => {
    const volume = orders.reduce((s, o) => s + o.amount, 0)
    const reconciled = orders.filter((o) => o.reconciliation.state === 'RECONCILED').length
    const review = orders.filter(isReview).length
    const awaiting = orders.filter((o) => o.reconciliation.state === 'AWAITING_BANK').length
    const unexplained = orders.reduce((s, o) => s + o.reconciliation.unexplained, 0)
    const pct = orders.length ? Math.round((reconciled / orders.length) * 100) : 100
    return { count: orders.length, volume, reconciled, review, awaiting, unexplained, pct }
  }, [orders])
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className={`metric ${tone ? `metric-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function Overview({ orders, onOpen, goto }: { orders: Order[]; onOpen: (id: string) => void; goto: (t: Tab) => void }) {
  const m = useMetrics(orders)
  const recent = orders.slice(0, 4)
  const reviews = orders.filter(isReview).slice(0, 3)
  const newest = orders[0]
  const isNew = newest && Date.now() - newest.createdAt < 20000

  return (
    <div className="pad">
      <div className="welcome">
        <div>
          <p className="section-kicker">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h2>The truth across your payments today</h2>
        </div>
      </div>

      <div className="metrics">
        <Metric label="Transactions" value={String(m.count)} detail="captured today" tone="blue" />
        <Metric label="Payment volume" value={money(m.volume)} detail={`${m.count} payments`} />
        <Metric label="Reconciled" value={`${m.pct}%`} detail={`${m.reconciled} resolved`} tone="green" />
        <Metric label="Needs review" value={String(m.review)} detail="open cases" tone="amber" />
        <Metric label="Awaiting bank" value={String(m.awaiting)} detail="settlement pending" tone="blue" />
        <Metric label="Unexplained" value={money(m.unexplained)} detail={m.unexplained ? 'needs an answer' : 'all explained'} tone={m.unexplained ? 'amber' : 'green'} />
      </div>

      <section className="evaluation-strip">
        <div><span className="section-kicker">LATEST CONTROL RUN</span><h3>Batch reconciliation evaluation</h3><p>Deterministic 120-record replay across six payment failure modes.</p></div>
        <div className="eval-stat"><strong>{evaluation.processed}</strong><span>processed</span></div>
        <div className="eval-stat"><strong>{evaluation.matchRate}%</strong><span>auto-matched</span></div>
        <div className="eval-stat"><strong>₹{evaluation.amountAtRisk.toLocaleString('en-IN')}</strong><span>at risk</span></div>
        <button className="ghost-btn" onClick={() => goto('Reconciliation')}>Open run <ArrowRight /></button>
      </section>

      <div className="ov-grid">
        <section className="panel">
          <div className="panel-head"><div><span className="section-kicker">LIVE ACTIVITY</span><h3>Recent transactions</h3></div><button onClick={() => goto('Transactions')}>View all <ArrowRight /></button></div>
          {isNew && (
            <div className="arrival">
              <span className="arrival-icon"><CreditCard /></span>
              <div><strong>NEW PAYMENT</strong><p>{newest.product.name} · {money(newest.amount)}</p><small>captured {timeAgo(newest.createdAt)}</small></div>
              <Badge tone="blue">JUST IN</Badge>
            </div>
          )}
          <div className="txn-list">
            {recent.map((o) => (
              <button className="txn-row" key={o.id} onClick={() => onOpen(o.id)}>
                <span className="txn-ic"><CreditCard /></span>
                <div><strong>{o.product.name}</strong><small>{o.ref}</small></div>
                <b>{money(o.amount)}</b>
                <Badge tone={stateTone(o.reconciliation.state)}>{stateLabel(o.reconciliation.state)}</Badge>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><div><span className="section-kicker">ATTENTION</span><h3>Needs review</h3></div><button onClick={() => goto('Exceptions')}>Queue <ArrowRight /></button></div>
          {reviews.length === 0 && <div className="all-clear"><Check /> Everything reconciles. No open cases.</div>}
          {reviews.map((o) => (
            <button className="mini-exc" key={o.id} onClick={() => onOpen(o.id)}>
              <span className="mini-ic"><CircleAlert /></span>
              <div><strong>{o.exceptions[0]?.title ?? stateLabel(o.reconciliation.state)}</strong><small>{o.ref} · {timeAgo(o.createdAt)}</small></div>
              <Badge tone="amber">{o.exceptions[0]?.priority ?? 'REVIEW'}</Badge>
            </button>
          ))}
        </section>
      </div>
    </div>
  )
}

function Transactions({ orders, onOpen }: { orders: Order[]; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'review' | 'reconciled'>('all')
  const rows = orders.filter((o) => filter === 'all' ? true : filter === 'review' ? isReview(o) || o.reconciliation.state === 'AWAITING_BANK' : o.reconciliation.state === 'RECONCILED')
  return (
    <div className="pad">
      <div className="page-intro"><div><span className="section-kicker">PAYMENT LEDGER</span><h2>Transactions</h2><p>Every payment, settlement and correction — click any row to trace it.</p></div></div>
      <div className="table-panel">
        <div className="table-toolbar">
          <span>{rows.length} transactions</span>
          <div className="table-tabs">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
            <button className={filter === 'review' ? 'active' : ''} onClick={() => setFilter('review')}>Needs review</button>
            <button className={filter === 'reconciled' ? 'active' : ''} onClick={() => setFilter('reconciled')}>Reconciled</button>
          </div>
        </div>
        <div className="txn-table">
          <div className="thead"><span>Transaction</span><span>Payment</span><span>Amount</span><span>State</span><span>Updated</span></div>
          {rows.map((o) => (
            <button className="trow" key={o.id} onClick={() => onOpen(o.id)}>
              <div><strong>{o.product.name}</strong><small>{o.ref}</small></div>
              <span className="mono">{o.payment.paymentId.slice(0, 12)}…</span>
              <strong>{money(o.amount)}</strong>
              <Badge tone={stateTone(o.reconciliation.state)}>{stateLabel(o.reconciliation.state)}</Badge>
              <span>{timeAgo(o.createdAt)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Reconciliation({ orders, onOpen }: { orders: Order[]; onOpen: (id: string) => void }) {
  const featured = orders.find(isReview) ?? orders.find((o) => o.reconciliation.state === 'AWAITING_BANK') ?? orders[0]
  if (!featured) return <div className="pad"><div className="all-clear big"><Check /> Nothing to reconcile yet.</div></div>
  return (
    <div className="pad">
      <div className="page-intro"><div><span className="section-kicker">EVIDENCE-DRIVEN CONTROL</span><h2>Reconciliation</h2><p>Follow the money from payment to bank credit. Explain every difference.</p></div><Badge tone={stateTone(featured.reconciliation.state)}>{stateLabel(featured.reconciliation.state)}</Badge></div>

      <TraceCard order={featured} onOpen={() => onOpen(featured.id)} />

      <section className="batch">
        <div><span className="section-kicker">RELATIONSHIP MATCHING</span><h3>Batched settlement recognised</h3><p>MoneyTrace matches one-to-many relationships, not just exact rows.</p></div>
        <div className="batch-flow">
          <span>Order A <b>₹4,000</b></span><span>Order B <b>₹3,000</b></span><span>Order C <b>₹5,000</b></span>
          <ArrowRight /><strong>Settlement<br />₹12,000</strong><ArrowRight /><strong>Bank credit<br />₹12,000</strong>
        </div>
        <Badge tone="green">3 ↔ 1 ↔ 1 MATCHED</Badge>
      </section>
    </div>
  )
}

function TraceCard({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const reopened = order.reconciliation.state !== 'RECONCILED'
  return (
    <section className={`trace-card ${reopened ? 'flagged' : ''}`}>
      <div className="trace-top">
        <div><span className="section-kicker">FEATURED · {order.ref}</span><h3>{order.product.name}</h3></div>
        <Badge tone={stateTone(order.reconciliation.state)}>{stateLabel(order.reconciliation.state)}</Badge>
      </div>
      <MoneyRail trace={order.trace} animate={order.reconciliation.state !== 'AWAITING_BANK'} />
      <div className="trace-bottom">
        <div className="evidence">
          <span className="section-kicker">EVIDENCE</span>
          <p>{order.reconciliation.reason}</p>
        </div>
        <div className="confidence">
          <span className="section-kicker">CONFIDENCE</span>
          <strong>{order.reconciliation.confidence}%</strong>
          <div className="conf-bar"><span className={stateTone(order.reconciliation.state)} style={{ width: `${order.reconciliation.confidence}%` }} /></div>
          <Badge tone={stateTone(order.reconciliation.state)}>{order.reconciliation.state === 'RECONCILED' ? 'AUTO-RESOLVED' : 'REVIEW'}</Badge>
        </div>
        <div className="recommend">
          <span className="section-kicker">TRACE</span>
          <p>Open the full trace to see the audit trail and take action.</p>
          <button className="ghost-btn" onClick={onOpen}>Open trace <ArrowRight /></button>
        </div>
      </div>
    </section>
  )
}

function Exceptions({ orders, onOpen }: { orders: Order[]; onOpen: (id: string) => void }) {
  const items = orders.flatMap((o) => o.exceptions.map((e) => ({ ...e, order: o })))
  const rank = { HIGH: 0, MONITOR: 1, HUMAN: 2 }
  items.sort((a, b) => rank[a.priority] - rank[b.priority])
  return (
    <div className="pad">
      <div className="page-intro"><div><span className="section-kicker">INVESTIGATION QUEUE</span><h2>Exceptions</h2><p>Prioritised by financial impact and evidence quality.</p></div><span className="queue-sum"><strong>{items.length}</strong> open</span></div>
      {items.length === 0 && <div className="all-clear big"><Check /> No open exceptions. Every payment is explained.</div>}
      <div className="exc-list">
        {items.map((it, i) => (
          <button className={`exc ${it.priority === 'HIGH' ? 'high' : ''}`} key={i} onClick={() => onOpen(it.order.id)}>
            <div className="exc-top"><Badge tone={it.priority === 'HIGH' ? 'amber' : it.priority === 'HUMAN' ? 'red' : 'blue'}>{it.priority === 'HUMAN' ? 'HUMAN REVIEW' : it.priority === 'HIGH' ? 'HIGH PRIORITY' : 'MONITOR'}</Badge><span>{it.order.ref} · {timeAgo(it.order.createdAt)}</span></div>
            <h3>{it.title}</h3>
            <p>{it.detail}</p>
            <div className="exc-foot"><span><strong>{money(it.amount)}</strong> at stake</span><span><strong>{it.confidence}%</strong> confidence</span><span className="exc-open">Investigate <ArrowRight /></span></div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Audit({ orders, onOpen }: { orders: Order[]; onOpen: (id: string) => void }) {
  const feed = orders.flatMap((o) => o.events.map((e) => ({ ...e, order: o }))).sort((a, b) => b.at - a.at).slice(0, 30)
  return (
    <div className="pad">
      <div className="page-intro"><div><span className="section-kicker">IMMUTABLE HISTORY</span><h2>Audit trail</h2><p>Every state transition has a reason, evidence and timestamp.</p></div></div>
      <div className="audit-panel">
        {feed.map((e) => (
          <button className="audit-row" key={e.id} onClick={() => onOpen(e.order.id)}>
            <span className={`audit-ic ${e.tone}`}>{e.tone === 'red' ? <X /> : e.tone === 'amber' ? <CircleAlert /> : e.tone === 'blue' ? <Clock3 /> : <Check />}</span>
            <div><strong>{e.title}</strong><p>{e.detail}</p></div>
            <div className="audit-meta"><small>{e.order.ref}</small><time>{clockTime(e.at)}</time></div>
          </button>
        ))}
      </div>
    </div>
  )
}

function TraceDetail({ order, onBack }: { order: Order; onBack: () => void }) {
  const reopened = order.reconciliation.state !== 'RECONCILED'
  const canRefund = order.reconciliation.state === 'RECONCILED' && !order.refund
  const canResolve = isReview(order)
  return (
    <div className="pad detail">
      <button className="back-link" onClick={onBack}><ArrowLeft /> Back</button>

      <div className="detail-head">
        <div className="dh-product">
          <img src={order.product.image} alt={order.product.name} />
          <div>
            <span className="section-kicker">{order.ref} · {order.customerName}</span>
            <h2>{order.product.name}</h2>
            <small>{order.qty} × {money(order.product.price)} · paid {timeAgo(order.createdAt)} · {order.payment.methodLabel}</small>
          </div>
        </div>
        <Badge tone={stateTone(order.reconciliation.state)}>{stateLabel(order.reconciliation.state)}</Badge>
      </div>

      <section className={`trace-card big ${reopened ? 'flagged' : ''}`}>
        <MoneyRail trace={order.trace} animate={order.reconciliation.state !== 'AWAITING_BANK'} />
        {order.refund && (
          <div className="transition">
            <div><span>PREVIOUS</span><strong>RECONCILED <Check /></strong></div>
            <ArrowRight />
            <div><span>EVENT</span><strong>REFUND · {money(order.refund.amount)}</strong></div>
            <ArrowRight />
            <div><span>NOW</span><strong>{stateLabel(order.reconciliation.state)}</strong></div>
          </div>
        )}
      </section>

      <div className="detail-grid">
        <section className="panel">
          <span className="section-kicker">WHY THIS STATE</span>
          <p className="detail-reason">{order.reconciliation.reason}</p>
          <div className="evidence-list">
            <span><Check /> Payment {money(order.amount)} · {order.payment.paymentId.slice(0, 14)}…</span>
            <span><Check /> Settlement net {money(order.settlement.net)} · fee {money(order.settlement.fee)}</span>
            <span>{order.bank.credited ? <Check /> : <Clock3 />} Bank credit {order.bank.credited ? `${money(order.bank.amount)} · ${order.bank.ref}` : 'pending'}</span>
            {order.refund && <span><CircleAlert /> Refund {money(order.refund.amount)} posted after reconcile</span>}
          </div>
          <div className="detail-actions">
            {canRefund && <button className="warn-btn" onClick={() => applyRefund(order.id)}><RefreshCw /> Introduce a refund event</button>}
            {canResolve && <button className="primary-btn" onClick={() => resolveOrder(order.id)}>Resolve after review <Check /></button>}
            {!canRefund && !canResolve && <span className="resolved-note"><Check /> No action required.</span>}
          </div>
        </section>

        <aside className="panel side-panel">
          <span className="section-kicker">CONFIDENCE</span>
          <strong className="big-conf">{order.reconciliation.confidence}%</strong>
          <div className="conf-bar"><span className={stateTone(order.reconciliation.state)} style={{ width: `${order.reconciliation.confidence}%` }} /></div>
          <div className="fact-list">
            <div><span>Order ID</span><b className="mono">{order.payment.orderId.slice(0, 16)}…</b></div>
            <div><span>Settlement</span><b className="mono">{order.settlement.id.slice(0, 12)}…</b></div>
            <div><span>Gateway fee</span><b>{money(order.settlement.fee)}</b></div>
            <div><span>Attempts</span><b>{order.payment.attempts}</b></div>
            <div><span>Channel</span><b>{order.payment.real ? 'Razorpay (real test)' : 'Razorpay test'}</b></div>
          </div>
        </aside>
      </div>

      <section className="panel">
        <span className="section-kicker">AUDIT TRAIL · {order.ref}</span>
        <div className="detail-audit">
          {order.events.map((e) => (
            <div className="da-row" key={e.id}>
              <span className={`audit-ic ${e.tone}`}>{e.tone === 'red' ? <X /> : e.tone === 'amber' ? <CircleAlert /> : e.tone === 'blue' ? <Clock3 /> : <Check />}</span>
              <div><strong>{e.title}</strong><p>{e.detail}</p></div>
              <time>{clockTime(e.at)}</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
