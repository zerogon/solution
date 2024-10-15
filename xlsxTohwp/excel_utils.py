import pandas as pd
import re

# 칼럼 리스트 
def getColumnList() :
    selected_columns = [
        '국가코드', '공개번호', '출원일', '출원인', '공개일', 
        '법적상태', 'keywert family 문헌번호', '발명의 명칭', '요약', '독립항'
    ]
    return selected_columns

# 엑셀 데이터 불러오기
def load_excel_data(file_path):
    df = pd.read_excel(file_path)
    return df

# 필요한 칼럼 선택 및 데이터 처리
def family_code_extract(data):
    data = data.replace(" ", "")
    codes = [item[:2] for item in data.split(',')]
    unique_codes = list(set(codes))
    return ', '.join(unique_codes)

def claim_text_extract(data):
    claim_text = ''
    result = re.search(r"\[청구항\d+\](.*?)\[청구항\d+", data, re.DOTALL)
    
    if result:
        claim_text = result.group(1).strip()
        claim_text = re.sub(r"\[청구항\d+\]", "", claim_text)
    else:
        single_claim = re.search(r"\[청구항\d+\](.*)", data, re.DOTALL)
        if single_claim:
            claim_text = single_claim.group(1).strip()
        else:
            print("청구항을 찾을 수 없습니다.")
    return claim_text

def process_columns(df):
    selected_columns = getColumnList()
    
    df['keywert family 문헌번호'] = df['keywert family 문헌번호'].apply(family_code_extract)
    df['독립항'] = df['독립항'].apply(claim_text_extract)
    
    return df[selected_columns]
