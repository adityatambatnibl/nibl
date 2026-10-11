# NIBL Application Portal

One sign-in page and one card page. Behind them sit independent applications:

| Card | What it is | Opens at | Backend (port) | Database |
|---|---|---|---|---|
| — | **Portal**: sign in, sign up, forgot password, cards, portal admin | `/` | `portal/backend` (8010) | `nibl_portal` |
| 1 | **OIPM**: One Person One Improvement | `/oipm/` | `applications/OIPM/backend` (8000) | `nibl_oipm` |
| 2 | **NPD**: APQP timelines + order tracking | `/npd/` | `applications/NPD/backend` (8001) | `nibl_npd` |
| 3 | **AI Drawing Control**: controlled PDF drawings | `/ai-drawing-control/` | `applications/AI-Drawing-Control/backend` (8002) | `nibl_drawing` |

The detailed design is in [`shared/documentation/ARCHITECTURE.md`](shared/documentation/ARCHITECTURE.md). What changed during the restructure is in [`shared/documentation/RESTRUCTURE-REPORT.md`](shared/documentation/RESTRUCTURE-REPORT.md).

---

## 1. Overall architecture

```
Browser ── http://nibl ──► IIS
   /                       portal/frontend/dist                    ─┐
   /portal-api/*  ───────► portal backend        :8010  nibl_portal │  one sign-in
   /oipm/                  applications/OIPM/frontend/dist           │  (portal token)
   /api/v1/*      ───────► OIPM backend          :8000  nibl_oipm    │
   /npd/                   applications/NPD/frontend/dist            │
   /npd/api/*     ───────► NPD backend           :8001  nibl_npd     │
   /ai-drawing-control/    applications/AI-Drawing-Control/frontend/dist
   /ai-drawing-control/api/* ► AI Drawing backend :8002  nibl_drawing ┘
```

* **One identity, one password.** These live in the portal (`nibl_portal.users`).
* **Approval per application.** Registering creates a *pending* user in every application's own database. Each application's admin approves or rejects inside that application, and a card opens only when that application says *approved*.
* **Applications are independent.** Each has its own frontend, backend, database, business logic and admin. None imports another's code.

## 2. Portal architecture

| Part | Where | Responsibility |
|---|---|---|
| Frontend | `portal/frontend/src` | `pages/Login` (includes the "Forgot password?" form), `pages/Signup`, `pages/ForgotPassword`, `pages/Dashboard` (cards), `pages/Profile`, `pages/Admin`, `pages/Projects` |
| Backend | `portal/backend/app` | `api/auth.py` (register, login, refresh, logout, forgot / change password), `api/projects.py` (cards with the user's access), `api/users.py` (portal admin), `api/internal.py` (called by applications) |
| Registry | `shared/configuration/projects.json` | the list of applications (cards) |

## 3. Application architecture

Every application is a normal, self-contained frontend + backend:

```
applications/<App>/
  frontend/   Vite + React, served at /<app>/, own package.json, own web.config
  backend/    FastAPI, own requirements.txt, own .env, own database
              + 2 portal endpoints:  POST /portal/users   GET /portal/access/{user_id}
  data/       every file the application stores (images, attachments, PDFs) - back up, never commit
```

## 4. Folder structure

```
Internal Workspace/                 (= NIBL-APPLICATION-PORTAL)
├── portal/
│   ├── frontend/   src/{assets,components/{Navbar,Sidebar,ProjectCard,ProtectedRoute,Loading,Brand},
│   │               pages/{Login,Signup,ForgotPassword,Dashboard,Projects,Profile,Admin,Logout},
│   │               routes/AppRoutes.jsx, services/{authService,projectService}.js,
│   │               context/AuthContext.jsx, constants/projects.js, styles/}  public/web.config
│   └── backend/    app/{api,core,models,schemas,services,db}/  main.py  requirements.txt  .env.example
├── applications/
│   ├── OIPM/                 frontend/ (React)        backend/app/ (FastAPI, sync SQLAlchemy)   data/ (images)
│   ├── NPD/                  frontend/ (React + TS)   backend/ (FastAPI, async SQLAlchemy)      data/ (attachments)
│   └── AI-Drawing-Control/   frontend/ (React + TS)   backend/ (FastAPI, async SQLAlchemy)      data/ (drawing PDFs)
├── shared/
│   ├── configuration/projects.json        application registry (cards)
│   ├── database/                          seed backups for a fresh install
│   ├── documentation/                     ARCHITECTURE.md, RESTRUCTURE-REPORT.md
│   └── deployment/                        DEPLOY.md (server steps)
├── scripts/   SETUP.bat  START-DEV.bat  BUILD-ALL.bat  MOVE-DATA.bat  install-services.ps1
│              split_databases.py  configure_env.py  maintenance/
├── README.md
└── .gitignore
```

## 5–9. Running it on your computer (Windows)

**First time:**

1. Install PostgreSQL 18, Python 3.12+ and Node.js LTS.
2. Double-click **`scripts\SETUP.bat`**. It:
   - creates the 4 databases and copies the existing data into them (the old database is not changed);
   - writes the 4 `.env` files;
   - installs the Python packages.

**Every day:** double-click **`scripts\START-DEV.bat`**, then open **http://localhost:5173**. It opens 8 windows, and that one address serves the portal and all three applications.

To start one part on its own, double-click its `run-dev.bat` or use these commands:

| Part | Command (from the folder) | Address |
|---|---|---|
| Portal backend | `portal\backend` → `venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8010` | http://localhost:8010/portal-api/docs |
| Portal frontend | `portal\frontend` → `npm install` once, then `npm run dev` | http://localhost:5173 |
| OIPM backend | `applications\OIPM\backend` → `venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000` | http://localhost:8000/docs |
| OIPM frontend | `applications\OIPM\frontend` → `npm run dev` | http://localhost:5174/oipm/ |
| NPD backend | `applications\NPD\backend` → `venv\Scripts\python.exe -m uvicorn main:app --reload --port 8001` | http://localhost:8001/docs |
| NPD frontend | `applications\NPD\frontend` → `npm run dev` | http://localhost:5175/npd/ |
| AI Drawing backend | `applications\AI-Drawing-Control\backend` → `venv\Scripts\python.exe -m uvicorn main:app --reload --port 8002` | http://localhost:8002/api/docs |
| AI Drawing frontend | `applications\AI-Drawing-Control\frontend` → `npm run dev` | http://localhost:5176/ai-drawing-control/ |

> Use the portal address (5173) for normal work. The portal dev server forwards `/oipm`, `/npd`, `/ai-drawing-control` and all APIs, so the sign-in is shared, exactly like on the server.

## 10. Adding a new application (Project 4, 5, 6 …)

Example: **Supplier Management**.

1. **Create** `applications/Supplier-Management/frontend` (Vite, `base: '/supplier-management/'`) and `applications/Supplier-Management/backend` (FastAPI, own database `nibl_supplier`, own `.env`).
2. **Add the 2 portal endpoints** to the backend. Copy `applications/AI-Drawing-Control/backend/routes/portal_routes.py`; it is about 60 lines:
   - `POST /api/portal/users` creates the user as *pending*;
   - `GET /api/portal/access/{user_id}` returns `approved | pending | rejected | inactive | missing`.
3. **Accept the portal sign-in.** Check the Bearer token with `PORTAL_JWT_SECRET` (same value as the portal's `JWT_SECRET_KEY`), then look the user up in your own users table. Copy `utils/deps.py` and `session.ts` + `apiClient.ts` from AI Drawing Control.
4. **Register it**: add one entry to `shared/configuration/projects.json`:
   ```json
   { "id": "supplier-management", "name": "Supplier Management",
     "subtitle": "Manage supplier information", "order": 4, "status": "active",
     "launch":  { "url": "/supplier-management/" },
     "backend": { "base_url": "http://127.0.0.1:8003/api",
                  "provision_path": "/portal/users", "access_path": "/portal/access/{user_id}" } }
   ```
   The portal reads the change automatically and the card appears. Existing users are created in the new application the first time they open the card page.
5. **IIS**: add an application `/supplier-management` → its `frontend\dist`, plus a `web.config` that sends `api/*` to `:8003`. Add an NSSM service for `run-prod.bat`.

No other application changes. The portal frontend needs a change only if you want a custom card colour (`portal/frontend/src/constants/projects.js`).

## 11. How project cards work

1. The portal frontend calls `GET /portal-api/projects`.
2. The portal backend reads `projects.json`. For each application it asks, in parallel, `GET <backend.base_url>/portal/access/<user id>` with the `X-Portal-Key` header.
3. Each card shows **OPEN PROJECT** or **WAITING FOR APPROVAL**, **ACCESS NOT GRANTED**, **NOT REACHABLE** or **COMING SOON**. A locked card opens a pop-up that explains why.
4. Clicking an open card goes to `launch.url`:
   - OIPM and AI Drawing read the portal session themselves (refresh cookie / token);
   - NPD reads the portal session (`portal_access_token`, same site) on `/npd/sso` and creates its own session. No token is put in the URL.

## 12. How permissions work

| Level | Decided by | Where stored |
|---|---|---|
| Can sign in at all | Portal admin (activate / deactivate) | `nibl_portal.users.is_active` |
| Can open OIPM + OIPM role (employee / HOD / accounts / plant head / admin) | OIPM admin (existing approval screens) | `nibl_oipm.users.registration_status`, `is_active`, `role` |
| Can open NPD + NPD permissions | NPD admin (`/npd/admin/approvals`, Users) | `nibl_npd.apqp.user_apqp.status`, `permissions` |
| Can open AI Drawing + admin / reviewer | AI Drawing admin (Users & Approvals) | `nibl_drawing.drawing.users.status`, `role` |
| Portal admin | Portal admin | `nibl_portal.users.is_admin` |

Example: User A is approved in OIPM and NPD but pending in AI Drawing. A sees two open cards and one *Waiting for approval* card.

## 13. Environment variables

`scripts\SETUP.bat` writes all four `.env` files from your existing settings. Each backend has an `.env.example` listing its keys.

| Key | Portal | OIPM | NPD | AI Drawing | Note |
|---|---|---|---|---|---|
| Database | `DB_HOST/PORT/NAME/USER/PASSWORD` (nibl_portal) | same keys (nibl_oipm) | `SUPABASE_DB_URL` (nibl_npd) | `DATABASE_URL` (nibl_drawing) | |
| Sign-in key | `JWT_SECRET_KEY` | `JWT_SECRET_KEY` | `OIPM_JWT_SECRET` | `PORTAL_JWT_SECRET` | **must be the same value** in all four |
| Service key | `PORTAL_SERVICE_KEY` | ← same | ← same | ← same | portal ↔ application calls |
| Mail | `SMTP_*` | `SMTP_*` | `SMTP_*`, `EMAIL_ENABLED` | `SMTP_*`, `EMAIL_ENABLED` | |
| Files | — | `SUPABASE_*` / local | `STORAGE_DIR` | `STORAGE_DIR` (same folder as NPD; PDFs are under `drawings/`) | |
| Other | `ALLOWED_EMAIL_DOMAINS`, `CORS_ORIGINS` | `PORTAL_INTERNAL_URL` | `USER_SYNC_ENABLED=false` | `DRAWING_REMINDER_HOURS` | |

Frontends need no `.env`. Their defaults are in each `vite.config.*`.

## 14–16. Production deployment, IIS, backend services

The full checklist is in [`shared/deployment/DEPLOY.md`](shared/deployment/DEPLOY.md). In short:

1. `scripts\SETUP.bat` (on the server, with a strong `-PgPassword`), then `scripts\BUILD-ALL.bat`.
2. **IIS** needs URL Rewrite and ARR (proxy on):
   - site root → `portal\frontend\dist`;
   - applications `/oipm`, `/npd`, `/ai-drawing-control` → each `frontend\dist`.

   Every `dist` already holds its `web.config` (copied from `public\web.config`).
3. **Services** (NSSM): run `scripts\install-services.ps1 -Nssm <path>\nssm.exe`. This installs `NIBL-Portal-API` (8010), `NIBL-OIPM-API` (8000), `NIBL-NPD-API` (8001) and `NIBL-AIDrawing-API` (8002), each running its `run-prod.bat` with 1 worker. Stop the old OIPM and NPD services first, then rerun with `-Start`.

## 17. Database structure (high level)

| Database | Schema | Main tables |
|---|---|---|
| `nibl_portal` | public | `users` (identity, password, profile), `project_sync` (provisioning status) |
| `nibl_oipm` | public | `users` (OIPM roles + approval), `improvements`, `improvement_drafts` |
| `nibl_npd` | apqp | `user_apqp`, `orders`, `order_stages`, `apqp_projects`, `apqp_activities`, `attachments`, `audit_logs`, `email_logs`, … |
| `nibl_drawing` | drawing | `users`, `dc_folders`, `dc_drawings`, `dc_revisions`, `dc_reviews`, `dc_reviewer_list`, `dc_access_log`, `audit_logs`, `email_logs` |

The user id is the same UUID in all four databases. The old shared database (`nibl_workspace`) is only the copy source: keep it until the new system is checked, then it may be dropped (take a `pg_dump` first). Re-running SETUP after that does not recreate it.
