import os
import re
import time
import json
import requests
from typing import List
from pydantic import BaseModel, Field
from supabase import create_client
from google import genai
from google.genai import types

# 1. 환경변수(열쇠) 불러오기
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
GEMINI_KEY = os.environ["GEMINI_API_KEY"]
TG_TOKEN = os.environ["TELEGRAM_TOKEN"]
TG_CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
client = genai.Client(api_key=GEMINI_KEY)

# 2. 상가·토지·공장·건물 모두 대응하는 범용 JSON 출력 스키마
class ShowroomConcept(BaseModel):
    concept_name: str = Field(description="추천 활용 컨셉명 (상가면 추천업종, 토지/공장이면 추천개발·물류·제조·확장 방향)")
    headline: str = Field(description="이 컨셉의 핵심 투자/창업 매력도 한 줄 카피")
    cost_benefit: str = Field(description="비용 절감 또는 기대 수익 포인트 (예: 토목비 절감, 전력/폐수 인허가 확보, 인테리어 세이브 등)")
    zone_plan: List[str] = Field(description="공간/필지 5분할 활용 계획 (실내외 조닝 또는 부지/확장지 5분할 배치)")

class UniversalMarketingPackage(BaseModel):
    property_category: str = Field(description="자동 판별된 매물 유형 (예: 상업용 상가, 토지/임야, 대형 공장/물류부지, 수익형 건물 등)")
    detected_targets: List[str] = Field(description="이 매물에 가장 적합한 핵심 매수/임차 타겟층 2~3개")
    usp_summary: str = Field(description="핵심 셀링 포인트 3줄 요약 (입지, 면적/용도/인프라 가성비, 수익성 및 확장성)")
    target_1_blog: str = Field(description="첫 번째 핵심 타겟 맞춤형 네이버 블로그 포스팅 (제목 + 본문 전체)")
    target_2_blog: str = Field(description="두 번째 핵심 타겟 맞춤형 네이버 블로그 포스팅 (제목 + 본문 전체)")
    insta_caption: str = Field(description="인스타그램 카드뉴스 5장 구성안 및 핵심 해시태그 15개")
    landing_copy: str = Field(description="전용 웹 쇼룸 메인 헤드라인 및 입지/수익률 브리핑 문구")
    showroom_concepts: List[ShowroomConcept] = Field(description="웹 쇼룸 시뮬레이터에 들어갈 3가지 추천 활용/개발 컨셉 데이터")

# 3. 텔레그램 안전 전송 함수 (4,000자 분할 전송)
def send_telegram(msg: str):
    url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
    max_len = 4000
    for i in range(0, len(msg), max_len):
        chunk = msg[i:i + max_len]
        res = requests.post(url, json={"chat_id": TG_CHAT_ID, "text": chunk}, timeout=15)
        print(f"Telegram API Status: {res.status_code}")

# 4. 텔레그램 첨부파일(PDF/이미지) 다운로드 및 Gemini Part 변환 함수
def load_telegram_file(file_id: str) -> types.Part:
    info_url = f"https://api.telegram.org/bot{TG_TOKEN}/getFile?file_id={file_id}"
    info_res = requests.get(info_url, timeout=15).json()
    file_path = info_res["result"]["file_path"]
    
    down_url = f"https://api.telegram.org/file/bot{TG_TOKEN}/{file_path}"
    file_bytes = requests.get(down_url, timeout=30).content
    
    lower_path = file_path.lower()
    if lower_path.endswith(".pdf"):
        mime_type = "application/pdf"
    elif lower_path.endswith(".png"):
        mime_type = "image/png"
    else:
        mime_type = "image/jpeg"
        
    return types.Part.from_bytes(data=file_bytes, mime_type=mime_type)

# 5.503 서버 과부하 시 자동 재시도(최대 3회) 함수
def generate_with_retry(contents_list, max_retries=3):
    for attempt in range(1, max_retries + 1):
        try:
            return client.models.generate_content(
                model="gemini-3.8-flash",
                contents=contents_list,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=UniversalMarketingPackage,
                    temperature=0.7,
                )
            )
        except Exception as e:
            err_str = str(e)
            if ("503" in err_str or "UNAVAILABLE" in err_str or "429" in err_str) and attempt < max_retries:
                wait_sec = attempt * 6
                print(f"구글 AI 서버 일시 혼잡(503). {wait_sec}초 후 자동 재시도합니다... ({attempt}/{max_retries})")
                time.sleep(wait_sec)
            else:
                raise e

# 6. 신규 매물 자동 판별 및 맞춤형 마케팅 패키지 생성
def process_new_properties():
    # 최신 대기 매물부터 순차 처리
    res = supabase.table("properties").select("*").eq("status", "pending").execute()
    
    if not res.data:
        print("신규 매물이 없습니다.")
        return False

    for idx, prop in enumerate(res.data):
        # 여러 개가 밀려 있을 때 구글 서버 과부하 방지용 3초 숨고르기
        if idx > 0:
            time.sleep(3)

        raw_text = prop.get("raw_input") or ""
        print(f"매물 분석 시작 (ID: {prop['id']}): {raw_text[:100]}")
        
        base_prompt = """
        당신은 대한민국 최고의 부동산(상가·토지·임야·공장·물류센터·수익형 빌딩) 개발 기획자이자 마케팅 디렉터입니다.
        전달된 매물 정보(텍스트 및 첨부된 PDF/도면 이미지)를 정밀 분석하여, 먼저 이 매물의 성격을 정확히 판별하세요.
        첨부파일에 지적도, 배치도, 형광펜 표시, 손글씨 메모(추가 부지 확보안 등)가 있다면 그 수치와 조건까지 빠짐없이 반영하세요.

        [유형별 분석 지침]
        1. 상가/오피스: 배후 수요, 앵커 시설, 실사용 면적(테라스 등 서비스 면적) 가성비, 기존 설비 인계 혜택을 중심으로 최적의 창업 업종 타겟을 도출하세요.
        2. 토지/임야: 용도지역, 도로 접합, 지형/경사도, 주변 개발 호재를 분석하여 개발 실수요자 및 지가상승 투자자 맞춤형 시나리오를 작성하세요.
        3. 공장/창고/물류용지: 고속도로 IC 접근성, 층고, 전력(kW)·공업용수·오폐수처리시설 등 인허가 인프라, 그리고 인접 추가 부지 확장성(제1안/제2안 등)을 중심으로 기업체·물류 디벨로퍼 타겟 브리핑을 작성하세요.
        """

        contents_list = []

        file_match = re.search(r"\[FILE_ID:([^\]]+)\]", raw_text)
        clean_text = re.sub(r"\[FILE_ID:[^\]]+\]", "", raw_text).strip()

        if file_match:
            file_id = file_match.group(1).strip()
            print(f"첨부파일 감지됨 (file_id: {file_id}). 다운로드 중...")
            file_part = load_telegram_file(file_id)
            contents_list.append(file_part)

        contents_list.append(f"{base_prompt}\n\n[입력된 매물 텍스트/메모]\n{clean_text if clean_text else '첨부된 문서 및 도면 이미지를 기준으로 전체 분석을 진행하세요.'}")
        
        try:
            # 자동 재시도 함수로 안전하게 호출
            response = generate_with_retry(contents_list)
            ai_result = json.loads(response.text)

            supabase.table("properties").update({
                "ai_contents": ai_result,
                "status": "analyzed",
                "post_count": 1
            }).eq("id", prop["id"]).execute()

            targets_str = ", ".join(ai_result.get("detected_targets", []))
            category_str = ai_result.get("property_category", "일반 매물")

            report = (
                f"✅ [신규 매물 AI 분석 및 마케팅 패키지 생성 완료]\n\n"
                f"🏷️ 자동 판별 유형: {category_str}\n"
                f"🎯 AI 선정 핵심 타겟: {targets_str}\n"
                f"📌 원본 입력 요약: {clean_text[:100] if clean_text else '첨부파일(PDF/이미지) 기반 분석'}\n\n"
                f"💡 핵심 셀링 포인트 (USP):\n{ai_result['usp_summary']}\n\n"
                f"🖥️ 웹 쇼룸 헤드라인:\n{ai_result['landing_copy'][:180]}...\n\n"
                f"📝 인스타 캡션 미리보기:\n{ai_result['insta_caption'][:180]}...\n\n"
                f"🚀 Supabase DB(ai_contents) 저장이 완료되었습니다."
            )
            send_telegram(report)

        except Exception as e:
            error_msg = f"⚠️ [매물 분석 중 오류 발생]\n매물 ID: {prop['id']}\n오류 내용: {str(e)}"
            print(error_msg)
            send_telegram(error_msg)

    return True

# 7. 메인 실행 스위치
if __name__ == "__main__":
    process_new_properties()
