import type {Fact} from '../types/showroom.ts';
import {hasFactValue,industrialReview} from './industrialReview.ts';
export type ReviewKind='factory'|'industrial'|'logistics'|'commercial'|'land'|'income'|'unknown';
type Group={id:string;title:string;description:string;fields:{label:string;keys:string[]}[];optional?:boolean};
const field=(key:string,label:string,aliases:string[]=[])=>({label,keys:[key,...aliases]});
const modules:Partial<Record<ReviewKind,Group[]>>={
 income:[{id:'income-leases',title:'층별 제공 임대정보',description:'제공된 층과 계약만 표시하며 빈 층을 채우거나 임대료 합계를 추정하지 않습니다.',fields:[field('rent_roll','층별 임대 현황'),field('tenant','임차 현황'),field('occupancy','공실·입주 현황'),field('lease_period','임대차 기간'),field('annual_rent','연간 임대료'),field('operating_cost','운영비')]},{id:'income-building',title:'건물 구조와 관리 조건',description:'보수·용도변경·증축은 실제 자료와 추가 검토가 필요합니다.',fields:[field('building_use','건축물 용도'),field('floor_structure','층별 구조'),field('maintenance','보수·관리 상태'),field('parking','주차 조건'),field('permits','인허가 조건')]}],
 commercial:[
  {id:'commercial-space',title:'층수와 공간 조건',description:'실제 공간과 계약 면적을 구분해 확인합니다.',fields:[field('floor','해당 층'),field('exclusive_area','전용면적',['indoor_area']),field('contract_area','계약·공급면적'),field('building_use','건축물 용도')]},
  {id:'commercial-facilities',title:'출입과 영업 시설',description:'업종에 필요한 시설과 사용 범위는 별도 확인이 필요합니다.',fields:[field('entrance','출입구·엘리베이터'),field('parking','주차 조건'),field('terrace_rights','테라스 사용권'),field('utilities','급배수·전기·가스')]},
  {id:'commercial-terms',title:'운영·인수 조건',description:'권리금·관리비·제한 업종은 실제 거래조건을 대조합니다.',fields:[field('maintenance_fee','관리비'),field('premium','권리금'),field('facility_transfer','기존 시설 인수'),field('restricted_uses','제한 업종')]},
 ],
 land:[
  {id:'land-status',title:'토지 현황과 이용규제',description:'지적·토지이용계획 자료와 제공 정보를 대조합니다.',fields:[field('lot_number','지번'),field('land_category','지목'),field('land_use_zone','용도지역',['zoning']),field('current_use','현재 이용상태')]},
  {id:'land-access',title:'접도와 진입 권리',description:'지도에 도로가 보이는 것과 실제 진입 권리가 있는 것은 구분해야 합니다.',fields:[field('road_access','도로 접면',['road']),field('entrance_rights','진입로·통행 권리'),field('terrain','지형·경사'),field('infrastructure','주변 기반시설')]},
  {id:'land-development',title:'개발 검토 조건',description:'개발 가능한 면적이나 허가 여부를 자동 확정하지 않습니다.',fields:[field('permits','인허가 조건',['permit']),field('development_constraints','개발 제약사항')]},
 ],
 logistics:[
  {id:'logistics-building',title:'층별 구조와 보관 조건',description:'토지·건물의 규모와 실제 보관 용도를 확인합니다.',fields:[field('warehouse_area','창고면적'),field('floor_structure','층별 구조'),field('temperature_type','상온·저온 구분'),field('clear_height','유효 층고',['ceiling_height'])]},
  {id:'logistics-access',title:'도크와 차량 동선',description:'차량 크기·층별 접근·상하차 조건을 현장자료와 대조합니다.',fields:[field('docks','접안 도크'),field('vehicle_access','차량 진출입',['truck_access']),field('loading_access','상하차 동선'),field('road_access','도로·교통 접근',['road'])]},
  {id:'logistics-equipment',title:'운영 설비',description:'추가 시설과 기존 설비를 구분해 검토합니다.',fields:[field('automation','자동화 설비'),field('refrigeration','저온 설비'),field('floor_load','바닥하중'),field('power_capacity','전력 용량',['power'])]},
  {id:'logistics-lease',title:'제공된 임차·운영 정보',description:'기재 임대료는 순수익이 아닙니다. 계약서와 운영비를 별도로 확인하세요.',optional:true,fields:[field('tenant','임차 현황'),field('annual_rent','연간 임대료'),field('lease_period','계약기간'),field('operating_cost','운영비')]},
 ],
};
export const reviewTitles:Partial<Record<ReviewKind,string>>={income:'건물의 임대 구성과 관리 조건',commercial:'공간 조건과 영업 준비사항',land:'토지 현황과 개발 검토사항',logistics:'보관 구조와 물류 운영 조건'};
export function propertyReview(facts:Fact[],kind:ReviewKind){
 if(kind==='factory'||kind==='industrial')return industrialReview(facts);
 return (modules[kind]||[]).filter(group=>!group.optional||facts.some(f=>group.fields.some(field=>field.keys.includes(f.key))&&hasFactValue(f.value))).map(group=>({id:group.id,title:group.title,description:group.description,rows:group.fields.map(field=>{const entries=facts.filter(f=>field.keys.includes(f.key));return {label:field.label,entries,missing:!entries.some(f=>hasFactValue(f.value))};})}));
}
