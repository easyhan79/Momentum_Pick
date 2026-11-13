// Location report built by the web worker (stage 4). Values come from the provider as-is.
export type NearbyPlace={name:string;distance:number};
export type NearbyCategory={code:string;label:string;radius:number;count:number;nearest:NearbyPlace[]};
export type Source={name:string;url:string};
export type Unavailable={status:'unavailable';error:string};
export type Commerce={status:'done';source:Source;fetchedAt:string;baseMonth:string;radius:number;total:number;counted:number;byCategory:{name:string;count:number}[];topSubcategories:{name:string;count:number}[]};
export type BuildingInfo={name:string;dong:string;mainUse:string;otherUse:string;structure:string;floorsAbove:number|null;floorsBelow:number|null;approvedOn:string;landArea:number|null;buildingArea:number|null;totalArea:number|null;coverageRatio:number|null;floorAreaRatio:number|null;parking:number;elevators:number};
export type Building={status:'done';source:Source;fetchedAt:string;count:number;buildings:BuildingInfo[]};
export type LandUse={status:'done';source:Source;fetchedAt:string;pnu:string;zones:{name:string;relation:string;updatedOn:string}[]};
export type LocationData={version:number;source:{name:string;url:string};fetchedAt:string;queryAddress:string;matchedAddress:string;roadAddress:string;buildingName:string;region:{sido:string;sigungu:string;dong:string};nearby:NearbyCategory[];commerce?:Commerce|Unavailable;building?:Building|Unavailable;landUse?:LandUse|Unavailable};
export type LocationRow={address:string;state:'done'|'not_found'|'failed';report:Partial<LocationData>;error_code:string;fetched_at:string;updated_at:string};

const errors:Record<string,string>={kakao_unauthorized:'카카오 키가 거절됐습니다. 앱의 REST API 키와 「카카오맵」 사용 설정을 확인해 주세요.'};

// One line telling the administrator where things stand.
export function locationStatus(available:boolean,row:LocationRow|null,address:string){
  if(!available)return '주변 환경 분석이 아직 운영에 준비되지 않았습니다.';
  if(!address.trim())return '소재지를 입력하고 저장하면 주변 환경을 자동으로 조사합니다.';
  if(!row||row.address!==address.trim())return '저장된 소재지로 주변 환경을 조사하는 중입니다. 잠시 뒤 새로고침해 주세요.';
  if(row.state==='not_found')return '지도에서 이 소재지를 찾지 못했습니다. 도로명 또는 지번 주소로 고쳐 저장해 주세요.';
  if(row.state==='failed')return (errors[row.error_code]||'주변 환경 조사에 실패했습니다. 자동으로 다시 시도합니다.')+(row.report?.nearby?' 아래는 이전 조사 결과입니다.':'');
  return '';
}

export const fetchedDate=(value?:string)=>value?value.slice(0,10):'';
export const distanceText=(m:number)=>m>=1000?`${(m/1000).toFixed(1)}km`:`${m}m`;

const sectionErrors:Record<string,string>={public_unauthorized:'공공데이터포털 키가 거절됐거나 이 API의 활용신청이 아직 승인되지 않았습니다.',vworld_unauthorized:'브이월드 키가 거절됐습니다. 서비스 URL(https://spacepick.kr)과 국가중점 API 선택을 확인해 주세요.',lot_number_missing:'지번을 찾지 못해 조회하지 못했습니다. 지번 주소로 저장하면 조회됩니다.'};
export const sectionProblem=(section?:{status:string;error?:string})=>section&&section.status!=='done'?(sectionErrors[section.error||'']||'조회하지 못했습니다. 하루 뒤 자동으로 다시 시도합니다.'):'';
const sqm=(n:number|null)=>n==null?'':`${n.toLocaleString()}㎡ (${(n/3.305785).toLocaleString(undefined,{maximumFractionDigits:1})}평)`;
export function buildingLines(b:BuildingInfo){
 return [b.mainUse&&`주용도 ${b.mainUse}${b.otherUse?` (${b.otherUse})`:''}`,(b.floorsAbove||b.floorsBelow)&&`지상 ${b.floorsAbove||0}층 · 지하 ${b.floorsBelow||0}층`,b.approvedOn&&`사용승인 ${b.approvedOn}`,b.totalArea!=null&&`연면적 ${sqm(b.totalArea)}`,b.landArea!=null&&`대지면적 ${sqm(b.landArea)}`,b.structure,`주차 ${b.parking}대 · 승강기 ${b.elevators}대`,(b.coverageRatio!=null||b.floorAreaRatio!=null)&&`건폐율 ${b.coverageRatio??'-'}% · 용적률 ${b.floorAreaRatio??'-'}%`].filter(Boolean) as string[];
}
