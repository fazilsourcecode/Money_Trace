import { buildOrder } from './scenarios'
import { getProduct } from './catalog'
import type { Order, ScenarioId } from './types'

export type BatchResult = {
  orders: Order[]
  processed: number
  matched: number
  review: number
  unresolved: number
  matchRate: number
  falseFlagRate: number
  amountAtRisk: number
  cleanOrders: number
}

const plans: { scenario: ScenarioId; product: string; qty: number; name: string }[] = [
  { scenario: 'normal', product: 'nimbus-quiet', qty: 1, name: 'Aarav Mehta' },
  { scenario: 'normal', product: 'pulse-lite', qty: 2, name: 'Ishita Rao' },
  { scenario: 'normal', product: 'volt-air', qty: 1, name: 'Kabir Shah' },
  { scenario: 'delayed_bank', product: 'orbit-watch', qty: 1, name: 'Sneha Iyer' },
  { scenario: 'partial_capture', product: 'boom-360', qty: 2, name: 'Arjun Nair' },
  { scenario: 'duplicate_webhook', product: 'pulse-lite', qty: 1, name: 'Meera Das' },
  { scenario: 'failed_retry', product: 'volt-air', qty: 1, name: 'Karthik R' },
  { scenario: 'refund', product: 'lumen-14', qty: 1, name: 'Divya Pillai' },
]

export function buildEvaluationBatch(size = 120): Order[] {
  return Array.from({ length: size }, (_, i) => {
    const plan = plans[i % plans.length]
    const product = getProduct(plan.product)!
    const amount = product.price * plan.qty
    return buildOrder({
      ref: `EVAL-${String(i + 1).padStart(4, '0')}`,
      customerName: plan.name,
      scenario: plan.scenario,
      product: { name: product.name, brand: product.brand, image: product.image, price: product.price },
      qty: plan.qty,
      amount,
      method: i % 3 === 0 ? 'upi' : i % 3 === 1 ? 'card' : 'netbanking',
      methodLabel: i % 3 === 0 ? 'UPI · success@razor' : i % 3 === 1 ? 'HDFC Credit · 4111' : 'Axis Netbanking',
      real: false,
    })
  })
}

export function evaluateBatch(orders = buildEvaluationBatch()): BatchResult {
  const matched = orders.filter((o) => o.reconciliation.state === 'RECONCILED').length
  const review = orders.filter((o) => o.reconciliation.state !== 'RECONCILED').length
  const cleanOrders = orders.filter((o) => o.scenario === 'normal').length
  const falseFlags = orders.filter((o) => o.scenario === 'normal' && o.reconciliation.state !== 'RECONCILED').length
  return {
    orders,
    processed: orders.length,
    matched,
    review,
    unresolved: orders.filter((o) => o.reconciliation.state === 'EXCEPTION').length,
    matchRate: Math.round((matched / orders.length) * 1000) / 10,
    falseFlagRate: cleanOrders ? Math.round((falseFlags / cleanOrders) * 1000) / 10 : 0,
    amountAtRisk: orders.filter((o) => o.reconciliation.state !== 'RECONCILED').reduce((sum, o) => sum + o.reconciliation.unexplained, 0),
    cleanOrders,
  }
}

export const evaluation = evaluateBatch()

export function assistantAnswer(question: string, result = evaluation) {
  const q = question.toLowerCase()
  if (q.includes('match') || q.includes('rate')) return `The latest synthetic close processed ${result.processed} records. ${result.matched} auto-matched, giving a ${result.matchRate}% match rate. ${result.review} records need review.`
  if (q.includes('largest') || q.includes('risk') || q.includes('unresolved')) return `There is ${result.amountAtRisk ? `₹${result.amountAtRisk.toLocaleString('en-IN')}` : 'no amount'} at risk across ${result.review} review cases. Start with partial captures and delayed bank credits.`
  if (q.includes('refund')) return 'Refund-after-reconcile cases reopen the trace and require human approval before the ledger is closed again.'
  return 'I can explain match rate, amount at risk, refund impact, or the evidence behind the current exception queue.'
}

export const evaluationQuestions = ['Why is today’s match rate lower?', 'What money is at risk?', 'Explain refund impact']
