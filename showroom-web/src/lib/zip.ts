// Minimal ZIP writer (stored, no compression). PNG/JPEG files are already compressed,
// so storing keeps the code small and needs no extra dependency.
const table=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(data:Uint8Array){let c=0xffffffff;for(let i=0;i<data.length;i++)c=table[(c^data[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}

export type ZipEntry={name:string;data:Uint8Array};

export function createZip(entries:ZipEntry[],date=new Date()):Uint8Array{
  const encoder=new TextEncoder();
  const time=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);
  const day=((date.getFullYear()-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
  const locals:Uint8Array[]=[],centrals:Uint8Array[]=[];let offset=0;
  for(const entry of entries){
    const name=encoder.encode(entry.name),crc=crc32(entry.data),size=entry.data.length;
    const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);
    lv.setUint16(10,time,true);lv.setUint16(12,day,true);lv.setUint32(14,crc,true);lv.setUint32(18,size,true);lv.setUint32(22,size,true);
    lv.setUint16(26,name.length,true);lv.setUint16(28,0,true);local.set(name,30);
    const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);
    cv.setUint16(12,time,true);cv.setUint16(14,day,true);cv.setUint32(16,crc,true);cv.setUint32(20,size,true);cv.setUint32(24,size,true);
    cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.set(name,46);
    locals.push(local,entry.data);centrals.push(central);offset+=local.length+size;
  }
  const centralSize=centrals.reduce((n,c)=>n+c.length,0);
  const end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  const parts=[...locals,...centrals,end],out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));
  let at=0;for(const p of parts){out.set(p,at);at+=p.length;}
  return out;
}

export function downloadBytes(bytes:Uint8Array,name:string,type='application/zip'){
  const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
