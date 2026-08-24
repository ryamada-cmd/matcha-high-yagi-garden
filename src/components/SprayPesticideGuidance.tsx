import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BookOpen, CheckCircle2, Database, ShieldCheck } from 'lucide-react'
import { loadSprayPesticideGuidance, type SprayPesticideGuidance } from '../lib/sprays'

type Props = {
  pesticideId: string
  pesticideName: string
  dilution: number
  target: string
  sprayDate: string
  harvestDates: string[]
  editingBatchId?: string
}

const norm = (v: unknown) => String(v ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
const uniq = (values: Array<string | null | undefined>) => [...new Set(values.map((v) => String(v || '').normalize('NFKC').trim()).filter(Boolean))]

function targetMatches(target: string, candidate: string) {
  const a = norm(target)
  const b = norm(candidate)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

function dilutionMatch(text: string, value: number): boolean | null {
  if (!value || !text) return null
  const normalized = String(text).normalize('NFKC')
  const matches = [...normalized.matchAll(/([0-9][0-9,]*(?:\.\d+)?)\s*(?:[～〜~\-]\s*([0-9][0-9,]*(?:\.\d+)?))?\s*倍/g)]
  if (!matches.length) return null
  return matches.some((m) => {
    const a = Number(m[1].replace(/,/g, ''))
    const b = m[2] ? Number(m[2].replace(/,/g, '')) : a
    return Number.isFinite(a) && Number.isFinite(b) && value >= Math.min(a, b) && value <= Math.max(a, b)
  })
}

function maxUseCount(values: string[]) {
  const nums = values.flatMap((v) => [...String(v).normalize('NFKC').matchAll(/(\d+)\s*回/g)].map((m) => Number(m[1])))
  return nums.length ? Math.max(...nums) : null
}

function requiredPreHarvestDays(values: string[]) {
  const nums = values.flatMap((v) => [...String(v).normalize('NFKC').matchAll(/(\d+)\s*日前まで/g)].map((m) => Number(m[1])))
  return nums.length ? Math.max(...nums) : null
}

function daysBetween(a: string, b: string) {
  if (!a || !b) return null
  const start = new Date(`${a}T00:00:00`)
  const end = new Date(`${b}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return Math.floor((end.getTime() - start.getTime()) / 86400000)
}

export default function SprayPesticideGuidanceCard({ pesticideId, pesticideName, dilution, target, sprayDate, harvestDates, editingBatchId }: Props) {
  const [data, setData] = useState<SprayPesticideGuidance | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pesticideId) { setData(null); return }
    let active = true
    setLoading(true); setError('')
    void loadSprayPesticideGuidance([pesticideId], sprayDate, editingBatchId)
      .then((rows) => { if (active) setData(rows[0] || null) })
      .catch((e: any) => { if (active) setError(e?.message || '安全情報を取得できませんでした。') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [pesticideId, sprayDate, editingBatchId])

  const analysis = useMemo(() => {
    if (!data) return null
    const official = data.official || []
    const targetMatched = target.trim() ? official.filter((r) => targetMatches(target, r.target_pest || r.use_purpose)) : []
    const relevant = targetMatched.length ? targetMatched : official
    const dilutionChecks = relevant.map((r) => dilutionMatch(r.dilution_or_rate, dilution)).filter((v): v is boolean => v !== null)
    const dilutionOk = dilutionChecks.length ? dilutionChecks.some(Boolean) : null
    const targetOk = !target.trim() || !official.length ? null : targetMatched.length > 0
    const timings = uniq(relevant.map((r) => r.use_timing))
    const productCounts = uniq(relevant.map((r) => r.product_use_count))
    const totalCounts = uniq(relevant.map((r) => r.total_use_count))
    const maxCount = maxUseCount(productCounts)
    const predictedRecorded = Number(data.recorded_year_use_count || 0) + 1
    const countWarning = maxCount != null && predictedRecorded > maxCount
    const requiredDays = requiredPreHarvestDays(timings)
    const validHarvestDates = harvestDates.filter(Boolean)
    const nearestHarvestDays = validHarvestDates.length
      ? Math.min(...validHarvestDates.map((d) => daysBetween(sprayDate, d)).filter((v): v is number => v != null))
      : null
    const harvestWarning = requiredDays != null && nearestHarvestDays != null && nearestHarvestDays < requiredDays
    const frac = uniq([data.master_frac_irac, ...(data.guidelines || []).map((g) => g.frac_irac)])
    const toxicity = uniq((data.guidelines || []).map((g) => g.toxicity))
    const covering = uniq((data.guidelines || []).map((g) => g.covering_exception))
    return { official, relevant, targetOk, dilutionOk, timings, productCounts, totalCounts, maxCount, predictedRecorded, countWarning, requiredDays, nearestHarvestDays, harvestWarning, frac, toxicity, covering }
  }, [data, dilution, target, sprayDate, harvestDates])

  if (loading) return <div className="spray-guidance-card loading"><span>FAMIC・防除指針を確認中…</span></div>
  if (error) return <div className="spray-guidance-card warning"><AlertTriangle size={16}/><span>{error}</span></div>
  if (!data || !analysis) return null

  const targets = uniq(analysis.relevant.map((r) => r.target_pest || r.use_purpose)).slice(0, 8)
  const dilutions = uniq(analysis.relevant.map((r) => r.dilution_or_rate)).slice(0, 6)
  const hasWarning = analysis.targetOk === false || analysis.dilutionOk === false || analysis.countWarning || analysis.harvestWarning || !analysis.official.length || data.official_match_mode === 'name_candidate'

  return <section className={`spray-guidance-card ${hasWarning ? 'has-warning' : 'ok'}`}>
    <div className="spray-guidance-head">
      <div><ShieldCheck size={17}/><b>{pesticideName}｜安全確認</b></div>
      <div className="guidance-badges">
        {data.registration_no && <span>登録 {data.registration_no}</span>}
        {analysis.frac.length > 0 && <span>FRAC/IRAC {analysis.frac.join(' / ')}</span>}
        {analysis.toxicity.length > 0 && <span>毒性 {analysis.toxicity.join(' / ')}</span>}
      </div>
    </div>

    <div className="guidance-source-line"><Database size={14}/>FAMIC {data.official_source_date || '取得日不明'}　<BookOpen size={14}/>2026防除指針</div>

    {data.official_match_mode === 'name_candidate' && <div className="guidance-alert"><AlertTriangle size={15}/><span>農薬マスタにFAMIC登録番号が未設定です。名称一致した公式登録候補を表示しています。製品ラベルの登録番号を必ず確認してください。</span></div>}
    {!analysis.official.length && <div className="guidance-alert"><AlertTriangle size={15}/><span>FAMIC公式DBとの紐付けを確認できません。現物ラベルとFAMIC公式検索で登録番号・適用内容を確認してください。</span></div>}
    {analysis.targetOk === false && <div className="guidance-alert"><AlertTriangle size={15}/><span>入力した対象「{target}」は、この農薬のFAMIC適用病害虫名と文字一致しません。適用対象を再確認してください。</span></div>}
    {analysis.dilutionOk === false && <div className="guidance-alert"><AlertTriangle size={15}/><span>入力した {dilution.toLocaleString()}倍 は、表示中のFAMIC適用倍率と一致しません。対象病害虫ごとの倍率を確認してください。</span></div>}
    {analysis.harvestWarning && <div className="guidance-alert danger"><AlertTriangle size={15}/><span>選択圃場の予定摘採日まで約{analysis.nearestHarvestDays}日です。表示上は「{analysis.timings.join(' / ')}」のため、収穫前日数を再確認してください。</span></div>}
    {analysis.countWarning && <div className="guidance-alert danger"><AlertTriangle size={15}/><span>この登録を含めると、アプリ上の{new Date(`${sprayDate}T00:00:00`).getFullYear()}年記録は{analysis.predictedRecorded}回になります。FAMIC表示の本剤使用回数「{analysis.productCounts.join(' / ')}」を超える可能性があります。</span></div>}

    <div className="guidance-grid">
      <div><span>適用対象</span><b>{targets.length ? targets.join(' / ') : '公式紐付けなし'}</b></div>
      <div><span>希釈倍率</span><b>{dilutions.length ? dilutions.join(' / ') : '—'}</b>{analysis.dilutionOk === true && dilution > 0 && <small className="guidance-ok"><CheckCircle2 size={12}/>入力倍率と一致</small>}</div>
      <div><span>使用時期</span><b>{analysis.timings.length ? analysis.timings.join(' / ') : '—'}</b></div>
      <div><span>本剤使用回数</span><b>{analysis.productCounts.length ? analysis.productCounts.join(' / ') : '—'}</b><small>当年記録 {data.recorded_year_use_count || 0}回{data.last_recorded_spray_date ? ` / 前回 ${data.last_recorded_spray_date}` : ''}</small></div>
    </div>

    {analysis.totalCounts.length > 0 && <p className="guidance-foot">有効成分を含む総使用回数表示：{analysis.totalCounts.join(' / ')}</p>}
    {analysis.covering.length > 0 && <div className="guidance-covering"><b>被覆栽培等の注意</b><span>{analysis.covering.join(' / ')}</span></div>}
    <p className="guidance-disclaimer">自動判定は文字列・日付による補助チェックです。使用可否は現物ラベル、最新FAMIC登録内容、メーカー情報を優先してください。当年回数はアプリ記録上の参考値です。</p>
  </section>
}
