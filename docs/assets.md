# Asset register

All five section images come from the version-2 set the owner supplied in `../KirayaKhata_purposeful_images_v2/`.

**Provenance:** the owner's README says they were generated with a built-in image tool. The exact prompts are in that folder's `GENERATION_PROMPTS.md`.

- The source PNGs (1536×1024) are untouched.
- Web copies were made by `scripts/optimize-images.py`: WebP at quality 80, in 640, 960 and 1536 px widths. Each file is about 12–62 KB, down from about 2 MB per PNG.
- The person in the hero is **fictional and illustrative**. They are not a customer, not the founder's father, and not a testimonial.
- The text in the images is English decoration only. All live text, figures, dates and controls are HTML.

| File (public/assets) | Placement | Purpose | Alt text |
|---|---|---|---|
| `hero-workflow-*.webp` | Hero, right two-thirds, blended into `--plum #311A2D` | Older landlord + the agreement → invoice → payment → calendar flow | Describes a fictional older Indian landlord and the flow (EN/HI) |
| `invoices-two-documents-*.webp` | 03 Invoice studio | Two separate documents, templates, sharing both | EN/HI |
| `payment-matching-*.webp` | 04 Demo (reconciliation) | Expected rent + GST − TDS vs received; says "not a real bank connection" | EN/HI |
| `deadline-reminders-*.webp` | 05 Calendar | Highlighted dates linked to reminder cards; no invented dates | EN/HI |
| `year-end-pack-*.webp` | 06 Year-end | Three record types collected into one pack; no filing implied | EN/HI |
| `favicon.svg` | Browser tab | Original SVG ledger mark | — |

## Stock search and image generation

No stock images were searched for or used. The supplied v2 set covers every section exactly, and the brief says to prefer it over stock shopfronts. No new images were generated, so no OpenAI API calls or costs were incurred.

## If more artwork is needed

Generate it from `GENERATION_PROMPTS.md` with the same art-direction paragraph.

- Fully localised Hindi artwork would need separate versions with Hindi labels. It is not needed now, because the embedded labels are decorative.
- Use your own OpenAI key, created at https://platform.openai.com/api-keys, and keep it in a server-side `.env`.
- The app never generates images at runtime.
