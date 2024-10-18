from excel_utils import load_excel_data, process_columns, getColumnList
from hwp_utils import init_hwp, copy_table, insert_data_into_hwp
import xlwings as xw
import logging
import time

# 로그 설정
logging.basicConfig(
    filename=r'C:\workspace\solution\xlsxTohwp\logs\error_log.txt',  # 로그 파일 경로
    level=logging.ERROR,
    format='%(asctime)s:%(levelname)s:%(message)s'
)

start_time = time.time()

# 파일 경로 설정
input_excel_path = 'data/inputData.xlsx'
hwp_file_path = r'C:\workspace\solution\xlsxTohwp\data\inputTable_null.hwp'
output_hwp_path = r'C:\workspace\solution\xlsxTohwp\output\output.hwp'

    
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

# 소요 시간 출력
print(f"{data_count}개의 테이블 생성 소요 시간: {elapsed_time:.2f} 초")