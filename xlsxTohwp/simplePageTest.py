import win32com.client as win32
import pandas as pd

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

# itertuples() 사용하여 반복  df[selected_columns].itertuples(index=True):
for row in df[selected_columns].itertuples(index=True):
    if row.Index == 1 :
        break;
    #1
    HwpCtrl.SetPos(8,0,0) # 셀 위치 조정
    HwpCtrl.Run("SelectAll") # 셀 선택
    HwpCtrl.HAction.GetDefault("Delete", HwpCtrl.HParameterSet.HSelectionOpt.HSet)
    HwpCtrl.HAction.Execute("Delete", HwpCtrl.HParameterSet.HSelectionOpt.HSet)

    HwpCtrl.HAction.GetDefault("InsertText", HwpCtrl.HParameterSet.HInsertText.HSet)
    HwpCtrl.HParameterSet.HInsertText.Text = row.국가코드
    HwpCtrl.HAction.Execute("InsertText", HwpCtrl.HParameterSet.HInsertText.HSet)
