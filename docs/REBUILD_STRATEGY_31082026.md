Using \*\*strategize\*\* to frame this rebuild. I pulled everything from your live infrastructure first — and the data changes the diagnosis. Here's the strategy.



\---



\# Chessplain Rebuild Strategy — grounded in your actual data



\## 0. What your data actually says (read this first)



I pulled Supabase, PostHog, and your live Stripe account. The evidence is brutal and clarifying:



| Fact | Number | Source |

|---|---|---|

| Total signups | \*\*324 profiles\*\* | Supabase `profiles` |

| Ever logged in after signup | \*\*128 (39%)\*\* | `login\_events` |

| Games ever persisted | \*\*0\*\* | `source\_games`, `game\_analyses`, `usage` — all 0 rows |

| Analysis errors ever logged | \*\*0\*\* | `analysis\_errors` — the pipeline never even recorded failing |

| Users active across 2+ months | \*\*11 of 392 (2.8%)\*\* | PostHog |

| Traffic | Mar 145 → Apr 118 → May 100 → Jun 46 → \*\*dead\*\* | PostHog `$pageview` |

| Real customer MRR today | \*\*$0\*\* | Stripe: 8 customers, 3 subs — the 1 active is your own account; 2 canceled |

| A paying customer's cancellation reason | \*"The analyze tool doesn't work consistently… the AI analysis tool doesn't work. \*\*This is a scam\*\*"\* | Stripe cancel comment, Feb–Mar 2026 |

| Pricing already in Stripe | $9.99/mo, $99.99/yr | `price\_1SOs7y…` |

| Platform skew | \*\*80 chess.com vs 35 lichess\*\* usernames | `profiles` |

| Channel efficiency | \~20 Reddit comments → 324 signups ≈ \*\*16 signups/comment, $0 CAC\*\* | combined |

| Your VPS | 15k-node sweep \*\*\~1.3s/game (\~45 games/min)\*\*, 87.5% blunder recall, D20 verify 0.6s/blunder | ENGINE\_BENCHMARKS.md |



\*\*The honest diagnosis:\*\* Your problem is not framing, persona, or differentiation. \*\*The core loop — paste PGN, get explanation — has never successfully run for a real user.\*\* People signed up (marketing works), linked their chess.com accounts in the rebuild (85% onboarding completion in March — onboarding worked), and then hit a broken analysis pipeline. One paid $9.99, tried 20+ times, and called it a scam. Your three uncertainties (differentiation, aha, persona) have \*\*no behavioral data behind them because nobody ever experienced the product working\*\*. The only validated facts are: (1) Reddit comments analyzing games in plain English produce signups, (2) \~3 people paid $9.99/mo for the \*promise\* of explanations without a working product, and (3) nobody retained.



This is actually good news: you're not validating a losing product — you're validating a product that was never shipped, with a distribution channel already proven and an engine pipeline already benchmarked at production scale.



\---



\## 1. The three uncertainties — proposed answers



\### Differentiation: \*\*thought-process explanation, not move-quality grading\*\*

Most likely answer: Chessplain's edge is that it explains \*\*why you made the move you made\*\* — the plan behind the mistake — and names the concept in context. Chess.com's Game Review is a \*grading tool\* (accuracy %, blunder/inaccuracy tags, paid feature) optimized for the dopamine loop of a score. Lichess gives raw engine output. Aimchess gives pattern statistics. \*\*Nobody explains the human's thinking.\*\* Your Reddit comment worked precisely because it did this: "the bishop got stuck in a passive loop," "here's what practical chances means." That's the product.



\- \*\*Assumption:\*\* beginners churn from engine output because it makes them feel stupid, not informed; they'd pay for feeling \*understood\*. Evidence is indirect (the comment's engagement, paying for the promise), so treat as hypothesis.

\- \*\*Validate in week 1–2:\*\* In concierge analyses, ship two explanation styles — (a) engine-style ("Bf4? was an inaccuracy, better was Nd2") vs (b) thought-process style ("You probably wanted to challenge the bishop…") — and count unprompted replies like "this is exactly what I was thinking." If (b) doesn't outperform (a) \~3:1 in reactions, the differentiation thesis is wrong.

\- \*\*Honest caveat:\*\* there's no technical moat — Chess.com could ship this. Your moats are: tone/brand trust from the Reddit-native style, speed of iteration, and the fact that Chess.com's review business model depends on the accuracy-score loop. Differentiation here is \*execution and voice\*, not tech. Say that to yourself every time you're tempted to add engine depth.



\### Aha moment: \*\*"It read my mind"\*\*

Most likely answer: the aha is the first time an explanation \*\*correctly names the user's intention\*\* — "You probably took that pawn because it looked free — the problem is it opens the diagonal" — and they think \*yes, that's exactly why I did that.\* The moment of being understood, not the eval graph, not the accuracy score. Secondary aha: learning a vocabulary word they'll actually use ("passive piece," "practical chances").



\- \*\*Assumption:\*\* the "you probably…" sentence is the trigger. This comes from the structure of your successful Reddit comment, not from A/B data.

\- \*\*Validate:\*\* instrument `moment\_expanded` + dwell time; in week-2 concierge, ask one question after the report: "What did you understand from this that you didn't before?" If users can't articulate a specific insight, the explanation isn't landing regardless of clicks.



\### Target persona: \*\*adult casual improvers, \~600–1200 chess.com rapid\*\*

Most likely answer: adults 20–45 who play a few rapid games a week, watch GothamChess/Building Habits, ask "why is this move bad?" on r/ChessBeginners, know piece values but not "bishop pair" (define every term inline). They want to understand, not be graded. Evidence: 80/115 platform usernames are chess.com (casual skew), the audience was r/ChessBeginners specifically, your own benchmark doc targets <1200 Elo, and the thing they paid for was \*explanations\*. Teenagers are a secondary segment (they'll use it but have no money); 1400+ players will find it too gentle — that's fine, they're not the buyer.



\- \*\*Assumption:\*\* the people who'll pay are the people who engaged on Reddit — sub-1200 adults.

\- \*\*Validate:\*\* capture chess.com username on intake → auto-pull Elo from the public API → after 30 days check which Elo band returns weekly AND clicks paywall. Optimize for whoever pays, not whoever signs up.



\---



\## 2. Product framing



> For \*\*adult casual players (600–1200 chess.com rapid) who lose games and don't understand why\*\*, Chessplain is a \*\*game review that explains your mistakes in plain English — what you were probably thinking, why it didn't work, and what to check next time\*\* — unlike \*\*Chess.com's Game Review, which grades your moves and never teaches you anything\*\*.



One-line shorthand for everything else: \*\*"Explained, not graded."\*\*



\---



\## 3. MVP scope



\### The flow (5 steps, nothing else)

1\. \*\*Land → paste PGN or type chess.com username\*\* (auto-fetch their most recent game via the public API — your users skew chess.com 80/115, and username beats paste-pgn for this crowd). No signup required for report #1. Rate-limit by IP.

2\. \*\*\~15s wait with streaming progress\*\* — eval graph renders first (your benchmarks: opening from cache \~100ms, full sweep 1.3s), moments appear as their LLM calls finish. Perceived latency ≈ solved by streaming.

3\. \*\*The report\*\* — the entire product:

&#x20;  - One-paragraph game summary: "You lost this game because…"

&#x20;  - \*\*3–5 key moments\*\*, each: board diagram at the position → your move → "\*\*You probably played this because…\*\*" → why the plan fails (one concrete line, in words) → the concept's name, defined inline → one takeaway phrased as a checkable habit ("before capturing a pawn, check what it stops defending").

4\. \*\*Email capture after the report renders\*\* ("Want it saved? Get next week's report by email") — capture \*after\* value, not before. Supabase magic link; a `profiles` row is created here.

5\. \*\*Shareable public URL per report\*\* (`/r/{id}`) with a "Analyze your game" CTA — this is your growth loop, because your Reddit channel literally worked by showing people analyses.



\### What to cut from previous versions (all built, all 0 rows)

\- The entire coaching-assignment system (`coaching\_assignments`, `assignment\_evidence`, `assignment\_events` — daily habit emails with hardcoded pattern keys). Delete.

\- Pattern tracking with 4 hardcoded pattern keys (`pattern\_progress`, `pattern\_progress\_facts`). Delete. (Recurring-pattern detection is the right \*v2 retention feature\* — but only once you have 10+ games/user, which you will detect because games will finally persist.)

\- Player-account sync subsystem (`player\_accounts` — 2 rows ever). Replace with direct chess.com username → fetch-last-game, no sync.

\- Quota reservation machinery, activation nudge emails, welcome email automation. Delete.

\- Browser-side Stockfish path. Server-side only — it's benchmarked and simpler.

\- \*\*Keep:\*\* `profiles` (slim it), `source\_games`, `game\_analyses` (it's already a queue table with status/attempts/locked\_at/next\_attempt\_at — it was designed for this and never used), Stripe products/prices as-is.



\### Freemium \& pricing

\- \*\*Free:\*\* 2 full reports/week, no card. Full report, full aha — the free tier's job is to prove the product works (your historical failure was people never getting value, so don't gate the aha).

\- \*\*Paid: $9.99/mo, $99.99/yr — reuse your existing Stripe prices.\*\* Anchor justification: Chess.com charges $6.99+/mo for a review that grades you; \~3 people already paid you $9.99 for the promise alone. Don't change the price while changing everything else; test $14.99 after you have 50 payers.

\- \*\*Paid =\*\* unlimited reports, saved game history, "pattern radar" across your games (v2 — this is the retention feature and the real reason to subscribe), deeper verification depth.

\- Cost math: engine is free (your VPS), LLM ≈ 5–7 small calls/game ≈ \*\*under $0.01/game\*\* on a Flash-class model. Free tier costs you pennies per user per month. The free tier can stay generous.



\---



\## 4. Analysis pipeline design (grounded in your own benchmarks)



\### Architecture — no new infrastructure

```

Client → API (VPS, Node) → \[Stage 1] full-game sweep → \[Stage 2] select + D20 verify → \[Stage 3] LLM explain → SSE stream to client

```



\- \*\*Queue:\*\* Postgres `FOR UPDATE SKIP LOCKED` on the existing `game\_analyses` table. It already has `status/attempts/locked\_at/next\_attempt\_at`. No Redis, no BullMQ — you have one VPS and a queue-shaped table. `ponytail:` if you ever exceed \~50 concurrent analyses, then add Redis; you won't for months.

\- \*\*Concurrency:\*\* 4 independent Stockfish 18 processes, 1 thread each, core-pinned (`taskset`), 1GB Hash each, Syzygy loaded — your own benchmark showed 4×1-thread = 3.5–4× the throughput of 1×4-thread. Idle (single user) → borrow all 4 cores for sub-second latency.

\- \*\*Caching:\*\* `analysis\_cache(fen, profile\_key) → {eval, best, pv}` table. You measured 25–40% hit rate, 92% on opening trees — openings become free. Cache key: FEN + "pass1" or "d20".



\### Stage-by-stage

1\. \*\*Sweep (Pass 1):\*\* every position, `Limit(nodes=15000)`, MultiPV 2 — \*\*\~1.3s/game\*\*, 77% best-move agreement, \*\*87.5% blunder recall\*\*, MAE 0.27 pawns. For coaching sub-1200 players this is plenty — resist the depth temptation, it's not your differentiation.

2\. \*\*Selection (Stage 2):\*\* candidates = eval swing ≥ 1.5 pawns (your own threshold), plus "had a win and let it slip" (eval ≥ +2 → ≤ +0.5), plus largest single swing as \*the\* turning point regardless of size. Dedupe moments within 3 moves of each other (keep the worst). \*\*Cap at 5, ranked by teachability\*\* — a hanging piece a 900 can see beats a subtle positional nuance. Verify finalists at Depth 20 (\~0.6s each) so the LLM never explains a hallucinated blunder. \*\*Critical reliability rule: if the pipeline fails, queue it, email the report when done — never show a dead error screen to someone who paid.\*\* The "scam" comment came from exactly that screen.

3\. \*\*Explanation (Stage 3):\*\* one LLM call per moment + one summary call. Prompt payload per moment: FEN, move played, best move + refutation line, eval before/after translated to human units ("you went from winning by a rook to dead equal"), game phase, material, the user's Elo band, and the two or three most plausible \*intentions\* behind the played move (ask the LLM to generate and pick the charitable one). Output contract per moment:

&#x20;  - Sentence 1: "You probably played {move} because…" (the mind-read — required)

&#x20;  - Sentence 2–3: why the plan fails, referencing pieces by name ("your knight on f6"), zero centipawn numbers

&#x20;  - The concept name + one-clause inline definition

&#x20;  - One takeaway as a checkable habit

&#x20;  - Hard bans: "inaccuracy," "better was," engine notation dumps, generic filler ("this was a mistake because it loses material" without saying \*why the player couldn't see it\*)

4\. \*\*Summary call:\*\* all moments + result/time control → one paragraph, "the story of why you lost this game," ending with the single habit to focus on next game.



\### Anti-generic enforcement

\- Elo-adaptive jargon: pull rapid Elo from chess.com's public API; sub-1000 gets zero undefined terms, 1000–1400 gets one-clause definitions.

\- Spot-check audit: sample 5 reports/week by hand against a rubric (Does it name an intention? Does it name a concept? Would a 900 understand it?). You are the taste layer — your Reddit comment is the gold standard; keep the best ones as few-shot examples in the prompt.

\- Prompt version column (`prompt\_version` — already in your schema). Iterate weekly on the rubric failures.



\---



\## 5. Four-week validation plan



\*\*Sequence logic:\*\* the #1 risk isn't positioning — it's delivering a working report. So week 1 is "make the core loop run," weeks 2–4 validate the framing/persona/aha hypotheses against it. Everything below uses what exists (VPS pipeline, Supabase, Stripe, PostHog).



\### Week 1 — Working report + instrumented landing page

\- Ship the 3-stage pipeline + single report page (PGN paste + chess.com username). Manual prompt-polishing allowed; automated is better.

\- Landing page with \*\*3 positioning variants\*\* (rotating or PostHog experiment, see §7 angles A/B/C). Every variant's CTA = "analyze a game free, no signup."

\- Instrument (see §6) — this time, before traffic, not after.

\- Reactivation is NOT yet. Don't email the 324 until the product demonstrably works for strangers.

\- \*\*Gate to week 2:\*\* you can run 20 real PGNs end-to-end with <5% failure, and each report passes your own rubric.



\### Week 2 — Reddit concierge, 3 hooks

\- 10–15 comments on r/ChessBeginners (and r/chess beginner threads), the proven channel. Analyze games genuinely — with the pipeline output lightly edited by you (this is honest now: you built the analyzer). Rotate the three hooks across comments and track per-hook: upvotes, replies, CTR to site, \*\*PGN submissions\*\*, and unprompted quotes.

\- Keep a spreadsheet: comment URL → visits → submissions → Elo (from username) → reactions.

\- \*\*Metrics:\*\* ≥10% of people who engage with a comment submit a game; ≥3 unprompted "this is exactly what I was thinking"-class replies; style (b) thought-process reactions ≥3× style (a) engine-style.

\- \*\*Also:\*\* 5 user interviews via Reddit DM (offer a free analysis): What did you understand that you didn't before? Would you pay $10/mo for this weekly? What did you do differently in your next game?



\### Week 3 — Payment fake-door + persona validation + reactivation

\- After a user's \*\*2nd report\*\*, show the paywall: real Stripe Checkout at $9.99 (refund anyone who pays and feels cheated — you've done this before). Measure paywall view→click and click→pay.

\- Email reactivation to the 324 profiles (Resend is already wired into your schema): honest one-liner — "Chessplain is finally what I promised: paste a game, get it explained in plain English. First one's free." Expect 5–15% reactivation of openers; these people already wanted this.

\- \*\*Metrics:\*\* ≥8% of repeat-report users click paywall; ≥40% of interviewees can name a specific change they made in their next game; reactivated users' D7 return ≥25%.



\### Week 4 — Decision gate

Go / reposition / kill, against these numbers (measured from weeks 2–3):

| Metric | Go | Reposition | Kill/stop |

|---|---|---|---|

| Landing visit → first report | ≥25% | 10–25% | <10% |

| Report reliability (no errors) | ≥95% | — | <90% = engineering, not market |

| D7 return (2nd report, unprompted) | ≥30% | 15–30% | <15% |

| Activated → paywall click | ≥8% | 4–8% | <4% |

| Qualitative "aha" rate in replies/DMs | ≥30% of threads | 10–30% | <10% |



\- \*\*Reposition options if triggered:\*\* if <1200 adults don't convert but engage → test 1200–1800 club players (r/chess, lichess crowd) with deeper tactical explanations; if engagement is high but nobody returns → the product is a toy, pivot toward the recurring-pattern retention feature immediately.

\- If \*\*go\*\*: build the account system, history, pattern radar (v2) in weeks 5–8. If \*\*kill\*\*: you spent 4 weeks and $0 infra to learn what 3 launches didn't teach you.



\---



\## 6. Metrics from day one — instrumentation and 30-day targets



Everything below goes in before week-2 traffic. Last time you had 324 users and could answer \*nothing\* about them. Never again.



| # | Metric | Instrumentation | 30-day success |

|---|---|---|---|

| 1 | \*\*Activation rate\*\* — visit → `report\_viewed` | PostHog client: `pgn\_submitted`, `report\_viewed` on report render; funnel submit→viewed catches pipeline failures too | ≥25% of visitors, ≥90% of submitters |

| 2 | \*\*Aha depth\*\* — `moment\_expanded` ≥2 or ≥60s dwell on report | capture `moment\_expanded` with index; PostHog autocapture for dwell or a `report\_engaged` event fired client-side on scroll depth | ≥50% of report viewers |

| 3 | \*\*Habit\*\* — D7 return to submit another game | `game\_submitted` with `is\_repeat: true` property; retention insight on `report\_viewed` cohort | ≥30% |

| 4 | \*\*Revenue\*\* — activated → paid | `paywall\_viewed`, `paywall\_clicked`, Stripe webhook → `subscription\_started`; person property `plan`; MRR dashboard = Stripe | ≥3% of activated users paid; ≥$100 MRR |

| 5 | \*\*Viral loop\*\* — share-link visits that submit | `report\_viewed` with `referrer\_type: 'shared'`; UTM on share URLs | ≥10% of new submissions arrive via shared reports |



\*\*Plumbing specifics:\*\*

\- Supabase: `pgn\_submitted` → insert `source\_games` + `game\_analyses` row (finally — these tables are your usage source of truth); server-side PostHog capture via Node SDK for pipeline events: `analysis\_completed` (with duration, cache hit, moments count) and `analysis\_failed` (with stage) — the zero-rows `analysis\_errors` table should also get a row on every failure.

\- Identify users at email capture: `posthog.identify(supabase\_user\_id)` with person properties `email`, `chess\_platform`, `rapid\_elo` (fetched server-side), `signup\_cohort`. Elo as a person property is what lets you validate the persona hypothesis in one query later.

\- One PostHog dashboard: the 5-step funnel (visit → submit → viewed → 2+ moments → D7 return → paid) + reliability trend. That dashboard is your weekly board meeting.



\*\*Honest note on $10k MRR:\*\* at $9.99, that's \~1,000 subscribers. Your proven channel yields \~16 signups/comment; even at 4% activation-to-pay you'd need \~1,600 comments. \*\*Comments alone cannot get you there.\*\* The plan only reaches $10k if the shareable report page itself becomes the acquisition loop (every report is a landing page for the next user) plus consistent Reddit/content presence. That's the bet embedded in this design — instrument metric #5 with that in mind. Realistic horizon at current channel economics: 6–12 months, not 6 weeks.



\---



\## 7. Positioning angles (test 3, keep what wins)



\*\*A. "Explained, not graded"\*\* \*(anti-accuracy-score; my primary bet)\*

\- Hook: "Chess.com gave you a 47%. I'll tell you why."

\- Hero: \*\*Your games, explained like a person.\*\* No accuracy score. No engine jargon. What you were thinking, why it lost the game, and what to check next time.



\*\*B. "The mind-read"\*\* \*(thought-process angle)\*

\- Hook: "It wasn't a blunder. It was a plan that almost worked."

\- Hero: \*\*Chessplain figures out why you played that move\*\* — then explains the flaw in the \*plan\*, not the move.



\*\*C. "Your three mistakes"\*\* \*(pattern angle — strongest retention hook, weakest until multi-game data exists; use as v2 positioning)\*

\- Hook: "You don't have 30 different problems. You have 3."

\- Hero: \*\*Find the three mistakes costing you rating in every game you play.\*\*



\*\*D. Reddit-native concierge tone\*\* \*(the channel that already worked — this is a comment template, not a landing page)\*

> "Ran your game through my analyzer — here's the 60-second version: your light-squared bishop did nothing after move 12 (it wasn't 'bad,' it just never got back into the game), and move 23 was the moment the draw evaporated because the rook left the back rank. The full breakdown with the board positions is at \[link] — free, no signup, takes \~15 seconds. If it's wrong anywhere, tell me and I'll fix the analyzer."



\*\*E. "For people who don't speak engine"\*\* \*(accessibility/comprehension angle)\*

\- Hook: "You just lost. You don't know why. The engine won't tell you."

\- Hero: \*\*Paste a game. Get an explanation you'll actually understand\*\* — like a patient friend with a 3200 rating.



Week 2 rotates A/B/E on the landing page and D in comments (D is non-negotiable — it's the proven variant). C gets built into the product as the pattern-radar feature and becomes positioning only once it's real.



\---



\## 8. What I don't know (and how each gets answered)



1\. \*\*Whether thought-process explanations actually drive retention, or just delight\*\* — no data exists anywhere in your systems. Weeks 2–3 answer it (D7 return + aha reply rate). If delight doesn't become habit, the honest fix is the pattern-radar feature, not better prose.

2\. \*\*Whether sub-1200 adults will pay, or whether the payers will turn out to be 1200–1800 players\*\* — 3 historical payers is not a sample. Week 3's Elo-tagged paywall clicks answer it.

3\. \*\*Whether the shareable report can carry acquisition\*\* — pure hypothesis until metric #5 has 200 reports behind it. If it can't, $10k MRR needs a content/SEO layer (mistake-pattern pages, opening-specific explanations) that this plan deliberately defers.

4\. \*\*Churn rate at any price\*\* — unknown; you've never had a working subscriber. Treat the first 50 subscribers as a paid research cohort.



\*\*This week, concretely:\*\* (1) stand up the 3-stage pipeline on london-ampere against the existing `game\_analyses` table, (2) one page: username/PGN → streaming report, (3) PostHog events from §6, (4) write the 5-moment prompt and run your own last 10 lost games through it — if reading your own reports doesn't make you want to fix something in your chess, the prompt isn't done. Everything else in this plan waits on that loop being boringly reliable.

