type GeocodeResult = {
  latitude: number
  longitude: number
  name?: string
  admin1?: string
  country_code?: string
}

type WeatherDaily = {
  weather_code?: number[]
  temperature_2m_max?: number[]
  temperature_2m_min?: number[]
  precipitation_sum?: number[]
  wind_speed_10m_max?: number[]
}

export type WeatherLocation = {
  site_address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
}

export type DailyWeatherSummary = {
  weather_summary: string
  temperature_high: number | null
  temperature_low: number | null
  location: string
}

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly Clear',
  2: 'Partly Cloudy',
  3: 'Cloudy',
  45: 'Fog',
  48: 'Rime Fog',
  51: 'Light Drizzle',
  53: 'Drizzle',
  55: 'Heavy Drizzle',
  56: 'Light Freezing Drizzle',
  57: 'Freezing Drizzle',
  61: 'Light Rain',
  63: 'Rain',
  65: 'Heavy Rain',
  66: 'Light Freezing Rain',
  67: 'Freezing Rain',
  71: 'Light Snow',
  73: 'Snow',
  75: 'Heavy Snow',
  77: 'Snow Grains',
  80: 'Partly Cloudy with Showers',
  81: 'Showers',
  82: 'Heavy Showers',
  85: 'Snow Showers',
  86: 'Heavy Snow Showers',
  95: 'Thunderstorms',
  96: 'Thunderstorms with Hail',
  99: 'Severe Thunderstorms with Hail',
}

export function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

export function buildLocationQuery(location: WeatherLocation) {
  const cityState = [location.city, location.state].filter(Boolean).join(', ')
  return location.postal_code || cityState || location.site_address
}

function summarizeWeather(daily: WeatherDaily) {
  const code = daily.weather_code?.[0]
  const high = daily.temperature_2m_max?.[0]
  const low = daily.temperature_2m_min?.[0]
  const precip = daily.precipitation_sum?.[0] ?? 0
  const wind = daily.wind_speed_10m_max?.[0] ?? 0
  const condition = code != null ? WEATHER_CODES[code] ?? 'Weather recorded' : 'Weather recorded'
  const precipText = `${precip.toFixed(2).replace(/\.?0+$/, '')}" precip`
  const windText = `${Math.round(wind)} mph wind`

  return {
    weather_summary: `${condition}, ${precipText}, ${windText}`,
    temperature_high: high != null ? Math.round(high) : null,
    temperature_low: low != null ? Math.round(low) : null,
  }
}

async function geocodeLocation(query: string) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', query)
  url.searchParams.set('count', '1')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('Location lookup failed')

  const body = await res.json() as { results?: GeocodeResult[] }
  return body.results?.[0] ?? null
}

async function fetchDailyWeather(location: GeocodeResult, date: string) {
  const requested = new Date(`${date}T12:00:00Z`)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const url = new URL(
    requested < today
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast'
  )
  url.searchParams.set('latitude', String(location.latitude))
  url.searchParams.set('longitude', String(location.longitude))
  url.searchParams.set('start_date', date)
  url.searchParams.set('end_date', date)
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max')
  url.searchParams.set('temperature_unit', 'fahrenheit')
  url.searchParams.set('wind_speed_unit', 'mph')
  url.searchParams.set('precipitation_unit', 'inch')
  url.searchParams.set('timezone', 'auto')

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('Weather lookup failed')

  const body = await res.json() as { daily?: WeatherDaily }
  if (!body.daily) throw new Error('No weather data found')
  return body.daily
}

export async function getWeatherForJobLocation(location: WeatherLocation, date: string): Promise<DailyWeatherSummary | null> {
  const locationQuery = buildLocationQuery(location)
  if (!locationQuery) return null

  const geocoded = await geocodeLocation(locationQuery)
  if (!geocoded) return null

  const daily = await fetchDailyWeather(geocoded, date)

  return {
    ...summarizeWeather(daily),
    location: [geocoded.name, geocoded.admin1, geocoded.country_code].filter(Boolean).join(', '),
  }
}
