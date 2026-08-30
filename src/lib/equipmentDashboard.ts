import { supabase } from './supabase'

export type EquipmentDashboardAlert = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  href: string
  action: string
}

export type EquipmentDashboardDue = {
  assetNo: string
  name: string
  label: string
  date: string
  days: number
}

export type EquipmentDashboardData = {
  activeCount: number
  criticalCount: number
  warningCount: number
  attentionCount: number
  acquisitionValueYen: number
  alerts: EquipmentDashboardAlert[]
  nextDue: EquipmentDashboardDue | null
}

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const localToday = () => new Intl.DateTimeFormat('sv-SE').format(new Date())
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000)
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from)
const severityRank = (severity: EquipmentDashboardAlert['severity']) => severity === 'critical' ? 0 : severity === 'warning' ? 1 : 2

export async function loadEquipmentDashboard(): Promise<EquipmentDashboardData> {
  const { data, error } = await supabase.from('equipment_asset_summary').select('*').order('name')
  if (error) throw error

  const today = localToday()
  const assets = (data || []).filter((row: any) => row.is_active !== false && row.status !== 'DISPOSED') as any[]
  const alerts: EquipmentDashboardAlert[] = []
  const dueItems: EquipmentDashboardDue[] = []

  for (const asset of assets) {
    const assetNo = String(asset.asset_no || '')
    const name = String(asset.name || '設備')
    const condition = String(asset.condition_note || '')
    const status = String(asset.status || 'NORMAL')

    if (status === 'REPAIR_NEEDED' || status === 'UNDER_REPAIR') {
      alerts.push({
        id: `equipment-status-${asset.id}`,
        severity: 'critical',
        title: `${name}：${status === 'UNDER_REPAIR' ? '修理中' : '修理が必要です'}`,
        detail: condition || `${assetNo || '設備台帳'}の状態を確認してください。`,
        href: '/equipment',
        action: '設備を確認',
      })
    } else if (status === 'CAUTION' || status === 'OUT_OF_SERVICE') {
      alerts.push({
        id: `equipment-status-${asset.id}`,
        severity: 'warning',
        title: `${name}：${status === 'OUT_OF_SERVICE' ? '使用停止中' : '状態に注意が必要です'}`,
        detail: condition || `${assetNo || '設備台帳'}の状態を確認してください。`,
        href: '/equipment',
        action: '設備を確認',
      })
    }

    const deadlines = [
      ['車検', asset.vehicle_inspection_expiry],
      ['自動車税', asset.vehicle_tax_due_date],
      ['保険', asset.insurance_expiry],
      ['次回整備', asset.next_maintenance_date],
    ] as const

    for (const [label, rawDate] of deadlines) {
      const date = String(rawDate || '')
      if (!date) continue
      const days = daysBetween(today, date)
      dueItems.push({ assetNo, name, label, date, days })
      if (days < 0) {
        alerts.push({
          id: `equipment-due-${asset.id}-${label}`,
          severity: 'critical',
          title: `${name}：${label}期限を超過しています`,
          detail: `${date}（${Math.abs(days)}日超過）${assetNo ? ` / ${assetNo}` : ''}`,
          href: '/equipment',
          action: '期限を確認',
        })
      } else if (days <= 30) {
        alerts.push({
          id: `equipment-due-${asset.id}-${label}`,
          severity: 'warning',
          title: `${name}：${label}期限まで${days}日`,
          detail: `${date}${assetNo ? ` / ${assetNo}` : ''}`,
          href: '/equipment',
          action: '期限を確認',
        })
      }
    }
  }

  alerts.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.title.localeCompare(b.title, 'ja'))
  dueItems.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ja'))

  const criticalCount = alerts.filter(alert => alert.severity === 'critical').length
  const warningCount = alerts.filter(alert => alert.severity === 'warning').length

  return {
    activeCount: assets.length,
    criticalCount,
    warningCount,
    attentionCount: criticalCount + warningCount,
    acquisitionValueYen: assets.reduce((sum, asset) => sum + n(asset.purchase_price_yen), 0),
    alerts,
    nextDue: dueItems[0] || null,
  }
}
