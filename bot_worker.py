import os
import re
import json
import sys
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
        res.raise_for_status()
        api_response = res.json()
        if not api_response.get("ok", False):
            raise RuntimeError(f"텔레그램 API 오류: {api_response.get('description', 'unknown')}")


def notify_telegram(msg: str):
    """알림 전송 실패가 이미 저장된 매물 분석 결과를 무효화하지 않도록 분리."""
    try:
        send_telegram(msg)
    except Exception as exc:
        print(f"경고: 텔레그램 알림 전송 실패: {type(exc).__name__}: {exc}")

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

# 5. 신규 매물 자동 판별 및 맞춤형 마케팅 패키지 생성
def process_new_properties():
    res = supabase.table("properties").select("*").eq("status", "pending").execute()
    
    if not res.data:
        print("신규 매물이 없습니다.")
        return 0

    failed_ids = []
    success_count = 0
    for prop in res.data:
        raw_text = prop.get("raw_input") or ""
        print(f"매물 분석 시작 (ID: {prop['id']}): {raw_text[:100]}")
        
        base_prompt = """
        당신은 대한민국 최고의 부동산(상가·토지·임야·공장·물류센터·수익형 빌딩) 개발 기획자이자 마케팅 디렉터입니다.
        전달된 매물 정보(텍스트 및 첨부된 PDF/도면 이미지)를 정밀 분석하여, 먼저 이 매물의 성격을 정확히 판별하세요.
        첨부파일에 지적도, 배치도, 형광펜 표시, 손글씨 메모(추가 부지 확보안 등)가 있다면 그 수치와 조건까지 빠짐없이 반영하세요.

        [검증 및 표기 원칙]
        - 제공되지 않은 시세, 수익률, 인허가, 도로 접합, 전력, 폐수 시설, 배후수요, 개발 호재 등을 확인된 사실처럼 쓰지 마세요.
        - 확인할 수 없는 정보는 반드시 '확인 필요'로 표시하세요.
        - 토지면적, 건축면적, 연면적을 구분하고, 단위나 명칭이 모호하면 임의로 확정하지 마세요.
        - 제안하는 활용 컨셉은 가설임을 명시하고 실제 적법성은 별도 인허가 확인이 필요함을 알리세요.

        [유형별 분석 지침]
        1. 상가/오피스: 배후 수요, 앵커 시설, 실사용 면적(테라스 등 서비스 면적) 가성비, 기존 설비 인계 혜택을 중심으로 최적의 창업 업종 타겟을 도출하세요.
        2. 토지/임야: 용도지역, 도로 접합, 지형/경사도, 주변 개발 호재를 분석하여 개발 실수요자 및 지가상승 투자자 맞춤형 시나리오를 작성하세요.
        3. 공장/창고/물류용지: 고속도로 IC 접근성, 층고, 전력(kW)·공업용수·오폐수처리시설 등 인허가 인프라, 그리고 인접 추가 부지 확장성(제1안/제2안 등)을 중심으로 기업체·물류 디벨로퍼 타겟 브리핑을 작성하세요.
        """

        contents_list = []

        # raw_input 내에 [FILE_ID:xxx] 태그가 있으면 텔레그램에서 PDF/사진을 직접 내려받아 첨부
        file_match = re.search(r"\[FILE_ID:([^\]]+)\]", raw_text)
        clean_text = re.sub(r"\[FILE_ID:[^\]]+\]", "", raw_text).strip()

        try:
            if not clean_text and not file_match:
                raise ValueError("매물 원본 내용과 첨부파일이 모두 비어 있습니다.")

            if file_match:
                file_id = file_match.group(1).strip()
                print("첨부파일 감지됨. 다운로드 중...")
                file_part = load_telegram_file(file_id)
                contents_list.append(file_part)

            contents_list.append(f"{base_prompt}\n\n[입력된 매물 텍스트/메모]\n{clean_text if clean_text else '첨부된 문서 및 도면 이미지를 기준으로 전체 분석을 진행하세요.'}")
            response = client.models.generate_content(
                model="gemini-3.8-flash",
                contents=contents_list,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=UniversalMarketingPackage,
                    temperature=0.7,
                )
            )
            
            if not response.text:
                raise RuntimeError("Gemini가 빈 응답을 반환했습니다.")
            ai_result = json.loads(response.text)
            UniversalMarketingPackage.model_validate(ai_result)

            # AI 콘텐츠 생성은 '게시'가 아니므로 post_count를 변경하지 않습니다.
            update_res = supabase.table("properties").update({
                "ai_contents": ai_result,
                "status": "analyzed"
            }).eq("id", prop["id"]).eq("status", "pending").execute()
            if not update_res.data:
                raise RuntimeError("매물 저장 결과가 0건입니다. 상태 및 DB 권한을 확인하세요.")
            success_count += 1

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
            notify_telegram(report)

        except Exception as e:
            # pending은 유지하여 다음 Actions 실행에서 동일 매물을 다시 분석할 수 있도록 합니다.
            failed_ids.append(str(prop["id"]))
            error_msg = (
                f"⚠️ [매물 분석 중 오류 발생]\n"
                f"매물 ID: {prop['id']}\n"
                f"오류 종류: {type(e).__name__}\n"
                f"오류 내용: {str(e)[:1000]}"
            )
            print(error_msg)
            notify_telegram(error_msg)

    print(f"실행 요약: 분석 성공 {success_count}건 / 분석 실패 {len(failed_ids)}건")
    if failed_ids:
        raise RuntimeError(
            f"분석 실패 {len(failed_ids)}건. pending 상태로 유지: {', '.join(failed_ids)}"
        )
    return success_count

# 6. 메인 실행 스위치
if __name__ == "__main__":
    try:
        process_new_properties()
    except Exception as exc:
        print(f"GitHub Actions 실패 보고: {type(exc).__name__}: {exc}")
        sys.exit(1)
