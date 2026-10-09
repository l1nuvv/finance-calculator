# Visual verification

Use for visually important or responsive changes.

## Required representative viewports

When browser tooling is available, inspect at least:
- 360 x 900;
- 390 x 900;
- 768 x 900;
- 1440 x 900.

Use realistic content, including long labels/status text when affected.

## Verify

- no accidental document-level horizontal overflow;
- intended horizontal scrolling stays scoped to its component;
- no text/control clipping or overlap;
- drawer/navigation opens, closes and remains reachable;
- topbar/search/global actions remain usable;
- touch targets are reasonable on narrow layouts;
- no required action depends on hover;
- keyboard focus remains visible;
- dialogs, menus and form controls stay inside viewport;
- loading/error/success/dynamic text does not break layout;
- images/visual media use intentional fit/crop if introduced;
- reduced-motion behavior remains respected.

## Fix priority

1. broken or inaccessible interaction;
2. overflow, overlap, clipping or unreadable contrast;
3. responsive/navigation defects;
4. incorrect hierarchy/layout;
5. inconsistent spacing/type/control treatment;
6. decorative polish.

Do not claim a viewport was verified if it was not actually rendered/inspected.
