import type {MetricDefinition} from './metric-report';
import {compileMetricReport,decodeMetricReport} from './metric-query';
import {querySql} from './sql-source';
export type MetricState=ReturnType<typeof decodeMetricReport>;
export function metricScope(def:MetricDefinition,p:Record<string,unknown>){return JSON.stringify(['period','timeMode','timezone','grouping','grain','sortMetric','sortDirection',...def.dimensions.map(d=>'filter_'+d.key)].map(k=>p[k]));}
/** AG Grid owns completed block caching. Only concurrent identical SQL reads share
 * an in-flight request here; changing scope or unmounting aborts old requests. */
export class MetricSource{
 private scope='';private pending=new Map<string,{controller:AbortController;promise:Promise<MetricState>}>();
 constructor(private def:MetricDefinition){}
 dispose(){for(const item of this.pending.values())item.controller.abort();this.pending.clear();}
 read(params:Record<string,unknown>,signal?:AbortSignal):Promise<MetricState>{
  const scope=metricScope(this.def,params);if(scope!==this.scope){this.dispose();this.scope=scope;}
  const key=JSON.stringify(params);let request=this.pending.get(key);
  if(!request){
   const controller=new AbortController();
   const promise=querySql(compileMetricReport(this.def,params),controller.signal).then(rows=>{
    if(rows.length!==1)throw new Error('Expected one bounded metric report payload.');
    const state=decodeMetricReport(this.def,rows[0]);
    for(const dim of this.def.dimensions){const choices=(state as Record<string,unknown>)['options_'+dim.key] as {value:string;label:string}[];if(params['filter_'+dim.key]&&!choices.some(o=>o.value===params['filter_'+dim.key]))throw new Error(`Choose an available ${dim.label}.`);}
    return state;
   }).finally(()=>{if(this.pending.get(key)?.controller===controller)this.pending.delete(key);});
   request={controller,promise};this.pending.set(key,request);
  }
  if(!signal)return request.promise;
  return new Promise((resolve,reject)=>{
   const abort=()=>reject(new DOMException('Read superseded','AbortError'));
   if(signal.aborted){abort();return;}
   signal.addEventListener('abort',abort,{once:true});
   request!.promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
 }
}
