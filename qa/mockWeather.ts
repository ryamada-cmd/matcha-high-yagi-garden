// Fake weather geocoder and forecast. No Open-Meteo HTTP calls.
const candidates=[
 {name:'架空井手町',admin1:'京都府',country:'日本',latitude:34.8,longitude:135.8},
 {name:'架空宇治市',admin1:'京都府',country:'日本',latitude:34.9,longitude:135.7}
]
export async function searchWeatherLocations(query:string){
 (window as any).__qa_weather_search=query
 return query.toLowerCase().includes('none')?[]:candidates.map(x=>({...x}))
}
export async function loadWeatherDashboard(){
 (window as any).__qa_weather_loaded=true
 return {location:{name:'架空井手町',latitude:34.8,longitude:135.8},days:[]}
}
export function weatherLabel(_code:number){return '晴れ'}
