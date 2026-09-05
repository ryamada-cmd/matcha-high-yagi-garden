const lastHandledSignature = new WeakMap<HTMLInputElement, string>()
const pendingTimers = new WeakMap<HTMLInputElement, number>()
const bridgeDispatching = new WeakSet<HTMLInputElement>()
let activePickerInput: HTMLInputElement | null = null
let lastDiagnostic = '待機中。写真を選ぶと、iPhoneから受信した件数をここに表示します。'

function isFileInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement && target.type === 'file'
}

function fileSignature(input: HTMLInputElement) {
  const files = input.files
  if (!files?.length) return ''
  return Array.from(files)
    .map(file => `${file.name}:${file.size}:${file.lastModified}:${file.type}`)
    .join('|')
}

function ensureDiagnostic() {
  const card = document.querySelector<HTMLElement>('.photo-upload-card')
  if (!card) return null

  let diagnostic = document.getElementById('file-input-bridge-diagnostic')
  if (!diagnostic) {
    diagnostic = document.createElement('div')
    diagnostic.id = 'file-input-bridge-diagnostic'
    diagnostic.setAttribute('role', 'status')
    diagnostic.style.marginTop = '8px'
    diagnostic.style.padding = '8px 10px'
    diagnostic.style.border = '1px solid rgba(100,116,139,.22)'
    diagnostic.style.borderRadius = '8px'
    diagnostic.style.background = 'rgba(248,250,252,.92)'
    diagnostic.style.fontSize = '12px'
    diagnostic.style.lineHeight = '1.55'
    diagnostic.style.color = '#475569'
    diagnostic.style.overflowWrap = 'anywhere'

    const footer = card.querySelector('.photo-upload-footer')
    if (footer) card.insertBefore(diagnostic, footer)
    else card.appendChild(diagnostic)
  }

  diagnostic.textContent = `選択診断（iPhone互換 v3）：${lastDiagnostic}`
  return diagnostic
}

function showDiagnostic(message: string) {
  lastDiagnostic = message
  ensureDiagnostic()
}

function pickerLabel(input: HTMLInputElement | null) {
  if (!input) return '写真選択'
  return input.hasAttribute('capture') ? 'カメラ' : '写真ライブラリ'
}

function dispatchCompanionEvent(input: HTMLInputElement, eventType: 'input' | 'change') {
  if (bridgeDispatching.has(input)) return
  if (!input.files?.length) return

  bridgeDispatching.add(input)
  try {
    input.dispatchEvent(new Event(eventType, { bubbles: true }))
  } finally {
    bridgeDispatching.delete(input)
  }
}

function deliverCurrentFiles(input: HTMLInputElement, source: string) {
  const count = input.files?.length || 0
  if (!count) {
    showDiagnostic(`${source}：iPhoneから受信 0件`)
    return false
  }

  const signature = fileSignature(input)
  showDiagnostic(`${source}：iPhoneから受信 ${count}件。アプリへ受け渡し中…`)
  lastHandledSignature.set(input, signature)

  // Reactの合成イベントがMobile Safari / WKWebViewで欠落しても、
  // input/changeの片方をもう片方から同期的に補完して必ずコンポーネントへ届ける。
  dispatchCompanionEvent(input, 'change')
  dispatchCompanionEvent(input, 'input')
  return true
}

function dispatchMissingChange(input: HTMLInputElement) {
  const signature = fileSignature(input)
  if (!signature) return
  if (lastHandledSignature.get(input) === signature) return

  lastHandledSignature.set(input, signature)
  showDiagnostic(`${pickerLabel(input)}復帰：iPhoneから受信 ${input.files?.length || 0}件。changeを補完しました。`)
  dispatchCompanionEvent(input, 'change')
}

function scheduleFallback(input: HTMLInputElement, delay = 250) {
  const previous = pendingTimers.get(input)
  if (previous !== undefined) window.clearTimeout(previous)

  const timer = window.setTimeout(() => {
    pendingTimers.delete(input)
    dispatchMissingChange(input)
  }, delay)
  pendingTimers.set(input, timer)
}

function scanFileInputs(delay = 180) {
  document.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach(input => {
    if (input.files?.length) scheduleFallback(input, delay)
  })
}

function markPickerOpen(input: HTMLInputElement | null) {
  if (!input) return
  activePickerInput = input
  lastHandledSignature.delete(input)
  showDiagnostic(`${pickerLabel(input)}：選択画面を開いています…`)
}

function recoverActivePicker(source: string) {
  const input = activePickerInput
  if (!input) return

  window.setTimeout(() => {
    if (activePickerInput !== input) return
    const count = input.files?.length || 0
    if (count) {
      showDiagnostic(`${source}：iPhoneから受信 ${count}件。選択結果を復旧します。`)
      deliverCurrentFiles(input, source)
      scheduleFallback(input, 80)
    } else {
      showDiagnostic(`${source}：iPhoneから受信 0件。写真を確定した場合は、iOS側からFileが返っていません。`)
    }
    activePickerInput = null
  }, 650)
}

// ラベル上の透明inputをiOSが直接activateする場合でも、pickerを開く前に必ず診断表示を出す。
document.addEventListener('pointerdown', event => {
  const element = event.target instanceof Element ? event.target : null
  const label = element?.closest('.photo-source-actions label')
  const input = label?.querySelector<HTMLInputElement>('input[type="file"]') || null
  if (input) markPickerOpen(input)
}, true)

document.addEventListener('touchstart', event => {
  const element = event.target instanceof Element ? event.target : null
  const label = element?.closest('.photo-source-actions label')
  const input = label?.querySelector<HTMLInputElement>('input[type="file"]') || null
  if (input) markPickerOpen(input)
}, { capture: true, passive: true })

document.addEventListener('click', event => {
  if (isFileInput(event.target)) markPickerOpen(event.target)
}, true)

// Reactより先にcapture phaseでFileListを確認し、Reactがinput/changeの片方を取りこぼしても補完する。
document.addEventListener('change', event => {
  if (!isFileInput(event.target)) return
  const input = event.target
  const count = input.files?.length || 0
  showDiagnostic(`${pickerLabel(input)} change：iPhoneから受信 ${count}件`)
  if (count && !bridgeDispatching.has(input)) {
    lastHandledSignature.set(input, fileSignature(input))
    dispatchCompanionEvent(input, 'input')
  }
  activePickerInput = null
}, true)

document.addEventListener('input', event => {
  if (!isFileInput(event.target)) return
  const input = event.target
  const count = input.files?.length || 0
  showDiagnostic(`${pickerLabel(input)} input：iPhoneから受信 ${count}件`)
  if (count && !bridgeDispatching.has(input)) {
    lastHandledSignature.set(input, fileSignature(input))
    dispatchCompanionEvent(input, 'change')
  }
  scheduleFallback(input, 80)
  activePickerInput = null
}, true)

document.addEventListener('cancel', event => {
  if (!isFileInput(event.target)) return
  showDiagnostic(`${pickerLabel(event.target)}：キャンセル、またはiPhoneから受信 0件`)
  activePickerInput = null
}, true)

window.addEventListener('focus', () => {
  recoverActivePicker('画面復帰')
  window.setTimeout(() => scanFileInputs(80), 120)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    recoverActivePicker('写真選択から復帰')
    window.setTimeout(() => scanFileInputs(80), 120)
  }
})

function startDiagnosticObserver() {
  ensureDiagnostic()
  const observer = new MutationObserver(() => ensureDiagnostic())
  observer.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startDiagnosticObserver, { once: true })
} else {
  startDiagnosticObserver()
}
