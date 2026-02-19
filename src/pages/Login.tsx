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
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", minHeight: "100vh", display: "grid", placeItems: "center", padding: 18 }}>
      <form onSubmit={signIn} style={{ width: "min(420px, 100%)", border: "1px solid #e6e6e6", borderRadius: 16, padding: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Obsidian Ops</div>
        <div style={{ opacity: 0.7, marginBottom: 14 }}>Crew login</div>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          style={inp}
          required
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          style={inp}
          required
        />

        <button disabled={busy} type="submit" style={btnPrimary}>
          {busy ? "Working…" : "Sign in"}
        </button>

        <button disabled={busy} type="button" onClick={signUp} style={btnGhost}>
          Create account
        </button>
      </form>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 10,
  outline: "none",
  marginBottom: 10,
};

const btnPrimary: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 6,
};

const btnGhost: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 10,
};
