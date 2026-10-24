import React, { useEffect, useRef } from "react";
import { Sprout, CheckCircle2, AlertCircle, Plus, X } from "lucide-react";
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Sprout size={25} />
      </span>
      <span>
        Cins<span className="brand-light">farm</span>
        <small>CATATAN YANG MENUMBUHKAN</small>
      </span>
    </div>
  );
}
export function Alert({
  children,
  good = false,
}: {
  children: React.ReactNode;
  good?: boolean;
}) {
  return (
    <div role="status" className={`alert ${good ? "success" : ""}`}>
      {good ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <span>{children}</span>
    </div>
  );
}
export function Empty({
  title = "Belum ada catatan",
  text = "Mulai tambahkan catatan pertama Anda.",
  action,
}: {
  title?: string;
  text?: string;
  action?: () => void;
}) {
  return (
    <div className="empty">
      <span>
        <Sprout size={30} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button small" onClick={action}>
          <Plus size={16} />
          Tambah catatan
        </button>
      )}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      "input,select,button",
    );
    first?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = [
          ...(ref.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,select,textarea,a[href]",
          ) || []),
        ];
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="dialog"
      >
        <header>
          <div>
            <small>CINS FARM · CATATAN</small>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button className="icon-button" aria-label="Tutup" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
