import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { NavLink, Route, Routes } from 'react-router-dom'
import {
  Home,
  SprayCan,
  Boxes,
  MapPinned,
  CalendarDays,
  ShieldCheck,
  LogOut,
  RefreshCw,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { loadDashboard, type DashboardData } from './lib/dashboard'

const yen = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
})

function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setError('')

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() || email.split('@')[0] },
          },
        })
        if (signUpError) throw signUpError

        if (!data.session) {
          setMessage('登録しました。確認メールが届いた場合は、メール内のリンクを開いてからログインしてください。')
          setMode('signin')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) throw signInError
      }
    } catch (e: any) {
      setError(e?.message || '認証に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <ShieldCheck size={34} />
          <div>
            <p className="eyebrow">GODAI-ME YAGI ICHIBEI</p>
            <h1>茶園防除管理</h1>
          </div>
        </div>

        <p className="auth-lead">農薬在庫・薬液調製・散布・圃場・年間計画を安全に一元管理します。</p>

        <div className="auth-tabs">
          <button className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')} type="button">ログイン</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')} type="button">初回登録</button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && (
            <label>
              表示名
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例：山田" />
            </label>
          )}
          <label>
            メールアドレス
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            パスワード
            <input type="password" required minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          {error && <div className="notice error">{error}</div>}
          {message && <div className="notice success">{message}</div>}

          <button className="primary-button" disabled={busy} type="submit">
            {busy ? '処理中…' : mode === 'signin' ? 'ログイン' : 'アカウントを作成'}
          </button>
        </form>

        <p className="auth-foot">初回に登録されたユーザーは管理者として登録されます。2人目以降は作業者権限です。</p>
      </div>
    </div>
  )
}

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      setData(await loadDashboard())
    } catch (e: any) {
      setError(e?.message || 'ダッシュボードを読み込めませんでした。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const cards = [
    ['在庫金額', data ? yen.format(data.stockValue) : '—'],
    ['在庫ロット', data ? `${data.stockLots}件` : '—'],
    ['前回散布', data?.lastSpray?.date || '—'],
    ['次回予定', data?.nextPlan?.label || '—'],
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">GODAI-ME YAGI ICHIBEI</p>
          <h1>茶園防除管理</h1>
          <p className="sub">農薬在庫・薬液調製・散布・圃場・年間計画を一元管理</p>
        </div>
        <div className="head-actions">
          <span className="status">Supabase 接続済</span>
          <button className="icon-button" type="button" onClick={() => void refresh()} disabled={loading} aria-label="更新">
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {error && <div className="notice error dashboard-notice">{error}</div>}

      <div className="metrics">
        {cards.map(([label, value]) => (
          <article className="metric" key={label}>
            <span>{label}</span>
            <strong>{loading && !data ? '…' : value}</strong>
          </article>
        ))}
      </div>

      <div className="panel-grid">
        <section className="panel">
          <div className="panel-title"><h2>前回の散布記録</h2>{data?.lastSpray?.legacyId && <span>{data.lastSpray.legacyId}</span>}</div>
          {data?.lastSpray ? (
            <div className="detail-list">
              <div><span>散布日</span><b>{data.lastSpray.date}</b></div>
              <div><span>調製量</span><b>{data.lastSpray.preparedL.toLocaleString()}L</b></div>
              <div><span>目的</span><b>{data.lastSpray.target || '未入力'}</b></div>
              <div><span>担当</span><b>{data.lastSpray.operator || '未入力'}</b></div>
              <div><span>天候</span><b>{data.lastSpray.weather || '未入力'}</b></div>
              <div className="detail-wide"><span>使用農薬</span><b>{data.lastSpray.chemicals.length ? data.lastSpray.chemicals.join(' / ') : '明細なし'}</b></div>
            </div>
          ) : <p className="empty">散布記録はありません。</p>}
        </section>

        <section className="panel">
          <div className="panel-title"><h2>次回の散布予定</h2>{data?.nextPlan?.legacyId && <span>{data.nextPlan.legacyId}</span>}</div>
          {data?.nextPlan ? (
            <div className="detail-list">
              <div><span>予定</span><b>{data.nextPlan.label}</b></div>
              <div><span>対象</span><b>{data.nextPlan.target}</b></div>
              <div><span>推奨農薬</span><b>{data.nextPlan.pesticide}</b></div>
              <div className="detail-wide"><span>注意事項</span><b>{data.nextPlan.note || 'なし'}</b></div>
            </div>
          ) : <p className="empty">今後の予定はありません。</p>}
        </section>
      </div>
    </div>
  )
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="page">
      <div className="page-head"><div><h1>{title}</h1><p className="sub">{description}</p></div></div>
      <section className="panel"><p className="empty">この画面は次の実装工程でSupabaseに接続します。</p></section>
    </div>
  )
}

function AppShell({ session }: { session: Session }) {
  async function signOut() {
    await supabase.auth.signOut()
  }

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
        <div className="sidebar-user">
          <span>{session.user.email}</span>
          <button type="button" onClick={() => void signOut()}><LogOut size={17}/>ログアウト</button>
        </div>
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

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div className="boot-screen"><ShieldCheck size={36}/><span>読み込み中…</span></div>
  }

  if (!session) return <AuthScreen />
  return <AppShell session={session} />
}
