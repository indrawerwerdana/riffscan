"""v2 smoke test: rich chords + simplify, then real in-browser Demucs separation and the stem mixer."""
import json, os, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:4173/')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-v2'
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(__file__)

words = [{'word': w, 'start': 3.0 + i * 0.5, 'end': 3.4 + i * 0.5} for i, w in enumerate('Lampu kota mulai menyala langkahku pelan'.split())]
segs = [{'start': 3.0, 'end': words[-1]['end'], 'text': 'Lampu kota mulai menyala langkahku pelan', 'no_speech_prob': 0.01}]
calls = []
def groq(route):
    calls.append(route.request.url)
    body = {'text': '', 'segments': segs, 'words': words} if 'transcriptions' in route.request.url else {'data': []}
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body))

errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 1000})
    ctx.route('https://api.groq.com/**', groq)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
    page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type == 'error' and 'cpuid' not in m.text else None)
    page.goto(BASE + '#/')
    page.evaluate("localStorage.setItem('riffscan.settings.v1', JSON.stringify({groqKey: 'gsk_test', autoNotes: false}))")
    page.reload()

    # --- Rich chords ---
    page.set_input_files('#file', os.path.join(HERE, 'test-rich.wav'))
    page.wait_for_url('**/#/song/*', timeout=60000)
    page.wait_for_selector('.lane-chords button')
    lane = [x.inner_text() for x in page.query_selector_all('.lane-chords button')]
    print('rich chords:', ' '.join(c for c in lane if c))
    page.locator('.lane-chords button >> nth=0').click()
    page.wait_for_timeout(300)
    page.locator('section[aria-labelledby="shape-t"]').screenshot(path=f'{OUT}/01-cmaj7.png')
    page.locator('.lane-chords button >> nth=7').click()
    page.wait_for_timeout(300)
    print('shape card:', page.inner_text('#shape-t'))
    page.locator('section[aria-labelledby="shape-t"]').screenshot(path=f'{OUT}/02-slash.png')
    page.click('text=Simple')
    page.wait_for_timeout(300)
    lane = [x.inner_text() for x in page.query_selector_all('.lane-chords button')]
    print('simple chords:', ' '.join(c for c in lane if c))
    page.click('text=Full chords')

    # --- Stems ---
    page.goto(BASE + '#/')
    page.set_input_files('#file', os.path.join(HERE, 'test-short.wav'))
    page.wait_for_url('**/#/song/*', timeout=60000)
    page.wait_for_selector('text=Separate instruments')
    page.locator('#stems-t').scroll_into_view_if_needed()
    page.screenshot(path=f'{OUT}/03-stems-cta.png')
    t0 = time.time()
    page.click('button:has-text("Separate instruments")')
    page.wait_for_timeout(15000)
    page.evaluate("document.querySelector('.transport').style.display='none'")
    page.locator('section[aria-labelledby="stems-t"]').screenshot(path=f'{OUT}/04-stems-running.png')
    page.evaluate("document.querySelector('.transport').style.display=''")
    page.wait_for_selector('.stem-row', timeout=1500000)
    print(f'separation finished after {time.time() - t0:.0f}s:', page.inner_text('#stems-t + p, #stems-t ~ p') if page.query_selector('#stems-t ~ p') else '')
    # wait for re-analysis + stem notes + lyrics
    for _ in range(600):
        if not page.query_selector('.head-actions'):
            page.screenshot(path=f'{OUT}/err.png', full_page=True)
            print('PAGE BROKE:', page.inner_text('body')[:300]); print('\n'.join(errors[:20])); sys.exit(1)
        chips = page.inner_text('.head-actions')
        if '%' not in chips and 'waiting' not in chips and 'working' not in chips:
            break
        page.wait_for_timeout(1000)
    print('chips:', page.inner_text('.head-actions').replace('\n', ' '), '| total', round(time.time() - t0), 's')
    rows = [r.inner_text().split('\n')[0] for r in page.query_selector_all('.stem-row')]
    print('stem rows:', rows)
    page.click('button[aria-label="Solo Drums"]')
    page.click('button[aria-label="Play"]')
    page.wait_for_timeout(1500)
    state = page.evaluate("""() => { const e = [...document.querySelectorAll('audio')]; return null; }""")
    page.evaluate("document.querySelector('.transport').style.display='none'")
    page.locator('section[aria-labelledby="stems-t"]').screenshot(path=f'{OUT}/05-stems-mixer.png')
    page.click('role=tab[name="Drums"]')
    print('drum chip:', page.inner_text('section[aria-labelledby="ws-t"] .chip'))
    page.click('role=tab[name="Bass tab"]')
    page.wait_for_timeout(400)
    page.locator('section[aria-labelledby="ws-t"]').screenshot(path=f'{OUT}/06-bass-from-stem.png')
    page.click('role=tab[name="Chords & lyrics"]')
    page.wait_for_timeout(400)
    print('lyrics note:', page.inner_text('.sheet .note') if page.query_selector('.sheet .note') else 'none')
    page.evaluate("document.querySelector('.transport').style.display=''")
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=f'{OUT}/07-player.png', full_page=True)
    print('groq calls:', len(calls))
    b.close()
print('\n'.join(errors[:20]) or 'no page errors')
