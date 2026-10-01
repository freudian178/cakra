import pandas as pd
import glob
import json
import os

os.makedirs('data', exist_ok=True)

# 1. Cari file Excel Production Data di folder 'data/' atau root
files = glob.glob('data/Production Data - RCA*.xlsx')
if len(files) == 0:
    files = glob.glob('Production Data - RCA*.xlsx')

print(f"Mencoba membaca {len(files)} file Production Data...")

production_data = {}

for file_path in files:
    filename = os.path.basename(file_path)
    # Ekstrak Tag Name (e.g. 'PU-2101B')
    tag_name = filename.split('RCA')[1].split(' ')[1].replace('.xlsx', '').strip()
    
    xls = pd.ExcelFile(file_path)
    
    # 1. Read Sheet 1: PI Tag (Metadata Sensor)
    df_tag = pd.read_excel(xls, sheet_name='PI Tag').fillna("")
    df_tag.columns = df_tag.columns.str.strip()
    tag_meta_list = df_tag.to_dict(orient='records')
    
    # 2. Read Sheet 2: Time Series Data per Jam
    # Nama sheet bisa 'Sheet2' atau sheet indeks ke-1
    sheet_two_name = xls.sheet_names[1] if len(xls.sheet_names) > 1 else 'Sheet2'
    df_series = pd.read_excel(xls, sheet_name=sheet_two_name).fillna("")
    df_series.columns = df_series.columns.str.strip()
    
    # Konversi format Timestamp ke string YYYY-MM-DD HH:MM:SS
    if 'Timestamp' in df_series.columns:
        df_series['Timestamp'] = pd.to_datetime(df_series['Timestamp'], errors='coerce').dt.strftime('%Y-%m-%d %H:%M:%S')
        df_series['Timestamp'] = df_series['Timestamp'].fillna("")
        
    series_list = df_series.to_dict(orient='records')

    production_data[tag_name] = {
        "tag_metadata": tag_meta_list,
        "time_series": series_list
    }

# Export ke file JSON
output_path = 'data/production-data.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(production_data, f, indent=2, ensure_ascii=False)

print(f"Success")