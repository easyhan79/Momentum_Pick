import type {Asset,Concept} from '../types/showroom';
import {AssetImage} from './AssetImage';
import {visualEvidence} from '../lib/visualEvidence';
export function VisualEvidence({assets,concept}:{assets:Asset[];concept?:Concept}){
 const {photo,plan,generated}=visualEvidence(assets,concept);
 return <section className="section-shell visual-evidence" id="visual-evidence"><p className="eyebrow">PROVIDED MATERIAL / CONCEPT STUDY</p><h2>제공된 현황 자료와 활용안을 구분해 보세요.</h2>
 <p>{photo?'제공 현장사진의 촬영일·현재 상태는 별도 확인이 필요합니다.':'실제 현장사진이 제공되지 않았습니다.'} {plan||concept?.plan?'제공 도면은 실측·구조·시공 및 인허가 확인이 필요합니다.':'실제 도면이 제공되지 않았습니다. 활용안은 개념 검토입니다.'}</p>
 <div className="visual-evidence-grid">{photo&&<article className="glass"><h3>제공 현장사진</h3><AssetImage asset={photo}/></article>}{plan&&<article className="glass"><h3>제공 도면 · 실측 확인 필요</h3><AssetImage asset={plan}/></article>}{generated&&<article className="glass"><h3>{generated.imageType==='plan'?'도면 참고 활용안':generated.imageType==='photo'?'사진 참고 활용 예상도':'개념형 AI 활용안'}</h3><AssetImage asset={generated}/><p>AI 생성 이미지 · 실제 현황·구조·허가를 확인한 자료가 아닙니다.</p></article>}</div>
 {!generated&&<p>현재 선택한 콘셉트의 승인된 AI 이미지를 준비 중입니다. 다른 콘셉트 이미지를 대신 붙이지 않습니다.</p>}{photo&&generated&&<p>자료를 나란히 비교할 수 있습니다. 촬영 구도·시점과 생성 조건이 다를 수 있으며 직접 변환 관계는 별도 확인이 필요합니다.</p>}
 </section>;
}
