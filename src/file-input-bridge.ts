const lastHandledSignature = new WeakMap<HTMLInputElement, string>()
const pendingTimers = new WeakMap<HTMLInputElement, number>()

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

function dispatchMissingChange(input: HTMLInputElement) {
  const signature = fileSignature(input)
  if (!signature || lastHandledSignature.get(input) === signature) return

  lastHandledSignature.set(input, signature)
  input.dispatchEvent(new Event('change', { bubbles: true }))
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

// Mobile Safari / WKWebView can occasionally return from the native picker
// without emitting the usual change event. Keep the native change path as the
// primary path and synthesize it only when a selected FileList exists but no
// change event was observed.
document.addEventListener('click', event => {
  if (!isFileInput(event.target)) return
  lastHandledSignature.delete(event.target)
}, true)

document.addEventListener('change', event => {
  if (!isFileInput(event.target)) return
  const signature = fileSignature(event.target)
  if (signature) lastHandledSignature.set(event.target, signature)
}, true)

document.addEventListener('input', event => {
  if (!isFileInput(event.target)) return
  scheduleFallback(event.target, 120)
}, true)

window.addEventListener('focus', () => {
  window.setTimeout(() => scanFileInputs(80), 120)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    window.setTimeout(() => scanFileInputs(80), 120)
  }
})
