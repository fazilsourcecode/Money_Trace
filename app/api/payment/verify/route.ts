import crypto from 'node:crypto'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json()
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !process.env.RAZORPAY_KEY_SECRET) return NextResponse.json({ verified: false }, { status: 400 })
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')
  const verified = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(razorpay_signature)))
  return NextResponse.json({ verified }, { status: verified ? 200 : 400 })
}
