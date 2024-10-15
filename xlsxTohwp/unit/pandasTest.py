import pandas as pd
import re

df = pd.read_excel('data/inputData_3input.xlsx')  # 엑셀 파일 경로

selected_columns = (['국가코드', '공개번호', '출원일', '출원인','공개일', 
                     '법적상태', 'keywert family 문헌번호', '발명의 명칭', '독립항' ])

# 패밀리 현황 추출함수
def familyCode_extract(data):
    data = data.replace(" ", "")
    # 앞 두 글자 코드 추출
    codes = [item[:2] for item in data.split(',')]
    unique_codes = list(set(codes))
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

# 출원인 칼럼에 변형 함수 적용
df['keywert family 문헌번호'] = df['keywert family 문헌번호'].apply(familyCode_extract)
df['독립항'] = df['독립항'].apply(claimText_extract)

# 선택한 칼럼에서 특정 행 가져오기 (예: 첫 번째 행)
row_index = 0  # 첫 번째 행 선택
row_data = df.loc[row_index, selected_columns]  # .loc는 레이블 기반으로 선택

# 하나씩 출력
# itertuples() 사용하여 반복
#for row in df[selected_columns].itertuples(index=True):
    #print(row[9])
