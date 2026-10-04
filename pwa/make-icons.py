# Renders the app icons in pwa/icons from the game's own fruit art, using headless Chromium.
# Only needed when the icon art changes. Requires: pip install playwright && playwright install chromium
# (set CHROMIUM_PATH to use a specific Chromium build instead).
import asyncio, base64, os, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'pwa' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)
art = (ROOT / 'src' / 'art.js').read_text(encoding='utf-8')

PAGE = """<!doctype html><html><body><script>%s</script><script>
const pal = { tones: ['#c99a62','#c18f57','#d0a46c','#bb874f','#c69460'], hi: 'rgba(255,236,205,0.35)', lo: 'rgba(70,38,12,0.28)',
  grain: '#7a4a22', grainHi: '#e6bf8a', seam: '#4a2c14', seamHi: 'rgba(255,230,190,0.35)', knot: '#6b3f1c',
  light: 'rgba(255,240,210,0.45)', vignette: 'rgba(60,30,10,0.45)' };
function slice(c, tier, x, y, R, a) {
  c.save();
  c.fillStyle = 'rgba(40, 18, 4, 0.35)';
  c.filter = 'blur(' + Math.max(1, R * 0.08) + 'px)';
  c.beginPath(); c.ellipse(x + R * 0.08, y + R * 0.14, R * 1.0, R * 0.98, 0, 0, Math.PI * 2); c.fill();
  c.restore();
  const s = FruitArt.sprite(tier, R);
  c.save(); c.translate(x, y); c.rotate(a); c.drawImage(s.canvas, -s.half, -s.half); c.restore();
  const g = FruitArt.gloss(tier, R);
  c.drawImage(g.canvas, x - g.half, y - g.half);
}
function icon(size, mode) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  if (mode === 'favicon') { slice(c, 10, size / 2, size / 2, size / 2 - 1.5, 0.4); return cv.toDataURL('image/png'); }
  const wood = document.createElement('canvas');
  FruitArt.timber(wood, size / (size / 256), size / (size / 256), size / 256, pal);
  if (mode === 'rounded') {
    const r = size * 0.22;
    c.beginPath(); c.moveTo(r, 0); c.arcTo(size, 0, size, size, r); c.arcTo(size, size, 0, size, r); c.arcTo(0, size, 0, 0, r); c.arcTo(0, 0, size, 0, r); c.closePath(); c.clip();
  }
  c.drawImage(wood, 0, 0, size, size);
  slice(c, 10, size * 0.45, size * 0.45, size * 0.27, 0.35);
  slice(c, 3, size * 0.675, size * 0.675, size * 0.135, -0.5);
  slice(c, 1, size * 0.70, size * 0.29, size * 0.075, 0.9);
  return cv.toDataURL('image/png');
}
window.ICONS = {
  'icon-192.png': icon(192, 'rounded'),
  'icon-512.png': icon(512, 'rounded'),
  'icon-maskable-512.png': icon(512, 'full'),
  'apple-touch-icon.png': icon(180, 'full'),
  'favicon-32.png': icon(32, 'favicon'),
};
</script></body></html>"""

async def main():
    async with async_playwright() as p:
        exe = os.environ.get('CHROMIUM_PATH')
        b = await (p.chromium.launch(executable_path=exe) if exe else p.chromium.launch())
        page = await b.new_page()
        await page.set_content(PAGE % art)
        icons = await page.evaluate('window.ICONS')
        for name, url in icons.items():
            (OUT / name).write_bytes(base64.b64decode(url.split(',', 1)[1]))
            print(name, (OUT / name).stat().st_size, 'bytes')
        await b.close()

asyncio.run(main())
