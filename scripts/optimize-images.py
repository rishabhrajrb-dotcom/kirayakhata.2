# One-off asset optimisation: source PNGs in ../KirayaKhata_purposeful_images_v2 stay untouched.
# Writes responsive WebP copies to public/assets/. Requires Pillow.
from PIL import Image
import os, sys
SRC = os.path.join(os.path.dirname(__file__), '..', '..', 'KirayaKhata_purposeful_images_v2')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
os.makedirs(OUT, exist_ok=True)
names = {'01_hero_workflow.png': 'hero-workflow', '02_rent_maintenance_invoices.png': 'invoices-two-documents',
         '03_deadline_reminders.png': 'deadline-reminders', '04_payment_reconciliation.png': 'payment-matching',
         '05_year_end_pack.png': 'year-end-pack'}
for src, slug in names.items():
    im = Image.open(os.path.join(SRC, src)).convert('RGB')
    for w in (1536, 960, 640):
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, f'{slug}-{w}.webp'), 'WEBP', quality=80, method=6)
    px = im.getpixel((40, 400)); print(slug, im.size, 'sample bg', '#%02x%02x%02x' % px)
