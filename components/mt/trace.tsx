'use client'

import { Check, CircleAlert, Clock3, Coins } from 'lucide-react'
import { money } from '@/lib/format'
import type { TraceNode } from '@/lib/types'

function NodeIcon({ status }: { status: TraceNode['status'] }) {
  if (status === 'matched') return <Check />
  if (status === 'pending') return <Clock3 />
  if (status === 'flagged') return <CircleAlert />
  return <Coins />
}

export function MoneyRail({ trace, animate = true }: { trace: TraceNode[]; animate?: boolean }) {
  return (
    <div className="rail">
      <div className="rail-line">
        {animate && <span className="rail-coin" aria-hidden />}
      </div>
      <div className="rail-nodes">
        {trace.map((node, i) => (
          <div className={`rail-node node-${node.status}`} key={node.key}>
            <div className="rail-badge"><NodeIcon status={node.status} /></div>
            <span className="rail-label">{node.label}</span>
            <strong className="rail-amount">{node.amount === null ? '—' : money(node.amount)}</strong>
            <small className="rail-sub">{node.sub}</small>
            {i < trace.length - 1 && <span className="rail-connector" aria-hidden />}
          </div>
        ))}
      </div>
    </div>
  )
}
