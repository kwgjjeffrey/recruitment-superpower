/**
 * AutoViz.tsx —— viz 看板渲染器(<Auto> 家族新成员)。设计文档 docs/viz-compound-design.md。
 *
 * 分工:useVizData(SQL=编译查询；function=一次调用后绑定 datasets) + <AutoViz>(栅格渲染)。
 * ECharts option 在本文件集中生成；业务声明 schema，真实数据形状与视觉效果仍需验收。
 * 颜色不开放给业务:系列色由平台色板按序分配(出品稳定的一部分)。
 */
import { useEffect, useRef } from 'react'
import type { VizDef, FunctionVizDef, VizBlock, CartesianBlock, PieBlock, StatBlock, ScatterBlock, DimChannel, MeasureChannel, Grain } from './definition'
import { chanOut, isFunctionViz } from './definition'
import type { AnalyticsPayload } from './compile-query'
import { Card, fmt, AutoTable } from './presentation'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, LegendScrollComponent, MarkAreaComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// 按当前 mark 词汇表注册最小 ECharts 能力。禁止 `import * as echarts from 'echarts'`：
// 全量入口会把未使用图型/渲染器一并打进每个应用的 federation chunk。
echarts.use([
  BarChart, LineChart, PieChart, ScatterChart,
  GridComponent, LegendComponent, LegendScrollComponent, MarkAreaComponent, TooltipComponent,
  CanvasRenderer,
])

type Row = Record<string, unknown>

type ChartTheme = {
  palette: string[]
  axis: string
  grid: string
  weekend: string
  surface: string
  text: string
}

const CHART_COLOR_TOKENS = [
  '--chart-1', '--chart-2', '--chart-3', '--chart-4',
  '--chart-5', '--chart-6', '--chart-7', '--chart-8',
]

function chartTheme(el: HTMLElement): ChartTheme {
  const scope = el.closest('.page-root') ?? el
  const css = getComputedStyle(scope)
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    palette: CHART_COLOR_TOKENS.map((token) => read(token, '#257bf1')),
    axis: read('--chart-axis', '#8a9099'),
    grid: read('--chart-grid', 'rgba(15, 23, 42, 0.10)'),
    weekend: read('--chart-weekend', 'rgba(15, 23, 42, 0.05)'),
    surface: read('--chart-surface', '#ffffff'),
    text: read('--foreground', '#1f2329'),
  }
}

const fmtVal = (m: MeasureChannel | undefined, v: unknown): string => {
  if (v === null || v === undefined) return '-'
  if (m?.format === 'money') return fmt.money(v, 0)
  if (m?.format === 'percent') return fmt.pct(v)
  if (m?.format === 'int') return String(Math.round(Number(v)))
  const n = Number(v)
  return Number.isInteger(n) ? String(n) : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

// 时间桶值(桶起始日 ISO)→ 轴标签,按 grain 缩短
const bucketLabel = (grain: Grain | undefined, v: string): string => {
  if (!grain) return v
  if (grain === 'month') return v.slice(0, 7)
  if (grain === 'quarter') return `${v.slice(0, 4)}Q${Math.floor(Number(v.slice(5, 7)) / 3) + 1}`
  if (grain === 'year') return v.slice(0, 4)
  return v.slice(5)                                  // day/week → MM-DD
}
const dimLabel = (c: DimChannel, v: unknown): string => c.labels?.[String(v)] ?? bucketLabel(c.grain, String(v))
const isWeekend = (isoDay: string): boolean => {
  const dow = new Date(isoDay + 'T00:00:00Z').getUTCDay()
  return dow === 0 || dow === 6
}

// 单行可滚动图例，窄容器/多系列不换行侵占绘图区。
const chartLegend = (theme: ChartTheme) => ({
  type: 'scroll', top: 0, left: 0, right: 0, itemWidth: 14,
  textStyle: { color: theme.text },
})

// ── option 拼装器(mark → echarts option,按图型固化) ────────────────────────
const baseOption = (theme: ChartTheme) => ({
  animation: false,
  grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
  textStyle: { color: theme.text, fontSize: 11 },
})

function cartesianOption(b: CartesianBlock, rows: Row[], theme: ChartTheme) {
  const ys = Array.isArray(b.y) ? b.y : [b.y]
  const xKey = chanOut(b.x)
  const xVals = [...new Set(rows.map((r) => String(r[xKey])))]
  const catLabels = xVals.map((v) => dimLabel(b.x, v))

  let series: Record<string, unknown>[]
  let legend: string[]
  if (b.series) {
    const sKey = chanOut(b.series)
    const m = ys[0]
    const sVals = [...new Set(rows.map((r) => String(r[sKey])))]
    const idx = new Map(rows.map((r) => [`${r[xKey]}|${r[sKey]}`, r[chanOut(m)]]))
    legend = sVals.map((s) => b.series!.labels?.[s] ?? s)
    series = sVals.map((s, i) => ({
      name: b.series!.labels?.[s] ?? s,
      type: b.mark === 'bar' ? 'bar' : 'line',
      ...(b.mark === 'area' ? { areaStyle: { opacity: 0.25 } } : {}),
      ...(b.stacked ? { stack: 'total' } : {}),
      smooth: false, symbolSize: 5, barMaxWidth: 26,
      itemStyle: { color: theme.palette[i % theme.palette.length] },
      lineStyle: { width: 2 },
      data: xVals.map((x) => idx.get(`${x}|${s}`) ?? null),
    }))
  } else {
    legend = ys.map((m) => m.label)
    series = ys.map((m, i) => ({
      name: m.label,
      type: (m.shape ?? (b.mark === 'bar' ? 'bar' : 'line')),
      ...(b.mark === 'area' && !m.shape ? { areaStyle: { opacity: 0.25 } } : {}),
      ...(b.stacked ? { stack: 'total' } : {}),
      yAxisIndex: m.axis === 'right' ? 1 : 0,
      smooth: false, symbolSize: 5, barMaxWidth: 26,
      itemStyle: { color: theme.palette[i % theme.palette.length] },
      lineStyle: { width: 2 },
      data: xVals.map((x) => { const r = rows.find((row) => String(row[xKey]) === x); return r ? r[chanOut(m)] : null }),
    }))
  }

  // 周末底色(grain:day):连续周末段 → markArea
  if (b.x.grain === 'day' && b.x.mark_weekends && series.length) {
    const areas: [{ xAxis: string }, { xAxis: string }][] = []
    let runStart: number | null = null
    xVals.forEach((v, i) => {
      const we = isWeekend(v)
      if (we && runStart === null) runStart = i
      if ((!we || i === xVals.length - 1) && runStart !== null) {
        const endI = we ? i : i - 1
        areas.push([{ xAxis: catLabels[runStart] }, { xAxis: catLabels[endI] }])
        runStart = null
      }
    })
    series[0].markArea = { silent: true, itemStyle: { color: theme.weekend }, data: areas }
  }

  const leftM = ys.find((m) => m.axis !== 'right')
  const rightM = ys.find((m) => m.axis === 'right')
  const valueAxis = (m?: MeasureChannel) => ({
    type: 'value',
    ...(m?.format === 'int' ? { minInterval: 1 } : {}),
    axisLabel: { color: theme.axis, formatter: (v: number) => fmtVal(m, v) },
    splitLine: { lineStyle: { color: theme.grid } },
  })
  const catAxis = {
    type: 'category', data: catLabels,
    axisLabel: { color: theme.axis }, axisLine: { lineStyle: { color: theme.grid } }, axisTick: { show: false },
  }
  return {
    ...baseOption(theme),
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: unknown) => fmtVal(ys.length === 1 ? ys[0] : undefined, v),
    },
    legend: legend.length > 1 ? chartLegend(theme) : { show: false },
    xAxis: b.horizontal ? valueAxis(ys[0]) : catAxis,
    yAxis: b.horizontal
      ? { ...catAxis, inverse: true }
      : rightM ? [valueAxis(leftM), { ...valueAxis(rightM), splitLine: { show: false } }] : valueAxis(ys.length === 1 ? ys[0] : undefined),
    series,
  }
}

function pieOption(b: PieBlock, rows: Row[], theme: ChartTheme) {
  const cKey = chanOut(b.category), vKey = chanOut(b.value)
  const slices = rows
    .map((r) => ({ name: dimLabel(b.category, r[cKey]), value: Number(r[vKey] ?? 0) }))
  return {
    ...baseOption(theme),
    tooltip: { trigger: 'item', valueFormatter: (v: unknown) => fmtVal(b.value, v) },
    legend: chartLegend(theme),
    color: theme.palette,
    series: [{
      type: 'pie',
      radius: b.donut ? ['42%', '68%'] : '68%',
      center: ['50%', '56%'],
      label: { color: theme.text, formatter: '{b} {d}%' },
      itemStyle: { borderColor: theme.surface, borderWidth: 1 },
      data: slices,
    }],
  }
}

function scatterOption(b: ScatterBlock, rows: Row[], theme: ChartTheme) {
  const sKey = chanOut(b.series), xKey = chanOut(b.x), yKey = chanOut(b.y)
  const sizes = b.size ? rows.map((r) => Number(r[chanOut(b.size!)] ?? 0)) : []
  const maxSize = Math.max(1, ...sizes)
  // 给最大直径 30px 的气泡留出值域边距；只调整坐标轴，不补数据或改变数值。
  const extent = ({ min, max }: { min: number; max: number }, upper: boolean) => {
    const low = Math.min(0, min), high = Math.max(0, max)
    const gap = (high - low || 1) * 0.15
    return upper ? high + gap : low - gap
  }
  const axis = (m: MeasureChannel) => ({
    type: 'value', name: m.label, nameLocation: 'middle', nameGap: 36,
    min: (range: { min: number; max: number }) => extent(range, false),
    max: (range: { min: number; max: number }) => extent(range, true),
    ...(m.format === 'int' ? { minInterval: 1 } : {}),
    nameTextStyle: { color: theme.axis },
    axisLabel: { color: theme.axis, formatter: (v: number) => fmtVal(m, v) },
    splitLine: { lineStyle: { color: theme.grid } },
  })
  return {
    ...baseOption(theme),
    tooltip: {
      trigger: 'item',
      formatter: (p: { seriesName: string; value: [number, number] }) =>
        `${p.seriesName}<br/>${b.x.label}: ${fmtVal(b.x, p.value[0])}<br/>${b.y.label}: ${fmtVal(b.y, p.value[1])}`,
    },
    legend: chartLegend(theme),
    grid: { left: 48, right: 20, top: 42, bottom: 40, containLabel: true },
    xAxis: axis(b.x),
    yAxis: axis(b.y),
    series: rows.map((r, i) => ({
      name: dimLabel(b.series, r[sKey]),
      type: 'scatter',
      itemStyle: { color: theme.palette[i % theme.palette.length] },
      symbolSize: b.size ? 8 + 22 * (Number(r[chanOut(b.size!)] ?? 0) / maxSize) : 12,
      data: [[Number(r[xKey] ?? 0), Number(r[yKey] ?? 0)]],
    })),
  }
}

function buildOption(b: VizBlock, rows: Row[], theme: ChartTheme): Record<string, unknown> | null {
  switch (b.mark) {
    case 'line': case 'bar': case 'area': return cartesianOption(b, rows, theme)
    case 'pie': return pieOption(b, rows, theme)
    case 'scatter': return scatterOption(b, rows, theme)
    default: return null
  }
}

// ── ECharts 容器 ────────────────────────────────────────────────────────────
function Chart({ block, rows, height }: { block: VizBlock; rows: Row[]; height: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<{ setOption: (o: unknown, replace?: boolean) => void; resize: () => void; dispose: () => void } | null>(null)
  useEffect(() => {
    if (!ref.current) return
    const c = echarts.init(ref.current)
    chartRef.current = c
    const option = buildOption(block, rows, chartTheme(ref.current))
    if (option) c.setOption(option, true)
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); c.dispose(); chartRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ref.current) return
    const option = buildOption(block, rows, chartTheme(ref.current))
    if (option) chartRef.current?.setOption(option, true)
  }, [block, rows])
  return <div ref={ref} role="img" aria-label={block.title} style={{ height }} />
}

// ── 看板栅格 ────────────────────────────────────────────────────────────────
function BlockCard({ def, b, data }: { def: VizDef; b: VizBlock; data: unknown }) {
  const span = b.span ?? (b.mark === 'stat' ? 1 : 2)
  if (b.mark === 'stat') {
    const m = (b as StatBlock).value
    return (
      <Card className={span === 2 ? 'md:col-span-2' : ''} data-viz-mark={b.mark} data-testid={`viz-${b.id}`}>
        <div className="text-xs text-muted-foreground">{b.title}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtVal(m, data)}</div>
      </Card>
    )
  }
  const rows = (Array.isArray(data) ? data : []) as Row[]
  return (
    <Card
      className={span === 2 ? 'md:col-span-2' : ''}
      data-viz-mark={b.mark} data-testid={`viz-${b.id}`}
      data-pb-viz-status={rows.length === 0 ? 'empty' : 'ready'}
    >
      <div className="mb-2 text-sm font-medium">{b.title}</div>
      {b.mark === 'table'
        ? <AutoTable node={def.returns[b.id]} rows={rows} />
        : rows.length === 0
          ? <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No data for these filters</div>
          : <Chart block={b} rows={rows} height={240} />}
    </Card>
  )
}

/** 看板主体:2 列栅格(span 由 block 定)。数据由 useVizData 取好传入——view 层拿同一份喂 provide。 */
export function AutoViz({ def, data }: { def: VizDef; data: Record<string, unknown> }) {
  const meta = data.meta as AnalyticsPayload['meta'] | undefined
  return (
    <>
      {meta && (meta.partial || meta.notices.length > 0) && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="viz-notices">
          {meta.partial && <div>Some data is incomplete.</div>}
          {meta.notices.map((notice, i) => <div key={i}>{notice}</div>)}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {def.blocks.map((b) => <BlockCard key={b.id} def={def} b={b} data={data[b.id]} />)}
      </div>
    </>
  )
}
