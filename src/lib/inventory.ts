import { supabase } from './supabase'

export type InventoryRow = {
  lotId: string
  legacyId: string
  pesticideId: string
  pesticideName: string
  balance: number
  unit: string
  packageSize: number
  unitPrice: number
  stockValue: number
  purchaseDate: string
  supplier: string
  expiryDate: string
  storage: string
}

function n(v: unknown) {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export async function loadInventory(): Promise<InventoryRow[]> {
  const [lotsRes, balancesRes] = await Promise.all([
    supabase
      .from('inventory_lots')
      .select('id,legacy_id,pesticide_id,purchase_date,supplier,purchase_unit_price,package_size,content_unit,expiry_date,storage_location,pesticides(name)'),
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
        unitPrice,
        stockValue,
        purchaseDate: lot.purchase_date || '',
        supplier: lot.supplier || '',
        expiryDate: lot.expiry_date || '',
        storage: lot.storage_location || '',
      }
    })
    .sort((a, b) => {
      if (a.balance > 0 && b.balance <= 0) return -1
      if (a.balance <= 0 && b.balance > 0) return 1
      return a.pesticideName.localeCompare(b.pesticideName, 'ja')
    })
}
