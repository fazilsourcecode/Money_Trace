// Shared domain types for MoneyTrace.

export type Role = 'customer' | 'merchant'

export interface Session {
  role: Role
  name: string
  email: string
  at: number
}

export interface Product {
  id: string
  name: string
  brand: string
  category: string
  price: number
  rating: number
  ratingCount: number
  deliveryDays: number
  image: string
  features: string[]
  blurb: string
}

export interface Requirements {
  category: string
  maxPrice: number
  minRating: number
  maxDeliveryDays: number
  requiredFeatures: string[]
  query: string
}

export interface Check {
  label: string
  pass: boolean
  detail: string
}

export interface Evaluation {
  product: Product
  passed: boolean
  score: number
  checks: Check[]
  reason: string // why chosen / why not chosen
  rank: number
}

export type ReconState =
  | 'RECONCILED'
  | 'AWAITING_BANK'
  | 'NEEDS_REVIEW'
  | 'RECONCILIATION_REOPENED'
  | 'EXCEPTION'

export type Tone = 'green' | 'amber' | 'blue' | 'red' | 'slate'

export interface TraceNode {
  key: string
  label: string
  amount: number | null
  sub: string
  status: 'matched' | 'pending' | 'flagged' | 'info'
}

export interface AuditEvent {
  id: string
  title: string
  detail: string
  at: number
  tone: Tone
}

export interface ExceptionItem {
  title: string
  detail: string
  amount: number
  confidence: number
  priority: 'HIGH' | 'MONITOR' | 'HUMAN'
}

export interface Order {
  id: string // internal id
  ref: string // MT-YYMMDD-NNNNN shown to humans
  createdAt: number
  customerName: string
  scenario: ScenarioId
  product: {
    name: string
    brand: string
    image: string
    price: number
  }
  qty: number
  amount: number // total charged to customer
  payment: {
    method: 'card' | 'upi' | 'netbanking'
    methodLabel: string
    paymentId: string
    orderId: string // razorpay order id (real when configured)
    status: 'captured' | 'failed_then_captured'
    capturedAmount: number
    real: boolean // paid through the real Razorpay modal
    attempts: number
  }
  settlement: {
    id: string
    gross: number
    fee: number
    net: number
    status: 'settled' | 'pending'
  }
  bank: {
    credited: boolean
    amount: number
    ref: string
    bank: string
    at: number | null
  }
  refund?: {
    amount: number
    at: number
  }
  reconciliation: {
    state: ReconState
    confidence: number
    reason: string
    unexplained: number
  }
  trace: TraceNode[]
  exceptions: ExceptionItem[]
  events: AuditEvent[]
  customerTracking: string // current customer-facing status label
}

export type ScenarioId =
  | 'normal'
  | 'refund'
  | 'partial_capture'
  | 'delayed_bank'
  | 'duplicate_webhook'
  | 'failed_retry'

export interface ScenarioDef {
  id: ScenarioId
  label: string
  tag: string
  blurb: string
}
