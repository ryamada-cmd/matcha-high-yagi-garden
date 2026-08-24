import { supabase } from './supabase'

export type DashboardAlert = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  href: string
  action: string
}

export type DashboardPlanItem = {
  legacyId: string
  label: string
  target: string
  pesticide: string
  note: string
  date: string
  days: number
  overdue: boolean
}

export type DashboardUsageWatch = {
  pesticideId: string
  pesticideName: string
  used: number
  max: number | null
  remaining: number | null
  lastDate: string
}

export type DashboardHarvest = {
  fieldId: string
  legacyId: string
  name: string
  date: string
  days: number
}

export type DashboardData = {
  stockValue: number
  stockLots: number
  attentionCount: number
  criticalCount: number
  warningCount: number
  lastSpray: null | {
    id: string
    legacyId: string
    date: string
    preparedL: number
    target: string
    operator: string
    weather: string
    chemicals: string[]
  }
  nextPlan: DashboardPlanItem | null
  planTimeline: DashboardPlanItem[]
  alerts: DashboardAlert[]
  usageWatch: DashboardUsageWatch[]
  harvests: DashboardHarvest[]
  readiness: {
    expiryRegistered: number
    expiryTotal: number
    harvestRegistered: number
    harvestTotal: number
  }
}

type Guidance = {
  pesticide_id: string
  pesticide_name: string
  registration_no: string
  official_match_mode: 'registration' | 'name_candidate'
  recorded_year_use_count: number
  last_recorded_spray_date: string | null
  official: Array<{
    target_pest?: string | null
    use_timing?: string | null
    product_use_count?: string | null
  }>
}

const n = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const norm = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()

const localToday = () => new Intl.DateTimeFormat('sv-SE').format(new Date())

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000)
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from)

function periodDay(period: string | null | undefined) {
  if (period === '上旬') return 5
  if (period === '中旬') return 15
  if (period === '下旬') return 25
  return 15
}

function planDate(plan: any) {
  if (plan.planned_date) return String(plan.planned_date)
  const y = Number(plan.plan_year)
  const m = Number(plan.month)
  if (!y || !m) return ''
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(periodDay(plan.period)).padStart(2, '0')}`
}

function planLabel(plan: any) {
  if (plan.planned_date) return String(plan.planned_date)
  return `${Number(plan.month)}月${plan.period || ''}`
}

function isOpenPlan(status: unknown) {
  const s = String(status || '').toLowerCase()
  return !['completed', 'cancelled', 'done', '完了', '実施済', '中止'].includes(s)
}

function extractUseCount(text: unknown) {
  const match = String(text || '').normalize('NFKC').match(/(\d+)\s*回/)
  return match ? Number(match[1]) : null
}

function officialProductMax(guidance: Guidance) {
  if (guidance.official_match_mode !== 'registration') return null
  const values = guidance.official
    .map((row) => extractUseCount(row.product_use_count))
    .filter((x): x is number => x !== null && x > 0)
  return values.length ? Math.min(...values) : null
}

function harvestDaysFromGuidance(guidance: Guidance, target: string) {
  if (guidance.official_match_mode !== 'registration') return null
  const targetNorm = norm(target)
  const matching = targetNorm
    ? guidance.official.filter((row) => {
        const pest = norm(row.target_pest)
        return pest && (targetNorm.includes(pest) || pest.includes(targetNorm))
      })
    : []
  const source = matching.length ? matching : guidance.official
  const days = source
    .map((row) => String(row.use_timing || '').normalize('NFKC').match(/摘採\s*(\d+)\s*日前/))
    .filter(Boolean)
    .map((m) => Number(m![1]))
    .filter((x) => Number.isFinite(x) && x >= 0)
  return days.length ? Math.max(...days) : null
}

function severityRank(s: DashboardAlert['severity']) {
  return s === 'critical' ? 0 : s === 'warning' ? 1 : 2
}

export async function loadDashboard(): Promise<DashboardData> {
  const today = localToday()
  const year = Number(today.slice(0, 4))
  const yearStart = `${year}-01-01`

  const [lotsRes, balancesRes, fieldsRes, plansRes, yearSpraysRes, lastSprayRes] = await Promise.all([
    supabase.from('inventory_lots').select('id,legacy_id,pesticide_id,purchase_unit_price,package_size,purchased_content_qty,content_unit,expiry_date,pesticides(name)'),
    supabase.from('inventory_balances').select('inventory_lot_id,pesticide_id,content_unit,balance'),
    supabase.from('fields').select('id,legacy_id,name,location,harvest_planned_date,status').is('deleted_at', null).eq('status', 'active').order('legacy_id'),
    supabase.from('annual_spray_plans').select('legacy_id,plan_year,month,period,target_pest,recommended_pesticide_text,planned_date,status,note').is('deleted_at', null),
    supabase.from('spray_batches').select('id,legacy_id,spray_date,prepared_volume_l,target,operator_name_snapshot,weather').is('deleted_at', null).gte('spray_date', yearStart).lte('spray_date', today).order('spray_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('spray_batches').select('id,legacy_id,spray_date,prepared_volume_l,target,operator_name_snapshot,weather').is('deleted_at', null).order('spray_date', { ascending: false }).order('created_at', { ascending: false }).limit(1),
  ])

  const firstError = lotsRes.error || balancesRes.error || fieldsRes.error || plansRes.error || yearSpraysRes.error || lastSprayRes.error
  if (firstError) throw firstError

  const lots = (lotsRes.data || []) as any[]
  const balances = (balancesRes.data || []) as any[]
  const fields = (fieldsRes.data || []) as any[]
  const plans = (plansRes.data || []) as any[]
  const yearSprays = (yearSpraysRes.data || []) as any[]
  const latest = lastSprayRes.data?.[0] as any | undefined
  const lotById = new Map(lots.map((lot) => [lot.id, lot]))
  const balanceByLot = new Map(balances.map((b) => [b.inventory_lot_id, n(b.balance)]))

  let stockValue = 0
  let stockLots = 0
  const activeLots: Array<any & { balance: number; pesticideName: string }> = []

  for (const lot of lots) {
    const balance = balanceByLot.get(lot.id) || 0
    if (balance <= 0) continue
    stockLots += 1
    const pesticide = Array.isArray(lot.pesticides) ? lot.pesticides[0] : lot.pesticides
    activeLots.push({ ...lot, balance, pesticideName: pesticide?.name || '農薬' })
    const unitPrice = n(lot.purchase_unit_price)
    const packageSize = n(lot.package_size)
    if (unitPrice > 0 && packageSize > 0) stockValue += (unitPrice / packageSize) * balance
  }

  const allBatchIds = [...new Set([...(yearSprays.map((s) => s.id)), ...(latest?.id ? [latest.id] : [])])]
  let chemicals: any[] = []
  let batchFields: any[] = []
  if (allBatchIds.length) {
    const [chemRes, batchFieldRes] = await Promise.all([
      supabase.from('spray_batch_chemicals').select('spray_batch_id,pesticide_id,chemical_qty,chemical_unit,dilution,pesticides(name)').in('spray_batch_id', allBatchIds).order('created_at'),
      supabase.from('spray_batch_fields').select('spray_batch_id,field_id,actual_spray_volume_l').in('spray_batch_id', allBatchIds),
    ])
    if (chemRes.error) throw chemRes.error
    if (batchFieldRes.error) throw batchFieldRes.error
    chemicals = chemRes.data || []
    batchFields = batchFieldRes.data || []
  }

  let lastSpray: DashboardData['lastSpray'] = null
  if (latest) {
    const latestChems = chemicals.filter((c) => c.spray_batch_id === latest.id).map((row: any) => {
      const pesticide = Array.isArray(row.pesticides) ? row.pesticides[0] : row.pesticides
      return `${pesticide?.name || '農薬'} ${n(row.dilution).toLocaleString()}倍 / ${n(row.chemical_qty).toLocaleString()}${row.chemical_unit || ''}`
    })
    lastSpray = {
      id: latest.id,
      legacyId: latest.legacy_id || '',
      date: latest.spray_date || '',
      preparedL: n(latest.prepared_volume_l),
      target: latest.target || '',
      operator: latest.operator_name_snapshot || '',
      weather: latest.weather || '',
      chemicals: latestChems,
    }
  }

  const openPlans = plans
    .filter((p) => isOpenPlan(p.status))
    .map((p) => {
      const date = planDate(p)
      return {
        legacyId: p.legacy_id || '',
        label: planLabel(p),
        target: p.target_pest || '',
        pesticide: p.recommended_pesticide_text || '未指定',
        note: p.note || '',
        date,
        days: date ? daysBetween(today, date) : 9999,
        overdue: !!date && date < today,
      } satisfies DashboardPlanItem
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const overduePlans = openPlans.filter((p) => p.overdue)
  const upcomingPlans = openPlans.filter((p) => !p.overdue)
  const nextPlan = upcomingPlans[0] || null
  const planTimeline = [...overduePlans.slice(-3), ...upcomingPlans.slice(0, 5)]

  const usedPesticideIds = [...new Set(
    chemicals
      .filter((c) => yearSprays.some((b) => b.id === c.spray_batch_id))
      .map((c) => c.pesticide_id)
      .filter(Boolean),
  )] as string[]

  let guidance: Guidance[] = []
  if (usedPesticideIds.length) {
    const { data, error } = await supabase.rpc('get_spray_pesticide_guidance', {
      p_pesticide_ids: usedPesticideIds,
      p_spray_date: today,
      p_exclude_batch_id: null,
    })
    if (error) throw error
    guidance = (Array.isArray(data) ? data : []) as Guidance[]
  }
  const guidanceByPesticide = new Map(guidance.map((g) => [g.pesticide_id, g]))

  const usageWatch: DashboardUsageWatch[] = guidance
    .map((g) => {
      const max = officialProductMax(g)
      const used = n(g.recorded_year_use_count)
      return {
        pesticideId: g.pesticide_id,
        pesticideName: g.pesticide_name,
        used,
        max,
        remaining: max === null ? null : max - used,
        lastDate: g.last_recorded_spray_date || '',
      }
    })
    .sort((a, b) => {
      const ar = a.remaining ?? 999
      const br = b.remaining ?? 999
      return ar - br || a.pesticideName.localeCompare(b.pesticideName, 'ja')
    })

  const futureHarvests: DashboardHarvest[] = fields
    .filter((f) => f.harvest_planned_date && String(f.harvest_planned_date) >= today)
    .map((f) => ({
      fieldId: f.id,
      legacyId: f.legacy_id || '',
      name: f.name || '',
      date: String(f.harvest_planned_date),
      days: daysBetween(today, String(f.harvest_planned_date)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const alerts: DashboardAlert[] = []

  const expired = activeLots.filter((lot) => lot.expiry_date && String(lot.expiry_date) < today)
  if (expired.length) alerts.push({
    id: 'expired-stock', severity: 'critical', title: `使用期限切れの在庫が${expired.length}ロットあります`,
    detail: `${expired[0].pesticideName} ${expired[0].legacy_id || ''}${expired.length > 1 ? ` ほか${expired.length - 1}ロット` : ''}`,
    href: '/inventory', action: '在庫を確認',
  })

  const expiring = activeLots.filter((lot) => lot.expiry_date && String(lot.expiry_date) >= today && daysBetween(today, String(lot.expiry_date)) <= 90)
  if (expiring.length) alerts.push({
    id: 'expiring-stock', severity: 'warning', title: `90日以内に使用期限を迎える在庫が${expiring.length}ロットあります`,
    detail: `${expiring[0].pesticideName}：${expiring[0].expiry_date}${expiring.length > 1 ? ` ほか${expiring.length - 1}ロット` : ''}`,
    href: '/inventory', action: '在庫を確認',
  })

  const missingExpiry = activeLots.filter((lot) => !lot.expiry_date)
  if (missingExpiry.length) alerts.push({
    id: 'missing-expiry', severity: 'warning', title: `使用期限が未登録の在庫が${missingExpiry.length}ロットあります`,
    detail: '期限切れ・期限間近の自動警告を正しく出すため、現物ラベルの期限を在庫情報へ登録してください。',
    href: '/inventory', action: '在庫を確認',
  })

  const pesticideStock = new Map<string, { name: string; balance: number; original: number; unit: string }>()
  for (const lot of activeLots) {
    const key = lot.pesticide_id
    const old = pesticideStock.get(key) || { name: lot.pesticideName, balance: 0, original: 0, unit: lot.content_unit || '' }
    old.balance += lot.balance
    old.original += n(lot.purchased_content_qty)
    pesticideStock.set(key, old)
  }
  const lowStock = [...pesticideStock.values()].filter((x) => x.original > 0 && x.balance / x.original <= 0.2)
  if (lowStock.length) alerts.push({
    id: 'low-stock', severity: 'warning', title: `購入時数量の20%以下になった農薬が${lowStock.length}種あります`,
    detail: `${lowStock[0].name}：${lowStock[0].balance.toLocaleString()}${lowStock[0].unit}${lowStock.length > 1 ? ` ほか${lowStock.length - 1}種` : ''}`,
    href: '/inventory', action: '残量を確認',
  })

  if (overduePlans.length) {
    const nearest = overduePlans[overduePlans.length - 1]
    alerts.push({
      id: 'overdue-plans', severity: 'warning', title: `未実施の年間計画が${overduePlans.length}件、予定時期を過ぎています`,
      detail: `直近：${nearest.label} ${nearest.target}${nearest.note ? `｜${nearest.note}` : ''}`,
      href: '/plans', action: '計画を整理',
    })
  }

  if (nextPlan && nextPlan.days <= 14) alerts.push({
    id: 'next-plan', severity: 'info', title: `次の防除予定は${nextPlan.days === 0 ? '今日' : `${nextPlan.days}日後`}です`,
    detail: `${nextPlan.label}｜${nextPlan.target}${nextPlan.pesticide !== '未指定' ? `｜${nextPlan.pesticide}` : ''}`,
    href: '/plans', action: '予定を確認',
  })

  for (const item of usageWatch) {
    if (item.max === null || item.used <= 0) continue
    if ((item.remaining ?? 1) <= 0) alerts.push({
      id: `use-max-${item.pesticideId}`, severity: 'critical', title: `${item.pesticideName}は本剤使用回数の上限に到達しています`,
      detail: `アプリ記録 ${item.used}回 / FAMIC本剤使用回数 ${item.max}回。次回使用前に現物ラベルと最新登録を必ず確認してください。`,
      href: '/spray-history', action: '履歴を確認',
    })
    else if (item.remaining === 1) alerts.push({
      id: `use-near-${item.pesticideId}`, severity: 'warning', title: `${item.pesticideName}は本剤使用回数が残り1回です`,
      detail: `アプリ記録 ${item.used}回 / FAMIC本剤使用回数 ${item.max}回。`,
      href: '/spray-history', action: '履歴を確認',
    })
  }

  const harvestRegistered = fields.filter((f) => !!f.harvest_planned_date).length
  const missingHarvest = fields.length - harvestRegistered
  if (missingHarvest > 0) alerts.push({
    id: 'missing-harvest', severity: 'warning', title: `摘採予定日が未登録の圃場が${missingHarvest}圃場あります`,
    detail: '散布日と摘採予定日の間隔を自動判定するため、摘採予定が決まった圃場から登録してください。',
    href: '/fields', action: '圃場を確認',
  })

  const harvestConflictKeys = new Set<string>()
  const sprayById = new Map(yearSprays.map((b) => [b.id, b]))
  const chemicalsByBatch = new Map<string, any[]>()
  for (const chem of chemicals) {
    const arr = chemicalsByBatch.get(chem.spray_batch_id) || []
    arr.push(chem)
    chemicalsByBatch.set(chem.spray_batch_id, arr)
  }
  for (const harvest of futureHarvests) {
    const relatedBatchIds = batchFields.filter((bf) => bf.field_id === harvest.fieldId).map((bf) => bf.spray_batch_id)
    for (const batchId of relatedBatchIds) {
      const batch = sprayById.get(batchId)
      if (!batch || !batch.spray_date || batch.spray_date > harvest.date) continue
      for (const chem of chemicalsByBatch.get(batchId) || []) {
        const g = guidanceByPesticide.get(chem.pesticide_id)
        if (!g) continue
        const required = harvestDaysFromGuidance(g, batch.target || '')
        if (required === null) continue
        const actual = daysBetween(batch.spray_date, harvest.date)
        if (actual >= required) continue
        const key = `${harvest.fieldId}-${chem.pesticide_id}`
        if (harvestConflictKeys.has(key)) continue
        harvestConflictKeys.add(key)
        const pesticide = Array.isArray(chem.pesticides) ? chem.pesticides[0] : chem.pesticides
        alerts.push({
          id: `harvest-${key}`, severity: 'critical', title: `${harvest.legacyId} ${harvest.name}の摘採予定と散布間隔を確認してください`,
          detail: `${pesticide?.name || g.pesticide_name}：散布 ${batch.spray_date} → 摘採 ${harvest.date} は${actual}日。公式登録から読み取った必要間隔は${required}日です。`,
          href: '/spray-history', action: '散布履歴を確認',
        })
      }
    }
  }

  if (futureHarvests.length && futureHarvests[0].days <= 14) alerts.push({
    id: 'near-harvest', severity: 'info', title: `最も近い摘採予定は${futureHarvests[0].days === 0 ? '今日' : `${futureHarvests[0].days}日後`}です`,
    detail: `${futureHarvests[0].legacyId} ${futureHarvests[0].name}｜${futureHarvests[0].date}`,
    href: '/fields', action: '圃場を確認',
  })

  alerts.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.title.localeCompare(b.title, 'ja'))
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length
  const warningCount = alerts.filter((a) => a.severity === 'warning').length

  return {
    stockValue: Math.round(stockValue),
    stockLots,
    attentionCount: criticalCount + warningCount,
    criticalCount,
    warningCount,
    lastSpray,
    nextPlan,
    planTimeline,
    alerts,
    usageWatch,
    harvests: futureHarvests.slice(0, 6),
    readiness: {
      expiryRegistered: activeLots.length - missingExpiry.length,
      expiryTotal: activeLots.length,
      harvestRegistered,
      harvestTotal: fields.length,
    },
  }
}
