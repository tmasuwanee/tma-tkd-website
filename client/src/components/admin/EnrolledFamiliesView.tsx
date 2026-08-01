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

export default function EnrolledFamiliesView() {
  const { data, isLoading } = trpc.leads.getAll.useQuery();

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
