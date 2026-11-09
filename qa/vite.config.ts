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
    if(harvest||inventory||prices||products||fertilizer||calendar){
      if(source==='../lib/permissions')return path.join(root,'qa/mockPermissions.ts');
      if(harvest&&source==='../lib/harvestProcessing')return path.join(root,'qa/mockHarvestProcessing.ts');
      if(inventory&&source==='../lib/inventory')return path.join(root,'qa/mockInventory.ts');
      if((prices||products)&&source==='../lib/products')return path.join(root,'qa/mockPriceList.ts');
      if(fertilizer&&source==='../lib/fertilizers')return path.join(root,'qa/mockFertilizers.ts');
      if(calendar&&source==='../lib/calendar')return path.join(root,'qa/mockCalendar.ts');
    }
    return null;
   },
  },
  react(),
 ],
 server:{host:'127.0.0.1',port:5178,strictPort:true},
});
