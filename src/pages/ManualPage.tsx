import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Search, ShieldCheck, ChevronRight, Clock3, GitBranch, Lightbulb, CircleHelp } from 'lucide-react'

type GuideItem={title:string;summary:string;steps:string[];notes?:string[];path?:string;adminOnly?:boolean}
type GuideSection={id:string;label:string;description:string;items:GuideItem[]}

const guideSections:GuideSection[]=[
  {id:'start',label:'はじめに',description:'ログイン、権限、画面の使い方',items:[
    {title:'ログインとユーザー権限',summary:'登録アカウントでログインし、権限に応じて操作します。',steps:['メールアドレスとパスワードでログインします。','初回登録ユーザーは管理者、2人目以降は作業者として登録されます。','管理者は「設定・監査」でユーザー権限を変更できます。','作業者には閲覧や日常作業に必要な操作だけが表示されます。'],notes:['最後の管理者1名は作業者へ変更できないよう保護されています。']},
    {title:'PC・スマホのメニュー',summary:'PCは左サイドバー、スマホは下部ナビとメニューから各機能を開きます。',steps:['PCでは「防除」「施肥」「収穫・製造」「設備」「共通」から選択します。','スマホではホーム・散布・施肥・圃場を下部ナビから開けます。','その他の機能は下部の「メニュー」から開きます。']},
    {title:'データの基本的な流れ',summary:'マスタ・在庫・作業・履歴が連動するため、実際の順番に沿って登録します。',steps:['圃場・農薬・肥料・商品・設備など必要な基礎情報を登録します。','購入・取得した在庫や設備を登録します。','散布・施肥・摘採・製造・販売・修理など実際の作業を記録します。','履歴、圃場カルテ、ダッシュボードで振り返ります。']}
  ]},
  {id:'dashboard',label:'ダッシュボード',description:'今日の判断に必要な情報を確認',items:[
    {title:'ダッシュボード',summary:'天気、作業、予定、在庫、製造、販売など茶園全体の状況を一覧表示します。',path:'/',steps:['ログインするとダッシュボードが開きます。','昨日・今日・先1週間の天気と降水情報を確認します。','前回作業、次回予定、在庫警告などを確認します。','売上・売上原価・粗利など販売状況を確認します。'],notes:['天気地点や警告基準は管理者が「設定・監査」で変更できます。']}
  ]},
  {id:'spray',label:'防除',description:'農薬検索・在庫・散布・履歴・年間計画',items:[
    {title:'散布を登録する',summary:'在庫のある農薬と圃場を選び、必要薬量を計算して散布を記録します。',path:'/sprays',steps:['使用する農薬在庫ロットを選びます。複数農薬を同一タンクへ登録できます。','散布する圃場を選択します。','散布液量を入力し、希釈倍率と必要薬量を確認します。','FAMIC情報に基づく使用時期・回数などの注意表示を確認します。','内容を確認して登録します。'],notes:['登録すると農薬在庫が連動して減少します。']},
    {title:'散布履歴',summary:'過去の散布を検索し、必要に応じて修正・削除します。',path:'/spray-history',steps:['対象の散布記録を探します。','編集すると在庫差分も再計算されます。','削除すると使用分の在庫が戻ります。']},
    {title:'農薬在庫',summary:'購入した農薬をロット単位で入庫し、棚卸・廃棄・在庫金額を管理します。',path:'/inventory',adminOnly:true,steps:['農薬を選び、購入日・購入先・数量・単価・保管場所などを登録します。','必要に応じて棚卸調整や廃棄を登録します。','在庫残量と在庫金額を確認します。']},
    {title:'FAMIC公式農薬DB',summary:'茶に登録された農薬の公式情報を検索し、自社マスタへ取り込みます。',path:'/pesticides',adminOnly:true,steps:['農薬名や登録情報で検索します。','茶への適用、病害虫、希釈倍数、使用時期・回数を確認します。','必要な農薬を自社マスタへ登録します。','管理者は公式DB同期で最新情報へ更新できます。']},
    {title:'年間防除計画',summary:'時期・圃場・目的・農薬ごとに年間の防除予定を管理します。',path:'/plans',steps:['予定時期、圃場、目的、農薬を登録します。','ダッシュボードで近い予定を確認します。','実施後は散布履歴と合わせて振り返ります。']}
  ]},
  {id:'fertilizer',label:'施肥',description:'肥料公式DB・在庫・施肥・履歴・年間計画',items:[
    {title:'肥料マスタと農水省公式DB',summary:'自社で使用する肥料と農水省の公式登録肥料を分けて管理します。',path:'/fertilizers',adminOnly:true,steps:['「農水省 公式肥料DB」から肥料名・会社名・種類・登録番号で検索します。','有効な登録肥料の保証成分を確認します。','使用する肥料だけを自社肥料マスタへ取り込みます。','必要に応じて公式DB同期を実行します。'],notes:['満期失効・廃止失効の肥料は閲覧できますが、自社マスタへの新規取り込みはブロックされます。']},
    {title:'肥料在庫',summary:'袋数・重量・購入単価・保管場所などを登録し在庫を管理します。',path:'/fertilizer-inventory',steps:['肥料マスタから対象を選択します。','購入日・購入先・袋数・1袋重量・単価・保管場所を登録します。','棚卸調整や廃棄が必要な場合は在庫画面から登録します。']},
    {title:'施肥を登録する',summary:'肥料在庫と圃場を紐付けて、施肥量とN・P・K投入量を記録します。',path:'/fertilizer-applications',steps:['肥料在庫ロットを選択します。','圃場を選び、施肥量・方法・天候などを入力します。','自動計算されたN・P・K量を確認して登録します。'],notes:['登録すると肥料在庫が減り、圃場別の年間養分集計へ反映されます。']},
    {title:'施肥履歴・年間施肥計画',summary:'実施履歴と今後の施肥予定を管理します。',path:'/fertilizer-history',steps:['施肥履歴で過去の肥料・圃場・量を確認します。','必要に応じて編集・削除します。','年間施肥計画で月・時期・圃場・目的・予定量を登録します。']}
  ]},
  {id:'fields',label:'圃場',description:'区画情報と圃場起点の履歴を確認',items:[
    {title:'圃場一覧・圃場カルテ',summary:'圃場面積や区画情報を管理し、散布・施肥・摘採・販売まで関連履歴を確認します。',path:'/fields',steps:['圃場一覧から区画を選びます。','圃場カルテで基本情報と作業履歴を確認します。','摘採から製茶・製造・製品ロット・販売までデータがつながっている場合はトレーサビリティを確認します。'],notes:['圃場面積は散布量や施肥量の計算にも利用されます。']}
  ]},
  {id:'production',label:'摘採・製造',description:'摘採から製茶・製造・商品化まで管理',items:[
    {title:'摘採・一次製茶',summary:'圃場ごとの摘採と、複数摘採ロットを使った一次製茶を管理します。',path:'/harvests',steps:['摘採日、圃場、茶期、摘採方法、生葉重量などを登録します。','製茶時は原料に使う摘採記録と投入kgを選択します。','加工日、工程、製品重量、工場、加工費などを入力して登録します。']},
    {title:'製造・製品在庫',summary:'原料・製品ロット、二次加工、棚卸、廃棄、原価を管理します。',path:'/production',steps:['原料または製品ロットを入庫します。','加工する場合は入力ロットと出力ロットを設定します。','原料原価、加工費、包材費、その他費用から総原価・単位原価を確認します。','在庫調整・廃棄・加工履歴を確認します。']},
    {title:'商品マスタ',summary:'SKU、商品名、内容量、容器、標準価格、包材原価を管理します。',path:'/products',adminOnly:true,steps:['SKUと商品名を入力します。','内容量・単位・容器タイプを設定します。','標準販売価格と包材原価を登録します。']},
    {title:'商品化・SKU在庫',summary:'原料ロットを商品マスタの仕様で包装し、完成品在庫と原価を作成します。',path:'/product-packaging',adminOnly:true,steps:['商品マスタから商品を選びます。','原料ロットと製造個数を指定します。','加工費・その他費用を入力し、必要原料量・総原価・個当たり原価を確認します。','登録すると完成品SKU在庫が作成されます。']}
  ]},
  {id:'sales',label:'販売',description:'販売・出庫と粗利を管理',items:[
    {title:'販売・出庫',summary:'製品ロットを販売先・販売チャネルと紐付けて出庫し、売上と粗利を記録します。',path:'/sales',steps:['販売する在庫ロットを選びます。','販売数量・単価・販売先・販売チャネルなどを入力します。','売上、売上原価、粗利を確認して登録します。','取消時は対象在庫が戻ることを確認します。']}
  ]},
  {id:'equipment',label:'機械設備',description:'農機具・農具・車両と修理・車検・税金を管理',items:[
    {title:'設備を登録する',summary:'農機具・農具・車両を資産台帳へ登録します。',path:'/equipment',adminOnly:true,steps:['「設備 → 機械設備管理」を開き「設備を登録」を押します。','設備区分、名前、メーカー、品番・型番、製造番号、保管場所を入力します。','取得区分を「購入・譲受・引継/相続・リース・その他」から選び、分かる場合は取得日と金額を入力します。','機械の場合はガソリン・混合オイル・軽油・電気・バッテリー等の燃料タイプを登録します。','現在状態と破損・不調などの状態メモを登録します。','車両の場合は車両番号、車検期限、税金期限、保険期限も登録します。']},
    {title:'修理・整備履歴を登録する',summary:'設備ごとに修理・整備・点検・車検・税金などを時系列で残します。',path:'/equipment',adminOnly:true,steps:['設備カードの「修理・整備を登録」または履歴タブの「履歴を登録」を押します。','修理、整備、点検、オイル交換、部品交換、車検、自動車税、保険などから区分を選びます。','実施日、依頼先、内容、費用を入力します。','車両は走行距離、機械は稼働時間を必要に応じて記録します。','次回期限がある場合は日付を登録します。','作業後の状態を入力すると設備台帳の現在状態も更新されます。']},
    {title:'期限と状態を確認する',summary:'修理必要設備や車検・税金・保険・整備期限を一覧で確認します。',path:'/equipment',steps:['上部の「要注意・修理」で状態確認が必要な設備数を確認します。','「期限警告」で期限超過または30日以内の設備数を確認します。','設備カードを開いて車検・税金・保険・次回整備日を確認します。','履歴タブで過去にいくら修理・整備費を使ったか確認します。'],notes:['作業者は設備情報と履歴を閲覧できます。設備・履歴の登録変更は管理者が行います。']}
  ]},
  {id:'common',label:'日報・経理',description:'日常業務、立替経費、外部請求書を記録',items:[
    {title:'日報',summary:'1日の作業内容、良かった点、課題、次回対応、関連圃場を記録して振り返ります。',path:'/daily-reports',steps:['日付、作業時間、天気・現場状況、関連圃場を入力します。','作業内容、良かった点、課題、次回やることを登録します。','履歴で月・担当者・圃場・キーワードを使って振り返ります。']},
    {title:'経費精算',summary:'社内で立て替えた経費を複数明細で申請し、管理者が承認・差戻しします。',path:'/expenses',steps:['購入日時と購入先を入力します。','購入内容、数量、税込単価、税率を明細ごとに追加します。','申請すると管理者の確認対象になります。','差戻された場合は内容を修正して再申請します。','管理者は承認・差戻しとCSVエクスポートができます。']},
    {title:'請求書・支払管理',summary:'肥料代・農薬代・加工賃など、外部から届く請求書と支払いを管理します。',path:'/vendor-invoices',adminOnly:true,steps:['請求元、先方請求書番号、請求日、支払期限、支払予定日、支払方法を入力します。','肥料代・農薬代・加工賃などの分類を選び、複数の請求明細をまとめて登録します。','一覧で未払残高、期限超過、今月の支払予定を確認します。','実際に支払ったら、支払日・支払金額・口座・振込番号を支払履歴へ登録します。','一部だけ支払った場合は「一部支払」、全額支払うと「支払済」へ自動更新されます。','確認待ちの請求書は「支払いを保留」にできます。','必要に応じて現在の絞り込み条件でCSVを出力します。'],notes:['経費精算は社員の立替申請、請求書・支払管理は取引先から届く請求書として使い分けます。','請求書・支払情報は管理者のみ閲覧・操作できます。']}
  ]},
  {id:'admin',label:'設定・サポート',description:'設定、監査、更新版の確認方法',items:[
    {title:'設定・監査',summary:'天気地点、警告基準、ユーザー権限、監査ログを管理します。',path:'/settings',adminOnly:true,steps:['天気表示地点を設定します。','在庫・期限・予定の警告基準を調整します。','ユーザー権限を管理します。','監査ログで作成・更新・削除・同期操作を確認します。']},
    {title:'この操作ガイドの更新方法',summary:'操作ガイドはアプリ本体に組み込まれているため、アプリのリリースと同時に更新されます。',path:'/manual',steps:['画面上部の「アプリ更新」と「リビジョン」を確認します。','新機能や仕様変更のリリース時には、この操作ガイドも同じアプリ版で更新されます。','古いPDFや別ファイルを参照する必要はありません。'],notes:['画面表示と説明が一致しない場合は、ブラウザを再読み込みして最新リリースを取得してください。']}
  ]}
]

function formatBuildDate(value:string){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(d)}

export default function ManualPage(){
  const[query,setQuery]=useState('')
  const q=query.trim().normalize('NFKC').toLowerCase()
  const sections=useMemo(()=>guideSections.map(s=>({...s,items:s.items.filter(i=>!q||`${s.label} ${s.description} ${i.title} ${i.summary} ${i.steps.join(' ')} ${(i.notes||[]).join(' ')}`.normalize('NFKC').toLowerCase().includes(q))})).filter(s=>s.items.length>0),[q])
  const resultCount=sections.reduce((n,s)=>n+s.items.length,0)
  return <div className="page manual-page">
    <div className="page-head manual-page-head"><div><p className="eyebrow">USER GUIDE</p><h1>操作ガイド</h1><p className="sub">現在公開中の茶園管理アプリに対応した説明書です。機能更新と同じリリースで内容も更新されます。</p></div><div className="manual-version"><span><Clock3 size={13}/>アプリ更新 {formatBuildDate(__APP_BUILD_TIME__)}</span><span><GitBranch size={13}/>リビジョン {__APP_REVISION__||'—'}</span></div></div>
    <section className="panel manual-intro"><div className="manual-intro-icon"><BookOpen size={23}/></div><div><h2>五代目八木一兵衛｜茶園管理 操作説明書</h2><p>分からない操作は下の検索欄から「車検」「農薬」「日報」「CSV」などの言葉で探してください。</p></div><span className="manual-policy"><ShieldCheck size={15}/>アプリと説明書を同時更新</span></section>
    <div className="search-box manual-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="操作・機能・キーワードで説明書を検索"/><span>{resultCount}項目</span></div>
    <div className="manual-layout">
      <aside className="panel manual-index"><div className="manual-index-title"><CircleHelp size={16}/><b>目次</b></div>{sections.map(s=><a key={s.id} href={`#manual-${s.id}`}>{s.label}<ChevronRight size={14}/></a>)}</aside>
      <div className="manual-content">{sections.map(s=><section className="manual-section" id={`manual-${s.id}`} key={s.id}><div className="manual-section-head"><div><span>{s.label}</span><h2>{s.description}</h2></div><b>{s.items.length}</b></div><div className="manual-items">{s.items.map((item,index)=><article className="manual-card" key={item.title}><div className="manual-card-head"><div><span>{index+1}</span><div><div className="manual-title-row"><h3>{item.title}</h3>{item.adminOnly&&<em>管理者操作</em>}</div><p>{item.summary}</p></div></div>{item.path&&<Link to={item.path}>この画面を開く<ChevronRight size={14}/></Link>}</div><ol>{item.steps.map(step=><li key={step}>{step}</li>)}</ol>{item.notes&&item.notes.length>0&&<div className="manual-notes"><Lightbulb size={15}/><div>{item.notes.map(note=><p key={note}>{note}</p>)}</div></div>}</article>)}</div></section>)}{sections.length===0&&<div className="panel manual-empty">「{query}」に一致する説明はありません。</div>}</div>
    </div>
  </div>
}
