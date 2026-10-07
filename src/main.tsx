import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LanguageProvider } from './i18n'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import './styles/flag-icons-locales.css'
import './index.css'

// Global error handlers for unhandled promise rejections and errors
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  // Prevent the error from crashing the app
  event.preventDefault();
});

window.addEventListener('error', (event: ErrorEvent) => {
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
)


