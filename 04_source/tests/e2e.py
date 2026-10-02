import asyncio, re, sys
from playwright.async_api import async_playwright
L='/home/claude/libs/node_modules/'
MAP={'bcrypt.min.js':L+'bcryptjs/dist/bcrypt.min.js','jszip.min.js':L+'jszip/dist/jszip.min.js','xlsx.full.min.js':L+'xlsx/dist/xlsx.full.min.js','papaparse.min.js':L+'papaparse/papaparse.min.js','mammoth.browser.min.js':L+'mammoth/mammoth.browser.min.js','pdf.min.js':L+'pdfjs-dist/build/pdf.min.js','pdf.worker.min.js':L+'pdfjs-dist/build/pdf.worker.min.js'}
errors=[]
async def route(r):
    u=r.request.url
    for k,v in MAP.items():
        if u.endswith('/'+k): return await r.fulfill(path=v, content_type='application/javascript')
    if 'fonts.g' in u: return await r.fulfill(body='', content_type='text/css')
    await r.continue_()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        pg=await b.new_page(viewport={'width':1400,'height':900})
        pg.on('console', lambda m: errors.append(m.text) if m.type=='error' else None)
        pg.on('pageerror', lambda e: errors.append('PAGEERR '+str(e)))
        await pg.route('**/*', route)
        await pg.goto('file:///home/claude/brs/index.html')
        await pg.fill('#lu','admin'); await pg.fill('#lp','Admin@12345'); await pg.click('button[type=submit]')
        await pg.wait_for_selector('#np1', timeout=15000)
        await pg.fill('#np1','NewAdmin@2026!'); await pg.fill('#np2','NewAdmin@2026!'); await pg.click('#npOk')
        await pg.wait_for_timeout(1500)
        await pg.click('text=สร้าง Demo Project (Synthetic)')
        await pg.wait_for_timeout(3000)
        await pg.screenshot(path='s_processing.png', full_page=False)
        print('URL', pg.url)
        pid=re.search(r'#/p/([^/]+)/',pg.url).group(1)
        await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/clarifications?tab=conflicts'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='s_conflicts.png', full_page=True)
        # resolve conflict: keep a
        btns=await pg.query_selector_all('[data-act=resolve-conflict][data-keep=a]')
        print('conflict buttons', len(btns))
        if btns:
            await btns[0].click(); await pg.fill('#pdIn','BA ยืนยันใช้ >= ตาม Rule 3'); await pg.click('#pdYes'); await pg.wait_for_timeout(400)
        # answer & resolve all questions
        await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/clarifications?tab=questions'); await pg.wait_for_timeout(400)
        for i in range(40):
            a=await pg.query_selector('[data-act=answer-q]')
            if not a: break
            await a.click(); await pg.fill('#aqAns','BA ตอบ: ยืนยันตามตัวอย่าง (Synthetic)')
            f=await pg.query_selector('#aqField')
            if f:
                tag=await f.evaluate('e=>e.tagName')
                if tag=='SELECT': await f.select_option('>=')
                else: await f.fill('เจ้าหน้าที่Compliance' if 'role' in (await f.get_attribute('placeholder') or '') or True else '')
            await pg.click('#aqOk'); await pg.wait_for_timeout(150)
            r=await pg.query_selector('[data-act=resolve-q]')
            if r: await r.click(); await pg.wait_for_timeout(150)
        print('open questions left', len(await pg.query_selector_all('[data-act=answer-q]')))
        # approve all reqs
        await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/requirements'); await pg.wait_for_timeout(400)
        await pg.screenshot(path='s_reqs.png', full_page=True)
        rows=await pg.query_selector_all('tr[data-act=sel-req]')
        print('reqs', len(rows))
        for i in range(len(rows)):
            rows=await pg.query_selector_all('tr[data-act=sel-req]')
            await rows[i].click(); await pg.wait_for_timeout(100)
            ap=await pg.query_selector('[data-act=approve-req]')
            if ap: await ap.click(); await pg.wait_for_timeout(100)
        st=await pg.eval_on_selector_all('tr[data-act=sel-req] td:last-child','els=>els.map(e=>e.textContent)')
        print('statuses', st)
        await pg.click('text=สร้าง Scenario จาก Requirement ที่ Approved'); await pg.wait_for_timeout(500)
        await pg.click('[data-act=sc-select-all]'); await pg.wait_for_timeout(200)
        await pg.click('[data-act=gen-tcs]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='s_tcs.png', full_page=True)
        n=len(await pg.query_selector_all('[data-act=tc-check]')); print('tcs', n)
        for c in await pg.query_selector_all('[data-act=tc-check]'):
            pass
        # select all via evaluating each (re-render each click)
        for i in range(n):
            cs=await pg.query_selector_all('[data-act=tc-check]'); await cs[i].click(); await pg.wait_for_timeout(50)
        await pg.click('[data-act=tc-bulk]'); await pg.click('#cfYes'); await pg.wait_for_timeout(400)
        # open boundary tc
        link=await pg.query_selector('text=Boundary')
        tcl=await pg.query_selector_all('td.mono a')
        await tcl[0].click(); await pg.wait_for_timeout(300)
        await pg.screenshot(path='s_tcdetail.png', full_page=True)
        await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/auto/pytest'); await pg.wait_for_timeout(300)
        await pg.click('[data-act=auto-all]'); await pg.wait_for_timeout(200)
        await pg.click('[data-act=auto-generate]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='s_pytest.png', full_page=True)
        await pg.click('[data-act=run-art]'); await pg.wait_for_timeout(4000)
        await pg.screenshot(path='s_run.png', full_page=True)
        print('run url', pg.url)
        await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/dashboard'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='s_dash.png', full_page=True)
        async with pg.expect_download() as dl:
            await pg.click('[data-act=export-excel]')
        d=await dl.value; await d.save_as('/home/claude/brs/export.xlsx'); print('excel saved')
        # other generators
        for k in ['python','postman','sql','playwright']:
            await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/auto/{k}'); await pg.wait_for_timeout(200)
            await pg.click('[data-act=auto-all]'); await pg.wait_for_timeout(100); await pg.click('[data-act=auto-generate]'); await pg.wait_for_timeout(300)
            print(k, len(await pg.query_selector_all('.tree div')))
        await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/trace?tc='+ (await pg.evaluate('S.testCases[0].id'))); await pg.wait_for_timeout(300)
        await pg.screenshot(path='s_trace.png', full_page=True)
        for path in ['github','runs','scenarios','compare','processing','upload','']:
            await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/{path}'); await pg.wait_for_timeout(200)
        for path in ['#/settings','#/audit','#/projects']:
            await pg.goto('file:///home/claude/brs/index.html'+path); await pg.wait_for_timeout(200)
        await pg.screenshot(path='s_audit.png')
        import json
        arts=await pg.evaluate("JSON.stringify(S.artifacts.filter(a=>a.kind==='pytest')[0].files)")
        open('/home/claude/brs/pytest_files.json','w').write(arts)
        # upload test
        await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/upload'); await pg.wait_for_timeout(300)
        await pg.select_option('#upMode','rule')
        await pg.uncheck('#upAuto')
        await pg.set_input_files('#fileIn',['sample.docx','sample.xlsx','sample.csv','sample.pdf','bad.pdf'])
        await pg.wait_for_timeout(5000)
        print(await pg.inner_text('#upList'))
        await pg.screenshot(path='s_upload.png', full_page=True)
        docs=await pg.evaluate("S.documents.map(d=>d.id+'|'+d.name)")
        for dd in docs[1:]:
            did=dd.split('|')[0]
            await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/processing/{did}?v=1'); await pg.wait_for_timeout(300)
            await pg.click('[data-act=job-start]'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path='s_proc2.png', full_page=True)
        print(await pg.evaluate("S.requirements.filter(r=>r.docId!==S.documents[0].id).map(r=>r.reqId+' '+r.type+' '+r.status+' p'+r.source.page+' '+r.fields.threshold+' | '+r.originalText.slice(0,60)).join(' || ')"))
        print('images', await pg.evaluate("S.documents.flatMap(d=>d.versions.flatMap(v=>v.images.map(i=>i.caption+' '+i.status)))"))
        # new version of demo doc -> compare
        await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/upload'); await pg.wait_for_timeout(300)
        await pg.click('text=Paste Text'); await pg.wait_for_timeout(200)
        demo=await pg.evaluate('DEMO_BRS')
        await pg.fill('#pasteText', demo.replace('มากกว่าหรือเท่ากับ 200,000','มากกว่าหรือเท่ากับ 300,000').replace('5. Rule 6 Customer API','5. Rule 6 Customer API v2'))
        await pg.select_option('#upTarget', index=1); await pg.select_option('#upMode','rule')
        await pg.click('[data-act=do-paste]'); await pg.wait_for_timeout(3000)
        await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/compare'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='s_compare.png', full_page=True)
        await pg.click('text=Impact Proposals'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='s_impact.png', full_page=True)
        print(await pg.evaluate("S.impacts.map(i=>i.entityType+':'+i.label+':'+i.proposal).join(' | ')"))
        await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/runs'); await pg.wait_for_timeout(300)
        await pg.click('[data-act=import-result][data-v=junit]'); await pg.set_input_files('#impFile','gen/reports/junit.xml'); await pg.click('#impOk'); await pg.wait_for_timeout(600)
        await pg.screenshot(path='s_junit.png', full_page=True)
        print(await pg.evaluate("(()=>{const r=S.runs[S.runs.length-1];return r.runner+' '+JSON.stringify(r.summary)+' mapped='+r.results.filter(x=>x.tcRef).length})()"))
        print('ERRORS', errors[:20])
        await b.close()
asyncio.run(main())
