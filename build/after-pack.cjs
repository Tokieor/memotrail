const { execFileSync } = require('node:child_process')

/**
 * Ad-hoc signs the macOS bundle when no Developer ID is available.
 *
 * An unsigned bundle has no stable code identity, so macOS cannot remember the
 * "local network" / notification permissions for it — every launch looks like a
 * brand new app to TCC. An ad-hoc signature (`codesign --sign -`) gives the app
 * an identity without a certificate; Gatekeeper still requires the user to clear
 * the quarantine flag, but permissions stick afterwards.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
