import os
import pandas as pd


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    csv_dir = os.path.join(base_dir, "collection", "csv")
    out_dir = os.path.join(base_dir, "ml_pipeline", "processed_data")
    os.makedirs(out_dir, exist_ok=True)

    # 1. Load datasets
    weather_path = os.path.join(csv_dir, "open_meteo_cachar_2020_2024.csv")
    river_path = os.path.join(csv_dir, "barak_river_hydrology_2020_2024.csv")
    upstream_path = os.path.join(csv_dir, "upstream_catchment_rainfall_2020_2024.csv")

    weather_df = pd.read_csv(weather_path)
    river_df = pd.read_csv(river_path)
    upstream_df = pd.read_csv(upstream_path)

    # 2. Resample hourly Cachar weather to daily
    time_col = "time" if "time" in weather_df.columns else weather_df.columns[0]
    weather_df["date"] = pd.to_datetime(weather_df[time_col]).dt.floor("D")

    agg_rules = {}
    for col in weather_df.columns:
        if col in [time_col, "date"]:
            continue
        if "rain" in col.lower() or "precip" in col.lower():
            agg_rules[col] = "sum"
        elif pd.api.types.is_numeric_dtype(weather_df[col]):
            agg_rules[col] = "mean"

    daily_weather = weather_df.groupby("date", as_index=False).agg(agg_rules)

    # 3. Standardize date columns and merge all three tables
    river_df["date"] = pd.to_datetime(river_df["date"]).dt.floor("D")
    upstream_df["date"] = pd.to_datetime(upstream_df["date"]).dt.floor("D")

    master_df = pd.merge(river_df, daily_weather, on="date", how="inner")
    master_df = pd.merge(master_df, upstream_df, on="date", how="inner")

    # 4. Sort chronologically and fill any minor missing values
    master_df = master_df.sort_values("date").reset_index(drop=True)
    master_df = master_df.ffill().bfill()

    # 5. Add simple lag features (upstream rain 1 & 2 days ago) for LSTM/forecasting
    master_df["upstream_precip_lag1"] = master_df["upstream_total_precip_mm"].shift(1).bfill()
    master_df["upstream_precip_lag2"] = master_df["upstream_total_precip_mm"].shift(2).bfill()

    # 6. Save master time-series
    out_csv = os.path.join(out_dir, "cachar_master_timeseries.csv")
    out_parquet = os.path.join(out_dir, "cachar_master_timeseries.parquet")
    master_df.to_csv(out_csv, index=False)
    master_df.to_parquet(out_parquet, index=False)

    print("Master time-series saved successfully!")
    print(f"Rows: {len(master_df)} | Columns: {len(master_df.columns)}")
    print("Columns:", list(master_df.columns))
    print("Output path:", out_csv)


if __name__ == "__main__":
    main()