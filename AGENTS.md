# Agent Rules & Memory: Sarkari Result Project

## 1. Project Identity & Architecture
- **Application**: Sarkari Result (National government examinations, recruitment, admit cards, and results portal).
- **Master Blueprint**: Always adhere to [DEVELOPMENT_GUIDELINES.md](file:///e:/Sarkari_Result/DEVELOPMENT_GUIDELINES.md).

## 2. Directory & Structure Rules
- **Backend Directory (`backend/`)**:
  - Contains all server-side logic, API routing (`/api/*`), data stores (`src/data/`), controllers, services, and utilities.
  - No HTML or frontend UI components should ever be hardcoded into backend responses (except serving static files).
- **Frontend Directory (`frontend/`)**:
  - Contains client-side code: `index.html`, modular CSS (`css/variables.css`, `css/base.css`, `css/components.css`, `css/responsive.css`), and modular JS (`js/api.js`, `js/state.js`, `js/components.js`, `js/app.js`).
  - No backend Node.js code or server-side file system operations belong here.

## 3. Pre-Coding Checklist (Always Verify Before Writing Code)
1. **Check File Placement**: Is the file being written in the correct directory (`frontend/` vs `backend/`) according to [DEVELOPMENT_GUIDELINES.md](file:///e:/Sarkari_Result/DEVELOPMENT_GUIDELINES.md)?
2. **Check Modularity**: Are styles separated into logical sheets? Are JavaScript components and API layers isolated?
3. **Data Contract Consistency**: Are API responses adhering to `{ success: boolean, data: ..., meta: ... }`?
4. **Information Density & Speed**: Sarkari Result demands high visual clarity, instant filtering, and mobile-friendly usability.
5. **No Bloat**: Keep dependencies minimal, utilizing native Node.js and lightweight modern vanilla JS/CSS.
