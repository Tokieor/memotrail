import { net, protocol } from 'electron'
import { currentBaseUrl, currentToken } from './memos/client'

/**
 * Attachment blobs live behind `GET /file/...` and need the Bearer token, which an <img> tag
 * cannot send. A private scheme proxies those requests through the main process instead:
 *   memotrail://local/file/attachments/<id>/<name>  ->  <server>/file/attachments/<id>/<name>
 */
export const FILE_SCHEME = 'memotrail'

export function registerFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

export function handleFileProtocol(): void {
  protocol.handle(FILE_SCHEME, async (request) => {
    const base = currentBaseUrl()
    if (!base) return new Response('No server configured', { status: 503 })
    const url = new URL(request.url)
    const token = currentToken()
    return net.fetch(`${base}${url.pathname}${url.search}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
  })
}
