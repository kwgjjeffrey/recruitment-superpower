import type {FieldSchema,ObjectSchema} from './contracts/schema';
/** This catalogue is also the renderer's dispatch. Unsupported declarations fail at build time. */
export function controlKind(field:FieldSchema) {
  const widget=field.ui?.widget;
  if(widget==='hidden')return 'hidden';
  if(field.ui?.optionsFrom)throw new Error('Dynamic options need a control adapter and observable options; they cannot fall back to text.');
  if(field.enum&&(widget===undefined||widget==='select'))return 'select';
  if(field.type==='string'&&(!widget||['search','text','textarea'].includes(widget)))return widget==='textarea'?'textarea':'text';
  if(['number','integer'].includes(String(field.type))&&(!widget||widget==='text'))return 'number';
  if(field.type==='boolean'&&(!widget||widget==='checkbox'))return 'checkbox';
  if(field.type==='object'&&!widget)return 'object';
  throw new Error(`No portable control for ${widget??String(field.type)}. Add an existing component adapter; do not silently use a text input.`);
}
export function assertControls(schema:ObjectSchema) {
  for(const [name,field] of Object.entries(schema.properties)) {
    try {
      const kind=controlKind(field);
      if(!field.ui?.label?.trim()&&kind!=='hidden')throw new Error('A visible label is required.');
      if(field.ui?.inputType&& !['email','tel'].includes(field.ui.inputType))throw new Error('Use an approved temporal adapter.');
      if(kind==='select') {
        if(!field.enum?.length)throw new Error('Select requires a nonempty enum.');
        for(const empty of ['',null])if(field.enum.includes(empty)&&field.default!==empty)
          throw new Error('A clearing choice must equal the declared default (accept clears to default).');
        const options=field.ui?.options;
        if(options&&(options.length!==field.enum.length||options.some(o=>!field.enum!.includes(o.value)||!o.label.trim())||new Set(options.map(o=>o.value)).size!==options.length))
          throw new Error('Choice values/labels must match the enum exactly.');
      }
      if(kind==='object')assertControls(field as ObjectSchema);
    } catch(error) {throw new Error(`params.${name}: ${(error as Error).message}`);}
  }
}
