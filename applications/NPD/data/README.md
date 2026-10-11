# NPD data

Every file NPD stores lives here: order and APQP attachments.
The database keeps paths relative to this folder.

* Back this folder up together with the `nibl_npd` database.
* Never commit it (it is in `.gitignore`).
* Set by `STORAGE_DIR=../data` in `applications/NPD/backend/.env` (relative to the backend folder).
