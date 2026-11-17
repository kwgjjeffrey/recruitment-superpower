import type {PageContext} from '../sdk/runtime';
import {provide} from '../sdk/contract';
export type QueryState<P,S>={params:P;loading:boolean;error:string;data?:S};
/** Lifecycle for read operations. accept() is still the sole owner of page parameters. */
export function connectQuery<P extends object,S extends object>(context:PageContext<P,S>,load:(params:P)=>Promise<S>,receive:(state:QueryState<P,S>)=>void) {
  let revision=0,alive=true;
  function run() {
    if(!alive)return;
    const params=context.params,request=++revision;
    context.pending(); receive({params,loading:true,error:''});
    Promise.resolve().then(()=>load(params)).then(loaded=>{
      if(!alive||request!==revision||context.params!==params)return;
      // Use precisely the validated projection for both React and the Agent.
      const data=provide(context.schema,loaded) as S;
      context.provide(data); receive({params,loading:false,error:'',data});
    }).catch(error=>{
      if(!alive||request!==revision||context.params!==params)return;
      const message=error instanceof Error?error.message:String(error);
      context.fail(message); receive({params,loading:false,error:message});
    });
  }
  const unsubscribe=context.subscribe(run); run();
  return {retry:run,dispose(){alive=false;revision++;unsubscribe();}};
}
