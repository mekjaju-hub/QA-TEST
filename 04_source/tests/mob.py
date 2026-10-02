import asyncio
from playwright.async_api import async_playwright
exec(open('e2e.py').read().split('async def main')[0])
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        pg=await b.new_page(viewport={'width':1280,'height':800})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', route)
        await pg.goto('file:///home/claude/brs/index.html'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path='s_login.png')
        await pg.set_viewport_size({'width':390,'height':844})
        await pg.fill('#lu','admin'); await pg.fill('#lp','Admin@12345'); await pg.click('button[type=submit]')
        await pg.wait_for_selector('#np1'); await pg.fill('#np1','NewAdmin@2026!'); await pg.fill('#np2','NewAdmin@2026!'); await pg.click('#npOk'); await pg.wait_for_timeout(800)
        await pg.click('text=สร้าง Demo Project'); await pg.wait_for_timeout(2500)
        await pg.click('[data-act=nav][data-href*=requirements]') if await pg.query_selector('[data-act=nav][data-href*=requirements]') else None
        import re
        pid=re.search(r'#/p/([^/]+)/',pg.url).group(1)
        await pg.goto(f'file:///home/claude/brs/index.html#/p/{pid}/requirements'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='s_mobile.png')
        print(errs)
        await b.close()
asyncio.run(main())
