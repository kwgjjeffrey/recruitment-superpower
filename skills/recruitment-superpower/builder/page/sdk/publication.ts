/** Business-facing page descriptions and observation boundaries, derived from the live declaration. */
import type { FieldSchema, ObjectSchema, PageSchema, PageView } from "./schema";
import {surface} from "./schema";

export type SemanticField = {type:string|readonly string[];description:string;[key:string]:unknown};
const observations=new WeakMap<PageView,ObjectSchema>();

export function contextNames(page: PageSchema, name: string): string[] {
  const view = surface(page,name);
  const route = view.route ?? page.invocation.route;
  return Object.keys(view.params.properties).filter(key =>
    [...route.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].some(match => match[1] === key)
    || view.query?.includes(key) && view.params.properties[key].ui?.widget === "hidden");
}

const option = (): ObjectSchema => ({ type:"object",description:"Available choice.",properties:{
  value:{type:"string",description:"Value to assign."},label:{type:"string",description:"Label shown by the page."},
},required:["value","label"],additionalProperties:false });

/** Observable fields are selected once for both provide() and published returns. */
export function observationSchema(page: PageSchema, name: string): ObjectSchema {
  const view = surface(page,name);
  const cached=observations.get(view);if(cached)return cached;
  const context = new Set(contextNames(page,name));
  const properties = { ...view.returns.properties };
  if (view.mode === "form") {
    delete properties.pending;
    delete properties.error;
    if (properties.values?.properties) {
      const fields = Object.fromEntries(Object.entries(properties.values.properties).filter(([key])=>!context.has(key)));
      properties.values = { ...properties.values, properties:fields, required:(properties.values.required??[]).filter(key=>Object.hasOwn(fields,key)) };
    }
  }
  // Only advertise choice sources that the control actually uses and provide() can return.
  if (properties.options) {
    const sources = [...new Set(Object.values(view.params.properties).flatMap(field=>field.ui?.optionsFrom?[field.ui.optionsFrom]:[]))];
    if (sources.length) properties.options = {type:"object",description:"Current choices loaded by the same controls used by people.",properties:Object.fromEntries(sources.map(source=>[source,{
      type:"array",description:`Available ${source}.`,items:option(),
    }])),required:sources,additionalProperties:false};
    else delete properties.options;
  }
  // Context is already selected by the request. Do not echo it inside every displayed record.
  if(properties.items?.items?.properties){
    const item=properties.items.items,fields={...item.properties};
    if(context.has("applicationId"))delete fields.applicationId;
    if(fields.kind?.enum?.length===1)delete fields.kind;
    properties.items={...properties.items,items:{...item,properties:fields,required:(item.required??[]).filter(key=>Object.hasOwn(fields,key))}};
  }
  if(properties.application?.properties&&context.has("applicationId")){
    const fields={...properties.application.properties};delete fields.id;delete fields.talentId;
    properties.application={...properties.application,properties:fields,required:(properties.application.required??[]).filter(key=>key!=="id"&&key!=="talentId")};
  }
  if(properties.record?.properties&&context.has("id")){
    const fields={...properties.record.properties};delete fields.id;
    properties.record={...properties.record,properties:fields,required:(properties.record.required??[]).filter(key=>key!=="id")};
  }
  const result={ ...view.returns, properties, required:view.returns.required.filter(key=>Object.hasOwn(properties,key)) };
  observations.set(view,result);return result;
}

/** Input shape matters when supplying a value. Output descriptions are plain field meanings. */
export function fieldMeaning(field:FieldSchema,input=false,choicesAvailable=false):SemanticField {
 const types=(Array.isArray(field.type)?field.type:[field.type]).filter(type=>type!=="null");
 const result:SemanticField={type:types.length===1?types[0]:types,description:field.description};
 if(Array.isArray(field.type)&&field.type.includes("null"))result.nullable=true;
 if(field.semantic)Object.assign(result,field.semantic);
 if(field.enum)result.values=field.enum.filter(v=>v!==null&&v!=="").map(value=>({value,description:field.ui?.labels?.[String(value)]??String(value)}));
 if(input&&field.ui?.options&&!field.enum)result.suggestions=field.ui.options.map(({value,label})=>({value,description:label}));
 if(input&&choicesAvailable&&field.ui?.optionsFrom)result.choices=`Invoke this page with its record identifiers, without saving; read state.options.${field.ui.optionsFrom}. Each choice has value and label; assign value to this parameter.`;
 const widget=field.ui?.widget;
 if(!result.format){
  if(widget==="month")result.format="YYYY-MM; null means Present.";
  if(widget==="date")result.format="YYYY-MM-DD; calendar date.";
  if(widget==="time")result.format="HH:mm; local 24-hour time.";
  if(widget==="datetime")result.format="Unix timestamp in milliseconds.";
 }
 if(field.properties)result.fields=Object.fromEntries(Object.entries(field.properties).map(([key,value])=>[key,fieldMeaning(value,input,choicesAvailable)]));
 if(field.items)result.items=fieldMeaning(field.items,input,choicesAvailable);
 return result;
}
const inputFields=(schema:ObjectSchema)=>Object.fromEntries(Object.entries(schema.properties).map(([key,field])=>[key,fieldMeaning(field,true,true)]));

/** Use actual response paths, without repeating JSON Schema array/object wrappers or output types. */
function readMeanings(schema:FieldSchema,prefix="",out:Record<string,string>={}) {
 if(schema.properties)for(const [name,field]of Object.entries(schema.properties))readMeanings(field,prefix?prefix+"."+name:name,out);
 else if(schema.items)readMeanings(schema.items,prefix+"[]",out);
 else if(prefix)out[prefix]=schema.description;
 return out;
}
export type PublicTarget={asset:string;description:string;sections:string[];defaultSection:string;requires?:readonly string[];form?:string;parent?:string;excludeParams?:readonly string[];excludeActions?:readonly string[];excludeReturns?:readonly string[];sectionDescriptions?:Readonly<Record<string,string>>};

/** The same owner boundary is used in metadata and replies, without a second draft or data fetch. */
export function publicObservationSchema(page:PageSchema,target:PublicTarget,name:string):ObjectSchema {
 const schema=observationSchema(page,name);
 return {...schema,properties:Object.fromEntries(Object.entries(schema.properties).filter(([key])=>!target.excludeReturns?.includes(key))),required:schema.required.filter(key=>!target.excludeReturns?.includes(key))};
}
export function publicParameters(page:PageSchema,target:PublicTarget,name:string,params:object){
 const fields=surface(page,name).params.properties;
 return Object.fromEntries(Object.entries(params).filter(([key])=>Object.hasOwn(fields,key)&&!target.excludeParams?.includes(key)));
}
export function publicTargets(page:PageSchema):PublicTarget[]{
 const owners:NonNullable<PageSchema["semanticPages"]>=page.semanticPages??[{asset_path:page.asset_path,description:page.description,sections:Object.keys(page.views),defaultSection:page.default_view}];
 return owners.flatMap(owner=>{
  const primary:PublicTarget={asset:owner.asset_path,description:owner.description,sections:[...owner.sections],defaultSection:owner.defaultSection,requires:owner.requires,excludeParams:owner.excludeParams,excludeActions:owner.excludeActions,excludeReturns:owner.excludeReturns,sectionDescriptions:owner.sectionDescriptions};
  return [primary,...Object.entries(page.editors??{}).filter(([name,editor])=>owner.forms?owner.forms.includes(name):owner.sections.includes(editor.view)).map(([name,editor]):PublicTarget=>({asset:owner.asset_path+"/forms/"+name,description:editor.form.description,sections:[editor.view],defaultSection:editor.view,form:name,parent:owner.asset_path}))];
 });
}
function actionMeaning(definition:{description:string;requires?:readonly string[];returns:ObjectSchema},required:readonly string[]){
 return {description:definition.description,...(required.length?{requires:[...required]}:{}),returns:readMeanings(definition.returns)};
}
function declaration(page:PageSchema,target:PublicTarget){
 const single=Boolean(target.form)||target.sections.length===1;
 const surfaces=target.form?[[target.defaultSection,page.editors![target.form].form]as const]:target.sections.map(name=>[name,page.views[name]]as const);
 const parts=Object.fromEntries(surfaces.map(([name,view])=>{
  const params=Object.fromEntries(Object.entries(inputFields(view.params)).filter(([key])=>!target.excludeParams?.includes(key)));
  const requires=[...new Set([...contextNames(page,target.form??name).filter(key=>view.params.required.includes(key)),...(target.requires??[])])].filter(key=>Object.hasOwn(params,key));
  const actions=Object.fromEntries(Object.entries(view.actions??{}).filter(([key])=>!target.excludeActions?.includes(key)).map(([key,action])=>[key,actionMeaning(action,key==="save"?view.params.required:action.requires??[])]));
  const forms=target.form?[]:publicTargets(page).filter(form=>form.parent===target.asset&&form.defaultSection===name).map(form=>({asset_path:form.asset,description:form.description}));
  return [name,{description:target.sectionDescriptions?.[name]??view.description,params,...(requires.length?{requires}:{}),returns:readMeanings(publicObservationSchema(page,target,target.form??name)),...(Object.keys(actions).length?{actions}:{}),...(forms.length?{forms}:{})}];
 }));
 const bindings=Object.fromEntries(surfaces.map(([name,view])=>[name,{surface:name,route:view.route??page.invocation.route,navigation:view.navigation??{},...(target.form?{editor:target.form}:{}),...(target.excludeParams?.includes("applicationId")?{set_params:{applicationId:""}}:{})}]));
 const base={schema_version:4,type:"page",description:target.description,...(target.parent?{parent:{asset_path:target.parent,section:target.defaultSection}}:{})};
 const invocation={...page.invocation,default_section:target.defaultSection,...(single?bindings[target.defaultSection]:{sections:bindings})};
 if(single){const {description:_description,...body}=parts[target.defaultSection];return {...base,...body,invocation};}
 const first=parts[target.defaultSection];
 const common=Object.fromEntries(Object.entries(first.params).filter(([key,value])=>Object.values(parts).every(part=>part.params[key]&&JSON.stringify([part.params[key].type,part.params[key].values,part.params[key].choices,part.params[key].fields])===JSON.stringify([value.type,value.values,value.choices,value.fields]))));
 const required=Object.keys(common).filter(key=>Object.values(parts).every(part=>part.requires?.includes(key)));
 for(const part of Object.values(parts)){for(const key of Object.keys(common))delete part.params[key];if(!Object.keys(part.params).length)delete(part as any).params;if(part.requires)part.requires=part.requires.filter(key=>!required.includes(key));if(!part.requires?.length)delete part.requires;}
 return {...base,params:{...common,section:{type:"string",description:"Which section of this page to display and read.",values:surfaces.map(([name])=>({value:name,description:parts[name].description}))}},...(required.length?{requires:required}:{}),sections:parts,invocation};
}
export function pagePublications(page:PageSchema):Record<string,Record<string,unknown>> {
 return Object.fromEntries(publicTargets(page).map(target=>[target.asset,declaration(page,target)]));
}
export function pageMetadata(page:PageSchema){return pagePublications(page)[page.asset_path];}
