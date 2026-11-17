import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {PageContext} from '../sdk/runtime';
import {connectQuery,type QueryState} from './query';
/** Keep load stable (module-level function or useCallback). Only use for reads, never writes. */
export function usePageQuery<P extends object,S extends object>(context:PageContext<P,S>,load:(params:P)=>Promise<S>) {
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
