import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateImageSettings,imageSettingsReady,imageSettingSlots} from '../functions/_shared/image-settings.ts';
test('image mode requires matching original media and explicit usage approval',()=>{
 const photo={id:'photo',kind:'photo',source_type:'owner_provided'},plan={id:'plan',kind:'provided_plan',source_type:'owner_provided'};
 assert.deepEqual(validateImageSettings({mode:'concept',sourceAssetId:'secret',rightsApproved:false},[]),{mode:'concept',sourceAssetId:null,rightsApproved:false});
 for(const value of [{mode:'plan',sourceAssetId:'photo',rightsApproved:true},{mode:'photo',sourceAssetId:'missing',rightsApproved:true},{mode:'other',sourceAssetId:null,rightsApproved:true}])assert.throws(()=>validateImageSettings(value,[photo,plan]));
 assert.equal(imageSettingsReady(validateImageSettings({mode:'photo',sourceAssetId:'photo',rightsApproved:false},[photo])),false);
 assert.equal(imageSettingsReady(validateImageSettings({mode:'photo',sourceAssetId:'photo',rightsApproved:true},[photo])),true);
 assert.throws(()=>validateImageSettings({mode:'photo',sourceAssetId:'ai',rightsApproved:true},[{...photo,id:'ai',source_type:'ai_generated'}]));
 const mode={mode:'concept',sourceAssetId:null,rightsApproved:false};
 assert.deepEqual(imageSettingSlots(mode,mode,[{id:'concept-1'}]),[]);assert.deepEqual(imageSettingSlots(undefined,mode,[{id:'concept-1'}]),['hero','concept-1']);
});
