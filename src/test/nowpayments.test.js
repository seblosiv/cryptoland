/**
 * Tests for src/lib/nowpayments.js
 * Covers: checkStatus, getMinAmount, getEstimate, createPayment,
 *         getPaymentStatus, finalizePayment, helpers.
 */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import {
  MOCK_PAYMENT,
  MOCK_MIN_AMOUNT,
  MOCK_ESTIMATE,
  MOCK_BLOCK,
} from './mocks/handlers'
import {
  checkStatus,
  getMinAmount,
  getEstimate,
  createPayment,
  getPaymentStatus,
  finalizePayment,
  statusLabel,
  STATUS_SUCCESS,
  STATUS_PARTIAL,
  STATUS_FAILED,
} from '../lib/nowpayments'

const BASE = 'http://127.0.0.1:8000'

// ── checkStatus ───────────────────────────────────────────────────────────────

describe('checkStatus', () => {
  it('returns alive message when API is up', async () => {
    const res = await checkStatus()
    expect(res.message).toBe('NOWPayments is alive')
  })

  it('throws when API returns an error', async () => {
    server.use(
      http.get(`${BASE}/np/status`, () =>
        HttpResponse.json({ detail: 'Service unavailable' }, { status: 503 })
      )
    )
    await expect(checkStatus()).rejects.toThrow('Service unavailable')
  })
})

// ── getMinAmount ──────────────────────────────────────────────────────────────

describe('getMinAmount', () => {
  it('returns minimum amount for USDT-TRC20 (primary currency)', async () => {
    const res = await getMinAmount('usdttrc20')
    expect(res.currency_from).toBe('usdttrc20')
    expect(typeof res.min_amount).toBe('number')
    expect(res.min_amount).toBeGreaterThan(11)  // ~$11.11
  })

  it('accepts uppercase currency and lowercases it', async () => {
    server.use(
      http.get(`${BASE}/np/min-amount`, ({ request }) => {
        const url = new URL(request.url)
        const from = url.searchParams.get('currency_from')
        expect(from).toBe('eth')
        return HttpResponse.json({ ...MOCK_MIN_AMOUNT, currency_from: 'eth', min_amount: 0.0001 })
      })
    )
    const res = await getMinAmount('ETH')
    expect(res.currency_from).toBe('eth')
  })

  it('throws on HTTP error from proxy', async () => {
    server.use(
      http.get(`${BASE}/np/min-amount`, () =>
        HttpResponse.json({ detail: 'Invalid currency' }, { status: 400 })
      )
    )
    await expect(getMinAmount('INVALID')).rejects.toThrow('Invalid currency')
  })
})

// ── getEstimate ───────────────────────────────────────────────────────────────

describe('getEstimate', () => {
  it('returns estimated amount for USDT-TRC20 (primary currency)', async () => {
    const res = await getEstimate(13.0, 'usdttrc20')
    expect(res.estimated_amount).toBeDefined()
    expect(parseFloat(res.estimated_amount)).toBeGreaterThan(11)  // should be ~13 USDT
  })

  it('sends correct query params', async () => {
    server.use(
      http.get(`${BASE}/np/estimate`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('amount')).toBe('13')
        expect(url.searchParams.get('currency_from')).toBe('usd')
        expect(url.searchParams.get('currency_to')).toBe('usdttrc20')
        return HttpResponse.json(MOCK_ESTIMATE)
      })
    )
    await getEstimate(13, 'usdttrc20')
  })
})

// ── createPayment ─────────────────────────────────────────────────────────────

describe('createPayment', () => {
  it('returns a payment object with required fields', async () => {
    const res = await createPayment('1024:512', 13.0, 'usdttrc20')
    expect(res.payment_id).toBe('np-test-001')
    expect(res.pay_address).toBeDefined()
    expect(res.pay_amount).toBeDefined()
    expect(res.pay_currency).toBeDefined()
    expect(res.payment_status).toBe('waiting')
  })

  it('sends correct payload to proxy', async () => {
    server.use(
      http.post(`${BASE}/np/payment`, async ({ request }) => {
        const body = await request.json()
        expect(body.tile_key).toBe('500:600')
        expect(body.usd_amount).toBe(14.0)
        expect(body.currency).toBe('usdttrc20')
        return HttpResponse.json(MOCK_PAYMENT)
      })
    )
    await createPayment('500:600', 14.0, 'usdttrc20')
  })

  it('throws when server returns min-amount error', async () => {
    server.use(
      http.post(`${BASE}/np/payment`, () =>
        HttpResponse.json(
          { detail: 'Amount too low: 10.0 USDT is below the minimum of 11.11 USDT.' },
          { status: 400 }
        )
      )
    )
    await expect(createPayment('1024:512', 10.0, 'usdttrc20')).rejects.toThrow(/Amount too low/)
  })

  it('throws when tile is already owned', async () => {
    server.use(
      http.post(`${BASE}/np/payment`, () =>
        HttpResponse.json({ detail: 'Already owned by alice' }, { status: 409 })
      )
    )
    await expect(createPayment('1024:512', 5.0, 'BTC')).rejects.toThrow('Already owned by alice')
  })
})

// ── getPaymentStatus ──────────────────────────────────────────────────────────

describe('getPaymentStatus', () => {
  it('returns payment status for a known payment ID', async () => {
    const res = await getPaymentStatus('np-test-001')
    expect(res.payment_id).toBe('np-test-001')
    expect(res.payment_status).toBeDefined()
  })

  it('transitions through states correctly', async () => {
    const states = ['waiting', 'confirming', 'confirmed', 'finished']
    let callCount = 0

    server.use(
      http.get(`${BASE}/np/payment/:paymentId`, () => {
        const status = states[Math.min(callCount++, states.length - 1)]
        return HttpResponse.json({ ...MOCK_PAYMENT, payment_status: status })
      })
    )

    for (const expected of states) {
      const res = await getPaymentStatus('np-test-001')
      expect(res.payment_status).toBe(expected)
    }
  })

  it('throws on 404 for unknown payment', async () => {
    server.use(
      http.get(`${BASE}/np/payment/:paymentId`, () =>
        HttpResponse.json({ detail: 'Payment not found' }, { status: 404 })
      )
    )
    await expect(getPaymentStatus('bogus-id')).rejects.toThrow('Payment not found')
  })
})

// ── finalizePayment ───────────────────────────────────────────────────────────

describe('finalizePayment', () => {
  it('returns the saved block on success', async () => {
    const res = await finalizePayment({
      paymentId: 'np-test-001',
      tileKey:   '1024:512',
      tx: 1024, ty: 512,
      owner: 'You', color: '#00ff88',
      price: 5.0, country: 'Germany',
    })
    expect(res.tile_key).toBe('1024:512')
    expect(res.owner).toBe('You')
  })

  it('throws 402 if payment not yet confirmed', async () => {
    server.use(
      http.post(`${BASE}/np/finalize`, () =>
        HttpResponse.json(
          { detail: 'Payment not yet completed (status: waiting).' },
          { status: 402 }
        )
      )
    )
    await expect(finalizePayment({
      paymentId: 'np-test-001',
      tileKey: '1024:512', tx: 1024, ty: 512,
      owner: 'You', color: '#00ff88', price: 5.0, country: 'Germany',
    })).rejects.toThrow(/Payment not yet completed/)
  })

  it('throws 409 if tile is owned by someone else', async () => {
    server.use(
      http.post(`${BASE}/np/finalize`, () =>
        HttpResponse.json(
          { detail: 'Block already owned by bob' },
          { status: 409 }
        )
      )
    )
    await expect(finalizePayment({
      paymentId: 'np-test-001',
      tileKey: '1024:512', tx: 1024, ty: 512,
      owner: 'You', color: '#00ff88', price: 5.0, country: 'Germany',
    })).rejects.toThrow('Block already owned by bob')
  })
})

// ── STATUS_SUCCESS / STATUS_FAILED sets ───────────────────────────────────────

describe('STATUS_SUCCESS', () => {
  it('contains expected success statuses', () => {
    expect(STATUS_SUCCESS.has('finished')).toBe(true)
    expect(STATUS_SUCCESS.has('confirmed')).toBe(true)
    expect(STATUS_SUCCESS.has('sending')).toBe(true)
  })

  it('does NOT contain partially_paid (underpaid is not a completed purchase)', () => {
    // partially_paid means the buyer sent less than the invoice; finalizing on
    // it 402s at the server. It must stay non-terminal so a top-up can complete.
    expect(STATUS_SUCCESS.has('partially_paid')).toBe(false)
    expect(STATUS_PARTIAL.has('partially_paid')).toBe(true)
  })

  it('does not contain failure or waiting statuses', () => {
    expect(STATUS_SUCCESS.has('waiting')).toBe(false)
    expect(STATUS_SUCCESS.has('failed')).toBe(false)
    expect(STATUS_SUCCESS.has('expired')).toBe(false)
  })
})

describe('STATUS_FAILED', () => {
  it('contains expected failure statuses', () => {
    expect(STATUS_FAILED.has('failed')).toBe(true)
    expect(STATUS_FAILED.has('expired')).toBe(true)
  })

  it('does not contain success statuses', () => {
    expect(STATUS_FAILED.has('finished')).toBe(false)
    expect(STATUS_FAILED.has('confirmed')).toBe(false)
  })
})

// ── statusLabel ───────────────────────────────────────────────────────────────

describe('statusLabel', () => {
  const expected = {
    waiting:        'Waiting for payment…',
    confirming:     'Confirming on blockchain…',
    confirmed:      'Confirmed — finalizing…',
    sending:        'Sending — finalizing…',
    partially_paid: 'Partial payment received',
    finished:       'Payment complete',
    failed:         'Payment failed',
    expired:        'Payment expired',
  }

  for (const [status, label] of Object.entries(expected)) {
    it(`returns "${label}" for status "${status}"`, () => {
      expect(statusLabel(status)).toBe(label)
    })
  }

  it('returns the raw status string for unknown statuses', () => {
    expect(statusLabel('unknown_status')).toBe('unknown_status')
  })
})
