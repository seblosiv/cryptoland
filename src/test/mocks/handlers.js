import { http, HttpResponse } from 'msw'

const BASE = 'http://127.0.0.1:8000'

// ── Shared mock data ──────────────────────────────────────────────────────────

export const MOCK_PAYMENT = {
  payment_id:                 'np-test-001',
  payment_status:             'waiting',
  pay_address:                'TN9RRaXkCFtTXRso2GR9oM3vA1GHMJhkQs',
  pay_amount:                 '13.0',
  pay_currency:               'usdttrc20',  // NP ticker — primary currency
  price_amount:               13.0,
  price_currency:             'usd',
  expiration_estimate_date:   new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  order_id:                   '1024:512',
  order_description:          'CryptoLand tile 1024:512',
}

export const MOCK_MIN_AMOUNT = {
  currency_from:   'usdttrc20',
  currency_to:     'usd',
  min_amount:      11.112488,
  fiat_equivalent: 11.11,
}

export const MOCK_ESTIMATE = {
  currency_from:    'usd',
  currency_to:      'usdttrc20',
  estimated_amount: '13.0',
}

export const MOCK_BLOCK = {
  tile_key:     '1024:512',
  tx:           1024,
  ty:           512,
  owner:        'You',
  color:        '#00ff88',
  price:        13.0,
  country:      'Germany',
  purchased_at: Date.now(),
  image_url:    null,
  label:        null,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export const handlers = [
  // NOWPayments proxy — status
  http.get(`${BASE}/np/status`, () =>
    HttpResponse.json({ message: 'NOWPayments is alive' })
  ),

  // NOWPayments proxy — min-amount
  http.get(`${BASE}/np/min-amount`, () =>
    HttpResponse.json(MOCK_MIN_AMOUNT)
  ),

  // NOWPayments proxy — estimate
  http.get(`${BASE}/np/estimate`, () =>
    HttpResponse.json(MOCK_ESTIMATE)
  ),

  // NOWPayments proxy — create payment
  http.post(`${BASE}/np/payment`, () =>
    HttpResponse.json(MOCK_PAYMENT)
  ),

  // NOWPayments proxy — poll payment (default: waiting)
  http.get(`${BASE}/np/payment/:paymentId`, ({ params }) =>
    HttpResponse.json({ ...MOCK_PAYMENT, payment_id: params.paymentId })
  ),

  // NOWPayments proxy — finalize
  http.post(`${BASE}/np/finalize`, () =>
    HttpResponse.json(MOCK_BLOCK)
  ),

  // Backend — blocks
  http.get(`${BASE}/blocks`, () =>
    HttpResponse.json([MOCK_BLOCK])
  ),

  // Backend — stats
  http.get(`${BASE}/stats`, () =>
    HttpResponse.json({ sold: 1, volume: 13.0, owners: 1 })
  ),
]
