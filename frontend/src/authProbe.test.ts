import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { probeAuth } from './authProbe'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('location', { ...window.location, reload: vi.fn() })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('reloads the page when the credential has been revoked', async () => {
  vi.mocked(fetch).mockResolvedValue({ status: 401 } as Response)

  await probeAuth()

  expect(location.reload).toHaveBeenCalledOnce()
})

test('does nothing when the credential still works', async () => {
  vi.mocked(fetch).mockResolvedValue({ status: 200 } as Response)

  await probeAuth()

  expect(location.reload).not.toHaveBeenCalled()
})

test('does nothing when the probe itself fails to reach the network', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('offline'))

  await probeAuth()

  expect(location.reload).not.toHaveBeenCalled()
})
