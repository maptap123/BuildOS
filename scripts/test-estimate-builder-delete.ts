/* eslint-disable @typescript-eslint/no-explicit-any */
// Isolated real builder regression tests: no credentials or database access.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { chromium, type Page } from 'playwright'

async function main() {
  const compiled = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {EstimateBuilderClient} from './src/components/estimates/EstimateBuilderClient';
    window.mount = props => createRoot(document.getElementById('root')).render(React.createElement(EstimateBuilderClient,props));
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', define: {'process.env.NODE_ENV':'"production"'}, plugins:[{name:'isolated-builder',setup(b) {
    b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}))
    b.onResolve({filter:/\/(CostCatalogSearch|EstimateLineRow|EstimateTotals|EstimateFixerPanel)$/},a=>({path:a.path.split('/').pop()!,namespace:'fixture'}))
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='navigation' ? 'export const useRouter=()=>({refresh(){},push(){}})' : a.path==='EstimateLineRow' ? 'export const EstimateLineRow=()=>null; export const EstimateLineCard=()=>null' : `export const ${a.path}=()=>null`,loader:'js'}))
  }}]})
  const html = `<html><body><div id="root"></div><script>${compiled.outputFiles[0].text}</script></body></html>`
  const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)})
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r))
  const port=(server.address() as {port:number}).port
  const browser=await chromium.launch({headless:true})
  let count=0
  async function fixture(versions:number[],canDelete=true):Promise<Page> {
    const page=await browser.newPage();await page.addInitScript('window.__name=(fn)=>fn')
    await page.goto(`http://127.0.0.1:${port}`)
    await page.evaluate(({versions,canDelete})=>{
      const w=window as any
      w.pending=[];w.deletes=[];w.defer=false
      w.fetch=async (url:string,options:any={})=>{
        if(options.method==='DELETE'){w.deletes.push(url);return {status:204,ok:true}}
        if(options.method==='POST')return {ok:true,json:async()=>({id:'est-99',title:'New Quote',version:99,status:'draft',is_locked:false,markup_pct:0})}
        if(w.defer) return new Promise(resolve=>w.pending.push((data:any[])=>resolve({ok:true,json:async()=>data})))
        return {ok:true,json:async()=>[]}
      }
      w.mount({lead:{id:'fixture-lead',title:'Fixture lead'},initialEstimates:versions.map(version=>({id:'est-'+version,title:'Quote '+version,version,status:'draft',is_locked:false,markup_pct:0})),initialLines:[],permissions:{can_create:true,can_edit:true,can_delete:canDelete}})
    },{versions,canDelete})
    await page.getByRole('heading',{name:'Estimate Builder'}).waitFor()
    return page
  }
  async function remove(page:Page,index:number){await page.getByRole('button',{name:'Delete',exact:true}).nth(index).click();await page.getByRole('button',{name:'Delete Estimate',exact:true}).click()}
  async function test(name:string,fn:()=>Promise<void>){await fn();count++;console.log('PASS '+name)}
  try {
    await test('permission denied hides deletion controls',async()=>{const p=await fixture([2,1],false);assert.equal(await p.getByRole('button',{name:'Delete',exact:true}).count(),0);await p.close()})
    await test('delete active selects remaining estimate',async()=>{const p=await fixture([2,1]);await remove(p,0);await p.getByRole('button',{name:/Quote 2/}).waitFor({state:'detached'});await p.waitForFunction(()=>document.querySelector('a[href*="est-1/print"]')!==null);await p.close()})
    await test('delete inactive preserves active estimate',async()=>{const p=await fixture([2,1]);await remove(p,1);await p.getByRole('button',{name:/Quote 1/}).waitFor({state:'detached'});assert.equal(await p.locator('a[href*="est-2/print"]').count(),1);await p.close()})
    await test('delete final estimate renders empty state',async()=>{const p=await fixture([1]);await remove(p,0);await p.getByText('No estimates yet for this lead',{exact:true}).waitFor();assert.equal(await p.locator('a[href*="/print"]').count(),0);await p.close()})
    await test('late line load after final deletion does not pollute newly created estimate',async()=>{
      const p=await fixture([1]);await p.evaluate(()=>{(window as any).defer=true});await p.getByRole('button',{name:/Quote 1/}).click();await p.waitForFunction(()=>(window as any).pending.length===1);await remove(p,0);await p.getByText('No estimates yet for this lead',{exact:true}).waitFor()
      await p.getByRole('button',{name:'Create First Estimate',exact:true}).click();await p.locator('a[href*="est-99/print"]').waitFor({timeout:1000}).catch(async e=>{console.log(await p.locator('body').innerText());throw e})
      await p.evaluate(async()=>{const w=window as any;w.pending[0]([{id:'late-line',estimate_id:'est-1',phase:'Late phase',description:'Old line',quantity:1,unit_cost:50,markup_pct:0}]);await new Promise(r=>setTimeout(r,50))})
      assert.equal(await p.getByText('Late phase',{exact:true}).count(),0,'stale deleted lines must not populate the new estimate');await p.close()
    })
    console.log(`PASSED ${count}/${count}`)
  } finally {await browser.close();await new Promise<void>(r=>server.close(()=>r()))}
}
main().catch(e=>{console.error(e);process.exitCode=1})
