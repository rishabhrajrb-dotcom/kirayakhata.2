# Design system

The starting point came from the UI UX Pro Max skill (v2.13.0). Its `--design-system` query was "fintech editorial dark luxury finance", with variance 7, motion 4 and density 3. I kept its type recommendation (IBM Plex Sans), its Swiss-minimal discipline, its 4.5:1 contrast target and its rules on reduced motion and touch targets.

I replaced the generic amber/slate palette it suggested with the mandatory brand variables. The skill's "avoid AI purple/pink gradients" warning applies here: violet and rose are kept to ambient glows and to the single active-row band from the brief. They are never used as a page-wide fill.

## Tokens (`public/styles.css`)

| Group | Tokens |
|---|---|
| Brand (fixed) | `--ledger #8E1B1B`, `--marigold #E0A100`, `--ink #1E2433`, `--paper #FAFAF7`, `--rule #E4E7EE`, `--paid #1F7A4D` |
| Paper support | `--paper-2 #F4EFE6`, `--paper-3`, `--ink-muted #4A5163` (about 8:1 on paper), `--ink-soft #6B7286`, warning, review and ok backgrounds |
| Dark surfaces | `--night #140B16`, `--plum #311A2D` (sampled from the hero art so the image blends in), `--plum-2`, `--plum-3`, `--on-dark #F6F0F4`, `--on-dark-muted #CFC2CD` |
| Decorative | `--violet`, `--rose`, glows, `--highlight` gradient |

Contrast rules:

- Ledger red appears only on light surfaces.
- Marigold is a fill or accent with ink text on top; it is never small text on paper.
- On dark surfaces, accents use `--marigold-light #F2C14E` and `--rose`.

## Type

| Use | Font |
|---|---|
| UI, numbers, body | IBM Plex Sans, 18 px body, tabular figures for money |
| Hindi | IBM Plex Sans Devanagari, line-height 1.7 |
| Editorial accent | Instrument Serif italic, for short phrases only. Hindi has no italic Devanagari, so in Hindi the accent switches to Plex Devanagari 500 in the accent colour. |
| Headings | `clamp()` scales: display 2.5–5.4 rem, h2 2–3.6 rem |

## Components

- Pill buttons, at least 48 px tall (52 px for primary).
- Chips: ok, warn, review, neutral, draft, dark and plan.
- Large radio "choice" pills.
- Fields with visible labels, hints and errors next to the field.
- Notices: info, warn, review and ok.
- Feature tablist rows.
- Sticky stage card.
- A4 invoice sheets in three template variants.
- Month grid and task cards.
- Toasts.
- Workspace cards, data tables and the wizard step bar.

## Layout

- Content is 1220 px max.
- Gutters use `clamp(16px, 4vw, 40px)`.
- Breakpoints are 960 px (stacked layout) and 640/560 px (single column).
- The workspace side nav becomes a horizontal scroller on mobile.

## Accessibility

- Skip link and visible marigold focus rings.
- ARIA tablist with roving tabindex.
- `aria-live` regions for results and toasts.
- Decorative glows are `aria-hidden`; images have descriptive alt text in both languages.
- Labels are always present, and all controls are reachable by keyboard.
