import type {MetricDefinition} from './metric-report';
import {customDateRange} from '../date-range-value';
export const GROUP_SIZE=25,DETAIL_SIZE=25,EVIDENCE_SIZE=20;
const literal=(value:unknown)=>"'"+String(value??'').replaceAll("'","''")+"'";
const col=(name:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(name))throw new Error('Invalid source column');return '"'+name+'"';};
const page=(value:unknown)=>{const n=Number(value??0);if(!Number.isInteger(n)||n<0||n>100000)throw new Error('Invalid report page');return n;};
const strings=(values:string[])=>'ARRAY['+values.map(v=>`COALESCE((${v})::text,'')`).join(',')+']';
const aggregate=(query:string,values:string[])=>`(SELECT array_agg(${strings(values)}) FROM (${query}) report_rows)`;
/** Counts, members and evidence are evaluated in one SQL statement and snapshot. */
export function compileMetricReport(def:MetricDefinition,p:Record<string,unknown>) {
 const timezone=String(p.timezone),grain=String(p.grain),period=String(p.period),timeMode=String(p.timeMode);
 if(!['Asia/Shanghai','UTC'].includes(timezone)||!['day','week','month'].includes(grain)||!['activity','cohort'].includes(timeMode))throw new Error('Invalid report time settings');
 const zone=literal(timezone),now=`(CURRENT_TIMESTAMP AT TIME ZONE ${zone})`,dateColumn=timeMode==='cohort'?'cohort_at':'event_at',date=`(${dateColumn} AT TIME ZONE ${zone})`;
 let window:string;
 switch(period){
  case 'last_7d':case 'last_30d':case 'last_90d':window=`${date}>=date_trunc('day',${now})-INTERVAL '${period==='last_7d'?6:period==='last_30d'?29:89} days' AND ${date}<=${now}`;break;
  case 'this_month':window=`${date}>=date_trunc('month',${now}) AND ${date}<=${now}`;break;
  case 'last_month':window=`${date}>=date_trunc('month',${now})-INTERVAL '1 month' AND ${date}<date_trunc('month',${now})`;break;
  case 'ytd':window=`${date}>=date_trunc('year',${now}) AND ${date}<=${now}`;break;
  case 'this_quarter':window=`${date}>=date_trunc('quarter',${now}) AND ${date}<=${now}`;break;
  case 'all':window=`${date}<=${now}`;break;
  default:{const range=customDateRange(period);if(!range)throw new Error('Invalid report period');window=`${date}>=DATE ${literal(range.from)} AND ${date}<DATE ${literal(range.to)}+INTERVAL '1 day' AND ${date}<=${now}`;}
 }
 const filter=def.dimensions.map(d=>p['filter_'+d.key]?`COALESCE(${col(d.column)}::text,'__unassigned__')=${literal(p['filter_'+d.key])}`:'TRUE').join(' AND ');
 const dimension=def.dimensions.find(d=>p.grouping===d.key||p.grouping==='time_'+d.key);
 if(!dimension&&p.grouping!=='time')throw new Error('Invalid grouping');
 const withTime=p.grouping==='time'||String(p.grouping).startsWith('time_');
 const bucket=`date_trunc(${literal(grain)},${date})::date::text`;
 const key=withTime?(dimension?`${bucket}||'|'||COALESCE(${col(dimension.column)}::text,'__unassigned__')`:bucket):`COALESCE(${col(dimension!.column)}::text,'__unassigned__')`;
 const label=withTime?(dimension?`${bucket}||' · '||COALESCE(${col(dimension.labelColumn)},'Unassigned')`:bucket):`COALESCE(${col(dimension!.labelColumn)},'Unassigned')`;
 const counts=def.metrics.map((m,i)=>`count(DISTINCT entity_id) FILTER(WHERE metric=${literal(m.key)}) AS m${i}`);
 const sortMetric=String(p.sortMetric??''),direction=String(p.sortDirection??'desc');
 const sortIndex=def.metrics.findIndex(m=>m.key===sortMetric);
 if(sortMetric&&sortIndex<0)throw new Error('Unknown sort metric');
 if(!['asc','desc'].includes(direction))throw new Error('Invalid sort direction');
 const order=sortMetric?`m${sortIndex} ${direction.toUpperCase()},group_key ASC`:'group_key ASC';
 const selected=String(p.metricKey??'');if(selected&&!def.metrics.some(m=>m.key===selected))throw new Error('Unknown metric');
 const scope=`metric=${literal(selected)}${p.groupKey&&!p.unknownTime?' AND group_key='+literal(p.groupKey):''}`;
 const detailSource=p.unknownTime?'unknown_events':'filtered';
 const dims=def.dimensions.map(d=>`COALESCE(${col(d.labelColumn)},'Unassigned')`);
 const dimensionLabel=dims.length?`concat_ws(' · ',${dims.join(',')})`:"''";
 const query=`WITH source AS (${def.data_source.sql}),
 scoped AS (SELECT * FROM source WHERE ${filter}),
 filtered AS (SELECT *,${key} AS group_key,${label} AS group_label FROM scoped WHERE (${window}) AND (event_at IS NULL OR event_at<=CURRENT_TIMESTAMP)),
 unknown_events AS (SELECT *,''::text AS group_key FROM scoped WHERE event_at IS NULL),
 grouped AS (SELECT group_key,min(group_label) AS group_label,${counts.join(',')} FROM filtered GROUP BY group_key),
 members AS (SELECT entity_id,min(entity_name) AS entity_name,min(entity_url) AS entity_url,min(${dimensionLabel}) AS dimensions,min(event_at) AS first_match,count(*) AS event_count FROM ${detailSource} WHERE ${scope} GROUP BY entity_id)
 SELECT
 ${aggregate('SELECT '+counts.join(',')+' FROM filtered',def.metrics.map((_,i)=>'m'+i))} AS totals,
 ${aggregate(`SELECT * FROM grouped ORDER BY ${order} LIMIT ${GROUP_SIZE} OFFSET ${page(p.groupPage)*GROUP_SIZE}`,['group_key','group_label',...def.metrics.map((_,i)=>'m'+i)])} AS groups,
 ${aggregate('SELECT '+def.metrics.map((_,i)=>`max(m${i}) AS m${i}`).join(',')+' FROM grouped',def.metrics.map((_,i)=>'m'+i))} AS column_max,
 (SELECT count(*) FROM grouped) AS group_total,
 ${aggregate(`SELECT * FROM members ORDER BY entity_name,entity_id LIMIT ${DETAIL_SIZE} OFFSET ${page(p.detailPage)*DETAIL_SIZE}`,['entity_id','entity_name','entity_url','dimensions','first_match','event_count'])} AS details,
 (SELECT count(*) FROM members) AS detail_total,
 ${aggregate(`SELECT * FROM ${detailSource} WHERE ${scope} AND entity_id::text=${literal(p.evidenceEntity)} ORDER BY event_at NULLS LAST,event_id LIMIT ${EVIDENCE_SIZE} OFFSET ${page(p.evidencePage)*EVIDENCE_SIZE}`,['event_id','event_label','event_at','result','sequence'])} AS evidence,
 (SELECT count(*) FROM ${detailSource} WHERE ${scope} AND entity_id::text=${literal(p.evidenceEntity)}) AS evidence_total,
 (SELECT count(DISTINCT entity_id) FROM unknown_events${def.unknownTimeMetric?' WHERE metric='+literal(def.unknownTimeMetric):''}) AS unknown_total,
 CURRENT_TIMESTAMP::text AS queried_at,
 ${def.dimensions.map(d=>`${aggregate(`SELECT DISTINCT COALESCE(${col(d.column)}::text,'__unassigned__') AS value,COALESCE(${col(d.labelColumn)},'Unassigned') AS label FROM source ORDER BY label,value`,['value','label'])} AS options_${d.key}`).join(',')}`;
 return query;
}
function integer(value:unknown){const n=Number(value??0);if(!Number.isSafeInteger(n)||n<0)throw new Error('The report returned an invalid count');return n;}
export function decodeMetricReport(def:MetricDefinition,row:Record<string,unknown>) {
 const rows=(key:string)=>{const value=row[key];if(value===null)return [] as string[][];if(!Array.isArray(value)||value.some(r=>!Array.isArray(r)))throw new Error('Invalid report dataset '+key);return value as string[][];};
 return {
  totals:def.metrics.map((m,i)=>({metric:m.key,label:m.label,count:integer(rows('totals')[0]?.[i])})),
  groups:rows('groups').map(r=>({key:r[0],label:r[1],counts:Object.fromEntries(def.metrics.map((m,i)=>[m.key,integer(r[i+2])]))})),groupTotal:integer(row.group_total),
  columnMax:Object.fromEntries(def.metrics.map((m,i)=>[m.key,integer(rows('column_max')[0]?.[i])])),
  details:rows('details').map(r=>({id:r[0],name:r[1],url:r[2],dimensions:r[3],firstMatch:r[4],matchingEvents:integer(r[5])})),detailTotal:integer(row.detail_total),
  evidence:rows('evidence').map(r=>({id:r[0],label:r[1],at:r[2],result:r[3],sequence:r[4]})),evidenceTotal:integer(row.evidence_total),
  unknownTimeCount:integer(row.unknown_total),queriedAt:String(row.queried_at),
  ...Object.fromEntries(def.dimensions.map(d=>['options_'+d.key,rows('options_'+d.key).map(r=>({value:r[0],label:r[1]}))])),
 };
}
