import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useThemeColors } from '../../hooks/useThemeColors';

interface Point {
  key: string;
  label: string;
  minutes: number;
}

/** Single-series bar chart of minutes studied per day. */
export function StudyChart({ data, height = 200 }: { data: Point[]; height?: number }) {
  const c = useThemeColors();
  return (
    <div style={{ height }} role="img" aria-label="Minutes studied per day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke={c.line} strokeOpacity={0.6} />
          <XAxis
            dataKey="label"
            tick={{ fill: c.faint, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: c.line }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis allowDecimals={false} tick={{ fill: c.faint, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: c.raised }}
            contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12, color: c.ink }}
            labelStyle={{ color: c.muted }}
            formatter={(v: number) => [`${v} min`, 'Studied']}
          />
          <Bar dataKey="minutes" fill={c.accent} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
