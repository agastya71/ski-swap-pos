/**
 * Application entry point — mounts the React root component into the #root DOM element.
 *
 * The UI-variant (A/B) flag is resolved once here, before the first render:
 * it both sets the root class (v2 CSS tokens) and provides the context value
 * for structural variant switches. See lib/uiVariant.ts +
 * docs/ui-overhaul-ab-plan-2026-11-24.md.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyVariantRootClass, UiVariantContext, resolveUiVariant } from './lib/uiVariant'

const uiVariant = resolveUiVariant(window.location.search)
applyVariantRootClass(uiVariant)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UiVariantContext.Provider value={uiVariant}>
      <App />
    </UiVariantContext.Provider>
  </StrictMode>,
)
