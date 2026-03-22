import os
import pandas as pd
import psycopg2
import subprocess
import re
from datetime import datetime

# Dashboard ka source folder
SAVE_DIR = "./source"

# ==========================================
# 1. DATABASE CREDENTIALS
# ==========================================
DB_CONFIG = {
    "PKG1": {
        "host": "10.92.12.212", 
        "port": "6657", 
        "dbname": "mdm_app_db", 
        "user": "piyush_s", 
        "password": "Gen@$@321"
    },
    "PKG3": {
        "host": "192.168.100.35", 
        "port": "6657", 
        "dbname": "mdm_app_db", 
        "user": "piyushs", 
        "password": "Gen@$@321"
    }
}

# ==========================================
# 2. EXACT SQL QUERIES
# ==========================================
QUERIES = {
    "DAILY":  "SELECT * FROM da.view_daily_energy_sla_summary",
    "LOAD":   "SELECT * FROM da.view_load_survey_sla_summary",
    "BILL":   "SELECT * FROM da.view_bill_data_sla_summary"
}

# ==========================================
# 3. SAT CLEANING FUNCTION (IMPORTANT 🔥)
# ==========================================
def clean_sat(value):
    if isinstance(value, str) and 'SAT' in value.upper():
        match = re.search(r'\d+', value)
        if match:
            return f"SAT {match.group()}"
    return value


def normalize_sat_column(df):
    if "sat_name" in df.columns:
        df["sat_name"] = df["sat_name"].apply(clean_sat)
    return df

# ==========================================
# 4. INDIVIDUAL PACKAGE FETCH FUNCTION
# ==========================================
def fetch_package_data(pkg):
    if not os.path.exists(SAVE_DIR):
        os.makedirs(SAVE_DIR)
        
    print(f"\n{'='*40}")
    print(f"🔄 CONNECTING TO {pkg} DATABASE...")
    print(f"{'='*40}")
    
    try:
        conn = psycopg2.connect(**DB_CONFIG[pkg])
        print(f"✅ Connected to {pkg} securely!\n")
        
        # ===== DAILY =====
        print(f"⏳ Extracting {pkg} Daily Energy...")
        df = pd.read_sql(QUERIES["DAILY"], conn)
        df = normalize_sat_column(df)
        df.to_csv(os.path.join(SAVE_DIR, f"DAILY{pkg[-1]}.CSV"), index=False)
        
        # ===== LOAD =====
        print(f"⏳ Extracting {pkg} Load Survey...")
        df = pd.read_sql(QUERIES["LOAD"], conn)
        df = normalize_sat_column(df)
        df.to_csv(os.path.join(SAVE_DIR, f"LOAD{pkg[-1]}.CSV"), index=False)
        
        # ===== BILL =====
        print(f"⏳ Extracting {pkg} Billing Data...")
        df = pd.read_sql(QUERIES["BILL"], conn)
        df = normalize_sat_column(df)
        df.to_csv(os.path.join(SAVE_DIR, f"BILL{pkg[-1]}.CSV"), index=False)
        
        conn.close()
        print(f"\n🎉 {pkg} Data cleaned & saved successfully!")
        
    except Exception as e:
        print(f"\n❌ Error fetching {pkg} data.")
        print(f"⚠️ Make sure your {pkg} VPN is CONNECTED and active.")
        print(f"Detailed Error: {e}")

# ==========================================
# 5. GITHUB AUTO-PUSH FUNCTION
# ==========================================
def push_to_github():
    print(f"\n{'='*40}")
    print("🚀 PUSHING DATA TO GITHUB & VERCEL...")
    print(f"{'='*40}")
    
    try:
        subprocess.run(["git", "add", "source/*.CSV"], check=True)
        commit_msg = f"Auto-sync data update: {datetime.now().strftime('%Y-%m-%d %I:%M %p')}"
        subprocess.run(["git", "commit", "-m", commit_msg], check=True)
        subprocess.run(["git", "push"], check=True)
        
        print("\n✅ SUCCESS! Data pushed to GitHub.")
        print("🌐 Vercel will automatically update your live dashboard in ~1 minute!")
        
    except subprocess.CalledProcessError:
        print("\n⚠️ No changes detected or Git not configured properly.")
    except Exception as e:
        print(f"\n❌ Unexpected error while pushing: {e}")

# ==========================================
# 6. INTERACTIVE MENU
# ==========================================
if __name__ == "__main__":
    while True:
        print("\n" + "="*55)
        print("📡 NOMC DATA AUTOMATION ENGINE".center(55))
        print("="*55)
        print("1. Fetch PKG1 Data (Turn ON PKG1 VPN First)")
        print("2. Fetch PKG3 Data (Turn ON PKG3 VPN First)")
        print("3. Push to GitHub & Vercel (Needs Internet/No VPN)")
        print("4. Exit")
        
        choice = input("\nEnter your choice (1-4): ")
        
        if choice == '1': 
            fetch_package_data('PKG1')
        elif choice == '2': 
            fetch_package_data('PKG3')
        elif choice == '3': 
            push_to_github()
        elif choice == '4': 
            print("\n👋 Exiting Data Engine. Dashboard is ready!")
            break
        else:
            print("\n⚠️ Invalid choice. Please enter 1, 2, 3, or 4.")