from excel_utils import load_excel_data, process_columns, getColumnList, select_excel_file
from hwp_utils import init_hwp, copy_table, insert_data_into_hwp
import xlwings as xw
import logging
import time
import win32api
from datetime import datetime
import os

# 로그 설정
logging.basicConfig(
    filename=r'C:\workspace\solution\xlsxTohwp\logs\error_'+f"{datetime.today().year}{datetime.today().month}{datetime.today().day}"+".log",
    level=logging.ERROR,
    format='%(asctime)s:%(levelname)s:%(message)s'
)

win32api.MessageBox(0, f"엑셀 파일 선택 후, 완료 메세지를 기다려주세요.", "start", 64)


#input_hwp_path = os.path.join("data", "inputTable.hwp")
#output_hwp_path = os.path.join("output", "output.hwp")
# 파일 경로 설정
# input_excel_path = 'data/inputData_3input.xlsx'
input_excel_path = select_excel_file()

#hwp_file_path = r'C:\workspace\solution\xlsxTohwp\data\inputTable_null.hwp'
hwp_file_path = os.path.join("data", "inputTable_null.hwp")
output_hwp_path = r"C:\workspace\solution\xlsxTohwp\output\output_"+f"{datetime.today().year}{datetime.today().month}{datetime.today().day}"+".hwp"

start_time = time.time()
try:
    wb = xw.Book(input_excel_path)
    ws = wb.sheets[0]  # 첫 번째 시트 선택
    # 엑셀 데이터 불러오기 및 처리
    df = load_excel_data(input_excel_path)
    # 패밀리현황, 청구항 삭제
    df = process_columns(df)

    # HWP 객체 초기화
    hwp = init_hwp(hwp_file_path)

    # HWP 파일에 데이터 삽입
    data_count = df.shape[0]
    copy_table(hwp, data_count)
    insert_data_into_hwp(hwp, df, ws, getColumnList())
except Exception as e:
    logging.error("An error occurred in main.py: %s", e)

end_time = time.time()
elapsed_time = end_time - start_time  # 소요 시간 계산
hwp.SaveAs(output_hwp_path, "HWP", "")
wb.close()
hwp.Quit()
win32api.MessageBox(0, f"작업이 성공적으로 완료되었습니다.\noutput 폴더를 확인하세요.\n\n총 건수: {data_count}", "end", 64)

# 소요 시간 출력
print(f"{data_count}개의 테이블 생성 소요 시간: {elapsed_time:.2f} 초")