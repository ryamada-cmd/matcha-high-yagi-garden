import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Home, SprayCan, Boxes, MapPinned, CalendarDays, ShieldCheck, LogOut, Database, History, Settings, Menu, X, ChevronRight, Leaf, Scissors, Factory, ShoppingCart, Package, PackageCheck, ClipboardList, ReceiptText, BookOpen, Tractor, FileCheck2, LockKeyhole, Tags, FileText, Cloud } from 'lucide-react'
import { supabase } from './lib/supabase'
import { AppPermissionProvider, useAppPermissions } from './lib/permissions'
import HomeDashboardPage from './pages/HomeDashboardPage'

const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const SprayPage = lazy(() => import('./pages/SprayPage'))
const SprayHistoryPage = lazy(() => import('./pages/SprayHistoryPage'))
const FieldsPage = lazy(() => import('./pages/FieldsPage'))
const FieldDossierPage = lazy(() => import('./pages/FieldDossierPage'))
const PlansPage = lazy(() => import('./pages/PlansPage'))
const PesticideCatalogPage = lazy(() => import('./pages/PesticideCatalogPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const FertilizerMasterPage = lazy(() => import('./pages/FertilizerMasterPage'))
const FertilizerInventoryPage = lazy(() => import('./pages/FertilizerInventoryPage'))
const FertilizerApplicationPage = lazy(() => import('./pages/FertilizerApplicationPage'))
const FertilizerHistoryPage = lazy(() => import('./pages/FertilizerHistoryPage'))
const FertilizerPlansPage = lazy(() => import('./pages/FertilizerPlansPage'))
const HarvestProcessingPage = lazy(() => import('./pages/HarvestProcessingPage'))
const ProductionPage = lazy(() => import('./pages/ProductionPage'))
const SalesPage = lazy(() => import('./pages/SalesPage'))
const ProductMasterPage = lazy(() => import('./pages/ProductMasterPage'))
const ProductPackagingPage = lazy(() => import('./pages/ProductPackagingPage'))
const PriceListPage = lazy(() => import('./pages/PriceListPage'))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'))
const DailyReportsPage = lazy(() => import('./pages/DailyReportsPage'))
const ExpenseClaimsPage = lazy(() => import('./pages/ExpenseClaimsPage'))
const VendorInvoicesPage = lazy(() => import('./pages/VendorInvoicesPage'))
const EquipmentPage = lazy(() => import('./pages/EquipmentPage'))
const StoragePage = lazy(() => import('./pages/StoragePage'))
const ManualPage = lazy(() => import('./pages/ManualPage'))

function RouteFallback() {
  return <div className="page"><section className="panel"><div className="boot-screen"><ShieldCheck size={30}/><span>画面を読み込み中…</span></div></section></div>
}

function AccessDenied() {
  return <div className="page"><section className="panel permission-access-denied"><LockKeyhole size={34}/><h2>この機能を利用する権限がありません</h2><p>管理者に機能別権限の設定を確認してください。権限が変更された場合は画面を再読み込みすると反映されます。</p><Link className="secondary-button" to="/">ホームへ戻る</Link></section></div>
}

function PermissionRoute({ permission, children }: { permission:string; children:ReactNode }) {
  const { loading, allowed } = useAppPermissions()
  if (loading) return <RouteFallback/>
  return allowed(permission) ? <>{children}</> : <AccessDenied/>
}

function AuthScreen() {
  const [mode, setMode] = useState<'signin'|'signup'>('signin')
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
        if (!data.session) {
          setMessage('登録しました。確認メールのリンクを開くと、このアプリへ戻ります。')
          setMode('signin')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) throw signInError
      }
    } catch (e: any) {
      setError(e?.message || '認証に失敗しました。')
    } finally { setBusy(false) }
  }

  return <div className="auth-page"><div className="auth-card">
    <div className="auth-brand"><ShieldCheck size={34}/><div><p className="eyebrow">GODAI-ME YAGI ICHIBEI</p><h1>茶園管理</h1></div></div>
    <p className="auth-lead">防除・施肥・摘採・製茶・製造・製品在庫・販売・帳票・圃場・機械設備・ファイルを一元管理します。</p>
    <div className="auth-tabs"><button className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')} type="button">ログイン</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')} type="button">初回登録</button></div>
    <form onSubmit={submit} className="auth-form">
      {mode === 'signup' && <label>表示名<input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="例：山田"/></label>}
      <label>メールアドレス<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/></label>
      <label>パスワード<input type="password" required minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)}/></label>
      {error && <div className="notice error">{error}</div>}{message && <div className="notice success">{message}</div>}
      <button className="primary-button" disabled={busy}>{busy ? '処理中…' : mode === 'signin' ? 'ログイン' : 'アカウントを作成'}</button>
    </form>
    <p className="auth-foot">初回登録ユーザーは管理者、2人目以降は作業者として登録されます。</p>
  </div></div>
}

function AppShell({ session }: { session: Session }) {
  const { allowed, loading: permissionLoading, error: permissionError } = useAppPermissions()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMobileMenuOpen(false), [location.pathname])
  useEffect(() => {
    if (!mobileMenuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey) }
  }, [mobileMenuOpen])

  const defenseVisible = ['sprays.view','pesticide_inventory.view','pesticides.view','spray_plans.view'].some(allowed)
  const fertilizerVisible = ['fertilizer_applications.view','fertilizer_inventory.view','fertilizers.view','fertilizer_plans.view'].some(allowed)
  const productionVisible = ['harvest_processing.view','production.view','products.view','packaging.view','sales.view','documents.view'].some(allowed)
  const commonVisible = ['daily_reports.view','expenses.view','vendor_invoices.view','fields.view','storage.view','manual.view','settings.view'].some(allowed)
  const menuRouteActive = ['/spray-history','/inventory','/pesticides','/plans','/fertilizer-history','/fertilizers','/fertilizer-inventory','/fertilizer-plans','/harvests','/production','/products','/price-list','/product-packaging','/sales','/documents','/equipment','/daily-reports','/expenses','/vendor-invoices','/fields','/storage','/manual','/settings'].some(p => location.pathname.startsWith(p))

  if (permissionLoading) return <div className="boot-screen"><ShieldCheck size={36}/><span>権限を確認中…</span></div>

  return <div className="app-shell">
    <aside className="sidebar desktop-sidebar">
      <div className="brand brand-logo-block"><img className="app-brand-logo" src="/yagi-ichibei-logo.svg" alt="五代目八木一兵衛"/><span>茶園管理</span></div>
      <nav>
        {allowed('dashboard.view')&&<NavLink to="/" end><Home size={20}/>ダッシュボード</NavLink>}
        {defenseVisible&&<><div className="nav-section-label">防除</div>
          {allowed('sprays.view')&&<><NavLink to="/sprays"><SprayCan size={20}/>散布</NavLink><NavLink to="/spray-history"><History size={20}/>散布履歴</NavLink></>}
          {allowed('pesticide_inventory.view')&&<NavLink to="/inventory"><Boxes size={20}/>農薬在庫</NavLink>}
          {allowed('pesticides.view')&&<NavLink to="/pesticides"><Database size={20}/>農薬検索</NavLink>}
          {allowed('spray_plans.view')&&<NavLink to="/plans"><CalendarDays size={20}/>年間防除計画</NavLink>}
        </>}
        {fertilizerVisible&&<><div className="nav-section-label">施肥</div>
          {allowed('fertilizer_applications.view')&&<><NavLink to="/fertilizer-applications"><Leaf size={20}/>施肥</NavLink><NavLink to="/fertilizer-history"><History size={20}/>施肥履歴</NavLink></>}
          {allowed('fertilizer_inventory.view')&&<NavLink to="/fertilizer-inventory"><Boxes size={20}/>肥料在庫</NavLink>}
          {allowed('fertilizers.view')&&<NavLink to="/fertilizers"><Database size={20}/>肥料マスタ</NavLink>}
          {allowed('fertilizer_plans.view')&&<NavLink to="/fertilizer-plans"><CalendarDays size={20}/>年間施肥計画</NavLink>}
        </>}
        {productionVisible&&<><div className="nav-section-label">収穫・製造・販売</div>
          {allowed('harvest_processing.view')&&<NavLink to="/harvests"><Scissors size={20}/>摘採・製茶</NavLink>}
          {allowed('production.view')&&<NavLink to="/production"><Factory size={20}/>製造・製品在庫</NavLink>}
          {allowed('products.view')&&<><NavLink to="/products"><Package size={20}/>商品マスタ</NavLink><NavLink to="/price-list"><Tags size={20}/>商品価格表</NavLink></>}
          {allowed('packaging.view')&&<NavLink to="/product-packaging"><PackageCheck size={20}/>商品化・SKU在庫</NavLink>}
          {allowed('sales.view')&&<NavLink to="/sales"><ShoppingCart size={20}/>販売・出庫</NavLink>}
          {allowed('documents.view')&&<NavLink to="/documents"><FileText size={20}/>請求書・納品書</NavLink>}
        </>}
        {allowed('equipment.view')&&<><div className="nav-section-label">設備</div><NavLink to="/equipment"><Tractor size={20}/>機械設備管理</NavLink></>}
        {commonVisible&&<><div className="nav-section-label">共通</div>
          {allowed('daily_reports.view')&&<NavLink to="/daily-reports"><ClipboardList size={20}/>日報</NavLink>}
          {allowed('expenses.view')&&<NavLink to="/expenses"><ReceiptText size={20}/>経費精算</NavLink>}
          {allowed('vendor_invoices.view')&&<NavLink to="/vendor-invoices"><FileCheck2 size={20}/>仕入請求書・支払</NavLink>}
          {allowed('fields.view')&&<NavLink to="/fields"><MapPinned size={20}/>圃場</NavLink>}
          {allowed('storage.view')&&<NavLink to="/storage"><Cloud size={20}/>ファイル・OneDrive</NavLink>}
          {allowed('manual.view')&&<NavLink to="/manual"><BookOpen size={20}/>操作ガイド</NavLink>}
          {allowed('settings.view')&&<NavLink to="/settings"><Settings size={20}/>設定・監査</NavLink>}
        </>}
      </nav>
      <div className="sidebar-user"><span>{session.user.email}</span>{permissionError&&<small>{permissionError}</small>}<button onClick={() => void supabase.auth.signOut()}><LogOut size={17}/>ログアウト</button></div>
    </aside>

    <header className="mobile-topbar"><div className="mobile-brand mobile-logo-block"><img className="app-brand-logo" src="/yagi-ichibei-logo.svg" alt="五代目八木一兵衛"/></div><button type="button" className="mobile-menu-trigger" aria-label="メニューを開く" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)}><Menu size={22}/></button></header>

    <main><Suspense fallback={<RouteFallback/>}><Routes>
      <Route path="/" element={<PermissionRoute permission="dashboard.view"><HomeDashboardPage/></PermissionRoute>}/>
      <Route path="/sprays" element={<PermissionRoute permission="sprays.view"><SprayPage/></PermissionRoute>}/><Route path="/spray-history" element={<PermissionRoute permission="sprays.view"><SprayHistoryPage/></PermissionRoute>}/><Route path="/inventory" element={<PermissionRoute permission="pesticide_inventory.view"><InventoryPage/></PermissionRoute>}/><Route path="/pesticides" element={<PermissionRoute permission="pesticides.view"><PesticideCatalogPage/></PermissionRoute>}/><Route path="/plans" element={<PermissionRoute permission="spray_plans.view"><PlansPage/></PermissionRoute>}/>
      <Route path="/fertilizer-applications" element={<PermissionRoute permission="fertilizer_applications.view"><FertilizerApplicationPage/></PermissionRoute>}/><Route path="/fertilizer-history" element={<PermissionRoute permission="fertilizer_applications.view"><FertilizerHistoryPage/></PermissionRoute>}/><Route path="/fertilizer-inventory" element={<PermissionRoute permission="fertilizer_inventory.view"><FertilizerInventoryPage/></PermissionRoute>}/><Route path="/fertilizers" element={<PermissionRoute permission="fertilizers.view"><FertilizerMasterPage/></PermissionRoute>}/><Route path="/fertilizer-plans" element={<PermissionRoute permission="fertilizer_plans.view"><FertilizerPlansPage/></PermissionRoute>}/>
      <Route path="/harvests" element={<PermissionRoute permission="harvest_processing.view"><HarvestProcessingPage/></PermissionRoute>}/><Route path="/production" element={<PermissionRoute permission="production.view"><ProductionPage/></PermissionRoute>}/><Route path="/products" element={<PermissionRoute permission="products.view"><ProductMasterPage/></PermissionRoute>}/><Route path="/price-list" element={<PermissionRoute permission="products.view"><PriceListPage/></PermissionRoute>}/><Route path="/product-packaging" element={<PermissionRoute permission="packaging.view"><ProductPackagingPage/></PermissionRoute>}/><Route path="/sales" element={<PermissionRoute permission="sales.view"><SalesPage/></PermissionRoute>}/><Route path="/documents" element={<PermissionRoute permission="documents.view"><DocumentsPage/></PermissionRoute>}/>
      <Route path="/equipment" element={<PermissionRoute permission="equipment.view"><EquipmentPage/></PermissionRoute>}/><Route path="/daily-reports" element={<PermissionRoute permission="daily_reports.view"><DailyReportsPage/></PermissionRoute>}/><Route path="/expenses" element={<PermissionRoute permission="expenses.view"><ExpenseClaimsPage/></PermissionRoute>}/><Route path="/vendor-invoices" element={<PermissionRoute permission="vendor_invoices.view"><VendorInvoicesPage/></PermissionRoute>}/><Route path="/fields" element={<PermissionRoute permission="fields.view"><FieldsPage/></PermissionRoute>}/><Route path="/fields/:fieldId" element={<PermissionRoute permission="fields.view"><FieldDossierPage/></PermissionRoute>}/><Route path="/storage" element={<PermissionRoute permission="storage.view"><StoragePage/></PermissionRoute>}/><Route path="/manual" element={<PermissionRoute permission="manual.view"><ManualPage/></PermissionRoute>}/><Route path="/settings" element={<PermissionRoute permission="settings.view"><SettingsPage/></PermissionRoute>}/>
    </Routes></Suspense></main>

    <nav className="mobile-bottom-nav" aria-label="主要メニュー">
      {allowed('dashboard.view')&&<NavLink to="/" end><Home size={21}/><span>ホーム</span></NavLink>}
      {allowed('sprays.view')&&<NavLink to="/sprays"><SprayCan size={21}/><span>散布</span></NavLink>}
      {allowed('fertilizer_applications.view')&&<NavLink to="/fertilizer-applications"><Leaf size={21}/><span>施肥</span></NavLink>}
      {allowed('fields.view')&&<NavLink to="/fields"><MapPinned size={21}/><span>圃場</span></NavLink>}
      <button type="button" className={menuRouteActive ? 'active' : ''} onClick={() => setMobileMenuOpen(true)}><Menu size={21}/><span>メニュー</span></button>
    </nav>

    {mobileMenuOpen && <div className="mobile-more-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setMobileMenuOpen(false) }}><section className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="その他のメニュー">
      <div className="mobile-more-head"><div><b>茶園管理メニュー</b><span>{session.user.email}</span></div><button type="button" aria-label="閉じる" onClick={() => setMobileMenuOpen(false)}><X size={21}/></button></div>
      <div className="mobile-more-links">
        {defenseVisible&&<><div className="mobile-menu-label">防除</div>{allowed('sprays.view')&&<NavLink to="/spray-history"><span><History size={20}/>散布履歴</span><ChevronRight size={18}/></NavLink>}{allowed('pesticide_inventory.view')&&<NavLink to="/inventory"><span><Boxes size={20}/>農薬在庫</span><ChevronRight size={18}/></NavLink>}{allowed('pesticides.view')&&<NavLink to="/pesticides"><span><Database size={20}/>農薬検索</span><ChevronRight size={18}/></NavLink>}{allowed('spray_plans.view')&&<NavLink to="/plans"><span><CalendarDays size={20}/>年間防除計画</span><ChevronRight size={18}/></NavLink>}</>}
        {fertilizerVisible&&<><div className="mobile-menu-label">施肥</div>{allowed('fertilizer_applications.view')&&<NavLink to="/fertilizer-history"><span><History size={20}/>施肥履歴</span><ChevronRight size={18}/></NavLink>}{allowed('fertilizer_inventory.view')&&<NavLink to="/fertilizer-inventory"><span><Boxes size={20}/>肥料在庫</span><ChevronRight size={18}/></NavLink>}{allowed('fertilizers.view')&&<NavLink to="/fertilizers"><span><Database size={20}/>肥料マスタ</span><ChevronRight size={18}/></NavLink>}{allowed('fertilizer_plans.view')&&<NavLink to="/fertilizer-plans"><span><CalendarDays size={20}/>年間施肥計画</span><ChevronRight size={18}/></NavLink>}</>}
        {productionVisible&&<><div className="mobile-menu-label">収穫・製造・販売</div>{allowed('harvest_processing.view')&&<NavLink to="/harvests"><span><Scissors size={20}/>摘採・製茶</span><ChevronRight size={18}/></NavLink>}{allowed('production.view')&&<NavLink to="/production"><span><Factory size={20}/>製造・製品在庫</span><ChevronRight size={18}/></NavLink>}{allowed('products.view')&&<><NavLink to="/products"><span><Package size={20}/>商品マスタ</span><ChevronRight size={18}/></NavLink><NavLink to="/price-list"><span><Tags size={20}/>商品価格表</span><ChevronRight size={18}/></NavLink></>}{allowed('packaging.view')&&<NavLink to="/product-packaging"><span><PackageCheck size={20}/>商品化・SKU在庫</span><ChevronRight size={18}/></NavLink>}{allowed('sales.view')&&<NavLink to="/sales"><span><ShoppingCart size={20}/>販売・出庫</span><ChevronRight size={18}/></NavLink>}{allowed('documents.view')&&<NavLink to="/documents"><span><FileText size={20}/>請求書・納品書</span><ChevronRight size={18}/></NavLink>}</>}
        {allowed('equipment.view')&&<><div className="mobile-menu-label">設備</div><NavLink to="/equipment"><span><Tractor size={20}/>機械設備管理</span><ChevronRight size={18}/></NavLink></>}
        {commonVisible&&<><div className="mobile-menu-label">共通</div>{allowed('daily_reports.view')&&<NavLink to="/daily-reports"><span><ClipboardList size={20}/>日報</span><ChevronRight size={18}/></NavLink>}{allowed('expenses.view')&&<NavLink to="/expenses"><span><ReceiptText size={20}/>経費精算</span><ChevronRight size={18}/></NavLink>}{allowed('vendor_invoices.view')&&<NavLink to="/vendor-invoices"><span><FileCheck2 size={20}/>仕入請求書・支払</span><ChevronRight size={18}/></NavLink>}{allowed('fields.view')&&<NavLink to="/fields"><span><MapPinned size={20}/>圃場</span><ChevronRight size={18}/></NavLink>}{allowed('storage.view')&&<NavLink to="/storage"><span><Cloud size={20}/>ファイル・OneDrive</span><ChevronRight size={18}/></NavLink>}{allowed('manual.view')&&<NavLink to="/manual"><span><BookOpen size={20}/>操作ガイド</span><ChevronRight size={18}/></NavLink>}{allowed('settings.view')&&<><div className="mobile-menu-label">管理</div><NavLink to="/settings"><span><Settings size={20}/>設定・監査</span><ChevronRight size={18}/></NavLink></>}</>}
      </div>
      <button className="mobile-logout" type="button" onClick={() => void supabase.auth.signOut()}><LogOut size={18}/>ログアウト</button>
    </section></div>}
  </div>
}

export default function App() {
  const [session, setSession] = useState<Session|null|undefined>(undefined)
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <div className="boot-screen"><ShieldCheck size={36}/><span>読み込み中…</span></div>
  return session ? <AppPermissionProvider userId={session.user.id}><AppShell session={session}/></AppPermissionProvider> : <AuthScreen/>
}