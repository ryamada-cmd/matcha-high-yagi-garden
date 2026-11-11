import { AppTheme } from '../../src/components/AppTheme'
import React from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import App from '../../src/App'
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-matcha/theme.css';
import '../../src/styles.css'
import '../../src/features.css'
import '../../src/layout-fixes.css'
import '../../src/master.css'
import '../../src/pesticide-catalog.css'
import '../../src/inventory-admin.css'
import '../../src/spray-guidance.css'
import '../../src/spray-history.css'
import '../../src/dashboard-ops.css'
import '../../src/admin-console.css'
import '../../src/mobile-field.css'
import '../../src/brand-logo.css'
import '../../src/weather-dashboard.css'
import '../../src/fertilizer.css'
import '../../src/fertilizer-official.css'
import '../../src/fertilizer-dashboard.css'
import '../../src/fertilizer-history.css'
import '../../src/field-dossier.css'
import '../../src/harvest-processing.css'
import '../../src/production.css'
import '../../src/tea-procurement.css'
import '../../src/costing.css'
import '../../src/sales.css'
import '../../src/product-master.css'
import '../../src/product-packaging.css'
import '../../src/documents.css'
import '../../src/document-storage.css'
import '../../src/daily-reports.css'
import '../../src/calendar.css'
import '../../src/expense-claims.css'
import '../../src/vendor-invoices.css'
import '../../src/document-ocr.css'
import '../../src/equipment.css'
import '../../src/manual.css'
import '../../src/storage.css'
import '../../src/document-library.css'
import '../../src/photo-gallery.css'
import '../../src/ui-system.css'
import '../../src/home-dashboard.css'
import '../../src/unified-ui.css'
import '../../src/ui-refresh.css'
import '../../src/ui-refresh-safety.css'
import '../../src/ui-cohesion.css';
import '../../src/astryx-ui.css';

const route=new URLSearchParams(window.location.search).get('route')||'/'
createRoot(document.getElementById('root')!).render(
 <React.StrictMode>
  <MemoryRouter initialEntries={[route]}><AppTheme><App/></AppTheme></MemoryRouter>
 </React.StrictMode>
)
