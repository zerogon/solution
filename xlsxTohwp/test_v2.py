from pyhwpx import Hwp
import pandas as pd

filepath = r'C:\workspace\solution\xlsxTohwp\data\inputTable.hwp'
outputpath = r'C:\workspace\solution\xlsxTohwp\output\output.hwp'

df = pd.read_excel('data/inputData.xlsx')  # 엑셀 파일 경로

hwp = Hwp()
hwp.Open(filepath)
hwp.set_pos(0,0,1)
hwp.SelectAll()
hwp.Delete()
