import { supabase } from './supabase'

export type ProductMaster = {
  id: string
  sku: string
  productName: string
  category: string
  brandName: string
  janCode: string
  netContent: number
  contentUnit: string
  packageType: string
  standardPriceYen: number
  packagingCostYen: number
  status: 'ACTIVE' | 'INACTIVE'
  note: string
  createdAt: string
  updatedAt: string
}

export type ProductInput = Omit<ProductMaster, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0

export async function loadProductRole() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ''
  const { data, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (error) throw error
  return data?.role || ''
}

export async function loadProducts(): Promise<ProductMaster[]> {
  const { data, error } = await supabase
    .from('product_master')
    .select('id,sku,product_name,category,brand_name,jan_code,net_content,content_unit,package_type,standard_price_yen,packaging_cost_yen,status,note,created_at,updated_at')
    .order('category', { ascending: true })
    .order('product_name', { ascending: true })
  if (error) throw error
  return (data || []).map((r: any) => ({
    id: r.id,
    sku: r.sku || '',
    productName: r.product_name || '',
    category: r.category || '',
    brandName: r.brand_name || '',
    janCode: r.jan_code || '',
    netContent: n(r.net_content),
    contentUnit: r.content_unit || 'g',
    packageType: r.package_type || '',
    standardPriceYen: n(r.standard_price_yen),
    packagingCostYen: n(r.packaging_cost_yen),
    status: r.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    note: r.note || '',
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
  }))
}

export async function saveProduct(input: ProductInput) {
  const payload = {
    sku: input.sku,
    product_name: input.productName,
    category: input.category,
    brand_name: input.brandName,
    jan_code: input.janCode,
    net_content: input.netContent,
    content_unit: input.contentUnit,
    package_type: input.packageType,
    standard_price_yen: input.standardPriceYen,
    packaging_cost_yen: input.packagingCostYen,
    status: input.status,
    note: input.note,
  }
  const { data, error } = await supabase.rpc('admin_upsert_product', { p_product_id: input.id || null, p_payload: payload })
  if (error) throw error
  return data as string
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.rpc('admin_delete_product', { p_product_id: id })
  if (error) throw error
}
