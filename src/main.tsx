import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import './features.css'
import './layout-fixes.css'
import './master.css'
import './pesticide-catalog.css'
import './inventory-admin.css'
import './spray-guidance.css'
import './spray-history.css'
import './dashboard-ops.css'
import './admin-console.css'
import './mobile-field.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
