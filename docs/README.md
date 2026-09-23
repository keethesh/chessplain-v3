# Chessplain documentation

Start at the [root README](../README.md) — it covers what this is, how to run
it, and where things stand. This index is only for finding the deeper documents.

Documentation describes intent and observed source behavior. It is not proof of
production operation.

## Live documents

| Document | Purpose |
| --- | --- |
| [Product](../apps/web/PRODUCT.md) | Purpose, audience hypotheses, capabilities, pricing entitlement, constraints. **Wins when documents disagree about product intent.** |
| [Design system](../apps/web/DESIGN.md) | Implemented colors, typography, layouts, controls, responsive behavior, accessibility. |
| [Product and launch assessment](PRODUCT_REVIEW.md) | Positioning, competition, monetization rationale, validation sequence, remaining risks. |
| [Launch checklist](LAUNCH_CHECKLIST.md) | Ordered pre-launch steps with current VPS and Cloudflare Workers evidence, remaining account-owner actions, and known limits. **Start here when deploying.** |
| [Engine deployment](ENGINE_DEPLOYMENT.md) | VPS deployment recipe, current production topology, resource sizing, environment, auth/billing prerequisites, and staging acceptance checks. |
| [Implementation plans](../plans/README.md) | Closed implementation plans retained as historical records; not current launch status. |
| [Analysis quality roadmap](ANALYSIS_QUALITY_ROADMAP.md) | Implemented analysis-quality changes, benchmark results, current model choice, and remaining work. |
| [Moment prompt](MOMENT_PROMPT.md) | Runtime prompt contract, generation guidance, and examples. Runtime prompt code and board evidence determine actual behavior. |

## Archive

`archive/` holds finished-state records: the September change log, the local
verification record, the original v3 rebuild execution plan, and the August
strategy document. They are history, not instructions — do not execute
infrastructure or migration steps because an archived plan lists them.

## Convention

When changing behavior, update the relevant product/design/deployment record and
record verification separately. Keep hypotheses, source behavior, local checks,
and production evidence distinct.
