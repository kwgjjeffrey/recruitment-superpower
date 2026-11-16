import Ajv, { type ValidateFunction } from "ajv";
import { validationSchema, type FieldSchema, type PageView, type Params } from "./schema";
import { observationSchema } from "./publication";
import type { PageSchema } from "./schema";
import {surface} from "./schema";

const ajv = new Ajv({ allErrors: true, strict: true });
const validators = new WeakMap<FieldSchema, ValidateFunction>();
export function compileSchema(schema: FieldSchema) {
  let validate = validators.get(schema);
  if (!validate) { validate = ajv.compile(validationSchema(schema)); validators.set(schema, validate); }
  return validate;
}
export function assertValue(schema: FieldSchema, value: unknown) {
  const validate = compileSchema(schema);
  if (!validate(value)) throw new Error(ajv.errorsText(validate.errors, { separator: "; " }));
}

export function defaults<V extends PageView>(view: V): Params<V> {
  return Object.fromEntries(Object.entries(view.params.properties).map(([key, field]) => {
    if (field.default === undefined) throw new Error(`Page parameter "${key}" needs a default.`);
    assertValue(field, field.default);
    return [key, structuredClone(field.default)];
  })) as Params<V>;
}

/** URL parsing is forgiving; direct user/Agent assignments use the same strict accept(). */
export function readParams<V extends PageView>(view: V, query: URLSearchParams): Params<V> {
  const result = defaults(view) as Record<string, unknown>;
  for (const [name, field] of Object.entries(view.params.properties)) {
    const text = query.get(name);
    if (text === null) continue;
    const types = Array.isArray(field.type) ? field.type : [field.type];
    const value = types.includes("integer") || types.includes("number")
      ? (/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : NaN)
      : types.includes("boolean") ? (text === "true" ? true : text === "false" ? false : text) : text;
    try { assertValue(field, value); result[name] = value; } catch { /* Invalid deep links use the declared default. */ }
  }
  return result as Params<V>;
}

/** Object patches edit individual fields; arrays are explicitly replaced as a whole.
 * Keep this in accept() so human controls and Agent calls preserve the same draft.
 */
function mergeValue(current: unknown, patch: unknown): unknown {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!object(current) || !object(patch)) return structuredClone(patch);
  // Data-property construction keeps reserved keys visible to validation rather
  // than treating __proto__ as an object-prototype assignment.
  return Object.fromEntries([
    ...Object.entries(current).map(([key, value]) => [key, structuredClone(value)]),
    ...Object.entries(patch).map(([key, value]) => [key, mergeValue(current[key], value)]),
  ]);
}

/** Atomic patch: validate everything before changing the URL or triggering a request. */
export function accept<V extends PageView>(view: V, current: Params<V>, patch: Record<string, unknown>): Params<V> {
  const result: Record<string, unknown> = { ...current };
  const fields = view.params.properties;
  for (const [name, value] of Object.entries(patch)) {
    if (!Object.hasOwn(fields, name)) throw new Error(`Unknown page parameter "${name}".`);
    const field = fields[name];
    const next = value === null || value === "" ? structuredClone(field.default) : mergeValue(current[name], value);
    if (field.ui?.readOnlyWhen?.some(key => current[key]) && JSON.stringify(next) !== JSON.stringify(current[name]))
      throw new Error(`The field "${name}" is fixed by its linked record.`);
    try { assertValue(field, next); }
    catch (error) { throw new Error(`Invalid page parameter "${name}": ${(error as Error).message}`); }
    result[name] = next;
  }
  for (const name of view.resetOnChange ?? []) {
    if (!Object.hasOwn(patch, name) && Object.keys(patch).some((key) => !view.resetOnChange?.includes(key) && patch[key] !== current[key as keyof typeof current]))
      result[name] = fields[name].default;
  }
  return result as Params<V>;
}

export function queryFor<V extends PageView>(view: V, params: Params<V>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [name, field] of Object.entries(view.params.properties)) {
    if (view.query ? !view.query.includes(name) : view.mode === "form" || view.route?.includes(":" + name)) continue;
    const value = params[name as keyof typeof params];
    if (value !== field.default && value !== null && value !== undefined && value !== "") query.set(name, String(value));
  }
  return query;
}

export function assertSubmission(view: PageView, params: Record<string, unknown>) {
  assertValue(view.params, params);
  for (const name of view.params.required) {
    const value = params[name];
    if (value === null || value === undefined || typeof value === "string" && !value.trim() || Array.isArray(value) && !value.length)
      throw new Error(`${view.params.properties[name].ui?.label ?? name} is required.`);
  }
}

function project(schema: FieldSchema, value: unknown): unknown {
  if (schema.properties && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(schema.properties)
      .filter(([key]) => Object.hasOwn(value, key))
      .map(([key, field]) => [key, project(field, (value as Record<string, unknown>)[key])]));
  }
  if (schema.items && Array.isArray(value)) return value.map((item) => project(schema.items!, item));
  return value;
}

/** Expose only declared fields from the real loaded data. Missing/wrong values are errors. */
export function provide(view: PageView, loaded: object): object {
  const state = project(view.returns, loaded);
  assertValue(view.returns, state);
  return state as object;
}

/** Project the same loaded page state into its public business observation. */
export function observe(page: PageSchema, name: string, loaded: object) {
  const complete=provide(surface(page,name),loaded) as Record<string,unknown>;
  const contract=observationSchema(page,name);
  const state=project(contract,complete) as object;
  assertValue(contract,state);
  const feedback=surface(page,name).mode==="form"&&("pending"in complete||"error"in complete)
    ? {busy:complete.pending===true,error:typeof complete.error==="string"?complete.error:""}:undefined;
  return {state,...(feedback?{feedback}:{})};
}
