import { useEffect, useMemo, useState } from 'react'
import { Eye, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import SprayPesticideGuidanceCard from '../components/SprayPesticideGuidance'
import {
  deleteSpray,
  loadSprayBatchDetail,
  loadSprayFormData,
  registerSpray,
  updateSpray,
  type SprayBatchDetail,
  type SprayField,
  type SprayHistoryRow,
  type SprayLot,
} from '../lib/sprays'

type ChemRow = { key: string; lotId: string; dilution: string }
const uid = () => Math.random().toString(36).slice(2, 9)
const today = () => new Date().toLocaleDateString('sv-SE')

export default function SprayPage() {
  const [lots, setLots] = useState<SprayLot[]>([])
  const [fields, setFields] = useState<SprayField[]>([])
  const [history, setHistory] = useState<SprayHistoryRow[]>([])
  const [role, setRole] = useState('')
  const [chemicals, setChemicals] = useState<ChemRow[]>([{ key: uid(), lotId: '', dilution: '' }])
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [sprayDate, setSprayDate] = useState(today())
  const [preparedL, setPreparedL] = useState('1000')
  const [target, setTarget] = useState('')
  const [weather, setWeather] = useState('')
  const [temperature, setTemperature] = useState('')
  const [operator, setOperator] = useState('')
  const [note, setNote] = useState('')
  const [preCheck, setPreCheck] = useState(false)
  const [countCheck, setCountCheck] = useState(false)
  const [mixCheck, setMixCheck] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [editingLegacy, setEditingLegacy] = useState('')
  const [detail, setDetail] = useState<SprayBatchDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await loadSprayFormData()
      setLots(data.lots)
      setFields(data.fields)
      setHistory(data.history)
      setRole(data.role)
    } catch (e: any) {
      setError(e?.message || '散布データを読み込めませんでした。')
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])

  const prepared = Number(preparedL) || 0
  const chosen = useMemo(() => fields.filter((f) => selectedFields.includes(f.id)), [fields, selectedFields])
  const totalStandard = chosen.reduce((s, f) => s + f.standardL, 0)
  const allocations = useMemo(() => {
    let used = 0
    return chosen.map((f, i) => {
      const actual = i === chosen.length - 1
        ? Math.round((prepared - used) * 10) / 10
        : Math.round((prepared * f.standardL / (totalStandard || 1)) * 10) / 10
      if (i !== chosen.length - 1) used += actual
      return { ...f, actual: Math.max(0, actual) }
    })
  }, [chosen, prepared, totalStandard])

  const groups = useMemo(() => {
    const m = new Map<string, SprayField[]>()
    for (const f of fields) {
      const key = f.location || 'その他'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(f)
    }
    return [...m.entries()]
  }, [fields])

  function updateChem(key: string, patch: Partial<ChemRow>) {
    setChemicals((rows) => rows.map((r) => r.key === key ? { ...r, ...patch } : r))
  }

  function resetForm() {
    setEditingId('')
    setEditingLegacy('')
    setSprayDate(today())
    setPreparedL('1000')
    setTarget('')
    setWeather('')
    setTemperature('')
    setNote('')
    setSelectedFields([])
    setChemicals([{ key: uid(), lotId: '', dilution: '' }])
    setPreCheck(false)
    setCountCheck(false)
    setMixCheck(false)
  }

  async function showDetail(batchId: string) {
    setDetailLoading(true)
    setError('')
    try {
      setDetail(await loadSprayBatchDetail(batchId))
    } catch (e: any) {
      setError(e?.message || '散布詳細を読み込めませんでした。')
    } finally { setDetailLoading(false) }
  }

  async function startEdit(batchId: string) {
    setDetailLoading(true)
    setError('')
    setSuccess('')
    try {
      const d = await loadSprayBatchDetail(batchId)
      setDetail(d)
      setEditingId(d.id)
      setEditingLegacy(d.legacyId)
      setSprayDate(d.sprayDate)
      setPreparedL(String(d.preparedL))
      setTarget(d.target)
      setWeather(d.weather)
      setTemperature(d.temperatureC)
      setOperator(d.operator)
      setNote(d.note)
      setPreCheck(d.preHarvestChecked)
      setCountCheck(d.applicationCountChecked)
      setMixCheck(d.tankMixChecked)
      setSelectedFields(d.fields.map((f) => f.fieldId))
      setChemicals(d.chemicals.map((c) => ({ key: uid(), lotId: c.lotId, dilution: String(c.dilution) })))

      setLots((current) => {
        const map = new Map<string, SprayLot>(current.map((l) => [l.lotId, { ...l, editRestored: undefined }]))
        for (const c of d.chemicals) {
          const old = map.get(c.lotId)
          map.set(c.lotId, {
            lotId: c.lotId,
            pesticideId: c.pesticideId,
            pesticideName: c.pesticideName,
            balance: c.virtualBalance,
            unit: c.unit,
            expiryDate: old?.expiryDate || '',
            legacyId: c.lotLegacyId,
            editRestored: c.qty,
          })
        }
        return [...map.values()].sort((a, b) => a.pesticideName.localeCompare(b.pesticideName, 'ja'))
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e: any) {
      setError(e?.message || '編集データを読み込めませんでした。')
    } finally { setDetailLoading(false) }
  }

  async function cancelEdit() {
    resetForm()
    await refresh()
  }

  async function save() {
    setError(''); setSuccess('')
    const p = Number(preparedL)
    if (!sprayDate) return setError('散布日を入力してください。')
    if (!Number.isFinite(p) || p <= 0) return setError('調製量を入力してください。')
    if (!selectedFields.length) return setError('散布する圃場を選択してください。')

    const resolved = chemicals.map((c) => {
      const lot = lots.find((l) => l.lotId === c.lotId)
      return { lot, dilution: Number(c.dilution) }
    })
    if (resolved.some((x) => !x.lot || !Number.isFinite(x.dilution) || x.dilution <= 0)) return setError('すべての農薬・ロット・希釈倍率を入力してください。')
    if (!preCheck || !countCheck) return setError('収穫前日数と使用回数の確認が必要です。')
    if (chemicals.length > 1 && !mixCheck) return setError('混用確認にチェックしてください。')

    const pesticideIds = resolved.map((x) => x.lot!.pesticideId)
    if (new Set(pesticideIds).size !== pesticideIds.length) return setError('同じ農薬を重複して追加できません。')

    const input = {
      sprayDate, preparedL: p, target, weather, temperatureC: temperature, operatorName: operator, note,
      preHarvestChecked: preCheck, applicationCountChecked: countCheck, tankMixChecked: mixCheck,
      chemicals: resolved.map((x) => ({ pesticideId: x.lot!.pesticideId, lotId: x.lot!.lotId, dilution: x.dilution })),
      fieldIds: selectedFields,
    }

    setSaving(true)
    try {
      const result = editingId ? await updateSpray(editingId, input) : await registerSpray(input)
      setSuccess(editingId
        ? `${result.legacy_id} を更新しました。在庫は差分だけ出庫・戻入し、履歴も連動更新しました。`
        : `${result.legacy_id} を登録しました。在庫・入出庫・圃場別散布記録まで反映済みです。`)
      resetForm()
      await refresh()
      await showDetail(result.id)
    } catch (e: any) {
      setError(e?.message || (editingId ? '散布更新に失敗しました。' : '散布登録に失敗しました。'))
    } finally { setSaving(false) }
  }

  async function remove(batchId: string, legacyId: string) {
    if (role !== 'admin') return setError('散布記録の削除は管理者のみ実行できます。')
    if (!window.confirm(`${legacyId} を削除しますか？\n使用した農薬は在庫へ戻入し、入出庫履歴には戻入記録を残します。`)) return
    const reason = window.prompt('削除理由を入力してください（任意）', '')
    if (reason === null) return
    setDeletingId(batchId)
    setError(''); setSuccess('')
    try {
      const result = await deleteSpray(batchId, reason)
      setSuccess(`${result.legacy_id} を削除しました。使用量は在庫へ戻入し、監査履歴を保持しています。`)
      if (editingId === batchId) resetForm()
      if (detail?.id === batchId) setDetail(null)
      await refresh()
    } catch (e: any) {
      setError(e?.message || '散布記録の削除に失敗しました。')
    } finally { setDeletingId('') }
  }

  return (
    <div className="page spray-page">
      <div className="page-head">
        <div><p className="eyebrow">SPRAY</p><h1>薬液調製・散布</h1><p className="sub">複数農薬の混用、希釈計算、圃場への面積比例全量配分を一括登録します。</p></div>
        <button className="icon-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={18} className={loading ? 'spin' : ''}/></button>
      </div>

      {editingId && <div className="edit-banner"><div><b>{editingLegacy} を編集中</b><span>元の使用量を仮想的に在庫へ戻した状態で再計算し、保存時は差分だけ入出庫へ反映します。</span></div><button onClick={() => void cancelEdit()}><X size={16}/>編集をやめる</button></div>}
      {error && <div className="notice error dashboard-notice">{error}</div>}
      {success && <div className="notice success dashboard-notice">{success}</div>}

      <div className="spray-layout">
        <div className="spray-main">
          <section className="panel form-panel">
            <h2>1. 基本情報</h2>
            <div className="form-grid three">
              <label>散布日<input type="date" value={sprayDate} onChange={(e) => setSprayDate(e.target.value)}/></label>
              <label>調製量（L）<input type="number" min="0" step="0.1" value={preparedL} onChange={(e) => setPreparedL(e.target.value)}/></label>
              <label>担当者<input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="例：山田"/></label>
            </div>
            <div className="quick-buttons"><button onClick={() => setPreparedL('1000')}>1000L</button><button onClick={() => setPreparedL('300')}>300L</button><button onClick={() => setPreparedL('1200')}>1200L</button></div>
            <div className="form-grid three">
              <label>目的 / 対象病害虫<input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="例：カンザワハダニ"/></label>
              <label>天候<input value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="例：晴"/></label>
              <label>気温（℃）<input type="number" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)}/></label>
            </div>
          </section>

          <section className="panel form-panel">
            <div className="section-head"><h2>2. 使用農薬</h2><button className="secondary-button" onClick={() => setChemicals((r) => [...r, { key: uid(), lotId: '', dilution: '' }])}><Plus size={16}/>農薬追加</button></div>
            <div className="chemical-list">
              {chemicals.map((c, index) => {
                const lot = lots.find((l) => l.lotId === c.lotId)
                const dilution = Number(c.dilution) || 0
                const qty = prepared > 0 && dilution > 0 ? prepared * 1000 / dilution : 0
                return <div className="chemical-block" key={c.key}>
                  <div className="chemical-row">
                    <div className="chem-no">{index + 1}</div>
                    <label>農薬 / 在庫ロット<select value={c.lotId} onChange={(e) => updateChem(c.key, { lotId: e.target.value })}><option value="">選択してください</option>{lots.map((l) => <option key={l.lotId} value={l.lotId}>{l.pesticideName}｜利用可 {l.balance.toLocaleString()}{l.unit}{l.editRestored ? `（編集戻し ${l.editRestored.toLocaleString()}${l.unit} 含む）` : ''}｜{l.legacyId}</option>)}</select></label>
                    <label>希釈倍率<input type="number" min="1" value={c.dilution} onChange={(e) => updateChem(c.key, { dilution: e.target.value })} placeholder="2000"/></label>
                    <div className="required-qty"><span>必要量</span><b>{qty ? `${Math.round(qty * 1000) / 1000}${lot?.unit || ''}` : '—'}</b>{lot && qty > lot.balance && <em>在庫不足</em>}</div>
                    {chemicals.length > 1 && <button className="danger-icon" onClick={() => setChemicals((r) => r.filter((x) => x.key !== c.key))}><Trash2 size={17}/></button>}
                  </div>
                  {lot && <SprayPesticideGuidanceCard
                    pesticideId={lot.pesticideId}
                    pesticideName={lot.pesticideName}
                    dilution={dilution}
                    target={target}
                    sprayDate={sprayDate}
                    harvestDates={chosen.map((f) => f.harvestDate).filter(Boolean)}
                    editingBatchId={editingId || undefined}
                  />}
                </div>
              })}
            </div>
          </section>

          <section className="panel form-panel">
            <h2>3. 散布圃場</h2>
            <div className="field-groups">
              {groups.map(([location, fs]) => <div key={location} className="field-group"><h3>{location}</h3><div className="field-check-grid">{fs.map((f) => <label className={`field-check ${selectedFields.includes(f.id) ? 'selected' : ''}`} key={f.id}><input type="checkbox" checked={selectedFields.includes(f.id)} onChange={(e) => setSelectedFields((old) => e.target.checked ? [...old, f.id] : old.filter((id) => id !== f.id))}/><b>{f.legacyId}｜{f.name}</b><span>{f.areaM2.toLocaleString()}㎡ / 標準 {f.standardL.toLocaleString()}L{f.harvestDate ? ` / 摘採予定 ${f.harvestDate}` : ''}</span></label>)}</div></div>)}
            </div>
          </section>

          <section className="panel form-panel">
            <h2>4. 確認・{editingId ? '更新' : '登録'}</h2>
            <div className="check-list">
              <label><input type="checkbox" checked={preCheck} onChange={(e) => setPreCheck(e.target.checked)}/>現物ラベル・最新登録情報で収穫前日数を確認した</label>
              <label><input type="checkbox" checked={countCheck} onChange={(e) => setCountCheck(e.target.checked)}/>使用回数を確認した</label>
              {chemicals.length > 1 && <label><input type="checkbox" checked={mixCheck} onChange={(e) => setMixCheck(e.target.checked)}/>混用可否を現物ラベル・メーカー・公式登録情報で確認した</label>}
            </div>
            <label className="full-label">備考<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}/></label>
            <button className="primary-button save-spray" onClick={() => void save()} disabled={saving}><Save size={18}/>{saving ? '在庫・履歴へ反映中…' : editingId ? '散布記録を更新' : '散布を登録'}</button>
          </section>
        </div>

        <aside className="spray-summary">
          <section className="panel sticky-summary">
            <h2>全量散布プレビュー</h2>
            <div className="summary-numbers"><div><span>調製量</span><b>{prepared.toLocaleString()}L</b></div><div><span>標準必要量</span><b>{Math.round(totalStandard * 10) / 10}L</b></div><div><span>選択圃場</span><b>{chosen.length}圃場</b></div><div><span>残液</span><b>0L</b></div></div>
            {totalStandard > 0 && <p className="ratio-note">標準量に対して {(prepared / totalStandard * 100).toFixed(1)}% の密度で各圃場へ面積比例配分します。</p>}
            <div className="allocation-list">{allocations.map((a) => <div key={a.id}><span>{a.legacyId} {a.name}</span><b>{a.actual.toLocaleString()}L</b></div>)}</div>
          </section>

          <section className="panel history-mini">
            <div className="section-head"><h2>散布履歴</h2><span className="history-count">{history.length}件</span></div>
            {history.map((h) => <div className="history-row history-actions-row" key={h.id}>
              <div><b>{h.legacyId}</b><span>{h.date} / {h.operator || '担当未入力'}</span><small>{h.target || '目的未入力'}</small></div>
              <strong>{h.preparedL.toLocaleString()}L</strong>
              <div className="history-actions">
                <button title="詳細" onClick={() => void showDetail(h.id)}><Eye size={15}/></button>
                <button title="編集" onClick={() => void startEdit(h.id)}><Pencil size={15}/></button>
                {role === 'admin' && <button className="delete-action" title="削除" disabled={deletingId === h.id} onClick={() => void remove(h.id, h.legacyId)}><Trash2 size={15}/></button>}
              </div>
            </div>)}
          </section>

          {(detailLoading || detail) && <section className="panel spray-detail-card">
            <div className="section-head"><h2>散布詳細</h2>{detail && <button className="close-detail" onClick={() => setDetail(null)}><X size={16}/></button>}</div>
            {detailLoading && !detail ? <p className="empty">読み込み中…</p> : detail && <>
              <div className="detail-kv"><span>調製ID</span><b>{detail.legacyId}</b></div>
              <div className="detail-kv"><span>散布日</span><b>{detail.sprayDate}</b></div>
              <div className="detail-kv"><span>調製量</span><b>{detail.preparedL.toLocaleString()}L</b></div>
              <div className="detail-kv"><span>担当 / 天候 / 気温</span><b>{detail.operator || '—'} / {detail.weather || '—'} / {detail.temperatureC ? `${detail.temperatureC}℃` : '—'}</b></div>
              <div className="detail-kv"><span>目的</span><b>{detail.target || '—'}</b></div>
              <div className="detail-subtitle">使用農薬</div>
              <div className="detail-chemicals">{detail.chemicals.map((c) => <div key={c.lotId}><b>{c.pesticideName}</b><span>{c.dilution.toLocaleString()}倍 / {c.qty.toLocaleString()}{c.unit}</span><small>{c.lotLegacyId}｜現在庫 {c.currentBalance.toLocaleString()}{c.unit}</small></div>)}</div>
              <div className="detail-subtitle">圃場別散布量</div>
              <div className="allocation-list">{detail.fields.map((f) => { const field = fields.find((x) => x.id === f.fieldId); return <div key={f.fieldId}><span>{field ? `${field.legacyId} ${field.name}` : f.fieldId}</span><b>{f.actualL.toLocaleString()}L</b></div> })}</div>
              {detail.note && <div className="detail-note"><span>備考</span><p>{detail.note}</p></div>}
              <div className="detail-buttons"><button onClick={() => void startEdit(detail.id)}><Pencil size={15}/>編集</button>{role === 'admin' && <button className="danger-text-button" onClick={() => void remove(detail.id, detail.legacyId)}><Trash2 size={15}/>削除</button>}</div>
            </>}
          </section>}
        </aside>
      </div>
    </div>
  )
}
