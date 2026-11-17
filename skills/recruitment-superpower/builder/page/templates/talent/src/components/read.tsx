/** Read-only Omni AutoObject/AutoTable pattern. Columns come from the same returns schema. */
import type {FieldSchema,ObjectSchema} from '../sdk/schema';
import {EmptyState} from './ui';
export function AutoRead({field,value}:{field:FieldSchema;value:unknown}) {
  if(value===null||value===undefined||value==='')return <span className="text-muted-foreground">—</span>;
  if(field.type==='array')return field.items?.type==='object'
    ? <AutoTable field={field} rows={value as Record<string,unknown>[]}/>
    : <span>{(value as unknown[]).map(v=>String(v)).join(', ')}</span>;
  if(field.type==='object')return <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">{Object.entries(field.properties??{}).filter(([,f])=>f.ui?.widget!=='hidden').map(([key,f])=><div key={key} className="contents"><dt className="text-muted-foreground">{f.ui?.label??f.description}</dt><dd><AutoRead field={f} value={(value as Record<string,unknown>)[key]}/></dd></div>)}</dl>;
  const display=field.ui?.labels?.[String(value)]??(typeof value==='boolean'?(value?'Yes':'No'):String(value));
  return <span>{display}{field.semantic?.unit?' '+field.semantic.unit:''}</span>;
}
export function AutoTable({field,rows,empty}:{field:FieldSchema;rows:Record<string,unknown>[];empty?:string}) {
  if(!rows.length)return <EmptyState>{empty}</EmptyState>;
  const columns=Object.entries((field.items as ObjectSchema).properties).filter(([,f])=>f.ui?.widget!=='hidden');
  return <div className="max-h-[65vh] overflow-auto rounded-lg border border-border"><table className="w-full border-collapse text-sm"><caption className="sr-only">{field.description}</caption><thead className="sticky top-0 bg-muted text-left"><tr>{columns.map(([key,f])=><th key={key} scope="col" className="whitespace-nowrap border-b border-border px-4 py-3 font-medium">{f.ui?.label??f.description}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={String(row.id??index)}>{columns.map(([key,f])=><td key={key} className="min-w-32 border-b border-border px-4 py-3 align-top"><AutoRead field={f} value={row[key]}/></td>)}</tr>)}</tbody></table></div>;
}
