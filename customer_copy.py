"""Customer prose formatting; source records and verification are never changed."""
import re

PUBLIC_COPY_FIELDS=('usp_summary','landing_copy','target_1_blog','target_2_blog','insta_caption')
LABELS={
    '사실조건':'제공자료에 따르면 ',
    '사실주장':'제공자료에 따르면 ',
    '제공정보':'제공자료에 따르면 ',
    '제공주장':'제공자 설명에 따르면 ',
    '활용가설':'활용 방향은 검토 단계입니다. ',
}
MARKER=re.compile(r'\[\s*(사실\s*조건|사실\s*주장|제공\s*정보|제공\s*주장|활용\s*가설)\s*\][ \t]*')


def customer_prose(value):
    if not isinstance(value,str):
        return ''
    return MARKER.sub(lambda match:LABELS[re.sub(r'\s','',match.group(1))],value)


def prepare_customer_copy(package):
    result=dict(package)
    originals=dict(result.get('_copy_original',{})) if isinstance(result.get('_copy_original'),dict) else {}
    for field in PUBLIC_COPY_FIELDS:
        value=result.get(field)
        if not isinstance(value,str):
            continue
        prose=customer_prose(value)
        if prose!=value:
            originals.setdefault(field,value)
            result[field]=prose
    if originals:
        result['_copy_original']=originals
    return result
