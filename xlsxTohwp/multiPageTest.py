import win32com.client as win32
import pandas as pd
import time
start_time = time.time()

filepath = r'C:\workspace\solution\xlsxTohwp\data\inputTable.hwp'
outputpath = r'C:\workspace\solution\xlsxTohwp\output\output.hwp'

df = pd.read_excel('data/inputData.xlsx')  # 엑셀 파일 경로

selected_columns = ['국가코드', '공개번호', '출원일', '출원인',
                     '공개일', '법적상태', '특허인용 국가', '발명의 명칭',
                      '독립항' ]

row_data = df.loc[0, selected_columns]  #  첫 번째 행 가져오기

HwpCtrl = win32.Dispatch('HWPFrame.HwpObject')
HwpCtrl.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
HwpCtrl.XHwpWindows.Item(0).Visible = True  # 한글 창 보이기
HwpCtrl.Open(filepath,"HWP","") # 기존 HWP 파일 열기

HwpCtrl.HAction.GetDefault("Copy", HwpCtrl.HParameterSet.HSelectionOpt.HSet)
HwpCtrl.HAction.Execute("Copy", HwpCtrl.HParameterSet.HSelectionOpt.HSet)

#100개 표 생성
for _ in range(99):
    HwpCtrl.HAction.GetDefault("SelectNextPage", HwpCtrl.HParameterSet.HSelectionOpt.HSet)
    HwpCtrl.HAction.Execute("SelectNextPage", HwpCtrl.HParameterSet.HSelectionOpt.HSet)
    HwpCtrl.HAction.GetDefault("Paste", HwpCtrl.HParameterSet.HSelectionOpt.HSet)
    HwpCtrl.HAction.Execute("Paste", HwpCtrl.HParameterSet.HSelectionOpt.HSet)

end_time = time.time()
elapsed_time = end_time - start_time  # 소요 시간 계산

# 소요 시간 출력
print(f"100개의 테이블 생성 소요 시간: {elapsed_time:.2f} 초")