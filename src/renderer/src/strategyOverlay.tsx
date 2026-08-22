import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StrategyOverlayApp } from '@/StrategyOverlayApp'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('strategy.html sem #root')

createRoot(container).render(
  <StrictMode>
    <StrategyOverlayApp />
  </StrictMode>
)
