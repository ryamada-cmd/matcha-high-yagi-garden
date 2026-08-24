import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { NavLink, Route, Routes } from 'react-router-dom'
import { Home, SprayCan, Boxes, MapPinned, CalendarDays, ShieldCheck, LogOut, Database, History } from 'lucide-react'
import { supabase } from './lib/supabase'
import DashboardPage from './pages/DashboardPage'
import InventoryPage from './pages/InventoryPage'
import SprayPage from './pages/SprayPage'
import SprayHistoryPage from './pages/SprayHistoryPage'
import FieldsPage from './pages/FieldsPage'
import PlansPage from './pages/PlansPage'
import PesticideCatalogPage from './pages/PesticideCatalogPage'

function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('')
    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: displayName.trim() || email.split('@')[0] }, emailRedirectTo: window.location.origin },
        })
        if (signUpError) throw signUpError
        if (!data.session) { setMessage('登録しました。確認メールのリンクを開くと、このアプリへ戻ります。'); setMode('signin') }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) throw signInError
      }
    } catch (e: any) { setError(e?.message || '認証に失敗しました。') }
    finally { setBusy(false) }
  }

  return <div className="auth-page"><div className="auth-card">
    <div className="auth-brand"><ShieldCheck size={34}/><div><p className="eyebrow">GODAI-ME YAGI ICHIBEI</p><h1>茶園防除管理</h1></div></div>
    <p className="auth-lead">農薬在庫・薬液調製・散布・圃場・年間計画を安全に一元管理します。</p>
    <div className="auth-tabs"><button className={mode==='signin'?'active':''} onClick={()=>setMode('signin')} type="button">ログイン</button><button className={mode==='signup'?'active':''} onClick={()=>setMode('signup')} type="button">初回登録</button></div>
    <form onSubmit={submit} className="auth-form">
      {mode==='signup' && <label>表示名<input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder="例：山田"/></label>}
      <label>メールアドレス<input type="email" required autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)}/></label>
      <label>パスワード<input type="password" required minLength={8} autoComplete={mode==='signin'?'current-password':'new-password'} value={password} onChange={(e)=>setPassword(e.target.value)}/></label>
      {error && <div className="notice error">{error}</div>}{message && <div className="notice success">{message}</div>}
      <button className="primary-button" disabled={busy}>{busy?'処理中…':mode==='signin'?'ログイン':'アカウントを作成'}</button>
    </form>
    <p className="auth-foot">初回登録ユーザーは管理者、2人目以降は作業者として登録されます。</p>
  </div></div>
}

function AppShell({session}:{session:Session}) {
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><ShieldCheck size={28}/><div><b>五代目八木一兵衛</b><span>茶園防除管理</span></div></div><nav>
    <NavLink to="/" end><Home size={20}/>ダッシュボード</NavLink><NavLink to="/sprays"><SprayCan size={20}/>散布</NavLink><NavLink to="/spray-history"><History size={20}/>散布履歴</NavLink><NavLink to="/inventory"><Boxes size={20}/>在庫</NavLink><NavLink to="/pesticides"><Database size={20}/>農薬検索</NavLink><NavLink to="/fields"><MapPinned size={20}/>圃場</NavLink><NavLink to="/plans"><CalendarDays size={20}/>年間計画</NavLink>
  </nav><div className="sidebar-user"><span>{session.user.email}</span><button onClick={()=>void supabase.auth.signOut()}><LogOut size={17}/>ログアウト</button></div></aside><main><Routes>
    <Route path="/" element={<DashboardPage/>}/><Route path="/sprays" element={<SprayPage/>}/><Route path="/spray-history" element={<SprayHistoryPage/>}/><Route path="/inventory" element={<InventoryPage/>}/><Route path="/pesticides" element={<PesticideCatalogPage/>}/><Route path="/fields" element={<FieldsPage/>}/><Route path="/plans" element={<PlansPage/>}/>
  </Routes></main></div>
}

export default function App(){const[session,setSession]=useState<Session|null|undefined>(undefined);useEffect(()=>{void supabase.auth.getSession().then(({data})=>setSession(data.session));const{data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[]);if(session===undefined)return <div className="boot-screen"><ShieldCheck size={36}/><span>読み込み中…</span></div>;return session?<AppShell session={session}/>:<AuthScreen/>}
