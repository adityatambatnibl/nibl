# Restructure report: NIBL Application Portal (06-Oct-2026)

## 1. New folder structure

```
Internal Workspace/                        <- repository root (= NIBL-APPLICATION-PORTAL)
├── portal/
│   ├── frontend/  index.html  package.json  vite.config.js  eslint.config.js  run-dev.bat
│   │   ├── public/  web.config  logos/nrb.png  images/
│   │   └── src/  App.jsx  main.jsx
│   │       ├── assets/logo.jpg
│   │       ├── components/ Brand/{BrandLogos,BearingBackground}  Loading/{Loading,BearingSpinner}
│   │       │               Navbar/  Sidebar/  ProjectCard/{ProjectCard,ProjectAccessModal,*.css}  ProtectedRoute/
│   │       ├── constants/projects.js      context/AuthContext.jsx      routes/AppRoutes.jsx
│   │       ├── pages/ Login/{index,LoginPage}  Signup/{index,SignupPage}  ForgotPassword/  Dashboard/
│   │       │          Profile/  Admin/  Projects/  Logout/
│   │       ├── services/{authService,projectService}.js
│   │       └── styles/{index,App,AuthCompact,portal}.css
│   └── backend/  requirements.txt  .env.example  run-dev.bat  run-prod.bat
│       └── app/  main.py
│           ├── api/{auth,users,projects,internal}.py
│           ├── core/{config,security,permissions}.py
│           ├── models/{user,project}.py     schemas/{auth,user,project}.py
│           ├── services/{auth_service,user_service,project_service,email_service}.py
│           └── db/{database,models}.py
├── applications/
│   ├── OIPM/
│   │   ├── frontend/  (React)  public/web.config  assest/logo.jpg  src/{App.jsx,api,components,context,pages,utils}
│   │   └── backend/   app/{api(+portal.py),core,db,models,schemas,services}  .env.example  run-*.bat
│   ├── NPD/
│   │   ├── frontend/  (React + TS + Tailwind)  public/web.config  src/...
│   │   └── backend/   config database models routes(+portal_routes.py) schemas services utils  main.py
│   └── AI-Drawing-Control/
│       ├── frontend/  (React + TS + Tailwind)  public/web.config
│       │   src/{App,DrawingLayout,ReviseModal,api,apiClient,session,ui}.ts(x)  components/  pages/
│       └── backend/   main.py  config/ database/{connection,repo,schema.sql} models/{base,drawing,user,audit,email_log}
│                      routes/{drawing_routes,portal_routes}  services/{drawing_*,email,storage,audit}  utils/
├── shared/
│   ├── configuration/projects.json
│   ├── database/{oipm_only_backup.sql, apqp_data_migration.sql, 00_prepare.sql, 01_npd_columns.sql}
│   ├── documentation/{ARCHITECTURE.md, RESTRUCTURE-REPORT.md}
│   └── deployment/DEPLOY.md
├── scripts/  SETUP.bat  setup.ps1  START-DEV.bat  BUILD-ALL.bat  install-services.ps1
│             split_databases.py  configure_env.py  maintenance/{npd,oipm}/
├── README.md
└── .gitignore
```

## 2. Files moved (OLD → NEW)

The source is the combined workspace (`backend\`, `frontend\`), which held the newest code. The old `oipm\` and `apqp\` copies are older versions of the same code.

| Old | New |
|---|---|
| `backend\oipm\app\**` | `applications\OIPM\backend\app\**` |
| `backend\apqp\**` (minus AI Drawing files) | `applications\NPD\backend\**` |
| `backend\apqp\models\drawing.py` | `applications\AI-Drawing-Control\backend\models\drawing.py` (schema `drawing`) |
| `backend\apqp\services\drawing_service.py`, `drawing_email_service.py` | `applications\AI-Drawing-Control\backend\services\` |
| `backend\apqp\routes\drawing_routes.py` | `applications\AI-Drawing-Control\backend\routes\` |
| `backend\apqp\{database\repo.py, services\email_service.py, storage_service.py, audit_service.py, models\audit.py}` | copied into `applications\AI-Drawing-Control\backend\` (it is independent of NPD now) |
| `frontend\src\oipm\**` (OIPM screens) | `applications\OIPM\frontend\src\**` |
| `frontend\src\oipm\App.jsx` → `LoginPage`, `SignupPage` | `portal\frontend\src\pages\Login\LoginPage.jsx`, `pages\Signup\SignupPage.jsx` (unchanged markup) |
| `frontend\src\oipm\App.jsx` → `ModulePage` (cards) | `portal\frontend\src\pages\Dashboard\DashboardPage.jsx` + `components\ProjectCard\` (now data-driven) |
| `frontend\src\oipm\components\{BrandLogos,BearingBackground,BearingSpinner,ProjectAccessModal}` | `portal\frontend\src\components\{Brand,Loading,ProjectCard}\` |
| `frontend\src\oipm\{index,App,AuthCompact}.css`, `DrawingCard.css` | `portal\frontend\src\styles\`, `components\ProjectCard\ProjectCard.css` |
| `frontend\src\apqp\**` (minus `drawings\`) | `applications\NPD\frontend\src\**` |
| `frontend\src\apqp\drawings\**` | `applications\AI-Drawing-Control\frontend\src\**` |
| `frontend\src\assest\logo.jpg` | `applications\OIPM\frontend\assest\logo.jpg`, `portal\frontend\src\assets\logo.jpg` |
| `apqp\frontend\{tsconfig*,eslint.config.js,index.html,public\*}` | `applications\NPD\frontend\` |
| `oipm\frontend\{package.json,eslint.config.js}` | `applications\OIPM\frontend\` |
| `oipm_only_backup.sql`, `apqp_data_migration.sql`, `setup\sql\*.sql` | `shared\database\` |
| `apqp\backend\{check*.py, compare_supabase.py, migrate_*.py}` | `scripts\maintenance\npd\` |
| `oipm\backend\{fix_draft_submit_images.py, test_gmail_refresh.py}` | `scripts\maintenance\oipm\` |
| `apqp\DEPLOY.md` (content) | `shared\deployment\DEPLOY.md` (rewritten for 4 services) |
| `README-RUN.md` (content) | `README.md` + `shared\documentation\ARCHITECTURE.md` |

## 3. Files renamed

| Old | New |
|---|---|
| `frontend\src\oipm\DrawingCard.css` | `portal\frontend\src\components\ProjectCard\ProjectCard.css` |
| `backend\apqp\database\supabase\003_drawing_control.sql` | `applications\AI-Drawing-Control\backend\database\schema.sql` (regenerated for schema `drawing`) |
| `setup\SETUP-DATABASE.bat` / `setup-database.ps1` | `scripts\SETUP.bat` / `setup.ps1` (now also splits the databases) |

## 4. Files deleted from the new structure (not carried over)

| File | Why it is safe |
|---|---|
| `frontend\src\oipm\pages\auth\Login.jsx`, `signup.jsx`, `Auth.css` | Not imported anywhere (checked all imports); the live sign-in screens were inside `App.jsx` |
| `frontend\src\oipm\components\DashboardBackground.jsx/.css` | Not imported anywhere |
| `pages\accounts\AccountsDashboard_0.css`, `pages\admin\AdminDashboard_o.css`, `pages\hod\HODDashboard_o.css` | Old copies; not imported anywhere |
| `backend\main.py`, `backend\run-*.bat`, `frontend\vite.config.ts`, `frontend\npd\index.html` | The single combined process / page; replaced by 4 independent apps |
| `apqp\backend\tests\` | Empty |
| every `dist\`, `node_modules\`, `venv\`, `__pycache__\` | Rebuilt by `npm install` / `npm run build` / `pip install` |

**Not deleted on your computer yet.** This session can write files but cannot delete or move files on your PC. The old folders below are therefore still there. Delete them yourself in File Explorer once the new structure runs (§9).

## 5. Files intentionally preserved

* Every `.env` stays where it is. `scripts\SETUP.bat` reads them and writes the new ones.
* `credentials.json` and `token.json` (OIPM Gmail) are copied by SETUP into `applications\OIPM\backend`.
* `apqp\data\`, `oipm\data\` and the server upload folders (uploaded files) are **not touched**.
* The old database `nibl_workspace` is **not touched**. It is the copy source and your rollback.
* `tools\nssm\…\win64\nssm.exe` is needed for the services.
* All `requirements.txt`, `package.json`, `package-lock.json` and `web.config` files.
* All NPD SQL schema files (`applications\NPD\backend\database\supabase\`).

## 6. Code changes

### Portal (new)

* **Backend** (`/portal-api`):
  - register, login, refresh (httpOnly cookie), logout, forgot and change password;
  - cards with live per-user access;
  - portal admin;
  - an internal password endpoint;
  - background retry of user provisioning.
* **Frontend:**
  - the original OIPM sign-in and sign-up screens;
  - a data-driven card page with the access pop-up;
  - profile, admin and applications pages;
  - a `/logout` route used by every application.

### OIPM (behaviour kept, sign-in moved out)

* `api\portal.py` (new): `POST /portal/validate`, `POST /portal/users` and `GET /portal/access/{id}`, with the same sign-up rules as `/auth/register`.
* `api\auth.py`: `/auth/refresh` also accepts the `portal_refresh_token` cookie (one line).
* `api\admin.py`: *change password* also updates the portal password.
* `core\config.py`: `PORTAL_SERVICE_KEY`, `PORTAL_INTERNAL_URL`.
* `main.py`: includes the portal router.
* **Frontend `App.jsx`:**
  - only the OIPM screens remain (dashboards per role, add improvement);
  - with no OIPM session it goes to the portal;
  - *Logout* signs out of the portal;
  - it keeps `localStorage.access_token` in step with the session, because the OIPM API helpers read it.
* **Served at `/oipm/`** (`vite.config.js` `base`).

### NPD (behaviour kept)

* `routes\portal_routes.py` (new): `POST /portal/users` and `GET /portal/access/{id}`.
* `config\settings.py`: `PORTAL_SERVICE_KEY` and `USER_SYNC_ENABLED` (default false; the 30-second copy from `public.users` is replaced by portal provisioning).
* `cron_service.py` and the *Sync* button respect `USER_SYNC_ENABLED`.
* Every AI Drawing addition was removed again. `App.tsx` and `utils\constants.ts` are byte-identical to the original NPD files. `Sso.tsx` keeps the earlier requested change: no "Back to NPD" page.

### AI Drawing Control (now an independent application)

* **Own database:** `nibl_drawing`, schema `drawing`.
* **Own users table:** `drawing.users`, with approval and an admin/user role.
* **Sign-in:** the portal token is checked directly with `PORTAL_JWT_SECRET`.
* **Own scheduler** for reminders.
* **New "Users & Approvals" page:** approve / reject, drawing admin, Email List.
* **Frontend:** served at `/ai-drawing-control/`; reads the portal session (`session.ts`, `apiClient.ts`).

## 7. Application status (verified in a test environment with a copy of your data)

**OIPM**

| Item | Result |
|---|---|
| Frontend | PASS: build + lint clean; employee dashboard opens from the card |
| Backend | PASS: starts on its own database; admin lists, approval and refresh work with the portal session |

**NPD**

| Item | Result |
|---|---|
| Frontend | PASS: `tsc` + build; dashboard opens from the card. Lint shows the same 5 warnings as the original code. |
| Backend | PASS: orders, APQP, users, audit, dashboard, analytics, approvals, SSO |

**AI Drawing Control**

| Item | Result |
|---|---|
| Frontend | PASS: `tsc` + build; home page opens from the card |
| Backend | PASS: the full 60-step workflow test (upload, confirm/deny, revise/lock, approve, logs, permissions) on its own database |

**Portal** (48-step API test plus browser test)

| Item | Result |
|---|---|
| Login | PASS: existing users keep their old passwords |
| Signup | PASS: pending in OIPM + NPD + AI Drawing; a bad HOD is refused on the form |
| Forgot Password | PASS: new password emailed (email sending simulated in test) and it signs in |
| Dashboard | PASS |
| Project Cards | PASS: data-driven from `projects.json` |
| Permissions | PASS: each card follows its own application's approval; approve and reject both reflected |
| Application Navigation | PASS: OIPM `/oipm/`, NPD `/npd/dashboard`, AI Drawing `/ai-drawing-control/`; logout from any application signs out everywhere |

**Not testable here:** real email delivery (no internet mail in the test environment) and IIS itself. Check both on the server (DEPLOY.md §7).

## 8. Commands

| Part | Folder | Command |
|---|---|---|
| Portal frontend | `portal\frontend` | `npm install` (first time), then `npm run dev` → http://localhost:5173 |
| Portal backend | `portal\backend` | `venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8010` |
| OIPM frontend | `applications\OIPM\frontend` | `npm run dev` (port 5174) |
| OIPM backend | `applications\OIPM\backend` | `venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000` |
| NPD frontend | `applications\NPD\frontend` | `npm run dev` (port 5175) |
| NPD backend | `applications\NPD\backend` | `venv\Scripts\python.exe -m uvicorn main:app --reload --port 8001` |
| AI Drawing frontend | `applications\AI-Drawing-Control\frontend` | `npm run dev` (port 5176) |
| AI Drawing backend | `applications\AI-Drawing-Control\backend` | `venv\Scripts\python.exe -m uvicorn main:app --reload --port 8002` |
| Everything at once | — | `scripts\START-DEV.bat`. **First time:** `scripts\SETUP.bat` |

## 9. After it runs: what to delete yourself (File Explorer)

| Status | Item | Why |
|---|---|---|
| SAFE | `Claude outputs\` | **Contains a copy of secrets (`env`)**. Delete first. |
| SAFE | `NPD_SESSION_BACKUP_20261001_090548\` | 30-Sep snapshots, superseded |
| SAFE | `backend\` | combined backend, replaced by `applications\*\backend`. **After SETUP has run** (it reads `backend\oipm\.env` and `backend\apqp\.env`). |
| SAFE | `frontend\` | combined frontend, replaced |
| SAFE | `setup\` | replaced by `scripts\` |
| SAFE | `README-RUN.md`, `RESTRUCTURE-PLAN.md` | replaced by `README.md` and this report |
| SAFE | `apqp\CHECKPOINT_*`, `apqp\backend\backup_*`, `oipm\backend\backup-before-local-storage\`, `apqp\frontend\dist_backup_*` | old code copies |
| SAFE | every `dist\`, `node_modules\`, `__pycache__\` inside `apqp\`, `oipm\` | generated |
| REVIEW | `apqp\` and `oipm\` folders | the production code copies. Keep until the server runs the new structure. Their `data\` folders hold uploaded files: move them to the server upload location, never just delete them. |
| REVIEW | `.env.before-*` files, `oipm\backend\token_backup.json` | old settings, kept for rollback |
| REVIEW | `oipm_supabase_full_backup.sql`, `oipm_supabase_data.sql`, `oipm_data_migration.sql`, `oipm_users_restore.sql`, `apqp_missing_data.sql`, `apqp_orders_restore.sql` (root) | database exports; not used by setup |
| REVIEW | `tools\node*`, `oipm\tools\` (about 250 MB of Node installers) | delete if the server has internet for installing Node |
| REVIEW | root `oipm_only_backup.sql`, `apqp_data_migration.sql` | now also in `shared\database\` |

## 10. Adding Project 4 (step by step)

1. Copy `applications\AI-Drawing-Control` to `applications\<New-App>`. It is the smallest complete template: portal sign-in, the portal endpoints, its own users and approval page.
2. Rename it:
   - in `frontend\vite.config.ts`, set `base` and `port`; in the code, change the router `basename` and `VITE_API_URL`;
   - in `backend\.env`, set the database `nibl_<newapp>`, the next free port, and the same `PORTAL_JWT_SECRET` and `PORTAL_SERVICE_KEY` as the portal.
3. Create the database: `CREATE DATABASE nibl_<newapp>;`. The tables are created on the first start.
4. Replace the drawing business code (models, services, routes, pages) with the new application's.
5. Add one entry to `shared\configuration\projects.json` (README §10). The card appears without a restart.
6. Add a `run-dev.bat` line to `scripts\START-DEV.bat`, a proxy line to `portal\frontend\vite.config.js`, the IIS application with its `web.config`, and an NSSM service entry in `scripts\install-services.ps1`.
7. The new application's admin approves users in its *Users & Approvals* page.
