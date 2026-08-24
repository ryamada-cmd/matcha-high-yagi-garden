import { supabase } from './supabase'

export type WeatherLocation = {
  name: string
  latitude: number
  longitude: number
  admin1?: string
  country?: string
}

export type DailyWeather = {
  date: string
  weatherCode: number
  tempMax: number | null
  tempMin: number | null
  precipitationProbability: number | null
  precipitationSum: number | null
}

export type WeatherDashboard = {
  location: WeatherLocation | null
  days: DailyWeather[]
  timezone: string
}

const numOrNull = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function searchWeatherLocations(query: string): Promise<WeatherLocation[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', q)
  url.searchParams.set('count', '8')
  url.searchParams.set('language', 'ja')
  url.searchParams.set('format', 'json')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`地点検索に失敗しました (${res.status})`)
  const json = await res.json()
  return (Array.isArray(json?.results) ? json.results : []).map((r: any) => ({
    name: String(r.name || ''),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    admin1: r.admin1 || '',
    country: r.country || '',
  })).filter((r: WeatherLocation) => r.name && Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
}

export async function loadWeatherDashboard(): Promise<WeatherDashboard> {
  const { data: settings, error } = await supabase.rpc('get_app_settings')
  if (error) throw error
  const raw = settings as any
  const lat = numOrNull(raw?.weather_latitude)
  const lon = numOrNull(raw?.weather_longitude)
  const name = String(raw?.weather_location_name || '').trim()
  if (lat === null || lon === null) return { location: null, days: [], timezone: '' }

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('past_days', '1')
  url.searchParams.set('forecast_days', '8')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`天気情報の取得に失敗しました (${res.status})`)
  const json = await res.json()
  const d = json?.daily || {}
  const times: string[] = Array.isArray(d.time) ? d.time : []
  const days = times.map((date, i) => ({
    date,
    weatherCode: Number(d.weather_code?.[i] ?? -1),
    tempMax: numOrNull(d.temperature_2m_max?.[i]),
    tempMin: numOrNull(d.temperature_2m_min?.[i]),
    precipitationProbability: numOrNull(d.precipitation_probability_max?.[i]),
    precipitationSum: numOrNull(d.precipitation_sum?.[i]),
  }))

  return {
    location: { name: name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`, latitude: lat, longitude: lon },
    days,
    timezone: String(json?.timezone || ''),
  }
}

export function weatherLabel(code: number) {
  if (code === 0) return '快晴'
  if ([1,2].includes(code)) return '晴れ時々曇り'
  if (code === 3) return '曇り'
  if ([45,48].includes(code)) return '霧'
  if ([51,53,55,56,57].includes(code)) return '霧雨'
  if ([61,63,65,66,67].includes(code)) return '雨'
  if ([71,73,75,77].includes(code)) return '雪'
  if ([80,81,82].includes(code)) return 'にわか雨'
  if ([85,86].includes(code)) return 'にわか雪'
  if ([95,96,99].includes(code)) return '雷雨'
  return '不明'
}
