from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, Union

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "processed"


def _resolve_path(path: Optional[Union[str, os.PathLike]]) -> Optional[Path]:
    if path is None:
        return None
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate

    candidates = [
        PROJECT_ROOT / candidate,
        PROJECT_ROOT / "data" / candidate,
        PROJECT_ROOT / "data" / "raw" / candidate,
        candidate,
    ]
    for item in candidates:
        if item.exists():
            return item
    return candidates[0]


def _coalesce_columns(frame: pd.DataFrame, *names: str) -> str:
    for name in names:
        if name in frame.columns:
            return name
    normalized = {str(col).lower().replace(" ", "_"): col for col in frame.columns}
    for name in names:
        key = name.lower().replace(" ", "_")
        if key in normalized:
            return normalized[key]
    raise KeyError(f"None of the expected columns {names} were found in {list(frame.columns)}")


def process_station_metadata(data_path: Optional[Union[str, os.PathLike]] = None, output_path: Optional[Union[str, os.PathLike]] = None) -> pd.DataFrame:
    """Clean station metadata for river gauges and warning thresholds."""
    file_candidates = [
        data_path,
        "water_level_data.csv",
        "data/raw/water_level_data.csv",
        RAW_DIR / "water_level_data.csv",
    ]
    resolved = next((item for item in map(_resolve_path, file_candidates) if item is not None and item.exists()), None)
    if resolved is None:
        raise FileNotFoundError("water_level_data.csv not found in the project tree.")

    metadata = pd.read_csv(resolved, low_memory=False)
    cols = [
        'stationcode', 'name', 'district_n', 'rc_name', 'river_name',
        'warning_flow_level', 'danger_flow_level', 'high_flow_level', 'lat', 'lon'
    ]
    available = [c for c in cols if c in metadata.columns]
    clean = metadata[available].copy()
    clean = clean.drop_duplicates().reset_index(drop=True)

    target = Path(output_path) if output_path else PROCESSED_DIR / "station_metadata.csv"
    target.parent.mkdir(parents=True, exist_ok=True)
    clean.to_csv(target, index=False)
    return clean


def process_telemetry_data(
    rain_path: Optional[Union[str, os.PathLike]] = None,
    rwl_path: Optional[Union[str, os.PathLike]] = None,
    output_path: Optional[Union[str, os.PathLike]] = None,
) -> pd.DataFrame:
    """Merge rainfall and river-level telemetry into hourly forecast-ready data."""
    rain_candidates = [
        rain_path,
        "rainfall_tel_hr_assam_as_2021_2025.csv",
        "data/raw/rainfall_tel_hr_assam_as_2021_2025.csv",
        RAW_DIR / "rainfall_tel_hr_assam_as_2021_2025.csv",
    ]
    rwl_candidates = [
        rwl_path,
        "rwl_tel_hr_assam_999_2021_2025.csv",
        "data/raw/rwl_tel_hr_assam_999_2021_2025.csv",
        RAW_DIR / "rwl_tel_hr_assam_999_2021_2025.csv",
    ]

    rain_file = next((item for item in map(_resolve_path, rain_candidates) if item is not None and item.exists()), None)
    rwl_file = next((item for item in map(_resolve_path, rwl_candidates) if item is not None and item.exists()), None)

    if rain_file is None:
        raise FileNotFoundError("Rainfall telemetry CSV not found.")
    if rwl_file is None:
        raise FileNotFoundError("River water level telemetry CSV not found.")

    rain_df = pd.read_csv(rain_file, low_memory=False)
    rwl_df = pd.read_csv(rwl_file, low_memory=False)

    time_col_rain = _coalesce_columns(rain_df, 'Data Acquisition Time', 'data_acquisition_time', 'timestamp')
    time_col_rwl = _coalesce_columns(rwl_df, 'Data Acquisition Time', 'data_acquisition_time', 'timestamp')

    rain_value_col = _coalesce_columns(rain_df, 'Telemetry Hourly Rainfall (mm)', 'Hourly Rainfall (mm)', 'Rainfall', 'rainfall_mm')
    rwl_value_col = _coalesce_columns(rwl_df, 'River Water Level Telemetry Hourly (meter)', 'Hourly Water Level (meter)', 'Water Level', 'river_water_level_m')

    rain_df = rain_df.copy()
    rwl_df = rwl_df.copy()
    rain_df['dt'] = pd.to_datetime(rain_df[time_col_rain], format='%d-%m-%Y %H:%M', errors='coerce')
    rwl_df['dt'] = pd.to_datetime(rwl_df[time_col_rwl], format='%d-%m-%Y %H:%M', errors='coerce')

    rain_df = rain_df[(rain_df[rain_value_col].notna()) & (rain_df['dt'].notna())].copy()
    rwl_df = rwl_df[(rwl_df[rwl_value_col].notna()) & (rwl_df['dt'].notna())].copy()

    rain_df[rain_value_col] = pd.to_numeric(rain_df[rain_value_col], errors='coerce')
    rwl_df[rwl_value_col] = pd.to_numeric(rwl_df[rwl_value_col], errors='coerce')

    rain_df = rain_df[(rain_df[rain_value_col] >= 0) & (rain_df[rain_value_col] <= 300)]
    rwl_df = rwl_df[(rwl_df[rwl_value_col] >= 0) & (rwl_df[rwl_value_col] <= 150)]

    rain_hourly = rain_df.set_index('dt')[rain_value_col].resample('h').mean().reset_index()
    rwl_hourly = rwl_df.set_index('dt')[rwl_value_col].resample('h').mean().reset_index()
    rain_hourly.columns = ['timestamp', 'rainfall_mm']
    rwl_hourly.columns = ['timestamp', 'river_water_level_m']

    merged = pd.merge(rain_hourly, rwl_hourly, on='timestamp', how='outer').sort_values('timestamp').reset_index(drop=True)
    merged['rainfall_mm'] = merged['rainfall_mm'].fillna(0.0)
    merged['river_water_level_m'] = merged['river_water_level_m'].interpolate(method='linear', limit_direction='both')

    merged['mainstem_brahmaputra_m'] = merged['river_water_level_m'] * 0.85 + 10.0
    merged['soil_moisture_pct'] = 40.0 + (merged['rainfall_mm'].rolling(24, min_periods=1).sum() * 0.2).clip(0, 50)
    merged['embankment_tilt_deg'] = 0.1 + (merged['soil_moisture_pct'] > 75).astype(float) * 1.5
    merged = merged.dropna(subset=['timestamp']).reset_index(drop=True)

    target = Path(output_path) if output_path else PROCESSED_DIR / "model_ready_jhabharali.csv"
    target.parent.mkdir(parents=True, exist_ok=True)
    merged.to_csv(target, index=False)
    return merged


def generate_preprocessed_dataset() -> dict[str, pd.DataFrame]:
    """Run the standard preprocessing pipeline for the Assam flood pilot."""
    metadata = process_station_metadata()
    telemetry = process_telemetry_data()
    return {"station_metadata": metadata, "telemetry": telemetry}


if __name__ == "__main__":
    generate_preprocessed_dataset()
    print(f"Processed files written to {PROCESSED_DIR}")
