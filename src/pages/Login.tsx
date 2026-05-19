import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      alert(err.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function signUp() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      alert("Account created. If email confirmation is enabled, check your inbox.");
    } catch (err: any) {
      alert(err.message ?? "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={page}>
      <div style={shell}>
        <div style={brandPanel}>
          <div style={brandMark}>OO</div>
          <div>
            <div style={eyebrow}>Shipboard inventory</div>
            <h1 style={title}>Obsidian Ops</h1>
          </div>
          <div style={statsGrid}>
            <div style={statBox}>
              <strong>Photo-first</strong>
              <span>Capture equipment before typing.</span>
            </div>
            <div style={statBox}>
              <strong>QR ready</strong>
              <span>Open records from labels onboard.</span>
            </div>
            <div style={statBox}>
              <strong>Shared spares</strong>
              <span>Track parts across equipment.</span>
            </div>
          </div>
        </div>

        <form onSubmit={signIn} style={formCard}>
          <div style={formTop}>
            <div style={formTitle}>Crew login</div>
            <div style={formSub}>Use your Supabase account to enter the inventory console.</div>
          </div>

          <label style={label}>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="crew@example.com"
              type="email"
              style={inp}
              required
            />
          </label>

          <label style={label}>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              style={inp}
              required
            />
          </label>

          <button disabled={busy} type="submit" style={btnPrimary}>
            {busy ? "Working…" : "Sign in"}
          </button>

          <button disabled={busy} type="button" onClick={signUp} style={btnGhost}>
            Create account
          </button>
        </form>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 18,
  color: "#0b0f14",
  background:
    "radial-gradient(900px 420px at 15% 5%, rgba(5, 150, 105, 0.16), transparent 58%)," +
    "radial-gradient(780px 380px at 92% 10%, rgba(14, 116, 144, 0.14), transparent 58%)," +
    "linear-gradient(160deg, #07131F 0%, #0F3B4A 46%, #EAF2F2 46%, #F5F7F8 100%)",
};

const shell: React.CSSProperties = {
  width: "min(940px, 100%)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))",
  gap: 18,
  alignItems: "stretch",
};

const brandPanel: React.CSSProperties = {
  border: "1px solid rgba(2,6,23,0.10)",
  borderRadius: 18,
  padding: 22,
  background: "linear-gradient(160deg, rgba(255,255,255,0.16), rgba(255,255,255,0.07))",
  boxShadow: "0 24px 62px rgba(2,6,23,0.24)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: 28,
};

const brandMark: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(180deg, #2DD4BF 0%, #0E7490 100%)",
  color: "#021014",
  fontWeight: 950,
  letterSpacing: "0.02em",
};

const eyebrow: React.CSSProperties = { fontSize: 12, fontWeight: 900, opacity: 0.72, textTransform: "uppercase", color: "rgba(255,255,255,0.74)" };
const title: React.CSSProperties = { margin: "4px 0 0", fontSize: 42, lineHeight: 1.02, letterSpacing: "0", fontWeight: 950, color: "#fff" };

const statsGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 };
const statBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(2,6,23,0.08)",
  background: "rgba(255,255,255,0.12)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  lineHeight: 1.25,
};

const formCard: React.CSSProperties = {
  border: "1px solid rgba(2,6,23,0.10)",
  borderRadius: 18,
  padding: 18,
  background: "rgba(255,255,255,0.94)",
  boxShadow: "0 20px 52px rgba(2,6,23,0.12)",
};

const formTop: React.CSSProperties = { marginBottom: 16 };
const formTitle: React.CSSProperties = { fontWeight: 950, fontSize: 18 };
const formSub: React.CSSProperties = { opacity: 0.66, fontSize: 13, marginTop: 4, lineHeight: 1.35 };
const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 900, opacity: 0.78, marginBottom: 12 };

const inp: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid rgba(2,6,23,0.14)",
  borderRadius: 12,
  outline: "none",
  background: "rgba(255,255,255,0.92)",
  color: "#0b0f14",
};

const btnPrimary: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 12,
  border: "1px solid rgba(2,6,23,0.82)",
  background: "linear-gradient(180deg, #2DD4BF 0%, #0E7490 100%)",
  color: "#021014",
  fontWeight: 900,
  cursor: "pointer",
  marginTop: 4,
};

const btnGhost: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 12,
  border: "1px solid rgba(2,6,23,0.14)",
  background: "rgba(255,255,255,0.72)",
  color: "#0b0f14",
  fontWeight: 900,
  cursor: "pointer",
  marginTop: 10,
};