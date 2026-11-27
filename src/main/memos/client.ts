import { net } from 'electron'
import type {
  ApiResult,
  ListMemosOptions,
  Memo,
  MemoList,
  MemoState,
  MemoView,
  SignInResult,
  User,
  ViewDraft,
  Visibility
} from '../../shared/types'

// The Memos 0.31.0 HTTP API (grpc-gateway, see proto/api/v1/*_service.proto):
//   POST /api/v1/auth/signin   { passwordCredentials: { username, password } } -> { user, accessToken, ... }
//   POST /api/v1/auth/refresh  rotates the refresh cookie, returns a new access token
//   GET  /api/v1/auth/me       -> { user }   (also the validity probe for a personal access token)
//   GET  /api/v1/instance/profile -> { version, admin, ... }
//   GET  /api/v1/memos         ?pageSize=&pageToken=&filter=&state=   (filter is CEL)
//   POST /api/v1/memos         body is the Memo (content, visibility)
//
// Everything hangs off /api/v1 on 0.31.0; the unprefixed /api/... routes answer 404.
//
// Two ways in, both ending at the same `Authorization: Bearer …` header:
// - password: short-lived access token in memory, refreshed through an HttpOnly-style cookie.
// - personal access token: the token is the bearer credential itself and never expires by itself.

const API_ROOT = '/api/v1'

let baseUrl = ''
let accessToken: string | null = null
let refreshToken: string | null = null
let refreshTokenSink: ((token: string | null) => void) | null = null

/** The refresh cookie is persisted (encrypted) by the main process so restarts stay signed in. */
export function setRefreshToken(token: string | null): void {
  refreshToken = token
}

export function getRefreshToken(): string | null {
  return refreshToken
}

export function setRefreshTokenSink(sink: (token: string | null) => void): void {
  refreshTokenSink = sink
}

/**
 * grpc-gateway hands the refresh cookie back as `Grpc-Metadata-Set-Cookie` (a real `Set-Cookie`
 * never arrives) and only reads it from `Grpc-Metadata-Cookie` — a plain `Cookie:` header is
 * ignored, which is why refresh used to answer `refresh token not found`.
 */
function captureRefreshToken(headers: Headers): void {
  const raw = headers.get('grpc-metadata-set-cookie')
  if (!raw) return
  const match = /memos_refresh=([^;]+)/.exec(raw)
  if (!match) return
  const next = match[1]
  if (next === refreshToken) return
  refreshToken = next
  refreshTokenSink?.(next)
}

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

  captureRefreshToken(res.headers)

  if (res.status === 401 && retryOn401 && refreshToken) {
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

export async function signIn(serverUrl: string, username: string, password: string): Promise<ApiResult<SignInResult>> {
  setBaseUrl(serverUrl)
  accessToken = null
  const result = await call<{ user: User; accessToken: string; accessTokenExpiresAt?: string }>(
    '/auth/signin',
    { method: 'POST', body: JSON.stringify({ passwordCredentials: { username, password } }) },
    false
  )
  if (!result.success) return result
  accessToken = result.data.accessToken
  return { success: true, data: { user: result.data.user, serverVersion: await serverVersion() } }
}

/**
 * Personal access token (PAT) sign-in: the token itself is the bearer credential, so there is no
 * exchange step — one authenticated call tells us whether it is accepted and who owns it.
 * `adoptToken` is separate so a restored session can reuse it without re-running the probe.
 */
export function adoptToken(token: string): void {
  accessToken = token
}

export async function signInWithToken(serverUrl: string, token: string): Promise<ApiResult<SignInResult>> {
  setBaseUrl(serverUrl)
  const previous = accessToken
  accessToken = token.trim()
  const me = await currentUser()
  if (!me.success) {
    accessToken = previous
    return me
  }
  return { success: true, data: { user: me.data, serverVersion: await serverVersion() } }
}

/**
 * `GET /api/v1/instance/profile` reports the running server version. It is only a hint — some
 * builds hide it — so an empty string means "unknown", never a failure.
 */
export async function serverVersion(): Promise<string> {
  const result = await call<{ version?: string }>('/instance/profile', { method: 'GET' }, false)
  if (!result.success) return ''
  return typeof result.data?.version === 'string' ? result.data.version : ''
}

/** Last four characters of the active personal access token, for the settings page. */
export function tokenTail(): string | null {
  if (!accessToken || accessToken.length < 4) return null
  return accessToken.slice(-4)
}

export async function refresh(): Promise<ApiResult<void>> {
  if (!refreshToken) return { success: false, error: 'No stored session' }
  const result = await call<{ accessToken: string }>(
    '/auth/refresh',
    { method: 'POST', body: '{}', headers: { 'Grpc-Metadata-Cookie': `memos_refresh=${refreshToken}` } },
    false
  )
  if (!result.success) return result
  accessToken = result.data.accessToken
  return { success: true, data: undefined }
}

export async function currentUser(): Promise<ApiResult<User>> {
  const result = await call<{ user: User }>('/auth/me', { method: 'GET' })
  if (!result.success) return result
  return { success: true, data: result.data.user }
}

/**
 * Servers before the archive feature reject the `state` query parameter outright, and a rejected
 * list would blank the feed — so one failure disables the parameter for the rest of the session
 * and the renderer falls back to filtering by `memo.state` on its own.
 */
let stateQuerySupported = true

export async function listMemos(options: ListMemosOptions = {}): Promise<ApiResult<MemoList>> {
  const build = (state?: string): string => {
    const params = new URLSearchParams()
    params.set('pageSize', String(options.pageSize ?? 50))
    if (options.pageToken) params.set('pageToken', options.pageToken)
    if (options.filter) params.set('filter', options.filter)
    // `state` is a scalar field, so the gateway reads it straight from the query string.
    if (state) params.set('state', state)
    return `/memos?${params.toString()}`
  }

  if (!options.state || !stateQuerySupported) {
    return call<MemoList>(build(), { method: 'GET' })
  }
  const result = await call<MemoList>(build(options.state), { method: 'GET' })
  if (result.success || result.status !== 400) return result
  stateQuerySupported = false
  return call<MemoList>(build(), { method: 'GET' })
}

/**
 * 0.31.0 rejects bodies that reference an image it considers unmanaged:
 * `managed image attachment <id> must be bound to the memo`. Echoing every referenced attachment
 * back as `attachments: [{ name }]` is what binds them.
 */
const ATTACHMENT_REF = /\/file\/attachments\/([A-Za-z0-9_-]+)\//g

function boundAttachments(content: string): { name: string }[] {
  const names = new Set<string>()
  for (const match of content.matchAll(ATTACHMENT_REF)) names.add(`attachments/${match[1]}`)
  return [...names].map((name) => ({ name }))
}

export async function createMemo(content: string, visibility: Visibility = 'PRIVATE'): Promise<ApiResult<Memo>> {
  const attachments = boundAttachments(content)
  const body = attachments.length > 0 ? { content, visibility, attachments } : { content, visibility }
  return call<Memo>('/memos', { method: 'POST', body: JSON.stringify(body) })
}

export interface Attachment {
  name: string
  filename: string
  type: string
  size: string
}

/**
 * 0.31.0 takes the file inline as base64 in `content` — a multipart POST to the same route is
 * decoded as JSON by the gateway and fails with `invalid character '-' in numeric literal`.
 */
export async function uploadAttachment(filename: string, type: string, base64: string): Promise<ApiResult<Attachment>> {
  return call<Attachment>('/attachments', { method: 'POST', body: JSON.stringify({ filename, type, content: base64 }) })
}

export function currentBaseUrl(): string {
  return baseUrl
}

export function currentToken(): string | null {
  return accessToken
}

export interface MemoPatch {
  content?: string
  visibility?: Visibility
  pinned?: boolean
  /** `ARCHIVED` files the note in 归档, `NORMAL` restores it. */
  state?: MemoState
}

/** PATCH /api/v1/memos/{id}?updateMask=… — only the fields present in the patch are sent. */
export async function updateMemo(name: string, patch: MemoPatch): Promise<ApiResult<Memo>> {
  const mask = Object.keys(patch).filter((key) => patch[key as keyof MemoPatch] !== undefined)
  if (mask.length === 0) return { success: false, error: 'Nothing to update' }
  const body: Record<string, unknown> = { ...patch }
  if (patch.content !== undefined) {
    // Rewriting the body re-validates every image reference, so the binding list travels with it.
    mask.push('attachments')
    body['attachments'] = boundAttachments(patch.content)
  }
  return call<Memo>(`/${name}?updateMask=${encodeURIComponent(mask.join(','))}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
}

export async function deleteMemo(name: string): Promise<ApiResult<void>> {
  return call<void>(`/${name}`, { method: 'DELETE' })
}

// ---- Saved Views (0.31.0 UserService) ------------------------------------
// GET    /api/v1/users/{user}/views
// POST   /api/v1/users/{user}/views       body is the MemoView itself (flat)
// PATCH  /api/v1/users/{user}/views/{id}?updateMask=title,filter,icon
// DELETE /api/v1/users/{user}/views/{id}
// The returned `filter` is the same CEL expression ListMemos accepts.

async function viewsPath(): Promise<ApiResult<string>> {
  const me = await currentUser()
  if (!me.success) return me
  return { success: true, data: `/${me.data.name}/views` }
}

export async function listViews(): Promise<ApiResult<MemoView[]>> {
  const path = await viewsPath()
  if (!path.success) return path
  const result = await call<{ memoViews?: MemoView[] }>(path.data, { method: 'GET' })
  if (!result.success) return result
  return { success: true, data: result.data.memoViews ?? [] }
}

export async function createView(draft: ViewDraft): Promise<ApiResult<MemoView>> {
  const path = await viewsPath()
  if (!path.success) return path
  return call<MemoView>(path.data, { method: 'POST', body: JSON.stringify(draft) })
}

export async function updateView(view: MemoView): Promise<ApiResult<MemoView>> {
  const mask = view.icon ? 'title,filter,icon' : 'title,filter'
  const body: ViewDraft = { title: view.title, filter: view.filter }
  if (view.icon) body.icon = view.icon
  return call<MemoView>(`/${view.name}?updateMask=${mask}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export async function deleteView(name: string): Promise<ApiResult<void>> {
  return call<void>(`/${name}`, { method: 'DELETE' })
}

/** 用一次 pageSize=1 的真实查询让服务端编译表达式，拿到它的原始报错。 */
export async function validateViewFilter(filter: string): Promise<ApiResult<void>> {
  if (!filter.trim()) return { success: false, error: '筛选表达式为空' }
  const result = await listMemos({ filter, pageSize: 1 })
  if (!result.success) return { success: false, error: result.error, status: result.status }
  return { success: true, data: undefined }
}

export function signOut(): void {
  refreshToken = null
  refreshTokenSink?.(null)
  accessToken = null
}
