import {
  LayoutDashboard,
  Egg,
  Wallet,
  TrendingUp,
  Banknote,
  Feather,
  ClipboardList,
  Settings2,
  Users,
} from "lucide-react";
export type Page =
  | "dashboard"
  | "production"
  | "expenses"
  | "sales"
  | "debts"
  | "assets"
  | "reports"
  | "options"
  | "users";
export const pages = [
  {
    id: "dashboard",
    label: "Ringkasan",
    icon: LayoutDashboard,
    sub: "Satu pandangan untuk peternakan Anda.",
  },
  {
    id: "production",
    label: "Produksi telur",
    icon: Egg,
    sub: "Setiap hasil panen, tercatat dengan baik.",
  },
  {
    id: "expenses",
    label: "Pengeluaran",
    icon: Wallet,
    sub: "Kenali biaya, jaga pertumbuhan usaha.",
  },
  {
    id: "sales",
    label: "Penjualan",
    icon: TrendingUp,
    sub: "Penjualan dan pembayaran dalam satu tempat.",
  },
  {
    id: "debts",
    label: "Utang & pinjaman",
    icon: Banknote,
    sub: "Pantau pinjaman dan riwayat pelunasan.",
  },
  {
    id: "assets",
    label: "Aset & ternak",
    icon: Feather,
    sub: "Rawat ternak, pahami nilai aset Anda.",
  },
  {
    id: "reports",
    label: "Laporan keuangan",
    icon: ClipboardList,
    sub: "Angka yang membantu mengambil langkah berikutnya.",
  },
  {
    id: "options",
    label: "Daftar pilihan",
    icon: Settings2,
    sub: "Atur kategori, kandang, satuan, dan jenis pakan.",
    admin: true,
  },
  {
    id: "users",
    label: "Pengguna",
    icon: Users,
    sub: "Kelola orang yang merawat peternakan Anda.",
    admin: true,
  },
];
export const titles = Object.fromEntries(pages.map((p) => [p.id, p.label]));
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Terjadi kesalahan.";
