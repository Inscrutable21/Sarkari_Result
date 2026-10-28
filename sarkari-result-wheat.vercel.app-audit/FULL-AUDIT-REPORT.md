# SEO Audit: https://sarkari-result-wheat.vercel.app/ (2026-10-28, v2)

## Method and limits
- claude-seo runtime set up (`/seo setup`). However **its Playwright Chromium gets `net::ERR_FAILED` on this host** (works on example.com; curl is fine), so `render_page.py` and `capture_screenshot.py` returned raw HTML only and **no screenshots were produced**.
- Substitute: Lighthouse 12 (npm, temp dir) driving the locally installed Chrome, mobile + desktop, plus `chrome --dump-dom` for the rendered DOM. Raw reports: `findings/lighthouse-*.json`.
- No field data (CrUX/GSC/GA4 not configured). Lab numbers are single runs. Only the homepage was crawled (there are no other indexable URLs).

## Scores (Lighthouse lab)
| | Perf | SEO | A11y | Best Pr. |
|---|---|---|---|---|
| Mobile | **34** | 100 | 87 | 73 |
| Desktop | **59** | 100 | 87 | 73 |

Mobile: FCP 2.2s, **LCP 8.5s**, **TBT 3,120ms**, CLS 0.111, SI 6.8s. Desktop: LCP 2.2s, TBT 460ms, CLS 0.101. Page weight ~1.24 MB, 50-58 requests. (Lighthouse "SEO 100" only checks basic tags; it misses the issues below.)
**Estimated SEO health: ~42/100.**

## CRITICAL
**C1. Frontend probes dead API hosts before the real one.** `frontend/js/api.js:6-12` tries `http://<host>:3000/api`, `localhost:3000`, `127.0.0.1:3000` (each with a 5 s timeout) before `/api`. On production all of them fail (ERR_CONNECTION_REFUSED, plus mixed-content/insecure requests: Lighthouse `is-on-https` fails), and console errors are logged. This delays the first data render and is the main cause of mobile LCP 8.5s / TBT 3.1s and the Best-Practices 73. Fix first (see code below).

**C2. Canonical host is dead.** canonical, og:url, twitter:url, og:image, JSON-LD, sitemap and `Sitemap:` line all use `https://sarkarihith.com`, which has no DNS record. Signals point Google at a nonexistent host.

**C3. Sitemap = 9 query-string URLs of `/`.** `?category=`, `?service=`, `?filter=` all canonicalize to `/`; no listing has its own URL. Nothing to rank for individual exams.

**C4. Content is client-rendered.** Raw HTML is 12 KB, no `<h1>`, no listings; the rendered DOM is 1 MB with 1 h1, 11 h2, 43 h3, 230 links. Crawlers/AI bots that don't execute JS see an empty shell, and indexing depends on the Web Rendering Service succeeding after the slow API path in C1.

## HIGH
- **H1. 167 of 230 links (73%) go to external sites** (51 to `sarkariresult.com`, 15 to `mysarkarinaukri.com`), none `rel="nofollow"`/`ugc`/`sponsored`. You send equity out, your own pages receive almost none: only 61 links are `#` anchors and ~2 other internal paths. No internal linking graph.
- **H2. Scraped/duplicate content** (titles copied verbatim from sarkariresult.com). Thin-content/scaled-content risk.
- **H3. Trust pages missing:** `/about`, `/privacy-policy`, `/contact` = 404.
- **H4. LCP image:** `assets/images/rashtrapati_bhavan_hero.jpg` is 937 KB JPG (843 KiB wasted); `<img>` has no width/height (CLS). Use WebP/AVIF, sized, `fetchpriority="high"`, not lazy.
- **H5. CLS 0.10-0.11** (limit 0.1): `section#...` shifts when data arrives; reserve height / skeleton.
- **H6. Render-blocking:** 5 CSS files + Google Fonts CSS (~850 ms est. mobile). Main-thread work 15.3 s on mobile; the 715 KB `/api/all` JSON is parsed and rendered in one go.
- **H7. `/api/all` is 715 KB and `/api/jobs` 308 KB uncompressed-ish JSON** for the homepage; paginate/trim.

## MEDIUM
- 8+ ticker `<a>` have no accessible name (`link-name`); color-contrast failures on matrix/radar buttons; heading order skips; `aria-required-children`, `label-content-name-mismatch` (A11y 87).
- Title 82 chars, description ~235 chars (truncated in SERP). Remove ignored tags (keywords, news_keywords, revisit-after, distribution, rating); fix "vacency".
- FAQPage JSON-LD: Google retired FAQ rich results (May 2026); informational only. `ItemList` of `SiteNavigationElement` and hash-URL BreadcrumbList are not useful; Organization lacks `sameAs`. No `JobPosting`.
- `og:image` is a 91 KB WebP logo not 1200x630; use PNG/JPG. apple-touch-icon should be 180x180 PNG.
- `HEAD /` returns 405. sitemap `lastmod` static 2026-10-04; changefreq/priority ignored.
- robots.txt discloses `/anandapkaproject` (hidden admin path).
- Minify CSS/JS (~8 KiB). No CSP header.

## Mobile usability
Viewport meta present, responsive CSS present. Lighthouse found no tap-target audit failure but I could not visually verify (no screenshots; Chromium issue above). Mobile is where the performance is worst (C1/H4/H6).

## Passing
HTTPS+HSTS preload, XCTO, XFO, Referrer-Policy, Permissions-Policy; `lang`, viewport, meta description, title, canonical tag present (wrong host); robots.txt valid, allows assets; 5 valid JSON-LD blocks; correct 404 status; image has alt.
