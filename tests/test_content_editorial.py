import unittest
from content_editorial import audit_copy,finalize_copy,COPY_KEYS

def valid_copy():
 def blog(topic):
  body=f'# {topic} 공간의 운영 조건을 비교하는 방법\n\n'
  body+=('서로 다른 운영 조건을 비교할 독자를 위한 도입입니다. 자료의 의미와 사업에 필요한 질문을 구체적으로 정리합니다.\n\n')*2
  for i in range(5):
   body+=f'## {topic} {i+1}번째 기준\n\n'
   body+=(f'{topic}에서는 주어진 자료와 목적을 연결해 판단합니다. 숫자의 의미를 설명하고 필요한 자료를 구분합니다. 설명은 한 문단에 모으지 않고 읽기 쉽게 나눕니다. 다음 상담에서 사용할 질문을 준비합니다.\n\n')*2
  return body
 # Distinct vocabularies to avoid the intentional duplicate-article guard.
 first=blog('제조').replace('자료','설비 목록').replace('운영','생산 공정')
 second='# 입출고와 보관 기능을 검토하는 순서\n\n'+'A distribution team starts by mapping operational needs before comparing available space.\n\n'+''.join(f'## Independent section {i}\n\n'+('Storage requirements should be compared with the available specification. Discuss loading movements and the required documentation before planning changes.\n\n')*2 for i in range(5))
 cards='\n\n'.join(f'[카드 {i}]\n공간의 핵심 질문 {i}\n사업에 필요한 기능과 동선을 정리하고 제공 조건과 비교해 보세요.' for i in range(1,6))+'\n\n※ 게시글 캡션\n별도 본문\n#지역 #매물 #공간 #사업 #자료 #스페이스픽'
 return dict(zip(COPY_KEYS,[first,second,cards]))
class Editorial(unittest.TestCase):
 def test_wall_of_text_and_missing_cards_are_not_finished(self):
  issues=audit_copy({'target_1_blog':'내용'*1000,'target_2_blog':'내용'*1000,'insta_caption':'카드 구성'})
  self.assertIn('target_1_blog:section_structure',issues);self.assertIn('blogs:too_similar',issues);self.assertIn('cards:five_ordered_cards',issues)
 def test_exactly_one_revision_and_analysis_fields_preserved(self):
  calls=[];original={'usp_summary':'source unchanged','showroom_concepts':[{'id':'keep'}],'target_1_blog':'bad'}
  def revise(copy,source,issues):calls.append((copy,source,issues));return valid_copy()
  result=finalize_copy(original,'source',revise)
  self.assertEqual(len(calls),1);self.assertEqual(result['usp_summary'],original['usp_summary']);self.assertEqual(result['showroom_concepts'],original['showroom_concepts']);self.assertEqual(result['_editorial']['status'],'ready')
 def test_failed_revision_stops_without_a_paid_loop(self):
  calls=[]
  def revise(*args):calls.append(1);raise RuntimeError('PRIVATE_PROVIDER_DETAIL')
  result=finalize_copy({},'source',revise)
  self.assertEqual(calls,[1]);self.assertEqual(result['_editorial']['status'],'needs_revision');self.assertNotIn('PRIVATE_PROVIDER_DETAIL',str(result))
 def test_escaped_newlines_normalized_and_no_revision_for_ready_copy(self):
  copy=valid_copy();self.assertEqual(audit_copy(copy),[])
  copy['target_1_blog']=copy['target_1_blog'].replace('\n','\\n')
  result=finalize_copy(copy,'',lambda *args:self.fail('unneeded revision'))
  self.assertEqual(result['_editorial']['status'],'ready');self.assertNotIn('\\n',result['target_1_blog'])
 def test_excessive_card_text_and_hype_are_flagged(self):
  copy=valid_copy();copy['insta_caption']=copy['insta_caption'].replace('공간의 핵심 질문 1','독점 급매 '+'가'*200)
  issues=audit_copy(copy);self.assertIn('copy:unsupported_superlative',issues);self.assertIn('cards:1:copy_length',issues)
