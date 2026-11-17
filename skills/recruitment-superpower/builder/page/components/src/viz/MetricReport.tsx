import React from 'react';
import {usePageContext,usePageQuery} from '../page';
import {AutoObject} from '../fields';
import {AutoTable} from '../read';
import {Button,Card,Loading,ErrorState} from '../ui';
import {Drawer,DrawerContent,DrawerTitle,DrawerDescription} from '../drawer';
import {defaults} from '../contracts/contract';
import type {FieldSchema} from '../contracts/schema';
import {querySql} from './sql-source';
import {sameDeclaration} from './page-schema';
import {metricReportView,type MetricDefinition} from './metric-report';
import {compileMetricReport,decodeMetricReport,GROUP_SIZE,DETAIL_SIZE,EVIDENCE_SIZE} from './metric-query';
export {metricReport,metricReportView} from './metric-report';
export type {MetricDefinition} from './metric-report';
type State=ReturnType<typeof decodeMetricReport>;
const count=(n:number)=>n.toLocaleString('en-US');
function Pagination({page,total,size,onChange,label}:{page:number;total:number;size:number;onChange:(page:number)=>void;label:string}) {
 return <nav aria-label={label} className="my-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{total?`${page*size+1}–${Math.min((page+1)*size,total)} of ${count(total)}`:'0 results'}</span><div className="flex gap-2"><Button variant="outline" disabled={page===0} onClick={()=>onChange(page-1)}>Previous</Button><Button variant="outline" disabled={(page+1)*size>=total} onClick={()=>onChange(page+1)}>Next</Button></div></nav>;
}
export function MetricReport({definition:def}:{definition:MetricDefinition}) {
 const context=usePageContext<Record<string,unknown>,Record<string,unknown>>();
 const view=React.useMemo(()=>metricReportView(def),[def]);
 const load=React.useCallback(async(params:Record<string,unknown>,signal:AbortSignal)=>{
  if(!sameDeclaration(context.schema.params,view.params)||!sameDeclaration(context.schema.returns,view.returns))throw new Error('The metric report and its published schema differ. Rebuild and publish them together.');
  const rows=await querySql(compileMetricReport(def,params),signal);
  if(rows.length!==1)throw new Error('Expected one bounded metric report payload.');
  const state=decodeMetricReport(def,rows[0]);
  for(const dim of def.dimensions){
   const options=(state as Record<string,unknown>)['options_'+dim.key] as {value:string;label:string}[];
   if(params['filter_'+dim.key]&&!options.some(o=>o.value===params['filter_'+dim.key]))throw new Error(`Choose an available ${dim.label}.`);
  }
  return state;
 },[context,def,view]);
 const query=usePageQuery(context,load),p=query.params,data=query.data as State|undefined;
 const signature=JSON.stringify(Object.fromEntries(['period','timeMode','timezone','grouping','grain','groupPage',...def.dimensions.map(d=>'filter_'+d.key)].map(k=>[k,p[k]])));
 const previous=React.useRef<{signature:string;data:State}|null>(null);
 if(data)previous.current={signature,data};
 // Keep only the unchanged parent matrix while its drawer loads. The connector
 // remains pending; old detail rows are never rendered for a new selection.
 const matrix=data??(!query.error&&previous.current?.signature===signature?previous.current.data:undefined);
 const trigger=React.useRef<HTMLElement|null>(null);
 const restoreFocus=React.useRef(false);
 React.useEffect(()=>{
  if(restoreFocus.current&&!p.metricKey&&!query.loading){restoreFocus.current=false;trigger.current?.focus();}
 },[p.metricKey,query.loading]);
 const accept=(patch:Record<string,unknown>)=>context.accept(patch);
 const open=(element:HTMLElement,metric:string,group='',unknown=false)=>{
  trigger.current=element;
  accept({metricKey:metric,groupKey:group,detailPage:0,evidenceEntity:'',evidencePage:0,unknownTime:unknown});
 };
 const selected=def.metrics.find(m=>m.key===p.metricKey);
 const stamp=(value:string)=>{if(!value)return 'Unknown time';const date=new Date(value.replace(' ','T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00'));return Number.isNaN(date.valueOf())?value:new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:String(p.timezone)}).format(date);};
 const matrixField:FieldSchema={type:'array',description:'Grouped metric counts',items:{type:'object',description:'One group',properties:{label:{type:'string',description:'Group',ui:{label:'Group'}},...Object.fromEntries(def.metrics.map(m=>[m.key,{type:'integer',description:m.description,ui:{label:m.label}}]))}}};
 const detailField:FieldSchema={type:'array',description:'Applications contributing to this metric',items:{type:'object',description:'Contributing entity',properties:{name:{type:'string',description:'Application'},dimensions:{type:'string',description:'Job / owner'},firstMatch:{type:'string',description:'First matching time'},matchingEvents:{type:'integer',description:'Matching activities'}}}};
 const evidenceField:FieldSchema={type:'array',description:'Qualifying activity evidence',items:{type:'object',description:'Actual activity',properties:{label:{type:'string',description:'Activity'},at:{type:'string',description:'Event time'},result:{type:'string',description:'Result'},sequence:{type:'string',description:'Actual interview number'}}}};
 return <section className="metric-report" aria-label="Metric report" aria-busy={query.loading}>
  <Card><AutoObject schema={view.params} value={p} sources={(matrix??{}) as Record<string,unknown>} onChange={accept}/><div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="outline" onClick={query.retry} disabled={query.loading}>Refresh</Button><Button variant="ghost" onClick={()=>accept(defaults(context.schema))}>Reset filters</Button>{matrix&&<span className="text-xs text-muted-foreground">Queried {stamp(matrix.queriedAt)} · {String(p.timezone)}</span>}</div></Card>
  {query.error&&<ErrorState error={query.error} retry={query.retry}/>}
  {!matrix&&query.loading?<Loading/>:matrix&&<>
   <div className="metric-summary" aria-label="Metric totals">{matrix.totals.map((m,i)=><Button key={m.metric} variant="outline" className="metric-summary-card" onClick={event=>open(event.currentTarget,m.metric)} disabled={query.loading} title={def.metrics[i].description}><span className="metric-category">{def.metrics[i].group}</span><span>{m.label}</span><strong>{count(m.count)}</strong><span className="metric-spark" style={{width:`${Math.max(...matrix.totals.map(t=>t.count))?100*m.count/Math.max(...matrix.totals.map(t=>t.count)):0}%`}}/></Button>)}</div>
   {matrix.unknownTimeCount>0&&def.unknownTimeMetric&&<p className="metric-notice"><Button variant="ghost" onClick={event=>open(event.currentTarget,def.unknownTimeMetric!,'',true)} disabled={query.loading}>{count(matrix.unknownTimeCount)} {def.entityLabel.toLowerCase()} with unknown event time · inspect across all dates</Button></p>}
   <div className="metric-matrix"><AutoTable field={matrixField} rows={matrix.groups.map(g=>({id:g.key,label:g.label,...g.counts}))} empty="No activity matches these filters." renderCell={(key,value,row)=>key==='label'?<strong>{String(value)}</strong>:<Button variant="ghost" aria-label={`${def.metrics.find(m=>m.key===key)?.label}: ${value} · ${row.label}`} onClick={event=>open(event.currentTarget,key,String(row.id))} disabled={query.loading}>{count(Number(value))}</Button>}/></div>
   <Pagination label="Group pages" page={Number(p.groupPage)} total={matrix.groupTotal} size={GROUP_SIZE} onChange={n=>accept({groupPage:n,metricKey:'',groupKey:'',detailPage:0,evidenceEntity:'',evidencePage:0,unknownTime:false})}/>
  </>}
  <Drawer open={Boolean(selected)} onOpenChange={open=>{if(!open)accept({metricKey:'',groupKey:'',detailPage:0,evidenceEntity:'',evidencePage:0,unknownTime:false});}}>
   <DrawerContent onCloseAutoFocus={event=>{event.preventDefault();restoreFocus.current=true;if(!query.loading){trigger.current?.focus();}}}>
    <DrawerTitle className="pr-8 text-xl font-semibold">{selected?.label}</DrawerTitle>
    <DrawerDescription className="text-sm text-muted-foreground">{selected?.description} {p.unknownTime?'Unknown event time · all dates; job and owner filters remain applied.':`${p.timeMode==='cohort'?'New application cohort':'Activity time'} · ${String(p.period)} · ${String(p.timezone)}`}</DrawerDescription>
    {query.loading?<Loading/>:query.error?<ErrorState error={query.error} retry={query.retry}/>:data&&<>
     <p className="text-sm"><strong>{count(data.detailTotal)}</strong> distinct {def.entityLabel.toLowerCase()}. Repeated matching activities remain one row.</p>
     <AutoTable field={detailField} rows={data.details} renderCell={(key,value,row)=>key==='name'?<div className="grid gap-2"><a className="font-medium underline" href={String(row.url)} target="_blank" rel="noreferrer">{String(value)}</a><Button variant="outline" size="sm" onClick={()=>accept({evidenceEntity:p.evidenceEntity===row.id?'':row.id,evidencePage:0})}>Show matching activities</Button></div>:key==='firstMatch'?stamp(String(value)):undefined}/>
     <Pagination label="Application detail pages" page={Number(p.detailPage)} total={data.detailTotal} size={DETAIL_SIZE} onChange={n=>accept({detailPage:n,evidenceEntity:'',evidencePage:0})}/>
     {Boolean(p.evidenceEntity)&&<section className="rounded-lg border border-border p-3" aria-label="Matching activities"><h3 className="mb-3 font-semibold">Matching activities · {data.evidenceTotal}</h3><AutoTable field={evidenceField} rows={data.evidence} renderCell={(key,value)=>key==='at'?stamp(String(value)):undefined}/><Pagination label="Activity evidence pages" page={Number(p.evidencePage)} total={data.evidenceTotal} size={EVIDENCE_SIZE} onChange={n=>accept({evidencePage:n})}/></section>}
    </>}
   </DrawerContent>
  </Drawer>
 </section>;
}
