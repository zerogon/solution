import win32com.client as win32
import logging

# HWP 초기화 및 파일 열기
def init_hwp(filepath):
    try:
        HwpCtrl = win32.Dispatch('HWPFrame.HwpObject')
        HwpCtrl.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
        HwpCtrl.XHwpWindows.Item(0).Visible = True
        HwpCtrl.Open(filepath, "HWP", "")
        return HwpCtrl
    except Exception as e:
        logging.error("Failed to initialize HWP with file %s: %s", filepath, e)
        raise  # 예외를 다시 발생시켜 상위에서 처리하도록 함

def copy_table(hwp, count):
    try:
        hwp.HAction.GetDefault("Copy", hwp.HParameterSet.HSelectionOpt.HSet)
        hwp.HAction.Execute("Copy", hwp.HParameterSet.HSelectionOpt.HSet)

        for _ in range(count - 1):
            hwp.HAction.GetDefault("SelectNextPage", hwp.HParameterSet.HSelectionOpt.HSet)
            hwp.HAction.Execute("SelectNextPage", hwp.HParameterSet.HSelectionOpt.HSet)
            hwp.HAction.GetDefault("Paste", hwp.HParameterSet.HSelectionOpt.HSet)
            hwp.HAction.Execute("Paste", hwp.HParameterSet.HSelectionOpt.HSet)
    except Exception as e:
        logging.error("Failed to copy table in HWP: %s", e)
        raise  # 예외를 다시 발생시켜 상위에서 처리하도록 함

# 셀에 데이터 삽입
def set_cell_text(hwp, cell_position, text):
    try:
        hwp.SetPos(cell_position, 0, 0)
        hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
        hwp.HParameterSet.HInsertText.Text = text
        hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)
    except Exception as e:
        logging.error("Failed to set text in cell position %d: %s", cell_position, e)
        raise  # 예외를 다시 발생시켜 상위에서 처리하도록 함

def insert_image_to_hwp(hwp, ws, cpos, pos):
    try:
        # 특정 셀에서 그림 가져오기
        shapes = ws.shapes
        shape_found = False
        
        # 도형이 있는지 확인
        for shape in shapes:
            # 도형이 해당 셀에 속하는지 확인 (shape가 해당 셀의 좌상단에 있는지 확인)
            adj_cpos = cpos + 2
            if shape.api.TopLeftCell.Address[4:] == str(adj_cpos):
                shape.api.Copy()  # 도형을 복사
                shape_found = True
                break
        # 도형이 있으면 HWP에 붙여넣기
        if shape_found:
            hwp.SetPos(pos, 0, 0)
            hwp.HAction.GetDefault("Paste", hwp.HParameterSet.HSelectionOpt.HSet)
            hwp.HAction.Execute("Paste", hwp.HParameterSet.HSelectionOpt.HSet)
        else:
            logging.info(f"No shape found in cell position {cpos}, skipping image insertion.")
    
    except Exception as e:
        logging.error(f"Failed to set image in cell position {cpos}: {e}")
        raise

# HWP 파일에 데이터를 입력하는 함수
def insert_data_into_hwp(hwp, df, ws,selected_columns):
    try:
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
                row.국가코드, # 8
                row.공개번호, # 10
                row.출원일, # 12
                row.출원인, # 14
                row.공개일, # 16
                row.법적상태, #18
                row[7],  # 20 'keywert family 문헌번호', 
                row[8], # 24 '발명의 명칭'
                row.요약, # 27
                row.독립항 # 28
            ]
            
            # 각 셀에 데이터를 반복적으로 입력
            for pos, data in zip(cell_positions, row_data):
                if pos == cell_positions[8]:  # 요약은 이미지와 텍스트이므로 별도 처리
                    insert_image_to_hwp(hwp, ws, row.Index, pos)
                set_cell_text(hwp, pos, data)
    except Exception as e:
        logging.error("Failed to insert data into HWP: %s", e)
        raise  # 예외를 다시 발생시켜 상위에서 처리하도록 함

