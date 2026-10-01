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
| `/events/` | `/media/events` | migrate | — |
| `/newsletter/` | `/media/newsletter` | migrate | Current mock content is generic/demo; needs real issues. |
| `/volunteers/` | `/join-us/volunteer` | migrate | Also carries a Google Form (§7) needing a real MERN form. |
| `/csr-projects/` | `/join-us/csr-projects` | migrate | `csr-enquiry` formKey already wired and functional — only field-mapping work needed (§3). |
| `/corpus/` | `/join-us/corpus-fund` | migrate | `samrakshananidhi` ("Corpus Nidhi") page's content should be reviewed for merging in here rather than treated as separate (deferred, §2). |
| `/internships/` | `/join-us/internship` | migrate | — |
| `/compliances_registrations/` | `/credibility/compliances-registrations` | migrate | Already partially wired (8 docs); 7 additional registration PDFs need reconciliation (§3). |
| `/collaterals/` | `/credibility/collaterals` | migrate | 8 candidate PDFs identified, ready to wire (F1 §5). |
| `/annual_reports/` | `/credibility/annual-reports` | migrate | 8 candidate PDFs (4 years × 2 versions each) — version choice deferred (§2, §3). |
| `/social-impact-report/` | `/credibility/social-impact-report` | migrate | 4 candidate PDFs, 1 duplicate pair to resolve (§3). |
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
| 7 "Home-slider" testimonials | `HOME_TESTIMONIALS` + standalone `/media/testimonials` "Featured" | **replace placeholder** | All 7 have images; current 3 Home entries are confirmed demo (Section E). Carousel/layout decision deferred (§2). |
| 6 "Old" testimonials | `/media/testimonials` "All Testimonials" | **replace placeholder** | No images on any of the 6 (Section E). |
| 19 real `blog_post` items | `/media/blog` (BlogPost model) | migrate (dry-run first) | See §4 for full detail — slug cleanup required for 5 posts before import. |
| WPForms `id=8780` (csr-projects) | `csr-enquiry` formKey | migrate | Destination already functional; only field parity needs confirming (§3). |

---

## 2. Deferred business decisions

| # | Issue | Affected source | Why not technically decidable | Decision required from Vyoma | Blocks migration, or just this feature? |
|---|---|---|---|---|---|
| D1 | Gallery 3-way duplicate | `/gallery/`, `/gallery-2/`, `/gallery-2-2/` | Content differs materially; no automatic winner (A1) | Which gallery (if any) is authoritative | Only Media/Gallery |
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
| D17 | Audit Reports CMS placement | `/audit-reports/` (10 PDFs, FY2012-13–2021-22) | No "Audit Reports" section exists in Credibility CMS at all (Section C) | New 6th Credibility section, or fold into Annual Reports | Blocks this content only |
| D18 | 2017-18 audit report link bug | `/audit-reports/` | Live page links "Audit Report 2017-18" to the 2018-19 PDF by mistake; the real 2017-18 file exists separately (Section C) | Confirm correcting this when migrated | Only this one document's link |
| D19 | No audit reports after FY2021-22 | `/audit-reports/` | Page hasn't been updated in ~3 years relative to export date | Confirm whether newer audit reports exist elsewhere (wp-admin, accountant) | Only completeness of this section |
| D20 | Unexplained external links on audit page | `/audit-reports/` | Two blank-labeled links to `amarseva.org` attached to the 2012-13 entry, purpose unknown (Section C) | Confirm what these are / whether safe to drop | Only this one page's content |
| D21 | 7 unmatched registration/compliance PDFs | Compliances & Registrations | 3 upload waves (Nov 2023/Dec 2024/Feb 2026) suggest a genuine renewal history, not simple duplicates; 12A vs 12AA may be different legal provisions entirely (F1, F2) | Confirm which certificate is current per type; confirm 12A/12AA relationship | Blocks only the *completeness* of this already-partially-migrated section |
| D22 | Annual Report FY22/23/24/25 version pairs | 8 PDFs (4 years × 2 uploads each) | 2025-02 "-Final" vs. 2026-06 batch-uploaded — pattern suggests the June batch may be a deliberate re-upload for this migration, but not confirmed (F2) | Confirm which version is authoritative per year | Blocks Annual Reports content only |
| D23 | Social Impact FY24 duplicate | `Social-Impact-Report-FY24.pdf` vs. `-FY24-1.pdf` | Both 2026-02, 36 attachment-IDs apart — can't confirm identical vs. revised without opening files (F2) | Confirm which is authoritative | Blocks Social Impact Report content only |
| D24 | `vidyasthanas_the-vedas.pdf` purpose | Unlinked PDF | Filename suggests Vedic-curriculum topic; no link context, no confirmed content (F2) | Confirm purpose and whether it belongs under Media/Resources | Blocks only this one file |
| D25 | Job-description PDFs (9 files) | Various | Confirmed correctly excluded from public migration (internal HR use), but disposition not formally closed | Confirm they should stay internal-only / be discarded from any public archive | None — recommendation already made |
| D26 | Newsletter/activity-report archive (48 PDFs) | Various | No CMS structure exists for this volume of content (F1) | Decide whether a public archive is worth building at all | Only if pursued — otherwise no blocker |
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
| M1 | WPCode snippet list — name, active state, type, insertion location, purpose, for every snippet | No snippet content is in the WXR at all; only orphaned taxonomy terms exist | H |
| M2 | WPForms `id=8780` field list | Not exportable via WXR | A5, J |
| M3 | WPForms `id=13561` field list | Not exportable via WXR | A5, J |
| M4 | Formaloo form `HqwvzJFZ` field list | Hosted entirely on formaloo.net | G, J |
| M5 | Status of the 3 Google Forms (Careers, Volunteer, Donor) — still monitored/active? | Response data lives on Google's servers, invisible to this export | J |
| M6 | Mailchimp list `SlavaET|efef5f8505` — still active? | Subscriber data lives on Mailchimp's servers | J |
| M7 | Content comparison of the 7 unmatched registration/compliance PDFs against the 8 already-wired files | Requires opening actual PDF files | F1, F2 |
| M8 | Annual Report FY22/23/24/25 version-pair comparison (identical vs. revised) | Requires opening actual PDF files | F2 |
| M9 | Social Impact FY24 duplicate-pair comparison | Requires opening actual PDF files | F2 |
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

**Credibility documents** — Compliances & Registrations (partial, 8 of 16 wired), Annual Reports (8 candidates), Social Impact Reports (4 candidates), Collaterals (8 candidates), Audit Reports (10 files, pending §2 D17 CMS-placement decision).

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
- **MERN placeholder/demo content that must be replaced, not preserved**: `HOME_TESTIMONIALS`' current 3 people, `TESTIMONIALS_FEATURED`'s same 3 people, `TESTIMONIALS_ALL`'s 6 generic names, and all 6 current MERN blog posts' placeholder body text (`"Full post content is being finalized..."`) — all confirmed demo content with no real-WordPress counterpart (except the Panchatantra one, which is being *replaced with* real content, not simply discarded — see D30).
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
- Audit Reports import — blocked on D17 (CMS placement decision).
- Compliances & Registrations completion — blocked on D21 (7 unmatched PDF reconciliation), M7.
- Annual Reports / Social Impact Reports completion — blocked on D22/D23, M8/M9.
- Careers content/forms — blocked on D4/D28, M2/M4/M5.
- Donation scheme pages needing merge — blocked on the education/vidya_danam_dm, publication/grantha-danam-2, sabha-fund/samskritsabhaujjeevanam merges (§1/§2).
- Home testimonials layout — blocked on D32.
- Team/Leadership/Timeline — **not blocked**, already fully migrated.

### C. Items that can safely be resolved after the first dry run
- All of §3's manual checks (M1–M16) — none of them prevent a first dry-run of the content that's already unambiguous (Blog, Team, Leadership, Timeline, the confirmed-scheme donation pages, About/Contact/Media/Join-Us pages).
- Redirect creation (§6) — deliberately last in the original phase plan, after all duplicate-cluster and destination decisions are final.
- Media/S3 migration — entirely blocked on AWS access, independent of everything else here.
- WPCode replication (M1) — needed before WordPress retirement, not before a content dry-run.

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
9. **WPCode replication and legal-route creation (Privacy/Terms + footer link flip)** — schedule these before WordPress is actually decommissioned, not necessarily before the content migration finishes, since they're about *retiring WordPress safely*, not about the MERN migration itself.

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
