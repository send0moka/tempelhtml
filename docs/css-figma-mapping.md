# CSS → Figma Property Mapping Reference

Complete reference for converting CSS computed styles to Figma Plugin API properties.
All values come from `getComputedStyle()` — already resolved to px by the browser.

---

## Layout & Box Model

### Flexbox → Auto Layout
```js
// display: flex (row)
frame.layoutMode = "HORIZONTAL";
frame.primaryAxisAlignItems = "MIN";    // justify-content: flex-start
frame.primaryAxisAlignItems = "CENTER"; // justify-content: center
frame.primaryAxisAlignItems = "MAX";    // justify-content: flex-end
frame.primaryAxisAlignItems = "SPACE_BETWEEN"; // justify-content: space-between
frame.counterAxisAlignItems = "MIN";    // align-items: flex-start
frame.counterAxisAlignItems = "CENTER"; // align-items: center
frame.counterAxisAlignItems = "MAX";    // align-items: flex-end
frame.counterAxisAlignItems = "STRETCH"; // align-items: stretch
frame.itemSpacing = 20;                 // gap: 20px

// display: flex; flex-direction: column
frame.layoutMode = "VERTICAL";
```

### Grid → Auto Layout (approximation)
```js
// grid-template-columns: repeat(4, 1fr)
frame.layoutMode = "HORIZONTAL";
frame.primaryAxisSizingMode = "FIXED";
children.forEach(c => { c.layoutGrow = 1; }); // 1fr each

// grid-template-columns: 1.6fr 1fr  (VELA .work-grid)
// Strategy: outer HORIZONTAL, children get proportional layoutGrow
child1.layoutGrow = 1.6;
child2.layoutGrow = 1;

// grid-row: span 2  → AI-resolved nesting:
// outerHorizontal → [largeCard, rightVertical → [card1, card2]]
```

### Sizing
```js
frame.resize(rect.width, rect.height); // getBoundingClientRect()
// min-height: 100vh → computed by browser → fixed px value
// clamp(56px, 6vw, 88px) → computed by browser → fixed px value
```

### Padding
```js
frame.paddingTop    = 52; // padding-top: 52px
frame.paddingRight  = 44;
frame.paddingBottom = 52;
frame.paddingLeft   = 44;
// Figma always uses border-box, same as CSS box-sizing: border-box
```

### Absolute Positioning
```js
node.layoutPositioning = "ABSOLUTE";
node.x = rect.x - parentRect.x; // calculated from BoundingClientRect
node.y = rect.y - parentRect.y;
// CSS: bottom: 40px; right: 44px
node.x = parent.width - node.width - 44;
node.y = parent.height - node.height - 40;
```

---

## Typography

### Font
```js
// font-weight number → Figma style name
const weightMap = {
  100:"Thin", 200:"ExtraLight", 300:"Light", 400:"Regular",
  500:"Medium", 600:"SemiBold", 700:"Bold", 800:"ExtraBold", 900:"Black"
};
// italic: append " Italic" (except Regular → just "Italic")

await figma.loadFontAsync({ family: "Playfair Display", style: "Black" });
text.fontName = { family: "Playfair Display", style: "Black" };
text.fontSize = 88; // getComputedStyle().fontSize → px
```

### Line Height
```js
// unitless (e.g. 0.95 or 1.8) → PERCENT
text.lineHeight = { value: 95, unit: "PERCENT" };  // line-height: 0.95
text.lineHeight = { value: 180, unit: "PERCENT" }; // line-height: 1.8
text.lineHeight = { unit: "AUTO" };                // line-height: normal
```

### Letter Spacing
```js
// CSS em → px: value_em × fontSize_px
// letter-spacing: 0.12em at font-size: 13px → 0.12 × 13 = 1.56px
text.letterSpacing = { value: 1.56, unit: "PIXELS" };
```

### Text Transform / Align
```js
text.textCase = "UPPER";    // text-transform: uppercase
text.textCase = "LOWER";    // text-transform: lowercase
text.textCase = "TITLE";    // text-transform: capitalize
text.textCase = "ORIGINAL"; // text-transform: none

text.textAlignHorizontal = "LEFT";      // text-align: left
text.textAlignHorizontal = "CENTER";    // text-align: center
text.textAlignHorizontal = "RIGHT";     // text-align: right
text.textAlignHorizontal = "JUSTIFIED"; // text-align: justify
```

### Outline Text (-webkit-text-stroke)
```js
// CSS: -webkit-text-stroke: 1px #5a5648; color: transparent
text.fills = [];  // empty = transparent
text.strokes = [{ type: "SOLID", color: { r: 0.35, g: 0.34, b: 0.28 } }];
text.strokeWeight = 1;
text.strokeAlign = "OUTSIDE";
```

### Italic Inline Text (mixed styles on one TextNode)
```js
// Only works on TextNode with multiple style ranges
text.setRangeFontName(startIdx, endIdx, { family: "Playfair Display", style: "Italic" });
text.setRangeFills(startIdx, endIdx, [{ type: "SOLID", color: { r: 0.91, g: 0.79, b: 0.48 } }]);
```

---

## Color & Fills

### Solid Fill
```js
// hex → Figma RGB (0–1 range)
function hexToFigma(hex) {
  const n = parseInt(hex.replace('#',''), 16);
  return { r: (n>>16)/255, g: ((n>>8)&255)/255, b: (n&255)/255 };
}
frame.fills = [{ type: "SOLID", color: hexToFigma("#c9a84c") }];

// rgba → include opacity
frame.fills = [{ type: "SOLID", color: {r:0.79,g:0.66,b:0.30}, opacity: 0.3 }];
```

### Linear Gradient
```js
// linear-gradient(to bottom, rgba(13,12,10,0.95) 0%, transparent 100%)
frame.fills = [{
  type: "GRADIENT_LINEAR",
  gradientTransform: [[0, 1, 0], [-1, 0, 1]], // to bottom = 90deg
  gradientStops: [
    { position: 0, color: { r:0.05, g:0.05, b:0.04, a:0.95 } },
    { position: 1, color: { r:0, g:0, b:0, a:0 } }
  ]
}];
```

### Radial Gradient
```js
// radial-gradient(ellipse 60% 70% at 60% 40%, #c9a84c18 0%, transparent 70%)
frame.fills = [{
  type: "GRADIENT_RADIAL",
  gradientTransform: [[0.6, 0, 0.6], [0, 0.7, 0.4]], // scaleX, 0, centerX / 0, scaleY, centerY
  gradientStops: [
    { position: 0, color: { r:0.79, g:0.66, b:0.30, a:0.094 } },
    { position: 0.7, color: { r:0, g:0, b:0, a:0 } }
  ]
}];
```

### Multiple Backgrounds → Stacked Fills
```js
// CSS: background-image: gradient1, gradient2; (first = topmost)
// Figma: fills array, first = topmost — same order
frame.fills = [gradient1Paint, gradient2Paint, solidBgPaint];
```

### Background Grid Pattern
```js
// CSS: background-image: linear-gradient(rgba(201,168,76,0.06) 1px, transparent 1px), ...
//      background-size: 60px 60px
// Figma: render as SVG → IMAGE fill with TILE mode
const svgGrid = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <line x1="0" y1="1" x2="60" y2="1" stroke="rgba(201,168,76,0.06)" stroke-width="1"/>
  <line x1="1" y1="0" x2="1" y2="60" stroke="rgba(201,168,76,0.06)" stroke-width="1"/>
</svg>`;
const imageHash = await figma.createImageAsync(new TextEncoder().encode(svgGrid));
frame.fills = [{ type: "IMAGE", imageHash, scaleMode: "TILE" }, solidBgPaint];
```

---

## Borders & Strokes

```js
// border: 1px solid rgba(201,168,76,0.2)
frame.strokes = [{ type: "SOLID", color: {r:0.79,g:0.66,b:0.30}, opacity: 0.2 }];
frame.strokeWeight = 1;
frame.strokeAlign = "INSIDE"; // matches CSS border-box

// border: 1px solid transparent → for hover state animation
// Set opacity: 0 on the stroke (not supported directly — use opacity on stroke paint)
frame.strokes = [{ type: "SOLID", color: {r:0.79,g:0.66,b:0.30}, opacity: 0 }];
// Hover variant: change opacity to 0.2
```

---

## Effects

### Box Shadow
```js
// box-shadow: 0 0 30px 10px rgba(201,168,76,0.3)
node.effects = [{
  type: "DROP_SHADOW",
  color: { r:0.79, g:0.66, b:0.30, a:0.3 },
  offset: { x: 0, y: 0 },
  radius: 30,
  spread: 10,
  visible: true,
  blendMode: "NORMAL"
}];

// inset box-shadow → INNER_SHADOW
node.effects = [{ type: "INNER_SHADOW", ... }];

// Multiple shadows → multiple entries in effects array
```

### Opacity
```js
// opacity: 0.6 on element
node.opacity = 0.6;

// opacity inside fill (for the fill only, not the whole node)
frame.fills = [{ type: "SOLID", color: {...}, opacity: 0.6 }];
```

### Overflow & Clip
```js
frame.clipsContent = true;  // overflow: hidden
frame.clipsContent = false; // overflow: visible (default)
```

### Border Radius
```js
frame.cornerRadius = 12;  // border-radius: 12px (all corners same)

// Different per corner:
frame.topLeftRadius    = 12;
frame.topRightRadius   = 12;
frame.bottomRightRadius = 4;
frame.bottomLeftRadius  = 4;

// border-radius: 50% on a square → circle
// Use figma.createEllipse() or set cornerRadius = width/2
```

---

## ::before / ::after Pseudo-Elements

These don't exist in DOM. Two strategies:

### Strategy A: getComputedStyle (limited — no bounding box)
```js
const cs = getComputedStyle(el, '::before');
if (cs.content !== 'none') {
  // Only gets CSS properties, not position/size
  // Only useful for simple cases: content text, color
}
```

### Strategy B: AI Vision Screenshot Diff (recommended)
```
Screenshot with pseudo → Screenshot without pseudo
→ Claude Vision → bounding boxes + visual desc
→ Create Figma frames manually
```

### Common VELA Pseudo-Elements
```js
// body::before — grain overlay (z:9999, fixed, fullscreen)
grainFrame.resize(viewportW, viewportH);
grainFrame.fills = [{ type: "IMAGE", imageHash: noiseTextureHash, scaleMode: "FILL" }];
grainFrame.opacity = 0.6;
// Place at top of layer stack

// nav::after — gradient fade (z:-1, inside nav, below nav content)
gradientFrame.name = "nav::after";
gradientFrame.fills = [linearGradientPaint]; // to bottom, bg→transparent
navFrame.insertChild(0, gradientFrame); // index 0 = bottom of nav children

// .testimonial-section::before — decorative "
quoteText.characters = "\u201C"; // curly double quote
quoteText.fontSize = 400;
quoteText.fills = [{ type: "SOLID", color: goldColor, opacity: 0.04 }];
quoteText.layoutPositioning = "ABSOLUTE";
quoteText.x = 40; quoteText.y = -40;
```

---

## Z-Index → Layer Order

```js
// Figma: children[0] = bottom, children[n-1] = top
// CSS: higher z-index = on top

// Algorithm:
function getEffectiveZ(el, parentZ = 0) {
  const z = parseInt(getComputedStyle(el).zIndex) || 0;
  return parentZ + z;
}

// Sort all elements, insert in ascending z order
sorted.forEach((item, i) => {
  parent.insertChild(i, createFigmaNode(item.el)); // i=0 = bottom
});

// VELA layer order (bottom to top):
// body background → hero sections → .hero-left (z:2) → nav (z:100) → grain overlay (z:9999)

// z-index: -1 inside parent's stacking context:
// → insert as first child (index 0) of that parent in Figma
navFrame.insertChild(0, navGradientFrame); // nav::after z:-1

// position: fixed elements → attach to root page frame, not scroll container
page.insertChild(fixedLayerIndex, navFrame);
```

---

## Animations & Interactive States

### CSS @keyframes → Static Final State
```js
// Before capturing: force all animations to their completed state
document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
// Freeze all CSS animations
document.head.appendChild(Object.assign(document.createElement('style'), {
  textContent: '*, *::before, *::after { animation-play-state: paused !important; }'
}));
// → getComputedStyle() now returns final animation values

// In Figma layer name, annotate animated elements:
// "[ANIMATED: spin 30s]", "[ANIMATED: marquee 20s linear infinite]"
```

### :hover → Figma Component Variants
```js
const componentSet = figma.combineAsVariants(
  [defaultComponent, hoverComponent],
  figma.currentPage
);
componentSet.name = "Button/Primary";

// Variant naming convention:
defaultComponent.name = "State=Default";
hoverComponent.name   = "State=Hover";

// Apply hover state properties to hoverComponent:
// - background fills: gold → gold-light
// - transform: translateY(-2px) → y position - 2
// - etc.
```
