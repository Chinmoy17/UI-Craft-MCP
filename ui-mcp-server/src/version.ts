import { readFileSync } from 'fs'
import { join } from 'path'

// package.json is the only place the version is written; works from src/ and dist/.
function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export const VERSION: string = readPackageVersion()
