import xlwings as xw
import logging
import win32api
from datetime import datetime
import os
import pandas as pd
import re
import sys
from tkinter import Tk, filedialog
import win32com.client as win32

# HWP 초기화 및 파일 열기
def init_hwp(filepath):
    try:
        HwpCtrl = win32.Dispatch('HWPFrame.HwpObject')
        HwpCtrl.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
        HwpCtrl.XHwpWindows.Item(0).Visible = True
        HwpCtrl.Open(filepath, "HWP", "")
        return HwpCtrl
    except Exception as e:
        logging.error("Failed to initialize HWP with file %s: %s", filepath, e)
        raise  # 예외를 다시 발생시켜 상위에서 처리하도록 함

def copy_table(hwp, count):
    try:
        hwp.HAction.GetDefault("Copy", hwp.HParameterSet.HSelectionOpt.HSet)
        hwp.HAction.Execute("Copy", hwp.HParameterSet.HSelectionOpt.HSet)

        for _ in range(count - 1):
            hwp.HAction.GetDefault("SelectNextPage", hwp.HParameterSet.HSelectionOpt.HSet)
            hwp.HAction.Execute("SelectNextPage", hwp.HParameterSet.HSelectionOpt.HSet)
            hwp.HAction.GetDefault("Paste", hwp.HParameterSet.HSelectionOpt.HSet)
            hwp.HAction.Execute("Paste", hwp.HParameterSet.HSelectionOpt.HSet)
    except Exception as e:
        logging.error("Failed to copy table in HWP: %s", e)
        raise  # 예외를 다시 발생시켜 상위에서 처리하도록 함

# 셀에 데이터 삽입
def set_cell_text(hwp, cell_position, text):
    try:
        hwp.SetPos(cell_position, 0, 0)
        hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
        hwp.HParameterSet.HInsertText.Text = text
        hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)
    except Exception as e:
        logging.error("Failed to set text in cell position %d: %s", cell_position, e)
        raise  # 예외를 다시 발생시켜 상위에서 처리하도록 함

def insert_image_to_hwp(hwp, ws, cpos, pos):
    try:
        # 특정 셀에서 그림 가져오기
        shapes = ws.shapes
        shape_found = False
        
        # 도형이 있는지 확인
        for shape in shapes:
            # 도형이 해당 셀에 속하는지 확인 (shape가 해당 셀의 좌상단에 있는지 확인)
            adj_cpos = cpos + 2
            if shape.api.TopLeftCell.Address[4:] == str(adj_cpos):
                shape.api.Copy()  # 도형을 복사
                shape_found = True
                break
        # 도형이 있으면 HWP에 붙여넣기
        if shape_found:
            hwp.SetPos(pos, 0, 0)
            hwp.HAction.GetDefault("Paste", hwp.HParameterSet.HSelectionOpt.HSet)
            hwp.HAction.Execute("Paste", hwp.HParameterSet.HSelectionOpt.HSet)
        else:
            logging.info(f"No shape found in cell position {cpos}, skipping image insertion.")
    
    except Exception as e:
        logging.error(f"Failed to set image in cell position {cpos}: {e}")
        raise

# HWP 파일에 데이터를 입력하는 함수
def insert_data_into_hwp(hwp, df, ws,selected_columns):
    try:
        for row in df[selected_columns].itertuples(index=True):
            # 각 행마다 시작 위치를 30씩 증가시키기 위해 계산
            start_position = 8 + (row.Index) * 30  # 첫 번째 행에서 시작
            cell_positions = [
                start_position,               # 8, 38, ...
                start_position + 2,           # 10, 40, ...
                start_position + 4,           # 12, 42, ...
                start_position + 6,           # 14, 44, ...
                start_position + 8,           # 16, 46, ...
                start_position + 10,          # 18, 48, ...
                start_position + 12,          # 20, 50, ...
                start_position + 16,          # 24, 54, ...
                start_position + 19,          # 27, 57, ...
                start_position + 20           # 28, 58, ...
            ]
            
            row_data = [
                row.국가코드, # 8
                row.공개번호, # 10
                row.출원일, # 12
                row.출원인, # 14
                row.공개일, # 16
                row.법적상태, #18
                row[7],  # 20 'keywert family 문헌번호', 
                row[8], # 24 '발명의 명칭'
                row.요약, # 27
                row.독립항 # 28
            ]
            
            # 각 셀에 데이터를 반복적으로 입력
            for pos, data in zip(cell_positions, row_data):
                if pos == cell_positions[8]:  # 요약은 이미지와 텍스트이므로 별도 처리
                    insert_image_to_hwp(hwp, ws, row.Index, pos)
                set_cell_text(hwp, pos, data)
    except Exception as e:
        logging.error("Failed to insert data into HWP: %s", e)
        raise  # 예외를 다시 발생시켜 상위에서 처리하도록 함


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

def resource_path(relative_path):
    base_path = os.path.abspath('.')
    return os.path.join(base_path, relative_path)

# 로그 설정
log_file_path = resource_path(os.path.join('logs', f'error_{datetime.today().year}{datetime.today().month}{datetime.today().day}.log'))
logging.basicConfig(
    filename=log_file_path,
    level=logging.ERROR,
    format='%(asctime)s:%(levelname)s:%(message)s'
)

win32api.MessageBox(0, f"엑셀 파일 선택 후, 완료 메세지를 기다려주세요.", "start", 64)

input_excel_path = select_excel_file()

hwp_file_path = resource_path('data/inputTable.hwp')
output_hwp_path = resource_path(f"output/output_{datetime.today().year}{datetime.today().month}{datetime.today().day}.hwp")

try:
    # Excel 작업
    with xw.App(visible=False) as app:  # 앱 실행시 화면 숨기기
        wb = app.books.open(input_excel_path)
        ws = wb.sheets[0]  # 첫 번째 시트 선택

        # 엑셀 데이터 불러오기 및 처리
        df = load_excel_data(input_excel_path)
        df = process_columns(df)  # 필요한 칼럼 처리

        # HWP 작업
        hwp = init_hwp(hwp_file_path)
        data_count = df.shape[0]
        copy_table(hwp, data_count)
        insert_data_into_hwp(hwp, df, ws, getColumnList())

        # 작업 완료 후 저장 및 종료
        hwp.SaveAs(output_hwp_path, "HWP", "")
        wb.close()
        hwp.Quit()

except Exception as e:
    logging.error("An error occurred: %s", e)

win32api.MessageBox(0, f"작업이 성공적으로 완료되었습니다.\n\n총 건수: {data_count}", "end", 64)
