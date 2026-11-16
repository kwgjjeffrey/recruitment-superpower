import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Input} from './ui/input';
import {Button} from './ui/button';
import './style.css';
import type {PageContext} from './sdk/runtime';
type TalentParams={q:string;page:number};
type TalentState={total:number;page:number;items:{id:string;name:string;headline:string;location:string;experienceYears:number}[]};
type TalentResult=TalentState & {pageSize:number};
type Context=PageContext<TalentParams,TalentState>;
export function mount(element:HTMLElement,context:Context){
 const root=createRoot(element);root.render(<Talent context={context}/>);return()=>root.unmount();
}
function Talent({context}:{context:Context}){
 const [params,setParams]=useState(context.params),[result,setResult]=useState<TalentResult>(),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const sequence=useRef(0);
 useEffect(()=>context.subscribe(setParams),[context]);
 useEffect(()=>{const revision=++sequence.current;setLoading(true);setError('');context.pending();context.api<TalentResult>('recruitment/api/talent/list',params).then((data)=>{if(revision!==sequence.current)return;setResult(data);context.provide({total:data.total,page:data.page,items:data.items});}).catch((e:Error)=>{if(revision===sequence.current){setError(e.message);context.fail(e.message)}}).finally(()=>{if(revision===sequence.current)setLoading(false)});return()=>{sequence.current++}},[params,context]);
 return <section className="talent-app"><header><span className="eyebrow">TALENT DIRECTORY</span><h1>{context.page.title}</h1><p>Search your talent pool and explore candidate profiles.</p></header><div className="filters"><label htmlFor="talent-search">Search candidates</label><Input id="talent-search" placeholder="Name, company or resume keyword" maxLength={context.schema.params.properties.q.maxLength} value={params.q} onChange={e=>context.accept({q:e.target.value})}/><Button onClick={()=>context.accept({q:''})} disabled={!params.q}>Clear</Button></div>{error?<p role="alert">{error}</p>:<p role="status">{loading?'Loading candidates…':`${result?.total??0} candidates · Page ${params.page}`}</p>}<div className="table-scroll"><table><thead><tr><th>Name</th><th>Headline</th><th>Location</th><th>Experience</th></tr></thead><tbody>{result?.items.map(item=><tr key={item.id}><td>{item.name}</td><td>{item.headline}</td><td>{item.location}</td><td>{item.experienceYears} years</td></tr>)}</tbody></table></div>{!loading&&!error&&!result?.items.length&&<p>No candidates match this search.</p>}<footer><Button disabled={loading||params.page<=1} onClick={()=>context.accept({page:params.page-1})}>Previous</Button><Button disabled={loading||!result?.items.length||params.page*(result?.pageSize??20)>=result?.total} onClick={()=>context.accept({page:params.page+1})}>Next</Button></footer></section>
}
