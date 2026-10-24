import { useEffect, useState } from "react";
import {
  CalendarDays,
  Plus,
  Wheat,
  ArrowUpRight,
  ArrowDownLeft,
  CircleDollarSign,
  Egg,
  Package,
  ArrowRight,
  Wallet,
  Users,
  CheckCircle2,
  Banknote,
  ChevronRight,
  Leaf,
  RefreshCw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, dateLabel, number, rupiah } from "../api";
import { type Page, errorMessage } from "../navigation";
import { Alert, Empty } from "../components/ui";
function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "green",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Egg;
  tone?: string;
}) {
  return (
    <article className="metric">
      <div>
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}>
          <Icon size={19} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
const chartTooltip = {
  border: "1px solid #e6e9e2",
  borderRadius: 10,
  fontSize: 12,
};
export function Dashboard({
  go,
  reload,
}: {
  go: (p: Page) => void;
  reload: number;
}) {
  const [period, setPeriod] = useState("month");
  const [weekly, setWeekly] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [market, setMarket] = useState(
    "Sumber harga Bantul/Yogyakarta belum dikonfigurasi.",
  );
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    if (period === "custom" && (!start || !end)) return;
    setError("");
    setData(null);
    api(
      `/dashboard?period=${period}${period === "custom" ? `&start=${start}&end=${end}` : ""}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [period, start, end, reload]);
  async function refresh() {
    setRefreshing(true);
    try {
      await api("/market-prices/refresh", "POST");
    } catch (e) {
      setMarket(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <>
      <div className="section-line">
        <div>
          <span className="eyebrow green-text">KABAR PETERNAKAN</span>
          <h2>Yang tumbuh hari ini.</h2>
        </div>
        <div className="period-controls">
          <CalendarDays size={16} />
          <select
            aria-label="Periode ringkasan"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="today">Hari ini</option>
            <option value="week">Minggu ini</option>
            <option value="month">Bulan ini</option>
            <option value="year">Tahun ini</option>
            <option value="custom">Rentang tanggal</option>
          </select>
          {period === "custom" && (
            <>
              <input
                aria-label="Tanggal awal"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <input
                aria-label="Tanggal akhir"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </>
          )}
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {!data ? (
        <div className="panel loading">
          {error
            ? "Ringkasan belum dapat dimuat."
            : period === "custom" && (!start || !end)
              ? "Pilih tanggal awal dan akhir."
              : "Memuat catatan peternakan…"}
        </div>
      ) : (
        <>
          <div className="welcome-banner">
            <div>
              <span className="eyebrow">LANGKAH KECIL, HASIL YANG BERARTI</span>
              <h3>Catatan rapi. Keputusan lebih pasti.</h3>
              <p>
                {dateLabel(data.start)} — {dateLabel(data.end)} · Waktu Jakarta
              </p>
            </div>
            <button className="button light" onClick={() => go("production")}>
              Catat produksi
              <Plus size={16} />
            </button>
            <Wheat className="banner-wheat" />
          </div>
          <div className="metrics">
            <Metric
              label="Penjualan"
              value={rupiah(data.sales)}
              detail="Total penjualan pada periode ini"
              icon={ArrowUpRight}
            />
            <Metric
              label="Pengeluaran"
              value={rupiah(data.expenses)}
              detail="Biaya yang sudah dicatat"
              icon={ArrowDownLeft}
              tone="orange"
            />
            <Metric
              label="Margin usaha"
              value={rupiah(data.margin)}
              detail="Penjualan dikurangi pengeluaran"
              icon={CircleDollarSign}
              tone="blue"
            />
            <Metric
              label="Produksi telur"
              value={`${number(data.production_kg)} kg`}
              detail={`≈ ${number(data.estimated_eggs, 0)} butir telur`}
              icon={Egg}
              tone="yellow"
            />
          </div>
          <div className="dashboard-grid">
            <section className="panel production-chart">
              <div className="panel-heading">
                <div>
                  <h3>Hasil yang terus bertumbuh</h3>
                  <p>Produksi telur dalam kilogram</p>
                </div>
                <button
                  className="pill"
                  onClick={() => setWeekly((v) => !v)}
                  title="Ganti tren harian/bulanan dan mingguan"
                >
                  <span className="dot" />
                  {weekly ? "Mingguan" : "Tren periode"}
                </button>
              </div>
              {data.production_trend.length ? (
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={
                        weekly ? data.production_weeks : data.production_trend
                      }
                      margin={{ left: -20, right: 12, top: 15 }}
                    >
                      <defs>
                        <linearGradient
                          id="production-fill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#6a986b"
                            stopOpacity={0.28}
                          />
                          <stop
                            offset="100%"
                            stopColor="#6a986b"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#edf0e9" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip contentStyle={chartTooltip} />
                      <Area
                        name="Produksi (kg)"
                        dataKey="kg"
                        type="monotone"
                        stroke="#48764e"
                        fill="url(#production-fill)"
                        strokeWidth={2.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty
                  title="Kisah produksi dimulai di sini"
                  text="Catat hasil telur pertama untuk melihat trennya."
                  action={() => go("production")}
                />
              )}
              <div className="group-line">
                {data.by_group.map((g: any) => (
                  <div key={g.name}>
                    <span className="dot" />
                    {g.name}
                    <strong>{number(g.kg)} kg</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel stock-card">
              <div className="panel-heading">
                <div>
                  <h3>Persediaan telur</h3>
                  <p>Akumulasi sampai akhir periode</p>
                </div>
                <Package size={20} />
              </div>
              <div className="stock-illustration">
                <Egg size={66} strokeWidth={1} />
                <Egg size={49} strokeWidth={1} />
              </div>
              <strong className="stock-value">
                {number(data.stock_kg)}
                <small>kg</small>
              </strong>
              <p className="muted">
                Setara {number(data.stock_boxes, 2)} kotak
              </p>
              <div className="stock-formula">
                Produksi + pembelian − penjualan
              </div>
              {Number(data.stock_kg) < 0 && (
                <Alert>
                  Stok negatif. Periksa catatan produksi dan pembelian.
                </Alert>
              )}
              <button className="text-button" onClick={() => go("sales")}>
                Lihat penjualan
                <ArrowRight size={15} />
              </button>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Pengeluaran mingguan</h3>
                  <p>Delapan minggu terakhir</p>
                </div>
                <Wallet size={19} />
              </div>
              <div className="chart small-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.expense_weeks.map((w: any) => ({
                      date: w.date.slice(5),
                      ...w.categories,
                    }))}
                    margin={{ left: 5, right: 5, top: 12 }}
                  >
                    <CartesianGrid vertical={false} stroke="#edf0e9" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${number(Number(v) / 1000, 0)}k`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={chartTooltip} />
                    {Array.from(
                      new Set<string>(
                        data.expense_weeks.flatMap((w: any) =>
                          Object.keys(w.categories),
                        ),
                      ),
                    ).map((c, i) => (
                      <Bar
                        key={c}
                        dataKey={c}
                        stackId="cost"
                        fill={
                          [
                            "#547755",
                            "#adc396",
                            "#d3ac71",
                            "#8ca8ad",
                            "#a294b1",
                          ][i % 5]
                        }
                        maxBarSize={26}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Piutang pelanggan</h3>
                  <p>Sisa tagihan sampai akhir periode</p>
                </div>
                <Users size={19} />
              </div>
              <div className="receivable-total">{rupiah(data.receivables)}</div>
              {data.customers.length ? (
                <div className="customer-list">
                  {data.customers.slice(0, 5).map((c: any) => (
                    <div key={c.name}>
                      <span className="avatar">{c.name[0]}</span>
                      <span>{c.name}</span>
                      <strong>{rupiah(c.outstanding)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="subtle-state">
                  <CheckCircle2 size={18} />
                  Tidak ada piutang pelanggan.
                </p>
              )}
              <button className="text-button" onClick={() => go("sales")}>
                Lihat semua penjualan
                <ArrowRight size={15} />
              </button>
            </section>
          </div>
          <div className="bottom-cards">
            <section className="panel mini-stat">
              <span className="soft-icon">
                <Wheat size={22} />
              </span>
              <div>
                <span>Konversi pakan · FCR</span>
                <strong>
                  {data.fcr == null ? "Belum tersedia" : number(data.fcr, 2)}
                </strong>
                <small>
                  Target ≤ {number(data.target_fcr, 2)} · {number(data.feed_kg)}{" "}
                  kg pakan
                </small>
              </div>
            </section>
            <section className="panel mini-stat">
              <span className="soft-icon yellow">
                <Egg size={22} />
              </span>
              <div>
                <span>Produktivitas · HDP</span>
                <strong>
                  {data.hdp == null ? "Belum tersedia" : `${number(data.hdp)}%`}
                </strong>
                <small>
                  Target ≥ {number(data.target_hdp)}% · berdasarkan hari-ayam
                </small>
              </div>
            </section>
            <section className="panel mini-stat">
              <span className="soft-icon blue">
                <Banknote size={22} />
              </span>
              <div>
                <span>Sisa utang peternakan</span>
                <strong>{rupiah(data.debt_outstanding)}</strong>
                <button className="text-button" onClick={() => go("debts")}>
                  Lihat pinjaman
                  <ChevronRight size={14} />
                </button>
              </div>
            </section>
          </div>
          <div className="efficiency-charts">
            {[
              {
                key: "fcr",
                label: "Tren konversi pakan (FCR)",
                target: data.target_fcr,
              },
              {
                key: "hdp",
                label: "Tren produktivitas (HDP %)",
                target: data.target_hdp,
              },
            ].map((metric) => (
              <section className="panel" key={metric.key}>
                <div className="panel-heading">
                  <div>
                    <h3>{metric.label}</h3>
                    <p>
                      Delapan minggu terakhir · target{" "}
                      {number(metric.target, 2)}
                    </p>
                  </div>
                </div>
                <div className="chart small-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={data.efficiency_weeks}
                      margin={{ left: -20, right: 10, top: 10 }}
                    >
                      <CartesianGrid vertical={false} stroke="#edf0e9" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => String(v).slice(5)}
                      />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={chartTooltip} />
                      <Area
                        dataKey={metric.key}
                        name={metric.key.toUpperCase()}
                        stroke="#6b8758"
                        fill="#edf2e5"
                        strokeWidth={2}
                        connectNulls={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            ))}
          </div>
          <section className="market-note">
            <div className="market-label">
              <span className="soft-icon">
                <Leaf size={19} />
              </span>
              <div>
                <strong>Harga telur · Bantul & Yogyakarta</strong>
                <p>{market}</p>
              </div>
            </div>
            <button
              className="button secondary small"
              disabled={refreshing}
              onClick={refresh}
            >
              <RefreshCw size={14} />
              {refreshing ? "Memeriksa…" : "Periksa sumber"}
            </button>
          </section>
        </>
      )}
    </>
  );
}
