import pandas as pd
import os

def verify_processed_data():
    file_path = "processed/model_ready_jhabharali.csv"
    if not os.path.exists(file_path):
        print(f"Error: {file_path} not found! Please run preprocessor.py first.")
        return
    
    df = pd.read_csv(file_path)
    print("=== DATA VERIFICATION REPORT ===")
    print(f"Total Hourly Rows: {len(df)}")
    print(f"Columns Available: {df.columns.tolist()}")
    print("\nFirst 3 Rows:")
    print(df.head(3))
    print("\nMissing Values per Column:")
    print(df.isnull().sum())
    print("\nData Summary Statistics:")
    print(df.describe())

if __name__ == "__main__":
    verify_processed_data()