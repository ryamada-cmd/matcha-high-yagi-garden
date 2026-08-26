import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Search, ShieldCheck, ChevronRight, Clock3, GitBranch, Lightbulb, CircleHelp } from 'lucide-react'

type GuideItem = {
  title: string
  summary: string
  steps: string[]
  notes?: string[]
  path?: string
  adminOnly?: boolean
}
type GuideSection = { id:string; label:string; description:string; items:GuideItem[] }

const guideSections: GuideSection[] = [
  {
    id:'start', label:'はじめに', description:'ログイン、権限、画面の見方など、最初に確認する内容です。',
    items:[
      {title:'ログインとユーザー権限',summary:'登録されたアカウントでログインして利用します。権限により表示される変更操作が異なります。',steps:['メールアドレスとパスワードでログインします。','初回登録ユーザーは管理者、2人目以降は作業者として登録されます。','管理者は「設定・監査」でユーザーを管理者／作業者へ変更できます。','各画面では、現在の権限で実行できるボタンだけを使用してください。'],notes:['最後の管理者1名は作業者へ変更できないよう保護されています。']},
      {title:'PC・スマホのメニュー',summary:'PCでは左サイドバー、スマホでは下部ナビと「メニュー」から各機能へ移動します。',steps:['PCは左側の「防除」「施肥」「収穫・製造」「共通」から機能を選びます。','スマホは「ホーム・散布・施肥・圃場」を下部ナビからすぐ開けます。','その他の機能はスマホ下部の「メニュー」から開きます。']},
      {title:'データの考え方',summary:'在庫・散布・施肥・製造・販売は互いに連動しています。前工程のデータを正しく登録すると後工程へ引き継がれます。',steps:['マスタで対象を登録します。','在庫を入庫します。','散布・施肥・製造・販売など実際の作業を登録します。','履歴や圃場カルテで後から確認します。'],notes:['登録済みデータを削除・取消した場合、関連する在庫を戻す仕組みがある機能があります。画面の確認メッセージを読んで操作してください。']},
    ]
  },
  {
    id:'dashboard', label:'ダッシュボード', description:'今日の判断に必要な情報をまとめて確認します。',
    items:[
      {title:'ダッシュボード',summary:'天気、直近作業、在庫、予定、製造・販売など、茶園全体の状況を一覧で確認します。',path:'/',steps:['ログイン直後にダッシュボードが開きます。','天気、前回作業、次回予定、在庫警告などを確認します。','各カードやクイック操作から必要な機能へ移動します。','月間売上・売上原価・粗利など販売状況も確認できます。'],notes:['警告の基準値や天気地点は管理者が「設定・監査」で変更できます。']},
    ]
  },
  {
    id:'spray', label:'防除', description:'農薬検索、在庫、散布、履歴、年間防除計画を管理します。',
    items:[
      {title:'散布を登録する',summary:'在庫のある農薬と圃場を選び、散布量・希釈情報を確認して散布記録を作成します。',path:'/sprays',steps:['「散布」を開きます。','使用する農薬在庫ロットを選びます。複数農薬を同じタンクへ登録できます。','散布する圃場を選びます。','散布液量を入力・選択し、必要薬量の自動計算を確認します。','FAMIC情報に基づく使用時期・回数などの注意表示を確認します。','内容を確認して散布を登録します。'],notes:['登録すると対象農薬の在庫が連動して減少します。']},
      {title:'散布履歴を見る・修正する',summary:'過去の散布内容を振り返り、必要に応じて編集・削除します。',path:'/spray-history',steps:['「散布履歴」を開きます。','日付や圃場などから対象記録を確認します。','編集時は変更後の在庫差分が反映されます。','削除時は使用した在庫が戻ることを確認して実行します。']},
      {title:'農薬在庫を管理する',summary:'購入した農薬の入庫、棚卸調整、廃棄をロット単位で管理します。',path:'/inventory',steps:['「農薬在庫」を開きます。','購入した農薬を入庫し、数量・購入日・購入先・単価・保管場所などを登録します。','実在庫との差がある場合は棚卸調整を行います。','廃棄した場合は廃棄処理を登録します。'],adminOnly:true},
      {title:'農薬を公式DBから探す',summary:'FAMICの茶登録農薬データを検索し、使用する農薬を確認します。',path:'/pesticides',steps:['「農薬検索」を開きます。','農薬名・登録情報などで検索します。','茶への適用、対象病害虫、希釈倍数、使用時期・回数などを確認します。','必要な農薬を自社マスタへ取り込みます。','管理者は必要に応じてFAMIC公式DBを同期します。'],adminOnly:true,notes:['公式登録情報は使用前に最新表示を確認してください。']},
      {title:'年間防除計画',summary:'時期ごとの散布予定を登録し、実施状況を管理します。',path:'/plans',steps:['「年間防除計画」を開きます。','対象時期、圃場、目的、農薬などを登録します。','ダッシュボードで近い予定を確認します。','実施後は散布記録と合わせて振り返ります。']},
    ]
  },
  {
    id:'fertilizer', label:'施肥', description:'肥料マスタ、公式肥料DB、在庫、施肥、履歴、年間計画を管理します。',
    items:[
      {title:'肥料マスタと農水省公式DB',summary:'自社で使う肥料と、農林水産省の公式肥料登録データを分けて管理します。',path:'/fertilizers',steps:['「肥料マスタ」を開きます。','「農水省 公式肥料DB」タブで肥料名・会社名・種類・登録番号を検索します。','有効な登録肥料の保証成分を確認します。','「マスタへ登録」から自社肥料マスタへ取り込みます。','管理者は「公式DB同期」で最新データへ更新できます。'],adminOnly:true,notes:['満期失効・廃止失効の肥料は公式DBで確認できますが、自社マスタへの新規取り込みはブロックされます。','N・P・K・Mg・Caなどは公式保証成分から自動転記されます。']},
      {title:'肥料在庫を管理する',summary:'購入した肥料を袋・kgなどの単位で入庫し、現在庫と在庫金額を管理します。',path:'/fertilizer-inventory',steps:['「肥料在庫」を開きます。','肥料マスタから対象肥料を選びます。','購入日・購入先・袋数・1袋重量・単価・保管場所などを登録します。','必要に応じて棚卸調整や廃棄を登録します。']},
      {title:'施肥を登録する',summary:'肥料在庫と圃場を紐付けて施肥量を記録し、N・P・K投入量を計算します。',path:'/fertilizer-applications',steps:['「施肥」を開きます。','使用する肥料在庫ロットを選びます。','施肥する圃場を選びます。','施肥量、方法、天候などを入力します。','N・P・K投入量を確認して登録します。'],notes:['登録すると肥料在庫が減少し、圃場別の年間養分集計へ反映されます。']},
      {title:'施肥履歴・年間施肥計画',summary:'実施した施肥と今後の施肥予定を分けて確認します。',path:'/fertilizer-history',steps:['「施肥履歴」で過去の施肥量・圃場・肥料を確認します。','必要に応じて編集・削除します。','「年間施肥計画」で月・時期・圃場・目的・予定量を登録します。'],notes:['年間計画は「年間施肥計画」メニューから開けます。']},
    ]
  },
  {
    id:'fields', label:'圃場', description:'圃場情報と、圃場を起点にした作業・生産・販売履歴を確認します。',
    items:[
      {title:'圃場一覧と圃場カルテ',summary:'区画ごとの面積・情報を管理し、1つの圃場から関連履歴を追跡します。',path:'/fields',steps:['「圃場」を開きます。','対象区画を選び圃場カルテを開きます。','散布・施肥・摘採などの履歴を確認します。','摘採から製茶・製造・製品ロット・販売先までつながるデータがある場合はトレーサビリティを確認します。'],notes:['圃場面積は散布量や施肥量の計算にも使用されます。']},
    ]
  },
  {
    id:'harvest', label:'摘採・製造', description:'生葉の摘採から一次製茶、二次加工、商品化までを管理します。',
    items:[
      {title:'摘採を登録する',summary:'圃場ごとの摘採日・生葉重量・摘採方法などを記録します。',path:'/harvests',steps:['「摘採・製茶」を開きます。','摘採日、圃場、茶期、摘採方法、生葉重量などを登録します。','必要に応じて摘採面積、担当者、搬入先、品質メモなども入力します。','未加工の生葉残量を確認します。']},
      {title:'一次製茶を登録する',summary:'複数の摘採記録をまとめて製茶し、碾茶・玉露などの出来高と歩留まりを記録します。',path:'/harvests',steps:['「摘採・製茶」の製茶側を開きます。','原料に使う摘採記録を選び、各投入kgを指定します。','加工日、工程、製品重量、工場、加工費などを入力します。','入力重量を超えて使っていないことを確認し登録します。']},
      {title:'製造・製品在庫',summary:'一次製茶後の原料や購入原料をロット管理し、二次加工・在庫・原価を管理します。',path:'/production',steps:['「製造・製品在庫」を開きます。','必要に応じて原料・製品ロットを入庫します。','二次加工では入力ロットを選び、加工後の出力ロットを作成します。','原料原価、加工費、包材費、その他費用から総原価と単位原価を確認します。','棚卸調整・廃棄・加工履歴も同じ画面から管理します。']},
      {title:'商品マスタ',summary:'販売する商品のSKU・内容量・容器・標準価格・包材原価などを登録します。',path:'/products',steps:['「商品マスタ」を開きます。','SKU、商品名、カテゴリ、ブランド、内容量、容器、標準価格、包材原価などを登録します。','販売を止める場合はステータスを変更します。','過去履歴を保持するため削除は安全な方式で処理されます。'],adminOnly:true},
      {title:'商品化・SKU在庫',summary:'抹茶などの原料kgを、30g缶・袋・箱など販売単位の商品在庫へ変換します。',path:'/product-packaging',steps:['「商品化・SKU在庫」を開きます。','原料ロットと商品マスタのSKUを選びます。','製造個数を入力します。','必要原料量、商品化後の原料残量、原料原価、包材原価、総原価、1個原価を確認します。','登録するとSKU単位の製品ロットが入庫されます。'],notes:['商品マスタの内容量と包材原価を使って自動計算します。']},
    ]
  },
  {
    id:'sales', label:'販売', description:'製品在庫の出庫、売上、原価、粗利、販売先トレーサビリティを管理します。',
    items:[
      {title:'販売・出庫を登録する',summary:'在庫のある製品ロットを選び、販売数量・単価・販売先を記録します。',path:'/sales',steps:['「販売・出庫」を開きます。','在庫のある製品ロットを選びます。','数量と販売単価を入力します。','販売先、チャネル、請求書番号、発送先など必要情報を入力します。','売上、売上原価、粗利、粗利率を確認して登録します。'],notes:['販売登録すると製品在庫が減少します。取消した場合は対象在庫が戻ります。','販売履歴はCSV出力にも対応しています。']},
    ]
  },
  {
    id:'common', label:'日報・経費', description:'日々の作業記録と経費精算を管理します。',
    items:[
      {title:'日報を書く・振り返る',summary:'作業内容と振り返りを1日単位で記録し、月別・圃場別に後から確認します。',path:'/daily-reports',steps:['「日報」を開きます。','日付、作業時間、天気・現場状況、関連圃場を入力します。','作業内容、良かった点、課題、次回やることを入力して保存します。','履歴では月、担当者、圃場、キーワードで絞り込みます。'],notes:['原則として1人1日1件の日報として管理します。']},
      {title:'経費精算を申請する',summary:'1回の購入で複数商品を買った場合も、複数明細をまとめて精算申請できます。',path:'/expenses',steps:['「経費精算」を開きます。','購入日時、購入先、備考を入力します。','購入内容ごとに数量、税込単価、税率を入力します。','必要なだけ明細を追加し、申請合計を確認します。','申請を送信します。','差戻された場合は内容を修正して再申請します。'],notes:['申請中・承認済の内容は申請者側から自由に変更できないよう保護されています。']},
      {title:'経費を承認・CSV出力する',summary:'管理者は全員の精算申請を確認し、承認・差戻し・CSV出力を行います。',path:'/expenses',steps:['申請一覧から対象を開きます。','明細、購入先、合計金額などを確認します。','問題なければ承認、修正が必要ならコメントを付けて差戻します。','必要な月・状態などへ絞り込み、CSVを出力します。'],adminOnly:true},
    ]
  },
  {
    id:'admin', label:'設定・管理', description:'管理者向けの警告基準、天気地点、ユーザー権限、監査ログです。',
    items:[
      {title:'設定・監査',summary:'ダッシュボード警告基準、天気地点、ユーザー権限、操作履歴を管理します。',path:'/settings',adminOnly:true,steps:['「設定・監査」を開きます。','在庫残量、使用期限、防除予定、摘採予定の警告基準を必要に応じて変更します。','ダッシュボードに表示する天気地点を設定します。','ユーザー権限を管理者／作業者へ変更します。','監査ログで作成・更新・削除・同期操作を確認します。'],notes:['監査ログは「誰が・何を・いつ変更したか」を確認するために使用します。']},
    ]
  },
  {
    id:'help', label:'困ったとき', description:'入力や表示で迷ったときの基本的な確認方法です。',
    items:[
      {title:'登録ボタンが押せない・項目が出ない',summary:'入力不足、権限、前工程のデータ不足などを確認します。',steps:['画面上部の赤いエラーメッセージを確認します。','必須項目が空欄になっていないか確認します。','在庫を使う機能では、対象ロットの在庫が0になっていないか確認します。','管理者限定操作の場合は現在のユーザー権限を確認します。','公式DB検索は同期済みか、検索語を短くして再検索します。']},
      {title:'データを修正したい',summary:'履歴画面または対象機能の編集操作から修正します。',steps:['該当する履歴・ロット・マスタを検索します。','編集ボタンがある場合は編集を使用します。','削除・取消時に在庫が戻る機能では確認メッセージを必ず確認します。','編集ボタンが表示されない場合は権限または後続データとの関連を確認します。']},
    ]
  },
]

const normalize=(v:string)=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ')
const buildDate = new Intl.DateTimeFormat('ja-JP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tokyo'}).format(new Date(__APP_BUILD_TIME__))

export default function ManualPage(){
  const[query,setQuery]=useState('')
  const filtered=useMemo(()=>{
    const q=normalize(query.trim())
    if(!q)return guideSections
    return guideSections.map(section=>({...section,items:section.items.filter(item=>normalize([section.label,section.description,item.title,item.summary,...item.steps,...(item.notes||[])].join(' ')).includes(q))})).filter(section=>section.items.length>0)
  },[query])
  const total=filtered.reduce((sum,s)=>sum+s.items.length,0)
  return <div className="page manual-page">
    <div className="page-head manual-page-head"><div><p className="eyebrow">OPERATION GUIDE</p><h1>操作ガイド</h1><p className="sub">現在の茶園管理アプリに合わせた説明書です。機能の追加・更新と同じソースで管理され、アプリのデプロイ時に最新版へ置き換わります。</p></div><div className="manual-version"><span><Clock3 size={14}/>アプリ更新 {buildDate}</span><span><GitBranch size={14}/>rev {__APP_REVISION__||'build'}</span></div></div>

    <section className="manual-intro panel"><div className="manual-intro-icon"><BookOpen size={24}/></div><div><h2>この説明書について</h2><p>外部PDFではなくアプリ本体に組み込んでいます。アプリを新しいリビジョンへ更新すると、このページも同じデプロイ内容で上書きされます。</p></div><div className="manual-policy"><ShieldCheck size={17}/><span>説明書だけ古い版が残らない構成</span></div></section>

    <div className="manual-search search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="例：FAMIC、肥料、経費、商品化、CSV で検索"/><span>{total}項目</span></div>

    <div className="manual-layout">
      <aside className="manual-index panel"><div className="manual-index-title"><CircleHelp size={17}/><b>目次</b></div>{guideSections.map(section=><a key={section.id} href={`#manual-${section.id}`}>{section.label}<ChevronRight size={15}/></a>)}</aside>
      <main className="manual-content">
        {filtered.map(section=><section className="manual-section" id={`manual-${section.id}`} key={section.id}><div className="manual-section-head"><div><span>{section.label}</span><h2>{section.description}</h2></div><b>{section.items.length}</b></div><div className="manual-items">{section.items.map((item,index)=><article className="manual-card" key={`${section.id}-${item.title}`}><div className="manual-card-head"><div><span>{String(index+1).padStart(2,'0')}</span><div><div className="manual-title-row"><h3>{item.title}</h3>{item.adminOnly&&<em>管理者操作あり</em>}</div><p>{item.summary}</p></div></div>{item.path&&<Link to={item.path}>この画面を開く<ChevronRight size={15}/></Link>}</div><ol>{item.steps.map(step=><li key={step}>{step}</li>)}</ol>{item.notes?.length?<div className="manual-notes"><Lightbulb size={16}/><div>{item.notes.map(note=><p key={note}>{note}</p>)}</div></div>:null}</article>)}</div></section>)}
        {!filtered.length&&<div className="manual-empty panel"><Search size={28}/><h2>該当する説明がありません</h2><p>検索語を短くするか、別の言葉で検索してください。</p></div>}
      </main>
    </div>
  </div>
}
