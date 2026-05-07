import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function SignUp() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    // With Auto-confirm Email ON, signUp returns an active session immediately.
    navigate("/queue");
  }

  return (
    <div className="max-w-sm mx-auto mt-24 p-6">
      <h1 className="text-2xl font-semibold mb-4">Create an account</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded p-2"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (8+ chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded p-2"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-green-600 text-white rounded p-2 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-gray-600 mt-4">
        Have an account? <Link to="/signin" className="underline">Sign in</Link>
      </p>
    </div>
  );
}
