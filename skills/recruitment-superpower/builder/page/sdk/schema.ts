/** Pure page declarations. Imported by React and the metadata compiler; no platform runtime. */
export type FieldSchema = {
  type: "string" | "integer" | "number" | "boolean" | "object" | "array" | readonly string[];
  description: string;
  enum?: readonly (string | number | null)[];
  default?: unknown;
  minLength?: number;
  pattern?: string;
  maxItems?: number;
  uniqueItems?: boolean;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  properties?: Readonly<Record<string, FieldSchema>>;
  items?: FieldSchema;
  required?: readonly string[];
  additionalProperties?: boolean;
  /** Business meaning only; validation and presentation stay in their own projections. */
  semantic?: {
    reference?: string;
    format?: string;
    unit?: string;
    range?: { min?: number; max?: number };
    clearing?: string;
  };
  /** Rendering hints stay in the application and are removed from published semantics. */
  ui?: {
    label: string;
    widget?: "search" | "select" | "hidden" | "text" | "textarea" | "tags" | "pills" | "multi-choice" | "datetime" | "date" | "time" | "tabs" | "radio" | "month" | "checkbox-group" | "checkbox" | "person" | "department" | "tree" | "daterange";
    placeholder?: string;
    hideLabel?: boolean;
    inlineTags?: boolean;
    /** This field is an inline accessory of the named field, not a form-wide option. */
    attachTo?: string;
    labels?: Readonly<Record<string, string>>;
    options?: readonly { value: string | number; label: string }[];
    optionsFrom?: string;
    inputType?: "email" | "tel" | "date" | "time";
    addLabel?: string;
    removeLabel?: string;
    separator?: string;
    readOnlyWhen?: readonly string[];
    /** Nullable months may represent unknown dates instead of a current role. */
    allowPresent?: boolean;
  };
};
export type ObjectSchema = FieldSchema & { type: "object"; properties: Readonly<Record<string, FieldSchema>>; required: readonly string[]; additionalProperties: false };
export type PageView = {
  description: string;
  rules?: readonly string[];
  screen?: string;
  route?: string;
  aliases?: readonly string[];
  /** Fixed visible UI selection, such as a profile tab or an open editor. */
  navigation?: Readonly<Record<string, string>>;
  /** URL-backed fields. Other values are in-memory drafts, never URL credentials or storage. */
  query?: readonly string[];
  mode?: "form";
  actions?: Readonly<Record<string, { description: string; label: string; requires?: readonly string[]; returns: ObjectSchema }>>;
  params: ObjectSchema;
  returns: ObjectSchema;
  /** A filter edit resets pagination; an explicit pagination edit does not. */
  resetOnChange?: readonly string[];
};
export type BusinessPageSchema={asset_path:string;description:string;sections:readonly string[];defaultSection:string;requires?:readonly string[];forms?:readonly string[];excludeParams?:readonly string[];excludeActions?:readonly string[];excludeReturns?:readonly string[];sectionDescriptions?:Readonly<Record<string,string>>};
export type PageSchema = {
  /** Business pages sharing this UI; section selection is a page parameter, never an asset. */
  semanticPages?: readonly BusinessPageSchema[];
  /** Standalone pages without a live Agent binding must not advertise invocation. */
  browser_only?: string;
  asset_path: string;
  display_name: string;
  description: string;
  default_view: string;
  screen?: string;
  invocation: { kind: "page"; target: string; route: string; handler: string };
  views: Readonly<Record<string, PageView>>;
  /** Actual controlled form declarations for page actions; never exported as views. */
  editors?: Readonly<Record<string,{view:string;form:PageView}>>;
};

type Scalar<T> = T extends "string" ? string : T extends "integer" | "number" ? number : T extends "boolean" ? boolean : T extends "null" ? null : never;
export type Value<S> = FieldSchema extends S ? unknown : S extends { enum: readonly (infer E)[] } ? E
  : S extends { type: "object"; properties: infer P } ? { -readonly [K in keyof P]: Value<P[K]> }
  : S extends { type: "array"; items: infer I } ? Value<I>[]
  : S extends { type: readonly (infer T)[] } ? Scalar<T>
  : S extends { type: infer T } ? Scalar<T> : never;
export type Params<V extends PageView> = { -readonly [K in keyof V["params"]["properties"]]: Value<V["params"]["properties"][K]> };

/** The full execution contract. Never used as discovery metadata. */
export function validationSchema(schema: FieldSchema): Record<string, unknown> {
  const { ui: _ui, semantic: _semantic, properties, items, ...node } = schema;
  return { ...node,
    ...(properties ? { properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, validationSchema(value)])) } : {}),
    ...(items ? { items: validationSchema(items) } : {}),
  };
}

/** Invocation parameters for local validation, including the explicit action selector. */
export function invocationParams(view: PageView): Record<string, unknown> {
  const schema = validationSchema(view.params);
  return { ...schema, properties: { ...(schema.properties as object), ...(view.actions ? {
    action: { type: "string", enum: Object.keys(view.actions), description: "Explicit page action." },
  } : {}) } };
}
export { pageMetadata } from "./publication";

/** A real view or the controlled editor implementing one of its actions. */
export function surface(page:PageSchema,name:string):PageView {
  const result=page.views[name]??page.editors?.[name]?.form;
  if(!result)throw new Error(`Unknown page view or action ${page.asset_path}#${name}`);
  return result;
}
export function surfaceEntries(page:PageSchema):[string,PageView][] {
  return [...Object.entries(page.views),...Object.entries(page.editors??{}).map(([name,editor]):[string,PageView]=>[name,editor.form])];
}
export function ownerView(page:PageSchema,name:string){return page.editors?.[name]?.view??name;}
