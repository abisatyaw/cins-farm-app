import React, { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { api, number, rupiah, type Row } from "../api";
import { fieldsFor, payload, type Field } from "../forms";
import { titles, errorMessage } from "../navigation";
import { Dialog, Alert } from "./ui";
export function FormFields({
  fields,
  values,
  setValues,
}: {
  fields: Field[];
  values: Record<string, any>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  return (
    <div className="form-grid">
      {fields.map((f) => (
        <label
          className={
            f.type === "textarea" || f.type === "checkbox" ? "full" : ""
          }
          key={f.name}
        >
          {f.type !== "checkbox" && (
            <span>
              {f.label}
              {!f.optional && <b> *</b>}
            </span>
          )}
          {f.type === "select" ? (
            <select
              aria-label={f.label}
              required={!f.optional}
              disabled={f.disabled}
              value={values[f.name] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.name]: e.target.value }))
              }
            >
              <option value="">
                {f.optional ? "Tidak dipilih" : "Pilih…"}
              </option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              aria-label={f.label}
              maxLength={2000}
              value={values[f.name] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.name]: e.target.value }))
              }
            />
          ) : f.type === "checkbox" ? (
            <span className="checkbox">
              <input
                aria-label={f.label}
                type="checkbox"
                checked={!!values[f.name]}
                disabled={f.disabled}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.name]: e.target.checked }))
                }
              />
              {f.label}
            </span>
          ) : (
            <input
              aria-label={f.label}
              required={!f.optional}
              disabled={f.disabled}
              type={f.type || "text"}
              min={f.min}
              max={f.max}
              step={f.step}
              maxLength={f.type === "password" ? 256 : 120}
              value={values[f.name] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.name]: e.target.value }))
              }
            />
          )}
          {f.help && <small>{f.help}</small>}
        </label>
      ))}
    </div>
  );
}
export function RecordForm({
  kind,
  row,
  options,
  today,
  onSave,
  onClose,
}: {
  kind: string;
  row?: Row;
  options: Row[];
  today: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const fields = fieldsFor(kind, options, !!row);
  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.name,
        row?.[f.name] ??
          (f.name === "date"
            ? today
            : (f.default ?? (f.type === "checkbox" ? false : ""))),
      ]),
    ),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  useEffect(() => {
    if (!["sales", "expenses"].includes(kind)) return;
    setPreview(null);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api(
        `/records/${kind}/preview`,
        "POST",
        payload(fieldsFor(kind, options, !!row), values),
        controller.signal,
      )
        .then(setPreview)
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values, kind, options, row]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        kind === "users"
          ? `/users${row ? `/${row.id}` : ""}`
          : `/records/${kind}${row ? `/${row.id}` : ""}`,
        row ? "PUT" : "POST",
        payload(fields, values),
      );
      onSave();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={`${row ? "Ubah" : "Tambah"} ${titles[kind]?.toLowerCase() || "catatan"}`}
      onClose={onClose}
    >
      <form onSubmit={save}>
        {kind === "expenses" && (
          <p className="form-hint">
            Kategori jumlah: isi jumlah dan harga satuan. Pakan juga memerlukan
            jenis pakan. Nominal dihitung otomatis.
          </p>
        )}
        {kind === "assets" && (
          <p className="form-hint">
            Pengurangan ayam dicatat dari detail aset. Nilai buku berkurang
            proporsional; penyusutan berjalan bulanan sejak pembelian.
          </p>
        )}
        {kind === "options" && (
          <p className="form-hint">
            Peran perhitungan bawaan tetap aman saat nama diubah. Satuan
            kategori disalin saat transaksi disimpan.
          </p>
        )}
        <FormFields
          fields={fields.map((f) => ({
            ...f,
            disabled:
              (kind === "expenses" &&
                f.name === "amount" &&
                !!options.find((o) => o.id === Number(values.category_id))
                  ?.tracks_quantity) ||
              (kind === "sales" &&
                f.name === "first_payment" &&
                !!values.paid_in_full),
          }))}
          values={values}
          setValues={setValues}
        />
        {preview && (
          <div className="preview">
            <span>Hasil perhitungan server</span>
            <strong>{rupiah(preview.total ?? preview.amount)}</strong>
            {preview.kg != null && (
              <small>
                {number(preview.kg)} kg · {preview.unit}
              </small>
            )}
          </div>
        )}
        {row && kind === "sales" && (
          <p className="form-hint">
            Perubahan penjualan tidak mengubah pembayaran. Kelola pembayaran di
            detail.
          </p>
        )}
        {error && <Alert>{error}</Alert>}
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            Batal
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan catatan"}
            <ArrowRight size={16} />
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
