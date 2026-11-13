// Browser-side image preparation before upload: large photos are scaled down so uploads are fast
// and stay under the 8MB server limit; iPhone HEIC photos are converted where the browser can read them.
export const MAX_EDGE=2560;
export const RESIZE_BYTES=3*1024*1024;
export const MAX_UPLOAD_BYTES=8*1024*1024;
const accepted=['image/jpeg','image/png','image/webp'];

export function isHeic(file:{name:string;type:string}){return /image\/hei[cf]/i.test(file.type)||/\.hei[cf]$/i.test(file.name);}
export function isPdf(file:{name:string;type:string}){return file.type==='application/pdf'||/\.pdf$/i.test(file.name)&&!file.type;}

export function targetSize(width:number,height:number,max=MAX_EDGE){
  const scale=Math.min(1,max/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

// Re-encode when the picture is larger than needed, too heavy, or not a format the server accepts.
export function needsPreparation(file:{type:string;size:number},width:number,height:number){
  return !accepted.includes(file.type)||Math.max(width,height)>MAX_EDGE||file.size>RESIZE_BYTES;
}

// Plans are line drawings: keep PNG so lines stay sharp. Everything else becomes JPEG.
export function outputType(sourceType:string,kind:string){return kind==='provided_plan'&&sourceType==='image/png'?'image/png':'image/jpeg';}

export function renamed(name:string,type:string){return name.replace(/\.[^.]+$/,'')+(type==='image/png'?'.png':'.jpg');}

export async function prepareImage(file:File,kind:string):Promise<{file:File;resized:boolean}>{
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}
  catch{throw Error(isHeic(file)?'이 브라우저는 HEIC 사진을 읽지 못합니다. 아이폰 설정 › 카메라 › 포맷을 「높은 호환성」으로 바꾸거나 JPG로 내보내 올려 주세요.':'이미지를 읽지 못했습니다. 다른 파일을 선택해 주세요.');}
  if(!needsPreparation(file,bitmap.width,bitmap.height)){bitmap.close();return {file,resized:false};}
  const size=targetSize(bitmap.width,bitmap.height),canvas=document.createElement('canvas');
  canvas.width=size.width;canvas.height=size.height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지를 줄이지 못했습니다.');
  const type=outputType(file.type,kind);
  if(type==='image/jpeg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size.width,size.height);}
  ctx.drawImage(bitmap,0,0,size.width,size.height);bitmap.close();
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('이미지를 줄이지 못했습니다.')),type,0.86));
  if(blob.size>MAX_UPLOAD_BYTES)throw Error('줄인 뒤에도 8MB를 넘습니다. 더 작은 파일을 선택해 주세요.');
  return {file:new File([blob],renamed(file.name,type),{type}),resized:true};
}
