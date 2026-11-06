// Provided-data interpretation only. No external lookup, numeric scoring or AI call.
export const ANALYSIS_ENGINE='provided-rules-v1' as const;
export const conditionLabels={checked:'자료 대조 확인',review:'조건 검토 필요',unknown:'자료 미확인'} as const;
const rules:Record<string,{meaning:string;document:string}>={
 power_capacity:{meaning:'전력은 필요한 설비 부하·계약 수전 용량·증설 조건과 함께 비교해야 합니다. 기재 용량만으로 가동 적합성을 확정하지 않습니다.',document:'전력 계약·수전 설비·필요 부하 자료'},
 clear_height:{meaning:'유효 층고는 설비·적재 높이와 구조물·배관 간섭을 실제로 대조해야 합니다.',document:'층고 실측·단면도·설비 높이 자료'},
 floor_load:{meaning:'바닥하중은 장비·적재의 분포 및 구조 검토와 연결됩니다. 사용 가능 하중을 임의 환산하지 않습니다.',document:'구조 검토·바닥하중·설비 배치 자료'},
 utilities:{meaning:'급배수·전기·가스의 설치 범위와 사용 권한을 영업 계획 및 추가 시설공사와 대조하세요.',document:'급배수·전기·가스 인입 및 사용 범위 자료'},
 ventilation:{meaning:'배기·환기 경로, 공용부 사용 및 민원·시설공사 조건을 함께 확인해야 합니다.',document:'배기 경로·공용부 사용·시설공사 자료'},
 building_use:{meaning:'건축물대장 용도와 실제 계획 용도·업종 조건은 별도로 대조해야 합니다. 제공 설명만으로 영업 가능성을 확정하지 않습니다.',document:'건축물대장·현황·용도 및 업종 검토 자료'},
 parking:{meaning:'주차 대수와 실제 배정·시간·사용 권한을 구분하고 방문 동선 및 운영시간과 대조하세요.',document:'주차 배정·운영시간·사용 권리 자료'},
 road_access:{meaning:'도로의 물리적 접면과 법적 접도·폭·차량 제약을 구분해야 합니다. 지도상의 도로만으로 진입 권리를 확인할 수 없습니다.',document:'지적도·현황도로·도로 폭·법적 접도 자료'},
 entrance_rights:{meaning:'통행·진입 권리는 소유 관계·사용승낙·제한 조건을 원자료와 대조해야 합니다.',document:'진입로 소유·통행 권리·사용승낙 자료'},
 land_use_zone:{meaning:'용도지역·지구·구역 및 개별 규제를 확인해야 합니다. 법정 건폐율·용적률은 인허가나 실제 증축 가능 면적을 확정하지 않습니다.',document:'토지이용계획·개별 규제·관계기관 확인 자료'},
 terrain:{meaning:'지형·경사·배수와 토목 조건은 현황·측량·계획 용도에 따라 검토해야 하며 토목비를 추정하지 않습니다.',document:'현황 측량·지형·배수·토목 검토 자료'},
 infrastructure:{meaning:'전력·상하수도 등 기반시설은 위치뿐 아니라 인입 가능 조건·용량·비용 주체를 확인해야 합니다.',document:'전력·상하수도 인입 및 협의 자료'},
 permits:{meaning:'제공된 허가 설명은 적용 범위·기준일·조건과 대조해야 합니다. 업종·용도변경·승계 가능성을 자동 확정하지 않습니다.',document:'실제 허가서·조건·관계기관 확인 자료'},
 development_constraints:{meaning:'개발 제약은 목적별 규제·접도·권리·시설 조건과 함께 검토해야 합니다. 이용 가능 면적을 계산해 확정하지 않습니다.',document:'토지이용규제·접도·권리·개발 검토 자료'},
 surrounding_demand:{meaning:'제공된 주변 수요 자료의 대상 범위·조사 시점·상주/직장/유동 구분을 확인해야 합니다. 수요를 실제 매출로 바꾸지 않습니다.',document:'주변 수요 조사 원문·범위·기준일 자료'},
 competition:{meaning:'주변 업종의 조사 범위와 기준일·영업 현황을 확인해야 합니다. 점포 수만으로 경쟁 강도나 예상 매출을 확정하지 않습니다.',document:'주변 업종·경쟁 점포 조사 원문'},
 docks:{meaning:'도크 규격·대수·차량 높이·대기 공간을 실제 입출고 계획과 대조하세요.',document:'도크 규격·접안·대기 및 상하차 자료'},
 refrigeration:{meaning:'온도 범위·냉동냉장 용량·전력·설비 유지 상태를 실제 보관품과 비교해야 합니다.',document:'냉동냉장 설비·온도·수전·점검 내역'},
 vehicle_access:{meaning:'차량 규격·회전·경사·출입 시간 및 도로 제약을 현장과 대조해야 합니다. 운전시간을 만들어 내지 않습니다.',document:'차량 진입·회전·시간 제한·현장 동선 자료'},
 loading_access:{meaning:'입출고·분류·상하차 동선과 기존 시설 사용 범위를 실제 작업 계획과 대조하세요.',document:'입출고·상하차·분류 동선 도면'},
 rent_roll:{meaning:'제공된 층·임대차 기록만 표시합니다. 미제공 층·공실을 채우거나 계약 금액을 추정 합산하지 않습니다. 민감한 계약조건은 별도 공개 승인이 필요합니다.',document:'공개 허용된 층별 임대 현황·만기·승계 조건'},
 annual_rent:{meaning:'기재된 연 임대료는 순수익·확정 수익률이 아닙니다. 만기·공실·비용·계약 승계와 대조해야 합니다.',document:'임대차계약·실제 수취 범위·만기 자료'},
 operating_cost:{meaning:'제공된 운영비의 기간·항목·제외 비용을 확인해야 합니다. 누락 비용을 0원으로 가정하지 않습니다.',document:'운영비·관리비 항목과 적용 기간 내역'},
 lease_period:{meaning:'최초 기간과 잔여 기간을 구분하고 갱신·해지·승계 조건을 계약서로 확인해야 합니다.',document:'계약기간·갱신·해지·승계 조건 원문'},
 occupancy:{meaning:'실제 제공된 임차·공실 현황과 기준일만 검토하며 공실률을 추정하지 않습니다.',document:'층별 임차·공실 현황과 기준일 자료'},
 maintenance:{meaning:'보수 이력·설비 상태·공사 범위가 필요합니다. 원가 근거 없이 CapEx 절감액이나 공사비를 만들지 않습니다.',document:'보수·점검 이력과 실제 견적 자료'},
};
export function analysisRule(key:string,purposeRisk:string){const rule=rules[key];return {interpretation:[rule?.meaning||'제공된 사양의 기준·적용 범위와 실제 계획을 대조해야 합니다.',purposeRisk].join(' '),materials:[rule?.document||'해당 조건의 원자료·기준일·현장 확인 자료']};}
