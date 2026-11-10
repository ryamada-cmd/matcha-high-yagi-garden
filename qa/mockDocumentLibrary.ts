// Synthetic indexed-library state on top of the local fake file ledger.
import {loadExternalFiles} from './mockExternalStorage'
const deep=<T,>(v:T):T=>JSON.parse(JSON.stringify(v))
const metadata:Record<string,any>={
 'qa-file-1':{title:'架空仕入請求書',documentType:'請求書',category:'帳票',
  documentDate:'2026-11-03',fiscalYear:2026,counterpartyName:'架空問屋甲',
  tags:['架空','請求'],note:'合成テスト用',ocrText:''},
 'qa-file-2':{title:'架空圃場記録',documentType:'圃場資料',category:'圃場',
  documentDate:'2026-10-02',fiscalYear:2026,counterpartyName:'',
  tags:['圃場','架空'],note:'サンプル',ocrText:''}
}
export async function loadDocumentLibrary(){
 return (await loadExternalFiles()).map(file=>({file,library:metadata[file.id]?deep(metadata[file.id]):null}))
}
export async function saveDocumentLibraryMetadata(id:string,input:any){
 metadata[id]=deep(input)
 ;(window as any).__qa_library_meta_saved={id,...deep(input)}
 return id
}
