/** Build-time checks for the portable runner's actual ABI, not a second page protocol. */
import type {FieldSchema, PageSchema} from './schema';
import {compileSchema, defaults} from './contract';
import {pagePublications} from './publication';

/** Preserve literal fields for Params/Value inference without duplicating interfaces. */
export function object<const P extends Readonly<Record<string, FieldSchema>>>(description:string, properties:P) {
  return {type:'object' as const, description, properties, required:Object.keys(properties) as (keyof P & string)[], additionalProperties:false as const};
}

export function compilePortablePage(page:PageSchema) {
  const fail=(path:string, message:string):never=>{throw new Error(`${path}: ${message}`)};
  if(page.default_view!=='main'||Object.keys(page.views).join()!=='main'||page.editors||page.semanticPages||page.browser_only)
    fail('page','Runner v1 supports one main view with parameters and observations.');
  for(const key of ['display_name','description'] as const)
    if(!page[key]?.trim()) fail(key,'A business description/title is required.');
  const view=page.views.main;
  if(view.actions||view.mode||view.navigation) fail('main','Form actions and host navigation are not supported by runner v1.');
  if(!view.description?.trim()) fail('main','Describe what the user can do and read.');
  function fields(node:FieldSchema, path:string) {
    if(!node.description?.trim()) fail(path,'A business meaning is required.');
    if(node.semantic?.range&&(['min','max'] as const).some(key=>{
      const constraint=key==='min'?node.minimum:node.maximum;
      return constraint!==undefined&&node.semantic!.range![key]!==undefined&&constraint!==node.semantic!.range![key];
    }))fail(path,'The semantic range contradicts the validation range.');
    if(node.type==='object') {
      if(!node.properties||!node.required||node.additionalProperties!==false)
        fail(path,'Use explicit properties/required and additionalProperties:false.');
      for(const name of node.required??[]) if(!Object.hasOwn(node.properties!,name)) fail(path,`Unknown required field ${name}.`);
    }
    if(node.type==='array'&&!node.items) fail(path,'An item schema is required.');
    for(const [key,field] of Object.entries(node.properties??{})) fields(field,`${path}.${key}`);
    if(node.items) fields(node.items,`${path}[]`);
  }
  fields(view.params,'params'); fields(view.returns,'returns');
  compileSchema(view.params); compileSchema(view.returns); defaults(view);
  for(const name of [...(view.resetOnChange??[]),...(view.query??[])])
    if(!Object.hasOwn(view.params.properties,name)) fail('main',`Unknown parameter reference ${name}.`);
  // The runner's URL transport is scalar. Structured drafts must stay out of the query.
  for(const [name,field] of Object.entries(view.params.properties))
    if((!view.query||view.query.includes(name))&&(field.type==='object'||field.type==='array'))
      fail(`params.${name}`,'Structured values require an explicit query list excluding this field.');
  const publication=pagePublications(page)[page.asset_path];
  // Express constraints in the existing business vocabulary; JSON Schema
  // execution keywords do not belong in the compact semantic publication.
  function inputs(schema:FieldSchema, meaning:Record<string,any>) {
    if(schema.minimum!==undefined||schema.maximum!==undefined)meaning.range={
      ...(schema.minimum!==undefined?{min:schema.minimum}:{}),...(schema.maximum!==undefined?{max:schema.maximum}:{}),
    };
    if(schema.default!==undefined&&!meaning.clearing)
      meaning.clearing=`Empty string or null restores ${JSON.stringify(schema.default)}.`;
    const formats=[meaning.format,
      schema.minLength!==undefined?`At least ${schema.minLength} characters.`:'',
      schema.maxLength!==undefined?`At most ${schema.maxLength} characters.`:'',
      schema.pattern?`Must match ${schema.pattern}.`:'',
      schema.maxItems!==undefined?`At most ${schema.maxItems} items.`:'',
      schema.uniqueItems?'Items must be unique.':'',
      schema.required?.length?`Required fields: ${schema.required.join(', ')}.`:'',
    ].filter(Boolean);
    if(formats.length)meaning.format=formats.join(' ');
    for(const [key,field] of Object.entries(schema.properties??{}))inputs(field,meaning.fields[key]);
    if(schema.items)inputs(schema.items,meaning.items);
  }
  const params=publication.params as Record<string,Record<string,any>>;
  for(const [name,field] of Object.entries(view.params.properties))inputs(field,params[name]);
  return publication;
}
