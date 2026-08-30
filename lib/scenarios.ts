import { clockTime, money, randomId } from './format'
import type {
  AuditEvent,
  ExceptionItem,
  Order,
  ScenarioDef,
  ScenarioId,
  TraceNode,
} from './types'

export const scenarios: ScenarioDef[] = [
  { id: 'normal', label: 'Clean payment', tag: 'RECONCILES', blurb: 'Payment, settlement and bank credit all line up. The textbook happy path.' },
  { id: 'refund', label: 'Refund after reconciliation', tag: 'REOPENS', blurb: 'A refund lands after the order was already reconciled — the truth changes retroactively.' },
  { id: 'partial_capture', label: 'Partial capture', tag: 'REVIEW', blurb: 'Only part of the authorised amount is captured; the gap has to be explained.' },
  { id: 'delayed_bank', label: 'Delayed bank settlement', tag: 'AWAITING', blurb: 'Settled at the gateway, but the bank credit has not arrived in the expected window.' },
  { id: 'duplicate_webhook', label: 'Duplicate webhook', tag: 'DEDUPED', blurb: 'The same capture event is delivered twice — the ledger must not double-count it.' },
  { id: 'failed_retry', label: 'Failed then retried', tag: 'RECOVERED', blurb: 'The first attempt fails, the customer retries, and only one charge should stand.' },
]

export const scenarioMap = Object.fromEntries(scenarios.map((s) => [s.id, s])) as Record<ScenarioId, ScenarioDef>

const feeOf = (gross: number) => Math.round(gross * 0.0236)

interface BuildInput {
  ref: string
  customerName: string
  scenario: ScenarioId
  product: Order['product']
  qty: number
  amount: number
  method: Order['payment']['method']
  methodLabel: string
  real: boolean
}

function ev(title: string, detail: string, tone: AuditEvent['tone'], at: number): AuditEvent {
  return { id: randomId('evt', 8), title, detail, at, tone }
}

export function buildOrder(input: BuildInput): Order {
  const { ref, customerName, scenario, product, qty, amount, method, methodLabel, real } = input
  const now = Date.now()
  const paymentId = randomId('pay')
  const orderId = randomId('order')
  const fee = feeOf(amount)
  const net = amount - fee
  const bankRef = `HDFC-${Math.floor(10000 + Math.random() * 89999)}`

  const events: AuditEvent[] = []
  const exceptions: ExceptionItem[] = []
  let trace: TraceNode[] = []
  const base: Order = {
    id: randomId('ord', 10),
    ref,
    createdAt: now,
    customerName,
    scenario,
    product,
    qty,
    amount,
    payment: { method, methodLabel, paymentId, orderId, status: 'captured', capturedAmount: amount, real, attempts: 1 },
    settlement: { id: randomId('setl'), gross: amount, fee, net, status: 'settled' },
    bank: { credited: true, amount: net, ref: bankRef, bank: 'HDFC Bank', at: now + 3000 },
    reconciliation: { state: 'RECONCILED', confidence: 97, reason: 'Payment, settlement, bank credit and fee all matched.', unexplained: 0 },
    trace: [],
    exceptions: [],
    events: [],
    customerTracking: 'Confirmed · on the way',
  }

  // shared opening events
  events.push(ev('Order created', `${ref} · ${product.name} · ${money(amount)}`, 'slate', now))

  const matchedTrace = (): TraceNode[] => [
    { key: 'payment', label: 'Payment', amount, sub: paymentId.slice(0, 12) + '…', status: 'matched' },
    { key: 'capture', label: 'Captured', amount, sub: methodLabel, status: 'matched' },
    { key: 'settlement', label: 'Settlement', amount: net, sub: `fee ${money(fee)}`, status: 'matched' },
    { key: 'bank', label: 'Bank credit', amount: net, sub: `${base.bank.bank} · ${bankRef}`, status: 'matched' },
  ]

  switch (scenario) {
    case 'normal': {
      events.push(
        ev('Payment captured', `${money(amount)} via ${methodLabel}`, 'blue', now + 500),
        ev('Settlement detected', `${base.settlement.id.slice(0, 12)}… · net ${money(net)}`, 'blue', now + 1500),
        ev('Bank credit received', `${base.bank.bank} · ${money(net)} · ref ${bankRef}`, 'blue', now + 3000),
        ev('Transaction reconciled', 'Payment, settlement, bank credit and fee relationship matched.', 'green', now + 3200),
      )
      trace = matchedTrace()
      break
    }

    case 'refund': {
      const refundAmount = Math.min(2000, Math.round(amount * 0.25))
      base.refund = { amount: refundAmount, at: now + 6000 }
      base.reconciliation = {
        state: 'RECONCILIATION_REOPENED',
        confidence: 72,
        reason: `A refund of ${money(refundAmount)} posted after this order had already reconciled. Balance needs updating.`,
        unexplained: refundAmount,
      }
      base.customerTracking = 'Refund initiated'
      events.push(
        ev('Payment captured', `${money(amount)} via ${methodLabel}`, 'blue', now + 500),
        ev('Settlement detected', `net ${money(net)}`, 'blue', now + 1500),
        ev('Bank credit received', `${base.bank.bank} · ${money(net)} · ref ${bankRef}`, 'blue', now + 3000),
        ev('Transaction reconciled', 'All evidence matched.', 'green', now + 3200),
        ev('Refund received', `${money(refundAmount)} refunded — reconciliation reopened.`, 'amber', now + 6000),
      )
      exceptions.push({
        title: 'Retroactive refund reopened reconciliation',
        detail: `Refund of ${money(refundAmount)} arrived after ${ref} was reconciled. Original payment, settlement and bank evidence are intact.`,
        amount: refundAmount,
        confidence: 72,
        priority: 'HIGH',
      })
      trace = [
        ...matchedTrace(),
        { key: 'refund', label: 'Refund', amount: refundAmount, sub: 'posted after reconcile', status: 'flagged' },
      ]
      break
    }

    case 'partial_capture': {
      const captured = Math.round(amount * 0.6)
      const gap = amount - captured
      base.payment.capturedAmount = captured
      base.settlement.gross = captured
      base.settlement.fee = feeOf(captured)
      base.settlement.net = captured - base.settlement.fee
      base.bank.amount = base.settlement.net
      base.reconciliation = {
        state: 'NEEDS_REVIEW',
        confidence: 83,
        reason: `${money(captured)} captured against ${money(amount)} authorised. The ${money(gap)} gap looks like an intentional partial capture — confirm before settling the balance.`,
        unexplained: 0,
      }
      base.customerTracking = 'Confirmed · partial charge'
      events.push(
        ev('Payment authorised', `${money(amount)} authorised via ${methodLabel}`, 'blue', now + 400),
        ev('Partial capture', `${money(captured)} captured of ${money(amount)} authorised`, 'amber', now + 900),
        ev('Settlement detected', `net ${money(base.settlement.net)}`, 'blue', now + 1800),
        ev('Bank credit received', `${money(base.settlement.net)} · ref ${bankRef}`, 'blue', now + 3200),
        ev('Flagged for review', `Captured amount differs from authorised by ${money(gap)}.`, 'amber', now + 3400),
      )
      exceptions.push({
        title: 'Captured amount below authorised',
        detail: `${money(captured)} captured of ${money(amount)} authorised on ${ref}. Difference of ${money(gap)} needs a one-line explanation.`,
        amount: gap,
        confidence: 83,
        priority: 'MONITOR',
      })
      trace = [
        { key: 'payment', label: 'Authorised', amount, sub: paymentId.slice(0, 12) + '…', status: 'matched' },
        { key: 'capture', label: 'Captured', amount: captured, sub: `${money(gap)} not captured`, status: 'flagged' },
        { key: 'settlement', label: 'Settlement', amount: base.settlement.net, sub: `fee ${money(base.settlement.fee)}`, status: 'matched' },
        { key: 'bank', label: 'Bank credit', amount: base.settlement.net, sub: bankRef, status: 'matched' },
      ]
      break
    }

    case 'delayed_bank': {
      base.bank = { credited: false, amount: net, ref: '—', bank: 'HDFC Bank', at: null }
      base.settlement.status = 'settled'
      base.reconciliation = {
        state: 'AWAITING_BANK',
        confidence: 84,
        reason: `Settled at the gateway (${money(net)}), but the matching bank credit has not landed in today’s window. Timing, not a loss.`,
        unexplained: 0,
      }
      base.customerTracking = 'Confirmed · settling'
      events.push(
        ev('Payment captured', `${money(amount)} via ${methodLabel}`, 'blue', now + 500),
        ev('Settlement detected', `net ${money(net)} · awaiting bank credit`, 'blue', now + 1500),
        ev('Bank credit pending', 'No matching credit within the expected window.', 'amber', now + 3600),
      )
      exceptions.push({
        title: 'Bank credit not yet received',
        detail: `Settlement exists for ${ref}, but the corresponding bank credit of ${money(net)} has not arrived in the expected window.`,
        amount: net,
        confidence: 84,
        priority: 'MONITOR',
      })
      trace = [
        { key: 'payment', label: 'Payment', amount, sub: paymentId.slice(0, 12) + '…', status: 'matched' },
        { key: 'capture', label: 'Captured', amount, sub: methodLabel, status: 'matched' },
        { key: 'settlement', label: 'Settlement', amount: net, sub: `fee ${money(fee)}`, status: 'matched' },
        { key: 'bank', label: 'Bank credit', amount: null, sub: 'pending', status: 'pending' },
      ]
      break
    }

    case 'duplicate_webhook': {
      events.push(
        ev('Payment captured', `${money(amount)} via ${methodLabel}`, 'blue', now + 500),
        ev('Duplicate event ignored', `A second payment.captured webhook for ${paymentId.slice(0, 10)}… was deduplicated.`, 'slate', now + 800),
        ev('Settlement detected', `net ${money(net)}`, 'blue', now + 1500),
        ev('Bank credit received', `${money(net)} · ref ${bankRef}`, 'blue', now + 3000),
        ev('Transaction reconciled', 'Single charge recorded despite duplicate delivery.', 'green', now + 3200),
      )
      base.reconciliation.reason = 'Reconciled cleanly. A duplicate capture webhook was received and ignored by idempotency.'
      trace = matchedTrace()
      break
    }

    case 'failed_retry': {
      base.payment.status = 'failed_then_captured'
      base.payment.attempts = 2
      events.push(
        ev('Payment failed', `First attempt declined (issuer). No charge made.`, 'red', now + 400),
        ev('Customer retried', 'Second attempt initiated by the customer.', 'slate', now + 900),
        ev('Payment captured', `${money(amount)} via ${methodLabel} on retry`, 'blue', now + 1300),
        ev('Settlement detected', `net ${money(net)}`, 'blue', now + 2200),
        ev('Bank credit received', `${money(net)} · ref ${bankRef}`, 'blue', now + 3400),
        ev('Transaction reconciled', 'One successful charge recorded; the failed attempt carried no money.', 'green', now + 3600),
      )
      base.reconciliation.confidence = 95
      base.reconciliation.reason = 'Reconciled. The first attempt failed with no charge; only the successful retry is counted.'
      trace = matchedTrace()
      break
    }
  }

  base.trace = trace
  base.exceptions = exceptions
  base.events = events.sort((a, b) => b.at - a.at)
  return base
}

// A short human summary line used in the customer success page.
export function trackingSteps(order: Order): { label: string; state: 'done' | 'current' | 'todo'; note: string }[] {
  const steps = [
    { label: 'Order placed', note: clockTime(order.createdAt) },
    { label: 'Payment confirmed', note: order.payment.real ? 'Razorpay (real test)' : order.payment.methodLabel },
    { label: 'Merchant processing', note: 'MoneyTrace is watching this' },
    { label: 'Settlement', note: order.settlement.status === 'settled' ? 'Settled at gateway' : 'Pending' },
    { label: 'Bank credit', note: order.bank.credited ? `${order.bank.bank}` : 'Awaiting bank' },
  ]
  let currentIndex = 2
  if (order.settlement.status === 'settled') currentIndex = 3
  if (order.bank.credited) currentIndex = 5
  return steps.map((s, i) => ({
    ...s,
    state: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo',
  }))
}
