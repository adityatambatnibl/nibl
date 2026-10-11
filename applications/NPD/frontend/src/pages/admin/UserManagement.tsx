// src/pages/admin/UserManagement.tsx
import { useCallback, useState } from "react";
import { userApi } from "../../services/userApi";
import { apiError } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import { useFetch } from "../../hooks/useFetch";
import { Loading } from "../../components/Loading";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Modal, ModalError } from "../../components/Modal";
import { formatDateTime } from "../../utils/formatters";
import { PERMISSION_LABELS } from "../../utils/constants";
import type { UserListItem } from "../../types";

export default function UserManagement() {
  const { user: me } = useAuth();

  const listUsers = useCallback(() => userApi.list(), []);
  const listPerms = useCallback(() => userApi.availablePermissions(), []);

  const { data, loading, error, setData, setError, } = useFetch(listUsers);  
  const { data: allPerms, error: permsError } = useFetch(listPerms);

  const [query, setQuery] = useState("");

  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [editError, setEditError] = useState("");
  const [savingPerms, setSavingPerms] = useState(false);

  const [deleting, setDeleting] = useState<UserListItem | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletingBusy, setDeletingBusy] = useState(false);


  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  // const [syncBusy, setSyncBusy] = useState(false);
  // const [syncMsg, setSyncMsg] = useState("");

  const users = data ?? [];
  const visible = query.trim()
    ? users.filter((u) => {
        const q = query.trim().toLowerCase();
        return (
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
        );
      })
    : users;

  const isSelf = (u: UserListItem) => !!me && u.id === me.id;

  function replace(u: UserListItem) {
    setData((list) => (list ?? []).map((x) => (x.id === u.id ? u : x)));
  }

  function setBusyFor(id: string, v: boolean) {
    setRowBusy((m) => ({ ...m, [id]: v }));
  }

    /* ---------------- supabase sync ---------------- */

  /* ---------------- permissions ---------------- */
  function openEditor(u: UserListItem) {
    setEditing(u);
    // Drop anything the backend no longer knows about. A renamed permission
    // still sits in the stored list and has no checkbox, so it would be sent
    // straight back on save and rejected.
    setDraft(u.permissions.filter((p) => (allPerms ?? []).includes(p)));
    setEditError("");
  }

  function toggle(perm: string) {
    setDraft((d) =>
      d.includes(perm) ? d.filter((p) => p !== perm) : [...d, perm]
    );
  }

  async function savePermissions() {
    if (!editing) return;
    setSavingPerms(true);
    setEditError("");
    try {
      replace(await userApi.setPermissions(editing.id, draft));
      setEditing(null);
    } catch (err) {
      setEditError(apiError(err));
    } finally {
      setSavingPerms(false);
    }
  }

  /* ---------------- inline row actions ---------------- */
  async function toggleActive(u: UserListItem) {
    if (isSelf(u) || rowBusy[u.id]) return;
    setError("");
    setBusyFor(u.id, true);
    try {
      replace(await userApi.setActive(u.id, !u.is_active));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyFor(u.id, false);
    }
  }

  async function changeRole(u: UserListItem, role: string) {
    if (isSelf(u) || rowBusy[u.id] || role === u.role) return;
    setError("");
    setBusyFor(u.id, true);
    try {
      replace(await userApi.setRole(u.id, role));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyFor(u.id, false);
    }
  }

  /* ---------------- delete ---------------- */
  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    setDeleteError("");
    try {
      await userApi.remove(deleting.id);
      setData((list) => (list ?? []).filter((u) => u.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setDeleteError(apiError(err));
    } finally {
      setDeletingBusy(false);
    }
  }

  /* ---------------- shared classes ---------------- */
  const smallBtn =
    "whitespace-nowrap rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
  const dangerBtn =
    "whitespace-nowrap rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30";
  const selectCls =
    "rounded border border-slate-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

  const deleteTitle = (u: UserListItem) =>
    isSelf(u)
      ? "You cannot delete your own account."
      : u.can_delete
        ? "Permanently delete this account"
        : "This user has created records. Deactivate instead.";

  /* ---------------- render ---------------- */
  return (
    <div className="pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Users</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage roles, permissions and account access.
          </p>
        </div>

        {/* Sits outside the loading/empty branches on purpose - you most
            need to import when the list is empty. */}
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          {/* <button
            onClick={syncSupabase}
            disabled={syncBusy}
            className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-600 hover:text-brand-700 disabled:opacity-40"
          >
            {syncBusy ? " " : " "}
          </button>
          {syncMsg && (
            <span className="max-w-xs text-xs text-slate-500">{syncMsg}</span>
          )} */}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {loading ? (
        <Loading />
      ) : users.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-900">No users yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Accounts appear here once someone requests access.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex items-center justify-between gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email"
              className="w-full max-w-xs rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600"
            />
            <p className="shrink-0 text-xs text-slate-500">
              {visible.length} of {users.length}
            </p>
          </div>

          {visible.length === 0 && (
            <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
              No users match “{query.trim()}”.
            </p>
          )}

          {/* ---------------- Mobile: cards ---------------- */}
          <div className="mt-4 space-y-3 lg:hidden">
            {visible.map((u) => (
              <div
                key={u.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {u.name}
                    {isSelf(u) && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        You
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-slate-500">{u.email}</p>
                </div>

                <div className="mt-2 flex flex-row flex-wrap items-center gap-1.5">
                  <StatusBadge value={u.status} />
                  <StatusBadge value={u.is_active ? "active" : "inactive"} />
                  <span className="text-xs text-slate-400">
                    Last login: {formatDateTime(u.last_login)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <select
                    value={u.role}
                    disabled={isSelf(u) || rowBusy[u.id]}
                    onChange={(e) => changeRole(u, e.target.value)}
                    className={`${selectCls} py-1.5`}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    onClick={() => toggleActive(u)}
                    disabled={isSelf(u) || rowBusy[u.id]}
                    className={smallBtn}
                  >
                    {u.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => openEditor(u)} className={smallBtn}>
                    Permissions
                  </button>
                  <button
                    onClick={() => {
                      setDeleting(u);
                      setDeleteError("");
                    }}
                    disabled={!u.can_delete || isSelf(u)}
                    className={`${dangerBtn} col-span-2`}
                  >
                    Delete
                  </button>
                </div>

                {(isSelf(u) || !u.can_delete) && (
                  <p className="mt-2 text-xs text-slate-400">{deleteTitle(u)}</p>
                )}
              </div>
            ))}
          </div>

          {/* ---------------- Desktop: table ---------------- */}
          {visible.length > 0 && (
            <div className="mt-4 hidden overflow-x-auto rounded-lg border border-slate-200 bg-white lg:block">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">Email</th>
                    <th className="px-3 py-2.5 font-medium">Role</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Last login</th>
                    <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((u) => (
                    <tr key={u.id} className={`align-middle hover:bg-slate-50/60 ${rowBusy[u.id] ? "opacity-60" : ""}`}>
                      <td
                        className="max-w-[180px] truncate px-3 py-2.5 font-medium text-slate-900"
                        title={u.name}
                      >
                        {u.name}
                        {isSelf(u) && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                            You
                          </span>
                        )}
                      </td>

                      <td
                        className="max-w-[200px] truncate px-3 py-2.5 text-slate-600"
                        title={u.email}
                      >
                        {u.email}
                      </td>

                      <td className="px-3 py-2.5">
                        <select
                          value={u.role}
                          disabled={isSelf(u) || rowBusy[u.id]}
                          title={
                            isSelf(u)
                              ? "You cannot change your own role."
                              : undefined
                          }
                          onChange={(e) => changeRole(u, e.target.value)}
                          className={selectCls}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>

                      {/* approval + account state share one column */}
                      <td className="px-3 py-2.5">
                        <div className="flex flex-nowrap items-center gap-1.5">
                          <StatusBadge value={u.status} />
                          <StatusBadge
                            value={u.is_active ? "active" : "inactive"}
                          />
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                        {formatDateTime(u.last_login)}
                      </td>

                      {/* all actions on one line */}
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <div className="flex flex-nowrap items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditor(u)}
                            className={smallBtn}
                          >
                            Permissions
                          </button>
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={isSelf(u) || rowBusy[u.id]}
                            title={
                              isSelf(u)
                                ? "You cannot deactivate your own account."
                                : undefined
                            }
                            className={smallBtn}
                          >
                            {u.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            onClick={() => {
                              setDeleting(u);
                              setDeleteError("");
                            }}
                            disabled={!u.can_delete || isSelf(u)}
                            title={deleteTitle(u)}
                            className={dangerBtn}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ---------------- permissions dialog ---------------- */}
      {editing && (
        <Modal
          title="Permissions"
          subtitle={`${editing.name} — ${editing.email}`}
          onClose={() => setEditing(null)}
        >
          {editing.role === "admin" && (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Admins have full access regardless of these settings.
            </div>
          )}

          {permsError || !allPerms ? (
            <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              The permission list didn't load, so nothing can be saved here yet.
              Reload the page and try again.
            </p>
          ) : (
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {allPerms.map((p) => (
                <label
                  key={p}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={draft.includes(p)}
                    onChange={() => toggle(p)}
                  />
                  {PERMISSION_LABELS[p] ?? p}
                </label>
              ))}
            </div>
          )}

          <ModalError>{editError}</ModalError>

          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => setEditing(null)}
              disabled={savingPerms}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={savePermissions}
              disabled={savingPerms || !allPerms}
              className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingPerms ? "Saving…" : "Save"}
            </button>
          </div>
        </Modal>
      )}

      {/* ---------------- delete dialog ---------------- */}
      {deleting && (
        <ConfirmDialog
          title="Delete user"
          message={
            <>
              <p>
                Permanently delete <strong>{deleting.name}</strong> (
                {deleting.email})?
              </p>
              <p className="mt-2">
                This cannot be undone. The audit history is kept.
              </p>
            </>
          }
          requireText={deleting.email}
          busy={deletingBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}