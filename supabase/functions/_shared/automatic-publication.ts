import {validateProfile, type PropertyProfile, type ProfileField} from './property-profile.ts';
import {candidateAsPrivateFields} from './listing-profile-adapter.ts';
import type {ListingBundle, SourceRef} from './listing-bundle.ts';
import {parseNewsCards} from './card-content.ts';

type Json = Record<string, any>;
type Db = (path: string, init?: RequestInit) => Promise<any>;
export const automaticReview = {mode: 'automatic', inputTrust: 'owner_confirmed', finalApproval: true};
const rpc = (db: Db, name: string, args: Json) => db(`rpc/${name}`, {method: 'POST', body: JSON.stringify(args)});
const hasValue = (v: unknown) => v !== null && v !== undefined && v !== '';

// Input trust is the owner's instruction, not a fabricated third-party verification.
// Raw attachments remain private; only their derived facts enter the public profile.
export function automaticContent(draft: Json, assets: Json[], runId: string, actor: string): Json {
  const sources = assets.filter(a => ['owner_provided', 'photographed'].includes(a.source_type) && !a.excluded_from_analysis);
  const sourceIds = new Set(sources.map(a => a.id));
  const profile: PropertyProfile = structuredClone(draft.propertyProfile);
  const fields: ProfileField[] = profile.fields.filter(f => !f.id.startsWith('bundle-candidate-') && !f.id.startsWith('auto-selling-'));
  const bundle = draft.listingBundle as ListingBundle | undefined;
  if (bundle) fields.push(...candidateAsPrivateFields(bundle, []).slice(0, Math.max(0, 57 - fields.length)));
  const supported = (refs: SourceRef[]) => refs.length > 0 && refs.every(r => r.kind === 'input_text' || r.kind === 'editor' || !!r.assetId && sourceIds.has(r.assetId));
  for (const [index, point] of (draft.salesStrategy?.sellingPoints || []).entries()) {
    if (fields.length >= 60 || !supported(point.sourceRefs || [])) continue;
    fields.push({id: `auto-selling-${index + 1}`, key: 'selling_point', label: `매물 특징 ${index + 1}`,
      value: point.fact, unit: '', status: 'provided', sourceText: (point.sourceRefs.map((r: SourceRef) => r.excerpt).filter(Boolean).join(' / ') || '등록자 제공자료').slice(0, 500),
      sourceIds: [...new Set<string>(point.sourceRefs.flatMap((r: SourceRef) => r.assetId ? [r.assetId] : []))], useApproved: true, publication: 'approved'});
  }
  profile.fields = fields.map(f => ({...f, sourceText: f.sourceText || (hasValue(f.value) ? '등록자 확인 정보' : ''),
    useApproved: hasValue(f.value) && f.status !== 'unknown', publication: hasValue(f.value) && f.status !== 'unknown' ? 'approved' : 'private'}));
  profile.sourcePermissions = sources.slice(0, 60).map(a => ({assetId: a.id, useApproved: true, allowDerivedPublication: true}));
  profile.highlights = (draft.salesStrategy?.sellingPoints || []).map((point: Json, i: number) => ({id: `selling-${i + 1}`, title: point.fact.slice(0, 100),
    description: point.buyerBenefit, constraints: '', fieldIds: [`auto-selling-${i + 1}`]})).filter((h: Json) => fields.some(f => f.id === h.fieldIds[0])).slice(0, 3);
  const addresses = bundle?.parcels.map(p => p.addressText).filter(Boolean) || [];
  const claims = bundle?.priceClaims.filter(c => c.scope === 'listing' && c.amountWon !== null && supported(c.sourceRefs)) || [];
  if (profile.transaction === 'sale' && profile.price.status === 'unknown' && claims.length === 1) profile.price = {...profile.price, status: 'fixed', saleWon: claims[0].amountWon};
  const reference = sources.find(a => a.kind === 'photo') || sources.find(a => a.kind === 'provided_plan');
  const marketing = {...draft.marketing};
  if (parseNewsCards(marketing.insta_caption || '').length !== 5 || parseNewsCards(marketing.insta_caption || '').some(c => c.body.length > 350)) {
    const point = draft.salesStrategy?.sellingPoints?.[0];
    const scenario = draft.salesStrategy?.useScenarios?.[0];
    const cards = [draft.subtitle, draft.summary?.slice(0, 280), point ? `${point.fact}\n${point.buyerBenefit}` : draft.summary,
      scenario ? `활용 아이디어\n${scenario.description}\n${scenario.conditions?.join(' / ') || '구체적인 이용 조건은 상담 시 안내합니다.'}` : '이 공간의 활용 방향을 상담해 보세요.',
      draft.salesStrategy?.callToAction || '매물 상세 정보와 현장 방문을 문의해 주세요.'];
    marketing.insta_caption = cards.map((body, i) => `[카드 ${i + 1}]\n${String(body || draft.title).slice(0, 300)}`).join('\n\n');
  }
  const genericUnknowns = new Set(['면적·가격·이용권·인허가와 자료 출처 확인 필요', 'AI 문구와 활용 방향은 미검증 가설입니다.', '제공정보의 출처·현황·인허가 조건을 확인해 주세요.']);
  return {...draft, title: ['매물 검토 초안', '새 매물'].includes(draft.title) ? draft.subtitle : draft.title,
    address: draft.address || addresses.join(' / ').slice(0, 300),
    unknowns: [...new Set([...(draft.unknowns || []).filter((s: string) => !genericUnknowns.has(s)), ...(draft.salesStrategy?.materialConstraints || []).map((c: Json) => c.description)])],
    marketing,
    propertyProfile: validateProfile(profile, {assets: sources.map(a => ({id: String(a.id), source_type: a.source_type})), userId: actor, now: new Date().toISOString(), previous: draft.propertyProfile}),
    imagePolicy: {version: 1, mode: 'manual_web'},
    imageSettings: reference ? {mode: reference.kind === 'photo' ? 'photo' : 'plan', sourceAssetId: reference.id, rightsApproved: true} : {mode: 'concept', sourceAssetId: null, rightsApproved: true},
    // Photo-like images have no invented coordinate overlays or plan mapping.
    concepts: (draft.concepts || []).map((c: Json) => {const {plan, ...content} = c; return {...content, zones: (c.zones || []).map((z: Json) => {const {position, ...zone} = z; return zone;})};}),
    automation: {version: 1, runId, inputTrust: 'owner_confirmed', imageStyle: 'photorealistic'}};
}

export async function prepareAutomatic(db: Db, id: string, actor: string) {
  let room = (await db(`property_showrooms?property_id=eq.${id}&select=*`))[0];
  if (!room?.draft_content?.propertyProfile) throw Error('draft_not_ready');
  const runs = await db(`property_processing_runs?property_id=eq.${id}&state=eq.applied&is_v2_submission=eq.true&select=id&order=created_at.desc&limit=1`);
  if (!runs.length) throw Error('draft_not_ready');
  if (room.draft_content.automation?.runId !== runs[0].id) {
    const assets = await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&select=id,kind,source_type,excluded_from_analysis`);
    const content = automaticContent(room.draft_content, assets, runs[0].id, actor);
    const slots = room.draft_content.automation?.version === 1 ? [] : ['hero', ...(room.draft_content.concepts || []).slice(0, 3).map((c: Json) => c.id)];
    room = await rpc(db, 'web_save_editor_v2', {p_property: id, p_actor: actor, p_revision: room.revision, p_content: content, p_slots: slots});
  }
  const slots = ['hero', ...(room.draft_content.concepts || []).slice(0, 3).map((c: Json) => c.id)];
  const jobs = [];
  for (const slot of slots) jobs.push(await rpc(db, 'web_automatic_image_enqueue', {p_property: id, p_actor: actor, p_run: runs[0].id, p_slot: slot}));
  return {showroom: room, jobs};
}

export function automaticSnapshot(room: Json, media: Json[], jobs: Json[], actor: string): Json {
  const draft = structuredClone(room.draft_content);
  if (draft.automation?.version !== 1 || !draft.title?.trim() || !draft.subtitle?.trim() || !draft.summary?.trim()) throw Error('automatic_not_ready');
  if (jobs.some(j => ['queued', 'running'].includes(j.state))) throw Error('image_generation_pending');
  const valid = new Map(media.filter(a => a.kind !== 'document').map(a => [a.id, a]));
  draft.assets = (draft.assets || []).filter((a: Json) => valid.has(a.id)).map((a: Json) => {
    const row = valid.get(a.id)!;
    return {...a, url: '', generated: row.source_type === 'ai_generated', kind: row.source_type === 'ai_generated' ? 'concept' : row.kind,
      caption: row.source_type === 'ai_generated' ? 'AI 활용 예상 이미지 · 실제 현장사진과 다를 수 있습니다.' : row.caption || '', approved: true};
  });
  draft.heroAsset = draft.assets.find((a: Json) => a.id === draft.heroAsset?.id) || draft.assets.find((a: Json) => a.generated);
  if (!draft.heroAsset) throw Error('automatic_image_required');
  draft._review = {...automaticReview, by: actor, at: new Date().toISOString(), revision: room.revision + 1};
  return draft;
}
