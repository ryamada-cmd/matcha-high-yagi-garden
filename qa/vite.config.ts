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
 plugins:[
  {
   name:'qa-harvest-fail-closed-mock-alias',
   enforce:'pre',
   resolveId(source,importer) {
    if(importer?.replaceAll('\\','/').endsWith('/src/pages/HarvestProcessingPage.tsx')){
      if(source==='../lib/harvestProcessing')return path.join(root,'qa/mockHarvestProcessing.ts');
      if(source==='../lib/permissions')return path.join(root,'qa/mockPermissions.ts');
    }
    return null;
   },
  },
  react(),
 ],
 server:{host:'127.0.0.1',port:5178,strictPort:true},
});
