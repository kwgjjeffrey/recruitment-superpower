import type {Node,SqlVizDef} from './definition';
import {blockChannels,blockMeasures,chanOut} from './definition';
import type {FieldSchema,ObjectSchema} from '../contracts/schema';

/** JSON objects may be reordered by the authenticated server's serialization. */
export function sameDeclaration(a:unknown,b:unknown):boolean {
  const ordered=(value:unknown):unknown=>Array.isArray(value)?value.map(ordered):value!==null&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,ordered(v)])):value;
  return JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
}

/** Mother declarations stay intact; expose their fields through the canonical Page schema. */
function field(node:Node,input=false):FieldSchema {
  const out:Record<string,unknown>={type:node.type,description:node.description};
  for(const key of ['default','enum','maxLength','minLength','minimum','maximum','maxItems','minItems'] as const)if(key in node)out[key]=(node as unknown as Record<string,unknown>)[key];
  if(node.properties){out.properties=Object.fromEntries(Object.entries(node.properties).map(([k,n])=>[k,field(n,input)]));out.required=Object.keys(node.properties);out.additionalProperties=false;}
  if(node.items)out.items=field(node.items);
  if(input){
    if(node.enumSource)throw new Error('Dynamic visualization choices need an observable standard control adapter.');
    if(node.widget&&!['hidden','textarea','select','daterange','checkbox','text','number'].includes(node.widget))throw new Error(`No portable visualization filter for ${node.widget}; add an existing control adapter.`);
    const widget=node.enum?'select':node.widget==='hidden'?'hidden':node.widget==='textarea'?'textarea':node.type==='boolean'?'checkbox':undefined;
    if(node.widget==='daterange'&&!node.enum)throw new Error('A portable date range needs declared preset choices; no native date fallback.');
    out.ui={label:node.title??node.description,...(widget?{widget}:{}),...(node.labels?{labels:node.labels}:{})};
  }else if(node.labels)out.ui={label:node.title??node.description,labels:node.labels};
  return out as FieldSchema;
}
export function assertSqlViz(def:SqlVizDef) {
  if(def.data_source.kind!=='sql')throw new Error('This Viz component supports the existing SQL API.');
  if(!def.data_source.sql.trim())throw new Error('Viz needs a SQL data source.');
  const ids=new Set<string>();
  for(const b of def.blocks){
    if(!b.id||ids.has(b.id))throw new Error(`Duplicate or empty visualization ID: ${b.id}`);ids.add(b.id);
    const measures=blockMeasures(b),outputs=new Set<string>();
    for(const c of blockChannels(b)){
      if(!('rel_column' in c)&&!('agg' in c))throw new Error(`${b.id}: SQL channels must use rel_column/agg.`);
      if('rel_column' in c&&c.rel_column&&!Object.hasOwn(def.data_source.verified_columns,c.rel_column))throw new Error(`${b.id}: unknown SQL result column ${c.rel_column}.`);
      if('agg' in c&&c.agg==='count'&&!c.as)throw new Error(`${b.id}: count requires an output alias.`);
      const name=chanOut(c);if(outputs.has(name))throw new Error(`${b.id}: duplicate output alias ${name}.`);outputs.add(name);
      if(measures.includes(c as never)&&'agg' in c&&c.agg!=='count'&&!c.rel_column)throw new Error(`${b.id}: aggregate needs a result column.`);
    }
  }
  for(const [name,node] of Object.entries(def.params))if(node.rel_column&&!Object.hasOwn(def.data_source.verified_columns,node.rel_column))throw new Error(`${name}: unknown SQL filter column ${node.rel_column}.`);
}
export function vizView(def:SqlVizDef) {
  assertSqlViz(def);
  const params=field({type:'object',description:'Visualization filters.',properties:def.params},true) as ObjectSchema;
  const returns=field({type:'object',description:'Actual loaded visualization data.',properties:def.returns}) as ObjectSchema;
  // SQL SUM/AVG/MIN/MAX may be null on an empty set. Preserve that result in both readers.
  for(const b of def.blocks){
    const nullable=(c:ReturnType<typeof blockMeasures>[number])=>'agg' in c&&!['count','count_distinct'].includes(c.agg);
    if(b.mark==='stat'&&nullable(b.value)) (returns.properties[b.id] as {type:readonly string[]}).type=[String(returns.properties[b.id].type),'null'];
    else if(b.mark!=='stat')for(const c of blockMeasures(b))if(nullable(c)){
      const target=returns.properties[b.id].items!.properties![chanOut(c)] as {type:readonly string[]};target.type=[String(target.type),'null'];
    }
  }
  return {description:def.description,params,returns};
}
