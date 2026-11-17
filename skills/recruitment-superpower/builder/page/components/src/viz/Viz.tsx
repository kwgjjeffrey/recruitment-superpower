import React from 'react';
import {usePageContext,usePageQuery} from '../page';
import {AutoObject} from '../fields';
import {Button,ErrorState,Loading} from '../ui';
import {defaults} from '../contracts/contract';
import {AutoViz} from './AutoViz';
import {runBlock} from './compile-query';
import {querySql} from './sql-source';
import {vizView,sameDeclaration} from './page-schema';
import type {SqlVizDef} from './definition';
export {block,f,viz} from './definition';
export {vizView} from './page-schema';
export type {SqlVizDef} from './definition';

/** One main-view visualization, many blocks; one accepted state and actual observation. */
export function Viz({definition}:{definition:SqlVizDef}) {
  const context=usePageContext<Record<string,unknown>,Record<string,unknown>>();
  const view=React.useMemo(()=>vizView(definition),[definition]);
  const load=React.useCallback(async(params:Record<string,unknown>,signal:AbortSignal)=>{
    if(!sameDeclaration(context.schema.params,view.params)||!sameDeclaration(context.schema.returns,view.returns))throw new Error('This report definition does not match the published page. Rebuild and publish the page together.');
    return Object.fromEntries(await Promise.all(definition.blocks.map(async b=>[b.id,await runBlock(definition,b,params,sql=>querySql(sql,signal))])));
  },[context,definition,view]);
  const {params,data,loading,error,retry}=usePageQuery(context,load);
  const initial=defaults(context.schema);
  return <section className="page-viz" aria-label="Visualization">
    <div className="viz-filters"><AutoObject schema={view.params} value={params} onChange={patch=>context.accept(patch)}/><div className="flex gap-2"><Button variant="outline" disabled={loading} onClick={retry}>Refresh</Button><Button variant="ghost" disabled={sameDeclaration(params,initial)} onClick={()=>context.accept(initial)}>Reset filters</Button></div></div>
    {loading?<Loading/>:error?<ErrorState error={error} retry={retry}/>:data&&<><AutoViz def={definition} data={data}/><details className="viz-data"><summary>View chart data</summary><pre>{JSON.stringify(data,null,2)}</pre></details></>}
  </section>;
}
