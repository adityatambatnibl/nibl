# NIBL Application Portal: architecture

## 1. Principles

1. **The portal owns identity, and only identity.** It handles register, sign in, password, sign out and the card page. It never contains application business logic.
2. **Every application owns everything else**: its screens, API, database, roles and approval.
3. **Applications never talk to each other.** They talk only to the portal, through a fixed contract (§4).
4. **Adding an application is additive.** It means a new folder plus one registry entry. Nothing existing is edited.

## 2. Components

| Component | Tech | Port | Database | Code |
|---|---|---|---|---|
| Portal frontend | React 19, Vite 8 (JSX) | 5173 (dev) | — | `portal/frontend` |
| Portal backend | FastAPI, SQLAlchemy (sync, psycopg2) | 8010 | `nibl_portal` | `portal/backend/app` |
| OIPM frontend | React 19, Vite (JSX) | 5174 (dev) | — | `applications/OIPM/frontend` |
| OIPM backend | FastAPI, SQLAlchemy (sync), APScheduler | 8000 | `nibl_oipm` | `applications/OIPM/backend/app` |
| NPD frontend | React 19, Vite, TypeScript, Tailwind 4 | 5175 (dev) | — | `applications/NPD/frontend` |
| NPD backend | FastAPI, SQLAlchemy async (asyncpg), APScheduler | 8001 | `nibl_npd` | `applications/NPD/backend` |
| AI Drawing frontend | React 19, Vite, TypeScript, Tailwind 4 | 5176 (dev) | — | `applications/AI-Drawing-Control/frontend` |
| AI Drawing backend | FastAPI, SQLAlchemy async (asyncpg), APScheduler | 8002 | `nibl_drawing` | `applications/AI-Drawing-Control/backend` |

In production IIS serves all four frontends under one host (`http://nibl`), which keeps the browser session (cookie and local storage) shared.

## 3. Identity and sessions

### 3.1 Token format (unchanged from OIPM)

```
access  : {"sub": "<user uuid>", "type": "access",  "exp": ...}   HS256, 8 h
refresh : {"sub": "<user uuid>", "type": "refresh", "exp": ...}   HS256, 30 days
```

The signing key is shared:

| Component | Setting |
|---|---|
| Portal | `JWT_SECRET_KEY` |
| OIPM | `JWT_SECRET_KEY` |
| NPD | `OIPM_JWT_SECRET` |
| AI Drawing | `PORTAL_JWT_SECRET` |

`configure_env.py` copies the old OIPM key into all of them, so tokens issued before the restructure stay valid.

### 3.2 Sign-in flow

```
Portal /login ── POST /portal-api/auth/login ──► access token (JSON)  +  portal_refresh_token cookie (httpOnly, path=/)
                 the portal stores the access token in localStorage("portal_access_token")
```

### 3.3 How each application picks up the session

| Application | Mechanism | Approval check |
|---|---|---|
| OIPM | Its unchanged `AuthContext` calls `POST /api/v1/auth/refresh`. OIPM's refresh endpoint now also accepts the `portal_refresh_token` cookie, and returns an OIPM access token plus the OIPM user (role). | OIPM `registration_status = approved` and `is_active` (existing code) |
| NPD | The card opens `/npd/sso`. NPD reads the portal access token from local storage (same site) and its existing SSO swaps it for an NPD session. No token appears in the URL. | NPD `user_apqp.status = approved` (existing code) |
| AI Drawing | Reads `portal_access_token`. When it is missing or expired it calls `/portal-api/auth/refresh`, then sends it as Bearer. | `drawing.users.status = approved` |

### 3.4 Sign out

Every application's *Log out* goes to the portal's `/logout`. That route deletes both refresh cookies and clears every application's stored session keys.

## 4. Application contract (what every application implements)

| Call | Called by | Request | Response |
|---|---|---|---|
| `POST {base}/portal/users` | portal, at registration and on retry | `{id, full_name, employee_code, email, department, password_hash, ...profile}` | `{"status": "created" or "exists", "access": ...}`. **Idempotent.** |
| `GET {base}/portal/access/{user_id}` | portal, when drawing the cards | — | `{"access": "approved" or "pending" or "rejected" or "inactive" or "missing"}` |
| `POST {base}/portal/validate` | portal, before registering (optional) | same as `/users` | `200`, or `4xx {detail}` to refuse the sign-up |

All three carry the header `X-Portal-Key: <PORTAL_SERVICE_KEY>` and are called server to server on `127.0.0.1`.

Implementations:

| Application | File |
|---|---|
| OIPM | `applications/OIPM/backend/app/api/portal.py` (uses `/validate`, so a wrong HOD is reported on the sign-up form, as before) |
| NPD | `applications/NPD/backend/routes/portal_routes.py` |
| AI Drawing | `applications/AI-Drawing-Control/backend/routes/portal_routes.py` |

The applications also call the portal back through `POST /portal-api/internal/users/{id}/password`, using the same key. OIPM uses it so that the OIPM admin's *change password* button still changes the sign-in password.

## 5. Registration

1. The portal validates the request: NIBL email domain, unique email and employee code.
2. The portal asks every application that has a `validate_path` to check the answers. OIPM checks the HOD and the employee code.
3. The portal saves the identity, including OIPM's sign-up answers in `users.profile`.
4. The portal calls `POST /portal/users` on every active application. The result is recorded in `project_sync`.
   - Not reachable: the row stays `pending` and is retried every 5 minutes.
   - The card page also creates anything that is still `missing`.
5. Each application notifies its own admin (OIPM email, NPD notification bell, AI Drawing *Users & Approvals* list).

## 6. Forgot / change password

* **Forgot**: email + employee code. The portal generates a new password in the same pattern OIPM always used, stores it, and emails it. It works for every application.
* **Change**: on the portal *Profile* page.
* **OIPM admin "change password"** still works: OIPM pushes the new password to the portal.

## 7. Data

* **Separate databases**, so each application can be backed up, restored or moved on its own.
* **The same user UUID everywhere.** Identities were migrated with their original ids.
* **Migration** is done by `scripts/split_databases.py`. It reads the old `nibl_workspace` and never writes to it.

| Copied to | What |
|---|---|
| `nibl_portal` | identities from `public.users`, plus NPD-only accounts, which get an employee code `NPD-xxxxxxxx` that the portal admin can correct |
| `nibl_oipm` | schema `public` |
| `nibl_npd` | schema `apqp` without the `dc_*` tables |
| `nibl_drawing` | the `dc_*` tables, the drawing audit rows, and `drawing.users` (approved = had `drawing_view`/`drawing_admin` or was an NPD admin) |

* **Every application keeps its files in its own `data` folder**, next to its `backend` and `frontend`:

| Folder | Holds | Setting (default) |
|---|---|---|
| `applications/OIPM/data` | improvement and draft images | `OIPM_DATA_DIR` (this folder) |
| `applications/NPD/data` | order and APQP attachments | `STORAGE_DIR=../data` |
| `applications/AI-Drawing-Control/data` | drawing PDFs (`drawings/...`) | `STORAGE_DIR=../data` |

  The databases store paths relative to these folders, so a folder can be moved by changing one setting. `scripts/MOVE-DATA.bat` copies files from the old locations once (it never deletes them). Back up each `data` folder with its database.

## 8. Frontend structure (portal)

```
src/
  App.jsx                 router + AuthProvider
  routes/AppRoutes.jsx    /login /signup /forgot-password /logout /  /profile /admin /projects
  context/AuthContext.jsx portal session (token refresh 1 min before expiry)
  services/authService.js auth API;  projectService.js  cards + openProject()
  constants/projects.js   card colours only (unknown id -> default look)
  pages/Login|Signup      the original OIPM screens, moved unchanged
  pages/Dashboard         cards (data from the API) + access pop-up
  components/ProjectCard  one card;  Navbar, Sidebar, ProtectedRoute, Loading, Brand
```

## 9. Operations

| Concern | How |
|---|---|
| Services | 4 NSSM services (`scripts/install-services.ps1`), each with 1 worker, because the schedulers expect a single process |
| Logs | `<backend>/logs/stdout.log` and `stderr.log` (rotated at 10 MB) |
| Backups | `pg_dump -Fc` each of the 4 databases, plus `STORAGE_DIR` and the OIPM upload folder |
| Health | `/portal-api/health`, `/npd/api/health`, `/ai-drawing-control/api/health`, and `http://127.0.0.1:8000/health` (OIPM, server only) |

## 10. Known limits / follow-ups

* **NPD-only accounts** (created inside NPD before single sign-on) received placeholder employee codes (`NPD-…`). Correct them in Portal → Admin if those people need *Forgot password*, because it asks for the employee code.
* **OIPM's own `/auth/login` and `/auth/register` endpoints still exist**, untouched, but nothing calls them any more. Remove them once the portal is live.
* **The browser's built-in PDF viewer download button cannot be logged** in AI Drawing Control. A pdf.js viewer would close that gap.
