import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const fakeSupabase=path.join(root,'qa/auth/mockSupabase.ts')
const fakePage=path.join(root,'qa/auth/mockPage.tsx')
// Production Vite config does NOT import or refer to this isolated test config.
export default defineConfig({
 root,
 optimizeDeps:{entries:['qa/auth/index.html']},
 plugins:[{
  name:'qa-auth-fail-closed',
  enforce:'pre',
  resolveId(source,importer){
   const from=importer?.replaceAll('\\','/')||''
   const app=from.endsWith('/src/App.tsx')
   const permissions=from.endsWith('/src/lib/permissions.tsx')
   if(app&&source==='./lib/supabase')return fakeSupabase
   if(permissions&&source==='./supabase')return fakeSupabase
   if(app&&source.startsWith('./pages/'))return fakePage
   return null
  }
 },react()],
 server:{host:'127.0.0.1',port:5179,strictPort:true}
})
