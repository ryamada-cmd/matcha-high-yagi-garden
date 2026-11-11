import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

export class ScreenErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (!this.state.failed) return this.props.children
    return <section className="panel screen-error" role="alert">
      <AlertTriangle size={28}/>
      <h2>画面を表示できませんでした</h2>
      <p>通信の中断やアプリの更新が原因の可能性があります。再読み込みして、もう一度お試しください。</p>
      <p>再読み込みすると、保存していない入力内容は失われます。</p>
      <button type="button" className="primary-button" onClick={() => window.location.reload()}>画面を再読み込み</button>
    </section>
  }
}
