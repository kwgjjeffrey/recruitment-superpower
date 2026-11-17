import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {page} from '../src/page.schema';
import {compilePortablePage} from '../src/sdk/portable';
import {assertControls} from '../src/components/schema';
const root=fileURLToPath(new URL('..',import.meta.url));
const walk=(directory:string):string[]=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(directory,entry.name)):[join(directory,entry.name)]);
export function checkProject(){
  const publication=compilePortablePage(page);assertControls(page.views.main.params);
  const manifest=JSON.parse(readFileSync(join(root,'component-sources.json'),'utf8'));
  for(const file of manifest.files){
    const hash=createHash('sha256').update(readFileSync(join(root,file.target))).digest('hex');
    if(hash!==file.targetSha256)throw new Error(`Review the component source and update its provenance: ${file.target}`);
  }
  const approved=new Set<string>(manifest.files.map((f:{target:string})=>f.target));
  const inventory:Record<string,string[]>={};
  for(const file of walk(join(root,'src')).filter(path=>/\.[jt]sx$/.test(path))){
    const name=relative(root,file),text=readFileSync(file,'utf8');
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.TSX);
    const controls=new Set<string>();
    function visit(node:ts.Node){
      if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
        const tag=node.tagName.getText(source);controls.add(tag);
        const attr=(name:string)=>node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(source)===name) as ts.JsxAttribute|undefined;
        const type=attr('type')?.initializer,role=attr('role')?.initializer;
        if(type&&ts.isStringLiteral(type)&&['date','time','datetime-local','month'].includes(type.text))throw new Error(`${name}: native temporal controls are forbidden.`);
        if(['select','dialog'].includes(tag)||(!approved.has(name)&&['input','textarea','button'].includes(tag)))throw new Error(`${name}: compose reviewed controls instead of raw <${tag}>.`);
        if(!approved.has(name)&&role&&ts.isStringLiteral(role)&&['dialog','listbox','option','tablist'].includes(role.text))throw new Error(`${name}: use an established overlay/selection component.`);
      }
      ts.forEachChild(node,visit);
    }
    visit(source);inventory[name]=[...controls].sort();
  }
  mkdirSync(join(root,'.recruitment'),{recursive:true});
  writeFileSync(join(root,'.recruitment/component-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
  writeFileSync(join(root,'.recruitment/semantics.json'),JSON.stringify(publication,null,2)+'\n');
  return publication;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const publication=checkProject();
  console.log(process.argv.includes('--semantics')?JSON.stringify(publication,null,2):'Page semantics, controls and component sources checked.');
}
