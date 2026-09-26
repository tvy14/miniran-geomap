"""Browser theme regression: run with Playwright installed; optional public URL."""
from functools import partial
from http.server import ThreadingHTTPServer
import shutil
import sys
import threading
from playwright.sync_api import sync_playwright
import publish

server = None
if len(sys.argv) > 1:
    url = sys.argv[1]
else:
    publish.build()
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(publish.PublishHandler, directory=str(publish.DIST)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('google-chrome'), headless=True)
        context = browser.new_context(color_scheme='dark', viewport={'width': 1440, 'height': 1000})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='domcontentloaded')
        toggle = page.locator('#theme-toggle')
        assert toggle.count() == 1, 'Theme toggle missing'
        page.wait_for_function("Number(document.querySelector('#kpi-bs').textContent) > 0")
        assert page.locator('html').get_attribute('data-theme') == 'dark'
        for theme in ['light', 'dark']:
            toggle.click()
            assert page.locator('html').get_attribute('data-theme') == theme
            assert toggle.get_attribute('aria-pressed') == str(theme == 'light').lower()
            colors = page.locator('#parameters-panel').evaluate('(el) => { const s = getComputedStyle(el); return {bg:s.backgroundColor, color:s.color}; }')
            assert colors['bg'] == ('rgb(231, 245, 235)' if theme == 'light' else 'rgb(24, 47, 39)'), colors
            assert page.locator('#freq-mhz').evaluate('(el) => parseFloat(getComputedStyle(el).fontSize)') >= 14
            page.reload(wait_until='domcontentloaded')
            assert page.locator('html').get_attribute('data-theme') == theme
        page.locator('#tx-power').fill('40')
        page.locator('#tx-power').dispatch_event('change')
        assert page.locator('#tx-power').input_value() == '40'
        page.locator('#btn-reset').click()
        assert page.locator('#kpi-bs').inner_text() == '0'
        page.locator('#btn-demo').click()
        assert int(page.locator('#kpi-bs').inner_text()) > 0
        # Storage may be denied by browser privacy settings.
        restricted = browser.new_context(color_scheme='light')
        restricted.add_init_script("Object.defineProperty(window, 'localStorage', {get() {throw new Error('Storage blocked');}})")
        private_page = restricted.new_page()
        private_page.on('pageerror', lambda error: errors.append(str(error)))
        private_page.goto(url, wait_until='domcontentloaded')
        assert private_page.locator('html').get_attribute('data-theme') == 'light'
        private_page.locator('#theme-toggle').click()
        assert private_page.locator('html').get_attribute('data-theme') == 'dark'
        page.goto(url.split('?')[0] + '?embed=1', wait_until='domcontentloaded')
        assert not page.locator('#theme-toggle').is_visible()
        assert not page.locator('#sidebar').is_visible()
        assert not errors, errors
        print('PASS: system theme, both palettes, persisted choice, storage denial, parameter editing, reset/demo, embedded preview; no JS errors')
        browser.close()
finally:
    if server:
        server.shutdown()
        server.server_close()
