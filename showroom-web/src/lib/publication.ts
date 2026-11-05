export type PublicationIssue={code:string;message:string;target:string;assetId?:string};
export const publicationChecks={facts:'주소·면적·가격의 출처와 불확실한 항목을 확인했습니다.',rights:'사용권·인허가·거래 조건의 공개 범위를 확인했습니다.',claims:'AI 가설과 검증된 사실을 구분하고 과장된 주장을 정리했습니다.',privacy:'연락처·비공개 조건·자료 권한을 확인했습니다.'};
export function publicationChecklist(dirty:boolean,checks:Record<string,boolean>,notes:string,serverIssues:PublicationIssue[]):PublicationIssue[]{
 const result:PublicationIssue[]=[];
 if(dirty)result.push({code:'unsaved_changes',message:'저장하지 않은 수정 내용이 있습니다. 먼저 「초안 저장」을 눌러 주세요.',target:'showroom-draft'});
 result.push(...serverIssues);
 const missing=Object.keys(publicationChecks).filter(key=>checks[key]!==true);
 if(missing.length)result.push({code:'checklist_required',message:`아래 공개 확인 항목 ${missing.length}개에 체크해 주세요.`,target:'publish-check-'+missing[0]});
 if(notes.trim().length<10)result.push({code:'notes_required',message:`검수 근거·공개 범위 메모를 10자 이상 작성해 주세요. 현재 ${notes.trim().length}자입니다.`,target:'review-notes'});
 return result;
}
