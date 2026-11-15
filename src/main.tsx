import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// iPhone home-screen apps resume instead of reloading, so check for a new version every time the
// app comes to the front. autoUpdate reloads the page once the new version is ready.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => void reg.update().catch(() => {})
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    setInterval(check, 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
