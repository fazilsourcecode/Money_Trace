'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, LogOut, Package, Search, Sparkles } from 'lucide-react'
import { Badge, Logo, stateLabel, stateTone } from '@/components/mt/shared'
import { MoneyRail } from '@/components/mt/trace'
import { money, timeAgo } from '@/lib/format'
import { logout, useOrders, useSession } from '@/lib/hooks'
import { trackingSteps } from '@/lib/scenarios'
import type { Order } from '@/lib/types'

export default function OrdersPage() {
  const router = useRouter()
  const session = useSession()
  const orders = useOrders()
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (session === null) router.replace('/')
    if (session && session.role === 'merchant') router.replace('/merchant')
  }, [session, router])

  if (!session) return <div className="route-loading">Loading…</div>

  const mine = orders.filter((o) => o.customerName === session.name)
  const open = mine.find((o) => o.id === openId) ?? null

  return (
    <main className="store">
      <header className="store-header">
        <div className="store-top">
          <Logo variant="store" />
          <div className="store-search"><Search /><input placeholder="Search MoneyTrace for anything" /></div>
          <nav className="store-actions">
            <button onClick={() => router.push('/shop')}><Sparkles /> Shop</button>
            <span className="store-user">{session.name.split(' ')[0]}</span>
            <button className="store-logout" onClick={() => { logout(); router.replace('/') }}><LogOut /></button>
          </nav>
        </div>
      </header>

      <section className="orders-page">
        <div className="stage-head">
          <p className="eyebrow"><Package /> Your orders</p>
          <h1>{open ? open.product.name : 'Order history'}</h1>
        </div>

        {mine.length === 0 && (
          <div className="empty-orders">
            <div className="empty-mark"><Package /></div>
            <h3>No orders yet</h3>
            <p>Let the agent find and buy something for you — it takes about a minute.</p>
            <button className="primary-btn" onClick={() => router.push('/shop')}>Start shopping <ArrowRight /></button>
          </div>
        )}

        {!open && mine.length > 0 && (
          <div className="order-cards">
            {mine.map((o) => (
              <button className="order-card" key={o.id} onClick={() => setOpenId(o.id)}>
                <img src={o.product.image} alt={o.product.name} />
                <div className="oc-body">
                  <strong>{o.product.name}</strong>
                  <small>{o.ref} · {timeAgo(o.createdAt)}</small>
                  <span className="oc-track">{o.customerTracking}</span>
                </div>
                <div className="oc-right">
                  <b>{money(o.amount)}</b>
                  <Badge tone={stateTone(o.reconciliation.state)}>{stateLabel(o.reconciliation.state)}</Badge>
                </div>
              </button>
            ))}
          </div>
        )}

        {open && <OrderDetail order={open} onBack={() => setOpenId(null)} />}
      </section>
    </main>
  )
}

function OrderDetail({ order, onBack }: { order: Order; onBack: () => void }) {
  const steps = trackingSteps(order)
  return (
    <div className="order-detail">
      <button className="back-link" onClick={onBack}><ArrowLeft /> All orders</button>
      <div className="od-grid">
        <div className="od-main">
          <div className="od-product">
            <img src={order.product.image} alt={order.product.name} />
            <div>
              <strong>{order.product.name}</strong>
              <small>{order.ref} · placed {timeAgo(order.createdAt)}</small>
              <span className="od-track">{order.customerTracking}</span>
            </div>
            <b>{money(order.amount)}</b>
          </div>

          <div className="od-section">
            <span className="aside-label">WHERE YOUR MONEY IS</span>
            <MoneyRail trace={order.trace} animate={order.reconciliation.state !== 'AWAITING_BANK'} />
          </div>

          <div className="od-track">
            {steps.map((s) => (
              <div className={`track-step ${s.state}`} key={s.label}>
                <span>{s.state === 'done' ? <Check /> : s.state === 'current' ? <span className="spinner" /> : ''}</span>
                <div><strong>{s.label}</strong><small>{s.note}</small></div>
              </div>
            ))}
          </div>
        </div>

        <aside className="od-side">
          <span className="aside-label">STATUS</span>
          <Badge tone={stateTone(order.reconciliation.state)}>{stateLabel(order.reconciliation.state)}</Badge>
          <p className="od-reason">{order.reconciliation.reason}</p>
          <div className="od-facts">
            <div><span>Paid</span><b>{money(order.amount)}</b></div>
            <div><span>Method</span><b>{order.payment.methodLabel}</b></div>
            <div><span>Payment ID</span><b className="mono">{order.payment.paymentId.slice(0, 14)}…</b></div>
          </div>
          <p className="od-hint">This is your view. The merchant sees the full financial trace of the same order in MoneyTrace.</p>
        </aside>
      </div>
    </div>
  )
}
