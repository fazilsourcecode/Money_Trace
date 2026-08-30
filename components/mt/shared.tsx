import type { ReconState, Tone } from '@/lib/types'

export function Logo({ variant = 'store', sub }: { variant?: 'store' | 'trace'; sub?: string }) {
  if (variant === 'trace') {
    return (
      <div className="brand brand-trace">
        <span className="brand-mark"><span /></span>
        <span className="brand-name">MoneyTrace{sub && <small>{sub}</small>}</span>
      </div>
    )
  }
  return (
    <div className="brand brand-store">
      <span className="store-mark">a</span>
      <span className="brand-name">aria<b>.store</b></span>
    </div>
  )
}

export function stateLabel(state: ReconState) {
  return state.replace(/_/g, ' ')
}

export function stateTone(state: ReconState): Tone {
  switch (state) {
    case 'RECONCILED':
      return 'green'
    case 'AWAITING_BANK':
      return 'blue'
    case 'NEEDS_REVIEW':
    case 'RECONCILIATION_REOPENED':
      return 'amber'
    case 'EXCEPTION':
      return 'red'
    default:
      return 'slate'
  }
}

export function Badge({ tone = 'green', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  )
}
