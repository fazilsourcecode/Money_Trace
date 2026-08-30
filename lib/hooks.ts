'use client'

import { useEffect, useState } from 'react'
import { readOrders, seedIfEmpty, subscribe } from './store'
import type { Order, Role, Session } from './types'

const SESSION_KEY = 'mt_session_v1'

export const demoCreds: Record<Role, { email: string; password: string; name: string }> = {
  customer: { email: 'shopper@aria.store', password: 'shop123', name: 'Aditya Sharma' },
  merchant: { email: 'ops@ariacommerce.in', password: 'merchant123', name: 'Aria Commerce' },
}

export function login(role: Role): Session {
  const cred = demoCreds[role]
  const session: Session = { role, name: cred.name, email: cred.email, at: Date.now() }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  window.dispatchEvent(new CustomEvent('mt:session'))
  return session
}

export function logout() {
  window.localStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new CustomEvent('mt:session'))
}

export function readSession(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

// Returns undefined while resolving (avoids SSR/first-paint flicker), then Session | null.
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    const sync = () => setSession(readSession())
    sync()
    window.addEventListener('mt:session', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('mt:session', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return session
}

export function useOrders(): Order[] {
  const [orders, setOrders] = useState<Order[]>([])
  useEffect(() => {
    seedIfEmpty()
    setOrders(readOrders())
    return subscribe(() => setOrders(readOrders()))
  }, [])
  return orders
}

export function useOrder(idOrRef: string | null): Order | undefined {
  const orders = useOrders()
  if (!idOrRef) return undefined
  return orders.find((o) => o.id === idOrRef || o.ref === idOrRef)
}
