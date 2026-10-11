// src/components/Modal.tsx
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Dialog shell: escape to close, backdrop click to close, body scroll locked
 * while open, focus moved in on open and returned to the trigger on close.
 *
 * onClose is held in a ref so the effect can run on mount only. If it were in
 * the dependency array, every keystroke in the parent would re-run the effect
 * and pull focus out of whatever input you were typing into.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

    const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      returnTo.current?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`max-h-[90vh] w-full ${width} overflow-y-auto rounded-lg bg-white p-6 shadow-xl outline-none`}
      >
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

/** Error line for use inside a modal, so failures aren't hidden behind it. */
export function ModalError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {children}
    </p>
  );
}