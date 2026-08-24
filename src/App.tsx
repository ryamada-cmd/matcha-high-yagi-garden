import { NavLink, Route, Routes } from 'react-router-dom'
import { Home, SprayCan, Boxes, MapPinned, CalendarDays, ShieldCheck } from 'lucide-react'

const cards = [
  ['在庫金額', '—'],
  ['在庫ロット', '—'],
  ['前回散布', '未接続'],
  ['次回予定', '未接続'],
]

function Dashboard() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">GODAI-ME YAGI ICHIBEI</p>
          <h1>茶園防除管理</h1>
          <p className="sub">農薬在庫・薬液調製・散布・圃場・年間計画を一元管理</p>
        </div>
        <span className="status">新アプリ構築中</span>
      </div>

      <div className="metrics">
        {cards.map(([label, value]) => (
          <article className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h2>前回の散布記録</h2>
          <p className="empty">Supabase接続後に既存データを表示します。</p>
        </section>
        <section className="panel">
          <h2>次回の散布予定</h2>
          <p className="empty">年間計画から自動表示します。</p>
        </section>
      </div>
    </div>
  )
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="page">
      <div className="page-head"><div><h1>{title}</h1><p className="sub">{description}</p></div></div>
      <section className="panel"><p className="empty">DB接続後、この画面を実装します。</p></section>
    </div>
  )
}

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><ShieldCheck size={28}/><div><b>五代目八木一兵衛</b><span>茶園防除管理</span></div></div>
        <nav>
          <NavLink to="/"><Home size={20}/>ダッシュボード</NavLink>
          <NavLink to="/sprays"><SprayCan size={20}/>散布</NavLink>
          <NavLink to="/inventory"><Boxes size={20}/>在庫</NavLink>
          <NavLink to="/fields"><MapPinned size={20}/>圃場</NavLink>
          <NavLink to="/plans"><CalendarDays size={20}/>年間計画</NavLink>
        </nav>
      </aside>

      <main>
        <Routes>
          <Route path="/" element={<Dashboard/>}/>
          <Route path="/sprays" element={<Placeholder title="散布" description="複数農薬の混用・希釈計算・面積比例の全量散布"/>}/>
          <Route path="/inventory" element={<Placeholder title="在庫" description="ロット・残内容量・在庫金額・入出庫履歴"/>}/>
          <Route path="/fields" element={<Placeholder title="圃場" description="圃場面積・標準散布量・追加編集削除"/>}/>
          <Route path="/plans" element={<Placeholder title="年間計画" description="病害虫・推奨農薬・予定日・実施状況"/>}/>
        </Routes>
      </main>
    </div>
  )
}
