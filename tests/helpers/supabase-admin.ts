import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as fs from 'fs'

// The Next.js dev server (webServer in playwright.config.ts) loads .env.local on its own,
// but the Playwright test runner is a separate process and needs it too, to seed/verify
// data directly via the service-role client for the money-path tests below.
const envFile = path.resolve(__dirname, '../../.env.local')
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf-8').split('\n').forEach(line => {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (k && !(k in process.env)) process.env[k] = v
    }
  })
}

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
