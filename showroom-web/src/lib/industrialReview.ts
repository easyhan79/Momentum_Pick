import type { Fact } from '../types/showroom.ts';

// Review questions, not claims about a property's facilities or suitability.
const groups = [
  {id:'building', title:'토지와 건물', description:'공적 장부와 제공자료의 면적·용도를 대조합니다.', fields:[
    {label:'토지면적', keys:['land_area']},
    {label:'건축면적', keys:['building_area']},
    {label:'연면적', keys:['gross_floor_area']},
    {label:'기둥 간격', keys:['column_spacing']},
  ]},
  {id:'facilities', title:'설비와 작업 조건', description:'생산시설과 장비를 검토하기 위한 조건입니다.', fields:[
    {label:'전력 용량', keys:['power', 'power_capacity']},
    {label:'층고', keys:['ceiling_height', 'clear_height']},
    {label:'바닥하중', keys:['floor_load', 'floor_loading']},
    {label:'용수·폐수', keys:['water', 'water_supply', 'wastewater']},
  ]},
  {id:'access', title:'차량 접근과 반입', description:'현장과 도로 자료를 대조해 진입 가능 여부를 확인합니다.', fields:[
    {label:'도로 접면·진입로', keys:['road', 'road_access', 'road_frontage']},
    {label:'차량 진출입', keys:['vehicle_access', 'truck_access']},
    {label:'장비 반입·작업 동선', keys:['loading_access', 'work_flow']},
  ]},
  {id:'use', title:'용도와 이용 조건', description:'등록·용도·인허가 조건은 활용 아이디어와 별도로 검토합니다.', fields:[
    {label:'용도지역', keys:['zoning', 'land_use_zone']},
    {label:'건축물 용도', keys:['building_use']},
    {label:'공장등록', keys:['factory_registration']},
    {label:'인허가 조건', keys:['permit', 'permits']},
  ]},
];

export function hasFactValue(value: Fact['value'] | undefined) {
  return typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' && value.trim().length > 0;
}

export function industrialReview(facts: Fact[]) {
  return groups.map(group => ({
    id:group.id, title:group.title, description:group.description,
    rows:group.fields.map(field => {
      // Preserve competing source values rather than silently selecting one.
      const entries=facts.filter(fact => field.keys.includes(fact.key));
      return {label:field.label, entries, missing:!entries.some(fact => hasFactValue(fact.value))};
    }),
  }));
}
