# Sarkari Result

The frontend uses plain HTML, CSS, and browser JavaScript. The backend uses Node.js built-in modules, so there are no application dependencies to install.

## Requirements

- Node.js 20 or newer, with npm available on your PATH

## Run locally

From the project root, start the backend:

```powershell
cd backend
npm start
```

Open <http://localhost:3000>. The Node server serves the frontend and exposes `GET /api/health` for the connection check. For automatic restarts while editing backend files, use `npm run dev` instead.

The frontend source is in `frontend/`; the backend entry point and npm scripts are in `backend/`.

## Architecture & Guidelines

Before adding features or modifying code, refer to:
- [`DEVELOPMENT_GUIDELINES.md`](DEVELOPMENT_GUIDELINES.md): Complete architecture specification, module definitions, and frontend/backend separation rules.
- [`AGENTS.md`](AGENTS.md): Core coding constraints and pre-coding checklist.