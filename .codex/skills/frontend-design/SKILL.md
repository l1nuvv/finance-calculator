---
name: frontend-design
description: Design and implement production frontend UI for this repository without generic generated-UI aesthetics. Use for new UI or substantial visual/responsive redesigns.
---

# Frontend Design

Build interfaces that look intentionally designed for this product, not generically "AI-designed".

## Before editing

Read `docs-dev/UI_DESIGN.md` and `docs-dev/RESPONSIVE_UI.md` from the repository root. Inspect the existing frontend, typography, spacing, colors, interaction patterns, responsive behavior and the exact feature being changed.

Form a short internal design premise:

`[product/domain] for [primary user] should feel [2-3 concrete adjectives], optimized for [primary repeated task].`

For substantial visual design, also read `references/anti-slop.md` and `references/visual-verification.md`.

## Implementation principles

- Build the actual product experience first. Keep Kontur focused on managing a shared household budget; do not turn it into a marketing landing page.
- Prefer information architecture and task flow over decoration.
- Preserve the project's information density unless the affected flow is demonstrably overloaded.
- Use cards only for meaningful self-contained units; avoid nested card shells.
- Keep typography compact in application surfaces; no giant hero type in dashboards/panels.
- Preserve light/dark themes and semantic status distinctions.
- Make controls complete for keyboard, touch and changing states.
- Responsive behavior must be intentional, not merely stacked desktop UI.
- Required functionality must not depend on hover.
- Avoid new dependencies unless they materially improve the requested result.

## Mobile is required

For meaningful layout/UI changes, inspect 360, 390, 768 and 1440 px representative widths when the environment supports it.

Do not finish with accidental document-level horizontal overflow, clipped dialogs, unreachable actions, tiny touch-only controls or a broken sidebar/drawer.

## Decision rule

Do not apply a visual pattern because it is fashionable or easy to generate. Every conspicuous visual choice should have a product, content, interaction or brand reason.

Existing repository design/product documents outrank generic preferences in this skill.

## Completion

Inspect the rendered result rather than judging source code alone. Fix verified hierarchy, spacing, overflow, clipping, responsive, contrast, focus and interaction issues within scope. Do not claim a viewport or interaction was verified unless it was actually inspected.
