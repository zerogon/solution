import xlwings as xw
import win32com.client as win32

# 엑셀 파일 경로와 HWP 파일 경로 설정
excel_file_path = 'data/inputData_3input.xlsx'
hwp_file_path = r'C:\workspace\solution\xlsxTohwp\data\inputTable_null.hwp'
output_hwp_path = r'C:\workspace\solution\xlsxTohwp\output\output.hwp'

# 엑셀 파일 열기
wb = xw.Book(excel_file_path)
ws = wb.sheets[0]  # 첫 번째 시트 선택

# HWP 초기화 및 파일 열기
def init_hwp(filepath):
    hwp = win32.Dispatch('HWPFrame.HwpObject')
    hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    hwp.XHwpWindows.Item(0).Visible = True
    hwp.Open(filepath, "HWP", "")
    return hwp

# 그림을 HWP에 삽입하는 함수
def insert_image_to_hwp(hwp):
    # 특정 셀에서 그림 가져오기
    shapes = ws.shapes
    shapes[1].api.Copy()
    
    # HWP에 붙여넣기
    hwp.SetPos(27, 0, 0)
    hwp.HAction.GetDefault("Paste", hwp.HParameterSet.HSelectionOpt.HSet)
    hwp.HAction.Execute("Paste", hwp.HParameterSet.HSelectionOpt.HSet)


# HWP 객체 초기화
hwp = init_hwp(hwp_file_path)

# HWP에 이미지 삽입
insert_image_to_hwp(hwp)

# HWP 파일 저장
wb.close()