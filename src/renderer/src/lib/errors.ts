/** Turns the raw Chromium/Node network strings into something a user can act on. */
export function describeError(message: string): string {
  if (/ERR_ADDRESS_UNREACHABLE|EHOSTUNREACH|ENETUNREACH/i.test(message)) {
    return '连不上服务器：检查地址和端口是否正确、Memos 是否在运行；macOS 还可能是「本地网络」权限没开（系统设置 → 隐私与安全性 → 本地网络 → 打开 MemoTrail）。'
  }
  if (/ERR_CONNECTION_REFUSED|ECONNREFUSED/i.test(message)) return '服务器拒绝了连接：端口不对，或服务没启动。'
  if (/CERT|ERR_CERT|SSL|TLS/i.test(message)) return `证书/协议错误：如果服务器是纯 HTTP，地址请用 http:// 开头。（${message}）`
  if (/401|unauthorized|invalid password|incorrect/i.test(message)) return '用户名或密码不对。'
  if (/ENOTFOUND|ERR_NAME_NOT_RESOLVED/i.test(message)) return '域名解析失败：地址拼错了，或者这台机器解析不到该域名。'
  return message
}
