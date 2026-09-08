# Chessplain documentation

Start with the current implementation records below. Documentation describes intent and observed source behavior; it is not proof of production operation.

| Document | Purpose |
| --- | --- |
| [September 2026 change record](CHANGES_2026-09-06.md) | Complete account of the frontend, flows, engine, billing, analytics, configuration, and documentation changes. |
| [Product](../apps/web/PRODUCT.md) | Current purpose, audience hypotheses, capabilities, pricing entitlement, and constraints. |
| [Design system](../apps/web/DESIGN.md) | Implemented colors, typography, layouts, controls, responsive behavior, and accessibility practices. |
| [Product and launch assessment](PRODUCT_REVIEW_2026-09-06.md) | Positioning, competition, monetization rationale, validation sequence, and remaining risks. |
| [Engine deployment](ENGINE_DEPLOYMENT.md) | Single-worker deployment recipe for the reported 24GB VPS, resource sizing, environment, proxy, auth/billing prerequisites, and staging acceptance checks. |
| [Verification record](VERIFICATION_2026-09-06.md) | What passed locally and what remains unverified. |

## Historical and specialist references

- [Original rebuild execution plan](../CHESSPLAIN_V3_REBUILD_EXECUTION_PLAN.md): historical work plan, not a completed-work checklist. Do not execute destructive infrastructure or migration steps merely because this file lists them.
- [August strategy](REBUILD_STRATEGY_31082026.md): historical strategy and reported metrics. Its production-data claims were not revalidated in the September work.
- [Moment prompt](MOMENT_PROMPT.md): generation guidance and historical examples. Runtime prompt code and actual board evidence determine current behavior; prose guidance does not prove factual correctness.
- [Historical report wireframe](../wireframes-report-page.html): a prior design reference; current UI is in `apps/web`.

When changing behavior, update the relevant product/design/deployment record and record verification separately. Keep hypotheses, source behavior, local checks, and production evidence distinct.
