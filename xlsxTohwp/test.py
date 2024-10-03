import win32com.client as win32
import pandas as pd

filepath = r'C:\workspace\xlsxTohwp\data\output.hwp'
outputpath = r'C:\workspace\xlsxTohwp\output\test.hwp'

# 한글 파일 열기
hwp = win32.Dispatch("HWPFrame.HwpObject")
hwp.XHwpWindows.Item(0).Visible = True  # 한글 창 보이기
hwp.Open(filepath,"HWP","") # 기존 HWP 파일 열기
hwp.Run("TableCellBlock")
hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
hwp.HParameterSet.HInsertText.Text = "test test test"
hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)
hwp.SaveAs("test.hwp","HWP","download:true")