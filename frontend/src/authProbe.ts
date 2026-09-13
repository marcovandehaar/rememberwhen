// ADR 0004: a revoked credential otherwise surfaces as one browser password
// dialog per subresource, cascading across every photo/video on the page.
// A single probe before rendering turns that into one document-level reload.
export async function probeAuth(): Promise<void> {
  try {
    const response = await fetch(window.location.href, {
      method: 'HEAD',
      credentials: 'same-origin',
    })
    if (response.status === 401) {
      window.location.reload()
    }
  } catch {
    // Network failure: let the app render and fail normally elsewhere.
  }
}
