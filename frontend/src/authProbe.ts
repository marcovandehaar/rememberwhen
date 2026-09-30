// ADR 0007: a device without a valid key (never enrolled, or revoked) gets a
// 403 from the gate. One probe before rendering sends it to the enrolment page
// instead of letting the app fail on every photo and video.
export async function probeAuth(): Promise<void> {
  try {
    const response = await fetch(window.location.href, {
      method: 'HEAD',
      credentials: 'same-origin',
    })
    if (response.status === 403) {
      window.location.assign('/enrol/')
    }
  } catch {
    // Network failure: let the app render and fail normally elsewhere.
  }
}
