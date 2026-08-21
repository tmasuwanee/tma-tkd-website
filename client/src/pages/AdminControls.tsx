import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, ShieldAlert, Eye, EyeOff, LogOut, Power, Clock, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Same gate as the admin dashboard / studio.
const ALLOWED_EMAILS = ["tmasuwanee@gmail.com", "coacharfasc@gmail.com"];
const PASSWORD = "Keep9oing!";
const SESSION_KEY = "tma_admin_session";

function LoginGate({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ALLOWED_EMAILS.includes(email.trim().toLowerCase()) && password === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, email.trim().toLowerCase());
      onLogin(email.trim().toLowerCase());
    } else setError("Incorrect email or password.");
  };
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 bg-[#c41e3a] rounded-xl flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-xl text-[#1a2d5a]">Automation Controls</CardTitle>
          <p className="text-sm text-gray-500">TMA admin</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
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

/** Register / show the daily membership-charge cron. Safe to register before go-live:
 *  the sweep no-ops until MEMBERSHIP_AUTOCHARGE_ENFORCE is on. */
function BillingCronCard() {
  const utils = trpc.useUtils();
  const status = trpc.billingCron.status.useQuery(undefined, { refetchOnWindowFocus: false });
  const register = trpc.billingCron.register.useMutation({
    onSuccess: (r: any) => { toast.success(r.created ? "Daily charge cron registered." : "Charge cron was already registered."); utils.billingCron.status.invalidate(); },
    onError: (e) => toast.error(e.message ?? "Could not register the cron."),
  });
  const d: any = status.data;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base text-[#1a2d5a] flex items-center gap-2"><Clock className="w-4 h-4" /> Daily tuition charge</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-gray-500">The daily job that charges due tuition. Registering it is safe now: it does nothing until billing is switched on (MEMBERSHIP_AUTOCHARGE_ENFORCE).</p>
        {status.isLoading ? (
          <div className="py-3 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
        ) : d && d.available === false ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">Scheduler unavailable here (this control works on the live deployment).</div>
        ) : d && d.registered ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Registered{d.enabled === false ? " (paused)" : ""} · runs {d.cron}{d.nextExecutionAt ? ` · next ${String(d.nextExecutionAt).slice(0, 16).replace("T", " ")}` : ""}</div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-600">Not registered yet.</span>
            <Button onClick={() => register.mutate()} disabled={register.isPending} className="bg-[#1a2d5a] hover:bg-[#142347] whitespace-nowrap">
              {register.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Register daily cron"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ControlsApp({ email, onLogout, embedded }: { email: string; onLogout?: () => void; embedded?: boolean }) {
  const listQuery = trpc.controls.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const setOne = trpc.controls.set.useMutation();
  const setAll = trpc.controls.setAll.useMutation();
  const utils = trpc.useUtils();
  const [pauseAllOpen, setPauseAllOpen] = useState(false);

  const controls = listQuery.data ?? [];
  const anyEnabled = controls.some((c: any) => c.enabled === 1);

  async function toggle(controlKey: string, enabled: boolean) {
    try {
      await setOne.mutateAsync({ controlKey, enabled, updatedBy: email });
      await utils.controls.list.invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update");
    }
  }
  async function doSetAll(enabled: boolean) {
    try {
      await setAll.mutateAsync({ enabled, updatedBy: email });
      toast.success(enabled ? "All automations resumed" : "All automations paused");
      await utils.controls.list.invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setPauseAllOpen(false);
    }
  }

  return (
    <div className={embedded ? "pb-12" : "min-h-screen bg-gray-50 pb-24"}>
      {!embedded && (
      <div className="bg-[#1a2d5a] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" />
          <div>
            <div className="font-semibold text-sm">Automation Controls</div>
            <div className="text-xs text-blue-200">{email}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={onLogout}>
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
      )}

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {/* Big red button */}
        <Card className="border-2 border-[#c41e3a]">
          <CardContent className="pt-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-[#c41e3a] flex items-center gap-2"><Power className="w-4 h-4" /> Pause everything</div>
              <div className="text-xs text-gray-500 mt-0.5">Stops all automations at once. Use if something is misbehaving.</div>
            </div>
            <Button onClick={() => setPauseAllOpen(true)} disabled={setAll.isPending}
              className="bg-[#c41e3a] hover:bg-[#a31931] whitespace-nowrap">
              {setAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (anyEnabled ? "Pause all" : "Resume all")}
            </Button>
          </CardContent>
        </Card>

        {/* Billing charge cron */}
        <BillingCronCard />

        {/* Individual toggles */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base text-[#1a2d5a]">Automations</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {listQuery.isLoading ? (
              <div className="py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
            ) : controls.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No controls found. (Run migration 0019.)</div>
            ) : controls.map((c: any) => (
              <div key={c.controlKey} className="flex items-center justify-between py-3 border-b last:border-0">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="text-sm font-medium text-gray-800">{c.label}</div>
                  <div className="text-[11px] text-gray-400">
                    {c.enabled === 1 ? "Running" : "PAUSED"}
                    {c.updatedBy ? ` · last changed by ${c.updatedBy}` : ""}
                  </div>
                </div>
                <Switch checked={c.enabled === 1} onCheckedChange={(v) => toggle(c.controlKey, v)} />
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="text-[11px] text-gray-400 text-center">
          Paused automations stop on their next run. n8n workflows check these flags before firing.
        </p>
      </div>

      <AlertDialog open={pauseAllOpen} onOpenChange={setPauseAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{anyEnabled ? "Pause ALL automations?" : "Resume ALL automations?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {anyEnabled
                ? "Every automation (emails, lead sync, voice agent, reminders) will stop. Nothing fires until you turn them back on."
                : "Every automation will resume running."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => doSetAll(!anyEnabled)} className={anyEnabled ? "bg-[#c41e3a] hover:bg-[#a31931]" : ""}>
              {anyEnabled ? "Pause all" : "Resume all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminControls() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) setEmail(saved);
  }, []);
  if (!email) return <LoginGate onLogin={setEmail} />;
  return <ControlsApp email={email} onLogout={() => { sessionStorage.removeItem(SESSION_KEY); setEmail(null); }} />;
}
