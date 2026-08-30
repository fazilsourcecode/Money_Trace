'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Check,
  ChevronRight,
  LogOut,
  Package,
  Search,
  Sparkles,
  Star,
  Truck,
  Wand2,
  X,
} from 'lucide-react'
import { Badge, Logo } from '@/components/mt/shared'
import { Checkout, type PaymentResult } from '@/components/mt/checkout'
import { agentSteps, evaluate, parseRequirements } from '@/lib/agent'
import { catalog, featuredIds } from '@/lib/catalog'
import { money, shortRef } from '@/lib/format'
import { logout, useSession } from '@/lib/hooks'
import { addOrder } from '@/lib/store'
import { buildOrder, scenarios, trackingSteps } from '@/lib/scenarios'
import type { Evaluation, Order, Requirements, ScenarioId } from '@/lib/types'

type Step = 'discover' | 'working' | 'results' | 'review' | 'paying' | 'success'

export default function ShopPage() {
  const router = useRouter()
  const session = useSession()

  useEffect(() => {
    if (session === null) router.replace('/')
    if (session && session.role === 'merchant') router.replace('/merchant')
  }, [session, router])

  const [step, setStep] = useState<Step>('discover')
  const [query, setQuery] = useState('I need wireless ANC headphones under ₹10,000, rating above 4, delivered within 3 days.')
  const [controls, setControls] = useState({ maxPrice: 10000, minRating: 4, maxDeliveryDays: 3, anc: true })
  const [scenario, setScenario] = useState<ScenarioId>('normal')
  const [useReal, setUseReal] = useState(false)
  const [qty] = useState(1)
  const [placed, setPlaced] = useState<Order | null>(null)

  const req: Requirements = useMemo(() => ({
    category: 'audio',
    query,
    maxPrice: controls.maxPrice,
    minRating: controls.minRating,
    maxDeliveryDays: controls.maxDeliveryDays,
    requiredFeatures: controls.anc ? ['anc'] : [],
  }), [query, controls])

  const evaluations = useMemo(() => evaluate(req), [req])
  const best = evaluations[0]?.product
  const amount = best ? best.price * qty : 0

  const onQuery = (value: string) => {
    setQuery(value)
    const parsed = parseRequirements(value)
    setControls({ maxPrice: parsed.maxPrice, minRating: parsed.minRating, maxDeliveryDays: parsed.maxDeliveryDays, anc: parsed.requiredFeatures.includes('anc') })
  }

  // auto-advance the hands-off pipeline
  useEffect(() => {
    if (step === 'results') {
      const t = window.setTimeout(() => setStep('review'), 3400)
      return () => window.clearTimeout(t)
    }
    if (step === 'review') {
      const t = window.setTimeout(() => setStep('paying'), 2600)
      return () => window.clearTimeout(t)
    }
  }, [step])

  const onPaid = useCallback((result: PaymentResult) => {
    if (!best) return
    const order = buildOrder({
      ref: shortRef(),
      customerName: session?.name ?? 'Aditya Sharma',
      scenario,
      product: { name: best.name, brand: best.brand, image: best.image, price: best.price },
      qty,
      amount,
      method: result.method,
      methodLabel: result.methodLabel,
      real: result.real,
    })
    // reflect the actual razorpay ids from the checkout
    order.payment.orderId = result.orderId
    order.payment.paymentId = result.paymentId
    addOrder(order)
    setPlaced(order)
    setStep('success')
  }, [best, scenario, qty, amount, session])

  if (!session) return <div className="route-loading">Loading…</div>

  return (
    <main className="store">
      <StoreHeader onLogout={() => { logout(); router.replace('/') }} name={session.name} onOrders={() => router.push('/orders')} />

      {step === 'discover' && (
        <DiscoverView
          query={query}
          onQuery={onQuery}
          controls={controls}
          setControls={setControls}
          req={req}
          scenario={scenario}
          setScenario={setScenario}
          useReal={useReal}
          setUseReal={setUseReal}
          onRun={() => setStep('working')}
        />
      )}

      {step === 'working' && <WorkingView req={req} evaluations={evaluations} onDone={() => setStep('results')} />}

      {step === 'results' && <ResultsView req={req} evaluations={evaluations} />}

      {step === 'review' && best && <ReviewView best={best} req={req} amount={amount} useReal={useReal} scenario={scenario} />}

      {step === 'paying' && best && (
        <section className="stage pay-page">
          <div className="stage-head">
            <p className="eyebrow"><Wand2 /> Agent is paying</p>
            <h1>Completing your payment</h1>
            <p className="stage-sub">Sit back — the agent is running the checkout for you. You’ll land on your order when it’s done.</p>
          </div>
          <div className="checkout-wrap">
            <Checkout amount={amount} productName={best.name} useReal={useReal} onComplete={onPaid} />
          </div>
        </section>
      )}

      {step === 'success' && placed && (
        <SuccessView order={placed} onOrders={() => router.push('/orders')} onAgain={() => { setPlaced(null); setStep('discover') }} />
      )}
    </main>
  )
}

function StoreHeader({ name, onLogout, onOrders }: { name: string; onLogout: () => void; onOrders: () => void }) {
  return (
    <header className="store-header">
      <div className="store-top">
        <Logo variant="store" />
        <div className="store-search">
          <Search />
          <input placeholder="Search MoneyTrace for anything" />
        </div>
        <nav className="store-actions">
          <button onClick={onOrders}><Package /> Orders</button>
          <span className="store-user">{name.split(' ')[0]}</span>
          <button className="store-logout" onClick={onLogout} title="Sign out"><LogOut /></button>
        </nav>
      </div>
      <div className="store-cats">
        {['All', 'Audio', 'Laptops', 'Wearables', 'Deals', 'Today’s picks'].map((c, i) => (
          <button key={c} className={i === 1 ? 'active' : ''}>{c}</button>
        ))}
        <span className="cats-agent"><Sparkles /> Agent shopping enabled</span>
      </div>
    </header>
  )
}

function DiscoverView({
  query, onQuery, controls, setControls, req, scenario, setScenario, useReal, setUseReal, onRun,
}: {
  query: string
  onQuery: (v: string) => void
  controls: { maxPrice: number; minRating: number; maxDeliveryDays: number; anc: boolean }
  setControls: (c: { maxPrice: number; minRating: number; maxDeliveryDays: number; anc: boolean }) => void
  req: Requirements
  scenario: ScenarioId
  setScenario: (s: ScenarioId) => void
  useReal: boolean
  setUseReal: (v: boolean) => void
  onRun: () => void
}) {
  const featured = featuredIds.map((id) => catalog.find((p) => p.id === id)!).filter(Boolean)
  return (
    <>
      <section className="agent-brief">
        <div className="brief-left">
          <p className="eyebrow"><Sparkles /> Shop hands-free</p>
          <h1>Tell the agent what<br /><em>you actually want.</em></h1>
          <p className="brief-copy">Set your budget and must-haves, then let the agent search, compare, choose and pay — while you watch every step.</p>

          <div className="brief-card">
            <textarea value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Describe what you want" />
            <div className="req-controls">
              <div className="req-control">
                <label>Budget</label>
                <div className="stepper">
                  <button onClick={() => setControls({ ...controls, maxPrice: Math.max(1000, controls.maxPrice - 1000) })}>−</button>
                  <b>{money(controls.maxPrice)}</b>
                  <button onClick={() => setControls({ ...controls, maxPrice: controls.maxPrice + 1000 })}>+</button>
                </div>
              </div>
              <div className="req-control">
                <label>Min rating</label>
                <select value={controls.minRating} onChange={(e) => setControls({ ...controls, minRating: Number(e.target.value) })}>
                  <option value={3.5}>3.5★</option>
                  <option value={4}>4.0★</option>
                  <option value={4.5}>4.5★</option>
                </select>
              </div>
              <div className="req-control">
                <label>Deliver within</label>
                <select value={controls.maxDeliveryDays} onChange={(e) => setControls({ ...controls, maxDeliveryDays: Number(e.target.value) })}>
                  <option value={1}>1 day</option>
                  <option value={2}>2 days</option>
                  <option value={3}>3 days</option>
                  <option value={5}>5 days</option>
                </select>
              </div>
              <button className={`feature-toggle ${controls.anc ? 'on' : ''}`} onClick={() => setControls({ ...controls, anc: !controls.anc })}>
                {controls.anc ? <Check /> : <X />} ANC required
              </button>
            </div>
            <div className="brief-run">
              <button className="primary-btn" onClick={onRun}>Run the agent <ArrowRight /></button>
              <span className="req-summary">{req.requiredFeatures.length ? 'ANC · ' : ''}≤ {money(req.maxPrice)} · {req.minRating}★ · {req.maxDeliveryDays}d</span>
            </div>
          </div>

          <div className="lab-strip">
            <div className="lab-head"><span className="lab-dot" /> Test lab — pick what happens after you pay</div>
            <div className="lab-scenarios">
              {scenarios.map((s) => (
                <button key={s.id} className={scenario === s.id ? 'active' : ''} onClick={() => setScenario(s.id)} title={s.blurb}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="lab-pay">
              <span>Payment</span>
              <div className="seg">
                <button className={!useReal ? 'active' : ''} onClick={() => setUseReal(false)}>Auto (simulated)</button>
                <button className={useReal ? 'active' : ''} onClick={() => setUseReal(true)}>Real Razorpay window</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="showcase">
        <div className="showcase-head"><h2>Trending in Audio</h2><a>See all <ChevronRight /></a></div>
        <div className="showcase-grid">
          {featured.map((p) => (
            <article className="tile" key={p.id}>
              <div className="tile-img"><img src={p.image} alt={p.name} /></div>
              <div className="tile-body">
                <h3>{p.name}</h3>
                <div className="tile-meta"><span className="tile-rating"><Star /> {p.rating}</span><span><Truck /> {p.deliveryDays}d</span></div>
                <div className="tile-price">{money(p.price)}</div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

function WorkingView({ req, evaluations, onDone }: { req: Requirements; evaluations: Evaluation[]; onDone: () => void }) {
  const steps = useMemo(() => agentSteps(req), [req])
  const [typed, setTyped] = useState('')
  const [current, setCurrent] = useState(0)
  const [revealed, setRevealed] = useState(0)
  const doneRef = useRef(false)

  useEffect(() => {
    // type out the search query
    let i = 0
    const type = window.setInterval(() => {
      i += 1
      setTyped(req.query.slice(0, i))
      if (i >= req.query.length) window.clearInterval(type)
    }, 22)
    // advance reasoning steps
    const stepIv = window.setInterval(() => setCurrent((c) => Math.min(steps.length - 1, c + 1)), 520)
    // reveal candidate cards
    const revealIv = window.setInterval(() => setRevealed((r) => Math.min(evaluations.length, r + 1)), 620)
    const finish = window.setTimeout(() => { if (!doneRef.current) { doneRef.current = true; onDone() } }, steps.length * 520 + 900)
    return () => { window.clearInterval(type); window.clearInterval(stepIv); window.clearInterval(revealIv); window.clearTimeout(finish) }
  }, [req.query, steps.length, evaluations.length, onDone])

  return (
    <section className="stage working">
      <div className="stage-head">
        <p className="eyebrow"><span className="live-dot" /> Agent at work</p>
        <h1>Finding your best match</h1>
      </div>
      <div className="working-grid">
        <div className="working-main">
          <div className="live-search"><Search /><span className="live-search-text">{typed}<span className="type-caret" /></span></div>
          <div className="candidate-stream">
            {evaluations.slice(0, revealed).map((ev) => (
              <div className={`candidate ${ev.rank === 0 ? 'best' : ''}`} key={ev.product.id}>
                <img src={ev.product.image} alt={ev.product.name} />
                <div className="candidate-info">
                  <strong>{ev.product.name}</strong>
                  <span>{money(ev.product.price)} · {ev.product.rating}★ · {ev.product.deliveryDays}d</span>
                </div>
                {ev.rank === 0 ? <Badge tone="blue">EVALUATING</Badge> : ev.passed ? <Badge tone="slate">CANDIDATE</Badge> : <Badge tone="red">RULED OUT</Badge>}
              </div>
            ))}
            {revealed < evaluations.length && <div className="candidate loading"><span className="spinner" /> pulling product signals…</div>}
          </div>
        </div>
        <aside className="reasoning">
          <span className="aside-label">AGENT REASONING</span>
          <div className="reason-steps">
            {steps.map((s, i) => (
              <div className={`reason-step ${i < current ? 'done' : i === current ? 'now' : ''}`} key={s}>
                <span className="reason-check">{i < current ? <Check /> : i === current ? <span className="spinner" /> : i + 1}</span>
                {s}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  )
}

function ResultsView({ req, evaluations }: { req: Requirements; evaluations: Evaluation[] }) {
  return (
    <section className="stage results">
      <div className="stage-head row">
        <div>
          <p className="eyebrow"><Search /> Evaluated {evaluations.length} products</p>
          <h1>Here’s what the agent chose</h1>
          <p className="stage-sub">Best match highlighted. Every other option shows exactly why it wasn’t picked.</p>
        </div>
        <div className="auto-next"><span className="spinner" /> Auto-continuing to checkout…</div>
      </div>
      <div className="result-grid">
        {evaluations.map((ev) => (
          <article className={`result-card ${ev.rank === 0 ? 'best' : ev.passed ? '' : 'ruled'}`} key={ev.product.id}>
            <div className="result-img">
              <img src={ev.product.image} alt={ev.product.name} />
              {ev.rank === 0 && <span className="best-tag">BEST MATCH</span>}
              {!ev.passed && <span className="ruled-tag">RULED OUT</span>}
            </div>
            <div className="result-body">
              <h3>{ev.product.name}</h3>
              <div className="result-price">{money(ev.product.price)}</div>
              <div className="result-meta"><span><Star /> {ev.product.rating}</span><span><Truck /> {ev.product.deliveryDays}d</span></div>
              <div className="check-rows">
                {ev.checks.map((c) => (
                  <div className={c.pass ? 'chk pass' : 'chk fail'} key={c.label}>
                    {c.pass ? <Check /> : <X />}<span><b>{c.label}</b> {c.detail}</span>
                  </div>
                ))}
              </div>
              <div className={`why ${ev.rank === 0 ? 'why-best' : ''}`}>{ev.reason}</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ReviewView({ best, req, amount, useReal, scenario }: { best: Evaluation['product']; req: Requirements; amount: number; useReal: boolean; scenario: ScenarioId }) {
  const sc = scenarios.find((s) => s.id === scenario)!
  return (
    <section className="stage review">
      <div className="stage-head">
        <p className="eyebrow"><Wand2 /> Agent is approving</p>
        <h1>Reviewing your order</h1>
        <p className="stage-sub">Requirements met — approving and moving to payment.</p>
      </div>
      <div className="review-grid">
        <div className="review-order">
          <div className="ro-product">
            <img src={best.image} alt={best.name} />
            <div><strong>{best.name}</strong><small>{best.brand} · arrives in {best.deliveryDays} day{best.deliveryDays > 1 ? 's' : ''}</small></div>
            <b>{money(best.price)}</b>
          </div>
          <div className="ro-line"><span>Total payable</span><strong>{money(amount)}</strong></div>
          <div className="ro-pay">Paying via {useReal ? 'the real Razorpay test window' : 'Razorpay test (auto)'} · scenario: <b>{sc.label}</b></div>
        </div>
        <div className="review-checks">
          <span className="aside-label">REQUIREMENTS MET</span>
          {best && evaluationChecks(best, req).map((c) => (
            <div className="rc" key={c.label}><Check /><span><b>{c.label}</b><small>{c.detail}</small></span></div>
          ))}
          <div className="approving"><span className="spinner" /> Approving purchase…</div>
        </div>
      </div>
    </section>
  )
}

function evaluationChecks(product: Evaluation['product'], req: Requirements) {
  return evaluate(req).find((e) => e.product.id === product.id)?.checks ?? []
}

function SuccessView({ order, onOrders, onAgain }: { order: Order; onOrders: () => void; onAgain: () => void }) {
  const steps = trackingSteps(order)
  return (
    <section className="stage success">
      <div className="success-mark"><Check /></div>
      <p className="eyebrow">Payment confirmed</p>
      <h1>Your order is on its way</h1>
      <p className="stage-sub">Order <b>{order.ref}</b> · {money(order.amount)} paid{order.payment.real ? ' via Razorpay (real test)' : ''}.</p>

      <div className="track-card">
        <div className="track-total">
          <div><span>Total paid</span><strong>{money(order.amount)}</strong></div>
          <div><span>Payment</span><strong>{order.payment.methodLabel}</strong></div>
          <div><span>Reference</span><strong>{order.ref}</strong></div>
        </div>
        <div className="track-line">
          {steps.map((s) => (
            <div className={`track-step ${s.state}`} key={s.label}>
              <span>{s.state === 'done' ? <Check /> : s.state === 'current' ? <span className="spinner" /> : ''}</span>
              <div><strong>{s.label}</strong><small>{s.note}</small></div>
            </div>
          ))}
        </div>
      </div>

      <div className="success-actions">
        <button className="primary-btn" onClick={onOrders}>View your orders <ArrowRight /></button>
        <button className="ghost-btn" onClick={onAgain}>Shop again</button>
      </div>
      <p className="merchant-hint">The merchant can now open this exact order in MoneyTrace and follow the money to the bank.</p>
    </section>
  )
}
