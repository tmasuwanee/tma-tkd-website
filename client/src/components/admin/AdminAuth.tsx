import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Shield, Eye, EyeOff } from "lucide-react";

// ─── Single source of truth for admin auth ───────────────────────────────────
// Previously every admin page declared these itself, with subtle drift
// (AdminRegistrations stored "1", others stored the email; Studio used a
// different session key). That caused re-login bugs between sections. One
// module now owns it, so logging in once covers the whole dashboard.
export const ADMIN_ALLOWED_EMAILS = ["tmasuwanee@gmail.com", "coacharfasc@gmail.com"];
export const ADMIN_PASSWORD = "Keep9oing!";
export const ADMIN_SESSION_KEY = "tma_admin_session";

/** Reads/sets the shared admin session. `ready` guards the first paint so we
 *  don't flash the login screen before sessionStorage is read. */
export function useAdminAuth() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const saved = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (saved && ADMIN_ALLOWED_EMAILS.includes(saved.toLowerCase())) setEmail(saved.toLowerCase());
    setReady(true);
  }, []);
  const login = (e: string) => {
    const v = e.trim().toLowerCase();
    sessionStorage.setItem(ADMIN_SESSION_KEY, v);
    setEmail(v);
  };
  const logout = () => { sessionStorage.removeItem(ADMIN_SESSION_KEY); setEmail(null); };
  return { email, ready, login, logout };
}

export function AdminLoginGate({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ADMIN_ALLOWED_EMAILS.includes(email.trim().toLowerCase()) && password === ADMIN_PASSWORD) {
      onLogin(email.trim().toLowerCase());
    } else {
      setError("Incorrect email or password.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 bg-[#1a2d5a] rounded-xl flex items-center justify-center mx-auto mb-3">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-xl text-[#1a2d5a]">TMA Admin</CardTitle>
          <p className="text-sm text-gray-500">Top Martial Arts dashboard</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Email</Label>
              <Input id="admin-email" type="email" value={email}
                onChange={e => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-pw">Password</Label>
              <div className="relative">
                <Input id="admin-pw" type={showPw ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full bg-[#1a2d5a] hover:bg-[#142347]">Sign in</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
