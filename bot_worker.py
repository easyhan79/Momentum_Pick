import os
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

# 2. 상가·토지·건물 모두 대응하는 범용 JSON 출력 스키마 정의
class ShowroomConcept(BaseModel):
    concept_name: str = Field(description="추천 활용 컨셉명 (상가면 추천업종, 토지면 추천개발/건축방향)")
    headline: str = Field(description="이 컨셉의 핵심 투자/창업 매력도 한 줄 카피")
    cost_benefit: str = Field(description="비용 절감 또는 기대 수익 포인트 (예: 토목비 절감, 건폐율 극대화, 인테리어 세이브 등)")
    zone_plan: List[str] = Field(description="공간/필지 5분할 활용 계획 (상가면 실내외 조닝, 토지면 부지/주차/조경 배치 5가지)")

class UniversalMarketingPackage(BaseModel):
    property_category: str = Field(description="자동 판별된 매물 유형 (예: 상업용 상가, 토지/임야, 수익형 건물, 창고/공장 등)")
    detected_targets: List[str] = Field(description="이 매물에 가장 적합한 핵심 매수/임차 타겟층 2~3개")
    usp_summary: str = Field(description="핵심 셀링 포인트 3줄 요약 (입지, 면적/용도 가성비, 수익성)")
    target_1_blog: str = Field(description="첫 번째 핵심 타겟 맞춤형 네이버 블로그 포스팅 (제목 + 본문 전체)")
    target_2_blog: str = Field(description="두 번째 핵심 타겟 맞춤형 네이버 블로그 포스팅 (제목 + 본문 전체)")
    insta_caption: str = Field(description="인스타그램 카드뉴스 5장 구성안 및 핵심 해시태그 15개")
    landing_copy: str = Field(description="전용 웹 쇼룸 메인 헤드라인 및 입지/수익률 브리핑 문구")
    showroom_concepts: List[ShowroomConcept] = Field(description="웹 쇼룸 시뮬레이터에 들어갈 3가지 추천 활용/개발 컨셉 데이터")

# 3. 텔레그램 안전 전송 함수 (특수문자 충돌 방지 + 4,000자 분할 전송)
def send_telegram(msg: str):
    url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
    max_len = 4000
    for i in range(0, len(msg), max_len):
        chunk = msg[i:i + max_len]
        res = requests.post(url, json={"chat_id": TG_CHAT_ID, "text": chunk}, timeout=15)
        print(f"Telegram API Status: {res.status_code}")
        if not res.ok:
            print(f"Telegram Error Detail: {res.text}")

# 4. 신규 매물 자동 판별 및 맞춤형 마케팅 패키지 생성
def process_new_properties():
    # DB에서 아직 분석 안 된 신규 매물('pending') 가져오기
    res = supabase.table("properties").select("*").eq("status", "pending").execute()
    
    if not res.data:
        print("신규 매물이 없습니다. 기존 매물 재가공 홍보 모드로 대기합니다.")
        return False

    for prop in res.data:
        raw_text = prop["raw_input"]
        print(f"매물 분석 시작 (ID: {prop['id']}): {raw_text}")
        
        prompt = f"""
        당신은 대한민국 최고의 부동산(상가·토지·임야·수익형 빌딩) 개발 기획자이자 마케팅 디렉터입니다.
        사장님이 입력한 아래 [입력된 매물 정보]를 읽고, 먼저 이 매물이 '상가/오피스'인지, '토지/임야/농지'인지, '주택/건물/창고'인지 성격을 정확히 판별하세요.

        [유형별 분석 지침]
        1. 상가/건물일 경우: 배후 수요, 앵커 테넌트, 실사용 면적(테라스 등 서비스 면적 포함) 가성비, 기존 시설 인계에 따른 창업비 절감을 중심으로 가장 유리한 창업 업종 타겟 2~3개를 도출하세요.
        2. 토지/임야일 경우: 용도지역(계획관리, 농림 등), 도로 접합 및 진출입 여건, 지형/경사도, 인근 개발 호재 및 자연환경을 분석하여 (A) 직접 개발·건축 실수요자(대형 카페, 글램핑, 세컨하우스, 창고 등), (B) 산림/농지 활용 및 중장기 지가상승 투자자 맞춤형으로 타겟과 쇼룸 부지 배치도를 작성하세요.
        3. 블로그 본문은 실제 네이버 상위 노출 스타일로 전문적이고 설득력 있게 구체적인 문단으로 길게 작성하세요.

        [입력된 매물 정보]
        {raw_text}
        """
        
        try:
            # 정식 지원 모델 gemini-2.5-flash 및 정형 JSON 스키마 강제 적용
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=UniversalMarketingPackage,
                    temperature=0.7,
                )
            )
            
            ai_result = json.loads(response.text)

            # Supabase DB에 생성된 마케팅 콘텐츠 저장 및 상태 변경
            supabase.table("properties").update({
                "ai_contents": ai_result,
                "status": "analyzed",
                "post_count": 1
            }).eq("id", prop["id"]).execute()

            # 추출된 타겟 목록 포맷팅
            targets_str = ", ".join(ai_result.get("detected_targets", []))
            category_str = ai_result.get("property_category", "일반 매물")

            # 사장님 텔레그램으로 완료 보고서 즉시 전송
            report = (
                f"✅ [신규 매물 AI 분석 및 마케팅 패키지 생성 완료]\n\n"
                f"🏷️ 자동 판별 유형: {category_str}\n"
                f"🎯 AI 선정 핵심 타겟: {targets_str}\n"
                f"📌 원본 입력: {raw_text}\n\n"
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

# 5. [필수] GitHub Actions가 이 파일을 실행할 때 작동하는 메인 스위치
if __name__ == "__main__":
    process_new_properties()
