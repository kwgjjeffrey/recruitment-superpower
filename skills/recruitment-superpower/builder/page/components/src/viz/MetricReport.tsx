import React from 'react';
import {usePageContext,usePageQuery} from '../page';
import {AutoObject} from '../fields';
import {AutoTable} from '../read';
import {Button,Loading,ErrorState} from '../ui';
import {RefreshCw,RotateCcw,SlidersHorizontal} from 'lucide-react';
import {Popover,PopoverTrigger,PopoverContent,PopoverTitle} from '../popover';
import {TooltipProvider} from '../tooltip';
import {MetricGrid} from './MetricGrid';
import {MetricSource,metricScope,type MetricState} from './metric-source';
import {Drawer,DrawerContent,DrawerTitle,DrawerDescription} from '../drawer';
import {defaults} from '../contracts/contract';
import type {FieldSchema,ObjectSchema} from '../contracts/schema';
import {sameDeclaration} from './page-schema';
import {metricReportView,type MetricDefinition} from './metric-report';
import {DETAIL_SIZE,EVIDENCE_SIZE} from './metric-query';
export {metricReport,metricReportView} from './metric-report';
export type {MetricDefinition} from './metric-report';
type State=MetricState;
const count=(n:number)=>n.toLocaleString('en-US');
function Pagination({page,total,size,onChange,label}:{page:number;total:number;size:number;onChange:(page:number)=>void;label:string}) {
 return <nav aria-label={label} className="my-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{total?`${page*size+1}–${Math.min((page+1)*size,total)} of ${count(total)}`:'0 results'}</span><div className="flex gap-2"><Button variant="outline" disabled={page===0} onClick={()=>onChange(page-1)}>Previous</Button><Button variant="outline" disabled={(page+1)*size>=total} onClick={()=>onChange(page+1)}>Next</Button></div></nav>;
}
export function MetricReport({definition:def}:{definition:MetricDefinition}) {
 const context=usePageContext<Record<string,unknown>,State>();
 const view=React.useMemo(()=>metricReportView(def),[def]);
 const source=React.useMemo(()=>new MetricSource(def),[def]);
 React.useEffect(()=>()=>source.dispose(),[source]);
 const load=React.useCallback(async(params:Record<string,unknown>,signal?:AbortSignal)=>{
  if(!sameDeclaration(context.schema.params,view.params)||!sameDeclaration(context.schema.returns,view.returns))throw new Error('The metric report and its published schema differ. Rebuild and publish them together.');
  return source.read(params,signal);
 },[context,source,view]);
 const query=usePageQuery(context,load),p=query.params,data=query.data as State|undefined;
 const latestQuery=React.useRef(query);latestQuery.current=query;
 const signature=metricScope(def,p),[epoch,setEpoch]=React.useState(0);
 const retry=()=>{source.dispose();setEpoch(n=>n+1);if(context.params.groupPage!==0)context.accept({groupPage:0});else query.retry();};
 const loadBlock=React.useCallback(async(block:number)=>{
  // Page params are authoritative. Grid sort events update them via onSort;
  // a queued request from a previous column model must never overwrite them.
  if(context.params.groupPage!==block)context.accept({groupPage:block});
  const actual=latestQuery.current;
  if(actual.params===context.params&&actual.data&&!actual.loading)return actual.data;
  return load(context.params);
 },[context,load]);
 const previous=React.useRef<{signature:string;data:State}|null>(null);
 if(data)previous.current={signature,data};
 // Keep only the unchanged parent matrix while its drawer loads. The connector
 // remains pending; old detail rows are never rendered for a new selection.
 const matrix=data??(!query.error&&previous.current?.signature===signature?previous.current.data:undefined);
 const trigger=React.useRef<HTMLElement|null>(null);
 const triggerCell=React.useRef<{metric:string;group:string}|null>(null);
 const root=React.useRef<HTMLElement|null>(null);
 const restoreFocus=React.useRef(false);
 const focusTrigger=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(context.params.metricKey||latestQuery.current.loading)return;
  const cell=triggerCell.current;
  const target=cell?root.current?.querySelector<HTMLElement>(`.metric-grid [row-id="${CSS.escape(cell.group||'__sum__')}"] [col-id="${CSS.escape(cell.metric)}"] .metric-count`):trigger.current;
  target?.focus();
 }));
 React.useEffect(()=>{
  if(restoreFocus.current&&!p.metricKey&&!query.loading){
   restoreFocus.current=false;
   focusTrigger();
  }
 },[p.metricKey,query.loading]);
 const accept=(patch:Record<string,unknown>)=>context.accept(patch);
 const sort=(metric:string,direction:'asc'|'desc')=>{
  if(context.params.sortMetric!==metric||context.params.sortDirection!==direction)accept({sortMetric:metric,sortDirection:direction});
 };
 const open=(element:HTMLElement,metric:string,group='',unknown=false)=>{
  trigger.current=element;
  triggerCell.current={metric,group};
  accept({metricKey:metric,groupKey:group,detailPage:0,evidenceEntity:'',evidencePage:0,unknownTime:unknown});
 };
 const selected=def.metrics.find(m=>m.key===p.metricKey);
 const stamp=(value:string)=>{if(!value)return 'Unknown time';const date=new Date(value.replace(' ','T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00'));return Number.isNaN(date.valueOf())?value:new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:String(p.timezone)}).format(date);};
 const fields=(keys:string[]):ObjectSchema=>({...view.params,properties:Object.fromEntries(keys.map(key=>[key,view.params.properties[key]])),required:keys});
 const primaryFields=fields(['period','timeMode',...def.dimensions.map(d=>'filter_'+d.key),'grouping']);
 const advancedFields=fields(['grain','timezone']);
 const detailField:FieldSchema={type:'array',description:'Applications contributing to this metric',items:{type:'object',description:'Contributing entity',properties:{name:{type:'string',description:'Application'},dimensions:{type:'string',description:'Job / owner'},firstMatch:{type:'string',description:'First matching time'},matchingEvents:{type:'integer',description:'Matching activities'}}}};
 const evidenceField:FieldSchema={type:'array',description:'Qualifying activity evidence',items:{type:'object',description:'Actual activity',properties:{label:{type:'string',description:'Activity'},at:{type:'string',description:'Event time'},result:{type:'string',description:'Result'},sequence:{type:'string',description:'Actual interview number'}}}};
 return <TooltipProvider delayDuration={250}><section ref={root} className="metric-report" aria-label="Metric report" aria-busy={query.loading}>
  <div className="metric-filterbar" role="group" aria-label="Report filters"><AutoObject schema={primaryFields} value={p} sources={(matrix??{}) as Record<string,unknown>} onChange={accept} compact/><div className="metric-filter-actions">
   <Popover><PopoverTrigger aria-label="More options" title="Time grain and time zone" render={<Button variant="outline" size="icon"/>}><SlidersHorizontal size={15}/></PopoverTrigger><PopoverContent className="metric-options" align="end"><PopoverTitle className="mb-3 font-medium">Report options</PopoverTitle><AutoObject schema={advancedFields} value={p} onChange={accept}/>{matrix&&<p className="mt-3 text-xs text-muted-foreground">Queried {stamp(matrix.queriedAt)}</p>}</PopoverContent></Popover>
   <Button variant="ghost" size="icon" aria-label="Refresh" title="Refresh" onClick={retry} disabled={query.loading}><RefreshCw size={15}/></Button><Button variant="ghost" size="icon" aria-label="Reset filters" title="Reset filters" onClick={()=>accept(defaults(context.schema))}><RotateCcw size={15}/></Button>
  </div></div>
  {query.error&&<ErrorState error={query.error} retry={retry}/>}
  {matrix&&matrix.unknownTimeCount>0&&def.unknownTimeMetric&&<p className="metric-notice"><Button variant="ghost" onClick={event=>open(event.currentTarget,def.unknownTimeMetric!,'',true)} disabled={query.loading}>{count(matrix.unknownTimeCount)} {def.entityLabel.toLowerCase()} with unknown event time · inspect across all dates</Button></p>}
  {!query.error&&<MetricGrid definition={def} params={p} data={matrix} scope={signature} epoch={epoch} loading={query.loading} loadBlock={loadBlock} onSort={sort} onOpen={open}/>}
  <Drawer open={Boolean(selected)} onOpenChange={open=>{if(!open)accept({metricKey:'',groupKey:'',detailPage:0,evidenceEntity:'',evidencePage:0,unknownTime:false});}}>
   <DrawerContent onCloseAutoFocus={event=>{event.preventDefault();restoreFocus.current=true;focusTrigger();}}>
    <DrawerTitle className="pr-8 text-xl font-semibold">{selected?.label}</DrawerTitle>
    <DrawerDescription className="text-sm text-muted-foreground">{selected?.description} {p.unknownTime?'Unknown event time · all dates; job and owner filters remain applied.':`${p.timeMode==='cohort'?'New application cohort':'Activity time'} · ${String(p.period)} · ${String(p.timezone)}`}</DrawerDescription>
    {query.loading?<Loading/>:query.error?<ErrorState error={query.error} retry={retry}/>:data&&<>
     <p className="text-sm"><strong>{count(data.detailTotal)}</strong> distinct {def.entityLabel.toLowerCase()}. Repeated matching activities remain one row.</p>
     <AutoTable field={detailField} rows={data.details} renderCell={(key,value,row)=>key==='name'?<div className="grid gap-2"><a className="font-medium underline" href={String(row.url)} target="_blank" rel="noreferrer">{String(value)}</a><Button variant="outline" size="sm" onClick={()=>accept({evidenceEntity:p.evidenceEntity===row.id?'':row.id,evidencePage:0})}>Show matching activities</Button></div>:key==='firstMatch'?stamp(String(value)):undefined}/>
     <Pagination label="Application detail pages" page={Number(p.detailPage)} total={data.detailTotal} size={DETAIL_SIZE} onChange={n=>accept({detailPage:n,evidenceEntity:'',evidencePage:0})}/>
     {Boolean(p.evidenceEntity)&&<section className="rounded-lg border border-border p-3" aria-label="Matching activities"><h3 className="mb-3 font-semibold">Matching activities · {data.evidenceTotal}</h3><AutoTable field={evidenceField} rows={data.evidence} renderCell={(key,value)=>key==='at'?stamp(String(value)):undefined}/><Pagination label="Activity evidence pages" page={Number(p.evidencePage)} total={data.evidenceTotal} size={EVIDENCE_SIZE} onChange={n=>accept({evidencePage:n})}/></section>}
    </>}
   </DrawerContent>
  </Drawer>
 </section></TooltipProvider>;
}
