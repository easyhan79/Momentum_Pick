import {registrationIssues} from './web-registration.ts';
import {profilePublicationIssues} from './property-profile.ts';
type Json=Record<string,any>;
export type PublicationIssue={code:string;message:string;target:string;assetId?:string};
const object=(v:any):Json=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const array=(v:any):Json[]=>Array.isArray(v)?v:[];
export function publicationIssues(room:Json,media:Json[],jobs:Json[]):PublicationIssue[]{
 const draft=object(room.draft_content),issues:PublicationIssue[]=[];
 const add=(code:string,message:string,target:string)=>issues.push({code,message,target});
 if(room.showroom_status!=='in_review')add('review_required','「검수 준비」를 눌러 저장본을 검수 대기로 전환해 주세요.','publish-review');
 for(const [key,label] of [['title','매물명'],['subtitle','헤드라인'],['summary','매물 요약']])if(typeof draft[key]!=='string'||!draft[key].trim())add('content_review_required',`${label}을 입력하고 초안을 저장해 주세요.`,`draft-${key}`);
 if(typeof draft.subtitle==='string'&&draft.subtitle.length>100)add('content_review_required',`헤드라인이 ${draft.subtitle.length}자입니다. 100자 이하로 줄이고 저장해 주세요.`,'draft-subtitle');
 if(['queued','running','failed'].includes(object(draft.planAnalysis).state))add('plan_analysis_pending',object(draft.planAnalysis).state==='failed'?'도면 분석에 실패했습니다. AI 도면 분석에서 실패 원인을 확인하고 재시도해 주세요.':'도면 분석이 진행 중입니다. 완료 후 「조건 다시 확인」을 눌러 주세요.','plan-editor');
 const unclassified=new Set<string>();
 for(const concept of array(draft.concepts)){
  if(!concept.plan)continue;
  const zones=array(concept.zones),missing=zones.filter(z=>!z.position).length;
  if(!zones.length||missing)add('plan_positions_required',`${concept.conceptName||'활용 컨셉'}의 구역 번호 ${missing?missing+'개':'전체'}의 위치를 지정하고 저장해 주세요.`,'plan-editor');
  const asset=media.find(a=>a.id===concept.plan.assetId);
  if(!asset||asset.kind!=='provided_plan'){
   const id=String(concept.plan.assetId||'');if(unclassified.has(id))continue;unclassified.add(id);
   issues.push({code:'invalid_plan',message:asset?'연결한 배경 자료가 「제공 도면」으로 분류되지 않았습니다. 배경 도면은 게시할 때 공개됩니다. 공개 가능한 도면이면 자료 분류를 변경하고, 참고용으로만 쓸 자료면 배경 연결을 해제해 주세요.':'연결한 도면 자료를 찾을 수 없습니다. 배경 도면을 다시 선택하고 저장해 주세요.',target:asset?'media-'+id:'plan-editor',assetId:id});
  }
 }
 if(jobs.some(j=>['queued','running'].includes(j.state)))add('image_generation_pending','이미지 생성이 진행 중입니다. 완료 후 「조건 다시 확인」을 눌러 주세요.','image-studio');
 const selected=array(draft.assets),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(selected.length>24||selected.some(a=>!uuid.test(a.id||'')||!media.some(m=>m.id===a.id))||draft.heroAsset&&!selected.some(a=>a.id===draft.heroAsset.id))add('invalid_media','연결된 이미지 자료를 확인하고 초안을 다시 저장해 주세요.','property-media');
 if(draft.propertyProfile){try{issues.push(...profilePublicationIssues(draft.propertyProfile,media.map(a=>({id:String(a.id)})),draft.address));}catch{add('profile_review_required','매물 정보 형식을 확인하고 다시 저장해 주세요.','property-facts-editor');}}
 issues.push(...registrationIssues(draft));
 return issues;
}
