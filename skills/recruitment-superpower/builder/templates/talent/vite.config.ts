import {defineConfig} from 'vite';
import {federation} from '@module-federation/vite';
import {fileURLToPath} from 'node:url';
import {page,publication} from './src/page.schema';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({root,base:'./',plugins:[federation({name:'talent_explorer',filename:'remoteEntry.js',manifest:true,exposes:{'./Page':'./src/page.tsx'},shared:{},dts:false}),{name:'page-contract',generateBundle(){this.emitFile({type:'asset',fileName:'page.json',source:JSON.stringify({...page,publication})})}}],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))},dedupe:['react','react-dom']},build:{target:'esnext',outDir:'dist',minify:true}});
