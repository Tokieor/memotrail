import { useCallback, useEffect, useState } from 'react'
import type { AppConfig, User } from '@shared/types'
import { applyTheme, watchSystemAppearance } from './lib/theme'
import { applyFontSize, fontSizeFromConfig } from './lib/font-size'
import { SignIn } from './views/SignIn'
import { Timeline } from './views/Timeline'

export function App(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [initError, setInitError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        // Guard against a preload/IPC that never answers: fail visibly instead of a blank window.
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('初始化超时：主进程没有响应，请重启应用')), 10000)
        )
        const loaded = await Promise.race([window.api.config.get(), timeout])
        setConfig(loaded)
        let status: Awaited<ReturnType<typeof window.api.auth.status>> | null = null
        try {
          status = await Promise.race([window.api.auth.status(), timeout])
        } catch {
          status = null // Auth probe failing is not fatal — show the sign-in screen.
        }
        if (status?.success && status.data) setUser(status.data)
      } catch (error) {
        setInitError(error instanceof Error ? error.message : String(error))
      } finally {
        setChecking(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!config) return
    applyTheme(config.theme, config.appearance)
    return watchSystemAppearance(config.theme, config.appearance)
  }, [config?.theme, config?.appearance])

  // 字体大小随配置实时生效，两个窗口通过同一个 CSS 变量联动。
  useEffect(() => {
    if (!config) return
    applyFontSize(fontSizeFromConfig(config))
  }, [config?.fontSize])

  const onSignedIn = useCallback((signedIn: User, next: AppConfig) => {
    setUser(signedIn)
    setConfig(next)
  }, [])

  const onSignOut = useCallback(async () => {
    await window.api.auth.signOut()
    setUser(null)
  }, [])

  if (initError) {
    return (
      <div className="boot-error">
        <h2>启动失败</h2>
        <p>{initError}</p>
        <p className="boot-error-hint">请完全退出应用后重新打开；若仍失败，检查 Memos 服务地址是否可用。</p>
      </div>
    )
  }

  if (checking || !config) return <div className="h-full" />

  if (!user) return <SignIn config={config} onSignedIn={onSignedIn} />

  return <Timeline config={config} user={user} onSignOut={onSignOut} onConfigChange={setConfig} />
}
