import { chromium } from 'playwright'
import assert from 'node:assert/strict'

async function verifyPdfExport() {
 const browser=await chromium.launch({args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5178/')||r.request().url().startsWith('data:')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:5178/qa/index.html?screen=documents');
 for(const [type,count] of [['請求書',5],['見積書',48],['納品書',30]]){
 await page.getByRole('button',{name:type+'を作成',exact:true}).click();
 const result=await page.evaluate(async ({count})=>{
 const preview=document.querySelector('.document-preview-print');
 const tbody=preview.querySelector('tbody');
 const row=tbody.rows[0].cloneNode(true);
 row.cells[1].textContent='宇治抹茶（3,000円） Matcha No. 15 ※';
 tbody.replaceChildren(...Array.from({length:count},()=>row.cloneNode(true)));
 const box=document.createElement('div');
 box.className='doc-box';
 box.innerHTML='<b>備考</b><span>備考テスト（A123） ※<br>振込のご案内</span>';
 preview.append(box);
 const {createDocumentPdfBlob}=await import('/src/lib/documentPdfStorage.ts');
 const blob=await createDocumentPdfBlob(preview);
 return Array.from(new Uint8Array(await blob.arrayBuffer()));
 },{count});
 const pdf = Buffer.from(result).toString('latin1')
 const pages = pdf.match(/\/Type \/Page\b/g)?.length
 assert.ok(pages && (count === 5 ? pages === 1 : pages > 1), `${type}: unexpected page count ${pages}`)
 console.log(`${type}: ${count} rows, ${pages} pages`)
 }
 }finally{await browser.close()}
}

await verifyPdfExport()
