# Anti-slop design reference

Use this as a review filter, not as a replacement house style.

## Reject generic generated-UI defaults

Unless the product clearly calls for them, avoid:
- purple/blue gradients as automatic identity;
- glowing blobs/orbs/bokeh/aurora backgrounds;
- glassmorphism added only to look "premium";
- generic dark navy/slate + cyan/purple SaaS palettes;
- excessive rounded rectangles;
- cards nested inside cards;
- every section rendered as a floating card;
- bento grids without an information-architecture reason;
- giant application headlines that consume the first viewport;
- excessive empty space that lowers useful information density;
- pill-shaped controls for everything;
- decorative "AI powered", "smart", "live", "pro" badges without real state;
- tiny eyebrow labels above every heading;
- fake analytics/testimonials/activity/customer logos;
- marketing copy explaining what the working UI already makes clear;
- repeated icon + heading + paragraph feature tiles as filler;
- emoji as interface iconography when a real icon/control is available;
- arbitrary doodles or illustrations in place of useful product content;
- borders + shadows + tinted surfaces all competing on every component;
- animation that exists only to signal polish.

Do not fix slop by swapping it for a different generic visual trend. Derive choices from the shared-budget/product task.

## Composition

Prefer one clear page structure over a collection of individually styled boxes. Establish hierarchy with position, spacing, type weight/scale, surface change and a restrained accent system.

Use alignment aggressively. Repeated edges and baselines usually create more polish than extra decoration.

Keep a clear primary action. Reduce visual weight on secondary actions rather than emphasizing everything.

## Copy

Write interface copy like a product, not a pitch deck.

Prefer concrete state/action language such as:
- `Следующее действие`
- `3 пункта не закрыты`
- `Синхронизировано`
- `Нет результатов по фильтру`

Avoid generic marketing filler unless explicitly requested.

Never invent product facts, progress, testimonials or credibility signals.

## Final anti-slop pass

Ask:
1. Could the result plausibly be an unrelated AI-generated SaaS demo?
2. Which choices are specific to this shared household budget product?
3. Is any card/gradient/glow/badge/oversized heading/animation present without a functional reason?
4. Is important working content visible before decorative content?
5. Can repeated workflows be completed quickly without explanatory fluff?
6. Does the phone layout remain a first-class interface rather than a damaged desktop layout?

If (1) is yes, revise before adding more polish.
