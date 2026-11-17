import React from 'react';
import {createRoot} from 'react-dom/client';
import type {PageContext} from './sdk/runtime';
import {page,type TalentParams,type TalentState} from './page.schema';
import {PortalRoot} from './components/portal';
import {AutoObject} from './components/fields';
import {AutoTable} from './components/read';
import {usePageQuery} from './components/page';
import {Button,Card,PageShell,Loading,ErrorState} from './components/ui';
import './style.css';
type Context=PageContext<TalentParams,TalentState>;
export function mount(element:HTMLElement,context:Context){
  const root=createRoot(element);
  element.classList.add('page-root');
  root.render(<PortalRoot element={element}><Talent context={context}/></PortalRoot>);
  return()=>{root.unmount();element.classList.remove('page-root');};
}
function Talent({context}:{context:Context}){
  const load=React.useCallback(({availability,...params}:TalentParams)=>context.api<TalentState>('recruitment/api/talent/list',{...params,...(availability?{availability}:{})}),[context]);
  const query=usePageQuery(context,load),{params,data,loading,error}=query;
  return <PageShell title={context.page.title} description="Search your talent pool and explore candidate profiles.">
    <Card className="mb-5"><AutoObject schema={page.views.main.params} value={params} onChange={patch=>context.accept(patch)}/><Button className="mt-4" variant="outline" disabled={!params.q} onClick={()=>context.accept({q:''})}>Clear</Button></Card>
    {loading?<Loading/>:error?<ErrorState error={error} retry={query.retry}/>:data&&<>
      <p role="status" className="mb-3 text-sm text-muted-foreground">{data.total} candidates · Page {data.page}</p>
      <AutoTable field={page.views.main.returns.properties.items} rows={data.items} empty="No candidates match this search."/>
    </>}
    <footer className="mt-4 flex gap-2"><Button variant="outline" disabled={loading||params.page<=1} onClick={()=>context.accept({page:params.page-1})}>Previous</Button><Button variant="outline" disabled={loading||!data||data.page*data.pageSize>=data.total} onClick={()=>context.accept({page:params.page+1})}>Next</Button></footer>
  </PageShell>;
}
