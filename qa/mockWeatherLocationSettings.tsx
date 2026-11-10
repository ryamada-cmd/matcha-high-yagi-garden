// QA-only weather settings stub, never reaches public geocoding/weather services.
export default function WeatherLocationSettings({canManage}:{canManage:boolean}){
 return <section className="panel" data-qa="weather-settings-stub">
  <p>架空の天気設定（通信なし）</p>
  <span>{canManage?'管理可':'閲覧のみ'}</span>
 </section>
}
