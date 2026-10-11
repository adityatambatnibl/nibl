# OIPM data

Every file OIPM stores lives here: improvement images (`<year>/...`) and draft images (`drafts/...`).
The database keeps paths relative to this folder.

* Back this folder up together with the `nibl_oipm` database.
* Never commit it (it is in `.gitignore`).
* To use a different folder, set `OIPM_DATA_DIR` in `applications/OIPM/backend/.env`.
