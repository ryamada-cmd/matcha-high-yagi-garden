import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Home, SprayCan, Boxes, MapPinned, CalendarDays, ShieldCheck, LogOut, Database, History, Settings, Menu, X, ChevronRight, Leaf, Scissors, Factory, ShoppingCart, Package, PackageCheck, ClipboardList, ReceiptText, BookOpen, Tractor, FileCheck2 } from 'lucide-react'
import { supabase } from './lib/supabase'
import HomeDashboardPage from './pages/HomeDashboardPage'
import InventoryPage from './pages/InventoryPage'
import SprayPage from './pages/SprayPage'
import SprayHistoryPage from './pages/SprayHistoryPage'
import FieldsPage from './pages/FieldsPage'
import FieldDossierPage from './pages/FieldDossierPage'
import PlansPage from './pages/PlansPage'
import PesticideCatalogPage from './pages/PesticideCatalogPage'
import SettingsPage from './pages/SettingsPage'
import FertilizerMasterPage from './pages/FertilizerMasterPage'
import FertilizerInventoryPage from './pages/FertilizerInventoryPage'
import FertilizerApplicationPage from './pages/FertilizerApplicationPage'
import FertilizerHistoryPage from './pages/FertilizerHistoryPage'
import FertilizerPlansPage from './pages/FertilizerPlansPage'
import HarvestProcessingPage from './pages/HarvestProcessingPage'
import ProductionPage from './pages/ProductionPage'
import SalesPage from './pages/SalesPage'
import ProductMasterPage from './pages/ProductMasterPage'
import ProductPackagingPage from './pages/ProductPackagingPage'
import DailyReportsPage from './pages/DailyReportsPage'
import ExpenseClaimsPage from './pages/ExpenseClaimsPage'
import VendorInvoicesPage from './pages/VendorInvoicesPage'
import EquipmentPage from './pages/EquipmentPage'
import ManualPage from './pages/ManualPage'

function AuthScreen(){
  const[mode,setMode]=useState<'signin'|'signup'>('signin'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[displayName,setDisplayName]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setMessage('');setError('');try{if(mode==='signup'){const{data,error:signUpError}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{display_name:displayName.trim()||email.split('@')[0]},emailRedirectTo:window.location.origin}});if(signUpError)throw signUpError;if(!data.session){setMessage('登録しました。確認メールのリンクを開くと、このアプリへ戻ります。');setMode('signin')}}else{const{error:signInError}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(signInError)throw signInError}}catch(e:any){setError(e?.message||'認証に失敗しました。')}finally{setBusy(false)}}
  return <div className="auth-page"><div className="auth-card"><div className="auth-brand"><ShieldCheck size={34}/><div><p className="eyebrow">GODAI-ME YAGI ICHIBEI</p><h1>茶園管理</h1></div></div><p className="auth-lead">防除・施肥・摘採・製茶・製造・製品在庫・販売・圃場・機械設備・請求書を一元管理します。</p><div className="auth-tabs"><button className={mode==='signin'?'active':''} onClick={()=>setMode('signin')} type="button">ログイン</button><button className={mode==='signup'?'active':''} onClick={()=>setMode('signup')} type="button">初回登録</button></div><form onSubmit={submit} className="auth-form">{mode==='signup'&&<label>表示名<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="例：山田"/></label>}<label>メールアドレス<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>パスワード<input type="password" required minLength={8} autoComplete={mode==='signin'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div className="notice error">{error}</div>}{message&&<div className="notice success">{message}</div>}<button className="primary-button" disabled={busy}>{busy?'処理中…':mode==='signin'?'ログイン':'アカウントを作成'}</button></form><p className="auth-foot">初回登録ユーザーは管理者、2人目以降は作業者として登録されます。</p></div></div>
}

function AppShell({session}:{session:Session}){
  const[role,setRole]=useState(''),[mobileMenuOpen,setMobileMenuOpen]=useState(false);const location=useLocation()
  useEffect(()=>{void supabase.from('profiles').select('role').eq('id',session.user.id).maybeSingle().then(({data})=>setRole(data?.role||''))},[session.user.id])
  useEffect(()=>setMobileMenuOpen(false),[location.pathname])
  useEffect(()=>{if(!mobileMenuOpen)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setMobileMenuOpen(false)};window.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)}},[mobileMenuOpen])
  const menuRouteActive=['/spray-history','/inventory','/pesticides','/plans','/fertilizer-history','/fertilizers','/fertilizer-inventory','/fertilizer-plans','/harvests','/production','/products','/product-packaging','/sales','/equipment','/daily-reports','/expenses','/vendor-invoices','/manual','/settings'].some(p=>location.pathname.startsWith(p))
  return <div className="app-shell">
    <aside className="sidebar desktop-sidebar"><div className="brand brand-logo-block"><img className="app-brand-logo" src="/yagi-ichibei-logo.svg" alt="五代目八木一兵衛"/><span>茶園管理</span></div><nav>
      <NavLink to="/" end><Home size={20}/>ダッシュボード</NavLink><div className="nav-section-label">防除</div><NavLink to="/sprays"><SprayCan size={20}/>散布</NavLink><NavLink to="/spray-history"><History size={20}/>散布履歴</NavLink><NavLink to="/inventory"><Boxes size={20}/>農薬在庫</NavLink><NavLink to="/pesticides"><Database size={20}/>農薬検索</NavLink><NavLink to="/plans"><CalendarDays size={20}/>年間防除計画</NavLink>
      <div className="nav-section-label">施肥</div><NavLink to="/fertilizer-applications"><Leaf size={20}/>施肥</NavLink><NavLink to="/fertilizer-history"><History size={20}/>施肥履歴</NavLink><NavLink to="/fertilizer-inventory"><Boxes size={20}/>肥料在庫</NavLink><NavLink to="/fertilizers"><Database size={20}/>肥料マスタ</NavLink><NavLink to="/fertilizer-plans"><CalendarDays size={20}/>年間施肥計画</NavLink>
      <div className="nav-section-label">収穫・製造</div><NavLink to="/harvests"><Scissors size={20}/>摘採・製茶</NavLink><NavLink to="/production"><Factory size={20}/>製造・製品在庫</NavLink><NavLink to="/products"><Package size={20}/>商品マスタ</NavLink><NavLink to="/product-packaging"><PackageCheck size={20}/>商品化・SKU在庫</NavLink><NavLink to="/sales"><ShoppingCart size={20}/>販売・出庫</NavLink>
      <div className="nav-section-label">設備</div><NavLink to="/equipment"><Tractor size={20}/>機械設備管理</NavLink>
      <div className="nav-section-label">共通</div><NavLink to="/daily-reports"><ClipboardList size={20}/>日報</NavLink><NavLink to="/expenses"><ReceiptText size={20}/>経費精算</NavLink>{role==='admin'&&<NavLink to="/vendor-invoices"><FileCheck2 size={20}/>請求書・支払</NavLink>}<NavLink to="/fields"><MapPinned size={20}/>圃場</NavLink><NavLink to="/manual"><BookOpen size={20}/>操作ガイド</NavLink>{role==='admin'&&<NavLink to="/settings"><Settings size={20}/>設定・監査</NavLink>}
    </nav><div className="sidebar-user"><span>{session.user.email}</span><button onClick={()=>void supabase.auth.signOut()}><LogOut size={17}/>ログアウト</button></div></aside>
    <header className="mobile-topbar"><div className="mobile-brand mobile-logo-block"><img className="app-brand-logo" src="/yagi-ichibei-logo.svg" alt="五代目八木一兵衛"/></div><button type="button" className="mobile-menu-trigger" aria-label="メニューを開く" aria-expanded={mobileMenuOpen} onClick={()=>setMobileMenuOpen(true)}><Menu size={22}/></button></header>
    <main><Routes><Route path="/" element={<HomeDashboardPage/>}/><Route path="/sprays" element={<SprayPage/>}/><Route path="/spray-history" element={<SprayHistoryPage/>}/><Route path="/inventory" element={<InventoryPage/>}/><Route path="/pesticides" element={<PesticideCatalogPage/>}/><Route path="/plans" element={<PlansPage/>}/><Route path="/fertilizer-applications" element={<FertilizerApplicationPage/>}/><Route path="/fertilizer-history" element={<FertilizerHistoryPage/>}/><Route path="/fertilizer-inventory" element={<FertilizerInventoryPage/>}/><Route path="/fertilizers" element={<FertilizerMasterPage/>}/><Route path="/fertilizer-plans" element={<FertilizerPlansPage/>}/><Route path="/harvests" element={<HarvestProcessingPage/>}/><Route path="/production" element={<ProductionPage/>}/><Route path="/products" element={<ProductMasterPage/>}/><Route path="/product-packaging" element={<ProductPackagingPage/>}/><Route path="/sales" element={<SalesPage/>}/><Route path="/equipment" element={<EquipmentPage/>}/><Route path="/daily-reports" element={<DailyReportsPage/>}/><Route path="/expenses" element={<ExpenseClaimsPage/>}/><Route path="/vendor-invoices" element={<VendorInvoicesPage/>}/><Route path="/fields" element={<FieldsPage/>}/><Route path="/fields/:fieldId" element={<FieldDossierPage/>}/><Route path="/manual" element={<ManualPage/>}/><Route path="/settings" element={<SettingsPage/>}/></Routes></main>
    <nav className="mobile-bottom-nav" aria-label="主要メニュー"><NavLink to="/" end><Home size={21}/><span>ホーム</span></NavLink><NavLink to="/sprays"><SprayCan size={21}/><span>散布</span></NavLink><NavLink to="/fertilizer-applications"><Leaf size={21}/><span>施肥</span></NavLink><NavLink to="/fields"><MapPinned size={21}/><span>圃場</span></NavLink><button type="button" className={menuRouteActive?'active':''} onClick={()=>setMobileMenuOpen(true)}><Menu size={21}/><span>メニュー</span></button></nav>
    {mobileMenuOpen&&<div className="mobile-more-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setMobileMenuOpen(false)}}><section className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="その他のメニュー"><div className="mobile-more-head"><div><b>茶園管理メニュー</b><span>{session.user.email}</span></div><button type="button" aria-label="閉じる" onClick={()=>setMobileMenuOpen(false)}><X size={21}/></button></div><div className="mobile-more-links">
      <div className="mobile-menu-label">防除</div><NavLink to="/spray-history"><span><History size={20}/>散布履歴</span><ChevronRight size={18}/></NavLink><NavLink to="/inventory"><span><Boxes size={20}/>農薬在庫</span><ChevronRight size={18}/></NavLink><NavLink to="/pesticides"><span><Database size={20}/>農薬検索</span><ChevronRight size={18}/></NavLink><NavLink to="/plans"><span><CalendarDays size={20}/>年間防除計画</span><ChevronRight size={18}/></NavLink>
      <div className="mobile-menu-label">施肥</div><NavLink to="/fertilizer-history"><span><History size={20}/>施肥履歴</span><ChevronRight size={18}/></NavLink><NavLink to="/fertilizer-inventory"><span><Boxes size={20}/>肥料在庫</span><ChevronRight size={18}/></NavLink><NavLink to="/fertilizers"><span><Database size={20}/>肥料マスタ</span><ChevronRight size={18}/></NavLink><NavLink to="/fertilizer-plans"><span><CalendarDays size={20}/>年間施肥計画</span><ChevronRight size={18}/></NavLink>
      <div className="mobile-menu-label">収穫・製造</div><NavLink to="/harvests"><span><Scissors size={20}/>摘採・製茶</span><ChevronRight size={18}/></NavLink><NavLink to="/production"><span><Factory size={20}/>製造・製品在庫</span><ChevronRight size={18}/></NavLink><NavLink to="/products"><span><Package size={20}/>商品マスタ</span><ChevronRight size={18}/></NavLink><NavLink to="/product-packaging"><span><PackageCheck size={20}/>商品化・SKU在庫</span><ChevronRight size={18}/></NavLink><NavLink to="/sales"><span><ShoppingCart size={20}/>販売・出庫</span><ChevronRight size={18}/></NavLink>
      <div className="mobile-menu-label">設備</div><NavLink to="/equipment"><span><Tractor size={20}/>機械設備管理</span><ChevronRight size={18}/></NavLink>
      <div className="mobile-menu-label">共通</div><NavLink to="/daily-reports"><span><ClipboardList size={20}/>日報</span><ChevronRight size={18}/></NavLink><NavLink to="/expenses"><span><ReceiptText size={20}/>経費精算</span><ChevronRight size={18}/></NavLink>{role==='admin'&&<NavLink to="/vendor-invoices"><span><FileCheck2 size={20}/>請求書・支払</span><ChevronRight size={18}/></NavLink>}<NavLink to="/manual"><span><BookOpen size={20}/>操作ガイド</span><ChevronRight size={18}/></NavLink>
      {role==='admin'&&<><div className="mobile-menu-label">管理</div><NavLink to="/settings"><span><Settings size={20}/>設定・監査</span><ChevronRight size={18}/></NavLink></>}
    </div><button className="mobile-logout" type="button" onClick={()=>void supabase.auth.signOut()}><LogOut size={18}/>ログアウト</button></section></div>}
  </div>
}

export default function App(){const[session,setSession]=useState<Session|null|undefined>(undefined);useEffect(()=>{void supabase.auth.getSession().then(({data})=>setSession(data.session));const{data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[]);if(session===undefined)return <div className="boot-screen"><ShieldCheck size={36}/><span>読み込み中…</span></div>;return session?<AppShell session={session}/>:<AuthScreen/>}
