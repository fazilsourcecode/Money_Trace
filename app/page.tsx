'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Coins, Eye, Route, ShieldCheck, Store } from 'lucide-react'
import { Logo } from '@/components/mt/shared'
import { demoCreds, login, useSession } from '@/lib/hooks'
import type { Role } from '@/lib/types'

export default function LoginPage() {
  const router = useRouter()
  const session = useSession()
  const [role, setRole] = useState<Role>('customer')

  useEffect(() => {
    if (session) router.replace(session.role === 'merchant' ? '/merchant' : '/shop')
  }, [session, router])

  const signIn = () => {
    login(role)
    router.replace(role === 'merchant' ? '/merchant' : '/shop')
  }

  const cred = demoCreds[role]

  return (
    <main className="auth-shell">
      <section className="auth-pitch">
        <Logo variant="trace" />
        <div className="auth-pitch-body">
          <p className="eyebrow"><Route /> Payment intelligence</p>
          <h1>Follow every payment.<br /><em>Explain every discrepancy.</em></h1>
          <p className="auth-copy">
            An agent shops and pays on the Your storefront. MoneyTrace follows that money all the way to the
            bank and shows the merchant exactly what reconciled &mdash; and what didn&rsquo;t.
          </p>
          <div className="auth-points">
            <div><Eye /> Watch the agent search, choose and pay, step by step</div>
            <div><Coins /> Real Razorpay payments with Test Mode</div>
            <div><ShieldCheck /> Every rupee traced from intent to settlement</div>
          </div>
        </div>
        <footer className="auth-foot">MoneyTrace</footer>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-tabs">
            <button className={role === 'customer' ? 'active' : ''} onClick={() => setRole('customer')}>
              <Store /> Shopper
            </button>
            <button className={role === 'merchant' ? 'active' : ''} onClick={() => setRole('merchant')}>
              <Route /> Merchant
            </button>
          </div>

          <h2>{role === 'customer' ? 'Sign in ' : 'Sign in to MoneyTrace'}</h2>
          <p className="auth-sub">
            {role === 'customer'
              ? 'Shop hands-free \u2014 set what you want and let the agent do the rest.'
              : 'Open the financial control center for Aria Commerce.'}
          </p>

          <label className="field-label">Email</label>
          <input className="field" value={cred.email} readOnly />
          <label className="field-label">Password</label>
          <input className="field" value={cred.password} type="password" readOnly />

          <button className="primary-btn full" onClick={signIn}>
            {role === 'customer' ? 'Enter the store' : 'Open the console'} <ArrowRight />
          </button>

          <p className="demo-hint">
            Demo credentials are pre-filled. This is a test environment &mdash; no real accounts, no real money.
          </p>
        </div>
      </section>
    </main>
  )
}
