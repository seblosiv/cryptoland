/**
 * Native wallet purchases — client half.
 * ======================================
 * Pay for a tile with the chain's own token, from the user's own wallet: on
 * Base you send ETH on Base, on Solana you send SOL.
 *
 * The three steps, and who decides what:
 *
 *   1. quoteTile()   the SERVER prices the tile and names the treasury address
 *   2. payNative()   the WALLET signs a transfer of exactly that amount
 *   3. settleTile()  the SERVER reads the chain and writes the tile
 *
 * Nothing here is trusted with money. The amount and the recipient both come
 * from the server's quote, and the server re-derives both from the chain before
 * settling — so a tampered amount in this file fails verification and settles
 * nothing. This file's job is plumbing and honest error messages.
 */
import { req } from './api.js'

/**
 * Can this build take a wallet payment at all?
 *
 * Two independent conditions, and BOTH have to hold:
 *   server — a treasury address, a price feed and a verifier for this family
 *   client — an actual wallet the user can sign with
 *
 * Returns a plain object rather than throwing: "no wallet installed" is a
 * normal state for most visitors, not an error, and the UI just shows the
 * off-chain rail instead.
 */
export async function nativePayAvailability() {
  let server
  try {
    server = await req('GET', '/chain/pay-info')
  } catch (err) {
    return { available: false, reason: err.message, server: null, wallet: false }
  }

  if (!server.enabled) {
    return { available: false, reason: server.reason, server, wallet: false }
  }

  let wallet
  try {
    const bc = await import('./blockchain/index.js')
    wallet = typeof bc.supportsNativePay === 'function' && Boolean(bc.supportsNativePay())
  } catch {
    // A family whose SDK failed to load simply has no wallet path here.
    wallet = false
  }

  return {
    available: wallet,
    reason:    wallet ? '' : `No ${server.chain_name} wallet detected in this browser`,
    server,
    wallet,
  }
}

/** Ask the server what this tile costs in the chain's own token. */
export async function quoteTile({ tx, ty, tileKey, country, color, payer, refCode, sessionId }) {
  return req('POST', '/chain/quote', {
    tx, ty,
    tile_key:   tileKey,
    country:    country ?? 'Unknown',
    color:      color ?? null,
    payer:      payer ?? null,
    ref_code:   refCode ?? null,
    session_id: sessionId ?? null,
  })
}

/**
 * Hand the quote to the wallet and get a transaction hash back.
 *
 * `native_amount` stays a string the entire way down. It is an integer count of
 * the chain's smallest unit, and on an 18-decimal chain that exceeds
 * Number.MAX_SAFE_INTEGER — turning it into a Number anywhere would round the
 * price the user pays.
 */
export async function payQuote(quote, from) {
  const bc = await import('./blockchain/index.js')
  if (typeof bc.payNative !== 'function') {
    throw new Error('This chain does not support wallet payment yet')
  }
  return bc.payNative({ to: quote.treasury, amount: quote.native_amount, from })
}

/**
 * Tell the server the transaction exists, and let it check.
 *
 * Returns { settled: false, pending: true } while the chain is still
 * confirming — that is a 202, not a failure, and the caller should poll.
 */
export async function settleTile({ quoteId, txHash }) {
  const res = await req('POST', '/chain/verify',
    { quote_id: quoteId, tx_hash: txHash },
    { rawResponse: true })

  if (res.status === 202) {
    const body = await res.json()
    return { settled: false, pending: true, ...body }
  }
  return { settled: true, pending: false, block: await res.json() }
}

/**
 * Poll settleTile until the chain confirms.
 *
 * Deliberately patient. The money is already gone from the buyer's wallet by
 * this point, so giving up early would leave them paid-but-tileless; a slow
 * chain must read as "still working", never as "failed". `onProgress` lets the
 * UI show confirmations instead of a spinner that looks stuck.
 */
export async function waitForSettlement({ quoteId, txHash, onProgress, intervalMs = 4000, timeoutMs = 600_000 }) {
  const deadline = Date.now() + timeoutMs
  let attempt = 0

  while (Date.now() < deadline) {
    attempt += 1
    try {
      const result = await settleTile({ quoteId, txHash })
      if (result.settled) return result
      onProgress?.({
        confirmations: result.confirmations ?? 0,
        required:      result.required ?? 0,
        message:       result.message ?? 'Confirming…',
        attempt,
      })
    } catch (err) {
      // A 4xx here is a real verdict (underpaid, wrong recipient, tile taken)
      // and will not improve with waiting. Anything else is likely transport.
      if (err.status && err.status >= 400 && err.status < 500) throw err
      onProgress?.({ message: 'Reconnecting…', attempt })
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }

  throw new Error(
    'Your payment is on-chain but has not confirmed yet. It is safe — reopen ' +
    'this tile shortly and it will finish, or contact support with your transaction hash.',
  )
}
