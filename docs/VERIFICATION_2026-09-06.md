# Local verification — 6 September 2026

## Passed

- Engine TypeScript build.
- Frontend TypeScript check and Next.js production build.
- 18 engine/contract tests across three files. The four new regression tests cover Black-side PGN interpretation, custom starting FEN and move numbers, legal sample positions/mate/alternative, and serialized report snapshots with completion left to the persistence owner.
- Browser interaction: sample Nf6, Qxf7# reply, disabled forward button at the final position, and Qe7 alternative comparison.
- Browser interaction: empty submission displays a useful error; switching to PGN reveals a side choice; Black can be selected; yearly pricing shows $99.99 billed yearly.
- Browser layout checks: no document-width overflow on homepage, PGN form, pricing, and sample report at 320px. Homepage also checked at 390px and 1440px. At 1440px the submission panel ended at approximately 773px from the top.
- Git whitespace/error check.

## Coverage limits

- The test suite uses deterministic chess facts and mocked pipeline stages; it does not run the complete live Stockfish/LLM/database pipeline.
- No live email, customer-game submission, subscription purchase, cancellation, or deployment was performed.
- Early homepage desktop and phone screenshots were visually inspected. Final capture transport repeatedly timed out or duplicated page regions. The invalid report capture is excluded from acceptance evidence. Final visual approval across every route is not claimed.
- The specialized finish-reviewer agent was unavailable. An independent general agent performed a source-only substitute review, identifying checkout-key and stale-product-documentation issues.
- That reviewer subsequently verified both findings resolved: the checkout key includes the selected price, and PRODUCT.md reflects the current flow and unmeasured performance. This is approval of those two fixes only, not complete visual or production approval.
- The mechanical design detector reported one advisory for Arial body text. Newsreader remains the display face; Arial was retained for functional interface text.
- Next.js warns about multiple lockfiles in parent directories. Build succeeds, but deployment should start from the intended repository and app roots.
- The existing 
ext lint` script is incompatible with Next.js 16. No lint pass is claimed; a proper ESLint configuration remains a separate toolchain task.

Production acceptance and fault-injection cases are listed in ENGINE_DEPLOYMENT.md. Product hypotheses and remaining risks are in PRODUCT_REVIEW_2026-09-06.md.

## Rechecked 8 September 2026

Engine build, frontend TypeScript check, Next.js production build, all 18 tests, and git diff --check passed again. The previously recorded live-service and visual-capture limitations still apply.
