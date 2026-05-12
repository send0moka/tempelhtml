# AI Backup Approach

Three gaps in the deterministic CSS→Figma pipeline that require AI assistance.

---

## GAP 1 — `::before` / `::after` Not in DOM

### Problem
CSS pseudo-elements are not accessible via `querySelectorAll` or `getBoundingClientRect`.
`getComputedStyle(el, '::before')` only returns CSS properties — no bounding box, no visual size.

### AI Solution: Computer Vision Screenshot Diff

```js
// Step 1: Screenshot with all pseudo-elements visible
const withPseudo = await page.screenshot({ fullPage: true });

// Step 2: Inject CSS to hide all pseudo-elements, screenshot again
await page.addStyleTag({ content: '*::before, *::after { display: none !important; }' });
const withoutPseudo = await page.screenshot({ fullPage: true });

// Step 3: Send both to Claude Vision
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  messages: [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", data: withPseudo.toString("base64") } },
      { type: "image", source: { type: "base64", data: withoutPseudo.toString("base64") } },
      { type: "text", text: `Compare these two screenshots.
        Find all elements in image 1 that are missing in image 2.
        Return JSON array: [{x, y, width, height, type, fillColor, content, opacity, position}]` }
    ]
  }]
});

// Step 4: Create Figma frames from the returned bounding boxes
for (const pseudo of parsedPseudos) {
  const frame = figma.createFrame();
  frame.name = `[pseudo] ${pseudo.name}`;
  frame.resize(pseudo.width, pseudo.height);
  frame.x = pseudo.x;
  frame.y = pseudo.y;
  frame.opacity = pseudo.opacity;
  frame.fills = buildFillFromDescription(pseudo.fillColor);
}
```

### VELA Pseudo-Elements Caught by This Approach
| Element | CSS | Description |
|---|---|---|
| `body::before` | `position:fixed; inset:0; z-index:9999` | Noise/grain texture overlay over entire page |
| `nav::after` | `position:absolute; inset:0; z-index:-1` | Dark gradient fade behind nav content |
| `.testimonial-section::before` | `content:'"'; font-size:400px; opacity:0.04` | Giant decorative quotation mark |
| `.section-label::before` | `content:''; width:30px; height:1px` | Small horizontal decorative line |

---

## GAP 2 — CSS Grid Complex Layouts

### Problem
`display: grid` with `grid-row: span 2` or `grid-template-areas` has no direct Figma Auto Layout equivalent.
Rule-based fallback (absolute positioning via `getBoundingClientRect`) works visually
but loses layout semantics — elements can't be resized or rearranged in Figma.

### AI Solution: LLM Layout Architect

```js
// Collect all unique grid patterns (deduplicated by gridTemplateColumns)
const gridNodes = findGridNodes(domTree);
const uniquePatterns = deduplicateByGridTemplate(gridNodes);

// One LLM call for ALL patterns (not per element)
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  messages: [{
    role: "user",
    content: `Convert these CSS grid layouts to Figma Auto Layout nesting strategies.
    
    Pattern 1 (.work-grid):
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    grid-template-rows: auto auto;
    gap: 3px;
    Children: [".work-card.large (grid-row: span 2)", ".work-card", ".work-card"]
    
    Return JSON: [{ selectorHint, outerFrame: { layoutMode, children: [...] } }]`
  }]
});

// AI returns: 
// outerFrame: HORIZONTAL
//   child 1: large card (layoutGrow: 1.6)
//   child 2: VERTICAL frame (layoutGrow: 1)
//     subchild 1: small card (layoutSizingVertical: FILL)
//     subchild 2: small card (layoutSizingVertical: FILL)
```

### Why LLM Works Here
LLMs understand layout *intent*, not just CSS syntax. When given `grid-row: span 2`,
it reasons: "this card needs to be as tall as two rows → wrap the right side into a vertical frame."
This is the correct semantic mapping, not just a geometric approximation.

### Batching is Critical
Call the LLM **once per unique grid pattern**, not per element.
If a page has 3 grids with the same `grid-template-columns`, resolve the strategy once
and apply to all 3 instances. This keeps API costs and latency manageable.

---

## GAP 3 — Animations & Hover States

### Problem
- CSS `@keyframes` animations (spin, marquee, pulse, gridShift) → Figma is static
- CSS `:hover` + `transition` → Figma has no native hover behavior
- JS `IntersectionObserver` reveal animations → elements start at `opacity:0; translateY(32px)`

### AI Solution A: Hover State → Figma Component Variants

```js
// Extract all :hover and transition rules from CSS
const hoverRules = extractInteractiveRules(rawCSS);

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  messages: [{
    role: "user",
    content: `From these CSS rules, generate Figma Component Variant specs.
    
    ${hoverRules}
    
    Return JSON: [{
      selector, componentName,
      variants: [
        { name: "State=Default", properties: { fills, strokes, opacity, effects } },
        { name: "State=Hover", properties: { ... } }
      ],
      transition: { durationMs, easing },
      figmaPrototype: { trigger: "MOUSE_ENTER", action: "CHANGE_TO", animation: "SMART_ANIMATE" }
    }]`
  }]
});

// Plugin creates Component + Variants from the spec
// Prototype connections added manually in Figma UI (Plugin API doesn't support this yet)
```

### AI Solution B: Keyframe Animations → Multi-Frame Snapshot

```js
// For looping animations: capture multiple keyframes
const keyframePercents = [0, 25, 50, 75]; // % of animation duration
const frames = [];

for (const pct of keyframePercents) {
  await page.evaluate((p) => {
    const duration = 20; // seconds
    document.querySelectorAll('[data-animated]').forEach(el => {
      el.style.animationDelay = `-${(p / 100) * duration}s`;
      el.style.animationPlayState = 'paused';
    });
  }, pct);
  frames.push(await page.screenshot({ clip: elementBounds }));
}
// Export 4 frames in Figma → add Prototype loop connection manually
```

### Deterministic Solution: Force Final State

For reveal animations (IntersectionObserver pattern — very common):
```js
// Before extraction, force all elements to their revealed state
document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
// Now getComputedStyle() returns: opacity=1, transform=none (the final state)
```

### VELA Hover Inventory
| Element | Default | Hover | Transition |
|---|---|---|---|
| `.btn-primary` | bg: `#c9a84c` | bg: `#e8c97a`, translateY(-2px) | 300ms ease |
| `.service-card` | border: transparent | border: `rgba(201,168,76,0.2)` | 300ms ease |
| `.work-card` | info overlay hidden | info overlay: opacity 1, translateY(0) | 400ms ease |
| `.nav-links a` | color: `#5a5648` | color: `#d6cfc0` | 300ms ease |
| `.work-card` | transform: none | scale(1.04) | 600ms ease |

---

## Full Hybrid Pipeline

```
Step 1: Playwright headless render
        getComputedStyle() + getBoundingClientRect()
        force .reveal.visible, pause all animations
        → intermediate DOM tree JSON

Step 2: Computer Vision — Screenshot Diff
        detect ::before / ::after pseudo-elements
        → list of {x, y, width, height, fill, opacity}

Step 3: LLM — Grid Layout Resolver
        CSS grid rules → Figma Auto Layout nesting strategy
        (one call per unique grid pattern)

Step 4: LLM — Hover/Interaction Analyzer
        CSS :hover + transition → Figma Component Variant specs

Step 5: Font Resolver
        font-weight number → Figma style name
        fallback: primary → Regular → Inter

Step 6: Figma Plugin
        reads intermediate JSON
        creates frames, text nodes, components
        applies z-index ordering

Step 7: QA Visual Diff (optional, future)
        export Figma frame as PNG
        compare to original HTML screenshot via Claude Vision
        score similarity, flag discrepancies for manual review
```

---

## Cost & Performance Notes

| Step | API calls | Latency | Notes |
|---|---|---|---|
| Pseudo detector | 1 Vision call | ~3-5s | Always one call regardless of page size |
| Grid resolver | 1 LLM call | ~2-4s | Batches ALL unique patterns in one call |
| Hover analyzer | 1 LLM call | ~3-6s | Sends all CSS at once |
| Total AI cost | ~3 API calls | ~10-15s | For a typical landing page |

Calling AI per-element instead of batching would be ~10-100x more expensive.
