/** Omni AutoObject/AutoInput pattern, adapted to the canonical ATS JSON Schema. */
import {useId,useState,useEffect} from 'react';
import {Checkbox} from '@base-ui/react/checkbox';
import {Check} from 'lucide-react';
import type {FieldSchema,ObjectSchema} from './contracts/schema';
import {controlKind} from './schema';
import {Field,Input,controlCls} from './ui';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from './select';
import {DateRangePicker} from './date-range';

export function AutoInput({field,value,onChange,disabled,id,liveOptions,compact=false,timeZone}:{field:FieldSchema;value:unknown;onChange:(value:unknown)=>void;disabled?:boolean;id:string;liveOptions?:{value:string;label:string}[];compact?:boolean;timeZone?:string}) {
  const kind=controlKind(field),label=field.ui?.label??field.description;
  const common={id,disabled,'aria-describedby':`${id}-hint`};
  if(kind==='daterange')return <DateRangePicker {...common} value={String(value??'')} onChange={onChange} label={label} timeZone={timeZone}/>;
  if(kind==='select') {
    const choices=field.ui?.optionsFrom?[{value:'',label:'All'},...(liveOptions??[])]:field.ui?.options??field.enum!.map(value=>({value,label:field.ui?.labels?.[String(value)]??String(value)}));
    // Radix IDs are transport keys; the schema's typed value is what accept() receives.
    return <Select value={String(choices.findIndex(o=>Object.is(o.value,value)))} onValueChange={key=>onChange(choices[Number(key)].value)} disabled={disabled}><SelectTrigger {...common} aria-label={label}>{compact&&<span className="inline-field-label">{label}</span>}<SelectValue/></SelectTrigger><SelectContent>{choices.map((o,index)=><SelectItem key={index} value={String(index)}>{o.label}</SelectItem>)}</SelectContent></Select>;
  }
  if(kind==='checkbox')return <Checkbox.Root {...common} checked={value===true} onCheckedChange={onChange} aria-label={label} className="flex size-5 items-center justify-center rounded border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring data-checked:bg-primary data-checked:text-primary-foreground disabled:opacity-50"><Checkbox.Indicator><Check className="size-4"/></Checkbox.Indicator></Checkbox.Root>;
  if(kind==='textarea')return <textarea {...common} value={String(value??'')} maxLength={field.maxLength} placeholder={field.ui?.placeholder} className={controlCls+' min-h-24'} onChange={e=>onChange(e.target.value)}/>;
  return <Input {...common} type={kind==='number'?'number':field.ui?.inputType??'text'} value={typeof value==='number'?value:String(value??'')} min={field.minimum} max={field.maximum} step={field.type==='integer'?1:'any'} maxLength={field.maxLength} placeholder={field.ui?.placeholder} onChange={e=>onChange(kind==='number'?(e.target.value===''?null:Number(e.target.value)):e.target.value)}/>;
}
export function AutoObject({schema,value,onChange,disabled=false,sources={},compact=false}:{schema:ObjectSchema;value:Record<string,unknown>;onChange:(patch:Record<string,unknown>)=>unknown;disabled?:boolean;sources?:Record<string,unknown>;compact?:boolean}) {
  const prefix=useId(),[errors,setErrors]=useState<Record<string,string>>({});
  useEffect(()=>setErrors({}),[value]);
  return <div className={compact?'page-inline-fields':'grid gap-4 sm:grid-cols-2'}>{Object.entries(schema.properties).map(([name,field])=>{
    const kind=controlKind(field),id=prefix+'-'+name;
    if(kind==='hidden')return null;
    if(kind==='object')return <fieldset key={name} className="min-w-0 rounded border border-border p-3"><legend>{field.ui!.label}</legend><AutoObject schema={field as ObjectSchema} value={value[name] as Record<string,unknown>} disabled={disabled} sources={sources} compact={compact} onChange={patch=>onChange({[name]:patch})}/></fieldset>;
    return <Field key={name} id={id} label={field.ui!.label} hint={field.description} error={errors[name]}><AutoInput id={id} field={field} value={value[name]} compact={compact} timeZone={typeof value.timezone==='string'?value.timezone:undefined} liveOptions={field.ui?.optionsFrom?(sources[field.ui.optionsFrom] as {value:string;label:string}[]|undefined):undefined} disabled={disabled||field.ui?.readOnlyWhen?.some(key=>Boolean(value[key]))} onChange={next=>{
      try {onChange({[name]:next});setErrors(old=>({...old,[name]:''}));}
      catch(error){setErrors(old=>({...old,[name]:(error as Error).message}));}
    }}/></Field>;
  })}</div>;
}
