import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Users, Phone, Mail } from "lucide-react";

/**
 * Enrolled Families view — people who enrolled through the website (after-school
 * registration) or converted from a lead (recordType 'enrolled'). This is the
 * "already a paying customer" pile, kept out of the prospect pipeline. The full
 * class roster (belts, attendance, imported students) still lives under Students;
 * this view is the CRM side (who signed up, how to reach them).
 */

type LeadRow = {
  id: number;
  parentName: string;
  kidName: string;
  programInterest: string;
  email: string;
  phone: string;
  pipelineStage: string;
  tags?: string[] | null;
  recordType?: string;
  createdAt: string | Date;
};

const PROGRAM_DISPLAY: Record<string, string> = {
  "In-person sign-up": "After-School",
  "summer_camp": "Summer Camp",
  "Summer Camp 2026": "Summer Camp",
};
const prettyProgram = (p: string) => PROGRAM_DISPLAY[p] ?? p;
const PLAN_LABEL: Record<string, string> = { "4_5_day": "4-5 Day/Week", "2_3_day": "2-3 Day/Week" };
// Recurring tuition (Stripe subscription) status pill. Null status = not on
// recurring billing yet (e.g. tuition not configured, or a legacy registration).
const TUITION_LABEL: Record<string, string> = { active: "Active", trialing: "Scheduled", past_due: "Past due", canceled: "Canceled", incomplete: "Incomplete", paused: "Paused" };
const TUITION_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  trialing: "bg-blue-100 text-blue-800 border-blue-200",
  past_due: "bg-red-100 text-red-700 border-red-200",
  canceled: "bg-gray-100 text-gray-600 border-gray-200",
  incomplete: "bg-yellow-100 text-yellow-800 border-yellow-200",
  paused: "bg-amber-100 text-amber-800 border-amber-200",
};

export default function EnrolledFamiliesView() {
  const { data, isLoading } = trpc.leads.getAll.useQuery();
  const { data: afterschoolRegs } = trpc.afterschool.listRegistrations.useQuery();
  const regs = afterschoolRegs ?? [];

  const families = useMemo(
    () => ((data ?? []) as unknown as LeadRow[])
      .filter(l => (l.recordType ?? "prospect") === "enrolled")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading enrolled families...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center shrink-0">
          <Users className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1a2d5a]">Enrolled Families</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Families who signed up through the site or converted from a lead. The full class roster with belts and
            attendance is under <span className="font-medium text-gray-600">Students</span>.
          </p>
        </div>
      </div>

      {/* Paid after-school registrations (from afterschoolRegistrations, previously invisible) */}
      {regs.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-5">
            <h2 className="text-sm font-bold text-[#1a2d5a] mb-3">Paid After-School Registrations ({regs.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="font-semibold text-gray-600 px-3 py-2.5">Child</th>
                    <th className="font-semibold text-gray-600 px-3 py-2.5">Plan</th>
                    <th className="font-semibold text-gray-600 px-3 py-2.5">Paid</th>
                    <th className="font-semibold text-gray-600 px-3 py-2.5">Status</th>
                    <th className="font-semibold text-gray-600 px-3 py-2.5">Tuition</th>
                    <th className="font-semibold text-gray-600 px-3 py-2.5">Contact</th>
                    <th className="font-semibold text-gray-600 px-3 py-2.5">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {regs.map(r => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-900">{r.childName}</div>
                        <div className="text-xs text-gray-500">Parent: {r.parentName}</div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{PLAN_LABEL[r.planType] ?? r.planType}{r.earlyBird ? <span className="ml-1 text-xs text-green-700">· early bird</span> : null}</td>
                      <td className="px-3 py-2.5 font-semibold text-gray-900 tabular-nums">${(r.totalAmountCents / 100).toFixed(2)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full border font-medium ${r.stripePaymentStatus === "succeeded" ? "bg-green-100 text-green-800 border-green-200" : "bg-yellow-100 text-yellow-800 border-yellow-200"}`}>
                          {r.stripePaymentStatus === "succeeded" ? "Paid" : r.stripePaymentStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.subscriptionStatus ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={`inline-block w-fit text-xs px-2 py-0.5 rounded-full border font-medium ${TUITION_STYLE[r.subscriptionStatus] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                              {TUITION_LABEL[r.subscriptionStatus] ?? r.subscriptionStatus}
                            </span>
                            {r.monthlyAmountCents ? <span className="text-[11px] text-gray-500 tabular-nums">${(r.monthlyAmountCents / 100).toFixed(0)}/mo</span> : null}
                          </div>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1 text-xs">
                          {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-[#1a2d5a] hover:underline"><Phone className="w-3 h-3" />{r.phone}</a>}
                          {r.email && <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 text-[#1a2d5a] hover:underline"><Mail className="w-3 h-3" />{r.email}</a>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {r.paidAt ? new Date(r.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {families.length === 0 ? (
            <div className="text-center py-16 text-gray-400">No enrolled families here yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="font-semibold text-gray-600 px-4 py-3">Family</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Program</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Contact</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {families.map(f => (
                    <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{f.kidName || f.parentName}</div>
                        {f.kidName && f.kidName !== f.parentName && (
                          <div className="text-xs text-gray-500">Parent: {f.parentName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-800 font-medium">
                          {prettyProgram(f.programInterest)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 text-xs">
                          {f.phone && <a href={`tel:${f.phone}`} className="inline-flex items-center gap-1 text-[#1a2d5a] hover:underline"><Phone className="w-3 h-3" />{f.phone}</a>}
                          {f.email && !f.email.endsWith("@no-email.tma") && <a href={`mailto:${f.email}`} className="inline-flex items-center gap-1 text-[#1a2d5a] hover:underline"><Mail className="w-3 h-3" />{f.email}</a>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
