import {parseBlog} from './blogPreview.ts';

export type BlogImage={id:string;caption:string;source_type:string;url:string};
export type NaverPhoto={number:number;caption:string;image:BlogImage};
export type NaverPost={title:string;html:string;plain:string;photos:NaverPhoto[]};

const escapeHtml=(v:string)=>v.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
const inlineHtml=(v:string)=>escapeHtml(v).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
const inlinePlain=(v:string)=>v.replace(/\*\*([^*]+)\*\*/g,'$1');

// Same image choice and placement as the admin blog preview (cover first, then originals spread through the text).
// Block index after which each extra photo goes: spread evenly so every photo is used,
// even when the post has few paragraphs.
export function photoSlots(blockCount:number,photoCount:number):number[]{
  if(blockCount<=0)return Array.from({length:photoCount},()=>-1);
  return Array.from({length:photoCount},(_,k)=>Math.max(0,Math.floor((k+1)*blockCount/(photoCount+1))-1));
}

export function blogImages(images:BlogImage[],heroId?:string){
  const hero=images.find(i=>i.id===heroId)||images.find(i=>i.source_type==='ai_generated'&&i.caption.includes('대표'))||images.find(i=>i.source_type==='ai_generated');
  const originals=images.filter(i=>i.source_type==='ai_generated'&&i.id!==hero?.id).slice(0,5);
  return {hero,originals};
}

// Naver SmartEditor takes the title in a separate field and cannot import images from pasted HTML,
// so the body carries numbered photo markers that match the photo ZIP file names.
export function naverBlogPost(text:string,images:BlogImage[],showroomUrl?:string,heroId?:string):NaverPost{
  const blog=parseBlog(text),{hero,originals}=blogImages(images,heroId);
  const photos:NaverPhoto[]=[];
  const html:string[]=[],plain:string[]=[];
  const label=(image:BlogImage)=>image.source_type==='ai_generated'?`AI 활용 예시 · 실제 사진 아님 · ${image.caption}`:image.caption;
  const photo=(image:BlogImage)=>{const number=photos.length+1;photos.push({number,caption:label(image),image});const marker=`[사진 ${number} 넣기 · ${label(image)}]`;html.push(`<p style="color:#888888">${escapeHtml(marker)}</p>`);plain.push(marker);};
  if(hero)photo(hero);
  const slots=photoSlots(blog.blocks.length,originals.length);
  originals.forEach((image,k)=>{if(slots[k]<0)photo(image);});
  blog.blocks.forEach((block,i)=>{
    if(block.kind==='heading'){html.push(`<p><strong style="font-size:19px">${inlineHtml(block.text)}</strong></p>`);plain.push(`■ ${inlinePlain(block.text)}`);}
    else{html.push(`<p>${inlineHtml(block.text)}</p>`);plain.push(inlinePlain(block.text));}
    originals.forEach((image,k)=>{if(slots[k]===i)photo(image);});
  });
  if(showroomUrl){
    html.push('<p><br></p>',`<p><strong>매물 자세히 보기·문의</strong><br><a href="${escapeHtml(showroomUrl)}">${escapeHtml(showroomUrl)}</a></p>`);
    plain.push(`매물 자세히 보기·문의: ${showroomUrl}`);
  }
  html.push('<p style="color:#888888">제공 자료와 활용 아이디어를 구분해 소개합니다. 가격과 거래 조건은 상담 시 확인해 주세요. AI 활용 예시 이미지는 실제 현황 사진이 아닙니다.</p>');
  plain.push('제공 자료와 활용 아이디어를 구분해 소개합니다. 가격과 거래 조건은 상담 시 확인해 주세요. AI 활용 예시 이미지는 실제 현황 사진이 아닙니다.');
  return {title:inlinePlain(blog.title),html:html.join('\n'),plain:plain.join('\n\n'),photos};
}

export function photoFileName(photo:NaverPhoto,type:string){
  const ext=type.includes('png')?'png':type.includes('webp')?'webp':'jpg';
  return `사진${String(photo.number).padStart(2,'0')}.${ext}`;
}
