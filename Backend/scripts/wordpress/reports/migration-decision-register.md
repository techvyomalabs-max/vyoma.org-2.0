# WordPress → MERN Migration Decision Register

Consolidated from Sections A–J of the migration review (all read-only analysis
of `Backend/.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml`
against the current MERN project). **No import, no MongoDB writes, no
WordPress changes, no application code changes were made to produce this
document** — it is a synthesis of decisions and findings already established
in prior sections, not a new investigation.

---

## 1. Confirmed migration decisions

Items that can proceed without further business clarification.

| Source (WordPress) | Destination (MERN) | Action | Notes |
|---|---|---|---|
| `/about/` | `/about` | migrate | Content rebuild needed from Divi source (all pages need this — see §4). |
| `/contact/` | `/contact` | migrate | — |
| `/events/` | `/media/events` | **migrated** | Content-owner approved Option A (migrate real legacy events as PAST_EVENTS, remove the 6 fabricated placeholders). 2 of 3 real WordPress event records (post_id 9640, 12552) verified, prepared, and **committed to MongoDB** — commit `ad23803`. Independently confirmed live in the `vyoma_migration_dryrun` database: `pages/media.PAST_EVENTS` has exactly these 2 entries ("Rāma-Sevā-Yātrā in the USA, by 'Vyoma Sanskrit Brothers'", "Śrīmad Vālmīki Rāmāyaṇa Navāha Pārāyaṇa Pravacana Yajñaḥ"). Real event dates confirmed from the poster images themselves (not post-creation dates), posters kept as external WordPress-hosted URLs, Event 1's dead external link (`tour24.vyoma.org`, DNS failure) omitted rather than replaced. The 3rd record (post_id 13766, "Samskrta Divas 2026") remains **deliberately excluded from this batch** — its real poster content is a dateless "Sanskrit Month" blog promotion, not a calendar event; forcing it into PAST_EVENTS would require inventing a date. **Still open**: a content-owner decision on how (or whether) to represent that 3rd record. |
| `/newsletter/` | `/media/newsletter` | migrate | Current mock content is generic/demo; needs real issues. |
| `/volunteers/` | `/join-us/volunteer` | migrate | Also carries a Google Form (§7) needing a real MERN form. |
| `/csr-projects/` | `/join-us/csr-projects` | migrate | `csr-enquiry` formKey already wired and functional — only field-mapping work needed (§3). |
| `/corpus/` | `/join-us/corpus-fund` | migrate | `samrakshananidhi` ("Corpus Nidhi") page's content should be reviewed for merging in here rather than treated as separate (deferred, §2). |
| `/internships/` | `/join-us/internship` | migrate | — |
| `/compliances_registrations/` | `/credibility/compliances-registrations` | **migrated — complete, D21 resolved** | 8 docs wired and confirmed complete. A full document-level audit (not just filename/date comparison) opened and read all 7 previously-unmatched PDFs plus the 8 wired ones: all 7 unmatched files are orphaned (unlinked from any live WordPress page) and their entire content is already subsumed within the 2 wired multi-page bundle PDFs (`80g-renewal.pdf`, `12a-renewal.pdf`), which additionally contain 2025 renewal pages that exist nowhere in the WordPress export at all — MERN's compliance content is complete and more current than the legacy export. See D21 (resolved) for full detail. |
| `/collaterals/` | `/credibility/collaterals` | **migrated — all 9 tiles** | **All 9 of 9 tiles now migrated.** 3 tiles (Slip Sheet, Seva Offering Catalogue, Publications & Products Catalogue) migrated earlier; the remaining 6 (Company Presentation, Vyoma Brochure, Digital Sanskrit Language Lab Brochure, DSLL Ayurveda Brochure, Digital Sanskrit OTT, Kids Persona Brochure) re-audited, resolved, and committed via `Backend/scripts/wordpress/import/collaterals-remaining-migration.mjs --commit`. Each tile's two competing link targets were content-verified (flipbook `config.js` title/page-count, or real PDF header), not guessed from filename/date; a single correct link identified for each. **Confirmed, still-live content bugs on the old site** (not corrected by this migration, reproduced via the single correct link only): Digital Sanskrit OTT's and Kids Persona Brochure's "column" links both point at unrelated Digital Sanskrit Language Lab content (a WordPress copy-paste error) — the inner-heading link was used instead for both. **Independently re-verified post-commit by direct MongoDB query**: all 9 entries have the correct `document.url`; the 3 previously-migrated entries and all titles/descriptions/active flags/ordering are byte-identical to before; all other Credibility keys (`ANNUAL_REPORTS_ITEMS`, `SOCIAL_IMPACT_ITEMS`, `COMPLIANCES_ITEMS`, `AUDIT_REPORTS_ITEMS`, `AWARDS_ITEMS`, `CREDIBILITY_SECTIONS`, `SEO`) and the `pages/media`/`media` type-sync pair are unchanged. Separately, `DocBlocks.jsx` (shared by all Credibility document lists) was fixed to show "View" only — not a mislabeled "Download" — for flipbook/non-PDF URLs, detected by file extension; verified on the rendered `/credibility/collaterals` page: 9 View links, exactly 1 Download link (Company Presentation, the only genuine PDF), other Credibility PDF pages (Annual Reports, Audit Reports, Compliances, Social Impact) unaffected. |
| `/annual_reports/` | `/credibility/annual-reports` | **migrated** | All 4 years (FY22–FY25) migrated using the verified 2026 source files — see D22 (closed). |
| `/social-impact-report/` | `/credibility/social-impact-report` | migrate | **FY24 migrated** (the two FY24 candidates were confirmed byte-identical). **FY25 not migrated** — see D23 (narrowed, still open). |
| `/awards-recognition/` (via `awards`) | `/credibility/awards-recognition` | migrate | — |
| `/media/` | `/media` | migrate | — |
| `vidya_danam_dm` | `/donate/vidya-danam` | migrate | Confirmed via `/donors/` hub's own "Contribution for courses" link (A2). |
| `education` | *(competes with `vidya_danam_dm` for the same scheme)* | migrate (merge candidate) | Title "education-vidyadanam" independently confirms the same scheme (B1) — merge content from both, don't pick one blindly (§2). |
| `grantha-danam-2` | `/donate/grantha-danam` | migrate | No plain `grantha-danam` page exists — not a true duplicate cluster. |
| `publication` | *(competes with `grantha-danam-2`)* | migrate (merge candidate) | Title "publication-granthadanam" confirms same scheme (§2). |
| `generaldonation` | `/donate/general-donation` | migrate | — |
| `eventscontribution` | `/donate/events-and-projects` | migrate | — |
| `samskritsabhaujjeevanam` | `/donate/sabha-ujjivanam` | migrate | — |
| `sabha-fund` | *(competes with `samskritsabhaujjeevanam`)* | migrate (merge candidate) | Title "Sabha Ujjeevanam" confirms same scheme (§2). |
| `teachers` | `/donate/guru-dakshina` | migrate | Title "teachers-GuruDakshina" + `/donors/` hub's "Contribution to teachers" section (B1). |
| `scholarship-rewards` | `/donate/vidyarthi-nidhi` | migrate | Title "scholarship-vidyarthinidhi" (B1). |
| `nourishment` | `/donate/anna-danam` | migrate | Title "Nourishment-annadanam" (B1). |
| `vsp` | `/donate/bala-gurukulam` | migrate | Confirmed via `/donors/` hub's "3-Year After-School Immersive Experience" section (B1). Possible overlap with `svp` — see §2. |
| `/team/` | `/about/core-team` (via `CORE_TEAMS`) | **already fully migrated** | 71/71 people verified by exact name-match diff (A6) — no action needed beyond images. |
| `/leadership/` | `/about/leadership` (via `BOARD`/`ADVISORS`/`COMMITTEE`) | **already fully migrated** | 14/14 people verified by exact name-match diff (A6) — no action needed beyond images. |
| `timeline` ("Growth of Vyoma") | `TIMELINE_FULL` (About CMS) | **already migrated** | Phrasing match confirmed (B2). |
| `metrics` | `INPUT`/`OUTPUT`/`IMPACT` (Impact CMS) | **partially migrated — needs refresh** | Current site has a June 2026 snapshot; export shows an August 2026 snapshot with 12 of 23 figures changed, 2 anomalous (§2). |
| 7 "Home-slider" testimonials | `HOME_TESTIMONIALS` + standalone `/media/testimonials` "Featured" | **real content now present — source parity not independently verified** | MongoDB currently holds real, named entries, not demo placeholders: `TESTIMONIALS_FEATURED` has 7 real names (Late. Prof. M A Lakshmithathachar, Prof. Shrinivasa Varakhedi Ph.D, Dr. M Jayaraman, Brahmaśrī Kalaimamani Dr. Udaiyalur Kalyanaraman, Kum. Neha Anisetty, Ms. Rita Badami, Ms. Aarathi & Ms. Lakshmi), and `HOME_TESTIMONIALS` has 3 real names (a subset: Prof. Shrinivasa Varakhedi, Kum. Neha Anisetty, Ms. Rita Badami) — confirmed directly in MongoDB (`pages/home.HOME_TESTIMONIALS`, `pages/media.TESTIMONIALS_FEATURED`). **No import script under `Backend/scripts/wordpress/import/` is attributable to this data** (most likely landed via one of the broader `batch1-import.mjs`/`batch2-import.mjs` runs) — this entry records that the demo-content problem is gone, not that a verified 1:1 match against the WXR's 7 Home-slider testimonials has been confirmed. Carousel/layout decision (D32) remains open. |
| 6 "Old" testimonials | `/media/testimonials` "All Testimonials" | **real content now present — source parity not independently verified** | `TESTIMONIALS_ALL` has 6 real names (Sivam, Vasudevan Sripati, Sanath Kumar, Raj Acharya, Iragavarapu Narasimhacharya, Sudha Raghuraman), confirmed directly in MongoDB — no longer the generic demo names this register previously described. Same caveat as above: not traced to a specific migration script, so a verified match against the WXR's 6 "Old" testimonials (Section E) has not been confirmed, only that real-looking data now exists. `testimonials-teacher` page handling (D33) remains open. |
| 19 real `blog_post` items | `/media/blog` (BlogPost model) | migrate (dry-run first) | See §4 for full detail — slug cleanup required for 5 posts before import. |
| WPForms `id=8780` (csr-projects) | `csr-enquiry` formKey | migrate | Destination already functional; only field parity needs confirming (§3). |

---

## 2. Deferred business decisions

| # | Issue | Affected source | Why not technically decidable | Decision required from Vyoma | Blocks migration, or just this feature? |
|---|---|---|---|---|---|
| D1 | ~~Gallery 3-way duplicate~~ — **RESOLVED AND IMPLEMENTED** | `/gallery/`, `/gallery-2/`, `/gallery-2-2/` | Content-owner approved Option A: `/gallery-2/` (post_id 8928) is the authoritative source — it is the only one of the three linked from the old site's Primary_Main navigation, and the most recently maintained. **Migration completed and verified**: 7 real albums / 70 unique images migrated into `data.GALLERY_ALBUMS` on both `pages/media` and `media` Content documents, zero invented captions/alt text (none exist in source), source image order preserved exactly, all 8 fabricated placeholder albums removed. The page's separate "Sanskrit As Medicine" video section is preserved separately under `data.GALLERY_VIDEOS` (1 entry), not folded into the photo albums. `/gallery/` and `/gallery-2-2/` were **intentionally excluded from this migration's scope** — their 37 unique images were **not merged, not deleted from WordPress, and remain available for a possible future migration batch** if a content-owner decision later reopens this. Gallery migration implementation is complete for the approved scope. | Resolved — no longer blocks Media/Gallery |
| D2 | Donors 3-way duplicate | `/donors/`, `/donors-3/`, `/donors-2-2/` (draft) | `/donors-3/` reads as an incomplete subset, not clearly obsolete (A2) | Which is current; whether draft's donor-recognition content should be revived | Only Donate hub page |
| D3 | Where IKS 2-way (both live) | `/where-iks/`, `/where-iks-2/` | Both published simultaneously; "-2" is a superset, not confirmed as replacement (A3) | Which is intended public version; whether O-MANTRI tool itself gets rebuilt at all (depends on `search-iks.vyoma.org`, an external dependency — §7) | Only the IKS resource-index feature |
| D4 | Careers page cluster | `/careers/`, `/careers120126/` | `/careers120126/`'s own title says "Careersbackup..." but content is 7 genuinely distinct, non-overlapping roles (A5) | Are those 7 roles still open positions | Only Careers content completeness |
| D5 | Team/Leadership grouping caveat | `/team/`, `/leadership/` | Already fully migrated (§1) — no action blocked | N/A — informational only, no decision needed | Neither — resolved |
| D6 | What/Where Sanskrit page structure | `/what-sanskrit/`, `/where-sanskrit/`, draft `/where-sanskrit-3/` | Content is real and substantial; no destination decided (A7) | New dedicated pages vs. folding into `/media/resources`; which content (published vs. draft superset) is source | Only this specific content, not migration overall |
| D7 | Homepage vs New Landing | `page1-2`, `/new-landing/` | Already resolved — `/new-landing/` confirmed a 2022 "coming soon" stub, no real content (A8) | Only whether to bother redirecting a 3-year-old placeholder | Neither — resolved, see §5 |
| D8 | Donation/seva pages with no scheme match | `grama-seva`, `veda-seva`, `visheshachatra-seva`, `svp`, `vsb`/`samskritabhavanam` | These describe real programs, but no current CMS destination and unknown active status (B1) | Are these still-active programs worth building, or historical/discontinued | Only these specific programs |
| D9 | `samskritabhavanam` vs `vsb` duplicate concept | Both pages | Same building-project concept, different completeness levels, ~14 months apart (B1) | Which is authoritative if the building-fund ask is revived | Only this program |
| D10 | `svp` vs `vsp` possible overlap | `svp` (5-yr daily online patashala), `vsp` (3-yr after-school, already mapped to `bala-gurukulam`) | Different duration/format described; can't assume same program (B1) | Are these the same children's program or two different offerings | Only this program's scheme mapping |
| D11 | `samrakshananidhi` vs `/corpus/` overlap | `samrakshananidhi` ("Corpus Nidhi") | Conceptually the same as already-mapped `/corpus/` (B1) | Merge into Corpus Fund content, or keep separate | Only this content |
| D12 | `productscontribution` unmapped | `productscontribution` | No scheme match found, page also very thin (B1) | Fold into `general-donation`, build new, or retire | Only this page |
| D13 | Reference/info pages with no destination | `projects`, `roadmap` | No current CMS equivalent (B2) | Build new content, fold into existing pages/`PHASES`, or retire | Only these pages |
| D14 | `catalog` page | `catalog` | 41 characters total, never built out (B2) | Confirm safe to drop entirely | Only this page — recommend drop |
| D15 | Roadmap's "mobile apps" goal | `roadmap` | `metrics` already shows "Mobile Apps: 3" exist — this goal is likely already achieved, not upcoming (B2) | Mark complete rather than migrate as a live goal | Only `PHASES` content accuracy |
| D16 | Anomalous Impact metrics | `metrics` (August 2026 snapshot) | Teachers & Scholars decreased (136→127); Video Recording hours dropped >3× (52,351→15,860) — cannot tell if error or real (B2) | Verify against source records before trusting either figure | Blocks confident refresh of Impact stats only |
| D17 | Audit Reports CMS placement — **RESOLVED AND COMPLETED** | `/audit-reports/` (10 PDFs, FY2012-13–2021-22) | Content-owner approved a **separate, new "Audit Reports" Credibility section** (not folded into Annual Reports). **Implementation completed and committed**: public route `/credibility/audit-reports`, admin `AUDIT_REPORTS_ITEMS` section (existing `DocListForm` pattern), a 6th `CREDIBILITY_SECTIONS` tile, via `Backend/scripts/wordpress/import/audit-reports-migration.mjs --commit` — commit `9d0f294`. Independently confirmed live in the `vyoma_migration_dryrun` database: `AUDIT_REPORTS_ITEMS` has all 10 entries, `CREDIBILITY_SECTIONS` includes the 6th "Audit Reports" tile. | New 6th Credibility section (decided and implemented) | **Resolved — no longer blocks Audit Reports** |
| D18 | 2017-18 audit report link bug — **reproduced verbatim, not corrected** | `/audit-reports/` | Live page links "Audit Report 2017-18" to the 2018-19 PDF by mistake; the real 2017-18 file exists separately and is live (attachment 8914, confirmed HTTP 200) but never linked anywhere on the live page (Section C). **Decision**: per the approved "reproduce what is published" rule, the migration script preserves this mismatch exactly as WordPress currently serves it — it is NOT silently corrected. | **Still open**: should this be corrected in the new site (pointing "2017-18" at the real 2017-18 file) once migrated, or left matching the old site indefinitely? | Only this one document's link — does not block the Phase 1 migration itself |
| D19 | No audit reports after FY2021-22 | `/audit-reports/` | Page hasn't been updated in ~3 years relative to export date | Confirm whether newer audit reports exist elsewhere (wp-admin, accountant) | Only completeness of this section |
| D20 | Unexplained external links on audit page — **excluded from Phase 1 migration, not deleted from source** | `/audit-reports/` | Two blank-labeled links to `amarseva.org` attached to the 2012-13 entry, purpose unknown (Section C). **Decision for this batch**: not added to the new site's visible Audit Reports list (their meaning is undocumented); their source WXR/attachment records are untouched, not deleted. | Confirm what these are / whether they belong anywhere on the new site | Only this one page's content — does not block the Phase 1 migration itself |
| D21 | 7 unmatched registration/compliance PDFs — **RESOLVED, no additional migration required** | Compliances & Registrations | A full document-level audit opened and read all 7 unmatched PDFs plus the 8 wired ones (not just filenames/dates). Findings: 1 exact duplicate (`12AA-IT-Renewal.pdf`, id 8898, identical to `12A-IT-Registration.pdf`, id 8888 — same Document ID/URN/digital signature), and the remaining 6 are superseded historical versions or subset-bundles whose entire content is already preserved inside the 2 currently-wired multi-page bundle PDFs (`80g-renewal.pdf`, `12a-renewal.pdf`) — which also contain 2025 Form 10AD renewal pages (Reg. Nos. `AAECV2657F25BL01`/`...BL02`, valid AY 2027-28→2036-37) that exist nowhere in the WordPress export at all. **12A vs 12AA resolved**: certificate lineage is 12AA (2013, old regime) → 12A/12AB transitional Form 10AC (2021) → 12AB(1)(b) Form 10AD (2025, current). The wired entry's "IT 12AA Renewal" label is legacy terminology but is **not a migration error** — the live WordPress page itself still displays that exact heading over the same file; the underlying document is legitimate and is the most current authority on this topic anywhere. All 7 unmatched files confirmed orphaned: not linked from the live `/compliances_registrations/` page, not linked from any page/post anywhere in the WXR, each file's own WordPress attachment permalink redirects to the bare homepage. **Audit limitations preserved**: not an exhaustive full-site crawl (checked the compliances page, homepage, each file's own permalink, and a full WXR content-scan — confident, not absolutely certain, nothing else links them); the live 2026/02-hosted wired files and the Frontend's local copies differ in SHA-256 by <0.03% file size with identical page counts/sampled content, consistent with a harmless re-encode, not proven byte-identical; whether to cosmetically relabel "IT 12AA Renewal" remains a content-owner UX decision, not a data-correctness issue. | None — recommendation is to migrate none of the 7; MERN's Compliance content is already complete and more current than the legacy WordPress export | **Resolved — no longer blocks Compliances & Registrations** |
| D22 | ~~Annual Report FY22/23/24/25 version pairs~~ — **RESOLVED** | 8 PDFs (4 years × 2 uploads each) | PDF comparison opened all 8 files: FY22/FY24/FY25 pairs are equivalent duplicates (same financials, audit date, UDIN in each pair); FY23's 2026 file corrects the older "-Final" file's internally inconsistent "34 New Courses" figure (the same file's own Chairman's letter said 52) to the consistent 52 | **Closed** — all 4 years migrated using the verified 2026 source files (FY23 specifically using the corrected version) | Resolved — no longer blocks Annual Reports |
| D23 | Social Impact — **RESOLVED (document migrated). FY25's underlying registrant-count discrepancy remains documented but is NOT a migration blocker.** | FY24: `Social-Impact-Report-FY24.pdf` vs. `-FY24-1.pdf` (**resolved** — confirmed byte-identical, migrated). FY25: `Social-Impact-Report-FY25-v2.pdf` vs. `-FY25-FINAL-1.pdf` — a deeper page-by-page re-comparison (visual, not just text-extraction) found the earlier "B is missing a whole metrics section" finding was **incorrect** (a `pdftotext` extraction artifact); both files contain the same IOOI metrics, and B additionally contains more supporting material (photos, a news clipping, outreach stats, a gender chart) than A. The one genuine, unresolved conflict: both state a "cumulative registrants by March 2025" figure in an identical sentence template, but the full 5-year series disagrees for 2023–2025 (A: 71,238/87,502/1,07,305; B: 55,658/71,921/91,723) — not a one-digit typo, a real restatement of the whole series, with no textual basis in either file to reconcile them. | **New standing rule, approved**: migrating the document currently live-linked on the old WordPress site does **not** require separate content-owner approval — that approval is only needed when choosing between multiple candidates with no live-site signal to break the tie. Confirmed live-linked (both WordPress's own `et_link_options_data` and a fresh direct fetch of the live page): `Social-Impact-Report-FY25-FINAL-1.pdf` (attachment 13931), under the page's "24-25" card. **Migrated under this rule, verbatim, with NO figure correction or reconciliation** — the registrant-count conflict is preserved as-is in the migrated PDF and remains a genuinely open question for whoever owns these figures; migrating the document is not a resolution of that conflict. | FY24: resolved, migrated. **FY25: document migrated (dry-run verified — see below); the underlying registrant-figure conflict is a separate, still-open question, not blocking migration** |

**FY25 implementation status (sub-note to D23): IMPLEMENTED.** `Backend/scripts/wordpress/import/social-impact-fy25-migration.mjs` run with `--commit`; `data.SOCIAL_IMPACT_ITEMS`'s "Social Impact Report 2024-25" entry now has `document.url` = the approved September FINAL PDF (`Social-Impact-Report-FY25-FINAL-1.pdf`, attachment 13931), verbatim, no figure correction. Verified directly in MongoDB and on the rendered `/credibility/social-impact-report` page: both FY24 and FY25 now show working View/Download links; the FY24 sibling entry and every other Credibility/media data key (Annual Reports, Compliances, Collaterals, Awards, Credibility category grid, SEO) confirmed unchanged, both before and after the write. The registrant-count discrepancy (1,07,305 vs. 91,723) remains exactly as documented above — carried into the migrated PDF unresolved, not something this migration corrects.
| D24 | `vidyasthanas_the-vedas.pdf` purpose | Unlinked PDF | Filename suggests Vedic-curriculum topic; no link context, no confirmed content (F2) | Confirm purpose and whether it belongs under Media/Resources | Blocks only this one file |
| D25 | Job-description PDFs (9 files) | Various | Confirmed correctly excluded from public migration (internal HR use), but disposition not formally closed | Confirm they should stay internal-only / be discarded from any public archive | None — recommendation already made |
| D26 | Activity Reports / Monthly Bulletins — **DEFERRED, content-owner approval required.** Audited in full (read-only); see sub-note below for complete findings. Not migrated, no new section created. | 36 WordPress attachment records (34 unique document contents; 2 confirmed exact-duplicate pairs) | **No publicly linked Activity Reports archive exists anywhere** — not on the live WordPress site (no page, no nav item, no footer link), not in MongoDB, not in the Frontend/admin CMS. All 36 records have `post_parent=0` in the WXR (orphaned, never linked from any page/post, live or draft). Separately, 3 ambiguous Newsletter-adjacent orphaned files were found in the same classification bucket but are not part of this content type and not part of already-migrated Newsletter either. | Decide whether a public Activity Reports archive is worth building at all; if yes, where it should live (standalone section vs. folded into Media/Newsletter vs. new Credibility tile) | Blocks nothing currently live — **no public section exists today, so there is nothing to regress; this is a net-new feature decision, not a migration-completeness gap** |
**D26 audit findings (full detail, read-only — no migration performed):**

- **36 attachment records** in the WXR match the "Activity Report"/"Digital Sanskrit Movement" naming families (Jan 2023 → Jul 2026 upload dates). Every one is `post_type=attachment`, `wp:status=inherit`, `post_parent=0` — orphaned, confirmed by scanning all 1,654 WXR items, not referenced by any page or post anywhere in the export's history.
- **34 unique document contents** after SHA-256 dedup — **2 confirmed exact-duplicate pairs**: May 2024 (attachment ids 9675/9676) and the "Activity-Report"-named Jan 2025 pair (ids 10421/10428). A third, differently-named Jan 2025 file (id 10471, "Digital-Sanskrit-movement" naming) is confirmed **not** a duplicate of those two (different hash/size) — likely marks the point the naming convention changed.
- **All 36 files verified live**: HTTP 200, `content-type: application/pdf`, magic-byte-confirmed genuine PDFs on sampled files. No broken links, no draft/unpublished attachments among them.
- **No publicly linked archive exists anywhere** for this content: not on the live WordPress site (no page, nav item, or footer link — `/newsletter/` is the only related live page and is a separate, distinct content stream), not in MongoDB (`pages/media`/`media` Content documents checked directly — no `ACTIVITY_REPORTS`/`ACTIVITY_REPORT_ITEMS`/`MONTHLY_BULLETIN`/`BULLETIN*` key of any kind), and not in the Frontend or admin CMS (exhaustive case-insensitive grep for "activity report"/"bulletin" across `Frontend/app` and `Frontend/components` returned zero matches).
- **3 separate ambiguous Newsletter-adjacent files** were found in the same "newsletter-activity" classification bucket (48 total = 9 already-migrated Newsletter PDFs + 3 ambiguous orphans + 36 Activity Report files) but are distinct from both already-migrated Newsletter and from this Activity Reports set: `Vyoma-E-Book-Newsletter-10-years-journey-.pdf` (id 6445, an earlier/unmatched upload of the same title as an already-migrated e-book), `30-dec-NL-1.pdf` (id 10351, live/200/PDF but linked only from a blog post, never from `/newsletter/`), and `Dec-2025-3.pdf` (id 12259, live/200/PDF, 50.8MB — the live Dec-2025 Newsletter issue is actually served via a Bunny CDN flipbook, so this looks like a superseded/alternate upload). These 3 remain unresolved and out of scope for both the Newsletter migration (already complete) and any future Activity Reports migration.
- **Unresolved questions preserved, not decided by this audit**: (1) whether a public archive is worth building at all; (2) if yes, standalone section vs. folded into Media/Newsletter vs. new Credibility tile (no live-site signal favors any option, unlike every other D-item in this register); (3) which Jan 2025 file is canonical if both the duplicate pair and the differently-named file are meant to represent the same month; (4) whether the Feb 2025 naming-convention shift ("Activity-Report" → "Digital-Sanskrit-movement") reflects a real series rebrand; (5) disposition of the 3 ambiguous orphans above; (6) whether apparent monthly-cadence gaps (Aug 2025, Dec 2025, Feb 2026) mean no report was produced those months, or a report exists elsewhere not yet found; (7) the actual reporting period covered by each PDF is inferred from filename + upload date only — no PDF body was opened to confirm this as fact, consistent with this project's standing rule against asserting unverified data.
- **No new public section, CMS field, or migration script was created for this task**, per explicit instruction — this entry documents the audit only.

| D27 | Formaloo/Google Forms/Mailchimp continuation | Careers, Volunteer, Donor Form, Event signup | External dependencies still active; MERN equivalents mostly don't exist yet (Section J) | Decide whether/when to replace each with a native MERN form | See §7/§8 |
| D28 | Careers content authority | `/careers/` vs `/careers120126/` | See D4 — duplicated here since it also affects the Careers CMS extension decision (A5) | Which roles are current | Only Careers CMS completeness |
| D28a | *Addendum to D28 (Batch 3 manual verification, see §10):* native Careers-application form is blocked on resume/file storage, not on form-field complexity | The live Google Careers Form requires a resume upload (max 10MB) that WPForms 13561 never had | S3/AWS access is still unavailable (the same standing blocker as the Media module) | Decide when AWS/S3 lands whether to build the native form then, or keep using the external Google Form indefinitely | Only the native-Careers-application feature; the already-shipped `applyUrl` fallback mechanism (commit `23363ea`) is unaffected and already safe to use with any external URL, including this Google Form, once approved |
| D29 | Terms/Privacy skipped section & inconsistency | `/privacy/` (missing "3."), `/terms/` (Donation Policy misdirected link) | Source document quirks, not something to silently fix (Section I) | Confirm whether to correct or preserve verbatim | Only these two documents, and only if a legal reviewer wants changes |
| D29a | *Addendum to D29 (found during Batch 2 implementation):* Terms §21 markup/numbering inconsistency | `/terms/`, real content "Governing Law & Dispute Resolution" | Terms has real Section 21 content (Governing Law & Dispute Resolution); the source markup does not number it consistently with the surrounding sections (numbering visibly jumps 20 -> 22, since §21 is not wrapped in a numbered `<ol>` like every other section) | None — Batch 2 migration preserves this source markup/content behavior exactly; no legal or editorial correction is being made during migration | Neither — resolved, preserved verbatim; only relevant again if a legal reviewer later wants the numbering corrected |
| D30 | Panchatantra MERN stub | `how-panchatantra-teaches-without-teaching` (WP) vs. demo `how-the-pancatantra-teaches-without-teaching` (MERN) | Confirmed to be modeled on the real post but with placeholder body (Section D) | Overwrite stub with real content, or handle differently | Only this one blog post |
| D31 | 5 other demo blog posts | MERN blog | No WordPress source exists for these at all (Section D) | Decide what happens to them (delete, keep as filler, replace with new writing) | Only Blog content completeness |
| D32 | Home testimonials carousel/layout | `HOME_TESTIMONIALS` | Current grid holds 3; 7 real candidates exist — layout capacity is a UI decision, not data (Section E) | Carousel vs. curated subset | Only Home testimonial presentation |
| D33 | 6 "Old" testimonials + testimonials pages | `testimonials`, `testimonials-teacher` | No general testimonials-archive content model existed until this review found the standalone page already built (Section E) | Confirm using the "All Testimonials" section for these; confirm `testimonials-teacher` handling | Only Testimonials page completeness |

---

## 3. Manual checks required (in WordPress Admin or third-party dashboards — none performed by this review)

| # | Check | Why | Section |
|---|---|---|---|
| M1 | WPCode snippet list — name, active state, type, insertion location, purpose, for every snippet. **RESOLVED — see §11**: 3 snippets found via manual wp-admin review, all inactive. | No snippet content is in the WXR at all; only orphaned taxonomy terms exist | H |
| M2 | WPForms `id=8780` field list | Not exportable via WXR | A5, J |
| M3 | WPForms `id=13561` field list | Not exportable via WXR | A5, J |
| M4 | Formaloo form `HqwvzJFZ` field list | Hosted entirely on formaloo.net | G, J |
| M5 | Status of the 3 Google Forms (Careers, Volunteer, Donor) — still monitored/active? | Response data lives on Google's servers, invisible to this export | J |
| M6 | Mailchimp list `SlavaET|efef5f8505` — still active? | Subscriber data lives on Mailchimp's servers | J |
| M7 | Content comparison of the 7 unmatched registration/compliance PDFs against the 8 already-wired files | **RESOLVED — see D21.** All 15 PDFs opened and read; 7 unmatched files are 1 exact duplicate + 6 superseded/subset versions already fully preserved in the wired bundle PDFs; no additional migration needed | F1, F2 |
| M8 | Annual Report FY22/23/24/25 version-pair comparison (identical vs. revised) | **RESOLVED — see D22.** All 8 files opened and compared; FY22/24/25 equivalent duplicates, FY23's 2026 file corrects a real data error | F2 |
| M9 | Social Impact FY24 duplicate-pair comparison | **RESOLVED for FY24 — see D23** (confirmed byte-identical). A second, previously-undocumented pair was found for FY25 during the same comparison — materially conflicting, still open, see D23 | F2 |
| M10 | Confirm no audit reports exist for FY2022-23 onward | Page hasn't been updated in ~3 years relative to export | C |
| M11 | Investigate the 2 unexplained `amarseva.org` links on `/audit-reports/` | Purpose entirely unknown from page content | C |
| M12 | Verify the Teachers & Scholars (136→127) and Video Recording hours (52,351→15,860) anomalies against real source records | Cannot tell data-entry error vs. real change from export alone | B2 |
| M13 | Confirm `vidyasthanas_the-vedas.pdf`'s actual content/purpose | No link context, filename-only inference | F2 |
| M14 | Confirm whether `/where-iks/`'s O-MANTRI tool (dependent on `search-iks.vyoma.org`) is still operational and worth rebuilding | External service, status unconfirmed | A3, §7 |
| M15 | Confirm whether the 7 roles on `/careers120126/` are still open positions | Cannot be determined from static export content | A5 |
| M16 | Rotate/verify the embedded Meilisearch search key and "prod_secret_abc"-named analytics key found in the Where-IKS page source | Flagged as a possible live, currently-exposed credential | A3 |

---

## 4. Content to migrate

**Pages/CMS content** (destinations already exist and are confirmed, per §1): About, Contact, Media Events, Media Newsletter, Join Us Volunteer, Join Us CSR Projects, Join Us Corpus Fund, Join Us Internship, Media hub, Core Team (already done), Leadership (already done), Timeline (already done), 9 Donation scheme pages (some needing merge, see §2).

**19 Blog posts** — all real, complete content (Section D). Requires: (a) ASCII slug decisions for the 5 encoded/unusual slugs (`unveiling-the-mysteries-of-ga%e1%b9%87apati`, `edicinal-value-of-21-kinds-of-leaves-...`, `what-is-sa%e1%b9%83sk%e1%b9%9btam`, `why-sa%e1%b9%83sk%e1%b9%9btam`, `how-sa%e1%b9%83sk%e1%b9%9btam`, plus normalizing `yoga_day`'s underscore); (b) new SEO metadata for the 16 posts that lack Rank Math data; (c) resolving the Panchatantra stub overlap (D30) before or during import.

**Testimonials** — 7 Home-slider + 6 Old (Section E), replacing all current MERN placeholder testimonials, pending the layout decision (D32).

**Credibility documents** — Compliances & Registrations (**migrated, complete** — D21 resolved; the other 7 candidate PDFs are confirmed duplicates/superseded content, not a migration gap), Annual Reports (**migrated, all 4 years** — D22 resolved), Social Impact Reports (**migrated, FY24 + FY25** — D23 resolved, document-level; underlying FY25 registrant-figure discrepancy remains open but is not a migration blocker), Collaterals (**migrated, all 9 of 9 tiles**), Audit Reports (**migrated, all 10 files, committed** — D17 resolved).

**Donation content** — 9 scheme pages' descriptive content (some as merges, see §1/§2), the 3 Razorpay Payment Links found on `/donors/` (informational — confirms real historical payment activity, not something to migrate as code).

**SEO metadata** — Rank Math data exists only for 3 of 19 blog posts; the rest need fresh metadata. No page-level Rank Math data was found set on most pages reviewed (e.g., Privacy/Terms had none at all).

**Redirects** — see §6.

**Other confirmed content**: the `TIMELINE_FULL`/`PHASES` cross-references from `roadmap`/`timeline` (partially done), the Privacy Policy and Terms & Conditions (Section I — fully portable as static text, no technical blockers, pending only the internal-route-creation work itself).

---

## 5. Content NOT to migrate

*(Only including items with a confirmed, established basis — nothing here reclassifies still-open material from §2.)*

- **Obsolete drafts**: Magazine 2 (id 7630 — 100% widget config, no text), CareersBackup (careers-backup — pure subset of `/careers120126/`), testpage (17 characters, always empty).
- **New Landing** (`/new-landing/`) — confirmed a one-time 2022 "coming soon" placeholder with no reusable content (A8).
- **Redundant blog index pages** — `/blog/`, `/blog-2/`, `/blogs/` — confirmed to contain no unique copy, CTA, or layout content beyond bare listing widgets; the real 19 blog posts are entirely unaffected (A4).
- **70 JS + 60 HTML orphaned flip-book assets** — confirmed via metadata investigation to belong to 2 self-hosted flip-book exports that the live site does not actually reference anywhere (its real flipbooks are served from an external CDN instead) (Section G).
- **Stale note, corrected**: this entry previously described `HOME_TESTIMONIALS`, `TESTIMONIALS_FEATURED`, and `TESTIMONIALS_ALL` as demo content needing replacement. That is no longer accurate — MongoDB now holds real, named entries in all three (see §1), not generic placeholders. Source parity against the WXR's specific 7 Home-slider + 6 Old testimonials has not been independently verified in this register (no attributable migration script found), so this is recorded as "demo content is gone," not as a proven completed migration.
- **MERN placeholder/demo content still confirmed as needing replacement**: all 6 current MERN blog posts' placeholder body text (`"Full post content is being finalized..."`) — confirmed demo content with no real-WordPress counterpart (except the Panchatantra one, which is being *replaced with* real content, not simply discarded — see D30).
- **Job description PDFs (9 files)** — confirmed correctly out of public-site scope; internal HR use only (F1).
- **`catalog` page** — 41 characters, never built out (D14 confirms this as a near-certain drop, though formally still listed once in §2 for your final sign-off).

---

## 6. Redirect register

*(Candidates only — none created.)*

**Confirmed/high confidence:**
| Old path | New path |
|---|---|
| `/about/` | `/about` |
| `/contact/` | `/contact` |
| `/events/` | `/media/events` |
| `/newsletter/` | `/media/newsletter` |
| `/volunteers/` | `/join-us/volunteer` |
| `/csr-projects/` | `/join-us/csr-projects` |
| `/corpus/` | `/join-us/corpus-fund` |
| `/internships/` | `/join-us/internship` |
| `/compliances_registrations/` | `/credibility/compliances-registrations` |
| `/collaterals/` | `/credibility/collaterals` |
| `/annual_reports/` | `/credibility/annual-reports` |
| `/social-impact-report/` | `/credibility/social-impact-report` |
| `/awards/` | `/credibility/awards-recognition` |
| `/media/` | `/media` |
| `/team/` | `/about/core-team` |
| `/leadership/` | `/about/leadership` |
| `/testimonials/` | `/media/testimonials` |
| `vidya_danam_dm`, `grantha-danam-2`, `generaldonation`, `eventscontribution`, `samskritsabhaujjeevanam`, `teachers`, `scholarship-rewards`, `nourishment`, `vsp` | respective `/donate/<scheme>` pages |
| `/terms/` | `/terms` (once built) |
| `/privacy/` | `/privacy` (once built) |
| 19 blog post slugs (14 already-clean + 5 pending §2 ASCII decision) | `/media/blog/<slug>` |
| `/blog/`, `/blog-2/`, `/blogs/` | `/media/blog` |
| `/new-landing/` | `/` (low priority, see below) |

**Pending destination/business decision:**
| Old path | Depends on |
|---|---|
| `/gallery/`, `/gallery-2/`, `/gallery-2-2/` | D1 |
| `/donors/`, `/donors-3/`, `/donors-2-2/` | D2 |
| `/where-iks/`, `/where-iks-2/` | D3 |
| `/careers/`, `/careers120126/` | D4 |
| `/what-sanskrit/`, `/where-sanskrit/`, `/where-sanskrit-3/` | D6 |
| `education`, `publication`, `sabha-fund` | D-merge decisions in §1/§2 |
| `/audit-reports/` | D17 (destination depends on new-section-vs-fold-in decision) |
| `grama-seva`, `veda-seva`, `visheshachatra-seva`, `svp`, `vsb`/`samskritabhavanam`, `samrakshananidhi`, `productscontribution` | D8–D12 |
| `/projects/`, `/roadmap/` | D13 |
| `testimonials-teacher` | D33 |

**Low priority:**
| Old path | Reason |
|---|---|
| `/new-landing/` | 3-year-old placeholder, minimal real-world traffic risk |
| `/catalog/` | Recommended drop (D14), 41 characters of content |
| Individual newsletter/activity-report PDFs (48 files) | Only worth redirecting if the archive itself gets built (D26) |
| Job-description PDF direct links (9 files) | Never meant to be public-facing |

---

## 7. External dependencies

| Dependency | Where found | Status/notes |
|---|---|---|
| **Razorpay hosted Payment Links** | 3 links on `/donors/` (`rzp.io/l/...`) | Real, working payment links found in export; confirms real historical Razorpay usage predating this project's own Razorpay Checkout integration. Not modified, not tested, per standing instruction. |
| **search-iks.vyoma.org / O-MANTRI (Meilisearch)** | `/where-iks/`, `/where-iks-2/` | External service backing the embedded search widget; operational status unknown (M14). Contains an embedded search-key and an "prod_secret_abc"-named key needing rotation review (M16). |
| **WPForms** | `csr-projects` (`id=8780`), `careers` (`id=13561`) | Field configs not in export (M2, M3); one destination already partially built (`csr-enquiry`). |
| **Formaloo** | `careers`, `careers120126`, `careers-backup` (slug `HqwvzJFZ`) | Fully external, no MERN equivalent yet (M4). |
| **Google Forms** | 3 distinct forms: Careers apply-now (`careers`), Volunteer sign-up (`page1-2` homepage + `volunteers`), Donor Form (`donors-2-2` draft) | All external, all found live in current content, response data entirely outside this export (M5). |
| **Mailchimp** | `csr-main` (draft), list `SlavaET|efef5f8505` | External, status unknown (M6). |
| **WordPress-hosted legal URLs** | Footer's `Privacy`/`Terms` links currently point at `https://vyoma.org/privacy/` and `https://vyoma.org/terms/` (confirmed in `navConfig.js`, by explicit prior project decision) | Hard dependency — these break if WordPress is retired before internal `/privacy`/`/terms` routes exist (Section I). |
| **WordPress media URLs** | All 104 PDFs + 1,153 images + other media, still hosted at `vyoma.org/wp-content/uploads/...` | Every already-wired document (registrations, etc.) that hasn't been re-hosted locally still ultimately traces back to a WordPress-hosted original; full independence requires migrating actual files, blocked on S3/AWS access (D6 in the original architecture plan). |
| **digitalsanskrit.b-cdn.net / vyomalabs-lms.b-cdn.net (Bunny CDN)** | `newsletter` and `collaterals` pages' real flipbook embeds | External CDN already in use for the site's *actual* live flipbooks (distinct from the orphaned WordPress-hosted flipbook files found in Section G) — not something this project controls. |
| **sanskritfromhome.org, digitalsanskritguru.com** | Linked from Privacy Policy as sister sites | External, sister-site relationship, not something to migrate, just to be aware of. |

---

## 8. Pre-import blockers

### A. Blockers before ANY MongoDB dry-run import
1. **Persistent MongoDB instance** must exist — current backend runs on `mongodb-memory-server`, which wipes on every restart (a standing, pre-existing project constraint, not new to this review).
2. **Final ASCII slug decisions for the 5 encoded blog posts** (§4) — the `BlogPost` model's `SLUG_RE` will hard-reject percent-encoded or Unicode slugs, and slugs are locked after first publish, so this must be right before import, not fixed after.
3. **Migration mapping freeze** — enough of §1/§2's decisions need to be settled that the import script has a stable target structure to write into (doesn't require *every* §2 item resolved, just enough that a dry-run has somewhere concrete to write each piece of content).

### B. Blockers only for specific content/features
- Audit Reports — **resolved** (D17 closed, all 10 files migrated and committed, `9d0f294`).
- Compliances & Registrations — **resolved** (D21 closed, M7 resolved; the 7 candidate PDFs are confirmed duplicates/superseded, no migration needed).
- Annual Reports — **resolved** (D22 closed, M8 resolved, all 4 years migrated). Social Impact Reports — **resolved, document-level** (D23 closed, both FY24 and FY25 migrated); the underlying FY25 registrant-figure discrepancy remains a separate, still-open content question, not a migration blocker.
- Careers content/forms — blocked on D4/D28, M2/M4/M5.
- Donation scheme pages needing merge — blocked on the education/vidya_danam_dm, publication/grantha-danam-2, sabha-fund/samskritsabhaujjeevanam merges (§1/§2).
- Home testimonials layout — blocked on D32 (data itself is no longer blocked — real content already present, see §1).
- Team/Leadership/Timeline/Events/Audit Reports — **not blocked**, already fully migrated.

### C. Items that can safely be resolved after the first dry run
- All of §3's manual checks (M1–M16) — none of them prevent a first dry-run of the content that's already unambiguous (Blog, Team, Leadership, Timeline, the confirmed-scheme donation pages, About/Contact/Media/Join-Us pages).
- Redirect creation (§6) — deliberately last in the original phase plan, after all duplicate-cluster and destination decisions are final.
- Media/S3 migration — entirely blocked on AWS access, independent of everything else here.
- WPCode replication (M1) — **RESOLVED, see §11**: manual review found all 3 snippets inactive; nothing requires replication before WordPress retirement.

---

## 9. Recommended next phase

Exact safe sequence from here:

1. **Resolve the "before ANY dry-run" blockers (§8A)** — set up a persistent MongoDB instance (or confirm one is already planned), and get the 5 blog-slug decisions finalized (a short, contained decision, not requiring the rest of §2).
2. **Migration mapping freeze** — lock in a written mapping document (this register, updated) covering at minimum: the 19 blog posts + slugs, the 13 testimonials, the confirmed-scheme donation pages, and the already-migrated Team/Leadership/Timeline content — enough for a meaningful first dry run without waiting on every §2 item.
3. **Dry-run import** — following this project's own established pattern (`import/` scripts support `--dry-run`, reporting what would change without writing anything — per the `Backend/scripts/wordpress/README.md` migration order this project already defined). Scope the first dry run to the content frozen in step 2 only.
4. **Validation** — reconcile dry-run counts against this register's §4 content-to-migrate list; investigate any mismatch before proceeding to a real write.
5. **Real import of the frozen content**, then iterate: resolve §2 decisions in batches (e.g., all donation-scheme merges together, then Credibility documents together, then Careers), running a fresh dry-run → validate → import cycle for each batch rather than waiting for every open decision to close at once.
6. **Manual checks (§3) in parallel** — none of these block the above, so they can run alongside steps 2–5 whenever convenient; feed their answers into the next batch's mapping.
7. **Redirect creation** — only once the specific content it targets has actually landed in MERN (not before), using the confirmed/high-confidence list in §6 first, then the pending-decision list as those decisions close.
8. **Media/S3 migration** — remains blocked until AWS access lands, independent of the above; the media inventory from Sections F/G is already prepared for that day.
9. **WPCode replication (RESOLVED, see §11 — nothing to replicate) and legal-route creation (Privacy/Terms + footer link flip, already completed in Batch 2)** — these were about *retiring WordPress safely*, not about the MERN migration itself; both are now closed.

---

## 10. Careers application mechanism — verified findings (Batch 3)

Manually verified in wp-admin and live browser sessions (fields/status only — no submission/entry data was ever opened). Supersedes the earlier read-only WXR-only inference on this topic; recorded here as the authoritative account.

**Mechanism status on the authoritative `/careers/` page** (post_id 11687, published 2026-01-08, last modified 2026-08-24 — the most recently touched page in the Careers cluster):
- **Formaloo** (`data-formz-slug="HqwvzJFZ"`) — present in the markup but its wrapping Divi row and text module both carry `disabled="on"` / `disabled_on="on|on|on"` (all breakpoints). **Disabled.**
- **WPForms 13561** — present in the markup, inside the same disabled `#career-form`-anchored row as Formaloo. **Disabled.**
- **Google Form** (`docs.google.com/forms/d/e/1FAIpQLSfwop69b6299vzxrqer4h-GGZBmbzOq5nHk4uz59R8Z6LlJ3Q/viewform`) — not disabled, wired directly to the "Apply now" button repeated across every active role row. **The active application mechanism**, confirmed reachable live from the real Apply now CTA.

**Verified live Google Form fields** ("Career Application Form - Vyoma Labs"):
1. Full Name — required
2. Email Address — required
3. Contact Number — required
4. Job or Internship? — required (Full time Job / Internship)
5. Department of interest — required (Technology / Linguist / E-learning & Video Editing / Sales & Marketing / PMO office / HR & Finance)
6. Tell us briefly about yourself — required
7. LinkedIn or Profile Link, if any — required
8. **Upload Resume — required, 1 file, max 10MB**

**Department options match WPForms 13561 exactly**, field-for-field, confirming the Google Form is a direct successor to (not a redesign of) WPForms 13561's field design — the sole functional addition is the required resume upload, which WPForms 13561 never had.

**Role context is not transmitted to the Google Form automatically.** All 11 "Apply now" buttons across every role row point to the byte-identical URL with no query string or prefill parameters — applicants reach one shared, generic form and must manually re-select "Job or Internship" and "Department of interest" themselves; the form has no way to know which role's Apply button was clicked.

**One shared Google Form URL for every role matches the authoritative page's actual live behavior** — this was not a migration simplification to invent; it is how `/careers/` itself already works today.

**Native `careers-application` form — reclassified**: READY DESIGN / **BLOCKED IMPLEMENTATION**. The field design (name, email, contact number, job/internship select, department select, about-yourself textarea, LinkedIn link) is fully specified and ready whenever it's built. Implementation is blocked specifically on the required resume upload — no file-upload/multer/S3-backed storage exists anywhere in the current backend, and AWS/S3 access remains unavailable (same standing dependency as the Media module, D6 in the original architecture plan). This specification is preserved here for whenever that dependency clears, rather than being re-derived from scratch.

**Current `applyUrl` behavior (commit `23363ea`, reviewed, not modified)** remains the safest available mechanism: a role with a non-blank `applyUrl` opens that URL directly (new tab); a role with a blank `applyUrl` falls back to the existing generic Careers contact modal. No code change was needed to adopt the verified Google Form URL.

**Update — published.** The shared, verified Google Careers Form URL has now been published as `applyUrl` for exactly 11 MERN career roles with confirmed-active WordPress Apply paths: Executive Assistant to the CEO, AV Engineer, Motion Graphics & Video Creator, BCP Network Engineer, Manager Academic Affairs & Curriculum, Linguist, Senior Linguist, E-Learning Administrator, Learning Path Counsellor, GM Operations, and Director Strategy — all 11 using the identical URL. PMO Lead and UI/UX Designer remain blank: PMO Lead because its WordPress Apply path was explicitly disabled (Divi `disabled="on"`/`disabled_on="on|on|on"`, pointing at a dead `#career-form` anchor, not the live form); UI/UX Designer because its active wiring on the authoritative page could not be confirmed. The update was performed through the normal `pages/join-us` CMS Save Draft + Publish workflow (the existing admin content API, not a direct database write) — no application-code change was needed, and `seedData/joinUs.js` was **not** modified with the production Google Form URL; the value lives only in the published MongoDB Content document. Native `careers-application` remains READY DESIGN / **BLOCKED IMPLEMENTATION**, still blocked on the resume/file-storage dependency (§D28a).

---

## 11. WPCode / sitewide custom-script manual review — verified findings

Manually verified in wp-admin (WPCode → All Snippets) — resolves M1. No snippet was activated, deactivated, edited, or saved during this review; this is a read-only account of what exists. No credential/key/token values are recorded here, per standing instruction.

**Result: WPCode → All Snippets contains exactly 3 snippets. All 3 are INACTIVE.**

| ID | Name | Type | Location | Status | Purpose | Classification |
|---|---|---|---|---|---|---|
| 12784 | Untitled Snippet | JavaScript | Site Wide Header | Inactive | Custom DigitalSanskrit MeiliSearch integration and search analytics — connects to `search-staging.digitalsanskrit.com`, searches DigitalSanskrit indexes, renders live search results with genre filtering, sends analytics to `analytics.digitalsanskrit.com`. Targets DigitalSanskrit infrastructure, not Vyoma.org. | **OBSOLETE / WORDPRESS-ONLY** for this migration — do not migrate to MERN. **Contains API-key/credential-style values; must not be reused anywhere without a security review first.** (No credential value is recorded here or anywhere in this register.) |
| 12783 | Completely Disable Comments | PHP | Run Everywhere | Inactive | Disables/hides the WordPress comments/trackbacks subsystem and its wp-admin UI. | **OBSOLETE / WORDPRESS-ONLY** — no MERN equivalent needed; MERN has no WordPress-style comments system. |
| 12782 | Display a message after the 1st paragraph of posts | Text | Insert After Paragraph | Inactive | A simple promotional "subscribe" message inserted after each post's first paragraph. | **OBSOLETE / WORDPRESS-ONLY** — do not migrate. |

**Overall conclusion**: 3/3 snippets are inactive. No active WPCode snippet supplies GA4, Google Tag Manager, Meta/Facebook Pixel, Microsoft Clarity, cookie/consent scripts, verification tags, schema injection, or any other active site-wide header/footer functionality. Cross-referenced against a read-only MERN codebase inventory (same conclusion independently): none of these capabilities exist in MERN either — but since no *active* WordPress dependency was found for any of them, their absence is not evidence of a migration gap. **WPCode is not a cutover blocker.** Any future analytics/tracking/consent requirement should be treated as a new, explicit product requirement to scope and build, not as a hidden WordPress dependency that must be "ported."
