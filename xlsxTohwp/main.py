import pandas as pd
from excel_utils import load_excel_data, process_columns, getColumnList
from hwp_utils import init_hwp, copy_table, insert_data_into_hwp
import time
start_time = time.time()

# 파일 경로 설정
input_excel_path = 'data/inputData_3input.xlsx'
hwp_file_path = r'C:\workspace\solution\xlsxTohwp\data\inputTable_null.hwp'
output_hwp_path = r'C:\workspace\solution\xlsxTohwp\output\output.hwp'

# 엑셀 데이터 불러오기 및 처리
df = load_excel_data(input_excel_path)
df = process_columns(df)

# HWP 객체 초기화
hwp = init_hwp(hwp_file_path)

# HWP 파일에 데이터 삽입
data_count = df.shape[0]
copy_table(hwp, data_count)
insert_data_into_hwp(hwp, df, getColumnList())

end_time = time.time()
elapsed_time = end_time - start_time  # 소요 시간 계산

# 소요 시간 출력
print(f"{data_count}개의 테이블 생성 소요 시간: {elapsed_time:.2f} 초")