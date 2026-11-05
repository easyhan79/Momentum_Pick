import {useEffect,useRef,useState} from 'react';
import {AnnotationMode,GlobalWorkerOptions,getDocument} from 'pdfjs-dist';
import type {PDFDocumentProxy,PDFDocumentLoadingTask,RenderTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {mediaRequest} from '../lib/adminApi';
import {PdfPreviewError,privatePdfBytes} from '../lib/privatePdf';
import {sourceCheckLabels,type DocumentCandidate} from '../../../supabase/functions/_shared/document-review.ts';

GlobalWorkerOptions.workerSrc=workerUrl;
type Target={assetId:string;candidate?:DocumentCandidate};
export default function DocumentPdfViewer({propertyId,target,onClose,onDownload}:{propertyId:string;target:Target;onClose:()=>void;onDownload:()=>void}){
  const [pdf,setPdf]=useState<PDFDocumentProxy>(),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [page,setPage]=useState(1),[pageInput,setPageInput]=useState('1'),[zoom,setZoom]=useState(100);
  const [rendering,setRendering]=useState(false),[pageText,setPageText]=useState(''),[renderedPage,setRenderedPage]=useState(0);
  const container=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),[width,setWidth]=useState(640);
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{close.current?.focus();const element=container.current;if(!element)return;const observer=new ResizeObserver(entries=>setWidth(Math.max(180,Math.floor(entries[0].contentRect.width))));observer.observe(element);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    let active=true,task:PDFDocumentLoadingTask|undefined;
    const controller=new AbortController();
    const timer=setTimeout(()=>{if(active){setError('원문을 여는 시간이 초과됐습니다. 내려받은 파일로 확인해 주세요.');controller.abort();void task?.destroy().catch(()=>{});}},20000);
    void (async()=>{
      try{
        const response=await mediaRequest(`action=document&propertyId=${propertyId}&assetId=${target.assetId}`,undefined,controller.signal);
        const data=await privatePdfBytes(response,target.candidate?.sourceSha256);if(!active||controller.signal.aborted)return;
        task=getDocument({data,cMapUrl:__PDF_ASSET_PREFIX__+'cmaps/',cMapPacked:true,standardFontDataUrl:__PDF_ASSET_PREFIX__+'standard_fonts/',wasmUrl:__PDF_ASSET_PREFIX__+'wasm/',isEvalSupported:false,useWorkerFetch:true,stopAtErrors:true,maxImageSize:16000000,canvasMaxAreaInBytes:16000000});
        const document=await task.promise;if(!active)return;
        if(document.numPages>100)throw new PdfPreviewError('원문 보기는 100쪽 이하 PDF를 지원합니다. 내려받은 파일로 확인해 주세요.');
        const requested=target.candidate?.page||1,valid=requested<=document.numPages;
        setPage(valid?requested:1);setPageInput(String(valid?requested:1));
        if(!valid)setNotice(`후보의 ${requested}쪽은 원본 ${document.numPages}쪽 범위를 벗어납니다. 현재 1쪽을 표시합니다.`);
        setPdf(document);
      }catch(e){
        if(!active||controller.signal.aborted)return;
        setError(e instanceof PdfPreviewError?e.message:e instanceof Error&&e.name==='PasswordException'?'암호화된 PDF는 화면에서 열 수 없습니다. 암호화가 해제된 사본을 사용해 주세요.':'PDF를 표시하지 못했습니다. 원본을 내려받아 확인하거나 파일 연결을 확인해 주세요.');
        void task?.destroy().catch(()=>{});
      }finally{clearTimeout(timer);}
    })();
    return()=>{active=false;clearTimeout(timer);controller.abort();void task?.destroy().catch(()=>{});};
  },[propertyId,target]);
  useEffect(()=>{
    if(!pdf||error)return;
    let active=true,render:RenderTask|undefined;
    setRendering(true);setPageText('');setRenderedPage(0);
    const timeout=setTimeout(()=>{if(active){setError('페이지 표시 시간이 초과됐습니다. 원본을 내려받아 확인해 주세요.');render?.cancel();void pdf.destroy().catch(()=>{});}},20000);
    void (async()=>{
      try{
        const original=await pdf.getPage(page);if(!active||!canvas.current)return;
        const base=original.getViewport({scale:1});
        const viewport=original.getViewport({scale:Math.min(width/base.width,1.5)*zoom/100});
        const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(4000000/(viewport.width*viewport.height)));
        const element=canvas.current; element.width=Math.max(1,Math.floor(viewport.width*ratio));element.height=Math.max(1,Math.floor(viewport.height*ratio));element.style.width=viewport.width+'px';element.style.height=viewport.height+'px';
        render=original.render({canvas:element,viewport,transform:[ratio,0,0,ratio,0,0],annotationMode:AnnotationMode.DISABLE});
        await render.promise;if(!active)return;
        const text=await original.getTextContent();if(!active)return;
        setPageText(text.items.map(item=>'str' in item?item.str:'').join(' ').slice(0,20000));setRenderedPage(page);
      }catch(e){if(active&&!(e instanceof Error&&e.name==='RenderingCancelledException'))setError('이 페이지를 표시하지 못했습니다. 원본을 내려받아 확인해 주세요.');}
      finally{clearTimeout(timeout);if(active)setRendering(false);}
    })();
    return()=>{active=false;clearTimeout(timeout);render?.cancel();};
  },[pdf,page,width,zoom,error]);
  function move(next:number){if(!pdf||!Number.isInteger(next)||next<1||next>pdf.numPages){setNotice(`1~${pdf?.numPages||1}쪽 사이의 페이지를 입력해 주세요.`);return;}setNotice('');setPage(next);setPageInput(String(next));}
  return <section id="private-pdf-viewer" aria-label="관리자 원문 PDF 보기" className="private-pdf-viewer" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
    <div className="pdf-toolbar"><h3>비공개 원문 PDF</h3><button ref={close} type="button" className="button button-outline" onClick={onClose}>원문 보기 닫기</button><button type="button" className="button button-outline" onClick={onDownload}>원문 파일 내려받기</button></div>
    <p>원문은 관리자에게만 표시됩니다. PDF의 순서상 페이지이며, 문서에 인쇄된 쪽수와 다를 수 있습니다.</p>
    {!pdf&&!error&&<p role="status">원문을 여는 중입니다.</p>}
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {pdf&&!error&&<><form className="pdf-toolbar" onSubmit={e=>{e.preventDefault();move(Number(pageInput));}}>
      <button type="button" className="button button-outline" disabled={page<=1} onClick={()=>move(page-1)}>이전 쪽</button>
      <label>원문 페이지<input aria-label="원문 페이지" type="number" min="1" max={pdf.numPages} step="1" value={pageInput} onChange={e=>setPageInput(e.target.value)}/></label><span> / {pdf.numPages}쪽</span><button type="submit" className="button button-outline">페이지 이동</button>
      <button type="button" className="button button-outline" disabled={page>=pdf.numPages} onClick={()=>move(page+1)}>다음 쪽</button>
      <label>확대<select aria-label="원문 확대" value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value="100">화면에 맞춤</option><option value="150">150%</option><option value="200">200%</option></select></label>
    </form></>}
    <div className="pdf-comparison"><div ref={container} className="pdf-page-area">
      {!error&&<>{rendering&&<p role="status">{page}쪽을 표시하는 중입니다.</p>}<div className="pdf-canvas-scroll" aria-busy={rendering}><canvas ref={canvas} role="img" aria-label={`원본 PDF ${page}쪽`} data-rendered-page={renderedPage} hidden={!pdf||rendering}/></div>
      {pdf&&!rendering&&renderedPage>0&&(pageText?<details><summary>이 페이지의 추출 텍스트</summary><p className="pdf-page-text">{pageText}</p></details>:<p>추출 가능한 텍스트가 없습니다. 이미지 내용을 직접 대조해 주세요. OCR은 실행하지 않습니다.</p>)}</>}
    </div>{target.candidate&&<aside className="pdf-candidate"><h4>대조할 추출 후보</h4><p>{target.candidate.label}: {target.candidate.value} {target.candidate.unit}</p><p>AI가 제시한 페이지: {target.candidate.page||'확인 필요'}</p><blockquote>{target.candidate.quote||'인용문 확인 필요'}</blockquote><p>{sourceCheckLabels[target.candidate.sourceCheck||'not_checked']}</p><p>원문과 값을 확인한 뒤 대조 대상을 선택하세요. 화면을 열어도 사실 검증이나 공개 승인이 자동으로 바뀌지 않습니다.</p></aside>}</div>
  </section>;
}
