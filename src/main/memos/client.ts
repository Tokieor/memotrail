import { net } from 'electron'
import type { ApiResult, ListMemosOptions, Memo, MemoList, User, Visibility } from '../../shared/types'

// The Memos 0.31.0 HTTP API (grpc-gateway, see proto/api/v1/*_service.proto):
//   POST /api/v1/auth/signin   { passwordCredentials: { username, password } } -> { user, accessToken, ... }
//   POST /api/v1/auth/refresh  rotates the refresh cookie, returns a new access token
//   GET  /api/v1/auth/me       -> { user }
//   GET  /api/v1/memos         ?pageSize=&pageToken=&filter=   (filter is CEL)
//   POST /api/v1/memos         body is the Memo (content, visibility)
//
// Everything hangs off /api/v1 on 0.31.0; the unprefixed /api/... routes answer 404.
//
// The refresh token lives in an HttpOnly cookie; Electron's session keeps it on disk, so the
// app stays signed in across restarts and only the short-lived access token is memory-only.

const API_ROOT = '/api/v1'

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
    res = await net.fetch(`${baseUrl}${API_ROOT}${path}`, { ...init, headers })
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
  const result = await call<{ user: User; accessToken: string; accessTokenExpiresAt?: string }>(
    '/auth/signin',
    { method: 'POST', body: JSON.stringify({ passwordCredentials: { username, password } }) },
    false
  )
  if (!result.success) return result
  accessToken = result.data.accessToken
  return { success: true, data: result.data.user }
}

export async function refresh(): Promise<ApiResult<void>> {
  const result = await call<{ accessToken: string }>('/auth/refresh', { method: 'POST', body: '{}' }, false)
  if (!result.success) return result
  accessToken = result.data.accessToken
  return { success: true, data: undefined }
}

export async function currentUser(): Promise<ApiResult<User>> {
  const result = await call<{ user: User }>('/auth/me', { method: 'GET' })
  if (!result.success) return result
  return { success: true, data: result.data.user }
}

export async function listMemos(options: ListMemosOptions = {}): Promise<ApiResult<MemoList>> {
  const params = new URLSearchParams()
  params.set('pageSize', String(options.pageSize ?? 50))
  if (options.pageToken) params.set('pageToken', options.pageToken)
  if (options.filter) params.set('filter', options.filter)
  return call<MemoList>(`/memos?${params.toString()}`, { method: 'GET' })
}

export async function createMemo(content: string, visibility: Visibility = 'PRIVATE'): Promise<ApiResult<Memo>> {
  return call<Memo>('/memos', { method: 'POST', body: JSON.stringify({ content, visibility }) })
}

export interface MemoPatch {
  content?: string
  visibility?: Visibility
  pinned?: boolean
}

/** PATCH /api/v1/memos/{id}?updateMask=… — only the fields present in the patch are sent. */
export async function updateMemo(name: string, patch: MemoPatch): Promise<ApiResult<Memo>> {
  const mask = Object.keys(patch).filter((key) => patch[key as keyof MemoPatch] !== undefined)
  if (mask.length === 0) return { success: false, error: 'Nothing to update' }
  return call<Memo>(`/${name}?updateMask=${encodeURIComponent(mask.join(','))}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  })
}

export async function deleteMemo(name: string): Promise<ApiResult<void>> {
  return call<void>(`/${name}`, { method: 'DELETE' })
}

export function signOut(): void {
  accessToken = null
}
