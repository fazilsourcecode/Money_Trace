import crypto from 'node:crypto'
import { NextResponse } from 'next/server'

const seenEvents = new Set<string>()

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('x-razorpay-signature')
  const eventId = request.headers.get('x-razorpay-event-id')
  if (!signature || !process.env.RAZORPAY_WEBHOOK_SECRET) return NextResponse.json({ accepted: false }, { status: 400 })
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return NextResponse.json({ accepted: false }, { status: 401 })
  if (eventId && seenEvents.has(eventId)) return NextResponse.json({ accepted: true, duplicate: true })
  if (eventId) seenEvents.add(eventId)
  const event = JSON.parse(body)
  return NextResponse.json({ accepted: true, duplicate: false, event: event.event })
}
