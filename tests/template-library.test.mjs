import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SourceTextModule, SyntheticModule } from 'node:vm'
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
async function setup(load, overrides={}){
 const ui={};const bindings={ui,USE_SERVER:true,loadTemplateLibrary:load,esc:String,icon:()=>'',GRADES:[],serverFrame:()=>'',button:()=>'',ask:()=>{},closeModal:()=>{},modal:()=>{},toast:()=>{},deactivateTemplate:()=>{},loadTemplatePreview:()=>{},registerTemplate:()=>{},updateTemplate:()=>{},useTemplate:()=>{}};
 Object.assign(bindings,overrides); const m=new SourceTextModule(await readFile(new URL('../src/admin/views/templates.js',import.meta.url),'utf8'));
 await m.link(()=>new SyntheticModule(Object.keys(bindings),function(){for(const [k,v]of Object.entries(bindings))this.setExport(k,v)}));await m.evaluate();return {ui,m:m.namespace};
}
test('newer filter response wins when older request finishes last',async()=>{
 const first=deferred(),second=deferred();let count=0;const {ui,m}=await setup(()=>++count===1?first.promise:second.promise);let draws=0;
 const a=m.loadLibrary(()=>draws++);ui.library.scope='mine';const b=m.loadLibrary(()=>draws++);second.resolve({content:['new']});await b;first.resolve({content:['old']});await a;assert.deepEqual(ui.library.data.content,['new']);assert.equal(draws,1);
});
test('stale failure cannot overwrite successful latest response',async()=>{
 const first=deferred(),second=deferred();let count=0;const {ui,m}=await setup(()=>++count===1?first.promise:second.promise);
 const a=m.loadLibrary();const b=m.loadLibrary();second.resolve({content:[]});await b;first.reject(new Error('old'));await a;assert.equal(ui.library.status,'ready');assert.equal(ui.library.error,null);
});
test('logout reset ignores in-flight library response',async()=>{
 const pending=deferred();const {ui,m}=await setup(()=>pending.promise);let draws=0;const a=m.loadLibrary(()=>draws++);m.resetLibrary();pending.resolve({content:['old']});await a;assert.equal(ui.library,null);assert.equal(draws,0);
});

test('register form submits once while pending and unlocks after failure',async()=>{
 const pending=deferred();let calls=0;const {m}=await setup(()=>Promise.resolve({content:[]}),{registerTemplate:()=>{calls++;return pending.promise}});
 const btn={textContent:'register',disabled:false},error={textContent:''};const form={id:'library-register-form',dataset:{event:'1',version:'2'},elements:{name:{value:'Template'},description:{value:''}},querySelector:s=>s==='button[type="submit"]'?btn:error};
 const ev={target:form,preventDefault(){}};m.handleLibrarySubmit(ev,{});m.handleLibrarySubmit(ev,{});assert.equal(calls,1);assert.equal(btn.disabled,true);pending.reject(new Error('rejected'));await new Promise(r=>setImmediate(r));assert.equal(btn.disabled,false);assert.equal(error.textContent,'rejected');assert.equal(form.dataset.submitting,undefined);
});
