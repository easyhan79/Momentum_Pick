"""Private v2 analysis schema; model claims remain unverified candidates."""
import math
import re
from typing import Literal, Annotated
from pydantic import BaseModel, ConfigDict, Field

Short = Annotated[str, Field(min_length=1,max_length=1000)]
Label = Annotated[str, Field(min_length=1,max_length=200)]
Condition = Annotated[str, Field(min_length=1,max_length=500)]
Identifier = Annotated[str, Field(pattern=r'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$')]
class V2Model(BaseModel):
    model_config = ConfigDict(extra='forbid',allow_inf_nan=False)
class SourceRef(V2Model):
    kind: Literal['input_text','pdf','photo','plan']
    inputVersionId: str | None = None
    assetId: str | None = None
    page: int | None = Field(default=None,ge=1)
    excerpt: str | None = Field(default=None,max_length=2000)
class Quantity(V2Model):
    key: Literal['land_area','building_area','gross_floor_area','exclusive_area','contract_area','warehouse_area']
    rawText: str = Field(min_length=1,max_length=500)
    value: float | None
    unit: Literal['sqm','pyeong','unknown']
    normalizedSqm: float | None = None
    status: Literal['provided','inferred','unknown']
    sourceRefs: list[SourceRef] = Field(max_length=10)
class Parcel(V2Model):
    id: Identifier
    addressText: str = Field(max_length=300)
    parcelNumber: str | None = Field(default=None,max_length=100)
    measurements: list[Quantity] = Field(max_length=60)
    sourceRefs: list[SourceRef] = Field(max_length=10)
class Building(V2Model):
    id: Identifier
    name: str | None = Field(default=None,max_length=200)
    parcelIds: list[Identifier] = Field(max_length=60)
    measurements: list[Quantity] = Field(max_length=60)
    sourceRefs: list[SourceRef] = Field(max_length=10)
class PriceClaim(V2Model):
    scope: Literal['listing','parcel','building']
    targetIds: list[Identifier] = Field(max_length=60)
    rawText: str = Field(min_length=1,max_length=500)
    amountWon: int | None = Field(ge=0,le=9007199254740991)
    sourceRefs: list[SourceRef] = Field(max_length=10)
class ConflictCandidate(V2Model):
    value: Annotated[str,Field(max_length=2000)] | float | None
    sourceRefs: list[SourceRef] = Field(max_length=10)
class Conflict(V2Model):
    fieldPath: str = Field(min_length=1,max_length=500)
    candidates: list[ConflictCandidate] = Field(min_length=2,max_length=20)
class ListingBundle(V2Model):
    # Gemini's SDK rejects non-string Literal enums before any HTTP request.
    # Keep the same v2-only contract using numeric bounds instead.
    schemaVersion: int = Field(ge=2,le=2)
    parcels: list[Parcel] = Field(max_length=60)
    buildings: list[Building] = Field(max_length=60)
    saleScope: Literal['bundle','individual','negotiable','unknown']
    priceClaims: list[PriceClaim] = Field(max_length=60)
    conflicts: list[Conflict] = Field(max_length=60)
class BuyerSegment(V2Model):
    label: Label
    rationale: Short
    sourceRefs: list[SourceRef] = Field(min_length=1,max_length=10)
class SellingPoint(V2Model):
    fact: Short
    buyerBenefit: Short
    sourceRefs: list[SourceRef] = Field(min_length=1,max_length=10)
class UseScenario(V2Model):
    description: Short
    conditions: list[Condition] = Field(max_length=10)
    unknowns: list[Condition] = Field(max_length=10)
    sourceRefs: list[SourceRef] = Field(min_length=1,max_length=10)
class MaterialConstraint(V2Model):
    description: Short
    relatedClaim: Short
class SalesStrategy(V2Model):
    positioning: Short
    buyerSegments: list[BuyerSegment] = Field(max_length=5)
    sellingPoints: list[SellingPoint] = Field(max_length=3)
    useScenarios: list[UseScenario] = Field(max_length=3)
    headlineVariants: list[Annotated[str,Field(min_length=1,max_length=200)]] = Field(max_length=3)
    materialConstraints: list[MaterialConstraint] = Field(max_length=20)
    callToAction: Annotated[str,Field(min_length=1,max_length=500)]


def validate_v2_candidates(result, input_version_id, documents, images):
    """Check source ownership and identity without promoting AI claims to facts."""
    bundle = ListingBundle.model_validate(result.get('listing_bundle'))
    sales = SalesStrategy.model_validate(result.get('sales_strategy'))
    # Catch a few especially consequential assurances seen in provider output.
    # Source IDs prove only where a candidate points, not that its implications
    # are supported. Human review is still required for all generated copy.
    claims=[sales.positioning,sales.callToAction,*sales.headlineVariants]
    claims.extend(value for item in sales.buyerSegments for value in (item.label,item.rationale))
    claims.extend(value for item in sales.sellingPoints for value in (item.fact,item.buyerBenefit))
    claims.extend(item.description for item in sales.useScenarios)
    claims.extend(str(result.get(key) or '') for key in ('usp_summary','landing_copy','target_1_blog','target_2_blog','insta_caption'))
    for claim in claims:
        for sentence in re.split(r'[\n.!?。]',claim):
            immediate=re.search(r'(?:즉시|즉각|바로).{0,35}(?:입주|입점|운영|사용|영업).{0,20}(?:가능|할 수 있)',sentence)
            negated=re.search(r'(?:가능|할 수 있).{0,20}(?:단정.{0,10}(?:안|없|금|어렵)|볼 수 없)',sentence) or re.search(r'(?:가능|할 수 있)(?:한)?\s*(?:상태인지|여부|한지|는지)',sentence)
            planning=immediate and re.search(r'운영\s*(?:기획|계획).{0,15}(?:검토|구상)',immediate.group())
            clearance=re.search(r'(?:명도|권리금).{0,55}(?:협의|합의|분쟁|문제|승계|절차|갈등|조율).{0,20}없이',sentence)
            clearance_relief=re.search(r'(?:명도|권리금).{0,35}(?:부담|비용|일정).{0,20}(?:적어|줄일|절감|없어)',sentence)
            outdoor=re.search(r'(?:외부|여유).{0,20}공간.{0,30}(?:확보|가능)',sentence)
            permit=re.search(r'(?:인허가|허가|승인).{0,25}(?:절차|검토|확인).{0,12}(?:없이|불필요)',sentence)
            if permit and re.search(r'(?:없이|불필요).{0,35}(?:단정.{0,10}(?:안|없|금|어렵)|볼 수 없|아닙니다)',sentence):permit=None
            permit_saving=re.search(r'(?:인허가|허가).{0,35}(?:시간|기간|비용|일정).{0,25}(?:절감|줄이|줄이고|단축)',sentence)
            if (immediate and not negated and not planning) or clearance or clearance_relief or outdoor or permit or permit_saving:
                raise ValueError('v2_unverified_claim')
    doc_ids = {d['assetId'] for d in documents}
    inspections = result.get('_document_inspections', [])
    pages = {documents[i['source_index']-1]['assetId']:i['page_count'] for i in inspections if isinstance(i,dict) and isinstance(i.get('source_index'),int) and 1<=i['source_index']<=len(documents) and isinstance(i.get('page_count'),int)}
    image_kinds = {i['assetId']:i['kind'] for i in images}
    def refs(values):
        for source in values:
            if source.kind == 'input_text':
                if source.inputVersionId != input_version_id or source.assetId is not None or source.page is not None:raise ValueError('v2_source_invalid')
            elif source.kind == 'pdf':
                if source.assetId not in doc_ids or source.inputVersionId is not None or source.page is not None and (source.assetId not in pages or source.page>pages[source.assetId]):raise ValueError('v2_source_invalid')
            elif source.assetId not in image_kinds or image_kinds[source.assetId] != source.kind or source.inputVersionId is not None or source.page is not None:
                raise ValueError('v2_source_invalid')
    parcels={p.id for p in bundle.parcels};buildings={b.id for b in bundle.buildings}
    if len(parcels)!=len(bundle.parcels) or len(buildings)!=len(bundle.buildings):raise ValueError('v2_duplicate_id')
    count=0
    for item in [*bundle.parcels,*bundle.buildings]:
        refs(item.sourceRefs)
        if isinstance(item,Building) and (len(set(item.parcelIds))!=len(item.parcelIds) or any(x not in parcels for x in item.parcelIds)):raise ValueError('v2_parcel_link_invalid')
        for quantity in item.measurements:
            count+=1;refs(quantity.sourceRefs)
            if not quantity.rawText.strip() or (quantity.value is None)!=(quantity.status=='unknown') or quantity.value is not None and (not math.isfinite(quantity.value) or quantity.value<=0 or not quantity.sourceRefs):raise ValueError('v2_quantity_invalid')
            quantity.normalizedSqm=None if quantity.value is None or quantity.unit=='unknown' else quantity.value if quantity.unit=='sqm' else quantity.value*3.305785
    if count>60:raise ValueError('v2_quantity_limit')
    for claim in bundle.priceClaims:
        refs(claim.sourceRefs)
        # Some models redundantly enumerate every known parcel and building
        # for a listing-wide price. This means the same as an empty target
        # list only when the enumeration is complete and contains no repeats.
        targets=set(claim.targetIds)
        if claim.scope=='listing' and targets and len(targets)==len(claim.targetIds) and targets==parcels|buildings:
            claim.targetIds=[]
        if not claim.rawText.strip() or len(set(claim.targetIds))!=len(claim.targetIds) or (claim.scope=='listing' and claim.targetIds) or (claim.scope!='listing' and (not claim.targetIds or any(x not in (parcels if claim.scope=='parcel' else buildings) for x in claim.targetIds))) or (claim.amountWon is not None and not claim.sourceRefs):raise ValueError('v2_price_invalid')
    for conflict in bundle.conflicts:
        for candidate in conflict.candidates:
            refs(candidate.sourceRefs)
            if not candidate.sourceRefs or isinstance(candidate.value,float) and not math.isfinite(candidate.value):raise ValueError('v2_source_invalid')
    for item in [*sales.buyerSegments,*sales.sellingPoints,*sales.useScenarios]:refs(item.sourceRefs)
    required=[sales.positioning,sales.callToAction,*sales.headlineVariants]
    required.extend(value for item in sales.buyerSegments for value in (item.label,item.rationale))
    required.extend(value for item in sales.sellingPoints for value in (item.fact,item.buyerBenefit))
    required.extend(value for item in sales.useScenarios for value in (item.description,*item.conditions,*item.unknowns))
    required.extend(value for item in sales.materialConstraints for value in (item.description,item.relatedClaim))
    if any(not value.strip() for value in required):raise ValueError('v2_sales_text_invalid')
    def clean_optional(value):
        if isinstance(value,list):return [clean_optional(v) for v in value]
        if isinstance(value,dict):return {k:clean_optional(v) for k,v in value.items() if not (v is None and k in ('inputVersionId','assetId','page','excerpt','parcelNumber','name'))}
        return value
    result['listing_bundle']=clean_optional(bundle.model_dump())
    result['sales_strategy']=clean_optional(sales.model_dump())
    return result

V2_PROMPT = '''추가로 listing_bundle과 sales_strategy를 반환하세요. 여러 필지와 건물은 내부 ID로 분리하고,
건물과 필지의 연결을 모르면 parcelIds를 비워 두세요. 면적 종류와 원 단위는 보존하며 총가격을 안분하거나 합계를 임의로 계산하지 마세요.
전체 매물 가격은 scope를 listing, targetIds를 빈 배열로 하고, 필지별·건물별 가격만 해당 대상 ID를 적으세요.
서로 다른 값은 conflicts에 각각의 후보와 출처로 남기세요. 모든 금액·면적 후보와 판매 장점은 허용된 sourceRefs에 연결하고,
AI는 verified 상태를 만들지 않습니다. inputVersionId와 assetId는 입력에 명시된 값만 사용하세요.
sales_strategy는 자료가 뒷받침하는 장점과 구매자 이익, 전제 조건이 있는 활용 장면을 자신감 있고 자연스러운 문장으로 제안하세요.
공실이라는 정보만으로 즉시 입주·운영 가능, 명도 협의나 권리금 분쟁이 없다는 결론을 내리지 마세요. 소유권·건축물 상태·용도·임대차가 미확인이면 자율적 이용이나 직영 운영을 확정하지 말고 확인할 조건으로 제시하세요.
건물 한 동이라는 정보로 필지 수를 단정하지 마세요. 대지면적과 건축면적의 차이를 실제로 사용할 수 있는 외부 공간이나 주차 공간으로 단정하지 마세요.
기존 건물이 있다는 이유만으로 신축·용도변경·운영에 필요한 인허가 절차가 불필요하다고 말하지 마세요. 원문에 없는 면적 합계는 계산하거나 고객 문안에 추가하지 마세요.
인허가 시간이나 비용 절감, 필지·공간의 특정 용도 배치 가능성은 현황과 법적 조건이 확인되지 않았다면 장점으로 확정하지 말고 확인할 조건이 있는 가설로 제시하세요.
자료에 구분소유·필지 수·층별 구조·주차 여건이 없다면 단독 필지, 단독 소유, 층별 분할 또는 주차가 가능하다고 쓰지 마세요. 구매자 이익이 제공 사실에서 직접 보장되지 않으면 판단에 필요한 확인 조건을 문장에 함께 적으세요. '검토'라는 단어만 붙여 확인되지 않은 조건을 사실처럼 제시하지 마세요.
건축면적은 건물의 바닥 면적 정보이며, 층별 면적이 명시되지 않았다면 이를 특정 층의 면적으로 바꾸지 마세요. 공실이라는 사실만으로 명도 갈등이나 퇴거 일정 조율이 없다고 단정하지 마세요.
없는 수익률·인허가·도로 조건·가격 상승·긴급성을 만들거나 알려진 제약을 숨기지 마세요.'''
