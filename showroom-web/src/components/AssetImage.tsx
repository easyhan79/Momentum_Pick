import {imageTypeLabels} from '../../../supabase/functions/_shared/image-settings.ts';
import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { Asset } from '../types/showroom';

export function AssetImage({ asset, className = '' }: { asset?: Asset; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(()=>setFailed(false),[asset?.url]);
  const safe = asset?.approved && /^(https:\/\/|blob:)/i.test(asset.url);
  return <div className={`asset-image ${className}`}>
    {safe && !failed
      ? <img src={asset.url} alt={asset.alt} onError={() => setFailed(true)} />
      : <div className="image-empty"><ImageOff size={32} strokeWidth={1} /><span>이미지 준비 중</span></div>}
    {safe && <span className="image-caption">{asset.generated?imageTypeLabels[asset.imageType||'concept']:asset.kind === 'example' ? '분위기 참고 · 실제 매물 사진 아님' : asset.caption}</span>}
  </div>;
}
