import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Search, ShieldCheck, ChevronRight, Clock3, GitBranch, Lightbulb, CircleHelp, BadgeCheck } from 'lucide-react'

type GuideItem={title:string;summary:string;steps:string[];notes?:string[];path?:string;adminOnly?:boolean}
type GuideSection={id:string;label:string;description:string;items:GuideItem[]}

// CI の操作ガイド整合チェックでも参照する、画面単位の主要権限キー。
// 新しい画面権限を追加した場合はガイド本文とこの一覧を同じリリースで更新する。
const permissionCoverageKeys=[
  'dashboard.view','sprays.view','pesticide_inventory.view','pesticides.view','spray_plans.view',
  'fertilizer_applications.view','fertilizer_inventory.view','fertilizers.view','fertilizer_plans.view',
  'harvest_processing.view','production.view','products.view','packaging.view','sales.view',
  'documents.view','documents.manage','equipment.view','daily_reports.view','expenses.view',
  'vendor_invoices.view','fields.view','manual.view','settings.view','products.manage'
] as const

const guideSections:GuideSection[]=[
  {id:'start',label:'はじめに',description:'ログイン、権限、画面の使い方',items:[
    {title:'ログインとユーザー権限',summary:'登録アカウントでログインし、役割と機能別権限に応じて操作します。',steps:['メールアドレスとパスワードでログインします。','初回登録ユーザーは管理者、2人目以降は作業者として登録されます。','管理者は「設定・監査」で管理者／作業者の役割と、役割ごとの機能別権限を設定できます。','閲覧・登録・編集・削除などは機能ごとに独立して許可／不許可を設定できます。','許可されていない機能はPC・スマホのメニューから非表示になり、URLを直接開いても利用できません。'],notes:['権限変更後は画面を再読み込みすると確実に最新状態へ更新されます。','管理系の固定権限は安全のため作業者へ付与できないものがあります。']},
    {title:'機能別権限の考え方',summary:'画面を見せる権限と、データを変更する権限を分けて運用できます。',steps:['「閲覧」はその機能の画面・履歴を開けるかを決めます。','「登録」「編集」「削除」または「管理」は、その画面内で実行できる操作を決めます。','例：散布は閲覧・登録・編集・削除を分けて設定できます。','例：請求書・納品書は documents.view で閲覧、documents.manage で作成・編集・削除を制御します。','例：商品価格表は products.view で閲覧し、products.manage がある場合に価格を変更できます。'],notes:['権限は画面表示だけでなく、主要データのRLSやRPC側でも確認されます。']},
    {title:'PC・スマホのメニュー',summary:'PCは左サイドバー、スマホは下部ナビとメニューから、許可された機能だけを開きます。',steps:['PCでは「防除」「施肥」「収穫・製造・販売」「設備」「共通」から選択します。','スマホでは権限のある主要機能を下部ナビから開けます。','その他の許可済み機能は下部の「メニュー」から開きます。','「商品価格表」「請求書・納品書」も収穫・製造・販売グループから開きます。']},
    {title:'データの基本的な流れ',summary:'マスタ・在庫・作業・販売・帳票が連動するため、実際の業務順に登録します。',steps:['圃場・農薬・肥料・商品・設備など必要な基礎情報を登録します。','購入・取得した在庫や設備を登録します。','散布・施肥・摘採・製造・商品化・販売など実際の作業を記録します。','商品マスタで販売区分別価格を整え、価格表で確認します。','請求書・納品書は商品価格と取引先マスタを使って作成します。','履歴、圃場カルテ、ダッシュボードで振り返ります。']}
  ]},
  {id:'dashboard',label:'ダッシュボード',description:'今日の判断に必要な情報を確認',items:[
    {title:'ダッシュボード',summary:'天気と、自分に閲覧が許可された作業・予定・在庫・製造・販売・設備の状況を一覧表示します。',path:'/',steps:['ログインするとダッシュボードが開きます。','昨日・今日・先1週間の天気と降水情報を確認します。','自分に権限がある機能だけ、カード・注意事項・クイック操作・次の作業に表示されます。','販売権限がある場合は売上・売上原価・粗利なども確認できます。'],notes:['天気地点や警告基準は「設定・監査」の変更権限を持つ管理者が変更できます。']}
  ]},
  {id:'spray',label:'防除',description:'農薬検索・在庫・散布・履歴・年間計画',items:[
    {title:'散布を登録する',summary:'在庫のある農薬と圃場を選び、必要薬量を計算して散布を記録します。',path:'/sprays',steps:['使用する農薬在庫ロットを選びます。複数農薬を同一タンクへ登録できます。','散布する圃場を選択します。','散布液量を入力し、希釈倍率と必要薬量を確認します。','FAMIC情報に基づく使用時期・回数などの注意表示を確認します。','内容を確認して登録します。'],notes:['登録すると農薬在庫が連動して減少します。']},
    {title:'散布履歴',summary:'過去の散布を検索し、権限に応じて修正・削除します。',path:'/spray-history',steps:['対象の散布記録を探します。','編集権限がある場合、編集すると在庫差分も再計算されます。','削除権限がある場合、削除すると使用分の在庫が戻ります。']},
    {title:'農薬在庫',summary:'購入した農薬をロット単位で入庫し、棚卸・廃棄・在庫金額を管理します。',path:'/inventory',adminOnly:true,steps:['農薬を選び、購入日・購入先・数量・単価・保管場所などを登録します。','必要に応じて棚卸調整や廃棄を登録します。','在庫残量と在庫金額を確認します。']},
    {title:'FAMIC公式農薬DB',summary:'茶に登録された農薬の公式情報を検索し、権限に応じて自社マスタへの取り込み・同期を行います。',path:'/pesticides',adminOnly:true,steps:['農薬名や登録情報で検索します。','茶への適用、病害虫、希釈倍数、使用時期・回数を確認します。','必要な農薬を自社マスタへ登録します。','同期権限がある場合は最新FAMIC情報へ更新できます。']},
    {title:'年間防除計画',summary:'時期・圃場・目的・農薬ごとに年間の防除予定を管理します。',path:'/plans',steps:['予定時期、圃場、目的、農薬を登録します。','ダッシュボードで近い予定を確認します。','実施後は散布履歴と合わせて振り返ります。']}
  ]},
  {id:'fertilizer',label:'施肥',description:'肥料公式DB・在庫・施肥・履歴・年間計画',items:[
    {title:'施肥を登録する',summary:'肥料在庫と圃場を紐付けて、施肥量とN・P・K投入量を記録します。',path:'/fertilizer-applications',steps:['肥料在庫ロットを選択します。','圃場を選び、施肥量・方法・天候などを入力します。','自動計算されたN・P・K量を確認して登録します。'],notes:['登録すると肥料在庫が減り、圃場別の年間養分集計へ反映されます。']},
    {title:'施肥履歴',summary:'実施した施肥を検索し、圃場・肥料・投入量を振り返ります。',path:'/fertilizer-history',steps:['対象の施肥記録を探します。','圃場、肥料、投入量、N・P・K量を確認します。','権限に応じて編集・削除します。']},
    {title:'肥料在庫',summary:'袋数・重量・購入単価・保管場所などを登録し在庫を管理します。',path:'/fertilizer-inventory',steps:['肥料マスタから対象を選択します。','購入日・購入先・袋数・1袋重量・単価・保管場所を登録します。','棚卸調整や廃棄が必要な場合は在庫画面から登録します。']},
    {title:'肥料マスタと農水省公式DB',summary:'自社で使用する肥料と農水省の公式登録肥料を分けて管理します。',path:'/fertilizers',adminOnly:true,steps:['農水省公式肥料DBから肥料名・会社名・種類・登録番号で検索します。','有効な登録肥料の保証成分を確認します。','使用する肥料を自社肥料マスタへ取り込みます。','同期権限がある場合は最新情報へ同期します。']},
    {title:'年間施肥計画',summary:'月・時期・圃場・目的・肥料・予定量を年間計画として管理します。',path:'/fertilizer-plans',steps:['対象年を選択します。','時期、圃場、目的、肥料、予定量を登録します。','実施後は施肥履歴と比較して振り返ります。']}
  ]},
  {id:'fields',label:'圃場',description:'区画情報と圃場起点の履歴を確認',items:[
    {title:'圃場一覧・圃場カルテ',summary:'圃場面積や区画情報を管理し、許可された散布・施肥・摘採・販売の関連履歴を確認します。',path:'/fields',steps:['圃場一覧から区画を選びます。','圃場カルテで基本情報と、自分に閲覧権限がある作業履歴を確認します。','摘採から製茶・製造・製品ロット・販売までデータがつながっている場合はトレーサビリティを確認します。'],notes:['圃場面積は散布量や施肥量の計算にも利用されます。']}
  ]},
  {id:'production',label:'収穫・製造・商品',description:'摘採から商品化、販売価格まで管理',items:[
    {title:'摘採・一次製茶',summary:'圃場ごとの摘採と、複数摘採ロットを使った一次製茶を管理します。',path:'/harvests',steps:['摘採日、圃場、茶期、摘採方法、生葉重量などを登録します。','製茶時は原料に使う摘採記録と投入kgを選択します。','加工日、工程、製品重量、工場、加工費などを入力して登録します。']},
    {title:'製造・製品在庫',summary:'原料・製品ロット、二次加工、棚卸、廃棄、原価を管理します。',path:'/production',steps:['原料または製品ロットを入庫します。','加工する場合は入力ロットと出力ロットを設定します。','原料原価、加工費、包材費、その他費用から総原価・単位原価を確認します。','在庫調整・廃棄・加工履歴を確認します。']},
    {title:'商品マスタ',summary:'SKU、商品名、規格、容器、卸・小売・その他価格、包材原価を管理します。',path:'/products',adminOnly:true,steps:['SKUと商品名を入力します。','内容量・単位・容器タイプ・カテゴリを設定します。','卸価格、小売価格、その他価格をそれぞれ登録します。','必要に応じて包材原価などの商品情報も登録します。'],notes:['価格変更は商品価格表にも即時反映され、帳票作成時の単価候補になります。','閲覧は products.view、変更は products.manage で制御します。']},
    {title:'商品価格表',summary:'販売中の商品について、卸・小売・その他の3価格を一覧で確認・編集します。',path:'/price-list',adminOnly:true,steps:['「商品価格表」を開きます。','商品名・SKU・カテゴリで検索し、必要ならカテゴリで絞り込みます。','規格と、卸・小売・その他の価格を横並びで確認します。','products.manage 権限がある場合は「編集」から3価格を変更して保存します。','保存した価格は商品マスタと共通データとして保持され、請求書・納品書の単価に利用されます。'],notes:['帳票作成時に販売区分を「卸・小売・その他」から選ぶと、選択商品の対応価格が自動入力されます。']},
    {title:'商品化・SKU在庫',summary:'原料ロットを商品マスタの仕様で包装し、完成品在庫と原価を作成します。',path:'/product-packaging',adminOnly:true,steps:['商品マスタから商品を選びます。','原料ロットと製造個数を指定します。','加工費・その他費用を入力し、必要原料量・総原価・個当たり原価を確認します。','登録すると完成品SKU在庫が作成されます。']}
  ]},
  {id:'sales',label:'販売・帳票',description:'販売・出庫、商品価格、請求書・納品書を管理',items:[
    {title:'販売・出庫',summary:'製品ロットを販売先・販売チャネルと紐付けて出庫し、売上と粗利を記録します。',path:'/sales',steps:['販売する在庫ロットを選びます。','販売数量・単価・販売先・販売チャネルなどを入力します。','売上、売上原価、粗利を確認して登録します。','取消時は対象在庫が戻ることを確認します。']},
    {title:'請求書を作成する',summary:'マネーフォワード系の構成に寄せたA4プレビューを見ながら、取引先・明細・税・振込先を入力します。',path:'/documents',adminOnly:true,steps:['「請求書・納品書」を開き「請求書を作成」を押します。','帳票番号、発行日、お支払期限を確認します。','保存済み取引先を選ぶか、取引先名・住所・部署・担当者を直接入力します。','販売区分を「卸・小売・その他」から選択します。','商品を選ぶと商品価格表の対応単価が自動入力されます。必要なら品目名・単価・数量・単位を手入力します。','明細ごとに納品日と税率（8%軽減・10%・0%）を設定します。','右側のA4プレビューで小計・税率別内訳・消費税・合計・振込先・備考を確認します。','途中なら「下書き保存」、確定したら「発行して保存」を押します。','「印刷 / PDF保存」から印刷ダイアログを開き、PDFとして保存できます。'],notes:['documents.view は帳票閲覧、documents.manage は作成・編集・削除、取引先・発行元設定の変更に使用します。','商品マスタにない品目も自由入力できます。']},
    {title:'納品書を作成する',summary:'請求書と同じ商品・取引先マスタを使い、納品日を含む納品書を作成します。',path:'/documents',adminOnly:true,steps:['「納品書を作成」を押します。','帳票番号、発行日、納品日、取引先を入力します。','販売区分を選び、商品を選択または品目を自由入力します。','各明細の納品日・単価・数量・単位・税率を確認します。','A4プレビューを確認し、下書きまたは発行済みとして保存します。','必要に応じて印刷またはPDF保存します。']},
    {title:'帳票一覧を管理する',summary:'作成済みの請求書・納品書を、帳票番号や取引先から検索して再編集します。',path:'/documents',steps:['「帳票一覧」タブを開きます。','帳票番号または取引先で検索します。','請求書／納品書、発行日、合計、下書き／発行済み状態を確認します。','「開く」から内容を再編集します。','削除権限がある場合は不要な帳票を削除できます。']},
    {title:'取引先マスタ・発行元・振込先',summary:'帳票で繰り返し使う取引先と、自社の発行情報・振込口座を保存します。',path:'/documents',adminOnly:true,steps:['「取引先・発行元」タブを開きます。','取引先マスタへ会社名、郵便番号、住所、部署、担当者、敬称、メール、電話などを登録します。','発行元に会社名、適格請求書登録番号、住所、TELを設定します。','振込先に銀行名、支店名、口座種別、口座番号、口座名義を設定します。','保存後、新しい請求書・納品書から同じ情報を呼び出せます。']}
  ]},
  {id:'equipment',label:'機械設備',description:'農機具・農具・車両と修理・車検・税金を管理',items:[
    {title:'機械設備管理',summary:'農機具・農具・車両を資産台帳へ登録し、修理・整備・点検・期限を管理します。',path:'/equipment',adminOnly:true,steps:['設備区分、名前、メーカー、品番・型番、製造番号、保管場所を入力して登録します。','取得情報、燃料タイプ、現在状態を必要に応じて登録します。','車両の場合は車両番号、車検期限、税金期限、保険期限も登録します。','修理・整備・点検・オイル交換・部品交換などの履歴を追加します。','期限警告と過去の費用を確認します。']}
  ]},
  {id:'common',label:'日報・経理',description:'日常業務、立替経費、仕入請求書を記録',items:[
    {title:'日報',summary:'1日の作業内容、良かった点、課題、次回対応、関連圃場を記録して振り返ります。',path:'/daily-reports',steps:['日付、作業時間、天気・現場状況、関連圃場を入力します。','作業内容、良かった点、課題、次回やることを登録します。','履歴で月・担当者・圃場・キーワードを使って振り返ります。']},
    {title:'経費精算',summary:'社内で立て替えた経費を複数明細で申請し、承認権限を持つユーザーが承認・差戻しします。',path:'/expenses',steps:['購入日時と購入先を入力します。','購入内容、数量、税込単価、税率を明細ごとに追加します。','申請すると承認権限を持つユーザーの確認対象になります。','差戻された場合は内容を修正して再申請します。','CSV出力権限がある場合はエクスポートできます。']},
    {title:'仕入請求書・支払',summary:'肥料代・農薬代・加工賃など、取引先から届いた請求書と支払いを管理します。',path:'/vendor-invoices',adminOnly:true,steps:['請求元、先方請求書番号、請求日、支払期限、支払予定日、支払方法を入力します。','分類を選び、複数の請求明細をまとめて登録します。','一覧で未払残高、期限超過、今月の支払予定を確認します。','実際に支払ったら、支払日・支払金額・口座・振込番号を支払履歴へ登録します。','一部支払・全額支払・支払い保留を必要に応じて管理します。'],notes:['この機能は「こちらが発行する請求書」ではありません。販売先へ発行する帳票は「請求書・納品書」を使用します。']}
  ]},
  {id:'admin',label:'設定・サポート',description:'設定、権限、監査、操作ガイドの整合性を管理',items:[
    {title:'機能別権限を設定する',summary:'管理者／作業者それぞれについて、機能・操作単位で許可／不許可を設定します。',path:'/settings',adminOnly:true,steps:['「設定・監査」を開き、機能別権限の一覧を表示します。','各機能について管理者・作業者の許可状態を確認します。','必要な項目だけ許可し、閲覧・登録・編集・削除・同期・CSV出力などを業務に合わせて分けます。','請求書・納品書は「閲覧」と「作成・編集・削除」を分けて設定できます。','保存後、対象ユーザーで画面を再読み込みし、メニューと操作ボタンを確認します。']},
    {title:'設定・監査',summary:'天気地点、警告基準、ユーザー役割、機能別権限、監査ログを管理します。',path:'/settings',adminOnly:true,steps:['天気表示地点を設定します。','在庫・期限・予定の警告基準を調整します。','ユーザーの管理者／作業者の役割を管理します。','役割ごとの機能別権限を設定します。','監査ログで作成・更新・削除・同期操作を確認します。']},
    {title:'操作ガイドの更新と自動照合',summary:'操作ガイドはアプリ本体と同じリリースで配信し、画面追加時の更新漏れをCIで検出します。',path:'/manual',steps:['画面上部の「アプリ更新」と「リビジョン」で現在のリリースを確認します。','新しい画面をルーティングへ追加すると、CIが操作ガイド内の対応項目を検査します。','対応する説明がない場合はCIを失敗させ、本番リリース前に更新漏れを検出します。','主要な画面権限キーもガイド側の照合対象として管理します。','機能更新と操作ガイド更新を同じコミット系列でリリースします。'],notes:['操作ガイドはアプリの実装から文章を自動生成するものではありません。内容の正確性は人が確認し、CIは「追加した画面の説明がない」状態を機械的に防ぎます。']}
  ]}
]

function formatBuildDate(value:string){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(d)}

export default function ManualPage(){
  const[query,setQuery]=useState('')
  const q=query.trim().normalize('NFKC').toLowerCase()
  const sections=useMemo(()=>guideSections.map(s=>({...s,items:s.items.filter(i=>!q||`${s.label} ${s.description} ${i.title} ${i.summary} ${i.steps.join(' ')} ${(i.notes||[]).join(' ')}`.normalize('NFKC').toLowerCase().includes(q))})).filter(s=>s.items.length>0),[q])
  const resultCount=sections.reduce((n,s)=>n+s.items.length,0)
  return <div className="page manual-page">
    <div className="page-head manual-page-head"><div><p className="eyebrow">USER GUIDE</p><h1>操作ガイド</h1><p className="sub">現在公開中の茶園管理アプリに対応した説明書です。商品価格表、請求書・納品書を含む現行機能に対応しています。</p></div><div className="manual-version"><span><Clock3 size={13}/>アプリ更新 {formatBuildDate(__APP_BUILD_TIME__)}</span><span><GitBranch size={13}/>リビジョン {__APP_REVISION__||'—'}</span><span><BadgeCheck size={13}/>CI照合 {permissionCoverageKeys.length}権限</span></div></div>
    <section className="panel manual-intro"><div className="manual-intro-icon"><BookOpen size={23}/></div><div><h2>五代目八木一兵衛｜茶園管理 操作説明書</h2><p>分からない操作は下の検索欄から「請求書」「納品書」「価格表」「権限」「車検」「農薬」「日報」「CSV」などの言葉で探してください。</p></div><span className="manual-policy"><ShieldCheck size={15}/>画面追加をCIで照合</span></section>
    <div className="search-box manual-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="操作・機能・キーワードで説明書を検索"/><span>{resultCount}項目</span></div>
    <div className="manual-layout">
      <aside className="panel manual-index"><div className="manual-index-title"><CircleHelp size={16}/><b>目次</b></div>{sections.map(s=><a key={s.id} href={`#manual-${s.id}`}>{s.label}<ChevronRight size={14}/></a>)}</aside>
      <div className="manual-content">{sections.map(s=><section className="manual-section" id={`manual-${s.id}`} key={s.id}><div className="manual-section-head"><div><span>{s.label}</span><h2>{s.description}</h2></div><b>{s.items.length}</b></div><div className="manual-items">{s.items.map((item,index)=><article className="manual-card" key={`${s.id}-${item.title}`}><div className="manual-card-head"><div><span>{index+1}</span><div><div className="manual-title-row"><h3>{item.title}</h3>{item.adminOnly&&<em>一部操作に権限必要</em>}</div><p>{item.summary}</p></div></div>{item.path&&<Link to={item.path}>この画面を開く<ChevronRight size={14}/></Link>}</div><ol>{item.steps.map(step=><li key={step}>{step}</li>)}</ol>{item.notes&&item.notes.length>0&&<div className="manual-notes"><Lightbulb size={15}/><div>{item.notes.map(note=><p key={note}>{note}</p>)}</div></div>}</article>)}</div></section>)}{sections.length===0&&<div className="panel manual-empty">「{query}」に一致する説明はありません。</div>}</div>
    </div>
  </div>
}