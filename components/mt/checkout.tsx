'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CreditCard, Landmark, Loader2, Lock, ShieldCheck, Smartphone } from 'lucide-react'
import { money, randomId } from '@/lib/format'

type Method = 'card' | 'upi' | 'netbanking'
type Phase = 'creating' | 'method' | 'fill' | 'otp' | 'processing' | 'success' | 'error'

export interface PaymentResult {
  method: Method
  methodLabel: string
  paymentId: string
  orderId: string
  real: boolean
}

const BANKS = ['HDFC', 'ICICI', 'Axis', 'SBI', 'Kotak']

function pickMethod(): Method {
  return (['card', 'upi', 'netbanking'] as Method[])[Math.floor(Math.random() * 3)]
}

function methodLabelFor(method: Method, bank: string) {
  if (method === 'card') return 'HDFC Credit · 4111'
  if (method === 'upi') return 'UPI · success@razorpay'
  return `${bank} Netbanking`
}

const methodMeta: Record<Method, { name: string; icon: typeof CreditCard }> = {
  card: { name: 'Card', icon: CreditCard },
  upi: { name: 'UPI', icon: Smartphone },
  netbanking: { name: 'Netbanking', icon: Landmark },
}

export function Checkout({
  amount,
  productName,
  useReal,
  onComplete,
}: {
  amount: number
  productName: string
  useReal: boolean
  onComplete: (result: PaymentResult) => void
}) {
  const [phase, setPhase] = useState<Phase>('creating')
  const [error, setError] = useState('')
  const [otp, setOtp] = useState('')
  const [typedCard, setTypedCard] = useState('')
  const method = useRef<Method>(pickMethod())
  const bank = useRef<string>(BANKS[Math.floor(Math.random() * BANKS.length)])
  const orderRef = useRef<{ orderId: string; real: boolean }>({ orderId: randomId('order'), real: false })
  const done = useRef(false)
  const fullCard = '4111 1111 1111 1111'
  const label = methodLabelFor(method.current, bank.current)

  const finish = useCallback(
    (paymentId: string, real: boolean) => {
      if (done.current) return
      done.current = true
      onComplete({ method: method.current, methodLabel: label, paymentId, orderId: orderRef.current.orderId, real })
    },
    [label, onComplete],
  )

  // Create a real Razorpay test order server-side (best effort).
  const createOrder = useCallback(async () => {
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Math.round(amount) * 100, receipt: randomId('rcpt', 8) }),
      })
      const data = await res.json()
      if (res.ok && data.orderId) {
        orderRef.current = { orderId: data.orderId, real: true }
        return { ok: true as const, keyId: data.keyId as string, amount: data.amount as number, orderId: data.orderId as string }
      }
      return { ok: false as const, message: data.message as string }
    } catch {
      return { ok: false as const, message: 'Could not reach the payment server.' }
    }
  }, [amount])

  // REAL Razorpay modal flow.
  const openRealModal = useCallback(async () => {
    const created = await createOrder()
    if (!created.ok) {
      setError(created.message || 'Test payment is not configured. Add Razorpay test keys, or use the simulated checkout.')
      setPhase('error')
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => {
      const RZP = (window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void } }).Razorpay
      const rzp = new RZP({
        key: created.keyId,
        amount: created.amount,
        currency: 'INR',
        name: 'Aria Commerce',
        description: productName,
        order_id: created.orderId,
        theme: { color: '#3b5bfd' },
        handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await fetch('/api/payment/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resp) })
          } catch {}
          setPhase('success')
          setTimeout(() => finish(resp.razorpay_payment_id, true), 1100)
        },
        modal: { ondismiss: () => { setError('Payment window closed before completion.'); setPhase('error') } },
      })
      rzp.open()
    }
    script.onerror = () => { setError('Could not load Razorpay checkout.'); setPhase('error') }
    document.body.appendChild(script)
  }, [createOrder, finish, productName])

  // AUTO simulated flow (hands-off, coin animation), backed by a real order id when possible.
  useEffect(() => {
    if (useReal) {
      setPhase('processing')
      openRealModal()
      return
    }
    let cancelled = false
    const timers: number[] = []
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => { if (!cancelled) fn() }, ms))

    setPhase('creating')
    createOrder() // fire and forget; auto flow proceeds regardless
    at(900, () => setPhase('method'))
    at(2000, () => setPhase('fill'))
    at(2200, () => {
      // type out the card number
      if (method.current !== 'card') return
      let i = 0
      const iv = window.setInterval(() => {
        i += 1
        setTypedCard(fullCard.slice(0, i))
        if (i >= fullCard.length) window.clearInterval(iv)
      }, 55)
      timers.push(iv)
    })
    at(method.current === 'card' ? 3600 : 3400, () => {
      if (method.current === 'card') {
        setPhase('otp')
        let o = ''
        const iv = window.setInterval(() => {
          o += String(Math.floor(Math.random() * 10))
          setOtp(o)
          if (o.length >= 4) window.clearInterval(iv)
        }, 260)
        timers.push(iv)
      } else {
        setPhase('processing')
      }
    })
    at(method.current === 'card' ? 5200 : 4600, () => setPhase('processing'))
    at(method.current === 'card' ? 6600 : 6000, () => setPhase('success'))
    at(method.current === 'card' ? 7600 : 7000, () => finish(randomId('pay'), orderRef.current.real))

    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useReal])

  const Meta = methodMeta[method.current]

  if (useReal) {
    return (
      <div className="checkout">
        <div className="checkout-head">
          <span className="rzp-brand"><Lock /> Razorpay</span>
          <strong>{money(amount)}</strong>
        </div>
        <div className="checkout-body real-body">
          {phase !== 'error' && phase !== 'success' && (
            <div className="real-wait"><Loader2 className="spin" /><p>Opening Razorpay’s secure test checkout…</p><small>Complete the test payment in the Razorpay window.</small></div>
          )}
          {phase === 'success' && <SuccessBlock amount={amount} />}
          {phase === 'error' && <div className="checkout-error"><p>{error}</p></div>}
        </div>
      </div>
    )
  }

  return (
    <div className="checkout">
      <div className="checkout-head">
        <span className="rzp-brand"><Lock /> Razorpay <em>test</em></span>
        <strong>{money(amount)}</strong>
      </div>

      <div className="checkout-agentline">
        <span className="live-dot" />
        {phase === 'creating' && 'Agent is opening a secure test order…'}
        {phase === 'method' && `Agent chose ${Meta.name} to pay`}
        {phase === 'fill' && 'Agent is filling your saved test details…'}
        {phase === 'otp' && 'Agent is confirming the one-time password…'}
        {phase === 'processing' && 'Processing the payment…'}
        {phase === 'success' && 'Payment successful'}
      </div>

      <div className="checkout-body">
        <div className="method-rail">
          {(Object.keys(methodMeta) as Method[]).map((m) => {
            const Icon = methodMeta[m].icon
            const active = m === method.current && phase !== 'creating'
            return (
              <div className={`method-chip ${active ? 'active' : ''} ${phase === 'creating' ? 'dim' : ''}`} key={m}>
                <Icon /> {methodMeta[m].name}
                {active && <Check className="method-tick" />}
              </div>
            )
          })}
        </div>

        {phase === 'otp' ? (
          <div className="otp-pane">
            <p>Enter the OTP sent to •••• 8842</p>
            <div className="otp-boxes">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={otp[i] ? 'filled' : ''}>{otp[i] || ''}</span>
              ))}
            </div>
            <small>Test OTP entered automatically</small>
          </div>
        ) : phase === 'processing' || phase === 'success' ? (
          <div className="pay-stage">
            {phase === 'processing' ? (
              <div className="coin-drop">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span className="coin" style={{ animationDelay: `${i * 0.12}s` }} key={i}>₹</span>
                ))}
                <div className="coin-slot"><Loader2 className="spin" /></div>
              </div>
            ) : (
              <SuccessBlock amount={amount} />
            )}
          </div>
        ) : (
          <div className="fill-pane">
            {method.current === 'card' && (
              <>
                <label>Card number</label>
                <div className="fake-input mono">{typedCard || '\u00A0'}<span className="type-caret" /></div>
                <div className="fill-row">
                  <div><label>Expiry</label><div className="fake-input mono">{phase === 'fill' ? '12 / 26' : ''}</div></div>
                  <div><label>CVV</label><div className="fake-input mono">{phase === 'fill' ? '•••' : ''}</div></div>
                </div>
                <div className="test-note">Razorpay test card · no real money moves</div>
              </>
            )}
            {method.current === 'upi' && (
              <>
                <label>UPI ID</label>
                <div className="fake-input mono">{phase === 'fill' ? 'success@razorpay' : ''}<span className="type-caret" /></div>
                <div className="test-note">Test VPA that always succeeds</div>
              </>
            )}
            {method.current === 'netbanking' && (
              <>
                <label>Bank</label>
                <div className="fake-input">{phase === 'fill' ? `${bank.current} Bank` : ''}</div>
                <div className="test-note">Test bank · redirected to a success page</div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="checkout-foot">
        <ShieldCheck /> Secured by Razorpay test mode · {orderRef.current.real ? 'real test order created' : 'offline test order'}
      </div>
    </div>
  )
}

function SuccessBlock({ amount }: { amount: number }) {
  return (
    <div className="pay-success">
      <div className="coin-burst">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="burst-coin" style={{ ['--i' as string]: i }}>₹</span>
        ))}
      </div>
      <div className="success-ring"><Check /></div>
      <strong>{money(amount)} paid</strong>
      <small>Payment captured successfully</small>
    </div>
  )
}
