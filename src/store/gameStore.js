import { create } from 'zustand'
import { PURCHASE_ZOOM, GRID_N, TOTAL_TILES, tileKey, tileBasePrice } from '../lib/tiles'
import { ACTIVE_CHAIN_CANONICAL } from '../lib/blockchain/config.js'
import { api } from '../lib/api'
import { analytics } from '../lib/analytics'
import {
  createPayment,
  getPaymentStatus,
  finalizePayment,
  STATUS_SUCCESS,
  STATUS_PARTIAL,
  STATUS_FAILED,
} from '../lib/nowpayments'

export { PURCHASE_ZOOM, GRID_N, TOTAL_TILES }

// Persist my-blocks list in localStorage so it survives page reloads
function loadMyBlocks() {
  try { return new Set(JSON.parse(localStorage.getItem('cl-my-blocks') || '[]')) }
  catch { return new Set() }
}
function saveMyBlocks(set) {
  localStorage.setItem('cl-my-blocks', JSON.stringify([...set]))
}

// Convert a DB row → in-memory block object
function rowToBlock(row) {
  return {
    key:         row.tile_key,
    tx:          row.tx,
    ty:          row.ty,
    owner:       row.owner,
    color:       row.color,
    price:       String(row.price),
    country:     row.country,
    chain:       row.chain ?? 'polygon',
    purchasedAt: row.purchased_at,
    imageUrl:    row.image_url ?? null,
    label:       row.label ?? null,
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useGameStore = create((set, get) => ({
  // ── Map state ──
  mapReady: false,
  zoom:     4,

  // ── Block data ──
  blocks:  new Map(),
  loading: true,
  dbError: null,

  // ── Selection ──
  hoveredKey:   null,
  selectedKey:  null,

  // ── My blocks (locally tracked) ──
  myBlocks: loadMyBlocks(),

  // ── Customize modal ──
  customizeModal: false,
  customizeKey:   null,

  // ── Purchase flow ──
  purchaseModal:    false,
  purchaseStep:     'select',   // select | loading | payment | confirming | confirmed | error
  selectedCurrency: 'usdttrc20',
  paymentData:      null,       // { paymentId, address, amount, currency, usdAmount, expiresAt, status, guestAccount? }
  paymentTimeLeft:  1800,
  purchasingKey:    null,
  purchasingPrice:  null,       // exact USD price shown to the user for the tile being purchased
  purchaseError:    null,
  purchaseEmail:    null,       // optional email entered during purchase (for guest account creation)
  _pollTimer:       null,       // internal polling interval ref

  // ── Server stats ──
  stats: { sold: 0, volume: 0, owners: 0 },

  // ── Actions ───────────────────────────────────────────────────────────────

  setMapReady: (v) => set({ mapReady: v }),
  setZoom:     (z) => set({ zoom: z }),
  setHoveredKey:  (k) => set({ hoveredKey: k }),
  setSelectedKey: (k) => set({ selectedKey: k }),
  clearSelected:  ()  => set({ selectedKey: null }),

  openCustomizeModal: (key) => set({ customizeModal: true, customizeKey: key }),
  closeCustomizeModal: () => set({ customizeModal: false, customizeKey: null }),

  customizeBlock: async (tileKey, imageUrl, label) => {
    const saved = await api.customizeBlock(tileKey, { image_url: imageUrl || null, label: label || null })
    const newBlocks = new Map(get().blocks)
    newBlocks.set(tileKey, { ...newBlocks.get(tileKey), imageUrl: saved.image_url, label: saved.label })
    set({ blocks: newBlocks })
    return saved
  },

  loadBlocksFromServer: async () => {
    set({ loading: true, dbError: null })
    try {
      const [rows, stats] = await Promise.all([api.fetchBlocks(), api.fetchStats()])
      const map = new Map()
      for (const row of rows) {
        const b = rowToBlock(row)
        map.set(b.key, b)
      }
      set({ blocks: map, stats, loading: false })
      console.log(`[Store] Loaded ${map.size} blocks from DB`)
    } catch (err) {
      console.error('[Store] Failed to load blocks:', err)
      set({ loading: false, dbError: err.message })
    }
  },

  openPurchaseModal: (shownPrice = null) => {
    const { selectedKey } = get()
    if (!selectedKey) return
    // Capture the price the user actually saw on the panel so the payment
    // charges that exact amount. The server independently validates it at
    // finalize (it uses its own stored expected price), so this is only about
    // keeping the displayed number and the charged number identical.
    const shown = Number.isFinite(shownPrice) ? Number(shownPrice) : null
    set({
      purchaseModal: true,
      purchaseStep: 'select',
      purchasingKey: selectedKey,
      purchasingPrice: shown,
      purchaseError: null,
      paymentData: null,
      purchaseEmail: null,
    })
    analytics.purchaseOpen(selectedKey)
  },

  closePurchaseModal: () => {
    // Stop polling when modal closes
    const { _pollTimer } = get()
    if (_pollTimer) { clearInterval(_pollTimer); }
    set({
      purchaseModal: false,
      purchaseStep: 'select',
      paymentData: null,
      purchaseError: null,
      purchaseEmail: null,
      _pollTimer: null,
    })
  },

  setSelectedCurrency: (c) => set({ selectedCurrency: c }),
  setPurchaseEmail: (email) => set({ purchaseEmail: email }),

  tickPaymentTimer: () => set(s => ({ paymentTimeLeft: Math.max(0, s.paymentTimeLeft - 1) })),

  /**
   * Start a real NOWPayments payment:
   * 1. Set step → 'loading' while we call the API
   * 2. POST /np/payment — server checks min amount, creates payment
   * 3. Store real address + amount from NOWPayments
   * 4. Begin polling payment status every 10s
   */
  startPayment: async () => {
    const { blocks, purchasingKey, selectedCurrency } = get()
    if (!purchasingKey) return

    const [tx, ty] = purchasingKey.split(':').map(Number)
    const existing  = blocks.get(purchasingKey)
    const { purchasingPrice } = get()
    // Prefer the exact price shown on the panel (dynamic/scarcity-adjusted),
    // falling back to any existing block price, then the base price. The server
    // re-derives and enforces the real amount at finalize regardless.
    const usdAmount = parseFloat(
      purchasingPrice ?? existing?.price ?? tileBasePrice(tx, ty)
    )

    set({ purchaseStep: 'loading', purchaseError: null })
    analytics.paymentStart(purchasingKey, selectedCurrency)

    try {
      const { useWalletStore: _ws } = await import('./walletStore.js')
      const _walletState = _ws.getState()
      const { useAffiliateStore: _as } = await import('./affiliateStore.js')
      const _affState = _as.getState()

      const payment = await createPayment(
        purchasingKey, usdAmount, selectedCurrency,
        _walletState.address ?? null,
        ACTIVE_CHAIN_CANONICAL,
        _affState.landingRef  ?? null,
        _affState.sessionId   ?? null,
      )

      // NOWPayments returns pay_amount / pay_currency / pay_address
      const paymentData = {
        paymentId:  String(payment.payment_id),
        // Bind this payment to the exact tile + price it was created for. A late
        // poll tick must finalize THIS tile, never whatever tile the user has
        // since selected (cross-tile finalize race).
        tileKey:    purchasingKey,
        tilePrice:  usdAmount,
        address:    payment.pay_address,
        amount:     String(payment.pay_amount),
        currency:   (payment.pay_currency ?? selectedCurrency).toUpperCase(),
        usdAmount:  String(usdAmount),
        status:     payment.payment_status ?? 'waiting',
        expiresAt:  payment.expiration_estimate_date ?? null,
      }

      // Calculate countdown from expiration_estimate_date if available
      let timeLeft = 1800
      if (payment.expiration_estimate_date) {
        const expiresMs = new Date(payment.expiration_estimate_date).getTime()
        timeLeft = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000))
      }

      set({ purchaseStep: 'payment', paymentData, paymentTimeLeft: timeLeft })
      console.log(`[Store] Payment created: ${paymentData.paymentId} → ${paymentData.amount} ${paymentData.currency}`)

      // Begin polling payment status every 10 seconds
      get()._startPolling(paymentData.paymentId)

    } catch (err) {
      console.error('[Store] createPayment failed:', err)
      set({ purchaseStep: 'error', purchaseError: err.message })
    }
  },

  /**
   * Begin polling NOWPayments for payment status updates.
   * Automatically advances step when status reaches a terminal state.
   */
  _startPolling: (paymentId) => {
    const { _pollTimer } = get()
    if (_pollTimer) clearInterval(_pollTimer)

    const timer = setInterval(async () => {
      try {
        const data = await getPaymentStatus(paymentId)
        const status = data.payment_status

        set(s => ({
          paymentData: s.paymentData ? { ...s.paymentData, status } : s.paymentData
        }))

        if (STATUS_SUCCESS.has(status)) {
          clearInterval(timer)
          set({ _pollTimer: null })
          await get()._finalizeBlock(paymentId)

        } else if (STATUS_PARTIAL.has(status)) {
          // Underpaid — do NOT finalize (server would 402). Keep polling so a
          // top-up can still complete the invoice; surface the state to the UI.
          set(s => ({
            purchaseError: 'Underpaid — send the remaining amount to complete your purchase.',
            paymentData: s.paymentData ? { ...s.paymentData, status } : s.paymentData,
          }))

        } else if (STATUS_FAILED.has(status)) {
          clearInterval(timer)
          set({
            _pollTimer:    null,
            purchaseStep:  'error',
            purchaseError: status === 'expired' ? 'Payment expired — please try again.' : 'Payment failed on blockchain.',
          })
        }
      } catch (err) {
        // Network hiccup — keep polling, don't fail
        console.warn('[Store] Poll error (will retry):', err.message)
      }
    }, 10_000)

    set({ _pollTimer: timer })
  },

  /**
   * Finalize a confirmed payment: verify with server, persist block to DB, then mint NFT.
   * NFT minting is attempted non-blocking — payment success is not gated on it.
   */
  _finalizeBlock: async (paymentId) => {
    const { blocks, selectedCurrency, paymentData, purchaseEmail } = get()
    // Finalize the tile this payment was created for — NOT the currently
    // selected/purchasing tile, which may have changed since the timer started.
    const tileKey = paymentData?.tileKey ?? get().purchasingKey
    if (!tileKey) return

    set({ purchaseStep: 'confirming', purchaseError: null })

    const [tx, ty] = tileKey.split(':').map(Number)
    const existing = blocks.get(tileKey)
    const price    = parseFloat(paymentData?.tilePrice ?? existing?.price ?? tileBasePrice(tx, ty))
    const country  = existing?.country ?? 'Your Territory'

    try {
      // Determine owner: wallet address if connected, else legacy 'You'
      const { useWalletStore } = await import('./walletStore.js')
      const walletState = useWalletStore.getState()
      const owner = walletState.address ?? 'You'

      // Pull referral context from affiliateStore (session + landing ref code)
      const { useAffiliateStore } = await import('./affiliateStore.js')
      const affState = useAffiliateStore.getState()

      // Pull user_id from authStore if logged in
      const { useAuthStore } = await import('./authStore.js')
      const authState = useAuthStore.getState()

      const serverResp = await finalizePayment({
        paymentId,
        tileKey,
        tx, ty,
        owner,
        color:         '#00ff88',
        price,
        country,
        chain:         ACTIVE_CHAIN_CANONICAL,
        refCode:       affState.landingRef  ?? null,
        sessionId:     affState.sessionId   ?? null,
        purchaseEmail: purchaseEmail ?? null,
        userId:        authState.user?.user_id ?? null,
      })

      // serverResp is { block: {...}, guest_account?: {...} }
      const saved = serverResp.block ?? serverResp

      const newBlock  = rowToBlock(saved)
      const newBlocks = new Map(get().blocks)
      newBlocks.set(tileKey, newBlock)

      const stats = await api.fetchStats().catch(() => get().stats)

      // Persist to my-blocks
      const myBlocks = new Set(get().myBlocks)
      myBlocks.add(tileKey)
      saveMyBlocks(myBlocks)

      // Merge guest_account into paymentData so Confirmed can offer "Secure Account"
      const updatedPaymentData = paymentData
        ? { ...paymentData, guestAccount: serverResp.guest_account ?? null }
        : { guestAccount: serverResp.guest_account ?? null }

      set({ purchaseStep: 'confirmed', blocks: newBlocks, stats, myBlocks, paymentData: updatedPaymentData })
      // Conversion event — the bottom of the funnel grant applications cite.
      analytics.paymentConfirmed(tileKey, price)
      console.log(`[Store] ✓ Block ${tileKey} finalized and map updated`)

      // Refresh user account tiles (non-blocking)
      if (walletState.address) {
        import('./userStore.js').then(({ useUserStore }) => {
          useUserStore.getState().refreshTiles(walletState.address)
        }).catch(() => {})
      }

      // ── NFT mint (non-blocking, best-effort) ───────────────────────────
      // If wallet is connected and contract is deployed, mint the tile as an NFT.
      // Failure here does NOT reverse the purchase — the DB record is the source of truth
      // until on-chain minting is made mandatory (post-smart-contract deployment).
      if (walletState.address) {
        _mintNFTAfterPurchase({ tileKey, tx, ty, country, owner, price })
          .then(result => {
            if (result?.txHash) {
              walletState.recordTx({ type: 'mint', tileKey, txHash: result.txHash })
              walletState.markTileOwned(tileKey)
              // Store tx hash on the server
              api.recordNFTMint?.(tileKey, result.txHash, result.tokenId).catch(() => {})
              // On-chain impact event — what retroactive funding rounds
              // (Optimism RetroPGF, Avalanche Retro9000) actually measure.
              analytics.nftMint(tileKey, result.txHash)
              console.log(`[NFT] Minted tile ${tileKey} → tx ${result.txHash}`)
            }
          })
          .catch(err => console.warn('[NFT] Mint failed (non-fatal):', err.message))
      }

    } catch (err) {
      console.error('[Store] Finalize failed:', err)
      set({ purchaseStep: 'error', purchaseError: err.message })
    }
  },
}))

// ── NFT mint helper (module-level, called after purchase) ─────────────────────
async function _mintNFTAfterPurchase({ tileKey, tx, ty, country, owner, price }) {
  const bc = await import('../lib/blockchain/index.js')
  if (!bc.ACTIVE_CHAIN?.contractAddress) {
    // Contract not deployed yet — skip silently
    return null
  }
  return bc.mintTile({ tx, ty, country, toAddress: owner, valueWei: 0n })
}
