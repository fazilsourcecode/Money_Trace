import { catalog } from './catalog'
import { money } from './format'
import type { Check, Evaluation, Product, Requirements } from './types'

const FEATURE_WORDS: Record<string, string[]> = {
  anc: ['anc', 'noise cancel', 'noise-cancel', 'noise cancelling', 'noise canceling'],
  wireless: ['wireless', 'bluetooth'],
  multipoint: ['multipoint', 'two devices'],
}

// Turn a free-text request into structured requirements.
export function parseRequirements(query: string): Requirements {
  const q = query.toLowerCase()

  // budget: "under 10,000", "below ₹8000", "budget 10k"
  let maxPrice = 10000
  const priceMatch = q.match(/(?:under|below|less than|budget|upto|up to|within)\s*₹?\s*([\d,]+)\s*(k)?/)
  if (priceMatch) {
    let n = Number(priceMatch[1].replace(/,/g, ''))
    if (priceMatch[2] === 'k') n *= 1000
    if (n > 0) maxPrice = n
  } else {
    const kMatch = q.match(/₹?\s*([\d,]+)\s*k\b/)
    if (kMatch) maxPrice = Number(kMatch[1].replace(/,/g, '')) * 1000
  }

  // rating: "above 4", "rating 4+", "4 stars"
  let minRating = 4
  const ratingMatch = q.match(/(?:rating|rated|stars?)[^\d]*([\d.]+)|above\s*([\d.]+)|([\d.]+)\s*\+?\s*stars?/)
  if (ratingMatch) {
    const val = Number(ratingMatch[1] || ratingMatch[2] || ratingMatch[3])
    if (val >= 1 && val <= 5) minRating = val
  }

  // delivery: "within 3 days", "2-day"
  let maxDeliveryDays = 3
  const dayMatch = q.match(/(?:within|in|under)\s*(\d+)\s*day|(\d+)\s*[- ]?day/)
  if (dayMatch) {
    const val = Number(dayMatch[1] || dayMatch[2])
    if (val > 0) maxDeliveryDays = val
  }

  const requiredFeatures: string[] = []
  for (const [feature, words] of Object.entries(FEATURE_WORDS)) {
    if (words.some((w) => q.includes(w))) requiredFeatures.push(feature)
  }

  // category resolution — default to audio for the demo brief
  let category = 'audio'
  if (q.includes('laptop') || q.includes('notebook')) category = 'laptops'
  else if (q.includes('watch') || q.includes('band') || q.includes('fitness')) category = 'wearables'

  return { category, maxPrice, minRating, maxDeliveryDays, requiredFeatures, query }
}

export function requirementsFromControls(controls: {
  maxPrice: number
  minRating: number
  maxDeliveryDays: number
  requiredFeatures: string[]
}): Requirements {
  return {
    category: 'audio',
    query: `Wireless headphones under ${money(controls.maxPrice)}, rating ≥ ${controls.minRating}, delivered within ${controls.maxDeliveryDays} days${controls.requiredFeatures.includes('anc') ? ', ANC required' : ''}.`,
    ...controls,
  }
}

function buildChecks(p: Product, req: Requirements): Check[] {
  const checks: Check[] = []
  checks.push(
    p.price <= req.maxPrice
      ? { label: 'Budget', pass: true, detail: `${money(req.maxPrice - p.price)} under your limit` }
      : { label: 'Budget', pass: false, detail: `${money(p.price - req.maxPrice)} over your ${money(req.maxPrice)} budget` },
  )
  checks.push(
    p.rating >= req.minRating
      ? { label: 'Rating', pass: true, detail: `${p.rating}★ from ${p.ratingCount.toLocaleString('en-IN')} buyers` }
      : { label: 'Rating', pass: false, detail: `${p.rating}★ is below your ${req.minRating}★ minimum` },
  )
  checks.push(
    p.deliveryDays <= req.maxDeliveryDays
      ? { label: 'Delivery', pass: true, detail: `Arrives in ${p.deliveryDays} day${p.deliveryDays > 1 ? 's' : ''}` }
      : { label: 'Delivery', pass: false, detail: `${p.deliveryDays} days — misses your ${req.maxDeliveryDays}-day window` },
  )
  for (const f of req.requiredFeatures) {
    const has = p.features.includes(f)
    checks.push(
      has
        ? { label: f.toUpperCase(), pass: true, detail: `Includes ${f.toUpperCase()}` }
        : { label: f.toUpperCase(), pass: false, detail: `No ${f.toUpperCase()} on this model` },
    )
  }
  return checks
}

// score higher = better fit. Only meaningful for products that pass hard checks.
function score(p: Product, req: Requirements) {
  const ratingScore = (p.rating - req.minRating) * 20
  const priceScore = ((req.maxPrice - p.price) / req.maxPrice) * 25
  const deliveryScore = (req.maxDeliveryDays - p.deliveryDays) * 6
  const featureScore = req.requiredFeatures.filter((f) => p.features.includes(f)).length * 8
  const popularity = Math.min(10, p.ratingCount / 500)
  return ratingScore + priceScore + deliveryScore + featureScore + popularity
}

export function evaluate(req: Requirements): Evaluation[] {
  const pool = catalog.filter((p) => p.category === req.category)
  const scored = pool.map((p) => {
    const checks = buildChecks(p, req)
    const passed = checks.every((c) => c.pass)
    return { product: p, checks, passed, score: passed ? score(p, req) : -1 }
  })

  // best first among passers, then failers by how close they were
  scored.sort((a, b) => {
    if (a.passed && b.passed) return b.score - a.score
    if (a.passed) return -1
    if (b.passed) return 1
    return b.product.rating - a.product.rating
  })

  return scored.map((s, i) => {
    let reason: string
    if (i === 0 && s.passed) {
      reason = `Best overall fit: meets every requirement with ${money(req.maxPrice - s.product.price)} to spare and a ${s.product.rating}★ track record.`
    } else if (s.passed) {
      const winner = scored[0].product
      const bits: string[] = []
      if (s.product.rating < winner.rating) bits.push(`rated lower (${s.product.rating}★ vs ${winner.rating}★)`)
      if (s.product.price > winner.price) bits.push(`costs ${money(s.product.price - winner.price)} more`)
      if (s.product.deliveryDays > winner.deliveryDays) bits.push('slower delivery')
      reason = `Qualifies, but ${bits.length ? bits.join(', ') : 'edged out on overall fit'}.`
    } else {
      const failed = s.checks.find((c) => !c.pass)
      reason = failed ? `Ruled out — ${failed.detail.toLowerCase()}.` : 'Ruled out on requirements.'
    }
    return { ...s, reason, rank: i } as Evaluation
  })
}

// The visible reasoning steps the agent narrates.
export function agentSteps(req: Requirements): string[] {
  const steps = [
    'Reading your request',
    'Extracting requirements',
    `Searching Aria catalogue · ${req.category}`,
    'Pulling live product signals',
    `Checking budget ≤ ${money(req.maxPrice)}`,
    `Checking rating ≥ ${req.minRating}★`,
    `Checking delivery ≤ ${req.maxDeliveryDays} days`,
  ]
  if (req.requiredFeatures.length) steps.push(`Checking required features · ${req.requiredFeatures.map((f) => f.toUpperCase()).join(', ')}`)
  steps.push('Ranking candidates by fit', 'Selecting best match')
  return steps
}
