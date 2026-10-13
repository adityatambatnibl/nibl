# Drawing Control data

Everything Drawing Control stores lives here. Back this folder up together with the `nibl_drawing`
database, and never commit it (it is in `.gitignore`). Set by `STORAGE_DIR=../data` in the backend `.env`.

## drawings/ - the drawing library (this is where you put PDFs)

    drawings/
        GBD/SRB/22205/NBD-NA-4905.pdf   <- drawing "NBD-NA-4905" in folder GBD > SRB > 22205
        Unsorted/                        <- PDFs dropped straight into drawings/ are moved here
        _history/                        <- every revision ever made  (the app's - do not touch)
        _deleted/                        <- copies of deleted drawings (the app's - do not touch)

* **New drawing:** copy the PDF into its product folder (sub-folders = Product Tree, created automatically).
* **New revision:** replace the PDF in the same folder with the same file name.
* Refresh Drawing Control - it appears within ~15 seconds, already **released**, no e-mails.
* Drawings uploaded or revised on screen are written here too, so every folder always holds the
  **current revision** of each drawing. Old revisions are in `_history/`.
* Skipped (reason in the backend log): same name already in another folder, a deleted drawing
  (restore it first), a file that is not a real PDF.
* Renaming a folder or moving a drawing on screen moves the files here as well. Do it on screen,
  not in Explorer - renaming a folder in Explorer creates a new folder of drawings with the same names,
  which are skipped.
