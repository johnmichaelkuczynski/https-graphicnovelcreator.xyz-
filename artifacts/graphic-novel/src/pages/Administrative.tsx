import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { format } from 'date-fns';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { ArrowLeft, Loader2, ShieldAlert, Users } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

interface SeriesPoint {
  label: string;
  count: number;
}

interface AdminData {
  stats: {
    allTime: number;
    last24Hours: number;
    lastWeek: number;
    lastMonth: number;
    lastYear: number;
  };
  series: {
    last24Hours: SeriesPoint[];
    lastWeek: SeriesPoint[];
    lastMonth: SeriesPoint[];
    lastYear: SeriesPoint[];
    allTime: SeriesPoint[];
  };
  visits: { id: number; email: string | null; visitedAt: string }[];
}

async function fetchAdminData(): Promise<AdminData> {
  const res = await fetch('/api/admin/visits', { credentials: 'include' });
  if (res.status === 401 || res.status === 403) {
    throw new Error('forbidden');
  }
  if (!res.ok) throw new Error('Failed to load analytics.');
  return (await res.json()) as AdminData;
}

const PERIODS = [
  { key: 'last24Hours', label: 'Last Day', statKey: 'last24Hours' },
  { key: 'lastWeek', label: 'Last Week', statKey: 'lastWeek' },
  { key: 'lastMonth', label: 'Last Month', statKey: 'lastMonth' },
  { key: 'lastYear', label: 'Last Year', statKey: 'lastYear' },
  { key: 'allTime', label: 'All Time', statKey: 'allTime' },
] as const;

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border-2 border-border brutal-shadow p-4 flex flex-col gap-1">
      <span className="text-xs font-black uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-3xl font-black tabular-nums">{value.toLocaleString()}</span>
      <span className="text-[0.65rem] font-bold uppercase text-muted-foreground">
        Google logins
      </span>
    </div>
  );
}

function LoginChart({ data }: { data: SeriesPoint[] }) {
  return (
    <div className="bg-card border-2 border-border brutal-shadow p-4">
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.2)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fontWeight: 700 }}
              stroke="hsl(var(--foreground))"
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fontWeight: 700 }}
              stroke="hsl(var(--foreground))"
            />
            <RechartsTooltip
              cursor={{ fill: 'hsl(var(--primary) / 0.15)' }}
              contentStyle={{
                border: '2px solid hsl(var(--border))',
                borderRadius: 0,
                fontWeight: 700,
                background: 'hsl(var(--card))',
              }}
            />
            <Bar
              dataKey="count"
              name="Logins"
              fill="hsl(var(--primary))"
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Administrative() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'visits'],
    queryFn: fetchAdminData,
    retry: false,
    refetchInterval: 60_000,
  });

  const forbidden = isError && (error as Error)?.message === 'forbidden';

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b-2 border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/">
            <button className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-bold px-3 py-2 flex items-center gap-2 cursor-pointer">
              <ArrowLeft className="w-4 h-4" /> Studio
            </button>
          </Link>
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight">
            Administrative
          </h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {isLoading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {forbidden && (
          <div className="bg-card border-2 border-border brutal-shadow p-8 flex flex-col items-center gap-3 text-center">
            <ShieldAlert className="w-10 h-10 text-destructive" />
            <h2 className="text-lg font-black uppercase">Not authorized</h2>
            <p className="font-bold text-muted-foreground max-w-md">
              This page is restricted to the site owner.
            </p>
          </div>
        )}

        {isError && !forbidden && (
          <div className="bg-card border-2 border-destructive brutal-shadow p-6 font-bold text-destructive">
            Could not load analytics. Please try again.
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {PERIODS.map((p) => (
                <StatCard key={p.key} label={p.label} value={data.stats[p.statKey]} />
              ))}
            </div>

            {/* Graphs per period */}
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-black uppercase tracking-wide">
                Google logins over time
              </h2>
              <Tabs defaultValue="lastWeek">
                <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
                  {PERIODS.map((p) => (
                    <TabsTrigger
                      key={p.key}
                      value={p.key}
                      className="border-2 border-border font-black uppercase text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      {p.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {PERIODS.map((p) => (
                  <TabsContent key={p.key} value={p.key} className="mt-3">
                    <LoginChart data={data.series[p.key]} />
                  </TabsContent>
                ))}
              </Tabs>
            </section>

            {/* Visitors table */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <h2 className="text-sm font-black uppercase tracking-wide">
                  Who logged in ({data.visits.length})
                </h2>
              </div>
              <div className="bg-card border-2 border-border brutal-shadow">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-black uppercase text-xs">
                        Gmail
                      </TableHead>
                      <TableHead className="font-black uppercase text-xs text-right">
                        When
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.visits.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={2}
                          className="text-center font-bold text-muted-foreground py-8"
                        >
                          No logins recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {data.visits.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-bold">
                          {v.email ?? 'Unknown'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {format(new Date(v.visitedAt), 'MMM d, yyyy · h:mm a')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
