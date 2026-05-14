/**
 * AdsInsightsDashboard
 *
 * Displays Facebook ad performance data stored in MySQL.
 * Data is pulled from the /api/ads/insights endpoint via tRPC.
 * Admins can trigger a manual sync from the Facebook Marketing API.
 * Metric cards are clickable and open a chart popup showing daily trends.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, TrendingUp, DollarSign, MousePointer, Users, AlertCircle, Info, X } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

type DaysOption = 7 | 14 | 30;

type MetricKey = "spend" | "leads" | "clicks" | "impressions";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtCurrency(val: string | number | null | undefined): string {
  if (val == null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

// ─── Metric Popup Chart ───────────────────────────────────────────────────────

type ChartRow = { date: string; value: number };

function MetricPopup({
  open,
  onClose,
  label,
  color,
  data,
  isCurrency,
  chartType,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  color: string;
  data: ChartRow[];
  isCurrency?: boolean;
  chartType?: "area" | "bar";
}) {
  const total = data.reduce((s, r) => s + r.value, 0);
  const avg = data.length > 0 ? total / data.length : 0;
  const max = data.length > 0 ? Math.max(...data.map(r => r.value)) : 0;

  const formatTick = (v: number) => isCurrency ? `$${v.toFixed(0)}` : v.toLocaleString();
  const formatTooltip = (v: number) => isCurrency ? `$${v.toFixed(2)}` : v.toLocaleString();

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{label} — Daily Trend</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Total</p>
              <p className="text-lg font-bold text-gray-900">
                {isCurrency ? fmtCurrency(total) : fmt(total)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Daily Avg</p>
              <p className="text-lg font-bold text-gray-900">
                {isCurrency ? fmtCurrency(avg) : fmt(Math.round(avg))}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Peak Day</p>
              <p className="text-lg font-bold text-gray-900">
                {isCurrency ? fmtCurrency(max) : fmt(max)}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="h-48">
            {data.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">No data</div>
            ) : chartType === "bar" ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatTick} width={50} />
                  <Tooltip formatter={(v: number) => [formatTooltip(v), label]} labelStyle={{ fontSize: 11 }} />
                  <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <defs>
                    <linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatTick} width={50} />
                  <Tooltip formatter={(v: number) => [formatTooltip(v), label]} labelStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#metricGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Daily table */}
          {data.length > 0 && (
            <div className="max-h-40 overflow-y-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">{label}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data].reverse().map(row => (
                    <tr key={row.date} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-600">{row.date}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-gray-900">
                        {isCurrency ? fmtCurrency(row.value) : fmt(row.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Clickable Metric Card ────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-[#1a2d5a]",
  hexColor,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  hexColor?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`shadow-sm transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:translate-y-0" : ""}`}
      onClick={onClick}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg bg-gray-100 ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          {onClick && (
            <div className="text-gray-300 mt-1">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdsInsightsDashboard() {
  const [days, setDays] = useState<DaysOption>(7);
  const [syncing, setSyncing] = useState(false);
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);

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

  // Build daily aggregated chart data per metric
  const dailyData = useMemo(() => {
    const byDate: Record<string, { spend: number; impressions: number; clicks: number; leads: number }> = {};
    for (const row of rows) {
      const d = row.date ?? "unknown";
      if (!byDate[d]) byDate[d] = { spend: 0, impressions: 0, clicks: 0, leads: 0 };
      byDate[d].spend += parseFloat(row.spend ?? "0");
      byDate[d].impressions += row.impressions ?? 0;
      byDate[d].clicks += row.clicks ?? 0;
      byDate[d].leads += row.leads ?? 0;
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  }, [rows]);

  const chartDataFor = (metric: MetricKey): { date: string; value: number }[] =>
    dailyData.map(r => ({ date: r.date, value: r[metric] }));

  const noSecrets = rows.length === 0 && !isLoading;

  const metricConfig: {
    key: MetricKey;
    icon: React.ElementType;
    label: string;
    value: string;
    sub?: string;
    color: string;
    hexColor: string;
    isCurrency?: boolean;
    chartType?: "area" | "bar";
  }[] = [
    {
      key: "spend",
      icon: DollarSign,
      label: "Total Spend",
      value: `$${totals.spend.toFixed(2)}`,
      sub: `Last ${days} days`,
      color: "text-green-600",
      hexColor: "#16a34a",
      isCurrency: true,
      chartType: "area",
    },
    {
      key: "leads",
      icon: Users,
      label: "Leads",
      value: fmt(totals.leads),
      sub: cpl !== "—" ? `$${cpl} / lead` : undefined,
      color: "text-blue-600",
      hexColor: "#2563eb",
      chartType: "bar",
    },
    {
      key: "clicks",
      icon: MousePointer,
      label: "Clicks",
      value: fmt(totals.clicks),
      sub: `${ctr}% CTR`,
      color: "text-purple-600",
      hexColor: "#9333ea",
      chartType: "area",
    },
    {
      key: "impressions",
      icon: TrendingUp,
      label: "Impressions",
      value: fmt(totals.impressions),
      color: "text-orange-500",
      hexColor: "#f97316",
      chartType: "area",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Facebook Ad Performance</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Data pulled from Facebook Marketing API and stored in MySQL.
            {rows.length > 0 && <span className="text-gray-400"> Click any metric card to see daily trends.</span>}
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

      {/* Summary cards — clickable */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metricConfig.map(m => (
            <MetricCard
              key={m.key}
              icon={m.icon}
              label={m.label}
              value={m.value}
              sub={m.sub}
              color={m.color}
              hexColor={m.hexColor}
              onClick={() => setOpenMetric(m.key)}
            />
          ))}
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

      {/* Metric popup charts */}
      {metricConfig.map(m => (
        <MetricPopup
          key={m.key}
          open={openMetric === m.key}
          onClose={() => setOpenMetric(null)}
          label={m.label}
          color={m.hexColor}
          data={chartDataFor(m.key)}
          isCurrency={m.isCurrency}
          chartType={m.chartType}
        />
      ))}
    </div>
  );
}
