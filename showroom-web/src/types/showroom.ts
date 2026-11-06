import type {ImageSettings} from '../../../supabase/functions/_shared/image-settings.ts';
import type {PropertyProfile} from '../../../supabase/functions/_shared/property-profile.ts';
export type EvidenceStatus = 'verified' | 'owner_provided' | 'ai_hypothesis' | 'needs_review';
export type PropertyCategory = 'commercial' | 'industrial' | 'land' | 'income' | 'unknown';
export type Fact = {
  key: string; label: string; value: string | number | null; unit?: string;
  evidence: EvidenceStatus; source: string; status?:import('../../../supabase/functions/_shared/property-profile.ts').ProfileStatus; asOf?:string; publication?: 'private'|'approved';
};
export type Zone = {
  position?: {x:number;y:number}; evidence?: EvidenceStatus;
  id: string; label: string; sub?: string; title: string; body?: string;
  indoorOutdoor?: 'indoor' | 'outdoor' | 'site' | 'unknown';
  metric?: { label: string; value: string; evidence: EvidenceStatus; source: string };
};
export type Concept = {
  plan?: {assetId:string;caption:string;url?:string};
  id: string; conceptName: string; headline: string; rationale: string;
  feasibility: 'not_checked' | 'reviewed'; zones: Zone[];
};
export type Asset = {
  imageType?: 'concept'|'plan'|'photo';
  id: string; url: string; alt: string; caption: string; generated?:boolean;conceptId?:string;zoning?:{zoneId:string;x:number;y:number}[];
  kind: 'example' | 'photo' | 'concept' | 'provided_plan'; approved: boolean;
};
export type Showroom = {
  customerDecision?:import('../../../supabase/functions/_shared/customer-decision.ts').PublicDecision;
  rentalScenario?: import('../../../supabase/functions/_shared/rental-scenario.ts').RentalScenario;
  propertyProfile?: PropertyProfile;
  imageSettings?: ImageSettings;
  registration?: {channel:'web';rightsApproved:boolean;analysisDocumentIds?:string[];contact:{name:string;phone:string;publicApproved:boolean}};
  publicContact?: {name:string;phone:string};
  highlights?: {title:string;description:string;constraints:string;references:Fact[]}[];
  propertySummary?: Pick<PropertyProfile,'kind'|'transaction'|'price'>;
  visualMode?: 'ai_generated';
  planAnalysis?: {assetId:string;state:string;attempts:number;errorCode?:string;queuedAt?:string;startedAt?:string};
  schema_version: '1.0'; id: string; category: PropertyCategory;
  title: string; subtitle: string; address?: string; addressEvidence?: EvidenceStatus;
  summary: string; heroAsset?: Asset; facts: Fact[]; concepts: Concept[];
  unknowns: string[]; assets: Asset[];
  calculator?: {
    enabled: boolean; source: string; assumptions: string[];
    spend: number; teams: number; days: number; margin: number;
  };
};

export const evidenceLabels: Record<EvidenceStatus, string> = {
  verified: '검토 기록 있음', owner_provided: '제공정보 · 미검증',
  ai_hypothesis: '활용 가설', needs_review: '확인 필요',
};
export const categoryLabels: Record<PropertyCategory, string> = {
  commercial: '상가 · 오피스', industrial: '공장 · 물류부지',
  land: '토지 · 임야', income: '수익형 건물', unknown: '유형 확인 필요',
};

export function factEvidenceLabel(fact:Fact){const labels={verified:'증빙 대조 확인',provided:'제공자료 기준',inferred:'자료 기반 해석',generated:'AI 활용 제안',unknown:'확인 필요'};return fact.status?labels[fact.status]:evidenceLabels[fact.evidence];}
