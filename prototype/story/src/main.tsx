import { createRoot } from 'react-dom/client'
import { App } from './App'

// No StrictMode: it double-mounts, which makes the scroll-timeline stylesheet
// and the video play/pause bookkeeping harder to read while judging feel.
createRoot(document.getElementById('root')!).render(<App />)
