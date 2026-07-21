/**
 * Tests for the NOWPayments integration in src/store/gameStore.js
 * Covers: startPayment, _startPolling, _finalizeBlock, closePurchaseModal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import { MOCK_PAYMENT, MOCK_BLOCK } from './mocks/handlers'
import { useGameStore } from '../store/gameStore'

// Reset Zustand store state between tests
beforeEach(() => {
  useGameStore.setState({
    blocks:          new Map(),
    loading:         false,
    dbError:         null,
    hoveredKey:      null,
    selectedKey:     '1024:512',
    purchaseModal:   false,
    purchaseStep:    'select',
    selectedCurrency: 'usdttrc20',
    paymentData:     null,
    paymentTimeLeft: 1800,
    purchasingKey:   null,
    purchaseError:   null,
    _pollTimer:      null,
    stats:           { sold: 0, volume: 0, owners: 0 },
  })
})

// ── openPurchaseModal ─────────────────────────────────────────────────────────

describe('openPurchaseModal', () => {
  it('sets purchasingKey from selectedKey and opens modal', () => {
    const { openPurchaseModal } = useGameStore.getState()
    openPurchaseModal()
    const s = useGameStore.getState()
    expect(s.purchaseModal).toBe(true)
    expect(s.purchasingKey).toBe('1024:512')
    expect(s.purchaseStep).toBe('select')
    expect(s.purchaseError).toBeNull()
  })

  it('does nothing when no tile is selected', () => {
    useGameStore.setState({ selectedKey: null })
    const { openPurchaseModal } = useGameStore.getState()
    openPurchaseModal()
    expect(useGameStore.getState().purchaseModal).toBe(false)
  })
})

// ── closePurchaseModal ────────────────────────────────────────────────────────

describe('closePurchaseModal', () => {
  it('resets modal state', () => {
    useGameStore.setState({ purchaseModal: true, purchaseStep: 'payment', paymentData: { paymentId: 'x' } })
    useGameStore.getState().closePurchaseModal()
    const s = useGameStore.getState()
    expect(s.purchaseModal).toBe(false)
    expect(s.purchaseStep).toBe('select')
    expect(s.paymentData).toBeNull()
  })

  it('clears any running poll timer', () => {
    const fakeTimer = setInterval(() => {}, 999999)
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    useGameStore.setState({ _pollTimer: fakeTimer })
    useGameStore.getState().closePurchaseModal()
    expect(clearSpy).toHaveBeenCalledWith(fakeTimer)
    clearSpy.mockRestore()
    clearInterval(fakeTimer)
  })
})

// ── startPayment ──────────────────────────────────────────────────────────────

describe('startPayment', () => {
  it('transitions to loading then payment step', async () => {
    useGameStore.setState({ purchasingKey: '1024:512' })
    const { startPayment } = useGameStore.getState()

    await startPayment()

    const s = useGameStore.getState()
    expect(s.purchaseStep).toBe('payment')
    expect(s.paymentData).not.toBeNull()
    expect(s.paymentData.paymentId).toBe('np-test-001')
    expect(s.paymentData.address).toBe(MOCK_PAYMENT.pay_address)
    expect(s.paymentData.currency).toBe('USDTTRC20')  // toUpperCase() applied in store
    expect(parseFloat(s.paymentData.amount)).toBeGreaterThan(0)
  })

  it('stores usdAmount in paymentData', async () => {
    const blocks = new Map([['1024:512', { price: '13.50', country: 'France' }]])
    useGameStore.setState({ purchasingKey: '1024:512', blocks })

    await useGameStore.getState().startPayment()

    const s = useGameStore.getState()
    expect(s.paymentData.usdAmount).toBe('13.5')
  })

  it('transitions to error step when createPayment fails', async () => {
    server.use(
      http.post('http://127.0.0.1:8000/np/payment', () =>
        HttpResponse.json(
          { detail: 'Amount too low: 0.000001 BTC is below minimum.' },
          { status: 400 }
        )
      )
    )
    useGameStore.setState({ purchasingKey: '1024:512' })
    await useGameStore.getState().startPayment()

    const s = useGameStore.getState()
    expect(s.purchaseStep).toBe('error')
    expect(s.purchaseError).toMatch(/Amount too low/)
  })

  it('does nothing when purchasingKey is null', async () => {
    useGameStore.setState({ purchasingKey: null })
    await useGameStore.getState().startPayment()
    expect(useGameStore.getState().purchaseStep).toBe('select')
  })

  it('starts polling after successful payment creation', async () => {
    const startPollingSpy = vi.spyOn(useGameStore.getState(), '_startPolling')
    useGameStore.setState({ purchasingKey: '1024:512' })
    await useGameStore.getState().startPayment()
    // _pollTimer should be set (polling started)
    expect(useGameStore.getState()._pollTimer).not.toBeNull()
    startPollingSpy.mockRestore()
  })
})

// ── _finalizeBlock ────────────────────────────────────────────────────────────

describe('_finalizeBlock', () => {
  it('sets confirmed step and updates blocks map on success', async () => {
    useGameStore.setState({
      purchasingKey: '1024:512',
      purchaseStep: 'confirming',
    })
    await useGameStore.getState()._finalizeBlock('np-test-001')

    const s = useGameStore.getState()
    expect(s.purchaseStep).toBe('confirmed')
    expect(s.blocks.has('1024:512')).toBe(true)
    expect(s.blocks.get('1024:512').owner).toBe('You')
  })

  it('transitions to error if finalize returns 402', async () => {
    server.use(
      http.post('http://127.0.0.1:8000/np/finalize', () =>
        HttpResponse.json(
          { detail: 'Payment not yet completed (status: waiting).' },
          { status: 402 }
        )
      )
    )
    useGameStore.setState({ purchasingKey: '1024:512', purchaseStep: 'confirming' })
    await useGameStore.getState()._finalizeBlock('np-test-001')

    const s = useGameStore.getState()
    expect(s.purchaseStep).toBe('error')
    expect(s.purchaseError).toMatch(/Payment not yet completed/)
  })

  it('transitions to error on 409 conflict', async () => {
    server.use(
      http.post('http://127.0.0.1:8000/np/finalize', () =>
        HttpResponse.json({ detail: 'Block already owned by alice' }, { status: 409 })
      )
    )
    useGameStore.setState({ purchasingKey: '1024:512', purchaseStep: 'confirming' })
    await useGameStore.getState()._finalizeBlock('np-test-001')

    expect(useGameStore.getState().purchaseStep).toBe('error')
    expect(useGameStore.getState().purchaseError).toMatch(/alice/)
  })
})

// ── _startPolling — status transitions ───────────────────────────────────────

describe('_startPolling', () => {
  it('auto-finalizes when status becomes finished', async () => {
    vi.useFakeTimers()

    server.use(
      http.get('http://127.0.0.1:8000/np/payment/:id', () =>
        HttpResponse.json({ ...MOCK_PAYMENT, payment_status: 'finished' })
      )
    )

    useGameStore.setState({ purchasingKey: '1024:512', purchaseStep: 'payment' })
    useGameStore.getState()._startPolling('np-test-001')

    // Advance past the 10s poll interval
    await vi.advanceTimersByTimeAsync(11_000)

    const s = useGameStore.getState()
    // Should have moved to confirming or confirmed
    expect(['confirming', 'confirmed']).toContain(s.purchaseStep)

    vi.useRealTimers()
  })

  it('sets error step when status becomes failed', async () => {
    vi.useFakeTimers()

    server.use(
      http.get('http://127.0.0.1:8000/np/payment/:id', () =>
        HttpResponse.json({ ...MOCK_PAYMENT, payment_status: 'failed' })
      )
    )

    useGameStore.setState({ purchasingKey: '1024:512', purchaseStep: 'payment' })
    useGameStore.getState()._startPolling('np-test-001')

    await vi.advanceTimersByTimeAsync(11_000)

    const s = useGameStore.getState()
    expect(s.purchaseStep).toBe('error')
    expect(s.purchaseError).toMatch(/failed on blockchain/)

    vi.useRealTimers()
  })

  it('sets error step with expiry message when status is expired', async () => {
    vi.useFakeTimers()

    server.use(
      http.get('http://127.0.0.1:8000/np/payment/:id', () =>
        HttpResponse.json({ ...MOCK_PAYMENT, payment_status: 'expired' })
      )
    )

    useGameStore.setState({ purchasingKey: '1024:512', purchaseStep: 'payment' })
    useGameStore.getState()._startPolling('np-test-001')

    await vi.advanceTimersByTimeAsync(11_000)

    const s = useGameStore.getState()
    expect(s.purchaseStep).toBe('error')
    expect(s.purchaseError).toMatch(/expired/)

    vi.useRealTimers()
  })

  it('keeps polling on network error without failing the flow', async () => {
    vi.useFakeTimers()
    let callCount = 0

    server.use(
      http.get('http://127.0.0.1:8000/np/payment/:id', () => {
        callCount++
        if (callCount < 3) {
          return HttpResponse.error()
        }
        return HttpResponse.json({ ...MOCK_PAYMENT, payment_status: 'waiting' })
      })
    )

    useGameStore.setState({ purchasingKey: '1024:512', purchaseStep: 'payment' })
    useGameStore.getState()._startPolling('np-test-001')

    await vi.advanceTimersByTimeAsync(35_000) // 3 poll intervals

    // Should still be in payment step (no failure from network errors)
    expect(useGameStore.getState().purchaseStep).toBe('payment')

    vi.useRealTimers()
  })
})

// ── tickPaymentTimer ──────────────────────────────────────────────────────────

describe('tickPaymentTimer', () => {
  it('decrements paymentTimeLeft by 1 each call', () => {
    useGameStore.setState({ paymentTimeLeft: 100 })
    useGameStore.getState().tickPaymentTimer()
    expect(useGameStore.getState().paymentTimeLeft).toBe(99)
  })

  it('does not go below 0', () => {
    useGameStore.setState({ paymentTimeLeft: 0 })
    useGameStore.getState().tickPaymentTimer()
    expect(useGameStore.getState().paymentTimeLeft).toBe(0)
  })
})

// ── loadBlocksFromServer ──────────────────────────────────────────────────────

describe('loadBlocksFromServer', () => {
  it('populates blocks map from API response', async () => {
    await useGameStore.getState().loadBlocksFromServer()
    const s = useGameStore.getState()
    expect(s.loading).toBe(false)
    expect(s.blocks.has('1024:512')).toBe(true)
    expect(s.stats.sold).toBe(1)
  })

  it('sets dbError when server is unreachable', async () => {
    server.use(
      http.get('http://127.0.0.1:8000/blocks', () => HttpResponse.error())
    )
    await useGameStore.getState().loadBlocksFromServer()
    const s = useGameStore.getState()
    expect(s.loading).toBe(false)
    expect(s.dbError).toBeTruthy()
  })
})
