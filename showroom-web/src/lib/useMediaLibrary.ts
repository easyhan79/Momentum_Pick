import {useEffect,useState} from 'react';
import {mediaRequest} from './adminApi';
export type LibraryImage={id:string;kind:string;source_type:string;caption:string;url:string};
export function useMediaLibrary(propertyId:string,refresh:number,enabled=true){
 const [images,setImages]=useState<LibraryImage[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!enabled)return;let active=true;const urls:string[]=[];setLoading(true);setError('');setImages([]);
 void (async()=>{const r=await mediaRequest(`action=list&propertyId=${propertyId}`);const data=await r.json();const generated=data.assets.filter((i:LibraryImage)=>i.source_type==='ai_generated');const hero=generated.find((i:LibraryImage)=>i.caption.includes('대표'));const items=[...(hero?[hero]:[]),...generated.filter((i:LibraryImage)=>i.id!==hero?.id).slice(0,3),];const settled=await Promise.allSettled(items.map(async(item:Omit<LibraryImage,'url'>)=>{const r=await mediaRequest(`action=image&propertyId=${propertyId}&assetId=${item.id}`);const url=URL.createObjectURL(await r.blob());if(!active){URL.revokeObjectURL(url);return null;}urls.push(url);return{...item,url};}));if(active){setImages(settled.flatMap(s=>s.status==='fulfilled'&&s.value?[s.value]:[]));if(settled.some(s=>s.status==='rejected'))setError('일부 이미지를 불러오지 못했습니다. 자료 새로고침으로 다시 확인하세요.');}})().catch(()=>{if(active)setError('이미지를 불러오지 못했습니다. 자료 새로고침으로 다시 확인하세요.');}).finally(()=>{if(active)setLoading(false);});
 return()=>{active=false;urls.forEach(url=>URL.revokeObjectURL(url));};},[propertyId,refresh,enabled]);
 return{images,loading,error};
}
