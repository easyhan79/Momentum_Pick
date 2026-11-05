import {PropertyReview} from './PropertyReview';
import type {Fact} from '../types/showroom';
export function IndustrialReview({facts}:{facts:Fact[]}){return <PropertyReview facts={facts} kind="industrial"/>;}
