import { supabase } from './supabase'

type InventoryLot = {
  id: string
  legacy_id: string | null
  purchase_unit_price: number | string | null
  package_size: number | string | null
  content_unit: string | null
}

type InventoryBalance = {
  inventory_lot_id: string
  balance: number | string | null
}

export type DashboardData = {
  stockValue: number
  stockLots: number
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
  nextPlan: null | {
    legacyId: string
    label: string
    target: string
    pesticide: string
    note: string
  }
}

function n(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function periodRank(period: string | null): number {
  if (period === '上旬') return 5
  if (period === '中旬') return 15
  if (period === '下旬') return 25
  return 15
}

function planSortValue(plan: any, now: Date): number {
  if (plan.planned_date) {
    const dt = new Date(`${plan.planned_date}T00:00:00`)
    return dt.getTime()
  }

  let year = Number(plan.plan_year) || now.getFullYear()
  const month = Number(plan.month) || 1
  const day = periodRank(plan.period || null)
  let dt = new Date(year, month - 1, day)

  if (dt.getTime() < now.getTime()) {
    year += 1
    dt = new Date(year, month - 1, day)
  }

  return dt.getTime()
}

function planLabel(plan: any): string {
  if (plan.planned_date) return String(plan.planned_date)
  return `${Number(plan.month)}月${plan.period || ''}`
}

export async function loadDashboard(): Promise<DashboardData> {
  const [lotsRes, balancesRes, spraysRes, plansRes] = await Promise.all([
    supabase
      .from('inventory_lots')
      .select('id,legacy_id,purchase_unit_price,package_size,content_unit'),
    supabase
      .from('inventory_balances')
      .select('inventory_lot_id,balance'),
    supabase
      .from('spray_batches')
      .select('id,legacy_id,spray_date,prepared_volume_l,target,operator_name_snapshot,weather')
      .is('deleted_at', null)
      .order('spray_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('annual_spray_plans')
      .select('legacy_id,plan_year,month,period,target_pest,recommended_pesticide_text,planned_date,status,note')
      .is('deleted_at', null),
  ])

  const firstError = lotsRes.error || balancesRes.error || spraysRes.error || plansRes.error
  if (firstError) throw firstError

  const lots = (lotsRes.data || []) as InventoryLot[]
  const balances = (balancesRes.data || []) as InventoryBalance[]
  const lotById = new Map(lots.map((lot) => [lot.id, lot]))

  let stockValue = 0
  let stockLots = 0

  for (const balance of balances) {
    const qty = n(balance.balance)
    if (qty <= 0) continue
    stockLots += 1

    const lot = lotById.get(balance.inventory_lot_id)
    if (!lot) continue

    const unitPrice = n(lot.purchase_unit_price)
    const packageSize = n(lot.package_size)
    if (unitPrice > 0 && packageSize > 0) {
      stockValue += (unitPrice / packageSize) * qty
    }
  }

  let lastSpray: DashboardData['lastSpray'] = null
  const spray = spraysRes.data?.[0]
  if (spray) {
    const chemRes = await supabase
      .from('spray_batch_chemicals')
      .select('chemical_qty,chemical_unit,dilution,pesticides(name)')
      .eq('spray_batch_id', spray.id)
      .order('created_at', { ascending: true })

    if (chemRes.error) throw chemRes.error

    const chemicals = (chemRes.data || []).map((row: any) => {
      const pesticide = Array.isArray(row.pesticides) ? row.pesticides[0] : row.pesticides
      const name = pesticide?.name || '農薬'
      return `${name} ${n(row.dilution).toLocaleString()}倍 / ${n(row.chemical_qty).toLocaleString()}${row.chemical_unit || ''}`
    })

    lastSpray = {
      id: spray.id,
      legacyId: spray.legacy_id || '',
      date: spray.spray_date || '',
      preparedL: n(spray.prepared_volume_l),
      target: spray.target || '',
      operator: spray.operator_name_snapshot || '',
      weather: spray.weather || '',
      chemicals,
    }
  }

  const now = new Date()
  const plans = (plansRes.data || [])
    .filter((plan: any) => !['completed', 'cancelled', 'done', '完了', '実施済', '中止'].includes(String(plan.status || '').toLowerCase()))
    .map((plan: any) => ({ plan, sort: planSortValue(plan, now) }))
    .sort((a: any, b: any) => a.sort - b.sort)

  const next = plans[0]?.plan
  const nextPlan: DashboardData['nextPlan'] = next
    ? {
        legacyId: next.legacy_id || '',
        label: planLabel(next),
        target: next.target_pest || '',
        pesticide: next.recommended_pesticide_text || '未指定',
        note: next.note || '',
      }
    : null

  return {
    stockValue: Math.round(stockValue),
    stockLots,
    lastSpray,
    nextPlan,
  }
}
