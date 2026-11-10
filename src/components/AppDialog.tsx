import { useEffect } from 'react'
import { Dialog as AstryxDialog, type DialogProps } from '@astryxdesign/core/Dialog'

export { DialogHeader } from '@astryxdesign/core/Dialog'

// Every form uses the same scroll surface, including desktop/landscape and
// the smaller visual viewport left above a phone's software keyboard.
export function Dialog({ className = '', ...props }: DialogProps) {
  useEffect(() => {
    if (!props.isOpen) return
    const viewport = window.visualViewport
    const root = document.documentElement
    const update = () => {
      root.style.setProperty('--app-viewport-height', `${viewport?.height ?? window.innerHeight}px`)
      root.style.setProperty('--app-viewport-top', `${viewport?.offsetTop ?? 0}px`)
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      root.style.removeProperty('--app-viewport-height')
      root.style.removeProperty('--app-viewport-top')
    }
  }, [props.isOpen])

  return <AstryxDialog {...props} className={`app-dialog ${className}`}/>
}
