import type {Asset,Concept} from '../types/showroom.ts';
export function visualEvidence(assets:Asset[],concept?:Concept){const approved=assets.filter(a=>a.approved);return {photo:approved.find(a=>!a.generated&&a.kind==='photo'),plan:approved.find(a=>!a.generated&&a.kind==='provided_plan'),generated:approved.find(a=>a.generated&&a.conceptId===concept?.id)};}
