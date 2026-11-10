import React from 'react';
import ReactDOM from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import HarvestProcessingPage from '../src/pages/HarvestProcessingPage';
import InventoryPage from '../src/pages/InventoryPage';
import PriceListPage from '../src/pages/PriceListPage';
import ProductMasterPage from '../src/pages/ProductMasterPage';
import FertilizerMasterPage from '../src/pages/FertilizerMasterPage';
import CalendarPage from '../src/pages/CalendarPage';
import DocumentsPage from '../src/pages/DocumentsPage';
import CrmPage from '../src/pages/CrmPage';
import EquipmentPage from '../src/pages/EquipmentPage';
import VendorInvoicesPage from '../src/pages/VendorInvoicesPage';
import DailyReportsPage from '../src/pages/DailyReportsPage';
import ExpenseClaimsPage from '../src/pages/ExpenseClaimsPage';
import SprayHistoryPage from '../src/pages/SprayHistoryPage';
import FertilizerHistoryPage from '../src/pages/FertilizerHistoryPage';
import SalesPage from '../src/pages/SalesPage';
import CostingPage from '../src/pages/CostingPage';
import StoragePage from '../src/pages/StoragePage';
import LibraryPage from '../src/pages/LibraryPage';
import SettingsPage from '../src/pages/SettingsPage';
import ManualPage from '../src/pages/ManualPage';
import { Theme } from '@astryxdesign/core/theme';
import { matchaTheme } from '@astryxdesign/theme-matcha/built';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-matcha/theme.css';
import '../src/styles.css'
import '../src/features.css'
import '../src/layout-fixes.css'
import '../src/master.css'
import '../src/pesticide-catalog.css'
import '../src/inventory-admin.css'
import '../src/spray-guidance.css'
import '../src/spray-history.css'
import '../src/dashboard-ops.css'
import '../src/admin-console.css'
import '../src/mobile-field.css'
import '../src/brand-logo.css'
import '../src/weather-dashboard.css'
import '../src/fertilizer.css'
import '../src/fertilizer-official.css'
import '../src/fertilizer-dashboard.css'
import '../src/fertilizer-history.css'
import '../src/field-dossier.css'
import '../src/harvest-processing.css'
import '../src/production.css'
import '../src/tea-procurement.css'
import '../src/costing.css'
import '../src/sales.css'
import '../src/product-master.css'
import '../src/product-packaging.css'
import '../src/documents.css'
import '../src/document-storage.css'
import '../src/daily-reports.css'
import '../src/calendar.css'
import '../src/expense-claims.css'
import '../src/vendor-invoices.css'
import '../src/document-ocr.css'
import '../src/equipment.css'
import '../src/manual.css'
import '../src/storage.css'
import '../src/document-library.css'
import '../src/photo-gallery.css'
import '../src/ui-system.css'
import '../src/home-dashboard.css'
import '../src/unified-ui.css'
import '../src/ui-refresh.css'
import '../src/ui-refresh-safety.css'
import '../src/ui-cohesion.css';
import '../src/astryx-ui.css';
import './fixture.css';

const screen=new URLSearchParams(window.location.search).get('screen')||'harvest';
const Screen=screen==='storage'?StoragePage:screen==='library'?LibraryPage:screen==='settings'?SettingsPage:screen==='manual'?ManualPage:screen==='sales'?SalesPage:screen==='costing'?CostingPage:screen==='inventory'?InventoryPage:screen==='prices'?PriceListPage:screen==='products'?ProductMasterPage:screen==='fertilizers'?FertilizerMasterPage:screen==='calendar'?CalendarPage:screen==='documents'?DocumentsPage:screen==='crm'?CrmPage:screen==='equipment'?EquipmentPage:screen==='vendor-invoices'?VendorInvoicesPage:screen==='daily-reports'?DailyReportsPage:screen==='expenses'?ExpenseClaimsPage:screen==='spray-history'?SprayHistoryPage:screen==='fertilizer-history'?FertilizerHistoryPage:HarvestProcessingPage;

ReactDOM.createRoot(document.getElementById('root')!).render(
 <BrowserRouter>
  <Theme theme={matchaTheme} mode="light">
   <div className="app-shell" data-qa="astryx-synthetic-only">
    <aside className="sidebar desktop-sidebar" aria-hidden="true"><span className="qa-sidebar-brand">五代目八木一兵衛　QA</span></aside>
    <main><Screen/></main>
   </div>
  </Theme>
 </BrowserRouter>
);
