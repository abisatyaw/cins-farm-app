import React, { useState } from "react";
import {
  Sprout,
  Wheat,
  Egg,
  Leaf,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { api, type User } from "../api";
import { errorMessage } from "../navigation";
import { Brand, Alert } from "./ui";
export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await api("/auth/login", "POST", { username, password }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">TUMBUH DARI CATATAN YANG BAIK</span>
          <h1>
            Peternakan terawat.
            <br />
            Usaha bertumbuh.
          </h1>
          <p>
            Dari telur pertama hingga laporan akhir bulan.
            <br />
            Semua catatan peternakan, dalam satu tempat.
          </p>
          <div className="farm-art">
            <div className="sun" />
            <Wheat className="wheat one" />
            <Wheat className="wheat two" />
            <Egg className="art-egg" />
            <Leaf className="art-leaf" />
            <div className="hill" />
          </div>
        </div>
        <small>DIBUAT UNTUK KESEHARIAN PETERNAK.</small>
      </div>
      <div className="login-form">
        <div className="login-card">
          <span className="soft-icon">
            <Sprout size={28} />
          </span>
          <h2>Selamat datang kembali</h2>
          <p>Masuk untuk melihat kabar peternakan hari ini.</p>
          <form onSubmit={submit}>
            <label>
              Nama pengguna
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              Kata sandi
              <input
                autoComplete="current-password"
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && <Alert>{error}</Alert>}
            <button className="button" disabled={busy}>
              {busy ? "Memeriksa…" : "Masuk ke peternakan"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="login-note">
            <ShieldCheck size={15} />
            Akses pribadi untuk tim peternakan Anda.
          </p>
        </div>
      </div>
    </div>
  );
}
export function PasswordChange({
  user,
  onSave,
  onCancel,
}: {
  user: User;
  onSave: (u: User) => void;
  onCancel?: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSave(
        await api("/auth/password", "POST", {
          current_password: current,
          new_password: next,
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="password-screen">
      <div className="panel">
        <Brand />
        <h2>
          {user.must_change_password
            ? "Amankan akun pertama Anda"
            : "Ganti kata sandi"}
        </h2>
        <p>Gunakan kata sandi baru minimal 10 karakter.</p>
        <form onSubmit={save}>
          <label>
            Kata sandi saat ini
            <input
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            Kata sandi baru
            <input
              type="password"
              required
              minLength={10}
              maxLength={256}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          {error && <Alert>{error}</Alert>}
          <button className="button" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan kata sandi"}
          </button>
          {onCancel && (
            <button
              type="button"
              className="button secondary"
              onClick={onCancel}
            >
              Kembali
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
