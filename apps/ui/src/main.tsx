import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (typeof document !== 'undefined') {
  const storedTheme = window.localStorage.getItem('pulse.ui.theme')
  if (storedTheme !== 'light') {
    document.documentElement.classList.add('dark')
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
