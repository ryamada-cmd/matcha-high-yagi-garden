import { useEffect, useMemo, useState } from 'react'
import { MapPinned, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { deleteField, loadFields, saveField, type FieldInput, type FieldRecord } from '../lib/fields'

const emptyForm = (): FieldInput => ({
  legacyId: '', name: '', location: '', areaM2: 0, variety: '', cultivationType: '茶園',
  standardRate: 300, harvestDate: '', status: 'active', note: '',
})

export default function FieldsPage() {
  const [fields, setFields] = useState<FieldRecord[]>([])
  const [role, setRole] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FieldInput>(emptyForm())
  const [formOpen, setFormOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function refresh() {
    setLoading(true); setError('')
    try {
      const data = await loadFields()
      setFields(data.fields); setRole(data.role)
    } catch (e: any) { setError(e?.message || '圃場データを読み込めませんでした。') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])

  const active = fields.filter((f) => f.status === 'active')
  const totalM2 = active.reduce((s, f) => s + f.areaM2, 0)
  const totalL = active.reduce((s, f) => s + f.standardL, 0)
  const groups = useMemo(() => {
    const m = new Map<string, FieldRecord[]>()
    for (const f of fields) {
      const k = f.location || '場所未設定'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(f)
    }
    return [...m.entries()]
  }, [fields])

  const previewStandard = Math.round((Number(form.areaM2) || 0) / 1000 * (Number(form.standardRate) || 0) * 100) / 100

  function beginNew() { setEditingId(null); setForm(emptyForm()); setFormOpen(true); setError(''); setSuccess('') }
  function beginEdit(f: FieldRecord) {
    setEditingId(f.id)
    setForm({ legacyId:f.legacyId,name:f.name,location:f.location,areaM2:f.areaM2,variety:f.variety,cultivationType:f.cultivationType,standardRate:f.standardRate,harvestDate:f.harvestDate,status:f.status,note:f.note })
    setFormOpen(true); setError(''); setSuccess(''); window.scrollTo({top:0,behavior:'smooth'})
  }
  function closeForm() { setFormOpen(false); setEditingId(null); setForm(emptyForm()) }

  async function submit() {
    if (role !== 'admin') return setError('圃場マスタの変更は管理者のみ実行できます。')
    if (!form.name.trim()) return setError('圃場名を入力してください。')
    if (!Number.isFinite(Number(form.areaM2)) || Number(form.areaM2) <= 0) return setError('面積(m²)を正しく入力してください。')
    if (!Number.isFinite(Number(form.standardRate)) || Number(form.standardRate) <= 0) return setError('基準散布量を正しく入力してください。')
    setSaving(true); setError(''); setSuccess('')
    try {
      const r = await saveField(editingId, { ...form, areaM2:Number(form.areaM2), standardRate:Number(form.standardRate) })
      setSuccess(`${r.legacy_id} ${r.name} を${editingId ? '更新' : '追加'}しました。`)
      closeForm(); await refresh()
    } catch (e: any) { setError(e?.message || '圃場の保存に失敗しました。') }
    finally { setSaving(false) }
  }

  async function remove(f: FieldRecord) {
    if (role !== 'admin') return setError('圃場マスタの削除は管理者のみ実行できます。')
    if (!window.confirm(`${f.legacyId}｜${f.name} を削除しますか？\n過去の散布履歴は残ります。`)) return
    const reason = window.prompt('削除理由を入力してください（任意）','')
    if (reason === null) return
    setError(''); setSuccess('')
    try {
      await deleteField(f.id, reason)
      setSuccess(`${f.legacyId} を削除しました。過去履歴は保持されています。`)
      await refresh()
    } catch (e: any) { setError(e?.message || '圃場の削除に失敗しました。') }
  }

  return <div className="page master-page">
    <div className="page-head"><div><p className="eyebrow">FIELDS</p><h1>圃場管理</h1><p className="sub">面積を正本に、反・a・標準散布量を自動計算します。</p></div><div className="head-actions">{role==='admin'&&<button className="secondary-button" onClick={beginNew}><Plus size={16}/>圃場追加</button>}<button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div></div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}{success&&<div className="notice success dashboard-notice">{success}</div>}

    <div className="metrics field-metrics"><article className="metric"><span>有効圃場</span><strong>{active.length}圃場</strong></article><article className="metric"><span>総面積</span><strong>{totalM2.toLocaleString()}㎡</strong></article><article className="metric"><span>総面積（反）</span><strong>{(totalM2/1000).toFixed(3)}反</strong></article><article className="metric"><span>標準散布量合計</span><strong>{Math.round(totalL*10)/10}L</strong></article></div>

    {formOpen&&<section className="panel master-form-panel">
      <div className="section-head"><div><h2>{editingId?'圃場を編集':'圃場を追加'}</h2><p className="muted">標準散布量 = 面積(m²) ÷ 1000 × 基準散布量(L/反)</p></div><button className="close-detail" onClick={closeForm}><X size={16}/></button></div>
      <div className="form-grid four master-form-grid">
        <label>圃場ID<input value={form.legacyId} onChange={e=>setForm({...form,legacyId:e.target.value.toUpperCase()})} placeholder="例：YAGI-N（空欄なら自動）"/></label>
        <label>圃場名<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="例：小屋前"/></label>
        <label>場所<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="例：八木じー裏"/></label>
        <label>品種<input value={form.variety} onChange={e=>setForm({...form,variety:e.target.value})} placeholder="やぶきた / おくみどり"/></label>
        <label>面積（m²）<input type="number" min="0" step="0.1" value={form.areaM2||''} onChange={e=>setForm({...form,areaM2:Number(e.target.value)})}/></label>
        <label>基準散布量（L/反）<input type="number" min="1" step="1" value={form.standardRate} onChange={e=>setForm({...form,standardRate:Number(e.target.value)})}/></label>
        <label>栽培区分<input value={form.cultivationType} onChange={e=>setForm({...form,cultivationType:e.target.value})}/></label>
        <label>収穫予定日<input type="date" value={form.harvestDate} onChange={e=>setForm({...form,harvestDate:e.target.value})}/></label>
        <label>状態<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as 'active'|'inactive'})}><option value="active">有効</option><option value="inactive">休止</option></select></label>
      </div>
      <div className="field-calc-preview"><div><span>面積(a)</span><b>{((Number(form.areaM2)||0)/100).toFixed(3)}a</b></div><div><span>面積(反)</span><b>{((Number(form.areaM2)||0)/1000).toFixed(4)}反</b></div><div><span>標準散布量</span><b>{previewStandard.toLocaleString()}L</b></div></div>
      <label className="full-label">備考<textarea rows={3} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
      <div className="master-form-actions"><button className="primary-button" onClick={()=>void submit()} disabled={saving}><Save size={17}/>{saving?'保存中…':editingId?'変更を保存':'圃場を追加'}</button></div>
    </section>}

    <div className="field-location-groups">{groups.map(([location, fs])=><section className="panel field-master-group" key={location}><div className="panel-title"><h2>{location}</h2><span>{fs.length}圃場</span></div><div className="field-master-grid">{fs.map(f=><article className={`field-master-card ${f.status==='inactive'?'inactive':''}`} key={f.id}><div className="field-card-head"><div className="field-code"><MapPinned size={17}/><b>{f.legacyId}</b></div><span className={`master-status ${f.status}`}>{f.status==='active'?'有効':'休止'}</span></div><h3>{f.name}</h3><div className="field-card-stats"><div><span>面積</span><b>{f.areaM2.toLocaleString()}㎡</b><small>{(f.areaM2/1000).toFixed(4)}反</small></div><div><span>標準散布量</span><b>{f.standardL.toLocaleString()}L</b><small>{f.standardRate}L/反</small></div></div><div className="field-card-meta"><span>品種：{f.variety||'未設定'}</span>{f.harvestDate&&<span>収穫予定：{f.harvestDate}</span>}</div>{f.note&&<p className="field-card-note">{f.note}</p>}{role==='admin'&&<div className="card-actions"><button onClick={()=>beginEdit(f)}><Pencil size={15}/>編集</button><button className="danger-text-button" onClick={()=>void remove(f)}><Trash2 size={15}/>削除</button></div>}</article>)}</div></section>)}</div>
  </div>
}
