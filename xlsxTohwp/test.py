import win32com.client as win32
import pandas as pd

filepath = r'C:\workspace\solution\xlsxTohwp\data\inputTable.hwp'
outputpath = r'C:\workspace\solution\xlsxTohwp\output\output.hwp'

df = pd.read_excel('data/inputData.xlsx')  # 엑셀 파일 경로

hwp = win32.Dispatch('HWPFrame.HwpObject')
hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
hwp.XHwpWindows.Item(0).Visible = True  # 한글 창 보이기
hwp.Open(filepath,"HWP","") # 기존 HWP 파일 열기

hwp.Run("TableCellBlock")
hwp.Run("TableDeleteCell") 
hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
hwp.HParameterSet.HInsertText.Text = "tes"
hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)
hwp.SaveAs(outputpath,"HWP","")