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
    if(harvest||inventory||prices||products||fertilizer||calendar||documents||crm||equipment||vendor||daily||expense){
      if(source==='../lib/permissions')return path.join(root,'qa/mockPermissions.ts');
      if(harvest&&source==='../lib/harvestProcessing')return path.join(root,'qa/mockHarvestProcessing.ts');
      if(inventory&&source==='../lib/inventory')return path.join(root,'qa/mockInventory.ts');
      if((prices||products)&&source==='../lib/products')return path.join(root,'qa/mockPriceList.ts');
      if(fertilizer&&source==='../lib/fertilizers')return path.join(root,'qa/mockFertilizers.ts');
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
    }
    return null;
   },
  },
  react(),
 ],
 server:{host:'127.0.0.1',port:5178,strictPort:true},
});
