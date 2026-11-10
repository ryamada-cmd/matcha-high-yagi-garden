import {useLocation} from 'react-router-dom'
export default function AuthFixturePage(){
 const location=useLocation()
 return <section className="panel" data-qa="protected-page">
  <h1>QA PROTECTED SCREEN</h1>
  <p data-qa="protected-path">{location.pathname}</p>
 </section>
}
