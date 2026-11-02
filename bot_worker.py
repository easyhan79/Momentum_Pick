import os
import json
import requests
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

# 2. 최신 클라이언트 방식으로 API 키 연결
client = genai.Client(api_key=GEMINI_KEY)

def send_telegram(msg):
    url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
    requests.post(url, json={"chat_id": TG_CHAT_ID, "text": msg, "parse_mode": "Markdown"})

def process_new_properties():
    # DB에서 아직 분석 안 된 신규 매물('pending') 가져오기
    res = supabase.table("properties").select("*").eq("status", "pending").execute()
    
    if not res.data:
        print("신규 매물이 없습니다. 기존 매물 재가공 홍보 모드로 전환합니다.")
        return False

    for prop in res.data:
        raw_text = prop["raw_input"]
        
        # Gemini AI에게 상권·입지 분석 및 3종 마케팅 패키지 생성 명령
        prompt = f"""
        당신은 대한민국 최고의 상업용 부동산 및 토지 마케팅 디렉터입니다.
        사장님이 입력한 아래 매물 정보를 분석하여 JSON 형식으로 마케팅 패키지를 생성하세요.

        [입력된 매물 정보]
        {raw_text}

        [출력 JSON 스키마]
        {{
          "usp_summary": "핵심 셀링 포인트 3줄 요약",
          "target_1_blog": "타겟 1(예: 카페/프랜차이즈 창업자) 맞춤형 네이버 블로그 포스팅 제목과 본문",
          "target_2_blog": "타겟 2(예: 학원/키즈/교육업) 맞춤형 네이버 블로그 포스팅 제목과 본문",
          "insta_caption": "인스타그램 카드뉴스 5장 문구 및 핵심 해시태그 15개",
          "landing_copy": "전용 웹 쇼룸 헤드라인 및 수익률/입지 브리핑 문구"
        }}
        """
        
        # 3. 최신 3.8 Flash 모델 적용 및 JSON 출력 설정
        response = client.models.generate_content(
            model='gemini-3.8-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            )
        )
        
        ai_result = json.loads(response.text)

        # Supabase DB에 생성된 마케팅 콘텐츠 저장 및 상태 변경
        supabase.table("properties").update({
            "ai_contents": ai_result,
            "status": "analyzed",
            "post_count": 1
        }).eq("id", prop["id"]).execute()

        # 사장님 텔레그램으로 완료 보고서 즉시 전송
        report = (
            f"✅ **[신규 매물 분석 및 홍보물 생성 완료]**\n\n"
            f"📌 **입력 매물:** {raw_text}\n\n"
            f"💡 **핵심 셀링 포인트:**\n{ai_result['usp_summary']}\n\n"
            f"📝 **인스타 캡션 미리보기:**\n{ai_result['insta_caption'][:200]}...\n\n"
            f"🚀 *웹 쇼룸 배포 및 블로그 스케줄링 대기열에 등록되었습니다.*"
        )
        send_telegram(report)
    return True
