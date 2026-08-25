import { supabase } from './supabase'

export type SalesDashboardLatest = {
  id: string
  legacyId: string
  date: string
  customerName: string
  channel: string
  salesAmountYen: number
  grossProfitYen: number
}

export type SalesDashboardData = {
  monthKey: string
  monthSalesYen: number
  monthCostYen: number
  monthGrossProfitYen: number
  monthGrossMarginPct: number
  monthSaleCount: number
  latest: SalesDashboardLatest | null
}

const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0
const pad = (v: number) => String(v).padStart(2, '0')

export async function loadSalesDashboard(): Promise<SalesDashboardData> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const start = `${year}-${pad(month + 1)}-01`
  const next = new Date(year, month + 1, 1)
  const nextStart = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`
  const monthKey = `${year}-${pad(month + 1)}`

  const [{ data: monthly, error: monthError }, { data: latestRows, error: latestError }] = await Promise.all([
    supabase
      .from('sales_record_summary')
      .select('id,legacy_id,sale_date,customer_name,sales_channel,status,sales_amount_yen,cost_amount_yen,gross_profit_yen')
      .eq('status', 'ACTIVE')
      .gte('sale_date', start)
      .lt('sale_date', nextStart)
      .order('sale_date', { ascending: false }),
    supabase
      .from('sales_record_summary')
      .select('id,legacy_id,sale_date,customer_name,sales_channel,status,sales_amount_yen,gross_profit_yen,created_at')
      .eq('status', 'ACTIVE')
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  if (monthError) throw monthError
  if (latestError) throw latestError

  const monthSalesYen = (monthly || []).reduce((sum: number, row: any) => sum + n(row.sales_amount_yen), 0)
  const monthCostYen = (monthly || []).reduce((sum: number, row: any) => sum + n(row.cost_amount_yen), 0)
  const monthGrossProfitYen = (monthly || []).reduce((sum: number, row: any) => sum + n(row.gross_profit_yen), 0)
  const latestRow: any = latestRows?.[0]

  return {
    monthKey,
    monthSalesYen,
    monthCostYen,
    monthGrossProfitYen,
    monthGrossMarginPct: monthSalesYen > 0 ? monthGrossProfitYen / monthSalesYen * 100 : 0,
    monthSaleCount: monthly?.length || 0,
    latest: latestRow ? {
      id: latestRow.id,
      legacyId: latestRow.legacy_id || '',
      date: latestRow.sale_date || '',
      customerName: latestRow.customer_name || '',
      channel: latestRow.sales_channel || '',
      salesAmountYen: n(latestRow.sales_amount_yen),
      grossProfitYen: n(latestRow.gross_profit_yen),
    } : null,
  }
}
