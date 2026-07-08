"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error" | "info" | "loading";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms before auto-dismiss. `loading` toasts never auto-dismiss. Default 4000. */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, "duration">> {
  id: string;
  duration: number;
}

interface ToastApi {
  /** Show a toast; returns its id so you can `update`/`dismiss` it later. */
  toast: (opts: ToastOptions) => string;
  /** Patch an existing toast (e.g. turn a `loading` toast into `success`). */
  update: (id: string, opts: Partial<ToastOptions>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const ACCENT: Record<ToastVariant, string> = {
  success: "border-l-emerald-500",
  error: "border-l-red-500",
  info: "border-l-wax-500",
  loading: "border-l-wax-500",
};

function Glyph({ variant }: { variant: ToastVariant }) {
  const cls = "h-4 w-4 shrink-0";
  if (variant === "loading")
    return <span className={`${cls} mt-0.5 animate-spin rounded-full border-2 border-neutral-600 border-t-wax-500`} />;
  const color =
    variant === "success" ? "text-emerald-400" : variant === "error" ? "text-red-400" : "text-wax-500";
  const path =
    variant === "success"
      ? "M20 6 9 17l-5-5"
      : variant === "error"
        ? "M18 6 6 18M6 6l12 12"
        : "M12 8v4m0 4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z";
  return (
    <svg className={`${cls} mt-0.5 ${color}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const arm = useCallback(
    (id: string, variant: ToastVariant, duration: number) => {
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      if (variant === "loading") {
        timers.current.delete(id);
        return;
      }
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    },
    [dismiss],
  );

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = Math.random().toString(36).slice(2);
      const item: ToastItem = {
        id,
        title: opts.title,
        description: opts.description ?? "",
        variant: opts.variant ?? "info",
        duration: opts.duration ?? 4000,
      };
      setToasts((list) => [...list, item]);
      arm(id, item.variant, item.duration);
      return id;
    },
    [arm],
  );

  const update = useCallback(
    (id: string, opts: Partial<ToastOptions>) => {
      setToasts((list) =>
        list.map((t) => {
          if (t.id !== id) return t;
          const next: ToastItem = {
            ...t,
            ...opts,
            description: opts.description ?? t.description,
            duration: opts.duration ?? 4000,
          };
          arm(id, next.variant, next.duration);
          return next;
        }),
      );
    },
    [arm],
  );

  const api = useMemo<ToastApi>(() => ({ toast, update, dismiss }), [toast, update, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-end sm:pr-4"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live={t.variant === "error" ? "assertive" : "polite"}
            className={`animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-neutral-800 border-l-4 ${ACCENT[t.variant]} bg-neutral-900/95 px-3.5 py-3 shadow-lg shadow-black/40 backdrop-blur`}
          >
            <Glyph variant={t.variant} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100">{t.title}</p>
              {t.description ? (
                <p className="mt-0.5 break-words text-xs text-neutral-400">{t.description}</p>
              ) : null}
            </div>
            {t.variant !== "loading" ? (
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-neutral-500 hover:text-neutral-200"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
