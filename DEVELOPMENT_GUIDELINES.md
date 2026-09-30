# sarkari hith — Project Specification & Development Blueprint

> **CRITICAL REFERENCE**: Read and adhere strictly to this document before writing, refactoring, or extending any frontend or backend code in this repository.

---

## 1. What This Application Is

**sarkari hith** is India's most popular format for government recruitment, examinations, and official notifications portal. The goal of this platform is to provide rapid, high-density, accurate, and categorized updates for job seekers and aspirants across India.

### Core Modules & Features:
1. **Live Notification Ticker**: Breaking alerts, urgent application deadline warnings, and newly released admit cards.
2. **Three-Column Core Matrix**:
   - **Results**: Exam results, merit lists, cutoff marks, selection lists.
   - **Admit Cards**: Hall tickets, exam city slips, physical test dates.
   - **Latest Jobs**: State & Central government recruitment notifications, online application links.
3. **Secondary Information Grids**:
   - **Answer Keys**: Provisional & final answer keys, objection windows.
   - **Syllabus & Pattern**: Detailed syllabus PDF links and exam schemes.
   - **Admissions**: University, entrance exam, and polytechnic application forms.
   - **Certificates & Verification**: Caste, income, EWS, voter ID, PAN card, Aadhaar linkages.
4. **Search & Multi-Dimensional Filtering**:
   - Real-time search by keyword (e.g., "UPSC", "SSC CGL", "Railway", "Police").
   - Filter by **Category / Department** (Banking, Defense, Teaching, Engineering, Railways, Civil Services).
   - Filter by **Qualification** (10th Pass, 12th Pass, Diploma, Graduate, Post Graduate).
   - Filter by **State / Central** (All India, UP, Bihar, Delhi, Rajasthan, MP, etc.).
5. **Detailed Listing View (Job / Notice Details)**:
   - Important Dates (Application start, last date, fee deadline, exam date).
   - Application Fee breakdown (General/OBC/EWS, SC/ST, PH).
   - Age limits and relaxation criteria.
   - Vacancy details table (Post name, department, total posts, eligibility criteria).
   - Actionable official links (Apply Online, Download Notification, Official Website).
6. **Dark / Light Theme & Responsive Layout**:
   - Mobile-first optimization (over 85% of users browse government job sites on smartphones).
   - High accessibility, clear high-contrast typography, and instant loading.

---

## 2. Standardized File & Directory Architecture

To ensure strict separation of concerns, maintainability, and clean code boundaries, the repository adheres to the following structure:

```
Sarkari_Result/
│
├── README.md                      # Quickstart and setup instructions
├── DEVELOPMENT_GUIDELINES.md      # This master architectural blueprint & rulebook
├── AGENTS.md                      # AI agent memory & coding constraints
│
├── backend/                       # Node.js backend service
│   ├── package.json               # Backend metadata and npm run scripts
│   ├── server.js                  # Application entry point & HTTP router dispatcher
│   └── src/
│       ├── config/                # Environment variables & constants
│       │   └── index.js
│       ├── controllers/           # HTTP request/response handlers
│       │   ├── jobController.js
│       │   ├── resultController.js
│       │   └── admitCardController.js
│       ├── data/                  # Seed dataset & data models
│       │   ├── jobs.json
│       │   ├── results.json
│       │   ├── admitCards.json
│       │   └── categories.json
│       ├── routes/                # Endpoint routing mapping
│       │   ├── apiRoutes.js
│       │   └── staticRoutes.js
│       ├── services/              # Business logic, query filters, search & pagination
│       │   └── itemService.js
│       └── utils/                 # Utility helpers (mimes, json responder, validator)
│           ├── responseHelper.js
│           └── staticHandler.js
│
└── frontend/                      # Client-side web application
    ├── index.html                 # Semantic HTML5 single-page application shell
    ├── css/                       # Modular CSS stylesheets
    │   ├── variables.css          # Design tokens (colors, typography, spacing, shadows)
    │   ├── base.css               # CSS reset, body, global typography, container system
    │   ├── components.css         # Cards, badges, buttons, modal, quick grids, ticker
    │   └── responsive.css         # Breakpoint adaptations for tablet and mobile
    ├── js/                        # Modular vanilla JavaScript logic
    │   ├── app.js                 # App initialization, tab management, event listeners
    │   ├── api.js                 # Centralized fetch wrapper for backend communication
    │   ├── state.js               # Reactive client-side state (current filters, active tab)
    │   ├── components.js          # DOM renderers (cards, tables, detail modals, notices)
    │   └── search.js              # Client-side instant filter & search debouncer
    └── assets/                    # Static UI assets
        ├── icons/                 # SVG icons for categories, actions, and status
        └── images/                # Badges, branding, and placeholders
```

---

## 3. Backend Architecture & API Contracts

### Guidelines:
- Built with **Node.js native modules** (or minimal zero-bloat dependencies).
- RESTful JSON APIs prefixed with `/api/`.
- Consistent response envelope:
  ```json
  {
    "success": true,
    "data": [...],
    "meta": {
      "total": 45,
      "page": 1,
      "limit": 10
    }
  }
  ```
- Error format:
  ```json
  {
    "success": false,
    "error": {
      "code": "RESOURCE_NOT_FOUND",
      "message": "Job posting with id '123' does not exist"
    }
  }
  ```

### Key Endpoints:
- `GET /api/health` — Service health & uptime.
- `GET /api/all` — Aggregate dashboard data (latest jobs, top results, trending admit cards, breaking alerts).
- `GET /api/jobs` — Query params: `?category=...&qualification=...&state=...&search=...&page=...`
- `GET /api/jobs/:id` — Detailed job specification (dates, fees, vacancy breakdown, direct links).
- `GET /api/results` — Query params: `?search=...&year=...`
- `GET /api/admit-cards` — Query params: `?search=...&active=true`
- `GET /api/categories` — List of available categories and post counts.

---

## 4. Frontend Architecture & Design Aesthetics

### Visual Identity & Aesthetics:
- **Header & Branding**: Distinctive, authoritative red & navy/dark slate tones (`#b30000`, `#0f172a`, `#1e293b`) with crisp white contrast, conveying instant credibility like national portal services.
- **Visual Hierarchy**:
  1. Top utility announcement bar (date, urgent notification ticker).
  2. Hero navigation & quick filter chips (All, Police, Railway, Banking, SSC, UPSC, Teaching).
  3. The signature 3-column priority layout (`Results` | `Admit Cards` | `Latest Jobs`) on desktop, stacking seamlessly into smooth swipeable/tabbed cards on mobile.
  4. Search bar with instant autocomplete and badge counters.
  5. Detail modal / drawer for viewing eligibility, post vacancies, and direct official action links.
- **Typography**: Clean Google Fonts (e.g. `Plus Jakarta Sans` or `Inter` + `Outfit` for headings).
- **Interactive States**: Hover depth transitions, active pill states, loading skeletons, clean empty states when no results match filters.

---

## 5. Non-Negotiable Coding Rules (Remember Before Writing Code)

1. **Strict File Location Separation**:
   - Never write backend logic inside the `frontend/` directory.
   - Never place client assets or HTML inside `backend/` (except static serving config).
2. **Modular Code Organization**:
   - Avoid monolithic files. Break CSS into `variables.css`, `base.css`, `components.css`.
   - Break JavaScript into `api.js`, `state.js`, `components.js`, and `app.js`.
   - Break backend into `routes`, `controllers`, `services`, and `utils`.
3. **Robust Error Handling**:
   - Both backend and frontend must gracefully handle missing files, failed fetches, and invalid IDs.
   - Show user-friendly error banners and offline fallback indicators.
4. **Mobile Responsiveness First**:
   - Test layout fluidity on 320px, 375px, 768px, and 1200px+ viewports.
   - Touch targets must be at least 44px for critical actions (Apply, Download, View).
5. **Accessibility & SEO**:
   - Use semantic tags (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`).
   - Every input field must have an explicit or `aria-label` associated label.
   - Unique IDs for all interactive components.
