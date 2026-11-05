export const MAX_PRIVATE_PDF_BYTES=8*1024*1024;
export class PdfPreviewError extends Error{}
export async function privatePdfBytes(response:Response,expectedSha256?:string){
  if(!response.ok)throw new PdfPreviewError('원본을 가져오지 못했습니다. 자료 권한과 연결을 확인해 주세요.');
  if(response.headers.get('content-type')?.split(';')[0].trim()!=='application/pdf')throw new PdfPreviewError('PDF 원본 응답이 아닙니다. 파일을 다시 확인해 주세요.');
  const size=Number(response.headers.get('content-length'));
  if(size>MAX_PRIVATE_PDF_BYTES)throw new PdfPreviewError('원문 보기는 8MB 이하 PDF를 지원합니다.');
  const reader=response.body?.getReader();if(!reader)throw new PdfPreviewError('원본 파일을 읽지 못했습니다.');
  const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>MAX_PRIVATE_PDF_BYTES)throw new PdfPreviewError('원문 보기는 8MB 이하 PDF를 지원합니다.');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new PdfPreviewError('PDF 형식을 읽지 못했습니다. 원본 파일을 확인해 주세요.');
  if(expectedSha256){
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(digest!==expectedSha256)throw new PdfPreviewError('분석 당시 원본과 현재 파일이 다릅니다. 문서를 다시 분석한 후 대조해 주세요.');
  }
  return bytes;
}
