export type ImageSettings={mode:'concept'|'plan'|'photo';sourceAssetId:string|null;rightsApproved:boolean};
export class ImageSettingsError extends Error {code:string;constructor(code:string){super(code);this.code=code;}}
export function validateImageSettings(value:unknown,assets:{id:string;kind:string;source_type:string}[]):ImageSettings{
 const v=value as ImageSettings;
 if(!v||!['concept','plan','photo'].includes(v.mode)||typeof v.rightsApproved!=='boolean')throw new ImageSettingsError('invalid_image_settings');
 if(v.mode==='concept')return {mode:'concept',sourceAssetId:null,rightsApproved:v.rightsApproved};
 if(v.sourceAssetId!==null&&!assets.some(a=>a.id===v.sourceAssetId&&a.source_type!=='ai_generated'&&a.kind===(v.mode==='plan'?'provided_plan':'photo')))throw new ImageSettingsError('image_source_invalid');
 return {mode:v.mode,sourceAssetId:v.sourceAssetId,rightsApproved:v.rightsApproved};
}
export function imageSettingsReady(settings:ImageSettings){return settings.mode==='concept'||!!settings.sourceAssetId&&settings.rightsApproved;}
export function imageSettingSlots(previous:unknown,next:unknown,concepts:{id:string}[]){return JSON.stringify(previous??null)===JSON.stringify(next??null)?[]:['hero',...concepts.map(c=>c.id)];}

export const imageTypeLabels={concept:'AI 활용 콘셉트 이미지 · 실제 매물 모습과 다를 수 있음',plan:'도면 기반 AI 활용 예상도 · 시공 및 인허가 검토 전',photo:'현장 사진 기반 AI 변환 이미지 · 실제 현황 아님'};
