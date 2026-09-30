# 🏛️ Sarkari Hith (sarkari hith 2026)

[![Vercel Deployment](https://img.shields.io/badge/Deployed%20with-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-339933?style=for-the-badge&logo=nodedotjs)](https://nodejs.org)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20ES6+-F7DF1E?style=for-the-badge&logo=javascript)](https://developer.mozilla.org)
[![CSS3](https://img.shields.io/badge/Styling-Modular%20CSS3-1572B6?style=for-the-badge&logo=css3)](https://developer.mozilla.org)
[![Vercel Analytics](https://img.shields.io/badge/Analytics-Vercel%20Insights-000000?style=for-the-badge&logo=vercel)](https://vercel.com/analytics)

> **High-speed, authoritative government recruitment, admit card, examination result, and student welfare portal for Indian aspirants.**

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Installation](#local-installation)
  - [Running the Application](#running-the-application)
- [Environment Configuration](#-environment-configuration)
- [Automation & Background Services](#-automation--background-services)
  - [Web Scraper Pipeline](#1-web-scraper-pipeline)
  - [Google Sheets 2-Way Sync](#2-google-sheets-2-way-sync)
  - [Daily Job Alerts & Deadline Reminders](#3-daily-job-alerts--deadline-reminders)
- [REST API Reference](#-rest-api-reference)
- [Vercel Deployment Guide](#-vercel-deployment-guide)
- [Security Hardening](#-security-hardening)
- [Contributing & Guidelines](#-contributing--guidelines)
- [License](#-license)

---

## 🌟 Overview

**Sarkari Hith** is designed to solve information fragmentation for millions of government exam candidates. Built with a performance-first mindset, it serves real-time exam notifications, hall tickets, cutoff results, and syllabus PDFs through an ultra-dense, responsive UI backed by lightweight Node.js microservices.

---

## 🚀 Key Features

### 1. 3-Column Core Information Matrix
- **Latest Jobs**: Central and State government vacancies with direct application links, eligibility, and fee structure.
- **Admit Cards**: Exam city intimation slips, hall tickets, and PET/PST call letters.
- **Results**: Real-time merit lists, answer key cutoffs, and scorecards.

### 2. Live Announcement & Breaking News Ticker
- Real-time animated ticker alerting candidates to urgent deadlines, exam date postponements, and freshly released notices.

### 3. Multi-Dimensional Smart Filters
- **Qualification**: 10th Pass, 12th Pass, ITI, Diploma, Graduate (B.Tech, B.Sc, B.Com, B.A), Post Graduate, B.Ed/TET.
- **Sector**: Defense & Police, Railways (RRB), Civil Services (UPSC/State PSC), Banking (IBPS/SBI), SSC, Teaching, Healthcare.
- **State / Region**: All-India National vs. State-specific (UP, Bihar, Delhi, Rajasthan, MP, Haryana, etc.).
- **Search**: Instant debounced full-text search across titles, organizations, and exam tags.

### 4. Candidate Welfare & Utility Modules
- **Job Tracker & Deadlines**: Candidates can bookmark vacancies, set their application status (`Interested`, `Applied`, `Admit Card Released`), and track remaining days until submission closes.
- **Degree-Matched Email Alerts**: Aspirants subscribe with their degree and state; the system automatically matches and dispatches notification emails when relevant vacancies open.
- **Answer Keys & Objection Windows**: Official provisional & final keys with objection raise links.
- **Syllabus & Scheme**: Direct official PDF links to exam patterns and detailed marking schemes.
- **Certificates & Verification**: Direct links for UP/Bihar/Central certificates, EWS, Caste, Domicile, and Aadhaar-PAN linking.

### 5. Premium UI / UX
- **Theme Support**: Seamless toggle between crisp authoritative Light Mode and eye-friendly Dark Slate Mode.
- **Mobile-First Design**: Optimized for 320px–480px viewports (over 85% of exam aspirants browse on smartphones).
- **Vercel Web Analytics**: Privacy-first, real-time traffic insights and custom conversion tracking for search queries and alert subscriptions.

---

## 🏗️ Architecture & Tech Stack

```mermaid
graph TD
    Client[Web Browser / Mobile User] -->|HTTPS Requests| VercelEdge[Vercel Global CDN Edge]
    VercelEdge -->|Static Assets CSS/JS/HTML| Frontend[Modular Static Frontend]
    VercelEdge -->|/api/* Requests| Serverless[Vercel Serverless Function api/index.js]
    Serverless --> Backend[Node.js HTTP Server backend/server.js]
    Backend --> DataStore[(JSON Local Data Stores)]
    Backend --> GoogleSheets[Google Sheets WebApp 2-Way Sync]
    Backend --> SMTP[Nodemailer SMTP Email Service]
    Scraper[Scraper Pipeline Cheerio / Axios] --> DataStore
    Scraper --> Classifier[Smart Job Classifier]
```

### Technology Breakdown

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend UI** | HTML5 Semantic, Modular CSS3 | Zero framework overhead, instantaneous First Contentful Paint (<200ms). |
| **Client Logic** | Modern Vanilla JavaScript (ES6+ Modules) | Native browser execution without bundler friction (`api.js`, `state.js`, `components.js`, `app.js`). |
| **Backend Runtime** | Node.js (v20+) | Native HTTP server, zero unnecessary external server bloat. |
| **Serverless Layer**| Vercel Serverless Functions (`api/index.js`) | Auto-scaling global compute for `/api/*` endpoints. |
| **Data Ingestion** | Cheerio, Axios, Puppeteer (Dev) | Resilient web scraping pipeline from official government notification portals. |
| **Notifications** | Nodemailer | Automated degree-matched vacancy dispatches & deadline reminders. |
| **Cloud Database**| Google Sheets API / WebApp Apps Script | Free, accessible, real-time admin portal for manual content management and synchronization. |
| **Analytics** | `@vercel/analytics` Edge Script | Built-in real-time analytics with zero performance penalty. |

---

## 📂 Project Directory Structure

```text
Sarkari_Result/
├── .gitignore                      # Git exclusion rules (node_modules, logs, secrets)
├── AGENTS.md                       # AI coding memory, directory boundary rules & constraints
├── DEVELOPMENT_GUIDELINES.md       # Master architectural blueprint & API contracts
├── README.md                       # Project documentation (this file)
├── package.json                    # Root package descriptor for Vercel deployment
├── vercel.json                     # Vercel deployment, CDN output directory & rewrite rules
│
├── api/                            # Vercel Serverless Function entrypoint
│   └── index.js                    # Dispatches /api requests to backend server
│
├── frontend/                       # Client-side Single Page Application (SPA)
│   ├── index.html                  # Accessible HTML5 semantic shell & analytics scripts
│   ├── styles.css                  # Legacy/fallback utility styles
│   ├── app.js                      # Root connection health checker
│   ├── assets/                     # Branding, logos, and hero imagery
│   │   └── images/                 # sarkari_hith_logo.jpg, parliament_hero.jpg
│   ├── css/                        # Modular stylesheet architecture
│   │   ├── variables.css           # Design tokens, color palette, shadows, typography
│   │   ├── base.css                # CSS reset, container system, global typography
│   │   ├── components.css          # Cards, matrix columns, badges, modals, ticker
│   │   └── responsive.css          # Breakpoint rules for mobile & tablet screens
│   ├── js/                         # Modular client JavaScript architecture
│   │   ├── api.js                  # Fetch wrapper, backend fallback, analytics tracking
│   │   ├── state.js                # Centralized reactive state store & theme switcher
│   │   ├── components.js           # Reusable DOM renderers & detail modal templates
│   │   └── app.js                  # Entry point, event listeners, debounce search
│   └── data/                       # Fallback static datasets for offline resilience
│       ├── allData.json            # Master aggregated portal data
│       └── categories.json         # Department taxonomy
│
└── backend/                        # Node.js backend services & data management
    ├── package.json                # Backend scripts & runtime dependencies
    ├── server.js                   # Node.js HTTP router, rate-limiting & static server
    ├── .env.example                # Template for required environment variables
    └── src/
        ├── data/                   # JSON storage datasets
        │   ├── jobs.json           # Latest government job listings
        │   ├── admitCards.json     # Active exam admit cards & hall tickets
        │   ├── results.json        # Declared exam results & merit lists
        │   ├── trending.json       # High-priority spotlight notices
        │   ├── categories.json     # Category definitions & post counts
        │   ├── allData.json        # Aggregated catalog
        │   └── subscribers.json    # Candidate alert subscriptions (git-ignored)
        └── services/               # Core backend business logic
            ├── googleSheetService.js # 2-way sync with Google Sheets Apps Script
            ├── notificationService.js# Degree matcher, email templates & reminders
            ├── pushAllDataToSheet.js # Utility script to seed Google Sheet
            ├── sendNotifications.js  # Scheduled job alert dispatcher
            └── scraper/              # Data extraction & parsing pipeline
                ├── classifier.js     # NLP/Regex classification for eligibility & qualifications
                ├── sarkariScraper.js # HTML extractor using Cheerio
                └── runScraper.js     # Scheduled batch scraper runner
```

---

## 💻 Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or higher
- **npm**: `v9.0.0` or higher
- **Git**

### Local Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Inscrutable21/Sarkari_Result.git
   cd Sarkari_Result
   ```

2. **Install dependencies:**
   ```bash
   # Install root serverless dependencies
   npm install

   # Install backend dependencies
   cd backend
   npm install
   cd ..
   ```

### Running the Application

#### Option A: Start the Integrated Node.js Server (Recommended for Local Dev)
The Node.js server automatically serves the frontend static files and exposes all `/api/*` endpoints on a single port:

```bash
cd backend
npm run dev
```

Open your browser at **`http://localhost:3000`**.

#### Option B: Production Server Run
```bash
cd backend
npm start
```

---

## ⚙️ Environment Configuration

Create a `.env` file inside the `backend/` directory (or configure these variables in the **Vercel Dashboard > Settings > Environment Variables**):

```env
# Application Port (defaults to 3000)
PORT=3000

# Admin Secret Key (protects scraper and sheet sync endpoints)
ADMIN_SECRET_KEY=your_secure_admin_secret_key

# Google Sheets 2-Way Sync Integration
GOOGLE_SHEET_WEBAPP_URL=https://script.google.com/macros/s/YOUR_APPS_SCRIPT_ID/exec
GOOGLE_SHEET_SYNC_SECRET=your_sheet_sync_secret

# SMTP Email Configuration (for Job Alerts & Deadlines)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="Sarkari Hith Alerts" <your_email@gmail.com>
```

---

## 🤖 Automation & Background Services

### 1. Web Scraper Pipeline
Scrapes the latest government recruitment notices, parses qualification requirements, and classifies them by department:

```bash
cd backend
npm run scrape
```

### 2. Google Sheets 2-Way Sync
Sync all local JSON datasets directly into your connected Google Sheet for easy remote administration:

```bash
cd backend
npm run sync:sheets
```

### 3. Daily Job Alerts & Deadline Reminders
Scans candidate subscriptions and active job deadlines, automatically dispatching personalized HTML email alerts:

```bash
cd backend
npm run notify
```

---

## 🔌 REST API Reference

All backend responses return standard JSON envelopes:
`{ "success": true, "data": [...], "meta": { ... } }`

| Method | Endpoint | Description | Query Parameters / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Healthcheck and service uptime | None |
| `GET` | `/api/all` | Complete dashboard payload (jobs, admit cards, results, ticker) | None |
| `GET` | `/api/jobs` | Filtered list of recruitment postings | `?sector=...&state=...&qualification=...&q=...&activeOnly=true` |
| `GET` | `/api/admit-cards` | Active admit cards & hall tickets | `?q=...` |
| `GET` | `/api/results` | Declared examination results & merit lists | `?q=...` |
| `GET` | `/api/categories` | Department categories & vacancy counts | None |
| `POST` | `/api/alerts/subscribe` | Register candidate for qualification-matched job alerts | Body: `{ email, name, qualification, state, sector }` |
| `POST` | `/api/track-job/add` | Save job to candidate's personal tracker | Body: `{ email, jobId, jobTitle, lastDate, applyLink }` |
| `GET` | `/api/track-job/list` | Retrieve tracked jobs for candidate | `?email=user@example.com` |
| `POST` | `/api/track-job/apply` | Update job application status | Body: `{ trackId, status: "applied" \| "interested" }` |
| `POST` | `/api/scrape/trigger` | Trigger live scraping run *(Admin protected)* | Header: `x-admin-key: <ADMIN_SECRET_KEY>` |
| `POST` | `/api/sync-sheets` | Force sync from Google Sheets *(Admin protected)* | Header: `x-admin-key: <ADMIN_SECRET_KEY>` |

---

## 🚀 Vercel Deployment Guide

The repository is configured for **Zero-Config Vercel Deployment**:

1. **Push your code to GitHub / GitLab**.
2. **Import the repository** into [Vercel](https://vercel.com/new).
3. **Project Settings**:
   - **Framework Preset**: `Other`
   - **Root Directory**: `./`
   - **Output Directory**: Automatically set to `frontend` via [vercel.json](vercel.json).
4. **Environment Variables**: Add `ADMIN_SECRET_KEY`, `GOOGLE_SHEET_WEBAPP_URL`, `SMTP_HOST`, etc. in Vercel settings.
5. **Deploy**: Vercel will deploy the static frontend to its global CDN and mount [api/index.js](api/index.js) as a Serverless Function for all `/api/*` traffic.
6. **Activate Analytics**: In the Vercel Dashboard, navigate to the **Analytics** tab and click **Enable Web Analytics**.

---

## 🛡️ Security Hardening

- **SSRF Prevention**: The scraper URL whitelist strictly restricts scraping to authorized government notification domains.
- **Formula Injection Defense**: Candidate input fields exported to Google Sheets sanitize dangerous characters (`=`, `+`, `-`, `@`) to eliminate CSV spreadsheet injection vulnerabilities.
- **XSS Escaping**: All dynamic DOM renderers in [frontend/js/components.js](frontend/js/components.js) pass data through strict HTML entity encoding.
- **Fail-Closed Admin Gate**: Admin endpoints reject requests immediately unless a secure `ADMIN_SECRET_KEY` is provided.

---

## 🤝 Contributing & Guidelines

Before proposing changes, please review our master specification documents:
- [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md) — Comprehensive architectural specifications & coding standards.
- [AGENTS.md](AGENTS.md) — Agent boundaries, directory placement rules, and data contract consistency.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).