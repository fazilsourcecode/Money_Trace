import { getProduct } from './catalog'
import { money, randomId, shortRef } from './format'
import { buildOrder } from './scenarios'
import type { Order, ScenarioId } from './types'

const KEY = 'mt_orders_v1'
const EVENT = 'mt:orders'

function safeParse(raw: string | null): Order[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export function readOrders(): Order[] {
  if (typeof window === 'undefined') return []
  return safeParse(window.localStorage.getItem(KEY))
}

function writeOrders(orders: Order[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, JSON.stringify(orders))
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function addOrder(order: Order) {
  const orders = readOrders()
  writeOrders([order, ...orders])
}

export function getOrder(idOrRef: string): Order | undefined {
  return readOrders().find((o) => o.id === idOrRef || o.ref === idOrRef)
}

export function updateOrder(id: string, patch: (o: Order) => Order) {
  const orders = readOrders().map((o) => (o.id === id ? patch(o) : o))
  writeOrders(orders)
}

// Merchant action: post a refund against a reconciled order and reopen it.
export function applyRefund(id: string) {
  updateOrder(id, (o) => {
    if (o.refund) return o
    const refundAmount = Math.min(2000, Math.round(o.amount * 0.25))
    const at = Date.now()
    return {
      ...o,
      refund: { amount: refundAmount, at },
      reconciliation: {
        state: 'RECONCILIATION_REOPENED',
        confidence: 72,
        reason: `A refund of ${money(refundAmount)} posted after this order had already reconciled. Balance needs updating.`,
        unexplained: refundAmount,
      },
      customerTracking: 'Refund initiated',
      trace: [
        ...o.trace.filter((t) => t.key !== 'refund'),
        { key: 'refund', label: 'Refund', amount: refundAmount, sub: 'posted after reconcile', status: 'flagged' },
      ],
      exceptions: [
        {
          title: 'Retroactive refund reopened reconciliation',
          detail: `Refund of ${money(refundAmount)} arrived after ${o.ref} was reconciled.`,
          amount: refundAmount,
          confidence: 72,
          priority: 'HIGH',
        },
        ...o.exceptions,
      ],
      events: [
        { id: randomId('evt', 8), title: 'Refund received', detail: `${money(refundAmount)} refunded — reconciliation reopened.`, at, tone: 'amber' },
        ...o.events,
      ],
    }
  })
}

// Merchant action: mark a needs-review / reopened item resolved.
export function resolveOrder(id: string) {
  updateOrder(id, (o) => ({
    ...o,
    reconciliation: {
      state: 'RECONCILED',
      confidence: 99,
      reason: 'Reviewed and resolved by the merchant. Difference explained and balance updated.',
      unexplained: 0,
    },
    exceptions: [],
    events: [
      { id: randomId('evt', 8), title: 'Resolved after review', detail: 'Merchant confirmed the difference and closed the case.', at: Date.now(), tone: 'green' },
      ...o.events,
    ],
  }))
}

function shift(order: Order, backMs: number): Order {
  return {
    ...order,
    createdAt: order.createdAt - backMs,
    bank: { ...order.bank, at: order.bank.at ? order.bank.at - backMs : null },
    refund: order.refund ? { ...order.refund, at: order.refund.at - backMs } : undefined,
    events: order.events.map((e) => ({ ...e, at: e.at - backMs })),
  }
}

const SEED_PLAN: { scenario: ScenarioId; product: string; qty: number; name: string; method: Order['payment']['method']; label: string; back: number }[] = [
  { scenario: 'normal', product: 'nimbus-quiet', qty: 1, name: 'Rahul Menon', method: 'upi', label: 'UPI · success@razor', back: 1000 * 60 * 22 },
  { scenario: 'delayed_bank', product: 'orbit-watch', qty: 1, name: 'Sneha Iyer', method: 'card', label: 'HDFC Credit · 4111', back: 1000 * 60 * 48 },
  { scenario: 'partial_capture', product: 'boom-360', qty: 2, name: 'Arjun Nair', method: 'card', label: 'ICICI Debit · 5267', back: 1000 * 60 * 95 },
  { scenario: 'duplicate_webhook', product: 'pulse-lite', qty: 1, name: 'Meera Das', method: 'netbanking', label: 'Axis Netbanking', back: 1000 * 60 * 140 },
  { scenario: 'failed_retry', product: 'volt-air', qty: 1, name: 'Karthik R', method: 'upi', label: 'UPI · success@razor', back: 1000 * 60 * 210 },
  { scenario: 'normal', product: 'lumen-14', qty: 1, name: 'Divya Pillai', method: 'card', label: 'HDFC Credit · 4111', back: 1000 * 60 * 300 },
]

export function seedIfEmpty() {
  if (typeof window === 'undefined') return
  if (readOrders().length > 0) return
  const seeded: Order[] = SEED_PLAN.map((plan) => {
    const p = getProduct(plan.product)!
    const amount = p.price * plan.qty
    const order = buildOrder({
      ref: shortRef(new Date(Date.now() - plan.back)),
      customerName: plan.name,
      scenario: plan.scenario,
      product: { name: p.name, brand: p.brand, image: p.image, price: p.price },
      qty: plan.qty,
      amount,
      method: plan.method,
      methodLabel: plan.label,
      real: false,
    })
    return shift(order, plan.back)
  })
  writeOrders(seeded)
}

export function subscribe(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const handler = () => cb()
  window.addEventListener(EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export { KEY as ORDERS_KEY }
