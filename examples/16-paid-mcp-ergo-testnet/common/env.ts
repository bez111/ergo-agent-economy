import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const exampleRoot = path.resolve(here, "..")

export interface EnvLoadResult {
  found: boolean
  path: string
  loaded: string[]
  skippedExisting: string[]
}

export function exampleRootDir(): string {
  return exampleRoot
}

export function parseEnvText(text: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const assignment = line.startsWith("export ") ? line.slice("export ".length).trim() : line
    const equals = assignment.indexOf("=")
    if (equals <= 0) continue

    const key = assignment.slice(0, equals).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue

    let value = assignment.slice(equals + 1).trim()
    const quote = value[0]
    if ((quote === `"` || quote === `'`) && value.endsWith(quote)) {
      value = value.slice(1, -1)
      if (quote === `"`) {
        value = value.replace(/\\n/g, "\n").replace(/\\"/g, `"`)
      }
    } else {
      value = value.replace(/\s+#.*$/, "").trim()
    }

    values[key] = value
  }

  return values
}

export function loadExampleEnvFile(env: NodeJS.ProcessEnv = process.env): EnvLoadResult {
  const envPath = path.join(exampleRoot, ".env")
  if (!fs.existsSync(envPath)) {
    return { found: false, path: envPath, loaded: [], skippedExisting: [] }
  }

  const parsed = parseEnvText(fs.readFileSync(envPath, "utf8"))
  const loaded: string[] = []
  const skippedExisting: string[] = []

  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) {
      env[key] = value
      loaded.push(key)
    } else {
      skippedExisting.push(key)
    }
  }

  return { found: true, path: envPath, loaded, skippedExisting }
}

export function requiredTestnetEnvNames(opts: { requireReserveBoxId?: boolean } = {}): string[] {
  const requireReserveBoxId = opts.requireReserveBoxId ?? true
  return [
    "ACCORD_DEMO_BUYER_ADDR",
    "ACCORD_DEMO_SELLER_ADDR",
    ...(requireReserveBoxId ? ["ACCORD_DEMO_RESERVE_BOX_ID"] : []),
  ]
}
