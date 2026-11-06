import assert from 'node:assert/strict';
import {validateProfile,visibleField} from '../functions/_shared/property-profile.ts';
import {defaultDecisionSettings,publicDecision} from '../functions/_shared/customer-decision.ts';
import {publicDto} from '../functions/_shared/public-showroom-dto.ts';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
try{
 const context={assets:[],userId:'server-reviewer',now:'2026-11-07T00:00:00Z'};
 const profile=validateProfile({version:1,kind:'factory',transaction:'sale',price:{status:'negotiable',saleWon:null,depositWon:null,monthlyWon:null},fields:[{id:'power',key:'power_capacity',label:'전력',value:100,unit:'kW',status:'provided',sourceText:'합성 공개자료',asOf:'2026-11-01',sourceIds:[],useApproved:true,publication:'approved'}],sourcePermissions:[],highlights:[],modules:{customerDecision:{...defaultDecisionSettings('factory'),publication:'approved',reviewConfirmed:true}}},context);
 const room={schema_version:'1.0',id:'synthetic',category:'industrial',title:'합성',subtitle:'검토',propertyProfile:profile,customerDecision:publicDecision(profile,profile.fields.filter(f=>visibleField(f,profile)))};
 await db.exec('CREATE TABLE rooms(id int PRIMARY KEY,draft jsonb,published jsonb)');await db.query('INSERT INTO rooms VALUES(1,$1::jsonb,$1::jsonb)',[JSON.stringify(room)]);
 const stored=(await db.query('SELECT published FROM rooms')).rows[0].published;
 const normalized=validateProfile(stored.propertyProfile,{...context,previous:stored.propertyProfile});assert.equal(normalized.modules.customerDecision.reviewedBy,context.userId);
 const before=publicDto(stored);assert.equal(before.customerDecision.cards[0].references[0].value,100);
 const edited=structuredClone(room);edited.propertyProfile.fields[0].value=200;await db.query('UPDATE rooms SET draft=$1::jsonb WHERE id=1',[JSON.stringify(edited)]);
 const after=publicDto((await db.query('SELECT published FROM rooms')).rows[0].published);assert.deepEqual(after,before);
 console.log('PASS analysis JSONB: key-order independent review and references; draft updates preserve frozen approved prose/data');
}catch(error){console.error({name:error.name,message:error.message});process.exitCode=1;}finally{await db.close();}
