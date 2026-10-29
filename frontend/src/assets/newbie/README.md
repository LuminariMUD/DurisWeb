# NEWBIE artwork

Created on 2026-10-29 with the **built-in image_gen tool** (not the CLI/API fallback)
for the [NEWBIE crash course](../../views/NewbieView.vue), following the
[Design guide](../../../../docs/DESIGN.md).

- `first-steps.webp`: 1672 × 941, original threshold/first-adventure illustration.
- `camp.webp`: 1536 × 1024, original woodland respite illustration.

Both are original decorative fantasy artwork, not game screenshots, geographical
references, or claims about specific locations/equipment. No source image was
provided. Empty alt text avoids repeating nearby prose; captions identify them
as illustrations. The hero reserves its dimensions and has high fetch priority;
the camp is lazy-loaded. Vite fingerprints both assets and loads them with the
lazy page chunk. No remote image dependency is introduced.

The generated PNG masters remain in the generation tool's local output. The
committed WebP copies preserve their pixel dimensions and were encoded using
ImageMagick at quality 84, without cropping or creative edits. Layout cropping
is CSS-only. Do not overwrite these assets for future variants without checking
the page composition.

## Exact hero prompt

```text
Use case: stylized-concept
Asset type: original panoramic hero artwork for a Duris dark-fantasy MUD beginner guide.
Primary request: A lone novice adventurer seen from behind at the threshold of an immense ancient stone gateway, looking across a mist-filled mountain valley toward a distant fortified city beneath a subtle ember-red solar eclipse. The adventurer is small against the world, wearing a travel-worn cloak, carrying a simple sword and pack. The image should evoke the first step into a dangerous text adventure, with wonder rather than gore.
Style/medium: richly detailed painterly fantasy concept art, hand-painted oil texture, elegant editorial art direction, cinematic atmospheric depth, grounded medieval materials.
Composition/framing: wide landscape 16:9; the gateway frames the scene; adventurer and warm path in the middle-right; shadowed stone and mist at the edges; readable silhouette and depth when cropped on mobile. The artwork occupies its own panel beside HTML typography.
Lighting/mood: soft bone-colored mist, muted olive-black shadows, copper and vermilion light on stone, restrained warm highlights.
Color palette: near-black ink #111310, warm bone #ece8dd, muted olive, vermilion #df583d.
Constraints: atmospheric illustration, not a game screenshot or an exact named in-game location. No text, no lettering, no logos, no UI, no watermark. No glossy game-poster typography, neon colors, or excessive particles.
```

## Exact camp prompt

```text
Use case: stylized-concept
Asset type: original companion illustration for the recovery and safe logout chapter of a Duris MUD beginner guide.
Primary request: A sheltered medieval woodland camp at twilight, a low ember fire beside a travel-worn leather backpack, a simple sheathed sword and a rolled wool blanket, with a small lantern. Ancient mossy stones and tall dark trees shelter the camp, a distant trace of warm light through mist suggests a road back to civilization.
Style/medium: richly detailed painterly fantasy concept art, hand-painted oil texture and grounded medieval materials; atmospheric, restrained editorial composition, matching a dark fantasy field guide.
Composition/framing: landscape 3:2; intimate ground-level view; pack and small fire are the visual focus, deep forest layers behind them; preserve breathing room around objects.
Lighting/mood: quiet respite, ember and lantern glow on weathered leather, cool bone-colored mist, muted olive-black shadows. Beautiful without gloss.
Color palette: near-black ink #111310, warm bone #ece8dd, muted olive, copper and vermilion #df583d.
Constraints: atmospheric illustration, not a game screenshot or exact named location. No people, no text, lettering, logos, UI, watermark or glowing magical equipment.
```
