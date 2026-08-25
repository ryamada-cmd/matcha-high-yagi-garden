import { supabase } from './supabase'

export type FieldSaleTraceItem = {
  salesItemId: string
  materialName: string
  lotLegacyId: string
  attributedQty: number
  unit: string
  sourceShare: number
  attributedSalesYen: number
  attributedCostYen: number
  attributedGrossProfitYen: number
}

export type FieldSaleTraceEvent = {
  saleId: string
  legacyId: string
  date: string
  customerName: string
  channel: string
  invoiceNo: string
  attributedSalesYen: number
  attributedCostYen: number
  attributedGrossProfitYen: number
  items: FieldSaleTraceItem[]
}

export type FieldSalesTraceData = {
  saleCount: number
  attributedSalesYen: number
  attributedCostYen: number
  attributedGrossProfitYen: number
  grossMarginPct: number
  events: FieldSaleTraceEvent[]
  years: number[]
}

const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0
const yearOf = (d: string) => Number(String(d || '').slice(0, 4)) || 0

export async function loadFieldSalesTrace(fieldId: string, year: number): Promise<FieldSalesTraceData> {
  const { data: traces, error: traceError } = await supabase
    .from('sales_item_field_traceability')
    .select('sales_item_id,sales_record_id,source_share,attributed_sale_qty,unit_snapshot')
    .eq('field_id', fieldId)
  if (traceError) throw traceError
  if (!traces?.length) return { saleCount: 0, attributedSalesYen: 0, attributedCostYen: 0, attributedGrossProfitYen: 0, grossMarginPct: 0, events: [], years: [year] }

  const saleIds = [...new Set(traces.map((x: any) => x.sales_record_id))]
  const itemIds = [...new Set(traces.map((x: any) => x.sales_item_id))]
  const [{ data: sales, error: salesError }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from('sales_record_summary')
      .select('id,legacy_id,sale_date,customer_name,sales_channel,invoice_no,status')
      .in('id', saleIds)
      .eq('status', 'ACTIVE'),
    supabase
      .from('sales_record_items')
      .select('id,sales_record_id,lot_legacy_id_snapshot,material_name_snapshot,sales_amount_yen,cost_amount_yen,gross_profit_yen')
      .in('id', itemIds),
  ])
  if (salesError) throw salesError
  if (itemsError) throw itemsError

  const saleMap = new Map((sales || []).map((x: any) => [x.id, x]))
  const itemMap = new Map((items || []).map((x: any) => [x.id, x]))
  const grouped = new Map<string, FieldSaleTraceEvent>()
  const years = new Set<number>([year])

  for (const trace of traces as any[]) {
    const sale: any = saleMap.get(trace.sales_record_id)
    const item: any = itemMap.get(trace.sales_item_id)
    if (!sale || !item) continue
    const y = yearOf(sale.sale_date)
    if (y) years.add(y)
    const share = n(trace.source_share)
    const traceItem: FieldSaleTraceItem = {
      salesItemId: trace.sales_item_id,
      materialName: item.material_name_snapshot || '',
      lotLegacyId: item.lot_legacy_id_snapshot || '',
      attributedQty: n(trace.attributed_sale_qty),
      unit: trace.unit_snapshot || '',
      sourceShare: share,
      attributedSalesYen: n(item.sales_amount_yen) * share,
      attributedCostYen: n(item.cost_amount_yen) * share,
      attributedGrossProfitYen: n(item.gross_profit_yen) * share,
    }
    const existing: FieldSaleTraceEvent = grouped.get(sale.id) ?? {
      saleId: sale.id,
      legacyId: sale.legacy_id || '',
      date: sale.sale_date || '',
      customerName: sale.customer_name || '',
      channel: sale.sales_channel || '',
      invoiceNo: sale.invoice_no || '',
      attributedSalesYen: 0,
      attributedCostYen: 0,
      attributedGrossProfitYen: 0,
      items: [],
    }
    existing.attributedSalesYen += traceItem.attributedSalesYen
    existing.attributedCostYen += traceItem.attributedCostYen
    existing.attributedGrossProfitYen += traceItem.attributedGrossProfitYen
    existing.items.push(traceItem)
    grouped.set(sale.id, existing)
  }

  const events = [...grouped.values()]
    .filter(x => yearOf(x.date) === year)
    .sort((a, b) => b.date.localeCompare(a.date) || b.legacyId.localeCompare(a.legacyId))
  const attributedSalesYen = events.reduce((s, x) => s + x.attributedSalesYen, 0)
  const attributedCostYen = events.reduce((s, x) => s + x.attributedCostYen, 0)
  const attributedGrossProfitYen = events.reduce((s, x) => s + x.attributedGrossProfitYen, 0)

  return {
    saleCount: events.length,
    attributedSalesYen,
    attributedCostYen,
    attributedGrossProfitYen,
    grossMarginPct: attributedSalesYen > 0 ? attributedGrossProfitYen / attributedSalesYen * 100 : 0,
    events,
    years: [...years].filter(Boolean).sort((a, b) => b - a),
  }
}
