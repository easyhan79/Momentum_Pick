// Status of each step in the listing workflow, derived only from data the admin page already has.
export type StageState='done'|'running'|'review'|'todo'|'blocked';
export type Stage={key:'analysis'|'brief'|'copy'|'images'|'marketing'|'publish';label:string;state:StageState;detail:string};
export type RewriteJob={id:string;state:string;createdAt:string;fields:string[]};
export type ImageJob={id:string;slot:string;state:string;attempts:number;asset_id?:string};
type Room={revision:number;published_revision?:number;showroom_status:string;draft_content:{salesStrategy?:unknown;brief?:{updatedAt?:string};heroAsset?:unknown;concepts?:{id:string}[];marketing?:Record<string,unknown>}};

export const stateLabels:Record<StageState,string>={done:'완료',running:'진행 중',review:'확인 필요',todo:'할 일',blocked:'막힘'};

export function imageSlots(room:Room){
  return ['hero',...(room.draft_content.concepts||[]).map(c=>c.id).filter(id=>['concept-1','concept-2','concept-3'].includes(id))];
}

export function workflowStages(room:Room,rewrites:RewriteJob[],images:ImageJob[]):Stage[]{
  const content=room.draft_content,briefAt=content.brief?.updatedAt||'';
  const latest=[...rewrites].filter(j=>!briefAt||j.createdAt>=briefAt).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const copy:Stage=!content.brief?{key:'copy',label:'글',state:'todo',detail:'기획서 확인 후 작성'}
    :!latest?{key:'copy',label:'글',state:'todo',detail:'기획서로 다시 쓰기 전'}
    :['queued','running','retry_wait'].includes(latest.state)?{key:'copy',label:'글',state:'running',detail:'AI가 작성 중'}
    :latest.state==='done'?{key:'copy',label:'글',state:'review',detail:'새 글 비교·적용 필요'}
    :latest.state==='applied'?{key:'copy',label:'글',state:'done',detail:'기획서 글 적용됨'}
    :{key:'copy',label:'글',state:'blocked',detail:'작성 실패 · 다시 요청 필요'};
  const slots=imageSlots(room),done=slots.filter(s=>images.some(j=>j.slot===s&&j.state==='done'&&j.asset_id));
  const imageStage:Stage=images.some(j=>['queued','running'].includes(j.state))?{key:'images',label:'이미지',state:'running',detail:'생성 중'}
    :done.length===slots.length&&slots.length?{key:'images',label:'이미지',state:'done',detail:`${done.length}장 준비됨`}
    :images.some(j=>j.state==='budget_blocked')?{key:'images',label:'이미지',state:'blocked',detail:'예산 한도'}
    :{key:'images',label:'이미지',state:'todo',detail:`${done.length}/${slots.length}장`};
  const marketing=content.marketing||{},hasMarketing=['target_1_blog','insta_caption'].every(k=>typeof marketing[k]==='string'&&(marketing[k] as string).trim());
  const published=room.showroom_status==='published';
  return [
    {key:'analysis',label:'분석',state:content.salesStrategy?'done':'todo',detail:content.salesStrategy?'분석 결과 있음':'자료로 분석 요청'},
    {key:'brief',label:'기획서',state:content.brief?'done':content.salesStrategy?'review':'todo',detail:content.brief?'확인됨':'확인 필요'},
    copy,imageStage,
    {key:'marketing',label:'블로그·카드뉴스',state:copy.state==='done'||hasMarketing?'done':'todo',detail:copy.state==='done'||hasMarketing?'내보내기 가능':'글 적용 후'},
    {key:'publish',label:'게시',state:published&&room.published_revision===room.revision?'done':published?'review':'todo',detail:published&&room.published_revision===room.revision?'게시됨':published?'변경사항 게시 필요':'미게시'},
  ];
}
