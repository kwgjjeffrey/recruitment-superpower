/**
 * schema.ts —— f.*：字段声明构造器（纯数据，无 React）。
 *
 * 设计要点：
 *  · 输出就是 JSON Schema 节点（type / description / enum / default / properties / items），行业标准。
 *  · 纯数据、不引 React，所以【运行时】(view 里 accept/provide 用) 和【构建期】(derive 用 node 导入) 共用同一份声明。
 *  · 一处声明，type/default 给运行时，description/enum/required 给 derive 产 yaml —— 不写两遍。
 *
 * required：JSON Schema 里 required 是父对象上的数组。这里允许在字段上写 { required: true } 作临时标记，
 * derive 会把它收进父对象的 required[] 并从属性里删掉。
 */
export type DataGridConfig = {
  /** 每行稳定身份字段。滚动换块、编辑和树节点定位都不能使用数组下标。 */
  rowKey: string
  /** 单元格编辑由字段 readonly 决定；explicit 汇总草稿后由页面提交，immediate 每格调用 onCellCommit。 */
  edit?: { mode: 'cell'; commit: 'explicit' | 'immediate' }
  /**
   * 树形是 DataGrid 的列能力，不是另一套表格。
   *
   * 简单树：`column + parentKey`，DataGrid 根据父子关系展开行。
   * 多维树/矩阵：使用 `columns` 声明多个树列。此时页面提供已经按业务规则聚合、排序的可见行，
   * 各 `*Key` 指向行上的展示元数据；点击展开后由 DataGrid 的 `onTreeToggle` 通知页面重建行集。
   */
  tree?: {
    column?: string
    parentKey?: string
    hasChildrenKey?: string
    columns?: Array<{
      column: string
      depthKey: string
      expandKey: string
      expandedKey: string
      visibleKey?: string
    }>
    aggregateEdit?: {
      columns: string[]
      precision?: number
      zeroWeight?: 'equal' | 'reject'
    }
  }
}

export type Node = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'
  description: string
  /** 短标签（可选）：表头/字段名用它，缺省用 description。description 写给 agent（可以长），
   *  title 写给表格头（要短，如 '金额'）。纯渲染层用，derive 略去。 */
  title?: string
  enum?: (string | number)[]
  default?: unknown
  required?: boolean
  /** 渲染提示（可选）：currency/date/datetime/badge/textarea…。纯渲染层用，<Auto> 据此挑展示样式；
   *  derive 略去它（不进 agent 契约 yaml）。不写则按 type 默认渲染。
   *  特殊值 'hidden'：不渲染该字段（accept 仍管理它、代填仍可达）——给「编辑哪张草稿的 id」这类
   *  定位参用，别让它变成一个莫名其妙的可编辑输入框。 */
  widget?: string
  /** 枚举值→展示标签的映射（可选，纯渲染层）：badge/enum 字段库里存原始值（如 in_stock/borrowed），
   *  想给人看中文就写 { in_stock: '在库', borrowed: '借出' }。Badge/下拉据此显示 label，值本身不变
   *  （agent 代填、提交、SQL 用的仍是原始值）。derive 略去它（不进 agent 契约 yaml——agent 认原始值）。 */
  labels?: Record<string, string>
  /** widget='upload' 时：附件上传走哪个 edge function（POST multipart 转存、GET 代下载）。仅渲染层用，derive 略去。 */
  uploadFn?: string
  /** FileField 初始模式；view 仅展示，edit 才组合 UploadCell。 */
  fileFieldMode?: 'view' | 'edit'
  /** 是否显示查看 / 编辑切换；这只是 UI 状态，不是授权开关。 */
  allowModeSwitch?: boolean
  accept?: string
  maxSizeMb?: number
  maxCount?: number
  /** 只读字段（可选，derive 略去）：编辑态以文本展示，accept 代填不修改该列；不是服务端授权。
   *  与 widget:'hidden' 的区别：hidden 完全不渲染，readonly 显示但不可改。
   *  典型：混合可编辑表格的「背景列」——候选人信息只读、决策/理由列可改（编辑态 AutoTable 按它分列）。 */
  readonly?: boolean
  /** 行集(array)专用·行操作(可选,纯渲染层,derive 略去):AutoTable 行末尾出操作列。
   *  一个动作=文本按钮,多个=收进「⋯」菜单;动作干什么由视图的 onRowAction(action,row) 接线(通常 go 跳视图)。
   *  editable 表格未声明它时保留内置「删除」;声明了则以此为准('delete' 仍映射内置删行)。 */
  rowActions?: string[]
  /** 行集(array)专用·代填合并策略(可选,accept 消费):
   *  'replace'(默认)=整组替换(agent 可增删重排行);'id'=按行 id 合并(行集固定、只回填部分列,如批量评估;
   *  AutoTable 对固定行集不出「新增明细」)。 */
  mergeBy?: 'replace' | 'id'
  /** 表格列宽提示(可选,纯渲染层,derive 略去):AutoTable 该列最小宽 px(缺省 120;理由/描述类给宽些)。 */
  columnWidth?: number
  /** 大数据表格的纯声明配置。数据加载和保存函数由 view 接线，渲染/滚动实现不进入 schema。 */
  grid?: DataGridConfig
  /** 枚举来源（可选，二选一，只用于 params 侧可填字段。协议 docs/page-enum-source-design.md）：
   *
   *  { table, column } —— 合法值真源是该表列的 CHECK 约束（伪动态）：静态 enum 照写（运行时/yaml
   *    直接用，不发请求），check 用 DDL 解析器比对 enum 与 CHECK，漂移硬失败——枚举只有一个真源。
   *
   *  { fn, params?, dataPath?, valueField?, labelField? } —— 合法值来自本 app 的 edge function（真动态）。
   *    传统元数据驱动 select 的五件套（对齐 amis 惯例）：
   *    · fn        函数 slug（组件 callFn 直接用；derive 产 yaml 时经 manifest binds 反查成 asset_path）
   *    · params    参数模板。值可用占位符：'${term}'=用户检索词（出现即升级为可检索 combobox）、
   *                '${<字段>}'=本视图另一字段的当前值（级联：该字段一变自动重拉）
   *    · dataPath  响应里列表在哪个键（点号路径）。缺省按惯例探 options → rows → items
   *    · valueField/labelField  列表每项的提交值/显示名字段（平字段名不是路径）。缺省 value/label
   *    真源纪律：消费映射（dataPath/valueField/labelField）的真源在【函数自己的语义 yaml 的 options 段】，
   *    这里写的副本由 check 与之互证；--kind=options 脚手的规范函数（返回 {options:[{value,label}]}）
   *    三个字段全缺省，一行 { fn, params } 即可。失败态=禁用下拉+红字+重试，绝不降级成文本框。
   *
   *  层级扩展（fn 形态 + widget:'cascade'|'tree' 时，--kind=tree 脚手的函数；协议
   *  docs/app-schema-vocabulary-design/design.md）：
   *    · mode      'whole'=整树一次拉（选项带 children） | 'lazy'（默认）=按 ?parent=<value> 逐层拉（选项带 isLeaf）
   *    · emit      cascade 存什么：'leaf'（默认，末级值）| 'path'（整条路径数组，Node.type 相应为 array）
   *    · multiple  tree 是否勾选多个（true 时 Node.type 为 array）
   *    · leafOnly  tree 只许挑叶子（如叶=库存行的树；点非叶=展开/收起） */
  enumSource?:
    | { table: string; column: string }
    | { fn: string; params?: Record<string, string | number | boolean>
        dataPath?: string; valueField?: string; labelField?: string
        mode?: 'whole' | 'lazy'; emit?: 'leaf' | 'path'; multiple?: boolean; leafOnly?: boolean
        /** 选中回填兄弟字段:{ '选项里的路径': '本行/本视图目标字段' },如 { 'meta.price': 'price' }
         *  (选商品自动带出单价)。选项行的 meta 由 options 函数返回。 */
        onSelectFill?: Record<string, string> }
  properties?: Record<string, Node>
  items?: Node
  /** 标准 JSON Schema 行数约束。analytics KPI dataset 用 minItems/maxItems=1 声明单行表。 */
  minItems?: number
  maxItems?: number
  /** analytics dataset 字段可选的时间粒度声明；check 与 viz block.x.grain 互证。 */
  grain?: 'year' | 'quarter' | 'month' | 'week' | 'day'
  /** viz(数据看板)专用·参数作用列:该参数过滤 data_source 的哪一列。只在 schema.ts 内部用
   *  (查询编译),derive 略去(消费 agent 只见对外参数名,列名不暴露)。 */
  rel_column?: string
  /** Page Builder's locked filter operator. Omitted keeps the existing free-TSX
   * text-search behavior; generated Definitions use `eq` for exact filters. */
  filterOperator?: 'eq'
  /** 组件内置的【填写要求】(值协议),每行一种合法写法。由组件构造器自动带上(如 f.dateRange),
   *  作者不写;derive 原样透传进 params yaml 的 format 键。与 description(业务含义,作者写)分离,
   *  互不冲突——组件能填什么只有组件自己知道。 */
  format?: string[]
}
type Opt = { title?: string; enum?: (string | number)[]; default?: unknown; required?: boolean; widget?: string; labels?: Record<string, string>; uploadFn?: string; fileFieldMode?: Node['fileFieldMode']; allowModeSwitch?: boolean; accept?: string; maxSizeMb?: number; maxCount?: number; enumSource?: Node['enumSource']; readonly?: boolean; columnWidth?: number; grid?: DataGridConfig; rel_column?: string; filterOperator?: Node['filterOperator']; minItems?: number; maxItems?: number; grain?: Node['grain'] }

/** f.select / f.multiSelect 的选项来源(三选一,一眼看出候选从哪来):
 *  · fixed      写死的选项数组(等价直接写 enum)
 *  · fromColumn 表列 CHECK 约束是真源({table,column},静态 enum 照写,check 互证)
 *  · api        本 app 的 options 函数({fn,params},'${term}' 检索、'${字段}' 级联) */
type SelectSrc = {
  fixed?: (string | number)[]
  fromColumn?: { table: string; column: string }
  /** 同一来源类型，不在糖语法重复维护能力子集；如选商品回填单价：
   * api:{fn:'product-options',onSelectFill:{'meta.price':'unitPrice'}}。
   * 候选函数需返回 {options:[{value,label,meta:{price}}]}，组件不会猜价格。 */
  api?: Extract<NonNullable<Node['enumSource']>, { fn: string }>
}
const srcToNode = (s: SelectSrc): Partial<Node> => ({
  ...(s.fixed ? { enum: s.fixed } : {}),
  ...(s.fromColumn ? { enumSource: s.fromColumn } : {}),
  ...(s.api ? { enumSource: s.api } : {}),
})

/** 日期区间预设(f.dateRange 组件菜单/viz.ts 解析/语义值协议的唯一真源)。
 *  通用式 last_<N>d / last_<N>m 任意 N 皆合法,预设只是常用档。 */
export const DATE_RANGE_PRESETS: [string, string][] = [
  ['last_7d', '近 7 天'], ['last_30d', '近 30 天'], ['last_90d', '近 90 天'],
  ['this_month', '本月'], ['this_quarter', '本季度'], ['ytd', '今年以来'],
]
/** dateRange 的填写要求(进语义 format 键)。首行自定义区间,后随预设档,末行通用式。 */
export const DATE_RANGE_FORMAT: string[] = [
  '<起始日>..<结束日>, 即 YYYY-MM-DD..YYYY-MM-DD(含首尾日)',
  ...DATE_RANGE_PRESETS.map(([k]) => k),
  'last_<N>d / last_<N>m(任意 N,如 last_14d)',
]

export const f = {
  string:  (description: string, o: Opt = {}): Node => ({ type: 'string',  description, ...o }),
  number:  (description: string, o: Opt = {}): Node => ({ type: 'number',  description, ...o }),
  integer: (description: string, o: Opt = {}): Node => ({ type: 'integer', description, ...o }),
  boolean: (description: string, o: Opt = {}): Node => ({ type: 'boolean', description, ...o }),
  date: (description: string, o: Opt = {}): Node => ({ type: 'string', description, widget: 'date', format: ['YYYY-MM-DD（日期，不含时间或时区）'], ...o }),
  datetime: (description: string, o: Opt = {}): Node => ({ type: 'string', description, widget: 'datetime', format: ['YYYY-MM-DDTHH:mm（本地日期时间，不含时区，不自动转 UTC）'], ...o }),
  time: (description: string, o: Opt = {}): Node => ({ type: 'string', description, widget: 'time', format: ['HH:mm（24 小时制，本地时间）'], ...o }),
  textarea: (description: string, o: Opt = {}): Node => ({ type: 'string', description, widget: 'textarea', ...o }),
  checkbox: (description: string, o: Opt = {}): Node => ({ type: 'boolean', description, widget: 'checkbox', ...o }),
  percent: (description: string, o: Opt = {}): Node => ({ type: 'number', description, widget: 'percent', format: ['填写比例数值，例如 0.125 表示 12.5%，1 表示 100%；不带 % 符号'], ...o }),
  radio: (description: string, s: Opt & { fixed: string[] }): Node => {
    const { fixed, ...o } = s
    return { type: 'string', description, enum: fixed, widget: 'radio', ...o }
  },
  checkboxGroup: (description: string, s: Opt & { fixed: string[] }): Node => {
    const { fixed, ...o } = s
    return { type: 'array', description, widget: 'checkbox-group', items: { type: 'string', description, enum: fixed }, ...o }
  },
  tags: (description: string, o: Opt = {}): Node => ({ type: 'array', description, widget: 'tags', items: { type: 'string', description: '标签文字' }, ...o }),
  /** 单条记录：properties 是字段表。 */
  object:  (description: string, properties: Record<string, Node>, o: Opt = {}): Node =>
             ({ type: 'object', description, properties, ...o }),
  /** 行集：rowProps 是每行的字段表（items 固定为 object）。
   *  opts 另认 rowActions(行操作列)与 mergeBy('id'=代填按行 id 合并,默认整组替换),见 Node 注释。 */
  array:   (description: string, rowProps: Record<string, Node>, o: Opt & { rowActions?: string[]; mergeBy?: 'replace' | 'id'; grid?: DataGridConfig } = {}): Node =>
             ({ type: 'array', description, items: { type: 'object', description: '一行', properties: rowProps }, ...o }),
  /** 附件（平台组件）——分层：开发只写 description(+固化目标 uploadFn,即 <app>-upload 中转函数);
   *  消费 agent 帮填只给每份 {path}（本机绝对路径;name 可省,组件按路径末段取）;
   *  行结构/widget/活取/固化全在组件内部（UploadCell,见 auto.tsx/upload.ts）,两边都不用管。
   *  ⚠️ 附件绝不能声明成 f.string——agent 会照 schema 把数组 stringify 传入(实测事故)。 */
  attachments: (description: string, o: Opt & { uploadFn?: string } = {}): Node => ({
    type: 'array', description,
    items: { type: 'object', description: '一份附件(帮填只给 path)', properties: {
      path: { type: 'string', description: '该文件的本机绝对路径(不 file://、不 base64、不自己上传)' },
      name: { type: 'string', description: '文件名(可省,默认取路径末段)' },
    } },
    widget: 'upload', ...o,
  }),

  // ── 选择类糖(产出仍是标准 Node,derive/check 无需认新形状)────────────────────
  /** 单选下拉。来源三选一(fixed / fromColumn / api,见 SelectSrc);fromColumn 需与 fixed 同给
   *  (静态 enum 是运行时/yaml 直接用的值,fromColumn 让 check 拿 DDL CHECK 互证)。 */
  select: (description: string, s: SelectSrc & Opt = {}): Node => {
    const { fixed, fromColumn, api, ...o } = s
    return { type: 'string', description, ...srcToNode({ fixed, fromColumn, api }), ...o }
  },
  /** 多选(存值数组)。来源同 f.select;渲染为多选 combobox(chips),只读态为标签串。 */
  multiSelect: (description: string, s: SelectSrc & Opt = {}): Node => {
    const { fixed, fromColumn, api, ...o } = s
    return {
      type: 'array', description, widget: 'multiselect',
      items: { type: 'string', description, ...(fixed ? { enum: fixed } : {}) },
      ...(fromColumn ? { enumSource: fromColumn } : {}), ...(api ? { enumSource: api } : {}), ...o,
    }
  },
  /** 金额:number + 只读态货币格式化(fmt.money)。 */
  money: (description: string, o: Opt = {}): Node => ({ type: 'number', description, widget: 'currency', ...o }),
  /** 日期区间(viz 看板筛选常用,CRUD 列表也可用)。值协议(DATE_RANGE_PRESETS/DATE_RANGE_FORMAT
   *  是唯一真源,组件渲染/viz.ts 解析/语义共用):预设枚举 或 YYYY-MM-DD..YYYY-MM-DD 自定义起止。
   *  填写要求自动落在 format 键(description 归作者写业务含义,两者分离不冲突)。viz 里配 rel_column 指定作用列。 */
  dateRange: (description: string, o: Opt = {}): Node => ({
    type: 'string', description, widget: 'daterange', format: DATE_RANGE_FORMAT, ...o,
  }),

  // ── 层级选择(tree/cascade 共用层级数据源,--kind=tree 脚手;协议 design.md 尾注二)──
  /** 级联选择器(一个控件逐列下钻,如 省→市→区)。emit:'leaf'(默认,存末级值)|'path'(存整条数组)。 */
  cascade: (description: string, s: { api: { fn: string; params?: Record<string, string | number | boolean>; mode?: 'whole' | 'lazy' }; emit?: 'leaf' | 'path' } & Opt): Node => {
    const { api, emit = 'leaf', ...o } = s
    const src = { fn: api.fn, params: api.params, mode: api.mode ?? 'lazy', emit } as Node['enumSource']
    return emit === 'path'
      ? { type: 'array', description, widget: 'cascade', items: { type: 'string', description: '路径上一级的值' }, enumSource: src, ...o }
      : { type: 'string', description, widget: 'cascade', enumSource: src, ...o }
  },
  /** 树选择器(展开树挑节点,如部门树)。multiple=true 勾选多个(存值数组)。
   *  readonly:true 时为【只读层级展示】:数据来自 provide 的值(嵌套 {label,children}),不拉数据源。 */
  tree: (description: string, s: { api?: { fn: string; params?: Record<string, string | number | boolean>; mode?: 'whole' | 'lazy' }; multiple?: boolean; leafOnly?: boolean } & Opt = {}): Node => {
    const { api, multiple = false, leafOnly = false, ...o } = s
    if (o.readonly || !api) {
      return { type: 'object', description, widget: 'tree', readonly: true, properties: {
        label: { type: 'string', description: '节点名' },
        children: { type: 'array', description: '子节点(同构嵌套)', items: { type: 'object', description: '子节点', properties: {} } },
      }, ...o }
    }
    const src = { fn: api.fn, params: api.params, mode: api.mode ?? 'lazy', multiple, ...(leafOnly ? { leafOnly } : {}) } as Node['enumSource']
    return multiple
      ? { type: 'array', description, widget: 'tree', items: { type: 'string', description: '选中节点的值' }, enumSource: src, ...o }
      : { type: 'string', description, widget: 'tree', enumSource: src, ...o }
  },

  // ── 业务组件(预设 = 基础组件 + corp API 函数;调研 docs/person-dept-business-components-research.md)──
  // 存储组件化:字段值 = 【选项引用对象】(不是裸 username/code)——选中那一刻把展示数据一起存进去,
  // 渲染零接口零闪现;agent 代填只给 value(或裸字符串)时,组件自动反查补全并回写。
  /** 人员选择(业务组件):可检索(姓名/拼音/username),下拉项带头像/姓名/username,选中成胶囊(头像+姓名)。
   *  零配置:数据源缺省 = 平台公共函数 platform-person-search(每环境一份,应用无需自带;
   *  要换私有源才传 fn,如 --kind=person 脚手的应用级函数)。
   *  值 = {value:username, label:姓名, avatar, org}(multiple=true 存对象数组;列建 jsonb)。
   *  「谁在搜」由登录态决定(函数内 auth 通道),不在这声明、agent 也传不了。 */
  person: (description: string, s: { fn?: string; multiple?: boolean } & Opt = {}): Node => {
    const { fn = 'platform-person-search', multiple = false, ...o } = s
    const src = { fn, params: { q: '${term}' } } as Node['enumSource']
    const props: Record<string, Node> = {
      value: { type: 'string', description: '人员 username(唯一需要填的键;裸 username 字符串也接受)', required: true },
      label: { type: 'string', description: '姓名(展示冗余,组件自动补全)' },
      avatar: { type: 'string', description: '头像 url(组件自动补全)' },
      org: { type: 'string', description: '部门(组件自动补全)' },
    }
    return multiple
      ? { type: 'array', description, widget: 'person', items: { type: 'object', description: '人员引用', properties: props }, enumSource: src, ...o }
      : { type: 'object', description, widget: 'person', properties: props, enumSource: src, ...o }
  },
  /** 部门选择(业务组件):树浏览(item=部门名+负责人)+ 搜索(结果显示全路径),胶囊显示部门名。
   *  零配置:数据源缺省 = 平台公共函数 platform-dept-search;要换私有源才传 fn。multiple 同上。
   *  值 = {value:code, label:部门名, path:全路径, leader:负责人姓名, leaderUsername}(列建 jsonb)。 */
  dept: (description: string, s: { fn?: string; multiple?: boolean } & Opt = {}): Node => {
    const { fn = 'platform-dept-search', multiple = false, ...o } = s
    const src = { fn, mode: 'lazy', multiple } as Node['enumSource']
    const props: Record<string, Node> = {
      value: { type: 'string', description: '部门 code(唯一需要填的键;裸 code 字符串也接受)', required: true },
      label: { type: 'string', description: '部门名(展示冗余,组件自动补全)' },
      path: { type: 'string', description: '全路径(组件自动补全)' },
      leader: { type: 'string', description: '负责人姓名(组件自动补全)' },
      leaderUsername: { type: 'string', description: '负责人 username(组件自动补全)' },
    }
    return multiple
      ? { type: 'array', description, widget: 'dept', items: { type: 'object', description: '部门引用', properties: props }, enumSource: src, ...o }
      : { type: 'object', description, widget: 'dept', properties: props, enumSource: src, ...o }
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// viz —— 数据看板 view(复合组件)。设计文档 docs/viz-compound-design.md。
// 心智模型(对齐 Tableau):data_source=连接的数据集(视图) → params=数据源筛选器(作用某列)
// → blocks=工作表(图型+通道编码,聚合发生在这)。每个 block 编译成一条 GROUP BY 查询,
// 经 execute-query 在用户身份下跑(RLS 末端鉴权)。
// 一份声明三个读者:运行时渲染(AutoViz)、运行时查询编译(viz.ts)、构建期 derive(产 semantic)。
// ═══════════════════════════════════════════════════════════════════════════

export type Grain = 'year' | 'quarter' | 'month' | 'week' | 'day'
export type Agg = 'sum' | 'avg' | 'count' | 'count_distinct' | 'min' | 'max'
export type ChannelSort = 'natural' | 'value_desc' | 'value_asc'
export type ChannelFormat = 'auto' | 'money' | 'percent' | 'int'

type DimHints = {
  label: string
  value_type?: Node['type']
  widget?: Node['widget']
  /** SQL:分桶精度；function:仅渲染提示(分桶和补桶已在函数完成)。 */
  grain?: Grain
  /** 省略/natural=保留数据默认序；value_desc/value_asc 统一在 JS 按首度量(无度量则本字段)排序。 */
  sort?: ChannelSort
  /** 维度值→展示标签(纯渲染,图例/表格用;值本身不变,agent 认原始值)。 */
  labels?: Record<string, string>
  /** 时间维度·周末底色(仅 grain:day):图上给周六/日画背景色带。 */
  mark_weekends?: boolean
}

/** SQL 维度：列、分桶、别名均服务查询编译。 */
export type SqlDimChannel = DimHints & {
  rel_column: string
  /** 输出列名。默认=rel_column；时间维度默认=grain。 */
  as?: string
  /** 仅 SQL 存量路径：平台知道 dateRange 时可补桶。analytics function 禁止使用。 */
  fill?: 'zero' | 'null' | 'none'
}

/** Analytics function 维度：只引用函数已声明的 field，不携带列类型、聚合或补桶知识。 */
export type FunctionDimChannel = DimHints & { field: string }

type MeasureHints = {
  label: string
  format?: ChannelFormat
  axis?: 'left' | 'right'
  shape?: 'line' | 'bar'
}

/** SQL 度量：聚合在平台 SQL 编译器发生。 */
export type SqlMeasureChannel = MeasureHints & {
  agg: Agg
  /** 被聚合的列。agg=count 是行计数不需要列(此时 as 必填)。 */
  rel_column?: string
  /** 输出列名。count 必填;同列多聚合撞名时起名;其余默认=rel_column。 */
  as?: string
}

/** Analytics function 度量：函数已算完，页面只有 field + 渲染提示，没有 agg。 */
export type FunctionMeasureChannel = MeasureHints & { field: string }

export type DimChannel = SqlDimChannel | FunctionDimChannel
export type MeasureChannel = SqlMeasureChannel | FunctionMeasureChannel

type CommonBlockBase = { id: string; title: string; description?: string; span?: 1 | 2; limit?: number }
type SqlBlockBase = CommonBlockBase & { dataset?: never }
type FunctionBlockBase = CommonBlockBase & { dataset: string }

type CartesianShape<D, M, B> = B & {
  mark: 'line' | 'bar' | 'area'
  x: D
  y: M | M[]
  series?: D
  stacked?: boolean
  horizontal?: boolean
}
type PieShape<D, M, B> = B & { mark: 'pie'; category: D; value: M; donut?: boolean }
type StatShape<M, B> = B & { mark: 'stat'; value: M }
type ScatterShape<D, M, B> = B & { mark: 'scatter'; x: M; y: M; size?: M; series: D }
type TableShape<D, M, B> = B & { mark: 'table'; columns: (D | M)[] }

export type SqlCartesianBlock = CartesianShape<SqlDimChannel, SqlMeasureChannel, SqlBlockBase>
export type FunctionCartesianBlock = CartesianShape<FunctionDimChannel, FunctionMeasureChannel, FunctionBlockBase>
export type CartesianBlock = SqlCartesianBlock | FunctionCartesianBlock
export type SqlPieBlock = PieShape<SqlDimChannel, SqlMeasureChannel, SqlBlockBase>
export type FunctionPieBlock = PieShape<FunctionDimChannel, FunctionMeasureChannel, FunctionBlockBase>
export type PieBlock = SqlPieBlock | FunctionPieBlock
export type SqlStatBlock = StatShape<SqlMeasureChannel, SqlBlockBase>
export type FunctionStatBlock = StatShape<FunctionMeasureChannel, FunctionBlockBase>
export type StatBlock = SqlStatBlock | FunctionStatBlock
export type SqlScatterBlock = ScatterShape<SqlDimChannel, SqlMeasureChannel, SqlBlockBase>
export type FunctionScatterBlock = ScatterShape<FunctionDimChannel, FunctionMeasureChannel, FunctionBlockBase>
export type ScatterBlock = SqlScatterBlock | FunctionScatterBlock
export type SqlTableBlock = TableShape<SqlDimChannel, SqlMeasureChannel, SqlBlockBase>
export type FunctionTableBlock = TableShape<FunctionDimChannel, FunctionMeasureChannel, FunctionBlockBase>
export type TableBlock = SqlTableBlock | FunctionTableBlock

export type SqlVizBlock = SqlCartesianBlock | SqlPieBlock | SqlStatBlock | SqlScatterBlock | SqlTableBlock
export type FunctionVizBlock = FunctionCartesianBlock | FunctionPieBlock | FunctionStatBlock | FunctionScatterBlock | FunctionTableBlock
export type VizBlock = SqlVizBlock | FunctionVizBlock

/** 图型构造器:按类型分(而非 type:'line' 大杂烩)——不同图型通道形状本就不同,分构造器才有 TS 护栏。 */
const marked = <M extends VizBlock['mark'], T extends object>(mark: M, b: T): T & { mark: M } => ({ mark, ...b })
export const block = {
  line: <T extends Omit<SqlCartesianBlock, 'mark'> | Omit<FunctionCartesianBlock, 'mark'>>(b: T) => marked('line', b),
  bar: <T extends Omit<SqlCartesianBlock, 'mark'> | Omit<FunctionCartesianBlock, 'mark'>>(b: T) => marked('bar', b),
  area: <T extends Omit<SqlCartesianBlock, 'mark'> | Omit<FunctionCartesianBlock, 'mark'>>(b: T) => marked('area', b),
  pie: <T extends Omit<SqlPieBlock, 'mark'> | Omit<FunctionPieBlock, 'mark'>>(b: T) => marked('pie', b),
  stat: <T extends Omit<SqlStatBlock, 'mark'> | Omit<FunctionStatBlock, 'mark'>>(b: T) => marked('stat', b),
  scatter: <T extends Omit<SqlScatterBlock, 'mark'> | Omit<FunctionScatterBlock, 'mark'>>(b: T) => marked('scatter', b),
  table: <T extends Omit<SqlTableBlock, 'mark'> | Omit<FunctionTableBlock, 'mark'>>(b: T) => marked('table', b),
}

/** SQL 仍由页面声明 verified_columns；analytics function 的 JSON 真类型已由 withSchema 出口保证。 */
export type VizColumnType = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'timestamp'
export type SqlVizDataSource = {
  kind: 'sql'
  sql: string
  verified_columns: Record<string, VizColumnType>
  /** Private Page Builder SQL sources bind the compiled query to one trusted Semantic table lock. */
  table_ref?: string
}
export type FunctionVizDataSource = { kind: 'function'; ref: string; params?: Record<string, string | number | boolean> }
export type VizDataSource = SqlVizDataSource | FunctionVizDataSource

type VizDefBase = {
  kind: 'viz'
  description: string
  params: Record<string, Node>
  /** 由 viz() 从 blocks 合成:块 id → 返回形状 Node(长表=array of 行对象;stat=单值)。
   *  provide/derive/AutoTable 三方共用——agent 观察到的行、semantic returns、表格渲染同源。 */
  returns: Record<string, Node>
}
export type SqlVizDef = VizDefBase & { data_source: SqlVizDataSource; blocks: SqlVizBlock[] }
export type FunctionVizDef = VizDefBase & { data_source: FunctionVizDataSource; blocks: FunctionVizBlock[] }
export type VizDef = SqlVizDef | FunctionVizDef
export const isFunctionViz = (def: VizDef): def is FunctionVizDef => def.data_source.kind === 'function'
export const isSqlViz = (def: VizDef): def is SqlVizDef => def.data_source.kind === 'sql'

/** 通道输出列名(长表列名/SQL 别名/semantic returns 键,一个规则三处用)。 */
export const chanOut = (c: DimChannel | MeasureChannel): string =>
  'field' in c ? c.field
  : 'agg' in c ? (c.as ?? c.rel_column ?? 'value')
  : (c.as ?? (c.grain ? c.grain : c.rel_column))

// function table 没有 agg；只有作者写了数值渲染提示时才按 measure Node 合成 returns。
// 纯 {field,label} 无需页面知道列类型，AutoTable 的 Observation 语义仍只依赖 description。
const isTableMeasure = (c: DimChannel | MeasureChannel): c is MeasureChannel =>
  'agg' in c || ('field' in c && ('format' in c || 'axis' in c || 'shape' in c))

// fillNote 只用于 SQL 存量补桶；analytics 的补桶由函数负责，函数 dataset 描述应说明完整性。
const dimNode = (c: DimChannel, fillNote = false): Node => ({
  type: c.value_type ?? 'string',
  description: c.label + (fillNote && 'fill' in c && c.grain && (c.fill ?? 'zero') !== 'none' ? '(缺桶已补齐)' : ''),
  ...(c.widget ? { widget: c.widget } : {}),
  ...(c.labels ? { labels: c.labels, widget: 'badge' } : {}),
})
const meaNode = (c: MeasureChannel): Node => ({
  type: ('agg' in c && (c.agg === 'count' || c.agg === 'count_distinct')) || c.format === 'int' ? 'integer' : 'number',
  description: c.label,
  ...(c.format === 'money' ? { widget: 'currency' } : {}),
})
const rowsNode = (desc: string, chans: (DimChannel | MeasureChannel)[], meas: MeasureChannel[], fillChan?: DimChannel): Node => {
  const props: Record<string, Node> = {}
  for (const c of chans) props[chanOut(c)] = meas.includes(c as MeasureChannel) ? meaNode(c as MeasureChannel) : dimNode(c as DimChannel, c === fillChan)
  return { type: 'array', description: desc, items: { type: 'object', description: '一行观测', properties: props } }
}

export function blockDimensions(b: VizBlock): DimChannel[] {
  switch (b.mark) {
    case 'line': case 'bar': case 'area': return [b.x, ...(b.series ? [b.series] : [])]
    case 'pie': return [b.category]
    case 'stat': return []
    case 'scatter': return [b.series]
    case 'table': return b.columns.filter((c): c is DimChannel => !isTableMeasure(c))
  }
}
export function blockMeasures(b: VizBlock): MeasureChannel[] {
  switch (b.mark) {
    case 'line': case 'bar': case 'area': return Array.isArray(b.y) ? b.y : [b.y]
    case 'pie': return [b.value]
    case 'stat': return [b.value]
    case 'scatter': return [b.x, b.y, ...(b.size ? [b.size] : [])]
    case 'table': return b.columns.filter(isTableMeasure)
  }
}
export const blockChannels = (b: VizBlock): (DimChannel | MeasureChannel)[] =>
  b.mark === 'table' ? b.columns : [...blockDimensions(b), ...blockMeasures(b)]

/** viz view 构造器:合成 returns(能得到什么),与 params 一起进 accept/provide/derive 既有机制。 */
type SqlVizInput = { description: string; data_source: SqlVizDataSource; params?: Record<string, Node>; blocks: SqlVizBlock[] }
type FunctionVizInput = { description: string; data_source: FunctionVizDataSource; params?: Record<string, Node>; blocks: FunctionVizBlock[] }
export function viz(def: SqlVizInput): SqlVizDef
export function viz(def: FunctionVizInput): FunctionVizDef
export function viz(def: SqlVizInput | FunctionVizInput): VizDef {
  const returns: Record<string, Node> = {}
  if (def.data_source.kind === 'function') {
    returns.meta = f.object('analytics 数据完整性与观测信息', {
      observed_at: f.string('数据观测时间(ISO 8601)'),
      partial: f.boolean('数据是否因上游限制或窗口截断而不完整'),
      notices: { type: 'array', description: '截断、口径等提示', items: f.string('一条提示') },
    })
  }
  for (const b of def.blocks) {
    returns[b.id] = b.mark === 'stat'
      ? meaNode((b as StatBlock).value)
      : rowsNode(b.title, blockChannels(b), blockMeasures(b),
                 def.data_source.kind === 'sql' && (b.mark === 'line' || b.mark === 'bar' || b.mark === 'area')
                   ? (b as SqlCartesianBlock).x : undefined)
  }
  return { kind: 'viz', description: def.description, data_source: def.data_source, params: def.params ?? {}, blocks: def.blocks, returns } as VizDef
}

// ═══════════════════════════════════════════════════════════════════════════
// dashboard —— 复合业务工作台。保留手写布局/分页/动作，同时把内嵌 viz panels 纳入
// params/returns/derive/check/Observation。同一 panel 仍是现有 VizDef，不发明第二套图表协议。
// dashboard 不统一调度请求：bundle 可复用已有 feed，保持各业务区块独立失败、避免重复取数。
// ═══════════════════════════════════════════════════════════════════════════

type PanelReturnNodes<P extends Record<string, VizDef>> = { [K in keyof P]: Node }
type AskDeclaration = { id: string; operation: 'query' | 'draft'; views?: string[] }
export type DashboardDef<
  P extends Record<string, VizDef> = Record<string, VizDef>,
  Params extends Record<string, Node> = Record<string, Node>,
  BaseReturns extends Record<string, Node> = Record<string, Node>,
> = {
  kind: 'dashboard'
  description: string
  ask?: AskDeclaration[]
  params: Params
  panels: P
  panelParams: Partial<Record<keyof P, Record<string, Node>>>
  returns: BaseReturns & PanelReturnNodes<P>
}

/** 复合工作台构造器：每个 panel 的 returns 自动嵌成同名 object Node，供 provide/derive 共用。 */
export function dashboard<
  const P extends Record<string, VizDef>,
  const Params extends Record<string, Node> = Record<string, never>,
  const BaseReturns extends Record<string, Node> = Record<string, never>,
>(def: {
  description: string
  ask?: AskDeclaration[]
  params?: Params
  panels: P
  panelParams?: Partial<Record<keyof P, Record<string, Node>>>
  returns?: BaseReturns
}): DashboardDef<P, Params, BaseReturns> {
  const returns: Record<string, Node> = { ...(def.returns ?? {}) }
  const sharedParams = (def.params ?? {}) as Params
  for (const [name, panel] of Object.entries(def.panels)) {
    if (name in returns) throw new Error(`dashboard panel '${name}' 与业务 returns 重名`)
    returns[name] = f.object(panel.description, panel.returns)
  }
  for (const [panelName, params] of Object.entries(def.panelParams ?? {})) {
    if (!(panelName in def.panels)) throw new Error(`dashboard panelParams '${panelName}' 没有对应 panel`)
    for (const key of Object.keys(params ?? {})) {
      if (!(key in sharedParams)) throw new Error(`dashboard panelParams '${panelName}.${key}' 不在 dashboard.params`)
    }
  }
  return {
    kind: 'dashboard',
    description: def.description,
    ...(def.ask ? { ask: def.ask } : {}),
    params: sharedParams,
    panels: def.panels,
    panelParams: def.panelParams ?? {},
    returns: returns as BaseReturns & PanelReturnNodes<P>,
  }
}
