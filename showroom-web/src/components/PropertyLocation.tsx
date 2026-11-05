export function PropertyLocation({address,kind}:{address?:string;kind?:string}){
  const conditions=kind==='commercial'?'출입·주차·주변 상권':kind==='land'?'접도·진입 권리·주변 기반시설':'도로 접면·대형차 진입·주변 시설';
  return <section id="property-location" className="section-shell property-location" aria-labelledby="property-location-title"><div className="section-top"><div><p className="eyebrow">LOCATION / ACCESS</p><h2 id="property-location-title">위치와 접근 조건</h2></div></div>
    <div className="glass property-terms"><h3>{address?.trim()||'소재지 확인 필요'}</h3><p className="section-description">제공 주소 기준 위치 안내입니다. {conditions}의 현황과 거리·이동시간은 현장 및 원자료 확인이 필요합니다.</p>
      {address?.trim()&&<a className="button button-outline" href={`https://map.kakao.com/link/search/${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer">지도에서 주소 검색 ↗</a>}
      <p className="fact-source">지도 검색 결과는 측량 경계, 진입 권리나 시설 이용 가능성을 확인한 결과가 아닙니다.</p>
    </div>
  </section>;
}
