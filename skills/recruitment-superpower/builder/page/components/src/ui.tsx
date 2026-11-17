/** Selected Omni copy-in primitives. No data fetching or separate form state. */
import type {ReactNode} from 'react';
import {cn} from './utils';
export {cn};
export {Button} from './primitives/button';
export {Input} from './primitives/input';
export const controlCls='h-9 w-full rounded-lg border border-input bg-card px-2.5 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
export function PageShell({title,description,children}:{title:ReactNode;description?:ReactNode;children:ReactNode}) {
  return <section className="mx-auto w-full max-w-6xl p-4 sm:p-8"><header className="mb-7"><h1 className="text-3xl font-semibold tracking-tight">{title}</h1>{description&&<p className="mt-2 text-muted-foreground">{description}</p>}</header>{children}</section>;
}
export function Card({children,className}:{children:ReactNode;className?:string}) {
  return <div className={cn('rounded-lg border border-border bg-card p-4',className)}>{children}</div>;
}
export function Field({id,label,hint,error,children}:{id:string;label:string;hint?:string;error?:string;children:ReactNode}) {
  return <div className="min-w-0" data-field={id}><label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>{children}{(error||hint)&&<p id={`${id}-hint`} role={error?'alert':undefined} className={cn('mt-1 text-xs',error?'text-destructive':'text-muted-foreground')}>{error||hint}</p>}</div>;
}
export function Loading(){return <p role="status" className="py-8 text-center text-muted-foreground">Loading…</p>;}
export function EmptyState({children='No results.'}:{children?:ReactNode}) {
  return <p role="status" className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-muted-foreground">{children}</p>;
}
export function ErrorState({error,retry}:{error:string;retry:()=>void}) {
  return <div role="alert" className="my-4 rounded-lg border border-destructive p-4 text-destructive"><p>{error}</p><button type="button" className="mt-2 cursor-pointer underline" onClick={retry}>Retry</button></div>;
}
