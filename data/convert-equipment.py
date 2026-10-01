import pandas as pd
import glob
import json
import os

os.makedirs('data', exist_ok=True)

# 1. Cari file Excel Equipment Performance
files = glob.glob('data/Equipment Performance - RCA*.xlsx')
if len(files) == 0:
    files = glob.glob('Equipment Performance - RCA*.xlsx')

print(f"Mencoba membaca {len(files)} file Equipment Performance...")

equipment_data = {}

for file_path in files:
    filename = os.path.basename(file_path)
    tag_name = filename.split('RCA')[1].split(' ')[1].replace('.xlsx', '').strip()
    
    xls = pd.ExcelFile(file_path)
    
    # 1. Read Sheet: Equipment Info
    df_info = pd.read_excel(xls, sheet_name='Equipment Info')
    # Ganti NaN dengan string kosong
    df_info = df_info.fillna("")
    
    info_dict = {}
    for idx, row in df_info.iterrows():
        if str(row.iloc[0]).strip() != "":
            key = str(row.iloc[0]).strip()
            val = str(row.iloc[1]).strip()
            info_dict[key] = val
            
    # 2. Read Sheet: Condition History
    df_history = pd.read_excel(xls, sheet_name='Condition History')
    
    # Bersihkan nama kolom dari spasi dan newline (\n)
    df_history.columns = df_history.columns.str.replace('\n', ' ').str.strip()
    
    # Ganti nilai NaN/null dengan string kosong ""
    df_history = df_history.fillna("")
    
    if 'Date' in df_history.columns:
        # Konversi tanggal dengan penanganan aman
        df_history['Date'] = pd.to_datetime(df_history['Date'], errors='coerce').dt.strftime('%Y-%m-%d')
        df_history['Date'] = df_history['Date'].fillna("")
        
    history_list = df_history.to_dict(orient='records')
    
    # 3. Read Sheet: Performance Summary
    df_summary = pd.read_excel(xls, sheet_name='Performance Summary')
    df_summary = df_summary.fillna("")
    
    summary_dict = {}
    for idx, row in df_summary.iterrows():
        if str(row.iloc[0]).strip() != "":
            key = str(row.iloc[0]).strip()
            val = row.iloc[1]
            summary_dict[key] = val

    equipment_data[tag_name] = {
        "info": info_dict,
        "history": history_list,
        "summary": summary_dict
    }

# Export ke JSON
output_path = 'data/equipment-performance.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(equipment_data, f, indent=2, ensure_ascii=False)

print(f"Success")