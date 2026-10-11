import { useEffect, useRef, useState } from "react";
import { attachmentApi } from "../services/attachmentApi";
import { apiError } from "../services/api";
import type { Attachment } from "../types";

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentCell({
  entityType,
  entityId,
  initial,
  canEdit,
  checkpointValue,
  onCheckpointChange,
  disabled,
  onChange,
}: {
  entityType: string;
  entityId: string;
  initial: Attachment[];
  canEdit: boolean;
  checkpointValue: string;
  onCheckpointChange?: (value: string) => void;
  disabled?: boolean;
  onChange?: () => void;
}) {
  const [files, setFiles] = useState<Attachment[]>(initial);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFiles(initial);
  }, [initial]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    setBusy(true);
    setError("");
    setUploadProgress(0);
    setUploadingFile(file);
    setUploadSuccess(false);

    try {
      const created = await attachmentApi.upload(
        file,
        entityType,
        entityId,
        undefined,
        (progress) => setUploadProgress(progress),
      );

      setFiles((current) => [...current, created]);
      setUploadSuccess(true);
      onChange?.();

      window.setTimeout(() => {
        setUploadSuccess(false);
      }, 2500);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
      setUploadingFile(null);
      setUploadProgress(0);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function handleDelete(id: string) {
    setError("");

    try {
      await attachmentApi.remove(id);
      setFiles((current) => current.filter((file) => file.id !== id));
      onChange?.();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function handleOpen(file: Attachment) {
    setError("");

    try {
      await attachmentApi.open(file.id, file.original_filename);
    } catch (err) {
      setError(apiError(err));
    }
  }

  const hasFiles = files.length > 0;

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-1">
      <div
        className={`flex min-w-0 flex-1 items-center rounded border border-slate-300 bg-white px-1.5 py-1 ${
          disabled ? "bg-slate-50" : "focus-within:border-brand-600"
        }`}
      >
        {!hasFiles ? (
          <input
            value={checkpointValue}
            disabled={disabled}
            onChange={(e) => onCheckpointChange?.(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs outline-none"
          />
        ) : (
          <div
            className="min-w-0 flex-1 truncate text-xs"
            title={files.map((file) => file.original_filename).join(", ")}
          >
            {files.map((file, index) => (
              <span key={file.id}>
                {index > 0 && ", "}
                <button
                  type="button"
                  onClick={() => handleOpen(file)}
                  className="inline text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                  title={`${file.original_filename} (${sizeLabel(file.size_bytes)})`}
                >
                  {file.original_filename}
                </button>

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDelete(file.id)}
                    className="ml-0.5 text-red-500 hover:text-red-700"
                    title={`Remove ${file.original_filename}`}
                  >
                    x
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          if (!hasFiles && !canEdit) return;
          if (!hasFiles || canEdit) {
            inputRef.current?.click();
          }
        }}
        disabled={busy || (!canEdit && !hasFiles)}
        title={hasFiles ? `${files.length} attachment${files.length === 1 ? "" : "s"}` : "Upload attachment"}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border ${
          hasFiles
            ? "border-red-300 bg-red-50 text-red-600"
            : "border-slate-300 bg-white text-slate-600"
        } hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>

        {hasFiles && (
          <span className="absolute ml-5 mt-4 min-w-[14px] rounded-full bg-red-500 px-1 text-[9px] leading-4 text-white">
            {files.length}
          </span>
        )}
      </button>

      {canEdit && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          title="Add attachment"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          +
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        onChange={handleUpload}
        className="hidden"
      />

      {busy && uploadingFile && (
        <div className="absolute left-0 top-9 z-30 w-64 rounded border border-slate-200 bg-white p-2 shadow-lg">
          <div className="truncate text-xs text-slate-700">
            Uploading: {uploadingFile.name}
          </div>

          <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-200">
            <div
              className="h-full rounded bg-blue-600 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>

          <div className="mt-1 text-right text-[10px] text-slate-500">
            {uploadProgress}%
          </div>
        </div>
      )}

      {uploadSuccess && !busy && (
        <div className="absolute left-0 top-9 z-30 rounded border border-green-200 bg-white px-2 py-1 text-xs text-green-700 shadow">
          Upload complete
        </div>
      )}

      {error && (
        <div
          className="absolute left-0 top-9 z-30 max-w-xs rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700 shadow"
          title={error}
        >
          {error}
        </div>
      )}
    </div>
  );
}

