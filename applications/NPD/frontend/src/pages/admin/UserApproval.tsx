import { useState } from "react";
import { userApi } from "../../services/userApi";
import { apiError } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Loading } from "../../components/Loading";
import { formatDateTime } from "../../utils/formatters";

export default function UserApproval() {
  const { data, loading, error, setData, setError } = useFetch(() => userApi.list("pending"));
  const [busyId, setBusyId] = useState("");

  const users = data ?? [];

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError("");
    try {
      await (action === "approve" ? userApi.approve(id) : userApi.reject(id));
      setData((list) => (list ?? []).filter((u) => u.id !== id));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId("");
    }
  }
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Account Approvals</h1>
      <p className="mt-1 text-sm text-slate-500">Review and action pending access requests.</p>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

            {loading ? (
        <Loading />
      ) : users.length === 0 ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No pending requests</p>
          <p className="mt-1 text-sm text-slate-500">New sign-up requests will appear here.</p>
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="mt-6 space-y-3 lg:hidden">
            {users.map((u) => (
              <div key={u.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-medium text-slate-900">{u.name}</p>
                <p className="truncate text-sm text-slate-500">{u.email}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Requested {formatDateTime(u.created_at)}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => act(u.id, "approve")}
                    disabled={busyId === u.id}
                    className="flex-1 rounded bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => act(u.id, "reject")}
                    disabled={busyId === u.id}
                    className="flex-1 rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="mt-6 hidden overflow-hidden rounded-lg border border-slate-200 bg-white lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(u.created_at)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => act(u.id, "approve")}
                        disabled={busyId === u.id}
                        className="rounded bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => act(u.id, "reject")}
                        disabled={busyId === u.id}
                        className="ml-2 rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}