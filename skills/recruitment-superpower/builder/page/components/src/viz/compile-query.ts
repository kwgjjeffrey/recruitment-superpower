/**
 * viz.ts —— viz 看板的查询编译器(纯逻辑,无 React)。设计文档 docs/viz-compound-design.md。
 *
 * 职责:把「data_source(视图) + params 当前值(WHERE) + block 通道(分桶/聚合)」编译成
 * SQL 源编译 GROUP BY SQL(经 execute-query 在用户身份下跑,RLS 末端鉴权)并兼容 numeric coercion/时间补桶；
 * analytics function 源只绑定已验真的 datasets，不聚合、不补桶、不做类型转换。
 * 两条源最终共用 JS sort/slice，用户看的图与 agent 观察的行始终是同一份。
 *
 * 安全:execute-query 只收 SQL 字符串(无绑定参数),因此所有注入值走 lit() 单引号转义;
 * 列名/表达式全部来自 schema.ts 声明(编译期定死),运行期没有自由字符串拼接面。
 */
import type {
  Node, VizBlock, SqlVizDef, FunctionVizDef, SqlVizBlock,
  SqlDimChannel, SqlMeasureChannel, DimChannel, MeasureChannel, Grain, SqlCartesianBlock,
} from './definition'
import { blockChannels, blockDimensions, blockMeasures, chanOut } from './definition'

// ── 日期区间解析 ─────────────────────────────────────────────────────────────
export type DateRange = { start: string; end: string }   // [start, end) 皆 YYYY-MM-DD

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)

/** 值格式:last_<N>d / last_<N>m / this_month / this_quarter / ytd / YYYY-MM-DD..YYYY-MM-DD */
export function resolveDateRange(v: unknown, now = new Date()): DateRange {
  const s = String(v ?? '').trim() || 'last_90d'
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end = addDays(today, 1)                       // 右开区间,含今天
  const m1 = s.match(/^last_(\d+)d$/)
  if (m1) return { start: iso(addDays(end, -Number(m1[1]))), end: iso(end) }
  const m2 = s.match(/^last_(\d+)m$/)
  if (m2) { const d = new Date(end); d.setUTCMonth(d.getUTCMonth() - Number(m2[1])); return { start: iso(d), end: iso(end) } }
  if (s === 'this_month') return { start: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), end: iso(end) }
  if (s === 'this_quarter') { const q = Math.floor(today.getUTCMonth() / 3) * 3; return { start: iso(new Date(Date.UTC(today.getUTCFullYear(), q, 1))), end: iso(end) } }
  if (s === 'ytd') return { start: iso(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))), end: iso(end) }
  const m3 = s.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/)
  if (m3) return { start: m3[1], end: iso(addDays(new Date(m3[2] + 'T00:00:00Z'), 1)) }   // 显式区间含尾日
  return { start: iso(addDays(end, -90)), end: iso(end) }
}

/** 组件展示用:任意合法值 → 闭区间 {from,to}(end 是右开,展示减一天)。 */
export function displayRange(v: unknown, now = new Date()): { from: string; to: string } {
  const r = resolveDateRange(v, now)
  return { from: r.start, to: iso(addDays(new Date(r.end + 'T00:00:00Z'), -1)) }
}

// ── SQL 片段 ────────────────────────────────────────────────────────────────
const lit = (v: unknown) => `'${String(v).replace(/'/g, "''")}'`
const ident = (c: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c)) throw new Error(`非法列名: ${c}`)
  return `"${c}"`
}

const dimExpr = (c: SqlDimChannel) =>
  c.grain ? `date_trunc('${c.grain}', ${ident(c.rel_column)})::date::text` : ident(c.rel_column)
const meaExpr = (c: SqlMeasureChannel) =>
  c.agg === 'count' ? 'COUNT(*)'
  : c.agg === 'count_distinct' ? `COUNT(DISTINCT ${ident(c.rel_column!)})`
  : `${c.agg.toUpperCase()}(${ident(c.rel_column!)})`

/** params 当前值 → WHERE 子句数组。算子由组件类型推断:daterange→[start,end)、数组→IN、
 *  boolean true→=true(false/未设=不过滤)、带枚举 string→=、普通 string→ILIKE 包含。未设值不进 WHERE。 */
export function whereClauses(def: SqlVizDef, values: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const [k, node] of Object.entries(def.params)) {
    const col = node.rel_column
    if (!col) continue
    const v = values[k] ?? node.default
    if (node.widget === 'daterange') {
      const r = resolveDateRange(v)
      out.push(`${ident(col)} >= ${lit(r.start)}`, `${ident(col)} < ${lit(r.end)}`)
      continue
    }
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue
    if (Array.isArray(v)) { out.push(`${ident(col)} IN (${v.map(lit).join(', ')})`); continue }
    if (node.filterOperator === 'eq') { out.push(`${ident(col)} = ${lit(v)}`); continue }
    if (node.type === 'boolean') { if (v === true || v === 'true') out.push(`${ident(col)} = true`); continue }
    if (node.type === 'number' || node.type === 'integer') { out.push(`${ident(col)} = ${Number(v)}`); continue }
    if (node.enum || node.enumSource) { out.push(`${ident(col)} = ${lit(v)}`); continue }
    out.push(`${ident(col)} ILIKE ${lit('%' + String(v) + '%')}`)
  }
  return out
}

/** 看板当前的时间窗(取第一个 daterange 参数)——补桶的桶域用它。 */
export function activeRange(def: SqlVizDef, values: Record<string, unknown>): DateRange | null {
  for (const [k, node] of Object.entries(def.params))
    if (node.widget === 'daterange') return resolveDateRange(values[k] ?? node.default)
  return null
}

/** 一个 block → 一条 SQL。数据源视图作子查询,params 当 WHERE,通道当 SELECT/GROUP BY。 */
export function compileBlock(def: SqlVizDef, b: SqlVizBlock, values: Record<string, unknown>): string {
  const src = `(${def.data_source.sql.trim().replace(/;\s*$/, '')}) AS src`
  const where = whereClauses(def, values)
  const W = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const dims = blockDimensions(b) as SqlDimChannel[]
  const meas = blockMeasures(b) as SqlMeasureChannel[]
  const chans = blockChannels(b)
  // 明细模式(table 无度量):不聚合,直接取行
  if (b.mark === 'table' && meas.length === 0) {
    const cols = dims.map((c) => `${dimExpr(c)} AS ${ident(chanOut(c))}`).join(', ')
    return `SELECT ${cols} FROM ${src}${W}`
  }

  const sel = chans.map((c) => meas.includes(c as SqlMeasureChannel)
    ? `${meaExpr(c as SqlMeasureChannel)} AS ${ident(chanOut(c))}`
    : `${dimExpr(c as SqlDimChannel)} AS ${ident(chanOut(c))}`).join(', ')
  if (dims.length === 0) return `SELECT ${sel} FROM ${src}${W}`   // stat:单行聚合
  const groupBy = ` GROUP BY ${dims.map((c) => String(chans.indexOf(c) + 1)).join(', ')}`
  // block sort/limit 的唯一语义在 JS 后处理，SQL 不下推，避免 SQL/function 两套行为。
  return `SELECT ${sel} FROM ${src}${W}${groupBy}`
}

// ── 返回行后处理 ─────────────────────────────────────────────────────────────
type Row = Record<string, unknown>
const num = (v: unknown): number => Number(v ?? 0)

/** numeric 经 API 回来是字符串——所有度量列统一转 number(agent 与图都吃规范值)。 */
export function coerceRows(b: SqlVizBlock, rows: Row[]): Row[] {
  const meas = blockMeasures(b)
  return rows.map((r) => {
    const o = { ...r }
    for (const m of meas) { const k = chanOut(m); if (o[k] !== null && o[k] !== undefined) o[k] = num(o[k]) }
    return o
  })
}

/** 桶序列:按 grain 枚举 [start,end) 内的所有桶起始日。 */
export function bucketSeq(range: DateRange, grain: Grain): string[] {
  const out: string[] = []
  const end = new Date(range.end + 'T00:00:00Z')
  let d = new Date(range.start + 'T00:00:00Z')
  // 对齐到桶起始
  if (grain === 'week') { const dow = (d.getUTCDay() + 6) % 7; d = addDays(d, -dow) }
  if (grain === 'month') d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  if (grain === 'quarter') d = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1))
  if (grain === 'year') d = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  while (d < end && out.length < 1500) {
    out.push(iso(d))
    if (grain === 'day') d = addDays(d, 1)
    else if (grain === 'week') d = addDays(d, 7)
    else if (grain === 'month') d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    else if (grain === 'quarter') d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1))
    else d = new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1))
  }
  return out
}

/** 时间补桶:x 有 grain 且 fill≠none 的笛卡尔图,把窗内缺失的桶补齐(有 series 则按 系列×桶 补)。 */
export function fillTimeGaps(b: SqlVizBlock, rows: Row[], range: DateRange | null): Row[] {
  if (!range) return rows
  if (b.mark !== 'line' && b.mark !== 'bar' && b.mark !== 'area') return rows
  const cb = b as SqlCartesianBlock
  const x = cb.x
  if (!x.grain || (x.fill ?? 'auto') === 'none') return rows
  const ys = Array.isArray(cb.y) ? cb.y : [cb.y]
  const fillMode = x.fill ?? (ys.every((m) => m.agg === 'sum' || m.agg === 'count' || m.agg === 'count_distinct') ? 'zero' : 'null')
  if (fillMode === 'none') return rows
  const fillVal = fillMode === 'zero' ? 0 : null
  const xKey = chanOut(x)
  const buckets = bucketSeq(range, x.grain)
  const sKey = cb.series ? chanOut(cb.series) : null
  const seriesVals = sKey ? [...new Set(rows.map((r) => String(r[sKey])))] : [null]
  const byKey = new Map(rows.map((r) => [`${r[xKey]}|${sKey ? r[sKey] : ''}`, r]))
  const out: Row[] = []
  for (const bk of buckets)
    for (const sv of seriesVals) {
      const hit = byKey.get(`${bk}|${sv ?? ''}`)
      if (hit) { out.push(hit); continue }
      const r: Row = { [xKey]: bk }
      if (sKey) r[sKey] = sv
      for (const m of ys) r[chanOut(m)] = fillVal
      out.push(r)
    }
  return out
}

const compareValue = (a: unknown, b: unknown): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1
  if (b === null || b === undefined) return 1
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

/** 两种源共用：显式 value sort 在 JS 做稳定排序，limit 在排序后 slice；省略 sort 保留数据默认序。 */
export function sortAndLimitRows(b: VizBlock, rows: Row[]): Row[] {
  const dims = blockDimensions(b)
  const meas = blockMeasures(b)
  const sortDim = dims.find((c) => c.sort === 'value_desc' || c.sort === 'value_asc')
  let out = rows.slice()
  if (sortDim) {
    const target = meas[0] ?? sortDim
    const key = chanOut(target)
    const direction = sortDim.sort === 'value_desc' ? -1 : 1
    out.sort((a, z) => direction * compareValue(a[key], z[key]))
  }
  const limit = b.limit ?? (b.mark === 'table' ? 100 : undefined)
  if (limit !== undefined) out = out.slice(0, Math.max(0, Math.floor(limit)))
  return out
}

export type AnalyticsPayload = {
  ok: true
  datasets: Record<string, Row[]>
  meta: { observed_at: string; partial: boolean; notices: string[] }
}

/** 标准 analytics 响应 → block 数据。这里故意不 coerce、不补桶：真类型/完整窗口由函数出口保证。 */
export function bindFunctionDatasets(def: FunctionVizDef, payload: AnalyticsPayload): Record<string, unknown> {
  if (!payload || payload.ok !== true || !payload.datasets || typeof payload.datasets !== 'object')
    throw new Error('analytics function 返回的不是标准 datasets 响应')
  const out: Record<string, unknown> = {
    meta: { ...payload.meta, notices: Array.isArray(payload.meta?.notices) ? payload.meta.notices : [] },
  }
  for (const b of def.blocks) {
    const sourceRows = payload.datasets[b.dataset]
    if (!Array.isArray(sourceRows)) throw new Error(`analytics dataset '${b.dataset}' 缺失或不是数组`)
    const rows = sortAndLimitRows(b, sourceRows)
    if (b.mark === 'stat') out[b.id] = rows.length ? rows[0][chanOut(b.value)] : null
    else out[b.id] = rows
  }
  return out
}

/** 一个 block 的完整数据管线:编译 → 查询(query 由调用方注入) → 数值规范 → 补桶 → (stat 取单值)。 */
export async function runBlock(
  def: SqlVizDef, b: SqlVizBlock, values: Record<string, unknown>,
  query: (sql: string) => Promise<Row[]>,
): Promise<unknown> {
  const rows = coerceRows(b, await query(compileBlock(def, b, values)))
  if (b.mark === 'stat') return rows.length ? rows[0][chanOut(b.value)] : 0
  return sortAndLimitRows(b, fillTimeGaps(b, rows, activeRange(def, values)))
}
