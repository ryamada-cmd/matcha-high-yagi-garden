import { useEffect, useMemo, useState } from 'react'
import { CloudRain, Droplets, MapPin, RefreshCw, Settings, Sun, ThermometerSun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadWeatherDashboard, weatherLabel, type WeatherDashboard } from '../lib/weather'

const todayLocal = () => new Intl.DateTimeFormat('sv-SE').format(new Date())
const dayMs = 86400000
const dateNum = (v: string) => Math.floor(Date.parse(`${v}T00:00:00Z`) / dayMs)

function relativeLabel(date: string, today: string) {
  const diff = dateNum(date) - dateNum(today)
  if (diff === -1) return '昨日'
  if (diff === 0) return '今日'
  if (diff === 1) return '明日'
  const d = new Date(`${date}T00:00:00`)
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(d)
}

function WeatherGlyph({code}:{code:number}) {
  if (code === 0 || code === 1) return <Sun size={24}/>
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(code)) return <CloudRain size={24}/>
  return <ThermometerSun size={24}/>
}

export default function WeatherPanel() {
  const [data, setData] = useState<WeatherDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true); setError('')
    try { setData(await loadWeatherDashboard()) }
    catch (e:any) { setError(e?.message || '天気情報を取得できませんでした。') }
    finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])
  const today = todayLocal()
  const visibleDays = useMemo(() => (data?.days || []).filter((d) => dateNum(d.date) >= dateNum(today) - 1).slice(0, 9), [data, today])

  return <section className="panel weather-panel">
    <div className="panel-title weather-title">
      <div><h2>天気</h2><p>{data?.location ? <><MapPin size={13}/>{data.location.name}</> : '地点を設定すると表示されます'}</p></div>
      <div className="weather-head-actions"><button className="icon-button" aria-label="天気を更新" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={17} className={loading?'spin':''}/></button><Link to="/settings" className="weather-settings-link"><Settings size={16}/>地点設定</Link></div>
    </div>

    {error && <div className="notice error">{error}</div>}
    {!loading && !error && !data?.location && <div className="weather-empty"><MapPin size={24}/><div><b>天気地点が未設定です。</b><span>設定・監査から地名を検索して地点を保存してください。</span></div><Link to="/settings">設定する</Link></div>}

    {data?.location && <>
      <div className="weather-days">
        {visibleDays.map((d) => <article className={`weather-day ${d.date===today?'today':''} ${dateNum(d.date)<dateNum(today)?'past':''}`} key={d.date}>
          <div className="weather-day-head"><b>{relativeLabel(d.date,today)}</b><span>{d.date.slice(5).replace('-','/')}</span></div>
          <div className="weather-condition"><WeatherGlyph code={d.weatherCode}/><strong>{weatherLabel(d.weatherCode)}</strong></div>
          <div className="weather-temp"><span>{d.tempMax===null?'—':`${Math.round(d.tempMax)}°`}</span><small>/ {d.tempMin===null?'—':`${Math.round(d.tempMin)}°`}</small></div>
          <div className="weather-stat"><Droplets size={14}/><span>降水確率</span><b>{d.precipitationProbability===null?'—':`${Math.round(d.precipitationProbability)}%`}</b></div>
          <div className="weather-stat"><CloudRain size={14}/><span>降水量</span><b>{d.precipitationSum===null?'—':`${d.precipitationSum.toFixed(1)}mm`}</b></div>
        </article>)}
      </div>
      <div className="weather-foot">昨日・今日・今後7日を表示｜Weather data: Open-Meteo</div>
    </>}
  </section>
}
