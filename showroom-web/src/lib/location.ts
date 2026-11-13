// Location report built by the web worker (stage 4). Values come from the provider as-is.
export type NearbyPlace={name:string;distance:number};
export type NearbyCategory={code:string;label:string;radius:number;count:number;nearest:NearbyPlace[]};
export type LocationData={version:number;source:{name:string;url:string};fetchedAt:string;queryAddress:string;matchedAddress:string;roadAddress:string;buildingName:string;region:{sido:string;sigungu:string;dong:string};nearby:NearbyCategory[]};
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
