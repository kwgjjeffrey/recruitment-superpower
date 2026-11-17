export type SqlResult={columns:{name:string;type:string}[];rows:unknown[][];rowCount:number;truncated:boolean;limit:number};
export function sqlRows(result:SqlResult):Record<string,unknown>[] {
  if(!Array.isArray(result.columns)||!Array.isArray(result.rows))throw new Error('The SQL API did not return ordered columns and rows.');
  if(result.truncated)throw new Error(`The SQL result exceeded ${result.limit} rows. Narrow the filters or aggregate further.`);
  const names=result.columns.map(c=>c.name);
  if(new Set(names).size!==names.length)throw new Error('Chart SQL must use unique output column aliases.');
  return result.rows.map(row=>{if(!Array.isArray(row)||row.length!==names.length)throw new Error('SQL row shape does not match its columns.');return Object.fromEntries(names.map((name,i)=>[name,row[i]]));});
}
/** Current viewer, existing executor/catalog/row policies. No page-owned transport callback. */
export async function querySql(sql:string,signal:AbortSignal) {
  const response=await fetch('/api/sql/query',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({sql}),signal});
  const data=await response.json();
  if(!response.ok)throw new Error(data.message??`SQL request failed (${response.status}).`);
  return sqlRows(data);
}
