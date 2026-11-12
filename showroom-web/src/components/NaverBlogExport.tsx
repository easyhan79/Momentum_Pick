import {useMemo,useState} from 'react';
import type {LibraryImage} from '../lib/useMediaLibrary';
import {naverBlogPost,photoFileName} from '../lib/naverBlog';
import {createZip,downloadBytes} from '../lib/zip';

// Naver blog has no public posting API, so the post is prepared for copy and paste:
// title and body are copied separately and photos are downloaded in the order they appear.
export function NaverBlogExport({text,images,showroomUrl,propertyId}:{text:string;images:LibraryImage[];showroomUrl?:string;propertyId:string}){
  const post=useMemo(()=>naverBlogPost(text,images,showroomUrl),[text,images,showroomUrl]);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function copyTitle(){try{await navigator.clipboard.writeText(post.title);setMessage('제목을 복사했습니다. 네이버 블로그 제목 칸에 붙여 넣으세요.');}catch{setMessage('복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.');}}
  async function copyBody(){
    try{
      if(typeof ClipboardItem!=='undefined'&&navigator.clipboard.write)await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([post.html],{type:'text/html'}),'text/plain':new Blob([post.plain],{type:'text/plain'})})]);
      else await navigator.clipboard.writeText(post.plain);
      setMessage(`본문을 복사했습니다. 네이버 블로그 본문에 붙여 넣은 뒤 [사진 N 넣기] 자리에 사진 ZIP의 같은 번호 사진을 올리세요.`);
    }catch{setMessage('복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.');}
  }
  async function downloadPhotos(){
    setBusy(true);
    try{
      const entries=await Promise.all(post.photos.map(async photo=>{const blob=await (await fetch(photo.image.url)).blob();return {name:photoFileName(photo,blob.type),data:new Uint8Array(await blob.arrayBuffer())};}));
      downloadBytes(createZip(entries),`spacepick-${propertyId}-블로그사진.zip`);
      setMessage(`사진 ${entries.length}장을 ZIP으로 내려받았습니다.`);
    }catch{setMessage('사진을 내려받지 못했습니다. 자료 새로고침 후 다시 시도해 주세요.');}
    finally{setBusy(false);}
  }
  return <div className="naver-export" aria-label="네이버 블로그로 옮기기">
    <h4>네이버 블로그로 옮기기</h4>
    <ol><li>「제목 복사」 → 블로그 제목 칸에 붙여 넣기</li><li>「본문 복사」 → 본문에 붙여 넣기</li><li>「사진 ZIP 내려받기」 → 본문의 [사진 N 넣기] 자리에 같은 번호 사진 올리기</li></ol>
    <div className="admin-toolbar">
      <button type="button" className="button button-outline" disabled={!text.trim()} onClick={()=>void copyTitle()}>제목 복사</button>
      <button type="button" className="button button-gold" disabled={!text.trim()} onClick={()=>void copyBody()}>본문 복사 (네이버용)</button>
      <button type="button" className="button button-outline" disabled={busy||!post.photos.length} onClick={()=>void downloadPhotos()}>{busy?'준비 중…':`사진 ZIP 내려받기 (${post.photos.length}장)`}</button>
    </div>
    {!showroomUrl&&<p>쇼룸 주소가 아직 없어 링크는 빠집니다. 「매물 주소」에서 영문 주소를 저장하면 글 끝에 들어갑니다.</p>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
