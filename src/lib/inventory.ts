import { supabase } from './supabase'
import { hasPermission } from './permissions'

export type InventoryRow = {
  lotId: string
  legacyId: string
  pesticideId: string
  pesticideName: string
  balance: number
  unit: string
  packageSize: number
  packageCount: number
  packageUnit: string
  unitPrice: number
  stockValue: number
  purchaseDate: string
  supplier: string
  expiryDate: string
  storage: string
  manufacturerLotNo: string
  note: string
}

export type PesticideOption = { id: string; name: string; legacyId: string; famicRegistrationNo: string }
export type InventoryTransactionRow = {
  id: string
  type: 'PURCHASE'|'SPRAY'|'RETURN'|'ADJUSTMENT'|'DISPOSAL'
  quantity: number
  signedQuantity: number
  unit: string
  reason: string
  createdAt: string
  lotId: string
  legacyId: string
  pesticideName: string
  createdByName: string
}

export type ReceiveLotInput = {
  pesticideId: string
  purchaseDate: string
  supplier: string
  purchaseUnitPrice: number
  packageCount: number
  packageUnit: string
  packageSize: number
  contentUnit: 'ml'|'g'
  expiryDate: string
  storageLocation: string
  manufacturerLotNo: string
  note: string
}

function n(v: unknown) {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export async function loadInventoryRole(): Promise<string> {
  return await hasPermission('pesticide_inventory.manage') ? 'admin' : 'worker'
}

export async function loadPesticideOptions(): Promise<PesticideOption[]> {
  const { data, error } = await supabase.from('pesticides').select('id,name,legacy_id,famic_registration_no').order('name')
  if (error) throw error
  return (data || []).map((p: any) => ({
    id: p.id,
    name: p.name || '',
    legacyId: p.legacy_id || '',
    famicRegistrationNo: p.famic_registration_no || '',
  }))
}

export async function loadInventory(): Promise<InventoryRow[]> {
  const [lotsRes, balancesRes] = await Promise.all([
    supabase
      .from('inventory_lots')
      .select('id,legacy_id,pesticide_id,purchase_date,supplier,purchase_unit_price,package_count,package_unit,package_size,content_unit,purchased_content_qty,expiry_date,storage_location,manufacturer_lot_no,note,pesticides(name)'),
    supabase.from('inventory_balances').select('inventory_lot_id,balance'),
  ])

  if (lotsRes.error) throw lotsRes.error
  if (balancesRes.error) throw balancesRes.error

  const balanceMap = new Map((balancesRes.data || []).map((b: any) => [b.inventory_lot_id, n(b.balance)]))

  return (lotsRes.data || [])
    .map((lot: any) => {
      const p = Array.isArray(lot.pesticides) ? lot.pesticides[0] : lot.pesticides
      const balance = balanceMap.get(lot.id) || 0
      const packageSize = n(lot.package_size)
      const packageCount = n(lot.package_count)
      const unitPrice = n(lot.purchase_unit_price)
      const stockValue = packageSize > 0 ? Math.round((unitPrice / packageSize) * balance) : 0
      return {
        lotId: lot.id,
        legacyId: lot.legacy_id || '',
        pesticideId: lot.pesticide_id,
        pesticideName: p?.name || '農薬名未設定',
        balance,
        unit: lot.content_unit || '',
        packageSize,
        packageCount,
        packageUnit: lot.package_unit || '',
        unitPrice,
        stockValue,
        purchaseDate: lot.purchase_date || '',
        supplier: lot.supplier || '',
        expiryDate: lot.expiry_date || '',
        storage: lot.storage_location || '',
        manufacturerLotNo: lot.manufacturer_lot_no || '',
        note: lot.note || '',
      }
    })
    .sort((a, b) => {
      if (a.balance > 0 && b.balance <= 0) return -1
      if (a.balance <= 0 && b.balance > 0) return 1
      return a.pesticideName.localeCompare(b.pesticideName, 'ja')
    })
}

export async function loadInventoryTransactions(limit = 250): Promise<InventoryTransactionRow[]> {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('id,inventory_lot_id,transaction_type,quantity,unit,reason,created_by,created_at,inventory_lots(legacy_id,pesticides(name))')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  const userIds = [...new Set((data || []).map((r: any) => r.created_by).filter(Boolean))]
  const profileMap = new Map<string,string>()
  if (userIds.length) {
    const profileRes = await supabase.from('profiles').select('id,display_name').in('id', userIds)
    if (!profileRes.error) for (const p of profileRes.data || []) profileMap.set((p as any).id, (p as any).display_name || '')
  }

  return (data || []).map((r: any) => {
    const lot = Array.isArray(r.inventory_lots) ? r.inventory_lots[0] : r.inventory_lots
    const pesticide = Array.isArray(lot?.pesticides) ? lot.pesticides[0] : lot?.pesticides
    const qty = n(r.quantity)
    const type = r.transaction_type as InventoryTransactionRow['type']
    const signed = type === 'SPRAY' || type === 'DISPOSAL' ? -Math.abs(qty) : qty
    return {
      id: r.id,
      type,
      quantity: qty,
      signedQuantity: signed,
      unit: r.unit || '',
      reason: r.reason || '',
      createdAt: r.created_at || '',
      lotId: r.inventory_lot_id,
      legacyId: lot?.legacy_id || '',
      pesticideName: pesticide?.name || '農薬名未設定',
      createdByName: profileMap.get(r.created_by) || '',
    }
  })
}

export async function receiveInventoryLot(input: ReceiveLotInput) {
  const { data, error } = await supabase.rpc('admin_receive_inventory_lot', {
    p_pesticide_id: input.pesticideId,
    p_purchase_date: input.purchaseDate || null,
    p_supplier: input.supplier || '',
    p_purchase_unit_price: input.purchaseUnitPrice,
    p_package_count: input.packageCount,
    p_package_unit: input.packageUnit || '',
    p_package_size: input.packageSize,
    p_content_unit: input.contentUnit,
    p_expiry_date: input.expiryDate || null,
    p_storage_location: input.storageLocation || '',
    p_manufacturer_lot_no: input.manufacturerLotNo || '',
    p_note: input.note || '',
  })
  if (error) throw error
  return data as string
}

export async function adjustInventoryStock(lotId: string, physicalBalance: number, reason: string) {
  const { data, error } = await supabase.rpc('admin_adjust_inventory_stock', {
    p_inventory_lot_id: lotId,
    p_physical_balance: physicalBalance,
    p_reason: reason,
  })
  if (error) throw error
  return n(data)
}

export async function disposeInventoryStock(lotId: string, quantity: number, reason: string) {
  const { data, error } = await supabase.rpc('admin_dispose_inventory_stock', {
    p_inventory_lot_id: lotId,
    p_quantity: quantity,
    p_reason: reason,
  })
  if (error) throw error
  return n(data)
}
