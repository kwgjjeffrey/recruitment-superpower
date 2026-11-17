import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {checkProject} from './check_page_project';
import {PAGE_PROTOCOL} from '../src/contracts/runtime';
const require=createRequire(import.meta.url);
export async function runPageCommand(command:string,root:string) {
  if(!['check','build','semantics'].includes(command))throw new Error('Use recruitment-page check, build or semantics.');
  if(command!=='semantics'){
    const checked=spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'--noEmit'],{cwd:root,stdio:'inherit'});
    if(checked.status!==0)throw new Error('Page TypeScript check failed.');
  }
  const {page,publication}=await checkProject(root);
  if(command==='semantics'){console.log(JSON.stringify(publication,null,2));return;}
  if(command==='check'){console.log('Page semantics, components and supported controls checked.');return;}
  const {build}=await import('vite'),{federation}=await import('@module-federation/vite'),{default:tailwindcss}=await import('@tailwindcss/vite');
  const project=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).recruitmentPage;
  if(!/^[a-f0-9]{32}$/.test(project?.id))throw new Error('Use Builder new to create the stable project identity.');
  const remote=`page_${project.id}_${process.env.RECRUITMENT_BUILD_DIGEST??'local'}`;
  await build({root,configFile:false,base:'./',plugins:[tailwindcss(),federation({name:remote,filename:'remoteEntry.js',manifest:true,exposes:{'./Page':join(root,'src/page.tsx')},shared:{},dts:false}),{name:'page-contract',generateBundle(){this.emitFile({type:'asset',fileName:'page.json',source:JSON.stringify({...page,publication,runtime:{protocol:PAGE_PROTOCOL.name,version:PAGE_PROTOCOL.version,remote}})})}}],resolve:{dedupe:['react','react-dom']},build:{target:'esnext',outDir:'dist',minify:true}});
}
