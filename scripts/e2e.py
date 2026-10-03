"""End-to-end smoke test: upload a synthetic song, check the player, tabs, lyrics (mocked Groq), coach, tuner."""
import json, sys, time, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:4173/')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)
WAV = os.path.join(os.path.dirname(__file__), 'test-song.wav')

words = []
t = 10.0
for line in ['Lampu kota mulai menyala langkahku pelan', 'Jalan pulang terasa panjang tunggu aku datang', 'Tetap di sini di bawah langit jingga']:
    for w in line.split():
        words.append({'word': w, 'start': round(t, 2), 'end': round(t + 0.45, 2)})
        t += 0.55
    t += 3.0
segments = []
i = 0
for line in ['Lampu kota mulai menyala langkahku pelan', 'Jalan pulang terasa panjang tunggu aku datang', 'Tetap di sini di bawah langit jingga']:
    n = len(line.split())
    segments.append({'start': words[i]['start'], 'end': words[i + n - 1]['end'], 'text': line, 'no_speech_prob': 0.01})
    i += n

def handle_groq(route):
    url = route.request.url
    if 'audio/transcriptions' in url:
        route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'text': '...', 'language': 'indonesian', 'segments': segments, 'words': words}))
    elif 'chat/completions' in url:
        route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'choices': [{'message': {'content': 'Try this pattern:\n\n- **D D U U D U** on each bar\n- Keep your wrist loose\n\nStart at 0.75x.'}}]}))
    else:
        route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"data":[]}')

errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 1000})
    ctx.route('https://api.groq.com/**', handle_groq)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
    page.goto(BASE + '#/')
    page.evaluate("localStorage.setItem('riffscan.settings.v1', JSON.stringify({groqKey: 'gsk_test', lyricsEngine: 'auto'}))")
    page.reload()
    page.wait_for_selector('text=What do you want to play today?')
    page.screenshot(path=f'{OUT}/01-home.png', full_page=True)
    t0 = time.time()
    page.set_input_files('#file', WAV)
    page.wait_for_url('**/#/song/*', timeout=60000)
    print(f'scan took {time.time() - t0:.1f}s')
    page.wait_for_selector('.now-chord')
    page.screenshot(path=f'{OUT}/02-player.png', full_page=False)
    print('key/tempo:', page.inner_text('#dna-t >> xpath=../..').replace('\n', ' | ')[:160])
    page.click('button[aria-label="Play"]')
    page.wait_for_timeout(12500)
    if not page.query_selector('.now-chord'):
        page.screenshot(path=f'{OUT}/err.png', full_page=True)
        print('\n'.join(errors[:30])); print(page.inner_text('body')[:600]); sys.exit(1)
    print('now chord after 12.5s:', page.inner_text('.now-chord'), '| time:', page.inner_text('.transport .time'))
    page.screenshot(path=f'{OUT}/03-playing.png', full_page=True)
    # lyrics (mocked groq) should be done fast; tabs may take longer
    for _ in range(240):
        chips = page.inner_text('.head-actions')
        if 'Tabs' in chips and 'Lyrics' in chips and '%' not in chips and 'waiting' not in chips and 'working' not in chips:
            break
        page.wait_for_timeout(1000)
    print('job chips:', page.inner_text('.head-actions').replace('\n', ' '))
    page.screenshot(path=f'{OUT}/04-lyrics.png', full_page=False)
    page.click('role=tab[name="Chords & lyrics"]')
    page.locator('.lane-chords button >> nth=4').click()
    page.wait_for_timeout(300)
    page.evaluate("document.querySelector('.transport').style.display='none'")
    page.locator('section[aria-labelledby="ws-t"]').screenshot(path=f'{OUT}/04b-sheet.png')
    page.click('role=tab[name="Guitar tab"]')
    page.wait_for_timeout(300)
    page.locator('section[aria-labelledby="ws-t"]').screenshot(path=f'{OUT}/04c-tab.png')
    page.click('role=tab[name="Drums"]')
    page.wait_for_timeout(300)
    page.locator('section[aria-labelledby="ws-t"]').screenshot(path=f'{OUT}/04d-drums.png')
    page.evaluate("document.querySelector('.transport').style.display=''")
    page.click('role=tab[name="Guitar tab"]')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/05-guitar.png', full_page=True)
    page.click('role=tab[name="Bass tab"]')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/06-bass.png', full_page=False)
    page.click('role=tab[name="Drums"]')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/07-drums.png', full_page=False)
    page.click('role=tab[name="Chord grid"]')
    page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/08-grid.png', full_page=False)
    page.click('.suggest button >> nth=0')
    page.wait_for_selector('.bubble.ai')
    page.wait_for_timeout(400)
    page.locator('#coach-title').scroll_into_view_if_needed()
    page.screenshot(path=f'{OUT}/09-coach.png', full_page=False)
    if page.query_selector('button[aria-label="Pause"]'): page.click('button[aria-label="Pause"]')
    page.evaluate('window.scrollTo(0,0)')
    page.click('button[aria-label="Transpose up"]')
    page.click('button[aria-label="Transpose up"]')
    print('after +2 transpose, key:', page.inner_text('#dna-t >> xpath=../..').split('\n')[2:4])
    page.click('button[aria-label="Piano"]')
    page.screenshot(path=f'{OUT}/10-piano.png', full_page=False)
    # mobile
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/11-mobile.png', full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.goto(BASE + '#/tuner')
    page.wait_for_selector('text=Start tuner')
    page.click('text=Start tuner')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUT}/12-tuner.png', full_page=True)
    page.goto(BASE + '#/settings')
    page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/13-settings.png', full_page=True)
    page.goto(BASE + '#/library')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/14-library.png', full_page=True)
    b.close()

print('\n'.join(errors[:30]) or 'no console errors')
