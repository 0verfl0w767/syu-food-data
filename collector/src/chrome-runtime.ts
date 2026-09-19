import { existsSync } from 'node:fs'

const LINUX_CHROME_BINARIES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

export function resolveChromeExecutablePath(): string | undefined {
  if (process.platform !== 'linux') return undefined
  return LINUX_CHROME_BINARIES.find(existsSync)
}
