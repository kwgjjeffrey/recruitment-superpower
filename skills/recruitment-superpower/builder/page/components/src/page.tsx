import React,{createContext,useContext,useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import type {PageContext} from './contracts/runtime';
import {connectQuery,type QueryState} from './query';
import {PortalRoot} from './portal';
const CurrentPage=createContext<PageContext|null>(null);
/** The runner keeps the ABI and communication. The Builder owns this React adapter. */
export function mountPage(View:React.ComponentType) {
  return (element:HTMLElement,context:PageContext)=>{
    element.classList.add('page-root');
    const root=createRoot(element);
    root.render(<CurrentPage.Provider value={context}><PortalRoot element={element}><View/></PortalRoot></CurrentPage.Provider>);
    return()=>{root.unmount();element.classList.remove('page-root');};
  };
}
export function usePageContext<P extends object=Record<string,unknown>,S extends object=object>() {
  const context=useContext(CurrentPage);
  if(!context)throw new Error('Mount this view with mountPage().');
  return context as PageContext<P,S>;
}
/** Keep load stable (module-level function or useCallback). Only use for reads, never writes. */
export function usePageQuery<P extends object,S extends object>(context:PageContext<P,S>,load:(params:P,signal:AbortSignal)=>Promise<S>) {
  const subscribe=useCallback((listener:()=>void)=>context.subscribe(listener),[context]);
  const params=useSyncExternalStore(subscribe,()=>context.params);
  const [state,setState]=useState<QueryState<P,S>>({params,loading:true,error:''});
  const query=useRef<ReturnType<typeof connectQuery<P,S>>|null>(null);
  useEffect(()=>{
    query.current=connectQuery(context,load,setState);
    return()=>{query.current?.dispose();query.current=null;};
  },[context,load]);
  const retry=useCallback(()=>query.current?.retry(),[]);
  // A new accept cannot render the previous request's rows, even before effects run.
  return {...(state.params===params?state:{params,loading:true,error:'',data:undefined}),retry};
}
