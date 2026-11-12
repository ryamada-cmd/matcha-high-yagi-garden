import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

async function verifyPdfExport() {
 const browser=await chromium.launch({args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5178/')||r.request().url().startsWith('data:')?r.continue():r.abort());
 for(const [type,count] of [['請求書',5],['見積書',48],['納品書',30]]){
 await page.goto('http://127.0.0.1:5178/qa/index.html?screen=documents');
 await page.getByRole('button',{name:type+'を作成',exact:true}).click();
 await page.locator('.document-preview-print tbody tr').first().waitFor();
 await page.locator('.item-name-input').first().fill('宇治抹茶（3,000円） Matcha No. 15')
 await page.locator('.document-items-editor').getByLabel('単価').fill('3000')
 assert.equal(await page.locator('.doc-items-table .doc-parenthesis').count(),2)
 assert.equal(await page.locator('.doc-tax-breakdown .doc-parenthesis').count(),2)
 assert.equal(await page.locator('.doc-notes b').innerText(),'備考')
 const result=await page.evaluate(async ({count})=>{
 const preview=document.querySelector('.document-preview-print');
 const tbody=preview.querySelector('tbody');
 const row=tbody.rows[0].cloneNode(true);
 tbody.replaceChildren(...Array.from({length:count},()=>row.cloneNode(true)));
 const {createDocumentPdfBlob}=await import('/src/lib/documentPdfStorage.ts');
 const blob=await createDocumentPdfBlob(preview);
 return Array.from(new Uint8Array(await blob.arrayBuffer()));
 },{count});
 mkdirSync('qa/results',{recursive:true})
 writeFileSync(`qa/results/document-${count}.pdf`,Buffer.from(result))
 const pdf = Buffer.from(result).toString('latin1')
 const pages = pdf.match(/\/Type \/Page\b/g)?.length
 assert.ok(pages && (count === 5 ? pages === 1 : pages > 1), `${type}: unexpected page count ${pages}`)
 console.log(`${type}: ${count} rows, ${pages} pages`)
 }
 await page.goto('http://127.0.0.1:5178/qa/index.html?screen=documents&archiveTest=1')
 await page.getByRole('button',{name:'請求書を作成',exact:true}).click()
 await page.getByLabel('取引先名').fill('架空取引先')
 await page.locator('.item-name-input').first().fill('架空抹茶')
 await page.getByRole('button',{name:'発行して保存',exact:true}).click()
 await page.getByText('帳票を発行し、OneDriveへPDFを自動保存しました。',{exact:true}).waitFor()
 await page.getByRole('button',{name:'帳票一覧',exact:true}).click()
 const archive = page.getByRole('link',{name:'OneDriveで開く',exact:true})
 assert.match(await archive.getAttribute('href'), /original[.]pdf$/)
 await page.getByRole('button',{name:'OneDriveのPDFを更新',exact:true}).click()
 await page.getByText('OneDriveに新しいPDFを保存しました。「OneDriveで開く」で確認できます。',{exact:true}).waitFor()
 assert.match(await archive.getAttribute('href'), /updated[.]pdf$/)
 await page.getByRole('button',{name:'帳票を更新',exact:true}).click()
 await archive.waitFor()
 assert.match(await archive.getAttribute('href'), /updated[.]pdf$/)
 console.log('PASS: refreshing an issued PDF switches the OneDrive link and survives list refresh')
 }finally{await browser.close()}
}

await verifyPdfExport()
