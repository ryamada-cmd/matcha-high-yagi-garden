import { useMemo, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { saveAppSettings, type AppSettings } from '../lib/adminConsole'
import { searchWeatherLocations, type WeatherLocation } from '../lib/weather'

export default function WeatherLocationSettings({ settings, onSaved }:{ settings: AppSettings, onSaved: () => Promise<void> | void }) {
  const [query,setQuery] = useState(settings.weather_location_name || '')
  const [results,setResults] = useState<WeatherLocation[]>([])
  const [selected,setSelected] = useState<WeatherLocation | null>(settings.weather_latitude !== null && settings.weather_longitude !== null ? {
    name: settings.weather_location_name || '設定地点', latitude: settings.weather_latitude, longitude: settings.weather_longitude,
  } : null)
  const [searching,setSearching] = useState(false)
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')

  const selectedLabel = useMemo(() => selected ? [selected.name, selected.admin1, selected.country].filter(Boolean).join(' / ') : '', [selected])

  async function search() {
    if (query.trim().length < 2) return setError('地名を2文字以上入力してください。')
    setSearching(true); setError(''); setMessage('')
    try {
      const rows = await searchWeatherLocations(query)
      setResults(rows)
      if (!rows.length) setError('候補が見つかりませんでした。市区町村名や都道府県名を加えて検索してください。')
    } catch (e:any) { setError(e?.message || '地点検索に失敗しました。') }
    finally { setSearching(false) }
  }

  async function save() {
    if (!selected) return setError('地点候補を選択してください。')
    setSaving(true); setError(''); setMessage('')
    try {
      await saveAppSettings({
        lowStockPercent: settings.low_stock_threshold_percent,
        expiryDays: settings.expiry_warning_days,
        planDays: settings.upcoming_plan_warning_days,
        harvestDays: settings.upcoming_harvest_warning_days,
        weatherLocationName: selectedLabel || selected.name,
        weatherLatitude: selected.latitude,
        weatherLongitude: selected.longitude,
      })
      setMessage('天気地点を保存しました。ダッシュボードへ反映されます。')
      setResults([])
      await onSaved()
    } catch (e:any) { setError(e?.message || '天気地点の保存に失敗しました。') }
    finally { setSaving(false) }
  }

  return <section className="panel settings-section weather-location-settings">
    <div className="panel-title"><div><h2>天気の表示地点</h2><p>ダッシュボードに表示する地点を地名から設定します。</p></div><MapPin size={20}/></div>
    <div className="weather-location-search">
      <div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void search()}}} placeholder="例：井手町 京都府 / 宇治市 / 京都市"/></div>
      <button className="secondary-button" type="button" disabled={searching} onClick={()=>void search()}>{searching?'検索中…':'地点を検索'}</button>
    </div>
    {error&&<div className="notice error">{error}</div>}
    {message&&<div className="notice success">{message}</div>}
    {!!results.length&&<div className="weather-location-results">{results.map((r,i)=><button type="button" className={selected?.latitude===r.latitude&&selected?.longitude===r.longitude?'selected':''} key={`${r.latitude}-${r.longitude}-${i}`} onClick={()=>setSelected(r)}><MapPin size={16}/><div><b>{r.name}</b><span>{[r.admin1,r.country].filter(Boolean).join(' / ')}</span></div><small>{r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}</small></button>)}</div>}
    <div className="weather-location-current"><span>選択地点</span><b>{selected ? selectedLabel || selected.name : '未設定'}</b>{selected&&<small>{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</small>}</div>
    <div className="settings-save-row"><span>天気データはOpen-Meteoから取得します。</span><button className="primary-button compact" type="button" disabled={!selected||saving} onClick={()=>void save()}>{saving?'保存中…':'天気地点を保存'}</button></div>
  </section>
}
