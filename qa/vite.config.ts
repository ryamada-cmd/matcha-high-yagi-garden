import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Serve a dedicated local-only QA entry from the checked-out development branch.
// The harvest page's Supabase operations and permissions are always replaced.
// The normal project vite.config.ts does NOT use this plugin or QA HTML entry.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export default defineConfig({
 root,
 // The synthetic QA bundle must not scan the real production index.html.
 define:{
  __APP_BUILD_TIME__: JSON.stringify('2026-11-10T00:00:00Z'),
  __APP_REVISION__: JSON.stringify('QA-SYNTHETIC')
 },
 optimizeDeps:{entries:['qa/index.html']},
 plugins:[
  {
   name:'qa-harvest-fail-closed-mock-alias',
   enforce:'pre',
   resolveId(source,importer) {
    const page=importer?.replaceAll('\\','/')||'';
    const harvest=page.endsWith('/src/pages/HarvestProcessingPage.tsx');
    const inventory=page.endsWith('/src/pages/InventoryPage.tsx');
    const prices=page.endsWith('/src/pages/PriceListPage.tsx');
    const products=page.endsWith('/src/pages/ProductMasterPage.tsx');
    const fertilizer=page.endsWith('/src/pages/FertilizerMasterPage.tsx');
    const calendar=page.endsWith('/src/pages/CalendarPage.tsx');
    const documents=page.endsWith('/src/pages/DocumentsPage.tsx');
    const crm=page.endsWith('/src/pages/CrmPage.tsx');
    const equipment=page.endsWith('/src/pages/EquipmentPage.tsx');
    const vendor=page.endsWith('/src/pages/VendorInvoicesPage.tsx');
    const daily=page.endsWith('/src/pages/DailyReportsPage.tsx');
    const expense=page.endsWith('/src/pages/ExpenseClaimsPage.tsx');
    const sprayHistory=page.endsWith('/src/pages/SprayHistoryPage.tsx');
    const fertilizerHistory=page.endsWith('/src/pages/FertilizerHistoryPage.tsx');
    const sales=page.endsWith('/src/pages/SalesPage.tsx');
    const costing=page.endsWith('/src/pages/CostingPage.tsx');
    const storage=page.endsWith('/src/pages/StoragePage.tsx');
    const library=page.endsWith('/src/pages/LibraryPage.tsx');
    const settings=page.endsWith('/src/pages/SettingsPage.tsx');
    const home=page.endsWith('/src/pages/HomeDashboardPage.tsx');
    const photo=page.endsWith('/src/pages/PhotoGallerySection.tsx');
    const weatherSettings=page.endsWith('/src/components/WeatherLocationSettings.tsx');
    const weatherPanel=page.endsWith('/src/components/WeatherPanel.tsx');
    if(harvest||inventory||prices||products||fertilizer||calendar||documents||crm||equipment||vendor||daily||expense||sprayHistory||fertilizerHistory||sales||costing||storage||library||settings||home||photo){
      if(source==='../lib/permissions')return path.join(root,'qa/mockPermissions.ts');
      if(harvest&&source==='../lib/harvestProcessing')return path.join(root,'qa/mockHarvestProcessing.ts');
      if(inventory&&source==='../lib/inventory')return path.join(root,'qa/mockInventory.ts');
      if((prices||products)&&source==='../lib/products')return path.join(root,'qa/mockPriceList.ts');
      if((fertilizer||fertilizerHistory)&&source==='../lib/fertilizers')return path.join(root,'qa/mockFertilizers.ts');
      if(calendar&&source==='../lib/calendar')return path.join(root,'qa/mockCalendar.ts');
      if(documents&&source==='../lib/documents')return path.join(root,'qa/mockDocuments.ts');
      if(documents&&source==='../lib/products')return path.join(root,'qa/mockPriceList.ts');
      if(documents&&source==='../lib/documentPdfStorage')return path.join(root,'qa/mockDocumentPdfStorage.ts');
      if(crm&&source==='../lib/crm')return path.join(root,'qa/mockCrm.ts');
      if(crm&&source==='../lib/crmAssistant')return path.join(root,'qa/mockCrmAssistant.ts');
      if(crm&&source==='../lib/supabase')return path.join(root,'qa/mockCrmSupabase.ts');
      if(crm&&(source==='../components/CrmKnowledgePanel'||source==='../components/CrmReplyPanel'))return path.join(root,'qa/mockCrmPanel.tsx');
      if(equipment&&source==='../lib/equipment')return path.join(root,'qa/mockEquipment.ts');
      if(vendor&&source==='../lib/vendorInvoices')return path.join(root,'qa/mockVendorInvoices.ts');
      if(vendor&&source==='../lib/vendorDocuments')return path.join(root,'qa/mockVendorDocuments.ts');
      if(vendor&&source==='../lib/documentOcr')return path.join(root,'qa/mockVendorDocumentOcr.ts');
      if(daily&&source==='../lib/dailyReports')return path.join(root,'qa/mockDailyReports.ts');
      if(daily&&source==='../lib/photoGallery')return path.join(root,'qa/mockDailyPhotos.ts');
      if(expense&&source==='../lib/expenseClaims')return path.join(root,'qa/mockExpenseClaims.ts');
      if(expense&&source==='../lib/expenseReceipts')return path.join(root,'qa/mockExpenseReceipts.ts');
      if(expense&&source==='../lib/documentOcr')return path.join(root,'qa/mockVendorDocumentOcr.ts');
      if(sprayHistory&&source==='../lib/sprayHistory')return path.join(root,'qa/mockSprayHistory.ts');
      if(sprayHistory&&source==='../lib/sprays')return path.join(root,'qa/mockSprayHistory.ts');
      if(sales&&source==='../lib/sales')return path.join(root,'qa/mockSales.ts');
      if(costing&&source==='../lib/costing')return path.join(root,'qa/mockCosting.ts');
      if((storage||library)&&source==='../lib/externalStorage')return path.join(root,'qa/mockExternalStorage.ts');
      if(library&&source==='../lib/documentLibrary')return path.join(root,'qa/mockDocumentLibrary.ts');

      if(settings&&source==='../lib/adminConsole')return path.join(root,'qa/mockAdminConsole.ts');

      if(photo&&source==='../lib/photoGallery')return path.join(root,'qa/mockPhotoGallery.ts');
      if(home&&['../lib/dashboard','../lib/fertilizerDashboard','../lib/harvestProcessing','../lib/production','../lib/salesDashboard','../lib/equipmentDashboard','../lib/calendar'].includes(source))
       return path.join(root,'qa/mockHomeDashboard.ts');
      // Same source path is shared by fertilizer master and history; use a single safe mock.
    }
    if(weatherSettings&&source==='../lib/adminConsole')return path.join(root,'qa/mockAdminConsole.ts');
    if((weatherSettings||weatherPanel)&&source==='../lib/weather')return path.join(root,'qa/mockWeather.ts');
    if(page.includes('/src/') && (source==='./supabase'||source==='../lib/supabase'))return path.join(root,'qa/mockDatabase.ts');
    if(page.includes('/src/pages/') && source==='../lib/permissions')return path.join(root,'qa/mockPermissions.ts');
    return null;
   },
  },
  react(),
 ],
 server:{host:'127.0.0.1',port:5178,strictPort:true},
});
