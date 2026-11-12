import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('.qbo-logs', { recursive: true })
const tests = ['test-qbo-projects', 'test-qbo-project-transport', 'test-qbo-project-db', 'test-qbo-conversion', 'test-qbo-conversion-db', 'test-qbo-job-create', 'test-qbo-project-ui']
for (const name of tests) {
  const result = spawnSync(process.execPath, [`scripts/${name}.mjs`], { encoding: 'utf8', env: { ...process.env } })
  const output = (result.stdout ?? '') + (result.stderr ?? '')
  writeFileSync(`.qbo-logs/${name}.log`, output)
  process.stdout.write(output)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log(`PASS all ${tests.length} isolated QuickBooks feature suites`)
