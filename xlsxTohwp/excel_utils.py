import pandas as pd
import re
import logging
import win32api
import sys
from tkinter import Tk
from tkinter import filedialog

def select_excel_file():
    # Create a file dialog for the user to choose an Excel file
    root = Tk()
    root.withdraw()  # Hide the root window
    file_path = filedialog.askopenfilename(
        title="엑셀 파일 선택",
        filetypes=[("Excel files", "*.xlsx *.xls")]
    )
    if not file_path:
        win32api.MessageBox(0, "파일이 선택되지 않았습니다.\n\n작업을 종료합니다.", "Error", 16)
        sys.exit(1)  # 파일이 선택되지 않았으면 프로세스 종료

    if file_path and not file_path.lower().endswith(('.xlsx', '.xls')):
        win32api.MessageBox(0, "잘못된 파일 형식입니다. 파일을 확인해 주세요.", "오류", 16)
        return None
    
    # If a valid Excel file is selected, return its path
    return file_path

# 칼럼 리스트 
def getColumnList() :
    selected_columns = [
        '국가코드', '공개번호', '출원일', '출원인', '공개일', 
        '법적상태', 'keywert family 문헌번호', '발명의 명칭', '요약', '독립항'
    ]
    return selected_columns

# 엑셀 데이터 불러오기
def load_excel_data(file_path):
    try:
        df = pd.read_excel(file_path)
        return df
    except Exception as e:
        logging.error("Failed to load Excel data from %s: %s", file_path, e)
        raise  # 예외를 다시 발생시켜 상위에서 처리하도록 함

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
            logging.warning("Claim text not found in the data.")
    return claim_text

def process_columns(df):
    try:
        selected_columns = getColumnList()
        check_missing_columns(selected_columns,df)
        df['keywert family 문헌번호'] = df['keywert family 문헌번호'].apply(family_code_extract)
        df['독립항'] = df['독립항'].apply(claim_text_extract)
        
        return df[selected_columns]
    except Exception as e:
        logging.error("Failed to process columns: %s", e)
        raise  # 예외를 다시 발생시켜 상위에서 처리하도록 함

    
def check_missing_columns(selected_columns,df):
    try:
        # 존재하지 않는 컬럼 확인
        missing_columns = [col for col in selected_columns if col not in df.columns]
        
        # 존재하지 않는 컬럼이 있으면 메시지 박스 출력
        if missing_columns:
            missing_cols_str = ', '.join(missing_columns)  # 리스트를 문자열로 변환
            message = f"엑셀 파일을 확인해주세요.\n\n미존재 칼럼명: \n[{missing_cols_str}]"
            win32api.MessageBox(0, message, "컬럼 확인", 64)
            sys.exit(1)
    except Exception as e:
        # 예외 발생 시 메시지 박스로 오류 알림
        logging.error("Failed to check_missing_columns : %s", e)
        raise  # 예외를 다시 발생시켜 상위에서 처리하도록 함

    
def inventionName_extract(data):
    pattern = r"\([^\u3131-\u3163\uac00-\ud7a3]+\)" 
    # 정규식을 사용하여 괄호 안의 영어 텍스트 제거
    cleaned_text = re.sub(pattern, "", data)
    return cleaned_text