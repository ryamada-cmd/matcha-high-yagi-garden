import JSZip from 'npm:jszip@3.10.1'
import iconv from 'npm:iconv-lite@0.6.3'

const SOURCE_PAGES=[
  'https://fertilizer-search.maff.go.jp/FertilizerRegistrationSearch',
  'https://hiryotouroku.my.salesforce-sites.com/FertilizerRegistrationSearch/'
]
const OFFICIAL_URL=SOURCE_PAGES[0]
const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'
}

function htmlDecode(s:string){
  return s
    .replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
    .replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)))
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
}
const stripTags=(s:string)=>htmlDecode(s.replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim()
const norm=(s:unknown)=>String(s??'').normalize('NFKC').replace(/^\uFEFF/,'').replace(/\s+/g,'').replace(/[（）()]/g,'').toUpperCase()
function attr(attrs:string,name:string){
  const m=attrs.match(new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,'i'))
  return m?htmlDecode(m[2]):''
}
function allAnchors(html:string){
  const out:{text:string;href:string;onclick:string}[]=[]
  const re=/<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let m:RegExpExecArray|null
  while((m=re.exec(html)))out.push({text:stripTags(m[2]),href:attr(m[1],'href'),onclick:attr(m[1],'onclick')})
  return out
}
const looksLikeAll=(text:string)=>text.replace(/[・●\s]/g,'')==='全件'
function salesforceDownloadUrl(text:string){
  const m=htmlDecode(text).match(/fileDownload\(\s*['"]([^'"]+)['"]\s*\)/i)
  return m?.[1]||''
}
const responseBytes=async(res:Response)=>new Uint8Array(await res.arrayBuffer())
const isZip=(b:Uint8Array)=>b.length>4&&b[0]===0x50&&b[1]===0x4b

async function obtainOfficialDownload(){
  let last=''
  for(const pageUrl of SOURCE_PAGES){
    try{
      const page=await fetch(pageUrl,{headers:{'User-Agent':'YagiGardenManager/1.0'}})
      if(!page.ok){last=`${pageUrl}: ${page.status}`;continue}
      const html=await page.text()
      const anchors=allAnchors(html)
      const all=anchors.find(a=>looksLikeAll(a.text)) || anchors.find(a=>/fileDownload\(/i.test(a.onclick))
      if(!all){last=`${pageUrl}: 全件ダウンロードが見つかりません`;continue}
      const url=salesforceDownloadUrl(all.onclick)
      if(!url){last=`${pageUrl}: 配布URLを解析できません`;continue}
      const res=await fetch(url,{redirect:'follow',headers:{'User-Agent':'YagiGardenManager/1.0','Referer':pageUrl}})
      if(!res.ok){last=`配布ファイル取得失敗: ${res.status}`;continue}
      const bytes=await responseBytes(res)
      if(!isZip(bytes)){last='配布ファイルがZIP形式ではありません';continue}
      return {pageUrl,downloadUrl:res.url||url,bytes}
    }catch(e){last=e instanceof Error?e.message:String(e)}
  }
  throw new Error(`農水省の全件CSVを取得できませんでした: ${last}`)
}

function decodeCsv(bytes:Uint8Array){
  if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)return new TextDecoder('utf-8').decode(bytes.subarray(3))
  try{
    const t=new TextDecoder('utf-8',{fatal:true}).decode(bytes)
    if(t.includes('肥料')||t.includes('登録'))return t
  }catch{}
  return iconv.decode(bytes,'shift_jis')
}
function parseCsv(text:string){
  const out:string[][]=[];let row:string[]=[],field='',quoted=false
  for(let i=0;i<text.length;i++){
    const ch=text[i]
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){field+='"';i++}
      else if(ch==='"')quoted=false
      else field+=ch
    }else if(ch==='"')quoted=true
    else if(ch===','){row.push(field);field=''}
    else if(ch==='\n'){row.push(field.replace(/\r$/,''));out.push(row);row=[];field=''}
    else field+=ch
  }
  if(field.length||row.length){row.push(field.replace(/\r$/,''));out.push(row)}
  return out.filter(r=>r.some(v=>String(v).trim()!==''))
}
function headerIndex(h:string[],aliases:string[]){
  const nh=h.map(norm)
  for(const a of aliases){const i=nh.findIndex(x=>x===norm(a));if(i>=0)return i}
  for(const a of aliases){const na=norm(a);const i=nh.findIndex(x=>x.includes(na));if(i>=0)return i}
  return -1
}
const val=(r:string[],i:number)=>i>=0?String(r[i]??'').trim():''
function numVal(v:string){
  const m=v.normalize('NFKC').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/)
  return m?Number(m[0]):null
}
function dateVal(v:string){
  const m=v.normalize('NFKC').match(/(\d{4})[\/.\-年]\s*(\d{1,2})[\/.\-月]\s*(\d{1,2})/)
  return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:null
}
const jstDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date())

function mapCsv(rows:string[][]){
  if(!rows.length)return []
  let hi=rows.slice(0,10).findIndex(r=>r.some(c=>norm(c)==='登録番号')&&r.some(c=>norm(c)==='肥料の名称'||norm(c)==='肥料名称'))
  if(hi<0)hi=0
  const h=rows[hi]
  const idx={
    reg:headerIndex(h,['登録番号']),
    regDate:headerIndex(h,['登録年月日','登録日']),
    name:headerIndex(h,['肥料の名称','肥料名称','銘柄名']),
    company:headerIndex(h,['肥料業者','会社名','氏名又は名称']),
    address:headerIndex(h,['住所','所在地']),
    type:headerIndex(h,['肥料種類名称','肥料種類','肥料の種類']),
    lapse:headerIndex(h,['失効区分'])
  }
  const componentPairs:Array<{code:number;amount:number}>=[]
  for(let i=1;i<=16;i++){
    const code=headerIndex(h,[`成分コード${i}`])
    const amount=headerIndex(h,[`保証成分量${i}（%）`,`保証成分量${i}(%)`,`保証成分量${i}`])
    if(code>=0&&amount>=0)componentPairs.push({code,amount})
  }
  if(idx.reg<0||idx.name<0||idx.company<0||idx.type<0||componentPairs.length===0)throw new Error('公式CSVの列構成を認識できませんでした')

  const out:any[]=[]
  for(const r of rows.slice(hi+1)){
    const name=val(r,idx.name);if(!name)continue
    const reg=val(r,idx.reg),company=val(r,idx.company),type=val(r,idx.type),lapse=val(r,idx.lapse)
    const components:Record<string,number>={}
    for(const pair of componentPairs){
      const code=val(r,pair.code).normalize('NFKC').trim().toUpperCase()
      const amount=numVal(val(r,pair.amount))
      if(code&&amount!==null)components[code]=amount
    }
    const get=(c:string)=>components[c]??null
    const sourceKey=[reg,name,company,type].map(x=>x.normalize('NFKC').trim()).join('|')
    out.push({
      source_key:sourceKey,
      registration_no:reg,
      registration_category:'',
      fertilizer_name:name,
      company_name:company,
      fertilizer_type:type,
      registration_date:dateVal(val(r,idx.regDate)),
      expiration_date:null,
      valid_period:'',
      address:val(r,idx.address),
      lapse_status:lapse,
      tn:get('TN'),an:get('AN'),nn:get('NN'),
      tp:get('TP'),cp:get('CP'),sp:get('SP'),wp:get('WP'),
      tk:get('TK'),ck:get('CK'),wk:get('WK'),
      smg:get('SMG'),cmg:get('CMG'),wmg:get('WMG'),
      sca:get('SCA'),cca:get('CCA'),wca:get('WCA'),
      components,
      search_text:[reg,name,company,type,val(r,idx.address),lapse].join(' ').normalize('NFKC'),
      source_url:OFFICIAL_URL
    })
  }
  return out
}

async function rpc(name:string,body:unknown,auth:string){
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!
  const res=await fetch(`${url}/rest/v1/rpc/${name}`,{
    method:'POST',headers:{'Content-Type':'application/json','apikey':key,'Authorization':auth},body:JSON.stringify(body)
  })
  const text=await res.text()
  if(!res.ok){let msg=text;try{msg=JSON.parse(text)?.message||text}catch{}throw new Error(msg)}
  return text?JSON.parse(text):null
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return new Response(JSON.stringify({error:'Method Not Allowed'}),{status:405,headers:{...cors,'Content-Type':'application/json'}})
  const auth=req.headers.get('authorization')||''
  if(!auth.startsWith('Bearer '))return new Response(JSON.stringify({error:'ログインが必要です'}),{status:401,headers:{...cors,'Content-Type':'application/json'}})
  try{
    const sourceDate=jstDate(),syncToken=crypto.randomUUID()
    await rpc('sync_official_fertilizer_chunk',{p_rows:[],p_sync_token:syncToken,p_source_date:sourceDate},auth)
    const dl=await obtainOfficialDownload()
    const zip=await JSZip.loadAsync(dl.bytes)
    const files:{name:string;bytes:Uint8Array}[]=[]
    for(const e of Object.values(zip.files))if(!e.dir&&e.name.toLowerCase().endsWith('.csv'))files.push({name:e.name,bytes:await e.async('uint8array')})
    if(!files.length)throw new Error('ZIP内にCSVファイルがありません')
    const merged:any[]=[]
    for(const f of files)merged.push(...mapCsv(parseCsv(decodeCsv(f.bytes))))
    const unique=new Map<string,any>()
    for(const r of merged)if(r.source_key)unique.set(r.source_key,r)
    const records=[...unique.values()]
    if(!records.length)throw new Error('公式CSVから肥料データを抽出できませんでした')
    let sent=0
    for(let i=0;i<records.length;i+=750){
      const chunk=records.slice(i,i+750)
      sent+=Number(await rpc('sync_official_fertilizer_chunk',{p_rows:chunk,p_sync_token:syncToken,p_source_date:sourceDate},auth))||0
    }
    const total=Number(await rpc('finalize_official_fertilizer_sync',{p_sync_token:syncToken,p_source_date:sourceDate,p_row_count:records.length},auth))||records.length
    return new Response(JSON.stringify({ok:true,sourceDate,rows:total,parsed:records.length,sent,csvFiles:files.map(f=>f.name),sourcePage:dl.pageUrl}),{headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}})
  }catch(e){
    console.error('fertilizer sync failed',e)
    return new Response(JSON.stringify({error:e instanceof Error?e.message:String(e)}),{status:500,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}})
  }
})
