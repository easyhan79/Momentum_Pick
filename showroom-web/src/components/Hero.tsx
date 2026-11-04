import { ArrowDown, ArrowUpRight, MapPin, Sparkles } from 'lucide-react';
import type { Showroom } from '../types/showroom';
import { categoryLabels } from '../types/showroom';
import { AssetImage } from './AssetImage';

export function Hero({ data }: { data: Showroom }) {
  const heading=data.subtitle.replace(/\\n/g,'\n').split('\n').find(line=>line.trim())?.trim().slice(0,100)||'매물 정보 확인 필요';
  return <section className="hero section-shell" aria-labelledby="hero-title">
    <div className="hero-copy">
      <div className="eyebrow"><span className="status-dot" /> PROPERTY SHOWROOM <span className="eyebrow-sep">/</span> {categoryLabels[data.category]}</div>
      <p className="hero-property">{data.title}</p>
      <h1 id="hero-title"><span>{heading}</span></h1>
      <p className="hero-description">{data.summary}</p>
      <div className="hero-actions"><a className="button button-gold" href="#concepts">공간 활용 살펴보기 <ArrowUpRight size={18} /></a><a className="button button-outline" href="#facts">매물 정보 확인 <ArrowDown size={16} /></a></div>
      <div className="hero-note"><Sparkles size={15} /><span>제공정보와 활용 가설을 구분하는 쇼룸</span></div>
    </div>
    <div className="hero-visual">
      <AssetImage key={data.id} asset={data.heroAsset} className="hero-photo" />
      <div className="hero-location glass"><span className="small-label">LOCATION · 제공정보 / 미검증</span><p><MapPin size={16} />{data.address || '소재지 확인 필요'}</p></div>
      <div className="visual-index"><span>01</span><span>SPACE & POSSIBILITY</span></div>
    </div>
  </section>;
}
