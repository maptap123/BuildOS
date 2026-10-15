import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { JobHeaderActions } from '../src/components/jobs/JobHeaderActions'

const html = renderToStaticMarkup(<JobHeaderActions phone="(513) 555-0123" address="123 Main St #2" cityStateZip="Cincinnati, OH, 45202" />)
assert.ok(html.includes('href="tel:+15135550123"'))
assert.ok(html.includes('Call homeowner'))
assert.ok(html.includes('Google Maps'))
assert.ok(html.includes('destination=123%20Main%20St%20%232%2C%20Cincinnati%2C%20OH%2C%2045202'))
assert.ok(html.includes('target="_blank"'))
assert.ok(html.includes('rel="noopener noreferrer"'))
assert.ok(html.includes('min-h-[44px]'))
const missing = renderToStaticMarkup(<JobHeaderActions phone={null} address={null} cityStateZip={null} />)
assert.ok(missing.includes('No address'))
assert.ok(missing.includes('No number'))
assert.equal((missing.match(/disabled=""/g) ?? []).length, 2)
assert.ok(!missing.includes('href='))
const invalid = renderToStaticMarkup(<JobHeaderActions phone="513" address="  " cityStateZip=" " />)
assert.ok(!invalid.includes('href='))
console.log('PASS: header Maps/call links, encoded full address, safe external link, touch targets, missing/invalid data')
