# PAD Information Architecture QA — mobile-v2

final result: passed for information architecture; device visual sign-off pending

## Scope

- Artifact: `/Users/yuzili/Projects/ziyoufang/prototype/mobile-v2/public/pad-preview.html`
- Contract: `/Users/yuzili/Projects/ziyoufang/harness/contracts/responsive-layout-v2.json`
- Reference board: `1280 × 800` CSS px, landscape.
- Evidence capture: `/Users/yuzili/Projects/ziyoufang/prototype/mobile-v2/qa-pad-layout-scaled.jpg`.
- Purpose: validate the future PAD master-detail information architecture without adding PAD to the phone-first WeChat Mini Program MVP.

## Browser verification

- The unscaled board measured `1279.999 × 800px`.
- Grid columns measured approximately `78 / 222 / 620 / 360px` for navigation, character master list, comparison workspace, and insight panel.
- The comparison workspace remained the largest region and exceeded the `470px` minimum.
- Switching from “月” to “永” updated the selected-character heading and comparison glyph.
- Switching from “叠加” to “并排” updated `aria-pressed` to `true`.
- Returning to “月” restored the scored monitoring state.
- Nine character results, five dimensions, four-point growth curve, monitored-library state, and correction steps remained present in the same hierarchy.

## Responsive and scope checks

- Below `840px`, the contract returns to bottom navigation, horizontal character carousel, and insight content after the comparison workspace.
- Layout selection is based on actual window width, not device model.
- Stability remains unavailable before three comparable practices; monitoring thresholds remain versioned service data.
- The board contains no teacher review, periodic report, ranking, points, challenge, or public social entry.
- “字本” remains a secondary menu under “我的”.

## Evidence limits

- The Codex browser panel exposed a compact viewport, so the saved screenshot is an equal-ratio overview rather than a 1:1 PAD-device capture.
- The raster image generation service failed with a network error; the deterministic browser design board is the current review evidence and no external-key CLI fallback was used.
- PAD WeChat-client rendering, system font scaling, portrait/landscape switching, split windows, touch ergonomics, and visual-owner sign-off remain pending.

These limits do not invalidate the information architecture check and do not approve formal development scaffolding.
