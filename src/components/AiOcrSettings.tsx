import { useEffect, useState } from 'react'
import { KeyRound, Save, Sparkles } from 'lucide-react'
import { loadAiOcrStatus, saveAiOcrConfig, type AiOcrStatus } from '../lib/aiOcr'

function fmt(value:string){
  if(!value)return'—'
  const d=new Date(value)
  return Number.isNaN(d.getTime())?value:d.toLocaleString('ja-JP')
}

export default function AiOcrSettings({canManage}:{canManage:boolean}){
  const[status,setStatus]=useState<AiOcrStatus|null>(null)
  const[apiKey,setApiKey]=useState('')
  const[model,setModel]=useState('gpt-6-astra')
  const[enabled,setEnabled]=useState(false)
  const[loading,setLoading]=useState(true)
  const[saving,setSaving]=useState(false)
  const[error,setError]=useState('')
  const[success,setSuccess]=useState('')

  async function refresh(){
    if(!canManage){setLoading(false);return}
    setLoading(true);setError('')
    try{
      const next=await loadAiOcrStatus()
      setStatus(next);setModel(next.model);setEnabled(next.enabled)
    }catch(e:any){setError(e?.message||'AI OCR設定を読み込めませんでした。')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[canManage])

  async function save(){
    if(!canManage)return
    setSaving(true);setError('');setSuccess('')
    try{
      await saveAiOcrConfig({apiKey,model,enabled})
      setApiKey('')
      setSuccess('AI OCR設定を保存しました。APIキーはSupabase Vaultに暗号化保存され、画面へは再表示しません。')
      await refresh()
    }catch(e:any){setError(e?.message||'AI OCR設定を保存できませんでした。')}
    finally{setSaving(false)}
  }

  if(!canManage)return null
  const stateText=loading?'確認中…':'状態：'+(enabled?'有効':'無効')+' / 最終更新 '+fmt(status?.updatedAt||'')
  return <section className="panel settings-section ai-ocr-settings">
    <div className="panel-title"><div><h2>AI帳票解析</h2><p>請求書・領収書・支払証憑をOpenAI Visionで解析し、表構造と明細をJSONへ変換します。利用できない場合は従来OCRへ自動で切り替えます。</p></div><Sparkles size={20}/></div>
    {error&&<div className="notice error">{error}</div>}{success&&<div className="notice success">{success}</div>}
    <div className="settings-grid">
      <label><span>OpenAI APIキー</span><div className="unit-input"><KeyRound size={16}/><input type="password" autoComplete="new-password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={status?.configured?'登録済み（変更時のみ入力）':'sk-... を入力'}/></div><small>ブラウザには保存しません。Supabase Vaultへ暗号化保存します。</small></label>
      <label><span>解析モデル</span><input value={model} onChange={e=>setModel(e.target.value)} placeholder="gpt-6-astra"/><small>精度優先の既定値は gpt-6-astra です。</small></label>
      <label className="invoice-hold"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/><span><b>AI OCRを有効にする</b><small>{status?.configured?'APIキー登録済み':'APIキー未登録'}</small></span></label>
    </div>
    <div className="settings-save-row"><span>{stateText}</span><button className="primary-button compact" type="button" disabled={saving||loading} onClick={()=>void save()}><Save size={16}/>{saving?'保存中…':'AI OCR設定を保存'}</button></div>
  </section>
}
