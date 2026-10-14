# Deploying the NIBL Application Portal on the server (Windows + IIS + NSSM)

Follow these steps in order. Every step can be undone, and the old services keep running until step 7.
Run every script **as Administrator on the server**.

## 0. Before you start

* Take a backup of the current database, `pg_dump -Fc <db> > before_portal.dump`, and of the upload folders. On the server the upload folder is `D:\Internal Workspace\apqp\data` and the OIPM images are in its upload folder.
* Make sure the server has these installed:
  - PostgreSQL 17.6+ or 18;
  - Python 3.12+ (tick *Add to PATH*);
  - Node.js LTS;
  - IIS with **URL Rewrite** and **Application Request Routing**. In IIS Manager → server → ARR → *Server Proxy Settings*, tick **Enable proxy**;
  - **NSSM** (nssm.cc) - unzip it, e.g. to `C:\tools\nssm`.
* Decide the address users will open: `http://nibl`, or `https://nibl` if IT gives you a certificate (recommended, see step 4).

## 1. Copy the code

Copy the repository to the server, e.g. `D:\NIBL-APPLICATION-PORTAL`. Do **not** copy `venv`, `node_modules`, `dist`, `logs` or any `.env` from a developer PC.

## 2. Databases, settings, Python

The live server keeps OIPM in the database **`oipm`** and NPD in the database **`apqp`**. Copy from both (open PowerShell **as Administrator** in `D:\NIBL-APPLICATION-PORTAL`):

```
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -PgPassword "<current postgres password>" -OipmDb oipm -NpdDb apqp -OldOipmDir "<folder of the running OIPM>" -OldNpdDir "<folder of the running NPD>"
```

* `-OldOipmDir` / `-OldNpdDir`: the folders the old apps run from today. Their `.env` (mail settings, keys) and OIPM's Gmail files are reused, so e-mail keeps working.
* Do this **after stopping the old OIPM and NPD services** (step 7.2) on the real day, so nothing typed after the copy is lost. For a rehearsal you can run it any time - `oipm` and `apqp` are only read, never changed.

It creates the databases `nibl_portal`, `nibl_oipm`, `nibl_npd` and `nibl_drawing`, **copies** the data into them (the source database is not changed), writes the four `.env` files and installs the Python packages. Then copy the existing files once:

```
scripts\MOVE-DATA.bat
```

Files now live in `applications\<app>\data`. The old folders are not deleted.

## 3. Production settings

> **Order matters:** changing the database password here also changes it for the OLD apps (same PostgreSQL). Until the old services are stopped (step 7.2), press **Enter** at the password question to keep the current one, and run this step again at switch-over to set the new password.

```
scripts\PREPARE-PRODUCTION.bat
```

It asks two things:

| Question | Answer |
|---|---|
| Address users open | `http://nibl`, or `https://nibl` once the certificate from step 4 is in place |
| New database password | 12+ characters with letters and numbers, no quotes or spaces. Keep it in your password safe. |

It then, in one go:

* changes the PostgreSQL password and writes it into all four `.env` files;
* sets `ENVIRONMENT=production` (the `/docs` API pages are hidden);
* allows only the public address (`CORS_ORIGINS`) - no `localhost`;
* removes the unused Supabase settings;
* switches the secure sign-in cookie on **only** for `https://` (on `http://` a secure cookie would log users out);
* switches the IIS "Force HTTPS" rule on for `https://`;
* checks the sign-in and service keys match in all four apps and that e-mail is set up;
* keeps a copy of every `.env` as `.env.bak-<date>`.

Fix every line marked **FIX** before going live. **NOTE** lines are information (for example, e-mail switched off).

## 4. HTTPS (recommended)

1. Ask IT for a certificate for `nibl` (company CA or a purchased one) and import it on the server (*Certificates - Local Computer → Personal*).
2. IIS Manager → site `nibl` → *Bindings…* → **Add** → type `https`, port `443`, choose the certificate.
3. Run `scripts\PREPARE-PRODUCTION.bat` again and answer `https://nibl` (press Enter at the password question to keep it).

Without HTTPS everything works, but passwords cross the office network unencrypted.

## 5. Build the screens

```
scripts\BUILD-ALL.bat
```

## 6. IIS

| IIS item | Physical path |
|---|---|
| Site `nibl` (port 80, and 443 if step 4 is done) | `D:\NIBL-APPLICATION-PORTAL\portal\frontend\dist` |
| Application `/oipm` | `...\applications\OIPM\frontend\dist` |
| Application `/npd` | `...\applications\NPD\frontend\dist` |
| Application `/drawing-control` | `...\applications\AI-Drawing-Control\frontend\dist` |
| Application `/ai-drawing-control` (old address) | `...\shared\deployment\iis-old-drawing-url` (redirect only) |

Every `dist` folder contains its own `web.config`, copied from `public\web.config`. Together they:

| Request | Goes to |
|---|---|
| `/portal-api/*` | `:8010` |
| `/api/v1/*` | `:8000` |
| `/npd/api/*` | `:8001` |
| `/drawing-control/api/*` | `:8002` |

They also allow uploads up to 200 MB, add basic browser-protection headers, and stop browsers caching `index.html`, so users get new screens straight after an update without Ctrl+F5.

## 7. Services (NSSM) and switch over

1. Install the four services (not started yet):
   ```
   powershell -ExecutionPolicy Bypass -File scripts\install-services.ps1 -Nssm "C:\tools\nssm\win64\nssm.exe"
   ```
   Each service starts automatically after PostgreSQL, restarts itself 5 s after a crash, and writes logs to `<app>\backend\logs`.
2. Stop the **old** OIPM service (port 8000) and the old `NPD-backend` service (port 8001) in *services.msc*. Set them to *Manual*.
3. Start the new services:
   ```
   powershell -ExecutionPolicy Bypass -File scripts\install-services.ps1 -Nssm "C:\tools\nssm\win64\nssm.exe" -Start
   ```
4. Point the IIS site at the new folders (step 6).

## 8. Check

```
scripts\SMOKE-TEST.bat
```

Every line must say **OK**: the four services, the four APIs, the four screens through IIS, and the hidden `/docs` pages. Then by hand:

| Check | Expected |
|---|---|
| Sign in with an existing account and old password | works (passwords were copied) |
| The three cards | open for approved users |
| A new registration | appears as pending in OIPM, NPD and Drawing Control |
| Forgot password | the email arrives |
| NPD: create a project, Drawing Control: upload a drawing | both saved; the e-mail arrives |

## 9. Nightly backup

```
powershell -ExecutionPolicy Bypass -File scripts\install-backup-task.ps1 -BackupDir "E:\NIBL-BACKUPS" -At "01:30"
```

Every night it saves the four databases (`pg_dump`) and the `applications\<app>\data` folders into a dated folder, and keeps 14 days. Put the backup folder on another disk or a network share. Test it once: `Start-ScheduledTask -TaskName NIBL-Nightly-Backup`, then read `backup.log` in the backup folder.

Restore one database: `pg_restore -U postgres -h 127.0.0.1 -p <port> -d <db> --clean <file>.dump`.

## Updating later

1. Copy the new code (not `.env`, `venv`, `node_modules`, `data`).
2. `scripts\BUILD-ALL.bat`.
3. If `requirements.txt` changed: `scripts\SETUP.bat` (safe to run again).
4. Restart the services: `install-services.ps1 -Nssm "<path>\nssm.exe" -Start`.
5. `scripts\SMOKE-TEST.bat`.

## Rollback

Stop the four `NIBL-*` services, start the old two again, and point IIS back at the old folders. The old database was never changed. To undo step 3 only, copy a `.env.bak-<date>` back over `.env` (and set the old PostgreSQL password again).
