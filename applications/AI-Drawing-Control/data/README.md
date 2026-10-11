# AI Drawing Control data

Every file AI Drawing Control stores lives here: the controlled drawing PDFs (`drawings/<division>/...`).
The database keeps paths relative to this folder.

* Back this folder up together with the `nibl_drawing` database.
* Never commit it (it is in `.gitignore`).
* Set by `STORAGE_DIR=../data` in `applications/AI-Drawing-Control/backend/.env` (relative to the backend folder).
