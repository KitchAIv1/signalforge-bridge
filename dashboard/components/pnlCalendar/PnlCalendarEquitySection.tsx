'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CurveTooltip } from '@/components/pnlCalendar/CurveTooltip';
import { ENGINE_COLORS } from '@/lib/pnlCalendarConstants';
import type { EquityPoint } from '@/lib/pnlCalendarTypes';

interface PnlCalendarEquitySectionProps {
  equityCurve: EquityPoint[];
}

export function PnlCalendarEquitySection({ equityCurve }: PnlCalendarEquitySectionProps) {
  if (equityCurve.length <= 1) return null;
  const tickInterval = Math.max(0, Math.floor(equityCurve.length / 8));

  return (
    <div
      style={{
        background: '#0e1420',
        border: '1px solid #1e2d3d',
        borderRadius: 14,
        padding: '20px 24px',
        marginBottom: 24,
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Cumulative R</span>
          <span style={{ fontSize: 11, color: '#3d5470', marginLeft: 10 }}>
            equity curve since Apr 30
          </span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] leading-relaxed">
          <span style={{ color: '#0ea5e9' }}>── Combined</span>
          <span style={{ color: ENGINE_COLORS.omega }}>── Omega</span>
          <span style={{ color: ENGINE_COLORS.engine_rebuild }}>── Rebuild</span>
          <span style={{ color: ENGINE_COLORS.engine_amd }}>── AMD</span>
          <span style={{ color: ENGINE_COLORS.omega_inverse }}>── Omega Inverse</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={128}>
        <AreaChart data={equityCurve} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="combinedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#111827" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#3d5470', fontFamily: "'DM Sans', sans-serif" }}
            tickLine={false}
            axisLine={false}
            interval={tickInterval}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#3d5470', fontFamily: "'Roboto Mono', monospace" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}R`}
            width={38}
          />
          <Tooltip content={<CurveTooltip />} />
          <ReferenceLine y={0} stroke="#1e2d3d" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="cumR"
            name="Combined"
            stroke="#0ea5e9"
            strokeWidth={2}
            fill="url(#combinedGrad)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="omegaR"
            name="Omega"
            stroke={ENGINE_COLORS.omega}
            strokeWidth={1.5}
            fill="none"
            dot={false}
            strokeDasharray="4 2"
          />
          <Area
            type="monotone"
            dataKey="rebuildR"
            name="Rebuild"
            stroke={ENGINE_COLORS.engine_rebuild}
            strokeWidth={1.5}
            fill="none"
            dot={false}
            strokeDasharray="4 2"
          />
          <Area
            type="monotone"
            dataKey="amdR"
            name="AMD"
            stroke={ENGINE_COLORS.engine_amd}
            strokeWidth={1.5}
            fill="none"
            dot={false}
            strokeDasharray="4 2"
          />
          <Area
            type="monotone"
            dataKey="omegaInverseR"
            name="Omega Inverse"
            stroke={ENGINE_COLORS.omega_inverse}
            strokeWidth={1.5}
            fill="none"
            dot={false}
            strokeDasharray="4 2"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
