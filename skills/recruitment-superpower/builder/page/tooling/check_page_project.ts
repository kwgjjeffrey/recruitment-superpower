import {readFileSync,readdirSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tsImport} from 'tsx/esm/api';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {compilePortablePage} from '../src/contracts/portable';
import {assertControls} from '../src/schema';
import {assertSqlViz,vizView} from '../src/viz/page-schema';
import {assertMetricReport,metricReportView} from '../src/viz/metric-report';
const library=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
export async function checkProject(root=process.cwd()){
  root=resolve(root);
  const {page}=await tsImport(pathToFileURL(join(root,'src/page.schema.ts')).href,import.meta.url);
  const publication=compilePortablePage(page);assertControls(page.views.main.params);
  for(const [name,field] of Object.entries(page.views.main.params.properties) as [string,any][]){
    if(field.ui?.optionsFrom){
      const source=page.views.main.returns.properties[field.ui.optionsFrom];
      if(source?.type!=='array'||source.items?.properties?.value?.type!=='string'||source.items?.properties?.label?.type!=='string')throw new Error(`${name} live choices must name observed value/label rows in returns.`);
    }
  }
  const definitions=join(root,'src/page.viz.ts');
  if(existsSync(definitions)){
    const module=await tsImport(pathToFileURL(definitions).href,import.meta.url);
    for(const def of Object.values(module).filter((v:any)=>v?.kind==='viz') as any[]){
      assertSqlViz(def);const view=vizView(def);
      if(JSON.stringify(page.views.main.params)!==JSON.stringify(view.params)||JSON.stringify(page.views.main.returns)!==JSON.stringify(view.returns))throw new Error('page.viz.ts must describe this main view through vizView().');
    }
    for(const def of Object.values(module).filter((v:any)=>v?.kind==='metric-report') as any[]){
      assertMetricReport(def);const view=metricReportView(def);
      if(JSON.stringify(page.views.main.params)!==JSON.stringify(view.params)||JSON.stringify(page.views.main.returns)!==JSON.stringify(view.returns))throw new Error('page.viz.ts metric report must describe this main view through metricReportView().');
    }
  }
  const approved=new Set<string>();
  for(const owner of [library,root]){
    const manifest=join(owner,'component-sources.json');if(!existsSync(manifest))continue;
    for(const file of JSON.parse(readFileSync(manifest,'utf8')).files){
      const target=resolve(owner,file.target);
      if(!target.startsWith(owner+'/'))throw new Error('Component source target escapes its package.');
      const hash=createHash('sha256').update(readFileSync(target)).digest('hex');
      if(hash!==file.targetSha256)throw new Error(`Review the component source and update its provenance: ${file.target}`);
      approved.add(target);
    }
  }
  const inventory:Record<string,string[]>={};
  for(const owner of [library,root])for(const file of walk(join(owner,'src')).filter(p=>/\.[jt]sx$/.test(p))){
    const name=(owner===library?'@recruitment/page/':'')+relative(owner,file),text=readFileSync(file,'utf8');
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.TSX),controls=new Set<string>();
    function visit(node:ts.Node){
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='showPicker')throw new Error(`${name}: native temporal pickers are forbidden.`);
      if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
        const tag=node.tagName.getText(source);controls.add(tag);
        const attr=(key:string)=>node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(source)===key) as ts.JsxAttribute|undefined;
        const type=attr('type')?.initializer,role=attr('role')?.initializer;
        if(type&&ts.isStringLiteral(type)&&['date','time','datetime-local','month'].includes(type.text))throw new Error(`${name}: native temporal controls are forbidden.`);
        if(['select','dialog'].includes(tag)||(!approved.has(file)&&['input','textarea','button'].includes(tag)))throw new Error(`${name}: compose reviewed controls instead of raw <${tag}>.`);
        if(!approved.has(file)&&role&&ts.isStringLiteral(role)&&['dialog','listbox','option','tablist'].includes(role.text))throw new Error(`${name}: use an established overlay/selection component.`);
      }
      ts.forEachChild(node,visit);
    }
    visit(source);inventory[name]=[...controls].sort();
  }
  mkdirSync(join(root,'.recruitment'),{recursive:true});
  writeFileSync(join(root,'.recruitment/component-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
  writeFileSync(join(root,'.recruitment/semantics.json'),JSON.stringify(publication,null,2)+'\n');
  return {page,publication};
}
