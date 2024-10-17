import win32com.client as win32
import logging
import os

# HWP 초기화 및 파일 열기
def init_hwp(filepath):
    HwpCtrl = win32.Dispatch('HWPFrame.HwpObject')
    HwpCtrl.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    HwpCtrl.XHwpWindows.Item(0).Visible = True
    HwpCtrl.Open(filepath, "HWP", "")
    return HwpCtrl

def copy_table(hwp, count):
    hwp.HAction.GetDefault("Copy", hwp.HParameterSet.HSelectionOpt.HSet)
    hwp.HAction.Execute("Copy", hwp.HParameterSet.HSelectionOpt.HSet)

    for _ in range(count - 1):
        hwp.HAction.GetDefault("SelectNextPage", hwp.HParameterSet.HSelectionOpt.HSet)
        hwp.HAction.Execute("SelectNextPage", hwp.HParameterSet.HSelectionOpt.HSet)
        hwp.HAction.GetDefault("Paste", hwp.HParameterSet.HSelectionOpt.HSet)
        hwp.HAction.Execute("Paste", hwp.HParameterSet.HSelectionOpt.HSet)

# 셀에 데이터 삽입
def set_cell_text(hwp, cell_position, text):
    hwp.SetPos(cell_position, 0, 0)
    hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
    hwp.HParameterSet.HInsertText.Text = text
    hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)

# HWP 파일에 데이터를 입력하는 함수
def insert_data_into_hwp(hwp, df, selected_columns):
    for row in df[selected_columns].itertuples(index=True):
        # 각 행마다 시작 위치를 30씩 증가시키기 위해 계산
        start_position = 8 + (row.Index) * 30  # 첫 번째 행에서 시작
        cell_positions = [
            start_position,               # 8, 38, ...
            start_position + 2,           # 10, 40, ...
            start_position + 4,           # 12, 42, ...
            start_position + 6,           # 14, 44, ...
            start_position + 8,           # 16, 46, ...
            start_position + 10,          # 18, 48, ...
            start_position + 12,          # 20, 50, ...
            start_position + 16,          # 24, 54, ...
            start_position + 19,          # 27, 57, ...
            start_position + 20           # 28, 58, ...
        ]
        
        row_data = [
            row.국가코드,
            row.공개번호,
            row.출원일,
            row.출원인,
            row.공개일,
            row.법적상태,
            row[7],  # 'keywert family 문헌번호',
            row[8], #  '발명의 명칭'
            row.요약,
            row.독립항
        ]
        
        # 각 셀에 데이터를 반복적으로 입력
        for pos, data in zip(cell_positions, row_data):
            set_cell_text(hwp, pos, data)

