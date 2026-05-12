# SKILLS.md — tempelhtml Project Context

> Copy this file into your VS Code project. When working with AI assistants (Claude, Copilot, etc.)
> on this codebase, paste this file's content as context to get accurate, consistent help.

---

## What This Project Does

**tempelhtml** converts HTML/CSS pages into Figma designs.
It does this through a 6-step hybrid pipeline combining deterministic CSS mapping with AI.

**Input:** an HTML file (any page, tested against VELA creative studio landing page)
**Output:** a JSON file loaded by a Figma Plugin that builds the design automatically

---

## Architecture at a Glance

```
HTML file
  → [1] Playwright headless render (computed styles + BoundingClientRect)
  → [2] Claude Vision: screenshot diff → detect ::before/::after
  → [3] Claude LLM: CSS grid → Figma Auto Layout nesting strategy
  → [4] Claude LLM: CSS :hover + transition → Figma Component Variant specs
  → [5] Font resolver: font-weight 900 → "Black", italic → "Italic", etc.
  → [6] z-index sorter: CSS stacking context → Figma layer order
  → JSON output
  → Figma Plugin reads JSON → calls figma.createFrame() / createText() / etc.
```

---

## File Map

| File | Purpose |
|---|---|
| `scripts/convert.js` | CLI entry — orchestrates all 6 steps |
| `src/core/extractor.js` | Playwright render, `getComputedStyle()`, force-reveal animations |
| `src/core/screenshot.js` | Two screenshots: with/without `::before/::after` |
| `src/core/dom-tree.js` | DOM tree utilities: `walk()`, `findAll()`, `findGridNodes()` |
| `src/ai/pseudo-detector.js` | Claude Vision API — detects pseudo-elements from screenshot diff |
| `src/ai/grid-resolver.js` | Claude LLM — CSS grid → Figma Auto Layout nesting strategy |
| `src/ai/hover-analyzer.js` | Claude LLM — CSS hover/transition → Figma Variant spec |
| `src/figma/css-to-figma.js` | Deterministic CSS → Figma property mapper (the core) |
| `src/figma/font-resolver.js` | font-weight number → Figma style name, fallback chain |
| `src/figma/z-index-sorter.js` | CSS z-index → Figma layer insertion order |
| `src/figma/mapper.js` | Assembles everything into the final Figma node tree JSON |
| `src/utils/color.js` | hex/rgba → Figma RGB (0–1 range) |
| `src/utils/units.js` | px parsing, em→px, line-height→Figma, weight maps |
| `figma-plugin/code.js` | Figma Plugin: reads JSON, calls figma.create* |
| `figma-plugin/ui.html` | Plugin UI: paste JSON → trigger build |
| `figma-plugin/manifest.json` | Figma Plugin manifest |

---

## Key Design Decisions

### Why Playwright for extraction?
`getComputedStyle()` in a real browser resolves everything:
- `clamp(56px, 6vw, 88px)` → actual px value at the render viewport
- CSS variables like `var(--gold)` → `#c9a84c`
- Percentage widths → px
- `min-height: 100vh` → actual px height

This means the mapper never needs to implement a CSS calc engine.

### Why Two-Pass Screenshots for Pseudo-Elements?
`::before` and `::after` don't exist in the DOM — `querySelectorAll` can't find them.
`getComputedStyle(el, '::before')` gives CSS properties but not bounding box / visual output.
Solution: screenshot with pseudo-elements ON vs OFF, send both to Claude Vision,
ask "what's missing in image 2?". Claude returns bounding boxes + fill descriptions.

### Why LLM for CSS Grid?
CSS `grid-row: span 2` has no equivalent in Figma Auto Layout.
Rule-based conversion would always fall back to absolute positioning (losing semantics).
LLM understands layout *intent*: "span 2 = wrap right column into a vertical frame".
Called once per *unique grid pattern* (not per element) to avoid cost/latency.

### Why Absolute Positioning as Last Resort?
When grid strategy is unavailable (AI skipped or unknown pattern),
we fall back to `getBoundingClientRect()` + `layoutPositioning = "ABSOLUTE"`.
This is visually correct but loses resize behavior. Noted in layer name.

### Font Weight → Figma Style Name
```
100 → "Thin"     200 → "ExtraLight"   300 → "Light"
400 → "Regular"  500 → "Medium"       600 → "SemiBold"
700 → "Bold"     800 → "ExtraBold"    900 → "Black"
```
Italic: append " Italic" except "Regular" → just "Italic".
Fallback chain: requested style → "Regular" of same family → Inter style → Inter Regular.

### Z-Index → Layer Order
Figma has no z-index numbers. Layer order = `.children` array index (0 = bottom).
Algorithm:
1. Flatten DOM with effective z-index (parent stacking context + own z-index)
2. Sort ascending
3. Figma Plugin inserts in this order

---

## CSS → Figma Mapping Reference

### Layout
| CSS | Figma Plugin API |
|---|---|
| `display: flex; flex-direction: row` | `frame.layoutMode = "HORIZONTAL"` |
| `display: flex; flex-direction: column` | `frame.layoutMode = "VERTICAL"` |
| `justify-content: center` | `frame.primaryAxisAlignItems = "CENTER"` |
| `align-items: center` | `frame.counterAxisAlignItems = "CENTER"` |
| `gap: 20px` | `frame.itemSpacing = 20` |
| `padding: 52px 44px` | `frame.paddingTop/Right/Bottom/Left = ...` |
| `overflow: hidden` | `frame.clipsContent = true` |
| `position: absolute; bottom: 40px; right: 44px` | `node.layoutPositioning = "ABSOLUTE"` + calculated x/y |

### Typography
| CSS | Figma Plugin API |
|---|---|
| `font-weight: 900` | `{family: "Playfair Display", style: "Black"}` |
| `font-style: italic` | style: "Italic" or "Bold Italic" |
| `letter-spacing: 0.12em` (at 13px) | `{value: 1.56, unit: "PIXELS"}` |
| `line-height: 0.95` | `{value: 95, unit: "PERCENT"}` |
| `text-transform: uppercase` | `text.textCase = "UPPER"` |
| `-webkit-text-stroke: 1px #5a5648; color: transparent` | `text.fills = []; text.strokes = [...]` |

### Color
| CSS | Figma Plugin API |
|---|---|
| `#c9a84c` | `{r: 0.788, g: 0.659, b: 0.298}` |
| `rgba(201,168,76,0.3)` | `{r: 0.788, g: 0.659, b: 0.298, a: 0.3}` |
| `linear-gradient(to bottom, ...)` | `{type: "GRADIENT_LINEAR", gradientTransform: [...], gradientStops: [...]}` |
| `border: 1px solid rgba(...)` | `frame.strokes = [{...}]; frame.strokeWeight = 1; frame.strokeAlign = "INSIDE"` |

### Effects
| CSS | Figma Plugin API |
|---|---|
| `box-shadow: 0 0 30px 10px rgba(201,168,76,0.3)` | `{type: "DROP_SHADOW", offset: {x:0,y:0}, radius: 30, spread: 10}` |
| `opacity: 0.6` | `node.opacity = 0.6` |
| `border-radius: 50%` | `frame.cornerRadius = width/2` or `figma.createEllipse()` |

---

## What Cannot Be Mapped 1:1

| CSS Feature | Why It Fails | Workaround in tempelhtml |
|---|---|---|
| `::before` / `::after` | Not in DOM | Claude Vision screenshot diff |
| `display: grid` with `grid-row: span 2` | No equivalent in Figma Auto Layout | Claude LLM → nested horizontal+vertical frames |
| CSS `@keyframes` animations | Figma is static | Capture final state; mark layer with `[ANIMATED: spin 30s]` |
| `:hover` states | Figma is static | Claude LLM → Component Variant + Prototype spec |
| `clip-path` | No Figma equivalent | Rasterize to image (TODO) |
| `mix-blend-mode` | Partial support | Figma blend modes (most common modes work) |
| CSS Grid `grid-template-areas` | No equivalent | Absolute positioning fallback |

---

## The AI Backup Approach (Three Gaps)

### GAP 1: ::before / ::after
**Problem:** `getComputedStyle(el, '::before')` gives CSS but no bounding box.
**Solution:**
```
Screenshot #1 — page with ::before/::after visible
Screenshot #2 — inject *::before,*::after { display:none } → screenshot
Send both to Claude Vision → "what's in image 1 but not image 2?"
Claude returns: [{x, y, width, height, type, fillColor, content}]
→ Create manual Figma frames from these
```
VELA examples: grain overlay (body::before z:9999), nav gradient fade (nav::after z:-1),
decorative quote mark (testimonial::before), horizontal rule (section-label::before).

### GAP 2: CSS Grid → Figma Auto Layout
**Problem:** `grid-row: span 2` and `grid-template-areas` have no Figma equivalent.
**Solution:**
```
Collect all unique grid patterns (by gridTemplateColumns value)
Send ALL patterns in ONE LLM call → get nesting strategy for each
Strategy: outer HORIZONTAL frame → [large left child, right VERTICAL frame with 2 small cards]
Apply strategy when building Figma nodes
```
VELA example: `.work-grid { grid-template-columns: 1.6fr 1fr; } .work-card.large { grid-row: span 2 }`

### GAP 3: Animations & Hover States
**Problem:** Figma is static — no CSS transitions, no keyframe animations.
**Solution for hover:** 
```
Extract all :hover CSS rules
Send to Claude LLM → returns Figma Component Variant specs:
{ selector, componentName, variants: [{name:"State=Default",...},{name:"State=Hover",...}] }
Plugin creates Component + Variants
Prototype connections (Mouse Enter → Change To Hover) done manually in Figma UI
```
**Solution for animations:** snapshot final state, add `[ANIMATED: spin 30s]` to layer name.

---

## Running the Project

### Install
```bash
cd tempelhtml
npm install
npx playwright install chromium
cp .env.example .env
# Edit .env: add your ANTHROPIC_API_KEY
```

### Convert an HTML file
```bash
# Full pipeline (with AI)
npm run convert -- --input ./examples/vela.html --output ./out/vela.json

# Fast mode (skip AI, deterministic only)
npm run convert -- --input ./examples/vela.html --output ./out/vela.json --skip-ai
```

### Load in Figma
1. Figma → Plugins → Development → Import plugin from manifest
2. Select `figma-plugin/manifest.json`
3. Run plugin → paste content of `out/vela.json` → Build

---

## Environment
- Node.js v18+ (ESM modules, `"type": "module"` in package.json)
- Playwright for headless Chromium
- Anthropic SDK for Claude API calls (Vision + LLM)
- Figma Plugin API (runs inside Figma's sandbox — no Node.js)
