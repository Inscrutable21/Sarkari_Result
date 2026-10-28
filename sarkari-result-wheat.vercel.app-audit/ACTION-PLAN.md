# Action Plan: sarkari-result-wheat.vercel.app

## Phase 1: Critical (Week 1)
1. `frontend/js/api.js`: use same-origin `/api` first (C1) -> expected mobile LCP/TBT drop sharply.
2. Resolve the domain: point `sarkarihith.com` to this Vercel project and 301 vercel.app to it; or switch all absolute URLs to the live host (C2).
3. Server-render/pre-render homepage listings + `<h1>` (C4); add `/job/<slug>`, `/result/<slug>`, `/admit-card/<slug>` pages and a generated sitemap (C3).

## Phase 2: High (Weeks 2-3)
4. Compress the hero (WebP/AVIF, width/height, fetchpriority), reserve space for the listings to fix CLS (H4, H5).
5. Inline critical CSS / merge CSS, `font-display: swap`, trim fonts, paginate `/api/all` (H6, H7).
6. Add `rel="nofollow noopener"` on scraped external links; build internal links (hubs by state/qualification/department) (H1).
7. Add About/Privacy/Contact/Disclaimer pages; write original summaries per listing (H2, H3).

## Phase 3: Medium (Month 2)
8. Title <=60, description <=155; drop obsolete meta; PNG/JPG 1200x630 OG image per page.
9. Schema: JobPosting on detail pages, Organization sameAs; drop ItemList/SiteNavigationElement.
10. A11y: aria-labels on ticker links, contrast, heading order.
11. Allow HEAD; real `lastmod`; remove `/anandapkaproject` from robots.txt; add CSP.

## Phase 4: Monitoring
Connect Search Console + CrUX; submit sitemap; re-run Lighthouse after Phase 1 (targets: mobile perf >=75, LCP <=2.5 s, TBT <=200 ms, CLS <=0.1). Fails if mobile LCP stays >4 s after step 1.
