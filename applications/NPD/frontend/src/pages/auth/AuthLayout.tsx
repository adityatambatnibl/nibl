


import type { ReactNode } from "react";

/** Centred card used by the SSO landing page. The 3D bearing that used to
 *  sit beside it went with the login screens. */
export default function AuthLayout({
  children,
  subtitle = "New Product Development",
}: {
  children: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <img src="/nrb-logo.jpg" alt="NRB Industrial" className="h-12" />
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[2px] text-slate-500">
          {subtitle}
        </p>
        <div className="mt-4 h-[3px] w-full bg-brand-700" />
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </div>
  );
}