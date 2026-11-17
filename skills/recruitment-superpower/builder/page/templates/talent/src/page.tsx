import React from 'react';
import {page,type TalentParams,type TalentState} from './page.schema';
import {mountPage,usePageContext,usePageQuery} from '@recruitment/page';
import {AutoObject} from '@recruitment/page/fields';
import {AutoTable} from '@recruitment/page/read';
import {Button,Card,PageShell,Loading,ErrorState} from '@recruitment/page/ui';
import './style.css';
export const mount=mountPage(Talent);
function Talent(){
  const context=usePageContext<TalentParams,TalentState>();
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
