import win32com.client as win32
import pandas as pd

filepath = r'C:\workspace\solution\xlsxTohwp\data\inputTable.hwp'
outputpath = r'C:\workspace\solution\xlsxTohwp\output\output.hwp'

df = pd.read_excel('data/inputData.xlsx')  # 엑셀 파일 경로

# 필요한 칼럼 선택
selected_columns = ['국가코드', '공개번호', '출원일', '출원인', '공개일', '법적상태', '특허인용 국가', '발명의 명칭', '독립항']

# HWP 초기화 및 파일 열기
def init_hwp(filepath):
    HwpCtrl = win32.Dispatch('HWPFrame.HwpObject')
    HwpCtrl.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    HwpCtrl.XHwpWindows.Item(0).Visible = True
    HwpCtrl.Open(filepath, "HWP", "")
    return HwpCtrl

# 셀의 위치 설정, 텍스트 입력 및 삭제 작업을 하나의 함수로 통합
def set_cell_text(hwp, cell_position, text):
    hwp.SetPos(cell_position, 0, 0)  # 셀 위치 조정
    hwp.Run("SelectAll")  # 셀 선택
    hwp.HAction.GetDefault("Delete", hwp.HParameterSet.HSelectionOpt.HSet)
    hwp.HAction.Execute("Delete", hwp.HParameterSet.HSelectionOpt.HSet)
    hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
    hwp.HParameterSet.HInsertText.Text = text
    hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)

# HWP 파일에 데이터를 입력하는 함수
def insert_data_into_hwp(hwp, df, selected_columns):
    # 각 행에 대해 반복하면서 데이터 입력
    for row in df[selected_columns].itertuples(index=True):
        if row.Index == 1:  # 특정 조건에 따른 종료
            break
        
        cell_positions = [8, 10, 12, 14, 16, 18, 20, 24, 28]
        row_data = [
            row.국가코드, row.공개번호, row.출원일, row.출원인,
            row.공개일, row.법적상태, row[7], row[8], row.독립항
        ]
        
        # 각 셀에 데이터를 반복적으로 입력
        for pos, data in zip(cell_positions, row_data):
            set_cell_text(hwp, pos, data)

# HWP 객체 초기화
hwp = init_hwp(filepath)

# 데이터 입력
insert_data_into_hwp(hwp, df, selected_columns)

# 저장
hwp.SaveAs(outputpath, "HWP", "")