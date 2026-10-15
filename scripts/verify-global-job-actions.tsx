import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'

async function main() {
  const layout = readFileSync('src/app/(dashboard)/layout.tsx', 'utf8')
  assert.ok(layout.includes('<SelectedJobHeaderActions'), 'Global dashboard header must render selected-job actions (including Home)')
  const bundle = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {SelectedJobHeaderActions} from './src/components/jobs/SelectedJobHeaderActions';
    function App() { const [id,setId]=React.useState('a'); return <><header style={{display:'flex',alignItems:'center',background:'#1b2b4a',padding:12,width:'100%',boxSizing:'border-box'}}><span style={{minWidth:0,flex:1,color:'white',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>A very long selected job name</span><SelectedJobHeaderActions jobId={id} /></header><button onClick={()=>setId('b')}>Switch B</button><button onClick={()=>setId('a')}>Switch A</button><button onClick={()=>setId('missing')}>Missing</button><button onClick={()=>setId('error')}>Error</button><button onClick={()=>setId(null)}>Clear</button></> }
    createRoot(document.getElementById('root')).render(<App/>);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"production"' } })
  const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(`<html><head><style>body{margin:0} .flex{display:flex}.shrink-0{flex-shrink:0} .gap-1{gap:4px} a,button{box-sizing:border-box} [aria-label="Job quick actions"] a,[aria-label="Job quick actions"] button{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;color:white}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as {port:number}
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({viewport:{width:320,height:640}})
    let releaseA: (()=>void) | undefined
    let delayA = false
    await page.route('**/api/jobs/*?contact=1', async route => {
      const id = new URL(route.request().url()).pathname.split('/').pop()
      if (id === 'a' && delayA) await new Promise<void>(resolve => { releaseA = resolve })
      if (id === 'error') { await route.fulfill({status:403,body:'{}'}); return }
      const contact = id === 'missing' ? {phone:null,address:null,cityStateZip:null} : {phone:id==='a'?'(513) 555-0101':'(513) 555-0102',address:id==='a'?'123 Main St':'456 Other St',cityStateZip:'Cincinnati, OH'}
      await route.fulfill({json:contact})
    })
    await page.goto(`http://127.0.0.1:${address.port}`)
    const call = page.getByRole('link',{name:'Call homeowner',exact:true})
    await expect(call).toHaveAttribute('href','tel:+15135550101')
    await expect(page.getByRole('link',{name:'Open job address in Google Maps'})).toHaveAttribute('href',/123%20Main%20St/)
    for (const link of await page.getByRole('group',{name:'Job quick actions'}).locator('a').all()) { const box = await link.boundingBox(); assert.ok(box && box.width>=44 && box.height>=44) }
    delayA = true
    await page.getByRole('button',{name:'Switch B'}).click()
    await expect(call).toHaveAttribute('href','tel:+15135550102')
    await page.getByRole('button',{name:'Switch A'}).click()
    await expect(call).toHaveCount(0)
    await expect.poll(()=>!!releaseA).toBe(true)
    await page.getByRole('button',{name:'Switch B'}).click()
    await expect(call).toHaveAttribute('href','tel:+15135550102')
    releaseA!()
    await page.waitForTimeout(150)
    await expect(call).toHaveAttribute('href','tel:+15135550102')
    await page.getByRole('button',{name:'Missing',exact:true}).click()
    await expect(page.getByRole('button',{name:'No homeowner phone number on file'})).toBeDisabled()
    await expect(page.getByRole('button',{name:'No job address on file'})).toBeDisabled()
    await expect(page.getByRole('group').locator('a')).toHaveCount(0)
    await page.getByRole('button',{name:'Error',exact:true}).click()
    await expect(page.getByRole('group').locator('a')).toHaveCount(0)
    await page.getByRole('button',{name:'Clear',exact:true}).click()
    await expect(page.getByRole('group')).toHaveCount(0)
    console.log('PASS: global Home integration; actual rendered Maps/Call; 44px targets; switching/loading; late response isolation; missing/forbidden data; cleared job')
  } finally { await browser.close(); await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())) }
}
main().catch(error=>{console.error(error);process.exitCode=1})
