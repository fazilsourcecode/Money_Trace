import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { amount, receipt } = await request.json()
  if (!Number.isInteger(amount) || amount <= 0 || amount > 50000000) return NextResponse.json({ message: 'Invalid payment amount.' }, { status: 400 })
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) return NextResponse.json({ message: 'Test payment is not configured yet.' }, { status: 503 })
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  const response = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, currency: 'INR', receipt: String(receipt).slice(0, 40), notes: { source: 'moneytrace-customer' } }) })
  const data = await response.json()
  if (!response.ok) return NextResponse.json({ message: 'Razorpay could not create the test order.' }, { status: response.status })
  return NextResponse.json({ orderId: data.id, amount: data.amount, currency: data.currency, keyId })
}
