# Motion storyboard

## How the reference was inspected

The video `Landing page inspiration.mp4` (30 s, 1440×1080) was opened in the built-in browser and checked frame by frame at roughly 2-second intervals between 0 and 29.9 s. The observations below describe only what those frames show. The exact techniques (sticky positioning, scroll scrubbing, libraries) cannot be confirmed from a screen recording.

## What the reference shows

| Time | Section | Observation |
|---|---|---|
| 0–1 s, 29–30 s | Framing | A tilted overview of the whole page. This is presentation framing for the video, not a page effect. |
| 2 s | Transition | A blurred, zoomed portrait passes through, as the recording zooms in. |
| 4 s | Hero | A large italic serif headline ("Smart AI for…") appears progressively, with letters still fading in. A portrait card sits centred behind it. Pill CTA top-right. |
| 6 s | Hero | The full hero: a nav list on the left, a "100%" stat chip, a testimonial chip on the right, and a pill "Ask…" control over the portrait. Near-black background with violet light at the bottom. |
| 8 s | 01 About | "Smart Finance. *Human Touch.*" with a sans + italic-serif pair and a "01 / About us" label. Floating, overlapping product cards on the left. Thin rows with arrow icons on the right. |
| 10.5–12.5 s | 02 Services | Centred heading and thin rows with small pill tags on the left. Rows appear one at a time. The active row gets a full-width violet-to-rose gradient band, and its title switches to italic serif. |
| 14.5–16.5 s | Stats / testimonial | Numbers count up (500, $89M → $100M). A large quote mixes plain sans with italic serif. A portrait slides in. |
| 18.5–20.5 s | FAQ | A hard dark-to-white transition with a soft gradient edge. Rows marked with a plus open with a height transition. |
| 23 s | About-2 | Light section with photos and an italic serif emphasis line. |
| 25.5–28 s | Footer | Dark footer with italic-serif column heads and a newsletter block. A huge italic wordmark sits at the bottom edge. |

## What KirayaKhata implements

| Section | Effect implemented | Purpose | Mobile / reduced motion |
|---|---|---|---|
| Hero | Staggered reveals (eyebrow → headline → italic accent → lede → CTAs, 28 px, 640 ms, delays 60–560 ms). The example card's equation rows appear in sequence once. The hero art has small parallax (0.08) and scales from 1 to 0.97 as the hero leaves. | Introduces the rent equation; the form is never delayed. | Parallax is off below 961 px. With reduced motion, everything appears at once and nothing moves. |
| 01 Routine | A CSS-sticky preview card next to six steps. An IntersectionObserver band through the middle of the viewport picks the active step, updating the preview pane and progress bar. Inactive steps dim to 0.5 but stay readable. All previews are live engine output. | Explains agreement → year-end. | Below 961 px the preview is not sticky and the steps stay at full opacity. With reduced motion there is no sticky behaviour. |
| 02 Feature rows | ARIA tablist rows. One absolutely positioned gradient band slides with `transform` (640 ms). The active title swaps to italic serif. The preview crossfades with opacity and translate. Selection works by click, arrow/Home/End keys and touch, and by scroll on desktop (paused for 2.5 s after a manual choice). A ResizeObserver re-measures after fonts load. | Adapts the reference's service-row highlight. | On mobile each preview appears inline under its row. With reduced motion, scroll selection is off and click/keys still work. |
| 03 Invoice studio | Two decorative blank sheets fan out behind each preview when it enters. Template and mode changes update the live preview immediately. | Connects the visuals to working PDFs. | The fan shows statically. Controls never move. |
| 04 Reconciliation | Result rows reveal in order: rent → GST → invoice value → TDS → expected → actual → difference (140 ms stagger). Values always come from the result; no counting animation. | Makes the equation readable. | Static. |
| 05 Calendar | Task cards rise in sequence (70 ms stagger) after each render. Focus never moves. | Shows the next action. | Static. |
| Year-end → FAQ | A gradient bridge from plum through a faint rose wash to paper. The FAQ uses a measured-height open/close (340 / 260 ms). | Echoes the reference's dark-to-light change. | Opens instantly. |
| Footer | A huge italic "KirayaKhata" wordmark rises 40 px and fades in over 900 ms. | Echoes the editorial footer. | Static. |

Not copied from the reference:

- **Count-up numbers.** Inventing or animating metrics would be misleading.
- **The tilted overview** in the video's framing.

Not used anywhere: scroll hijacking, scroll snapping, smooth-scroll libraries, canvas-only content and video assets. Motion uses only transforms and opacity, except the highlight band's height and the FAQ's measured height.

## Test results

| Check | Result |
|---|---|
| Hero, routine stage, feature rows (scroll selection lands on row 3), demo, studio and footer, checked by scrolling in the built-in browser at 1280 px | Done |
| Highlight band position vs selected row | Aligned (446/446 px top, 151/150 px height) |
| Horizontal overflow at 1280 px | None; fixed by clipping the ambient glows |
| Horizontal overflow at 375 px (Hindi) | None |
| All `.reveal` elements reach opacity 1 | Yes |
| No-JS rendering | Static fallback content is present in the HTML. Not separately screenshot-tested. |
| `prefers-reduced-motion` | Implemented in CSS and JS. **Not emulated** in this session's browser. |
