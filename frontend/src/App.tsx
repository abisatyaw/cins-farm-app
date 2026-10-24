import { useEffect, useState } from "react";
import { Sprout, Leaf, LogOut, Menu, ChevronRight } from "lucide-react";
import { api, dateLabel, type Row, type User } from "./api";
import { type Page, pages, errorMessage } from "./navigation";
import { Brand, Alert } from "./components/ui";
import { Login, PasswordChange } from "./components/Auth";
import { RecordForm } from "./components/RecordForm";
import { Dashboard } from "./pages/Dashboard";
import { Records, Details } from "./pages/Records";
import { Reports } from "./pages/Reports";
export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("dashboard");
  const [options, setOptions] = useState<Row[]>([]);
  const [today, setToday] = useState("");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [password, setPassword] = useState(false);
  const [modal, setModal] = useState<{
    mode: "edit" | "detail";
    row?: Row;
  } | null>(null);
  useEffect(() => {
    api<User>("/auth/session")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user || user.must_change_password) return;
    api("/meta")
      .then((v) => setToday(v.today))
      .catch((e) => setError(errorMessage(e)));
    api("/records/options?limit=500")
      .then((v) => setOptions(v.items))
      .catch((e) => setError(errorMessage(e)));
  }, [user, reload]);
  function go(p: Page) {
    setPage(p);
    setMobile(false);
    setModal(null);
    setError("");
  }
  async function logout() {
    try {
      await api("/auth/logout", "POST");
      setUser(null);
      setOptions([]);
      setPage("dashboard");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  if (loading)
    return (
      <div className="app-loading">
        <Sprout size={34} />
        <p>Menyiapkan catatan peternakan…</p>
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  if (user.must_change_password || password)
    return (
      <PasswordChange
        user={user}
        onSave={(u) => {
          setUser(u);
          setPassword(false);
        }}
        onCancel={
          user.must_change_password ? undefined : () => setPassword(false)
        }
      />
    );
  const info = pages.find((p) => p.id === page)!;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Brand />
        <div className="farm-badge">
          <span>
            <Leaf size={17} />
          </span>
          <div>
            <strong>Peternakan saya</strong>
            <small>Usaha telur · Indonesia</small>
          </div>
          <span className="live-dot" />
        </div>
        <small className="nav-caption">KELOLA PETERNAKAN</small>
        <nav>
          {pages
            .filter((p) => !p.admin || user.role === "admin")
            .map((p) => (
              <button
                key={p.id}
                className={page === p.id ? "active" : ""}
                onClick={() => go(p.id as Page)}
              >
                <p.icon size={19} />
                {p.label}
                {page === p.id && <span />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sprout size={22} />
            <strong>
              Usaha baik dimulai
              <br />
              dari catatan kecil.
            </strong>
          </div>
          <button className="profile" onClick={() => setPassword(true)}>
            <span className="avatar">
              {user.username.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{user.username}</strong>
              <small>
                {user.role === "admin" ? "Administrator" : "Pengguna"} · Ganti
                sandi
              </small>
            </div>
          </button>
          <button className="logout" onClick={logout}>
            <LogOut size={16} />
            Keluar
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Tutup navigasi"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-column">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Buka navigasi"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>Peternakan saya</span>
            <ChevronRight size={14} />
            <strong>{info.label}</strong>
          </div>
          <div className="topbar-date">
            <span className="live-dot" />
            <span>{today ? dateLabel(today) : "Waktu Jakarta"}</span>
            <span className="timezone">WIB</span>
          </div>
        </header>
        <main>
          <header className="page-header">
            <div>
              <h1>
                {page === "dashboard"
                  ? `Selamat datang, ${user.username}.`
                  : info.label}
              </h1>
              <p>{info.sub}</p>
            </div>
            <span className="farm-mark">
              <Sprout size={28} />
            </span>
          </header>
          {error && <Alert>{error}</Alert>}
          {page === "dashboard" ? (
            <Dashboard go={go} reload={reload} />
          ) : page === "reports" ? (
            <Reports
              today={
                today ||
                new Date().toLocaleDateString("en-CA", {
                  timeZone: "Asia/Jakarta",
                })
              }
            />
          ) : (
            <Records
              key={page}
              kind={page}
              admin={user.role === "admin"}
              options={options}
              reload={reload}
              onEdit={(row) => setModal({ mode: "edit", row })}
              onDetail={(row) => setModal({ mode: "detail", row })}
            />
          )}
          <div className="page-footer">
            <span>
              <Sprout size={13} />
              Cins Farm
            </span>
            <span>Dirawat dengan baik, dicatat dengan hati.</span>
          </div>
        </main>
      </div>
      {modal?.mode === "edit" && (
        <RecordForm
          kind={page}
          row={modal.row}
          options={options}
          today={today}
          onClose={() => setModal(null)}
          onSave={() => {
            setModal(null);
            setReload((v) => v + 1);
          }}
        />
      )}
      {modal?.mode === "detail" && modal.row && (
        <Details
          kind={page}
          id={modal.row.id}
          admin={user.role === "admin"}
          options={options}
          today={today}
          onClose={() => setModal(null)}
          onChanged={() => setReload((v) => v + 1)}
        />
      )}
    </div>
  );
}
