import type { Row } from "./api";
export type Field = {
  name: string;
  label: string;
  type?: string;
  disabled?: boolean;
  options?: { value: string | number; label: string }[];
  optional?: boolean;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  default?: string | boolean | number;
};
const text = (name: string, label: string, optional = false): Field => ({
  name,
  label,
  optional,
});
const money = (name: string, label: string, optional = false): Field => ({
  name,
  label,
  type: "number",
  min: 0,
  step: 1,
  optional,
});
const qty = (name: string, label: string, optional = false): Field => ({
  name,
  label,
  type: "number",
  min: 0.001,
  step: 0.001,
  optional,
});
export const kindNames: Record<string, string> = {
  asset_type: "Jenis aset",
  group: "Kelompok ayam",
  product: "Produk",
  unit: "Satuan",
  category: "Kategori biaya",
  feed_type: "Jenis pakan",
};
export function fieldsFor(
  kind: string,
  options: Row[],
  editing = false,
): Field[] {
  const select = (
    name: string,
    label: string,
    optionKind: string,
    optional = false,
  ): Field => ({
    name,
    label,
    type: "select",
    options: options
      .filter((o) => o.kind === optionKind)
      .map((o) => ({ value: o.id, label: o.name })),
    optional,
  });
  const date: Field = { name: "date", label: "Tanggal", type: "date" };
  const notes: Field = {
    name: "notes",
    label: "Catatan",
    type: "textarea",
    optional: true,
  };
  switch (kind) {
    case "production":
      return [
        date,
        select("group_id", "Kelompok kandang", "group"),
        qty("kg", "Berat telur (kg)"),
        notes,
      ];
    case "expenses":
      return [
        date,
        select("category_id", "Kategori", "category"),
        money("amount", "Nominal manual (Rp)", true),
        qty("quantity", "Jumlah", true),
        money("unit_price", "Harga satuan (Rp)", true),
        select("feed_type_id", "Jenis pakan", "feed_type", true),
        notes,
      ];
    case "sales":
      return [
        date,
        text("buyer", "Nama pembeli"),
        select("product_id", "Produk", "product"),
        qty("quantity", "Jumlah"),
        select("unit_id", "Satuan", "unit"),
        money("unit_price", "Harga satuan (Rp)"),
        ...(!editing
          ? [
              {
                name: "paid_in_full",
                label: "Dibayar lunas",
                type: "checkbox",
              },
              money("first_payment", "Pembayaran awal (Rp)", true),
            ]
          : []),
        notes,
      ];
    case "debts":
      return [
        date,
        text("lender", "Nama pemberi pinjaman"),
        money("amount", "Nominal pinjaman (Rp)"),
        {
          name: "due_date",
          label: "Jatuh tempo",
          type: "date",
          optional: true,
        },
        {
          name: "interest_rate",
          label: "Bunga (%) — informasi saja",
          type: "number",
          min: 0,
          max: 1000,
          step: 0.001,
          default: 0,
        },
        notes,
      ];
    case "assets":
      return [
        text("name", "Nama aset / kelompok ternak"),
        select("type_id", "Jenis aset", "asset_type"),
        select(
          "group_id",
          "Kelompok kandang (wajib untuk ayam)",
          "group",
          true,
        ),
        qty("quantity", "Jumlah awal"),
        money("unit_price", "Harga per unit (Rp)"),
        date,
        {
          name: "depreciation_months",
          label: "Masa penyusutan (bulan)",
          type: "number",
          min: 1,
          max: 1200,
          step: 1,
        },
        {
          name: "age_weeks_at_purchase",
          label: "Usia ayam saat beli (minggu)",
          type: "number",
          min: 0,
          max: 1000,
          default: 0,
        },
        notes,
      ];
    case "options":
      return [
        {
          name: "kind",
          label: "Jenis pilihan",
          type: "select",
          options: Object.entries(kindNames).map(([value, label]) => ({
            value,
            label,
          })),
        },
        text("name", "Nama"),
        text("unit", "Satuan kategori (contoh: Karung)", true),
        {
          name: "tracks_quantity",
          label: "Kategori menghitung jumlah × harga",
          type: "checkbox",
        },
        qty("kg_per_sack", "Kg per karung (jenis pakan)", true),
      ];
    case "users":
      return [
        text("username", "Nama pengguna"),
        ...(!editing
          ? [
              {
                name: "password",
                label: "Kata sandi awal (min. 10 karakter)",
                type: "password",
              },
            ]
          : []),
        {
          name: "role",
          label: "Peran",
          type: "select",
          options: [
            { value: "user", label: "Pengguna" },
            { value: "admin", label: "Admin" },
          ],
          default: "user",
        },
        ...(editing
          ? [
              {
                name: "active",
                label: "Akun aktif",
                type: "checkbox",
                default: true,
              },
            ]
          : []),
      ];
    case "payment":
      return [date, money("amount", "Jumlah pembayaran (Rp)"), notes];
    case "adjustment":
      return [
        date,
        {
          name: "reason",
          label: "Alasan pengurangan",
          type: "select",
          options: [
            { value: "dead", label: "Mati" },
            { value: "sold", label: "Dijual" },
            { value: "missing", label: "Hilang" },
          ],
        },
        { ...qty("quantity", "Jumlah ayam (ekor)"), min: 1, step: 1 },
        notes,
      ];
    default:
      return [];
  }
}
export function payload(
  fields: Field[],
  values: Record<string, any>,
): Record<string, any> {
  return Object.fromEntries(
    fields.map((f) => {
      const value = values[f.name];
      if (f.type === "checkbox") return [f.name, !!value];
      if (f.name === "first_payment")
        return [f.name, values.paid_in_full ? 0 : Number(value || 0)];
      if ((value === "" || value === undefined) && f.optional)
        return [
          f.name,
          ["notes", "unit"].includes(f.name)
            ? f.name === "notes"
              ? ""
              : null
            : null,
        ];
      if (
        f.name.endsWith("_id") ||
        [
          "unit_price",
          "amount",
          "depreciation_months",
          "age_weeks_at_purchase",
        ].includes(f.name)
      )
        return [f.name, value === "" ? null : Number(value)];
      return [f.name, value ?? ""];
    }),
  );
}
