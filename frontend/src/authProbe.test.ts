import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { probeAuth } from './authProbe'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('sends the device to the enrolment page when its key is missing or revoked', async () => {
  vi.mocked(fetch).mockResolvedValue({ status: 403 } as Response)

  await probeAuth()

  expect(location.assign).toHaveBeenCalledExactlyOnceWith('/enrol/')
})

test('does nothing when the key still works', async () => {
  vi.mocked(fetch).mockResolvedValue({ status: 200 } as Response)

  await probeAuth()

  expect(location.assign).not.toHaveBeenCalled()
})

test('does nothing when the probe itself fails to reach the network', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('offline'))

  await probeAuth()

  expect(location.assign).not.toHaveBeenCalled()
})
