/**
 * AdsInsightsDashboard
 *
 * Displays Facebook ad performance data stored in MySQL.
 * Data is pulled from the /api/ads/insights endpoint via tRPC.
 * Admins can trigger a manual sync from the Facebook Marketing API.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, TrendingUp, DollarSign, MousePointer, Users, AlertCircle, Info } from "lucide-react";

type DaysOption = 7 | 14 | 30;

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtCurrency(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-[#1a2d5a]",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg bg-gray-100 ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdsInsightsDashboard() {
  const [days, setDays] = useState<DaysOption>(7);
  const [syncing, setSyncing] = useState(false);

  const { data: rows = [], isLoading, refetch } = trpc.ads.getInsights.useQuery({ days });
  const syncMutation = trpc.ads.sync.useMutation({
    onSuccess: (result) => {
      if (result.error) {
        toast.error(`Sync failed: ${result.error}`);
      } else {
        toast.success(`Synced ${result.synced} rows from Facebook`);
        void refetch();
      }
      setSyncing(false);
    },
    onError: (err) => {
      toast.error(`Sync error: ${err.message}`);
      setSyncing(false);
    },
  });

  const handleSync = () => {
    setSyncing(true);
    syncMutation.mutate({ days });
  };

  // Aggregate totals across all rows
  const totals = rows.reduce(
    (acc, row) => ({
      spend: acc.spend + parseFloat(row.spend ?? "0"),
      impressions: acc.impressions + (row.impressions ?? 0),
      clicks: acc.clicks + (row.clicks ?? 0),
      leads: acc.leads + (row.leads ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0 }
  );

  const ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "—";
  const cpl = totals.leads > 0 ? (totals.spend / totals.leads).toFixed(2) : "—";

  const noSecrets = rows.length === 0 && !isLoading;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Facebook Ad Performance</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Data pulled from Facebook Marketing API and stored in MySQL.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Days selector */}
          <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm">
            {([7, 14, 30] as DaysOption[]).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  days === d
                    ? "bg-[#1a2d5a] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={syncing || isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Now"}
          </Button>
        </div>
      </div>

      {/* No-data / no-secrets notice */}
      {noSecrets && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-5 pb-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800 text-sm">No ad data yet</p>
              <p className="text-amber-700 text-sm mt-0.5">
                Add your Facebook credentials in{" "}
                <strong>Settings → Secrets</strong> (FACEBOOK_MARKETING_API_TOKEN and
                FACEBOOK_AD_ACCOUNT_ID), then click <strong>Sync Now</strong> to pull data.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={DollarSign}
            label="Total Spend"
            value={`$${totals.spend.toFixed(2)}`}
            sub={`Last ${days} days`}
            color="text-green-600"
          />
          <MetricCard
            icon={Users}
            label="Leads"
            value={fmt(totals.leads)}
            sub={cpl !== "—" ? `$${cpl} / lead` : undefined}
            color="text-blue-600"
          />
          <MetricCard
            icon={MousePointer}
            label="Clicks"
            value={fmt(totals.clicks)}
            sub={`${ctr}% CTR`}
            color="text-purple-600"
          />
          <MetricCard
            icon={TrendingUp}
            label="Impressions"
            value={fmt(totals.impressions)}
            color="text-orange-500"
          />
        </div>
      )}

      {/* Data table */}
      {rows.length > 0 && (
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-400" />
              Ad-level breakdown — last {days} days ({rows.length} rows)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold text-xs pl-4">Date</TableHead>
                    <TableHead className="font-semibold text-xs">Campaign</TableHead>
                    <TableHead className="font-semibold text-xs">Ad Set</TableHead>
                    <TableHead className="font-semibold text-xs">Ad</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Spend</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Impr.</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Clicks</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Leads</TableHead>
                    <TableHead className="font-semibold text-xs text-right pr-4">CPL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-gray-50 text-sm">
                      <TableCell className="pl-4 text-gray-500 text-xs whitespace-nowrap">
                        {row.date}
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <span className="truncate block text-xs" title={row.campaignName ?? ""}>
                          {row.campaignName ?? <span className="text-gray-400">—</span>}
                        </span>
                        <span className="text-gray-400 text-[10px]">{row.campaignId}</span>
                      </TableCell>
                      <TableCell className="max-w-[140px]">
                        <span className="truncate block text-xs" title={row.adsetName ?? ""}>
                          {row.adsetName ?? <span className="text-gray-400">—</span>}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[140px]">
                        <span className="truncate block text-xs" title={row.adName ?? ""}>
                          {row.adName ?? <span className="text-gray-400">—</span>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs">
                        {fmtCurrency(row.spend)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-gray-600">
                        {fmt(row.impressions)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-gray-600">
                        {fmt(row.clicks)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {row.leads && row.leads > 0 ? (
                          <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                            {row.leads}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs pr-4 text-gray-600">
                        {fmtCurrency(row.costPerLead)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading ad data…
        </div>
      )}
    </div>
  );
}
