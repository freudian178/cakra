import pandas as pd
import json
import os

# 1. Pastikan folder 'data' sudah ada
os.makedirs('data', exist_ok=True)

# 2. Nama file Excel (sesuaikan dengan nama file di laptopmu)
file_excel = 'Incident Database.xlsx'  

# 3. Baca Sheet 2: 'Incident Database'
# pandas akan membaca baris header di A3/A4 secara otomatis
df = pd.read_excel(file_excel, sheet_name='Incident Database')

# Bersihkan nama kolom dari spasi berlebih
df.columns = df.columns.str.strip()

# 4. Filter atau pilih kolom-kolom utama yang kita butuhkan untuk web dashboard
# Mengubah nama kolom agar bersih untuk JSON (snake_case)
rename_map = {
    'MTO No.': 'mto_no',
    'AR No.': 'ar_no',
    'Plant': 'plant',
    'Tag Number': 'equipment_tag',
    'Eq. Class': 'class_category',
    'Date of Occur.': 'date_occurrence',
    'Risk Case Title': 'risk_title',
    'Risk Score': 'risk_score_static',
    'PIC (RCA)': 'pic',
    'Overall Status': 'overall_status',
    'Discipline': 'discipline',
    'Eq. Type': 'equipment_type',
    'Component': 'component',
    'F Mechanism': 'failure_mechanism',
    'Downtime (hrs)': 'downtime_hours',
    'Act. Loss (k US$)': 'act_loss_k_usd',
    'Pot. Loss (k US$)': 'pot_loss_k_usd',
    'Total Loss (k US$)': 'total_loss_k_usd',
    'RCA Due': 'rca_due_date'
}

# Terapkan rename jika kolom tersebut ada di Excel
df_clean = df.rename(columns=rename_map)

# 5. Tambahkan kalkulasi Total Loss dalam nominal Dollar riil ($)
# Nilai di Excel dalam k US$ (ribuan), jadi dikali 1000 agar nilai Dolar-nya utuh di web
if 'total_loss_k_usd' in df_clean.columns:
    df_clean['total_loss_usd'] = df_clean['total_loss_k_usd'] * 1000
elif 'act_loss_k_usd' in df_clean.columns:
    df_clean['total_loss_usd'] = df_clean['act_loss_k_usd'] * 1000

# Ubah format tanggal menjadi format string YYYY-MM-DD agar mudah dibaca di JavaScript
date_cols = ['date_occurrence', 'rca_due_date']
for col in date_cols:
    if col in df_clean.columns:
        df_clean[col] = pd.to_datetime(df_clean[col], errors='coerce').dt.strftime('%Y-%m-%d')

# 6. Ekspor 380 record data ini ke file data/incident-summary.json
output_path = 'data/incident-summary.json'
df_clean.to_json(output_path, orient='records', indent=2)

print(f"Success")