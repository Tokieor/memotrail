import { net } from 'electron'
import type { ApiResult, ListMemosOptions, Memo, MemoList, User, Visibility } from '../../shared/types'

// The Memos 26.x HTTP API (see proto/api/*_service.proto):
//   POST /api/auth/signin      { passwordCredentials: { username, password } } -> { user, accessToken, ... }
//   POST /api/auth/refresh     rotates the refresh cookie, returns a new access token
//   GET  /api/auth/me          the signed-in user
//   GET  /api/memos            ?pageSize=&pageToken=&filter=
//   POST /api/memos            body is the Memo (content, visibility)
//
// The refresh token lives in an HttpOnly cookie; Electron's session keeps it on disk, so the
// app stays signed in across restarts and only the short-lived access token is memory-only.

let baseUrl = ''
let accessToken: string | null = null

export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, '')
}

export function hasSession(): boolean {
  return Boolean(accessToken)
}

async function call<T>(path: string, init: RequestInit = {}, retryOn401 = true): Promise<ApiResult<T>> {
  if (!baseUrl) return { success: false, error: 'No server configured' }
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  let res: Response
  try {
    res = await net.fetch(`${baseUrl}${path}`, { ...init, headers })
  } catch (err) {
    return { success: false, error: `Network error: ${(err as Error).message}` }
  }

  if (res.status === 401 && retryOn401) {
    const refreshed = await refresh()
    if (refreshed.success) return call<T>(path, init, false)
  }

  const text = await res.text()
  if (!res.ok) {
    return { success: false, error: errorMessage(text, res.status), status: res.status }
  }
  if (!text) return { success: true, data: undefined as T }
  try {
    return { success: true, data: JSON.parse(text) as T }
  } catch {
    return { success: false, error: 'The server answered with something that is not JSON' }
  }
}

function errorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string }
    if (parsed.message) return parsed.message
    if (parsed.error) return parsed.error
  } catch {
    /* not JSON */
  }
  return body.slice(0, 300) || `HTTP ${status}`
}

export async function signIn(serverUrl: string, username: string, password: string): Promise<ApiResult<User>> {
  setBaseUrl(serverUrl)
  accessToken = null
  const result = await call<{ user: User; accessToken: string; accessTokenExpireTime?: string }>(
    '/api/auth/signin',
    { method: 'POST', body: JSON.stringify({ passwordCredentials: { username, password } }) },
    false
  )
  if (!result.success) return result
  accessToken = result.data.accessToken
  return { success: true, data: result.data.user }
}

export async function refresh(): Promise<ApiResult<void>> {
  const result = await call<{ accessToken: string }>('/api/auth/refresh', { method: 'POST', body: '{}' }, false)
  if (!result.success) return result
  accessToken = result.data.accessToken
  return { success: true, data: undefined }
}

export async function currentUser(): Promise<ApiResult<User>> {
  return call<User>('/api/auth/me', { method: 'GET' })
}

export async function listMemos(options: ListMemosOptions = {}): Promise<ApiResult<MemoList>> {
  const params = new URLSearchParams()
  params.set('pageSize', String(options.pageSize ?? 50))
  if (options.pageToken) params.set('pageToken', options.pageToken)
  if (options.filter) params.set('filter', options.filter)
  return call<MemoList>(`/api/memos?${params.toString()}`, { method: 'GET' })
}

export async function createMemo(content: string, visibility: Visibility = 'PRIVATE'): Promise<ApiResult<Memo>> {
  return call<Memo>('/api/memos', { method: 'POST', body: JSON.stringify({ content, visibility }) })
}

export function signOut(): void {
  accessToken = null
}
