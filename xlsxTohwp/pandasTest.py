import pandas as pd

df = pd.read_excel('data/inputData.xlsx')  # 엑셀 파일 경로

selected_columns = ['국가코드', '공개번호', '출원일', '출원인',
                     '공개일', '법적상태', '특허인용 국가', '발명의 명칭',
                      '독립항' ]

# 선택한 칼럼에서 특정 행 가져오기 (예: 첫 번째 행)
row_index = 0  # 첫 번째 행 선택
row_data = df.loc[row_index, selected_columns]  # .loc는 레이블 기반으로 선택

# 하나씩 출력
# itertuples() 사용하여 반복
for row in df[selected_columns].itertuples(index=True):
    if row.Index == 1 :
        break;
    print(row[7])
