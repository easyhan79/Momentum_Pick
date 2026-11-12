import {imageTypeLabels} from '../../../supabase/functions/_shared/image-settings.ts';
import type { Asset } from '../types/showroom';
import { AssetImage } from './AssetImage';

export function Gallery({ assets }: { assets: Asset[] }) {
  const visible = assets.filter(asset => asset.approved);
  return <section id="gallery" className="section-shell gallery-section" aria-labelledby="gallery-title"><div className="section-top"><div><p className="eyebrow">SPACE INSPIRATION</p><h2 id="gallery-title">공간을 상상하는 장면들</h2></div><p className="section-note">제공 현장사진·도면과 AI 활용안을 구분해 보세요.</p></div>{visible.length ? <div className="gallery-grid">{visible.map(asset => <figure className="gallery-card glass" key={asset.id}><AssetImage asset={asset} /><figcaption><strong>{asset.generated?imageTypeLabels[asset.imageType||'concept']:asset.caption}</strong><span>{asset.kind === 'example' ? '원본 쇼룸의 분위기 참고 이미지 · 이용권 확인 필요' : asset.kind === 'provided_plan' ? '제공 도면 · 실측 여부 확인 필요' : '자료 출처와 공개 범위 확인 필요'}</span></figcaption></figure>)}</div> : <div className="empty-gallery glass"><p>실제 매물 사진과 도면을 준비하고 있습니다.</p><span>자료 확보 및 공개 범위 검토 후 추가합니다.</span></div>}</section>;
}
