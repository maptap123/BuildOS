import { phoneHref, telHref, directionsHref } from '../src/lib/contactLinks'

const cases: [string | null, string | null][] = [
  ['(317) 514-1218', '+13175141218'],
  ['+15132543211', '+15132543211'],
  ['5133758792 or 5133758791', '+15133758792'],
  ['8126212448 or 8126675320', '+18126212448'],
  ['812-212-6469/812-934-6643', '+18122126469'],
  ['5132543211 Maxine', '+15132543211'],
  ['513-309-4678 Barbara Mom', '+15133094678'],
  ['513.260.5252', '+15132605252'],
  ['303-550.1142', '+13035501142'],
  ['15135551234', '+15135551234'],
  ['85-240-1377', null],
  ['513', null],
  ['812', null],
  ['-', null],
  ['poop', null],
  ['asdf', null],
  ['', null],
  [null, null],
]

let fail = 0
for (const [input, expected] of cases) {
  const got = phoneHref(input)
  const ok = got === expected
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(input)} -> ${JSON.stringify(got)}${ok ? '' : `  (expected ${JSON.stringify(expected)})`}`)
}

console.log('\n-- tel: wrapper --')
console.log(telHref('(317) 514-1218'), '|', telHref('poop'))

console.log('\n-- directions --')
console.log(directionsHref(['19242 STATE ROUTE 1', 'LAWRENCEBURG, IN, 47025']))
console.log(directionsHref([null, '']), '(expect null)')

console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILURES'}`)
process.exit(fail === 0 ? 0 : 1)
