/**
 * NOWPayments client — all calls go through our FastAPI proxy at /np/*
 * so the NOWPayments API key never leaves the server.
 *
 * Payment status lifecycle (NOWPayments):
 *   waiting → confirming → confirmed → sending → partially_paid → finished
 *   failed | expired  (terminal failures)
 */

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function req(method, path, body, params) {
  let url = `${BASE}${path}`
  if (params) {
    const qs = new URLSearchParams(params).toString()
    url = `${url}?${qs}`
  }
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * Check NOWPayments API availability.
 * Returns { message: 'NOWPayments is alive' } when up.
 */
export async function checkStatus() {
  return req('GET', '/np/status')
}

/**
 * Get minimum payment amount for a currency pair.
 * @param {string} currencyFrom  e.g. 'btc'
 * @param {string} currencyTo    default 'usd'
 * @returns {{ currency_from, currency_to, min_amount, fiat_equivalent }}
 */
export async function getMinAmount(currencyFrom, currencyTo = 'usd') {
  return req('GET', '/np/min-amount', null, {
    currency_from: currencyFrom.toLowerCase(),
    currency_to:   currencyTo.toLowerCase(),
  })
}

/**
 * Get an estimated crypto amount for a given USD price.
 * @param {number} usdAmount
 * @param {string} cryptoCurrency  e.g. 'btc'
 * @returns {{ currency_from, currency_to, estimated_amount }}
 */
export async function getEstimate(usdAmount, cryptoCurrency) {
  return req('GET', '/np/estimate', null, {
    amount:        usdAmount,
    currency_from: 'usd',
    currency_to:   cryptoCurrency.toLowerCase(),
  })
}

/**
 * Create a NOWPayments payment for a tile.
 * Server-side validates min amount before calling NOWPayments.
 *
 * @param {string} tileKey    e.g. '1024:512'
 * @param {number} usdAmount  tile price in USD
 * @param {string} currency   e.g. 'BTC'
 * @returns NOWPayments payment object:
 *   { payment_id, pay_address, pay_amount, pay_currency,
 *     price_amount, price_currency, payment_status,
 *     expiration_estimate_date, ... }
 */
export async function createPayment(tileKey, usdAmount, currency, owner = null, chain = 'polygon', refCode = null, sessionId = null) {
  return req('POST', '/np/payment', {
    tile_key:   tileKey,
    usd_amount: usdAmount,
    currency:   currency.toLowerCase(),
    ...(owner      ? { owner }                    : {}),
    ...(chain      ? { chain }                    : {}),
    ...(refCode    ? { ref_code:    refCode }      : {}),
    ...(sessionId  ? { session_id: sessionId }    : {}),
  })
}

/**
 * Poll current status of a payment.
 * @param {string} paymentId
 * @returns NOWPayments payment status object
 */
export async function getPaymentStatus(paymentId) {
  return req('GET', `/np/payment/${paymentId}`)
}

/**
 * Finalize a confirmed payment — verifies with NOWPayments then writes block to DB.
 * @param {object} opts
 */
export async function finalizePayment({ paymentId, tileKey, tx, ty, owner, color, price, country, chain = 'polygon', refCode = null, sessionId = null, purchaseEmail = null, userId = null }) {
  return req('POST', '/np/finalize', {
    payment_id: paymentId,
    tile_key:   tileKey,
    tx, ty, owner, color, price, country, chain,
    ...(refCode        ? { ref_code:       refCode        } : {}),
    ...(sessionId      ? { session_id:     sessionId      } : {}),
    ...(purchaseEmail  ? { purchase_email: purchaseEmail  } : {}),
    ...(userId         ? { user_id:        userId         } : {}),
  })
}

/**
 * Terminal "success" statuses — payment is done, block can be finalized.
 * NOTE: 'partially_paid' is deliberately NOT here. It means the buyer sent
 * LESS than the invoice; finalizing on it produced a 402 because the server
 * compares the (crypto-denominated) paid amount against the USD price. We keep
 * polling on partial payments so a top-up can still complete the purchase.
 */
export const STATUS_SUCCESS = new Set(['finished', 'confirmed', 'sending'])

/**
 * Non-terminal "underpaid" status — invoice not fully covered yet. We surface
 * this to the user and keep polling instead of dead-ending the flow.
 */
export const STATUS_PARTIAL = new Set(['partially_paid'])

/**
 * Terminal "failure" statuses — payment failed or expired.
 */
export const STATUS_FAILED = new Set(['failed', 'expired'])

/**
 * Human-readable label for a payment status.
 */
export function statusLabel(status) {
  const labels = {
    waiting:        'Waiting for payment…',
    confirming:     'Confirming on blockchain…',
    confirmed:      'Confirmed — finalizing…',
    sending:        'Sending — finalizing…',
    partially_paid: 'Partial payment received',
    finished:       'Payment complete',
    failed:         'Payment failed',
    expired:        'Payment expired',
  }
  return labels[status] ?? status
}
