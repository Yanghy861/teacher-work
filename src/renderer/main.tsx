import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { RendererErrorBoundary } from './renderer-error-boundary'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RendererErrorBoundary>
      <App />
    </RendererErrorBoundary>
  </StrictMode>,
)
