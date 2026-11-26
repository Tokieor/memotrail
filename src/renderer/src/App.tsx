import { useCallback, useEffect, useState } from 'react'
import type { AppConfig, User } from '@shared/types'
import { applyTheme, watchSystemAppearance } from './lib/theme'
import { SignIn } from './views/SignIn'
import { Timeline } from './views/Timeline'

export function App(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    void (async () => {
      const loaded = await window.api.config.get()
      setConfig(loaded)
      const status = await window.api.auth.status()
      if (status.success && status.data) setUser(status.data)
      setChecking(false)
    })()
  }, [])

  useEffect(() => {
    if (!config) return
    applyTheme(config.theme, config.appearance)
    return watchSystemAppearance(config.theme, config.appearance)
  }, [config?.theme, config?.appearance])

  const onSignedIn = useCallback((signedIn: User, next: AppConfig) => {
    setUser(signedIn)
    setConfig(next)
  }, [])

  const onSignOut = useCallback(async () => {
    await window.api.auth.signOut()
    setUser(null)
  }, [])

  if (checking || !config) return <div className="h-full" />

  if (!user) return <SignIn config={config} onSignedIn={onSignedIn} />

  return <Timeline config={config} user={user} onSignOut={onSignOut} onConfigChange={setConfig} />
}
