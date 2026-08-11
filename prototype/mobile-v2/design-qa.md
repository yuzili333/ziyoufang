# Design QA — mobile-v2

final result: passed

## Evidence

- Source visual truth: `/Users/yuzili/Projects/ziyoufang/harness/prototypes/assets/mobile-v2-option-2-growth-v2.png`
- Source pixels: `853 × 1844`; normalized to `393 × 850` for the full-view comparison.
- Valid 1:1 implementation capture: `/Users/yuzili/Projects/ziyoufang/prototype/mobile-v2/qa-result-screen-v4.jpg`
- Valid 1:1 full comparison: `/Users/yuzili/Projects/ziyoufang/prototype/mobile-v2/qa-comparison-v4.png`
- Valid 1:1 focused comparison: `/Users/yuzili/Projects/ziyoufang/prototype/mobile-v2/qa-comparison-focus-v4.png`
- Post-fix browser capture: `/Users/yuzili/Projects/ziyoufang/prototype/mobile-v2/qa-result-final-scaled-full.jpg`
- Post-fix normalized comparison: `/Users/yuzili/Projects/ziyoufang/prototype/mobile-v2/qa-comparison-final.png`
- Reference state: iPhone, `?screen=results`, selected character `月`, overlay mode, completed result.
- 1:1 capture viewport: browser `1400 × 1200`, device screen `393 × 852` CSS px, device scale factor `2`; the device-screen region measured exactly `393 × 852` before capture.
- Final Codex browser panel later returned to its compact viewport. The post-fix capture measured `178 × 386` on screen and was normalized to `393 × 852` only to verify the isolated safe-area/header correction; layout and density remained those of the preceding valid 1:1 pass.

## Findings and comparison history

### Iteration 1 — blocked

- [P2] Result content was too tall at the desktop preview viewport.
  - Location: result main glyph, growth area, and bottom navigation.
  - Evidence: an unintended desktop media query enlarged the glyph to `340px`, hiding the monitoring alert and advice below the fixed navigation.
  - Impact: the selected visual direction depends on seeing comparison, five dimensions, growth, and monitoring in one coherent result view.
  - Fix: removed the desktop-only glyph override; compressed the rail, section gaps, chart, and navigation while retaining practical touch targets for core actions.

- [P2] The single-character rail showed too few items.
  - Location: horizontal result carousel.
  - Evidence: the source shows eight items plus a partial ninth; the first implementation showed six plus a partial seventh.
  - Impact: it weakened the “one photo, multiple recognized characters” message.
  - Fix: reduced each result tile to `38 × 40px` and tightened the rail gap, using the runtime `Carousel` rather than a custom scroller.

### Iteration 2 — blocked

- [P2] The compact product wordmark occupied the iOS status-bar safe area.
  - Location: top of the result screen.
  - Evidence: the 1:1 comparison showed the wordmark colliding with the live clock and Dynamic Island.
  - Impact: app-owned text was obscured by protected device chrome.
  - Fix: removed app-owned branding from the protected status area and moved the share action into the result heading. The live runtime status bar remains unchanged.

### Final comparison — passed

- No actionable P0, P1, or P2 differences remain.
- [P3] The implementation glyph square is about 7% smaller than the normalized visual source. This keeps the full growth, monitoring, advice, and feedback actions visible above the fixed navigation and remains faithful to the intended hierarchy.
- [P3] The runtime-owned iOS status bar, Dynamic Island, rounded screen corners, and home indicator differ from the frameless source by design. They are protected mobile runtime infrastructure.

## Required fidelity surfaces

- Fonts and typography: Chinese display text uses `STSong/SimSun` and glyphs use `STKaiti/KaiTi` fallbacks; hierarchy, weights, line height, and compact label density track the source. Small status counts remain intentionally secondary but readable in the full-size device screen.
- Spacing and layout rhythm: the source order is preserved—brand/safe area, title, multi-character rail, selected summary, large glyph, comparison switch, issue title, five dimensions, growth, monitoring, advice, feedback, and navigation. The final 1:1 pass has no clipped persistent controls.
- Colors and tokens: paper `#F8F4EB`, vermilion `#C93627`, ink `#1D1B19`, muted paper borders, green success, and amber uncertainty map directly to the selected white/vermilion/black direction. No purple/blue gradients or game styling were introduced.
- Image quality and asset fidelity: the logo, synthetic practice sheet, main glyph overlay, and growth chart are real raster assets. The overlay and chart are derived from the selected visual source, retain their crop and palette, and are not replaced by CSS or handcrafted SVG art. Radix Icons supplies UI icons.
- Copy and content: app text follows the approved vocabulary for `错字`, `待纠偏`, `还不能确定`, partial completion, model degradation, stability, growth, and monitored characters. The page contains no teacher review or periodic-report references.
- Icons: a single Radix icon family is used for capture, share, alerts, privacy, upload, navigation, and feedback. The source-specific seal and handwriting remain raster assets.
- Responsiveness: iPhone and Pixel 10 runtime previews were inspected. Both retain the bottom capture control, complete result hierarchy, safe-area chrome, and readable content without horizontal overflow.
- Accessibility: semantic buttons, headings, labels, radio controls, checkboxes, alt text, disabled states, reduced-motion handling, and text-based labels accompany icons. Primary mobile actions remain at least `44px`; dense result-only controls remain paired with text.

## Interaction verification

- First use → privacy reading → guardian confirmation → practice home.
- Practice target → capture → photo confirmation → staged analysis → completed results.
- Overlay/parallel switch, character selection, uncertain state, growth detail, and record selection.
- `我的` → `字本` → `重点字库`, including filters and repeat-practice entry.
- Feedback text → keyboard dismissal → resubmitted analysis.
- Share consent gate, redacted share confirmation, deletion scope, and delete confirmation.
- Direct recovery states for offline save, blurred photo, partial result, and model-advice degradation.
- Browser console: no app warnings or errors in the final result state.

## Follow-up polish

- Revisit the 7% glyph-size difference only if product review prioritizes a larger overlay over keeping monitoring and actions in the same initial viewport.
