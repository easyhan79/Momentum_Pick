import type {Fact} from '../types/showroom.ts';
import type {ReviewKind} from './propertyReview.ts';
import {hasFactValue} from './industrialReview.ts';

export type ReviewQuestion={id:string;title:string;why:string;document:string;keys:string[]};
const question=(id:string,title:string,why:string,document:string,keys:string[]):ReviewQuestion=>({id,title,why,document,keys});
const common=[
 question('area','어느 범위의 면적인가요?','토지·전용·계약·연면적은 서로 다른 기준입니다. 사용하려는 공간의 범위를 확인하세요.','면적 기준과 최신 공부·층별 도면',['land_area','exclusive_area','indoor_area','contract_area','gross_floor_area','warehouse_area']),
 question('terms','실제 거래조건은 어떻게 되나요?','희망 조건과 체결 조건을 구분하고, 금액·포함 비용·입주 시점을 확인하세요.','매매·임대 조건표와 입주 가능일',['sale_price','rent','deposit','monthly_rent','available_date']),
];
const perKind:Partial<Record<ReviewKind,ReviewQuestion[]>>={
 income:[question('leases','층별 임대 운영은 어떻게 구성되나요?','기재된 임대료와 실제 운영수지는 다릅니다. 실제 제공된 층·임대차 자료만 대조하세요.','층별 임대 현황·계약 만기·운영비 자료',['rent_roll','tenant','occupancy','lease_period','annual_rent','operating_cost']),question('building','구조·보수와 변경 조건은 무엇인가요?','증축·용도변경 및 공사비는 자료 없이 확정할 수 없습니다.','구조·설비·보수 및 규제 자료',['floor_structure','building_use','maintenance','permits'])],
 commercial:[
  question('use','하려는 업종을 운영할 수 있나요?','건축물 용도, 제한 업종과 영업에 필요한 시설을 함께 확인해야 합니다.','건축물 용도·업종 제한·급배수·환기 자료',['building_use','restricted_uses','utilities']),
  question('access','고객의 출입과 주차는 편리한가요?','주차 배정, 출입구·승강기 사용 범위는 실제 운영에 영향을 줍니다.','출입구·승강기·주차 배정 안내',['entrance','parking']),
  question('handover','인수 비용과 기존 시설은 무엇인가요?','권리금·시설 소유권·관리비를 확인하면 추가 부담을 비교할 수 있습니다.','권리금·시설 인수 목록·관리비 내역',['premium','facility_transfer','maintenance_fee']),
 ],
 factory:[
  question('utilities','설비를 가동할 조건이 맞나요?','전력 계약용량, 유효 층고·하중, 용수·폐수 조건을 필요한 설비와 대조하세요.','전력·층고·하중·용수 및 폐수 자료',['power_capacity','power','clear_height','ceiling_height','floor_load','water_supply','wastewater']),
  question('access','장비와 차량이 실제로 진입하나요?','도로 폭만으로 통행 권리나 대형차의 회전·상하차 가능 여부가 확정되지는 않습니다.','진입로 권리·대형차 접근·상하차 동선 자료',['road_access','road','vehicle_access','truck_access','loading_access']),
  question('use','생산시설로 사용할 수 있나요?','용도지역·건축물 용도·공장등록과 업종별 허가를 확인하세요.','건축물대장·공장등록·업종별 인허가 자료',['building_use','land_use_zone','factory_registration','permits','permit']),
 ],
 logistics:[
  question('storage','보관 품목과 시설이 맞나요?','상온·저온 구분과 실제 냉동·냉장 설비의 상태를 나누어 확인하세요.','층별 보관 조건·저온 설비·운영 자료',['temperature_type','refrigeration','floor_structure']),
  question('access','층별 접안과 차량 동선은 어떤가요?','전체 건물 층수와 차량이 직접 접안하는 층은 다를 수 있습니다.','층별 도면·접안 도크·차량 동선 자료',['floor_structure','docks','vehicle_access','loading_access']),
  question('lease','현재 임대와 제안 조건을 구분했나요?','임대제안은 체결 수익이 아닙니다. 계약기간·공실·비용을 따로 확인하세요.','임대차 현황·만기·운영비 및 임대제안 구분',['tenant','occupancy','lease_period','lease_end','annual_rent','operating_cost']),
 ],
 land:[
  question('boundary','사용할 토지와 경계가 일치하나요?','지도 표시와 실측 경계, 지목·실제 이용 상태를 대조해야 합니다.','지적도·토지대장·경계 및 현황 자료',['lot_number','land_category','current_use']),
  question('access','접도와 진입 권리가 확보됐나요?','도로가 보이는 것과 법적 접도·차량 통행 권리가 있는 것은 별개입니다.','접도·진입로 소유 및 통행 권리 자료',['road_access','road','entrance_rights']),
  question('use','개발 검토에 필요한 제약은 무엇인가요?','용도지역·규제·지형·기반시설을 확인하기 전 개발 가능 면적을 확정할 수 없습니다.','토지이용계획·규제·경사·기반시설 자료',['land_use_zone','zoning','permits','terrain','infrastructure','development_constraints']),
 ],
};
export const providedFact=(fact:Fact)=>hasFactValue(fact.value)&&['owner_provided','verified'].includes(fact.evidence);
export function matchingFacts(facts:Fact[],keys:string[]){return facts.filter(f=>keys.includes(f.key)&&providedFact(f));}
export function customerQuestions(kind:ReviewKind,facts:Fact[],unknowns:string[]=[]){
 const list=[...common,...(perKind[kind==='industrial'?'factory':kind]||[])];
 if(kind==='commercial'&&facts.some(f=>['terrace_area','terrace_rights'].includes(f.key)))list.push(question('terrace','테라스를 전용으로 사용할 수 있나요?','테라스 면적과 전용 사용권·안전·영업 가능 범위는 각각 확인해야 합니다.','테라스 사용권·하중·운영 범위 자료',['terrace_rights']));
 const seen=new Set<string>();
 const extras=unknowns.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()).filter(v=>{if(seen.has(v))return false;seen.add(v);return true;}).slice(0,6).map((v,i)=>question(`extra-${i}`,v,'매물 설명에서 별도로 확인이 필요한 항목입니다. 담당자에게 최신 자료와 조건을 요청하세요.',`${v.slice(0,100)} 확인 자료`,[]));
 return [...list,...extras].map(q=>({...q,provided:matchingFacts(facts,q.keys)}));
}
export function briefGroups(kind:ReviewKind){
 const area={title:'규모와 면적',keys:['land_area','building_area','gross_floor_area','exclusive_area','indoor_area','contract_area','warehouse_area','terrace_area']};
 const facilities=kind==='income'?{title:'층별 용도와 임대 구성',keys:['floor_structure','building_use','rent_roll','tenant','lease_period','annual_rent','operating_cost']}:kind==='commercial'?{title:'공간과 영업 시설',keys:['floor','building_use','entrance','parking','utilities','terrace_rights']}:kind==='land'?{title:'토지 이용과 규제',keys:['land_category','land_use_zone','zoning','current_use','terrain']}:kind==='logistics'?{title:'보관과 접안 조건',keys:['temperature_type','floor_structure','docks','refrigeration','clear_height']}:{title:'시설과 가동 조건',keys:['building_use','power_capacity','power','clear_height','ceiling_height','floor_load','water_supply']};
 return [area,facilities,{title:kind==='commercial'?'현재 운영·인수 조건':'현재 이용·운영 현황',keys:['current_use','occupancy','tenant','available_date','facility_transfer','premium']},{title:'도로와 접근',keys:['road_access','road','vehicle_access','truck_access','entrance_rights','loading_access','infrastructure']}];
}
export function operationalFacts(facts:Fact[]){
 const actualKeys=['current_use','occupancy','tenant','available_date','lease_period','lease_start','lease_end','annual_rent','rental_deposit','deposit','operating_cost','maintenance_fee'];
 const proposed=(f:Fact)=>/^(proposed|assumed|projected)_/.test(f.key)||/임대제안|제안\s*임대료|가정|예상|목표/.test(f.label);
 return {current:facts.filter(f=>actualKeys.includes(f.key)&&providedFact(f)&&!proposed(f)),proposals:facts.filter(f=>hasFactValue(f.value)&&proposed(f))};
}
export function inquiryRequestPrefix(topics:string[]){
 const items=[...new Set(topics.map(v=>v.trim()).filter(Boolean))].slice(0,12).map(v=>v.slice(0,120));
 return items.length?`[확인·자료 요청]\n${items.map(v=>`- ${v}`).join('\n')}`:'';
}
export function composeInquiryMemo(topics:string[],memo:string){return [inquiryRequestPrefix(topics),memo.trim()].filter(Boolean).join('\n\n');}
