import React, { useEffect, useState } from "react";
import { Plus, Search, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { api, dateLabel, number, rupiah, type Row } from "../api";
import { fieldsFor, kindNames, payload } from "../forms";
import { type Page, titles, errorMessage } from "../navigation";
import { Dialog, Alert, Empty } from "../components/ui";
import { FormFields } from "../components/RecordForm";
const columns: Record<string, [string, string, string?][]> = {
  production: [
    ["date", "Tanggal", "date"],
    ["group_name", "Kandang"],
    ["kg", "Berat (kg)", "number"],
    ["estimated_eggs", "Estimasi butir", "number"],
  ],
  expenses: [
    ["date", "Tanggal", "date"],
    ["category_name", "Kategori"],
    ["quantity", "Jumlah", "quantity"],
    ["amount", "Nominal", "money"],
  ],
  sales: [
    ["date", "Tanggal", "date"],
    ["buyer", "Pembeli"],
    ["product_name", "Produk"],
    ["total", "Total", "money"],
    ["outstanding", "Sisa tagihan", "money"],
    ["status", "Status", "status"],
  ],
  debts: [
    ["date", "Tanggal", "date"],
    ["lender", "Pemberi pinjaman"],
    ["amount", "Pinjaman", "money"],
    ["outstanding", "Sisa utang", "money"],
    ["status", "Status", "status"],
  ],
  assets: [
    ["name", "Nama aset"],
    ["type_name", "Jenis"],
    ["remaining_quantity", "Jumlah tersisa", "number"],
    ["book_value", "Nilai buku", "money"],
    ["age_weeks", "Usia (minggu)", "number"],
  ],
  options: [
    ["name", "Nama"],
    ["kind", "Jenis", "kind"],
    ["unit", "Satuan"],
    ["kg_per_sack", "Kg / karung", "number"],
    ["role", "Peran perhitungan"],
  ],
  users: [
    ["username", "Nama pengguna"],
    ["role", "Peran"],
    ["active", "Status", "active"],
    ["must_change_password", "Ganti kata sandi", "boolean"],
  ],
};
function cell(row: Row, key: string, format?: string) {
  const value = row[key];
  if (value == null || value === "") return <span className="muted">—</span>;
  if (format === "money")
    return <span className="tabular">{rupiah(value)}</span>;
  if (format === "number") return number(value, 2);
  if (format === "quantity") return `${number(value, 3)} ${row.unit || ""}`;
  if (format === "date") return dateLabel(value);
  if (format === "kind") return kindNames[value] || value;
  if (format === "status")
    return (
      <span className={`status ${value === "paid" ? "paid" : "unpaid"}`}>
        {value === "paid" ? "Lunas" : "Belum lunas"}
      </span>
    );
  if (format === "active")
    return (
      <span className={`status ${value ? "paid" : "unpaid"}`}>
        {value ? "Aktif" : "Nonaktif"}
      </span>
    );
  if (format === "boolean") return value ? "Wajib" : "Sudah";
  return String(value);
}
export function Records({
  kind,
  admin,
  options,
  onEdit,
  onDetail,
  reload,
}: {
  kind: Page;
  admin: boolean;
  options: Row[];
  onEdit: (row?: Row) => void;
  onDetail: (row: Row) => void;
  reload: number;
}) {
  const [data, setData] = useState<{
    items: Row[];
    count: number;
    total: number;
  } | null>(null);
  const [q, setQ] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [status, setStatus] = useState("");
  const [group, setGroup] = useState("");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setOffset(0);
  }, [q, start, end, status, group]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setError("");
      try {
        const result = await api(
          kind === "users"
            ? `/users?q=${encodeURIComponent(q)}`
            : `/records/${kind}?${new URLSearchParams({ q, ...(start && { start }), ...(end && { end }), ...(status && { status }), ...(group && { group_id: group }), offset: String(offset), limit: "20" })}`,
          "GET",
          undefined,
          controller.signal,
        );
        setData(
          kind === "users"
            ? { items: result, count: result.length, total: 0 }
            : result,
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(errorMessage(e));
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, q, start, end, status, group, offset, reload, version]);
  async function remove(row: Row) {
    if (
      !confirm(
        kind === "users"
          ? `Hapus akses pengguna ${row.username}? Jejak audit tetap disimpan.`
          : "Hapus catatan ini beserta riwayat terkait? Tindakan ini tidak dapat dibatalkan.",
      )
    )
      return;
    try {
      await api(
        kind === "users" ? `/users/${row.id}` : `/records/${kind}/${row.id}`,
        "DELETE",
      );
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <div className="section-line">
        <div>
          <span className="eyebrow green-text">BUKU PETERNAKAN</span>
          <h2>{titles[kind]}</h2>
        </div>
        <button className="button" onClick={() => onEdit()}>
          <Plus size={17} />
          Tambah {kind === "users" ? "pengguna" : "catatan"}
        </button>
      </div>
      <section className="panel records-panel">
        <div className="filter-bar">
          <label className="search-input">
            <Search size={17} />
            <input
              placeholder="Cari catatan…"
              aria-label="Cari catatan"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {!["users", "options"].includes(kind) && (
            <div className="date-filters">
              <input
                type="date"
                aria-label="Dari tanggal"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <span>—</span>
              <input
                type="date"
                aria-label="Sampai tanggal"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          )}
          {["sales", "debts"].includes(kind) && (
            <select
              aria-label="Status pembayaran"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Semua status</option>
              <option value="paid">Lunas</option>
              <option value="unpaid">Belum lunas</option>
            </select>
          )}
          {kind === "production" && (
            <select
              aria-label="Kelompok kandang"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">Semua kandang</option>
              {options
                .filter((o) => o.kind === "group")
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
        {!data ? (
          <div className="loading">Memuat catatan…</div>
        ) : data.items.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {columns[kind].map(([key, label]) => (
                      <th key={key}>{label}</th>
                    ))}
                    <th className="align-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      {columns[kind].map(([key, , format], index) => (
                        <td
                          key={key}
                          className={index === 0 ? "first-cell" : ""}
                        >
                          {cell(row, key, format)}
                        </td>
                      ))}
                      <td>
                        <div className="row-actions">
                          {kind !== "users" && (
                            <button
                              className="text-button"
                              onClick={() => onDetail(row)}
                            >
                              Detail
                            </button>
                          )}
                          <button
                            className="icon-button"
                            title="Ubah"
                            aria-label={`Ubah catatan ${row.id}`}
                            onClick={() => onEdit(row)}
                          >
                            <Pencil size={15} />
                          </button>
                          {admin && (
                            <button
                              className="icon-button danger"
                              title="Hapus"
                              aria-label={`Hapus catatan ${row.id}`}
                              onClick={() => remove(row)}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                {data.count} catatan
                {!["users", "options"].includes(kind) && (
                  <>
                    {" "}
                    · Total{" "}
                    <strong>
                      {kind === "production"
                        ? `${number(data.total)} kg`
                        : rupiah(data.total)}
                    </strong>
                  </>
                )}
              </span>
              <div>
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset((v) => Math.max(0, v - 20))}
                >
                  Sebelumnya
                </button>
                <button
                  disabled={offset + 20 >= data.count}
                  onClick={() => setOffset((v) => v + 20)}
                >
                  Berikutnya
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            title={
              q || start || end || status || group
                ? "Tidak ada catatan yang cocok"
                : "Awal yang baik untuk mulai mencatat"
            }
            text="Catatan Anda akan tersimpan dan terhitung otomatis."
            action={() => onEdit()}
          />
        )}
      </section>
      {kind === "options" && (
        <p className="page-note">
          <ShieldCheck size={15} />
          Pilihan yang dipakai catatan atau perhitungan tidak dapat dihapus.
          Peran khusus tetap sama saat nama diubah.
        </p>
      )}
    </>
  );
}
export function Details({
  kind,
  id,
  admin,
  options,
  today,
  onClose,
  onChanged,
}: {
  kind: string;
  id: number;
  admin: boolean;
  options: Row[];
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Row | null>(null);
  const [values, setValues] = useState<Record<string, any>>({ date: today });
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const history = ["sales", "debts", "assets"].includes(kind);
  const fields = fieldsFor(
    kind === "assets" ? "adjustment" : "payment",
    options,
  );
  useEffect(() => {
    const c = new AbortController();
    api(`/records/${kind}/${id}`, "GET", undefined, c.signal)
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(errorMessage(e));
      });
    return () => c.abort();
  }, [kind, id, version]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/records/${kind}/${id}/history${edit ? `/${edit.id}` : ""}`,
        edit ? "PUT" : "POST",
        payload(fields, values),
      );
      setValues({ date: today });
      setEdit(null);
      setVersion((v) => v + 1);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: Row) {
    if (!confirm("Hapus entri riwayat ini? Saldo akan dihitung ulang.")) return;
    try {
      await api(`/records/${kind}/${id}/history/${row.id}`, "DELETE");
      setVersion((v) => v + 1);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const calculated: Record<string, [string, string][]> = {
    sales: [
      ["paid_amount", "Sudah dibayar"],
      ["outstanding", "Sisa tagihan"],
      ["overpaid", "Kelebihan pembayaran"],
    ],
    debts: [
      ["paid_amount", "Sudah dilunasi"],
      ["outstanding", "Sisa utang"],
      ["overpaid", "Kelebihan pembayaran"],
    ],
    assets: [
      ["purchase_value", "Nilai pembelian"],
      ["monthly_depreciation", "Penyusutan / bulan"],
      ["book_value", "Nilai buku saat ini"],
    ],
  };
  return (
    <Dialog title={`Detail ${titles[kind]?.toLowerCase()}`} onClose={onClose}>
      {error && <Alert>{error}</Alert>}
      {data ? (
        <>
          <div className="detail-grid">
            {columns[kind].map(([key, label, format]) => (
              <div key={key}>
                <small>{label}</small>
                <strong>{cell(data, key, format)}</strong>
              </div>
            ))}
            {(calculated[kind] || []).map(([key, label]) => (
              <div key={key}>
                <small>{label}</small>
                <strong>{rupiah(data[key])}</strong>
              </div>
            ))}
            {kind === "assets" && (
              <div>
                <small>Nilai buku nol pada</small>
                <strong>{dateLabel(data.zero_date)}</strong>
              </div>
            )}
            {kind === "debts" && (
              <>
                <div>
                  <small>Jatuh tempo</small>
                  <strong>
                    {data.due_date
                      ? dateLabel(data.due_date)
                      : "Tidak ditentukan"}
                  </strong>
                </div>
                <div>
                  <small>Bunga (informasi)</small>
                  <strong>{number(data.interest_rate)}%</strong>
                </div>
              </>
            )}
            {kind === "expenses" && (
              <>
                <div>
                  <small>Satuan saat dicatat</small>
                  <strong>{data.unit || "—"}</strong>
                </div>
                <div>
                  <small>Berat tersimpan</small>
                  <strong>
                    {data.kg == null ? "—" : `${number(data.kg)} kg`}
                  </strong>
                </div>
              </>
            )}
            {data.notes && (
              <div className="full">
                <small>Catatan</small>
                <p>{data.notes}</p>
              </div>
            )}
          </div>
          <p className="audit-note">
            Dibuat pengguna #{data.created_by} · Diperbarui pengguna #
            {data.updated_by}
          </p>
          {history && (
            <>
              <h3 className="history-title">
                {kind === "assets"
                  ? "Riwayat pengurangan ternak"
                  : "Riwayat pembayaran"}
              </h3>
              {data.history?.length ? (
                <div className="history-list">
                  {data.history.map((r: Row) => (
                    <div key={r.id}>
                      <div>
                        <strong>
                          {kind === "assets"
                            ? `${number(r.quantity, 0)} ekor · ${{ dead: "Mati", sold: "Dijual", missing: "Hilang" }[r.reason as string] || r.reason}`
                            : rupiah(r.amount)}
                        </strong>
                        <small>
                          {dateLabel(r.date)}
                          {r.notes ? ` · ${r.notes}` : ""}
                        </small>
                      </div>
                      <div className="row-actions">
                        {kind !== "assets" && (
                          <button
                            className="icon-button"
                            aria-label="Ubah pembayaran"
                            onClick={() => {
                              setEdit(r);
                              setValues(r);
                            }}
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        {admin && (
                          <button
                            className="icon-button danger"
                            aria-label="Hapus riwayat"
                            onClick={() => remove(r)}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Belum ada riwayat.</p>
              )}
              {(kind !== "assets" || data.is_chicken) && (
                <form className="history-form" onSubmit={save}>
                  <h3>
                    {edit
                      ? "Ubah pembayaran"
                      : kind === "assets"
                        ? "Catat pengurangan"
                        : "Tambah pembayaran"}
                  </h3>
                  {kind === "assets" && (
                    <p className="form-hint">
                      Pengurangan bersifat tetap. Untuk koreksi, admin dapat
                      menghapus entri. Penjualan ayam juga perlu dicatat
                      terpisah di Penjualan untuk masuk ke pendapatan.
                    </p>
                  )}
                  <FormFields
                    fields={fields}
                    values={values}
                    setValues={setValues}
                  />
                  <button className="button" disabled={busy}>
                    {busy ? "Menyimpan…" : "Simpan riwayat"}
                  </button>
                  {edit && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setEdit(null);
                        setValues({ date: today });
                      }}
                    >
                      Batal ubah
                    </button>
                  )}
                </form>
              )}
            </>
          )}
        </>
      ) : (
        <div className="loading">Memuat detail…</div>
      )}
    </Dialog>
  );
}
