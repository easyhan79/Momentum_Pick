type Db=(path:string,init?:RequestInit)=>Promise<any>;
export async function queuePlan(db:Db,propertyId:string,assetId:string,revision?:number){
 const assets=await db(`property_assets?id=eq.${assetId}&property_id=eq.${propertyId}&bucket_id=eq.showroom-private-media&source_type=neq.ai_generated&kind=neq.concept&select=id,caption`);
 if(!assets.length)throw Error('plan_asset_missing');
 const rooms=await db(`property_showrooms?property_id=eq.${propertyId}&select=draft_content,revision`);
 if(!rooms.length)throw Error('plan_draft_missing');
 const room=rooms[0];if(revision!==undefined&&room.revision!==revision)throw Error('plan_revision_conflict');
 const previous=room.draft_content.planAnalysis;
 if(previous?.state==='running'&&Date.parse(previous.startedAt||previous.queuedAt||'')>Date.now()-10*60*1000)throw Error('plan_already_running');
 const marker={assetId,state:'queued',attempts:0,requestId:crypto.randomUUID(),queuedAt:new Date().toISOString()};
 const rows=await db(`property_showrooms?property_id=eq.${propertyId}&revision=eq.${room.revision}&select=*`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({draft_content:{...room.draft_content,planAnalysis:marker},revision:room.revision+1})});
 if(!rows.length)throw Error('plan_revision_conflict');return rows[0];
}
export async function dispatchPlan(tokens:string[]=[],fetcher:typeof fetch=fetch){
 for(const token of [...new Set(tokens.filter(Boolean))]){try{const r=await fetcher('https://api.github.com/repos/easyhan79/Momentum_Pick/actions/workflows/agent.yml/dispatches',{method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'User-Agent':'Spacepick-Plans','Content-Type':'application/json'},body:JSON.stringify({ref:'main'}),redirect:'error',signal:AbortSignal.timeout(5000)});if(r.status===204)return true;}catch{/* Scheduled recovery preserves queued request. */}}
 return false;
}
