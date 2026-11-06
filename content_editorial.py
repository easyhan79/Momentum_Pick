"""Spacepick editorial brief and bounded automatic revision; no ranking claims."""
import re
from difflib import SequenceMatcher
from customer_copy import prepare_customer_copy

COPY_KEYS=('target_1_blog','target_2_blog','insta_caption')
EDITORIAL_BRIEF='''
[출판 편집 기준 — 최종 문안만 반환]
독자가 매물의 의미를 이해하고 구체적인 다음 행동을 선택할 수 있는 전문 편집물로 작성한다.
상위 1%·상위 노출·조회수·계약 성과를 보장하거나 본문에 그런 등급을 자칭하지 않는다.

고객 문안(usp_summary, landing_copy, 블로그, 카드뉴스)은 자연스러운 문장으로 쓴다.
[사실 조건], [사실 주장], [제공 주장], [제공정보], [활용 가설] 같은 내부 구분표시는 본문에 넣지 않는다.
제공 정보는 '제공자료에 따르면' 또는 '제공자 설명에 따르면'처럼 출처를 문장으로 표현한다.
활용 아이디어는 '검토할 수 있습니다'처럼 가설임을 밝히고 적용 전에 확인할 조건을 함께 쓴다.
임대차 기간, 잔여 계약기간, 계약 승계, 보증금·임대료는 원문에 명시된 범위에서만 적는다.
원문에 '장기 임대'만 있으면 '8년'으로 구체화하지 않는다. 계약 승계가 확인되지 않았으면
승계가 된다고 단정하지 말고 '계약 승계 가능 여부는 확인이 필요합니다'라고 쓴다.
landing_copy는 100자 이내의 짧은 제목 한 줄로, usp_summary는 출처·핵심 조건·확인사항을 담은 짧은 문단으로 쓴다.
관리자용 구분과 확인할 내용은 copy_review에 별도로 기록한다. 이 분류 자체는 사실 검증 완료가 아니다.

블로그 2편은 독자와 질문, 제목·도입·소제목·사례 설명이 서로 달라야 한다.
각 편은 제목 1개(# 제목), 도입 2~3개의 짧은 문단, 핵심 요약,
4~7개의 ## 소제목, 자료의 의미와 독자 상황을 연결하는 설명,
확인할 조건, 구체적인 문의 안내로 완결한다. 완성 글 1,400~2,800자를 목표로 하되
분량을 채우려고 문장을 반복하거나 없는 사실을 추가하지 않는다. 문단은 보통 2~3문장,
한 문단 280자 이내이며 실제 줄바꿈과 빈 줄을 사용한다. 제목은 60자 이내로 짧고 구체적으로 쓴다.
핵심 지역·유형은 제목과 도입에 자연스럽게 넣고 키워드를 기계적으로 반복하지 않는다.
각 글의 첫 두 문단에서 누구를 위한 글인지, 어떤 판단을 도와주는지 드러낸다.
숫자를 나열하고 끝내지 말고 해당 조건이 어떤 운영상의 질문과 연결되는지 설명한다.
확인되지 않은 수요·수익·호재·고속도로 거리·시설 적합성은 추정하지 않는다.

카드뉴스는 아래 형식의 정확히 5장으로 구성한다. 한 카드에 메시지는 하나만 둔다.
[카드 1] 다음 줄: 독자의 관심을 여는 28자 이내 제목 / 짧은 설명 1~3줄
[카드 2] 핵심 매물 조건과 근거
[카드 3] 그 조건이 독자에게 갖는 의미
[카드 4] 활용 가설과 적용 전에 확인할 조건
[카드 5] 문의할 때 전달할 정보 등 구체적인 다음 행동
각 카드 전체 문구는 30~150자, 제목 다음에는 실제 줄바꿈을 넣는다.
마지막 카드 다음에 '※ 게시글 캡션'으로 별도의 게시글 본문 200~450자와
관련성이 높은 해시태그 6~10개를 쓴다. 카드 안에 해시태그나 내부 제작 지시를 넣지 않는다.

숫자·가격·면적 종류·전력 단위·허가일은 원문 그대로 사용한다. 면적을 임의로 대지/연면적으로,
건축허가일을 준공/사용승인일로 바꾸지 않는다. 불명확한 단위는 원문 표기와 확인 필요를 적는다.
사진에서 보이지 않거나 자료가 없는 구조·층고·주행 가능 차량 규격을 만들지 않는다.
공통 출처와 불확실성은 자연스러운 한 구간으로 모으고, 독자의 판단에 필요한 조건을 구체화한다.
근거 없는 급매·독점·완벽한·확정 수익·투자비 회수·수익률 보장·허가 승계 보장 표현은 금지한다.
과장 부사와 무의미한 수식어(매머드급, 압도적, 최고의, 무조건)를 쓰지 않는다.
작성 후 제목-본문 일치, 사실과 가설 구분, 중복, 문단 호흡, 카드별 분량을 스스로 점검하고 고친다.
'''

def normalize(value):
    return str(value or '').replace('\\r\\n','\n').replace('\\n','\n').replace('\\r','\n').replace('\r\n','\n').strip()

def audit_copy(content):
    issues=[]
    for key in COPY_KEYS[:2]:
        text=normalize(content.get(key));lines=[x.strip() for x in text.splitlines() if x.strip()]
        if not lines or not lines[0].startswith('# '):issues.append(key+':missing_title')
        elif len(lines[0][2:])>60:issues.append(key+':title_too_long')
        if len(text)<1200 or len(text)>5000:issues.append(key+':article_length')
        if len(re.findall(r'^##\s+.+',text,re.M))<4:issues.append(key+':section_structure')
        paragraphs=[p for p in re.split(r'\n\s*\n',text) if p.strip() and not p.strip().startswith('#')]
        if len(paragraphs)<8 or any(len(p)>360 for p in paragraphs):issues.append(key+':paragraph_readability')
    if SequenceMatcher(None,normalize(content.get(COPY_KEYS[0])),normalize(content.get(COPY_KEYS[1]))).ratio()>.72:issues.append('blogs:too_similar')
    caption=normalize(content.get('insta_caption'));markers=list(re.finditer(r'^\[카드\s*(\d+)\]\s*$',caption,re.M))
    if [m.group(1) for m in markers]!=list('12345'):issues.append('cards:five_ordered_cards')
    else:
        for i,m in enumerate(markers):
            body=caption[m.end():markers[i+1].start() if i<4 else len(caption)].split('※',1)[0].strip()
            lines=[x for x in body.splitlines() if x.strip()]
            if not 30<=len(body)<=150 or len(lines)<2 or len(lines[0])>28:issues.append(f'cards:{i+1}:copy_length')
    if '※ 게시글 캡션' not in caption:issues.append('cards:missing_post_caption')
    tags=re.findall(r'(?<!\S)#[^\s#]+',caption)
    if not 6<=len(tags)<=10:issues.append('cards:hashtag_count')
    all_text='\n'.join(normalize(content.get(key)) for key in COPY_KEYS)
    if re.search(r'독점|급매|수익률\s*보장|확정\s*수익|완벽한|매머드급|무조건|상위\s*1\s*%',all_text):issues.append('copy:unsupported_superlative')
    return issues

def finalize_copy(package,source,revise=None):
    result=prepare_customer_copy(package)
    for key in COPY_KEYS:result[key]=normalize(result.get(key))
    issues=audit_copy(result);revised=False
    if issues and revise:
        # Exactly one text-only revision; never repeat image analysis or loop until success.
        try:
            correction=revise({key:result[key] for key in COPY_KEYS},source[:18000],issues)
            if not all(isinstance(correction.get(key),str) for key in COPY_KEYS):raise ValueError('invalid_copy')
            result.update({key:normalize(correction[key]) for key in COPY_KEYS});revised=True
            issues=audit_copy(result)
        except Exception:issues=issues+['copy:automatic_revision_unavailable']
    result=prepare_customer_copy(result)
    result['_editorial']={'version':'spacepick-editorial-v3','status':'ready' if not issues else 'needs_revision','automatically_revised':revised,'issues':issues}
    return result
