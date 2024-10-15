
import re
def trns_func(data) :
    data = "US11814542B2, CN115679265A, US2023-0027265A1"
    # 1. 공백 제거
    data = data.replace(" ", "")
    # 2. 콤마로 데이터를 분리하고, 앞 두 글자만 추출
    codes = [item[:2] for item in data.split(',')]
    # 3. 중복 제거
    unique_codes = list(set(codes))
    # 4. 다시 문자열로 반환 (콤마로 구분)
    result = ', '.join(unique_codes)
    return result

# 청구항 삭제 함수
def claimText_extract(data):
    claim_text = ''
    result = re.search(r"\[청구항\d+\](.*?)\[청구항\d+", data, re.DOTALL)
    
    if result:
        claim_text = result.group(1).strip()  # 첫 번째 청구항 이후의 텍스트
        claim_text = re.sub(r"\[청구항\d+\]", "", claim_text)  # 청구항 부분 제거
    else:
        # 청구항이 하나인 경우를 처리
        single_claim = re.search(r"\[청구항\d+\](.*)", data, re.DOTALL)
        if single_claim:
            claim_text = single_claim.group(1).strip()
        else:
            print("청구항을 찾을 수 없습니다.")
    return claim_text