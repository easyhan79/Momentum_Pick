// `warning` issues are shown for reference only; they do not block publishing.
export type PublicationIssue={code:string;message:string;target:string;assetId?:string;warning?:boolean};

export const publishConfirmMessage='고객에게 공개됩니다.\n주소·거래조건·가격·면적·담당자 연락처가 맞는지 확인하셨나요?';

export function publicationChecklist(dirty:boolean,serverIssues:PublicationIssue[]):PublicationIssue[]{
 const result:PublicationIssue[]=[];
 if(dirty)result.push({code:'unsaved_changes',message:'저장하지 않은 수정 내용이 있습니다. 먼저 「초안 저장」을 눌러 주세요.',target:'showroom-draft'});
 result.push(...serverIssues);
 return result;
}

export const blockingIssues=(issues:PublicationIssue[])=>issues.filter(issue=>!issue.warning);
export const warningIssues=(issues:PublicationIssue[])=>issues.filter(issue=>issue.warning);
