import win32com.client as win32
import pandas as pd

filepath = r'C:\workspace\solution\xlsxTohwp\data\inputTable.hwp'
outputpath = r'C:\workspace\solution\xlsxTohwp\output\output.hwp'

df = pd.read_excel('data/inputData.xlsx')  # 엑셀 파일 경로

HwpCtrl = win32.Dispatch('HWPFrame.HwpObject')
HwpCtrl.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
HwpCtrl.XHwpWindows.Item(0).Visible = True  # 한글 창 보이기
HwpCtrl.Open(filepath,"HWP","") # 기존 HWP 파일 열기

HwpCtrl.SetPos(8,0,0) # 셀 위치 조정

HwpCtrl.Run("SelectAll") # 셀 선택

HwpCtrl.HAction.GetDefault("Delete", HwpCtrl.HParameterSet.HSelectionOpt.HSet)
HwpCtrl.HAction.Execute("Delete", HwpCtrl.HParameterSet.HSelectionOpt.HSet)

HwpCtrl.HAction.GetDefault("InsertText", HwpCtrl.HParameterSet.HInsertText.HSet)
HwpCtrl.HParameterSet.HInsertText.Text = "Test insert 1"
HwpCtrl.HAction.Execute("InsertText", HwpCtrl.HParameterSet.HInsertText.HSet)

HwpCtrl.SetPos(10,0,0)

HwpCtrl.Run("SelectAll")

HwpCtrl.HAction.GetDefault("Delete", HwpCtrl.HParameterSet.HSelectionOpt.HSet)
HwpCtrl.HAction.Execute("Delete", HwpCtrl.HParameterSet.HSelectionOpt.HSet)

HwpCtrl.HAction.GetDefault("InsertText", HwpCtrl.HParameterSet.HInsertText.HSet)
HwpCtrl.HParameterSet.HInsertText.Text = "Test insert 2"
HwpCtrl.HAction.Execute("InsertText", HwpCtrl.HParameterSet.HInsertText.HSet)
