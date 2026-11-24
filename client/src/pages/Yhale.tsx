import { useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

/**
 * Spring 2027 Taekwondo enrichment at YHALE (Yi Hwang Academy of Language Excellence).
 * The flyer QR points here (https://tmatkd.com/yhale). A submission becomes a lead tagged
 * yhale_enrichment_2026 (see leads.submit), so it shows in the dashboard Leads list.
 * The registration email goes ONLY to Master Jo (see sendYhaleRegistration), not to TMA staff.
 */

const PROGRAM = "YHALE Taekwondo Enrichment";
const TAG = "yhale_enrichment_2026";

const WAIVER =
  "I recognize and understand that martial arts training is an activity that may involve physical contact. " +
  "I grant permission in case of injury to have medical personnel provide assistance or treatment. " +
  "I release, waive, discharge and covenant not to sue Master Jo, his affiliated organizations, and the " +
  "property lessee or owner, from any and all liability and legal claims, on account of " +
  "any illness or injury during my child's participation in taekwondo class.";

const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8"];
const BELTS = [
  "New student (no belt yet)",
  "White",
  "White with yellow stripe",
  "Yellow",
  "Orange",
  "Green",
  "Purple",
  "Blue",
  "Brown",
  "Red",
  "Other",
];

const SCHEDULE: { day: string; dates: string; rows: { who: string; time: string; belts: string }[] }[] = [
  {
    day: "Tuesdays",
    dates: "Jan 12 to May 4 (no class Feb 9)",
    rows: [
      { who: "K-2nd", time: "4:00 to 4:50", belts: "White and White with yellow stripe" },
      { who: "3rd-8th", time: "5:00 to 5:50", belts: "All belts, including new students" },
    ],
  },
  {
    day: "Thursdays",
    dates: "Jan 14 to May 6 (no class Feb 11)",
    rows: [
      { who: "K-2nd", time: "Time to be confirmed", belts: "All Yellow and Green belt students" },
      { who: "3rd-8th", time: "5:00 to 5:50", belts: "All belts" },
    ],
  },
];

export default function Yhale() {
  const submitLead = trpc.leads.submit.useMutation();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    parentName: "", kidName: "", grade: "", belt: "", email: "", phone: "", notes: "",
    track: "", teacher: "", p2Name: "", p2Email: "", p2Phone: "",
    emName: "", emPhone: "", experience: "", medical: "", signer: "",
  });
  const [waiver, setWaiver] = useState(false);
  const [days, setDays] = useState<{ Tuesday: boolean; Thursday: boolean }>({ Tuesday: false, Thursday: false });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const picked = (["Tuesday", "Thursday"] as const).filter(d => days[d]);
    if (!f.parentName.trim() || !f.kidName.trim() || !f.grade || !f.belt || !f.email.trim() || !f.phone.trim()) {
      toast.error("Please fill in every field marked with a star.");
      return;
    }
    if (!f.track || !f.teacher.trim() || !f.emName.trim() || !f.emPhone.trim() || !f.experience || !f.medical.trim()) {
      toast.error("Please fill in every field marked with a star.");
      return;
    }
    if (!picked.length) { toast.error("Pick Tuesday, Thursday, or both."); return; }
    if (!waiver || !f.signer.trim()) { toast.error("Please agree to the release and type your name."); return; }

    const grade = f.grade === "K" ? "Kindergarten" : `Grade ${f.grade}`;
    const p2 = [f.p2Name.trim(), f.p2Email.trim(), f.p2Phone.trim()].filter(Boolean).join(", ");
    const notes = [
      `YHALE enrichment, spring semester. ${grade}. Belt: ${f.belt}. Days: ${picked.join(" and ")}.`,
      `Language track: ${f.track}. Afternoon teacher: ${f.teacher.trim()}.`,
      p2 ? `2nd parent/guardian: ${p2}.` : "",
      `Emergency contact: ${f.emName.trim()}, ${f.emPhone.trim()}.`,
      `Martial arts experience: ${f.experience}.`,
      `Health or medical conditions: ${f.medical.trim()}.`,
      f.notes.trim() ? `Other notes: ${f.notes.trim()}` : "",
      `Release agreed to by ${f.signer.trim()} (checked the box on tmatkd.com/yhale at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET).`,
    ].filter(Boolean).join("\n");

    setBusy(true);
    try {
      await submitLead.mutateAsync({
        parentName: f.parentName.trim(),
        kidName: f.kidName.trim(),
        kidAge: grade,
        programInterest: PROGRAM,
        email: f.email.trim(),
        phone: f.phone.trim(),
        additionalNotes: notes,
        tags: [TAG],
      });
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("That did not go through. Please try again, or email tkdtma@gmail.com.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/70">Taekwondo enrichment at YHALE</p>
          <h1 className="mt-2 text-4xl font-bold leading-tight">Taekwondo after school</h1>
          <p className="mt-3 text-lg text-white/85">
            Spring semester enrichment for K-8th grade with Master Jo. Classes start the week of January 12.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {done ? (
          <Card className="border-2 border-accent bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-9 w-9 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-primary">You're registered</h2>
            <p className="mt-2 text-gray-700">
              Thank you! We have {f.kidName.trim() || "your student"} down for YHALE Taekwondo. We'll be in touch
              with the next steps before classes begin the week of January 12.
            </p>
            <p className="mt-4 text-sm text-gray-500">Questions? Email tkdtma@gmail.com.</p>
          </Card>
        ) : (
          <>
            <Card className="bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-primary">Class schedule</h2>
              <div className="mt-4 space-y-5">
                {SCHEDULE.map(d => (
                  <div key={d.day}>
                    <p className="font-semibold text-gray-900">{d.day}</p>
                    <p className="text-sm text-gray-500">{d.dates}</p>
                    <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                      {d.rows.map(r => (
                        <li key={r.who} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
                          <span className="font-medium text-primary">{r.who}</span>
                          <span className="text-sm text-gray-700">{r.time}</span>
                          <span className="w-full text-sm text-gray-600">{r.belts}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-gray-600">
                Green, Blue and Red belts are encouraged to come both Tuesday and Thursday.
              </p>
            </Card>

            <Card className="bg-white p-5 shadow-sm sm:p-8">
              <h2 className="text-xl font-bold text-primary">Register your student</h2>
              <p className="mt-1 text-sm text-gray-600">There is a $25 registration fee this semester. One form per student.</p>
              <form onSubmit={submit} className="mt-5 space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="parentName" className="mb-2 block font-semibold text-primary">Parent name *</Label>
                    <Input id="parentName" value={f.parentName} onChange={set("parentName")} autoComplete="name" required />
                  </div>
                  <div>
                    <Label htmlFor="kidName" className="mb-2 block font-semibold text-primary">Student name *</Label>
                    <Input id="kidName" value={f.kidName} onChange={set("kidName")} required />
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label className="mb-2 block font-semibold text-primary">Grade this spring *</Label>
                    <Select value={f.grade} onValueChange={v => setF(p => ({ ...p, grade: v }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Pick a grade" /></SelectTrigger>
                      <SelectContent>
                        {GRADES.map(g => <SelectItem key={g} value={g}>{g === "K" ? "Kindergarten" : `Grade ${g}`}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block font-semibold text-primary">Current belt *</Label>
                    <Select value={f.belt} onValueChange={v => setF(p => ({ ...p, belt: v }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Pick a belt" /></SelectTrigger>
                      <SelectContent>
                        {BELTS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label className="mb-2 block font-semibold text-primary">Language track *</Label>
                    <Select value={f.track} onValueChange={v => setF(p => ({ ...p, track: v }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Korean or Chinese" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Korean">Korean</SelectItem>
                        <SelectItem value="Chinese">Chinese</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="teacher" className="mb-2 block font-semibold text-primary">Afternoon teacher *</Label>
                    <Input id="teacher" value={f.teacher} onChange={set("teacher")} />
                  </div>
                </div>

                <fieldset>
                  <legend className="mb-2 block text-sm font-semibold text-primary">Days *</legend>
                  <div className="flex flex-wrap gap-3">
                    {(["Tuesday", "Thursday"] as const).map(d => (
                      <label key={d} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-base">
                        <Checkbox checked={days[d]} onCheckedChange={v => setDays(p => ({ ...p, [d]: v === true }))} />
                        {d}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="email" className="mb-2 block font-semibold text-primary">Email *</Label>
                    <Input id="email" type="email" value={f.email} onChange={set("email")} autoComplete="email" required />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="mb-2 block font-semibold text-primary">Phone *</Label>
                    <Input id="phone" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" placeholder="Best number to reach you" required />
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-primary">Second parent or guardian (optional)</p>
                  <Input aria-label="Second parent name" placeholder="Name" value={f.p2Name} onChange={set("p2Name")} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input aria-label="Second parent email" type="email" placeholder="Email" value={f.p2Email} onChange={set("p2Email")} />
                    <Input aria-label="Second parent phone" type="tel" placeholder="Phone" value={f.p2Phone} onChange={set("p2Phone")} />
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="emName" className="mb-2 block font-semibold text-primary">Emergency contact name *</Label>
                    <Input id="emName" value={f.emName} onChange={set("emName")} />
                  </div>
                  <div>
                    <Label htmlFor="emPhone" className="mb-2 block font-semibold text-primary">Emergency contact phone *</Label>
                    <Input id="emPhone" type="tel" value={f.emPhone} onChange={set("emPhone")} />
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block font-semibold text-primary">Any martial arts experience? *</Label>
                  <Select value={f.experience} onValueChange={v => setF(p => ({ ...p, experience: v }))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Pick one" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="None">No, this is new</SelectItem>
                      <SelectItem value="Some experience">Yes, some experience</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="medical" className="mb-2 block font-semibold text-primary">Any health or medical conditions? *</Label>
                  <Textarea id="medical" value={f.medical} onChange={set("medical")} rows={2} placeholder="Write None if there are none" />
                </div>

                <div>
                  <Label htmlFor="notes" className="mb-2 block font-semibold text-primary">Anything else we should know? (optional)</Label>
                  <Textarea id="notes" value={f.notes} onChange={set("notes")} rows={2} />
                </div>

                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-primary">Release *</p>
                  <p className="text-xs leading-relaxed text-gray-700">{WAIVER}</p>
                  <div className="flex items-start gap-3">
                    <Checkbox id="waiver" checked={waiver} onCheckedChange={v => setWaiver(v === true)} className="mt-0.5 shrink-0" />
                    <Label htmlFor="waiver" className="cursor-pointer text-sm font-normal text-gray-800">I agree</Label>
                  </div>
                  <div>
                    <Label htmlFor="signer" className="mb-2 block text-sm font-semibold text-primary">Type your full name to sign *</Label>
                    <Input id="signer" value={f.signer} onChange={set("signer")} autoComplete="name" />
                  </div>
                </div>

                <Button type="submit" size="lg" disabled={busy} className="w-full bg-accent text-lg font-semibold text-accent-foreground hover:bg-accent/90">
                  {busy ? "Sending..." : "Register"}
                </Button>
              </form>
            </Card>
          </>
        )}

        <div className="flex flex-col items-center gap-2 pb-6 text-center text-sm text-gray-600">
          <a href="mailto:tkdtma@gmail.com" className="flex items-center gap-2 font-medium text-primary"><Mail className="h-4 w-4" /> tkdtma@gmail.com</a>
        </div>
      </main>
    </div>
  );
}
