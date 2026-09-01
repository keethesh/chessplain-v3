# Design System: Modern Tournament Editorial

<!-- impeccable:design-schema 1 -->

## Visual World

**Modern Tournament Editorial**
A quiet, authoritative, and deeply human visual environment inspired by the physical culture of chess: tournament scorebooks, master annotations, warm maple & walnut boards, and timeless editorial publications. It de-escalates the post-loss emotional state (tilted/frustrated) through warm alabaster surfaces, deliberate typographic hierarchy, and zero arcade/casino distractions.

---

## Palette & Color Strategy

**Strategy**: Committed Restrained (Warm alabaster ground, deep charcoal/black-brown ink, warm amber-ochre accent for pivotal moments and arrows).

### Light Theme (Default)
- `--w-canvas`: `#fbf9f5` (Warm alabaster / ivory paper)
- `--w-surface`: `#ffffff` (Crisp white cards & modals)
- `--w-surface-subtle`: `#f4efe6` (Warm linen / light callout tint)
- `--w-border`: `#e5dec9` (Soft parchment border)
- `--w-border-strong`: `#d1c7ad` (Definite structural borders)
- `--w-ink1`: `#18181b` (Deep charcoal-black body & headings)
- `--w-ink2`: `#71717a` (Muted neutral for secondary labels)
- `--w-ink3`: `#a1a1aa` (Subtle captions & move notation numbers)
- `--w-accent`: `#b45309` (Warm amber-ochre for key takeaways & turning points)
- `--w-accent-soft`: `#fef3c7` (Soft amber highlight background)
- `--w-on-accent`: `#ffffff` (White text on accent badges)
- `--w-error`: `#dc2626` (Muted crimson for critical blunders / mistakes)
- `--w-error-soft`: `#fee2e2` (Soft rose tint for error cards)

### Dark Theme (`[data-theme="dark"]` / `@media (prefers-color-scheme: dark)`)
- `--w-canvas`: `#121417` (Deep slate-charcoal)
- `--w-surface`: `#1a1d24` (Elevated slate surface)
- `--w-surface-subtle`: `#222630` (Muted dark callout tint)
- `--w-border`: `#2e3440` (Subtle dark border)
- `--w-border-strong`: `#434c5e` (Defined dark borders)
- `--w-ink1`: `#f4f4f5` (Crisp off-white)
- `--w-ink2`: `#a1a1aa` (Muted light neutral)
- `--w-ink3`: `#71717a` (Dim notation labels)
- `--w-accent`: `#f59e0b` (Luminous amber-ochre)
- `--w-accent-soft`: `rgba(245, 158, 11, 0.15)` (Subtle dark amber glow)
- `--w-on-accent`: `#121417` (Dark text on luminous amber)
- `--w-error`: `#ef4444` (Coral red)
- `--w-error-soft`: `rgba(239, 68, 68, 0.15)` (Soft dark crimson)

### Chessboard Colorway
- Light Squares: `#f0d9b5` (Tournament Maple)
- Dark Squares: `#b58863` (Tournament Walnut)
- Arrow Accent: `var(--w-accent)` (`#b45309` in light / `#f59e0b` in dark)

---

## Typography System

### Font Hierarchy
1. **Display & Story Headlines (`.t-display`, `.t-heading`)**:
   - `font-family: "Newsreader", "Georgia", "Cambria", "Times New Roman", serif`
   - Renders summary headlines like *"You didn't lose this in the endgame."* with editorial warmth and human gravitas.
2. **Body & Interface (`.t-body`, `.t-small`, `.t-caption`)**:
   - `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
   - Clean, highly legible humanist grotesque.
3. **Notation & Move Numbers (`.t-notation`, `.t-mono`)**:
   - `font-family: ui-monospace, "SF Mono", "Menlo", "Consolas", monospace`
   - Tabular alignment for SAN notation (e.g. `23.Bxf7+`).

---

## Component Language

1. **Moment Card (`MomentCard`)**:
   - Surface card with smooth 1px `--w-border` and subtle corner radius (8px / `rounded-lg`).
   - Active state indicated by `--w-accent` border ring (`ring-2 ring-[var(--w-accent)]`) and elevated shadow.
   - "Probable Thought" callout: Soft surface background (`--w-surface-subtle`) with italic styling and quotes.
   - "Takeaway": Clean rounded badge container with check icon and `--w-accent` icon highlight (zero side-tab left-border artifacts).

2. **Interactive Chessboard (`ChessboardView`)**:
   - Sticky container with rounded frame and subtle border.
   - Supports orientation auto-flip (White/Black) with a dedicated flip affordance (`RotateCcw` button / `F` key).
   - Theme-aware custom arrows for played moves and tactical refutations.

3. **Badges & Severity Chips**:
   - `Turning point`: `--w-accent` background or pill border.
   - `Last chance` / `Missed win`: `--w-error` soft background with crisp text.
   - `Quiet drift`: `--w-surface-subtle` neutral badge.

4. **Responsive Layouts**:
   - **Desktop ($\ge 1024px$)**: 2-column layout. Left column holds the sticky chessboard (~440px), right column holds the summary headline and scrollable moment cards.
   - **Mobile ($< 1024px$)**: Sticky top mini-board (~220px height) with active move arrow; moment cards scroll comfortably in the lower 60% thumb-zone.

---

## Intent & Accessibility Guarantees

- **No Dark Patterns**: Transparent pricing, 1-click sample game without signup, zero forced modals.
- **Cognitive Load ($\le 4$ items)**: 1 active moment at a time, clear visual sync between board and text.
- **Keyboard Navigation**: `←`/`→` arrows cycle through game moments; `F` flips the chessboard.
- **Color Contrast**: All text pairings meet WCAG AA (4.5:1 minimum).
