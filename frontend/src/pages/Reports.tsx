import { useEffect, useState } from "react";
import { ArrowDownToLine, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, number, rupiah } from "../api";
import { errorMessage } from "../navigation";
import { Alert } from "../components/ui";
const chartTooltip = {
  border: "1px solid #e6e9e2",
  borderRadius: 10,
  fontSize: 12,
};
export function Reports({ today }: { today: string }) {
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setError("");
    api(
      `/reports/financial?year=${year}&month=${month}`,
      "GET",
      undefined,
      c.signal,
    )
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(errorMessage(e));
      });
    return () => c.abort();
  }, [year, month]);
  const labels: [string, string][] = [
    ["revenue", "Pendapatan penjualan"],
    ["cost_of_goods", "Harga pokok (pakan, telur, ayam)"],
    ["gross_profit", "Laba kotor"],
    ["operating_expenses", "Beban operasional"],
    ["ebitda", "EBITDA"],
    ["depreciation", "Penyusutan aset"],
    ["net_profit", "Laba bersih"],
  ];
  return (
    <>
      <div className="section-line">
        <div>
          <span className="eyebrow green-text">PAHAMI ANGKA USAHA</span>
          <h2>Laporan laba rugi</h2>
        </div>
        <a
          className="button"
          href={`/api/reports/export?year=${year}&month=${month}`}
        >
          <ArrowDownToLine size={17} />
          Unduh Excel
        </a>
      </div>
      <div className="report-filters">
        <select
          aria-label="Bulan laporan"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>
              {new Date(2020, i, 1).toLocaleDateString("id-ID", {
                month: "long",
              })}
            </option>
          ))}
        </select>
        <input
          aria-label="Tahun laporan"
          type="number"
          min={2000}
          max={2100}
          value={year}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 2000 && v <= 2100) setYear(v);
          }}
        />
      </div>
      {error && <Alert>{error}</Alert>}
      {data && (
        <>
          <section className="panel">
            <div className="table-scroll">
              <table className="pnl">
                <thead>
                  <tr>
                    <th>Komponen keuangan</th>
                    <th>Bulan terpilih</th>
                    <th>Tahun {year}</th>
                  </tr>
                </thead>
                <tbody>
                  {labels.map(([key, label]) => (
                    <tr
                      key={key}
                      className={
                        ["gross_profit", "ebitda", "net_profit"].includes(key)
                          ? "subtotal"
                          : ""
                      }
                    >
                      <td>{label}</td>
                      <td>{rupiah(data.month[key])}</td>
                      <td>{rupiah(data.year[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel report-chart">
            <div className="panel-heading">
              <div>
                <h3>Perjalanan laba bersih</h3>
                <p>Perbandingan bulan demi bulan · {year}</p>
              </div>
              <TrendingUp size={20} />
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trend}>
                  <CartesianGrid vertical={false} stroke="#edf0e9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) => `${number(Number(v) / 1000, 0)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip contentStyle={chartTooltip} />
                  <Bar
                    name="Laba bersih (Rp)"
                    dataKey="net_profit"
                    fill="#527557"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={34}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <p className="page-note">
            Pendapatan diakui pada tanggal penjualan, bukan tanggal pembayaran.
            Pembelian pakan/telur/ayam dibebankan langsung; pinjaman dan
            pelunasan tidak masuk laba rugi. Penyusutan dicatat pada ulang
            tanggal pembelian setiap bulan.
          </p>
        </>
      )}
    </>
  );
}
