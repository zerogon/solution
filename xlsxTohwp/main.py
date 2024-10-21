from excel_utils import load_excel_data, process_columns, getColumnList, select_excel_file
from hwp_utils import init_hwp, copy_table, insert_data_into_hwp
import xlwings as xw
import logging
import time
import win32api
from datetime import datetime
import os
# PyInstaller에서 실행할 때 올바른 경로를 얻기 위한 함수
def resource_path(relative_path):
    base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# 로그 설정
log_file_path = resource_path(os.path.join('logs', f'error_{datetime.today().year}{datetime.today().month}{datetime.today().day}.log'))
logging.basicConfig(
    filename=log_file_path,
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
#output_hwp_path = r"C:\workspace\solution\xlsxTohwp\output\output_"+f"{datetime.today().year}{datetime.today().month}{datetime.today().day}"+".hwp"
hwp_file_path = resource_path('data/inputTable.hwp')
output_hwp_path = resource_path(f"output/output_{datetime.today().year}{datetime.today().month}{datetime.today().day}.hwp")

start_time = time.time()
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

end_time = time.time()
elapsed_time = end_time - start_time
win32api.MessageBox(0, f"작업이 성공적으로 완료되었습니다.\n\n총 건수: {data_count}", "end", 64)

# 소요 시간 출력
print(f"{data_count}개의 테이블 생성 소요 시간: {elapsed_time:.2f} 초")