/** Read-only Omni AutoObject/AutoTable pattern. Columns come from the same returns schema. */
import type {FieldSchema,ObjectSchema} from './contracts/schema';
import {EmptyState,Button} from './ui';
import {ArrowDown,ArrowUp,ArrowUpDown} from 'lucide-react';
import type {ReactNode,CSSProperties} from 'react';
type Sorting={column:string;direction:'ascending'|'descending';columns:readonly string[];disabled?:boolean;onChange:(column:string)=>void};
export function AutoRead({field,value}:{field:FieldSchema;value:unknown}) {
  if(value===null||value===undefined||value==='')return <span className="text-muted-foreground">—</span>;
  if(field.type==='array')return field.items?.type==='object'
    ? <AutoTable field={field} rows={value as Record<string,unknown>[]}/>
    : <span>{(value as unknown[]).map(v=>String(v)).join(', ')}</span>;
  if(field.type==='object')return <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">{Object.entries(field.properties??{}).filter(([,f])=>f.ui?.widget!=='hidden').map(([key,f])=><div key={key} className="contents"><dt className="text-muted-foreground">{f.ui?.label??f.description}</dt><dd><AutoRead field={f} value={(value as Record<string,unknown>)[key]}/></dd></div>)}</dl>;
  const display=field.ui?.labels?.[String(value)]??(typeof value==='boolean'?(value?'Yes':'No'):String(value));
  return <span>{display}{field.semantic?.unit?' '+field.semantic.unit:''}</span>;
}
export function AutoTable({field,rows,empty,renderCell,summary,sorting,cellStyle}:{field:FieldSchema;rows:Record<string,unknown>[];empty?:string;renderCell?:(key:string,value:unknown,row:Record<string,unknown>)=>ReactNode|undefined;summary?:Record<string,unknown>;sorting?:Sorting;cellStyle?:(key:string,value:unknown,row:Record<string,unknown>)=>CSSProperties|undefined}) {
  if(!rows.length&&!summary)return <EmptyState>{empty}</EmptyState>;
  const columns=Object.entries((field.items as ObjectSchema).properties).filter(([,f])=>f.ui?.widget!=='hidden');
  const cell=(key:string,f:FieldSchema,row:Record<string,unknown>)=>renderCell?.(key,row[key],row)??<AutoRead field={f} value={row[key]}/>;
  return <div className="max-h-[65vh] overflow-auto rounded-lg border border-border"><table className="w-full border-collapse text-sm"><caption className="sr-only">{field.description}</caption><thead className="sticky top-0 bg-muted text-left"><tr>{columns.map(([key,f])=>{
   const sortable=sorting?.columns.includes(key),active=sorting?.column===key,label=f.ui?.label??f.description;
   const Icon=active?(sorting.direction==='descending'?ArrowDown:ArrowUp):ArrowUpDown;
   return <th key={key} scope="col" aria-sort={sortable?(active?sorting.direction:'none'):undefined} className="whitespace-nowrap border-b border-border px-4 py-3 font-medium">{sortable?<Button variant="ghost" className="table-sort" data-sort-column={key} aria-label={'Sort by '+label} disabled={sorting?.disabled} onClick={()=>sorting?.onChange(key)}><span>{label}</span><Icon size={13} aria-hidden="true"/></Button>:label}</th>;
  })}</tr>{summary&&<tr data-summary-row>{columns.map(([key,f],index)=>index===0?<th key={key} scope="row" className="border-b border-border px-4 py-2 font-semibold">{cell(key,f,summary)}</th>:<td key={key} className="border-b border-border px-4 py-2 font-semibold">{cell(key,f,summary)}</td>)}</tr>}</thead><tbody>{rows.map((row,index)=><tr key={String(row.id??index)}>{columns.map(([key,f])=><td key={key} style={cellStyle?.(key,row[key],row)} className="min-w-32 border-b border-border px-4 py-3 align-top">{cell(key,f,row)}</td>)}</tr>)}{!rows.length&&<tr><td colSpan={columns.length}><EmptyState>{empty}</EmptyState></td></tr>}</tbody></table></div>;
}
