import { ArrowDown, ArrowUpRight, MapPin, Sparkles } from 'lucide-react';
import type { Showroom } from '../types/showroom';
import { categoryLabels } from '../types/showroom';
import { AssetImage } from './AssetImage';
import type {ReviewKind} from '../lib/propertyReview';

export function Hero({ data,kind }: { data: Showroom;kind?:ReviewKind }) {
  // Show every non-empty headline line (the headline is limited to 100 characters in total).
  const lines=data.subtitle.replace(/\\n/g,'\n').split('\n').map(line=>line.trim()).filter(Boolean).slice(0,3);
  const heading=lines.length?lines:['매물 정보 확인 필요'];
  return <section className="hero section-shell" aria-labelledby="hero-title">
    <div className="hero-copy">
      <div className="eyebrow"><span className="status-dot" /> PROPERTY SHOWROOM <span className="eyebrow-sep">/</span> {kind==='factory'?'공장':kind==='logistics'?'물류센터':categoryLabels[data.category]}</div>
      <p className="hero-property">{data.title}</p>
      <h1 id="hero-title">{heading.map((line,i)=><span key={i}>{line}</span>)}</h1>
      <p className="hero-description">{data.summary}</p>
      <div className="hero-actions"><a className="button button-gold" href="#customer-brief">매물 핵심정보 보기 <ArrowDown size={18} /></a><a className="button button-outline" href="#concepts">활용 아이디어 살펴보기 <ArrowUpRight size={16} /></a></div>
      <div className="hero-note"><Sparkles size={15} /><span>제공정보와 활용 가설을 구분하는 쇼룸</span></div>
    </div>
    <div className="hero-visual">
      <AssetImage key={data.id} asset={data.heroAsset} className="hero-photo" />
      <div className="hero-location glass"><span className="small-label">LOCATION · 제공정보 / 미검증</span><p><MapPin size={16} />{data.address || '소재지 확인 필요'}</p></div>
      <div className="visual-index"><span>01</span><span>SPACE & POSSIBILITY</span></div>
    </div>
  </section>;
}
