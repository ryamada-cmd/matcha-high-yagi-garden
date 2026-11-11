import type { ReactNode } from 'react'
import { Theme } from '@astryxdesign/core/theme'
import { InternationalizationProvider } from '@astryxdesign/core/i18n'
import ja from '@astryxdesign/core/locales/ja-JP.generated.js'
import { matchaTheme } from '@astryxdesign/theme-matcha/built'

const messages = { 'ja-JP': ja }
export function AppTheme({ children }: { children: ReactNode }) {
  return <InternationalizationProvider locale="ja-JP" messages={messages}>
    <Theme theme={matchaTheme} mode="light">{children}</Theme>
  </InternationalizationProvider>
}
