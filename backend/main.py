import os
import secrets
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import requests
import numpy as np
import torch
import torch.nn as nn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Security, Depends
from fastapi.security.api_key import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ai_core.ai_engine import HybridCNNLSTMPINN, AssamFloodDataset
from ai_core.bhoonidhi_client import BhoonidhiClient
from ai_core.cachar_inference import CacharFloodService

load_dotenv(dotenv_path=BACKEND_DIR / ".env", override=True)

IS_PRODUCTION = os.getenv("APP_ENV", "development").strip().lower() == "production"

app = FastAPI(
    title="Assam Flood Intelligence System",
    description="Backend API for flood monitoring, forecasting and risk assessment across Assam.",
    version="2.0.0",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

API_KEY = (os.getenv("DASHBOARD_API_KEY") or "").strip()
if API_KEY:
    print("Backend API Key loaded successfully from backend/.env")
else:
    print("Warning: DASHBOARD_API_KEY missing from backend/.env")

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=True)


def verify_api_key(provided_key: str = Security(api_key_header)):
    if not API_KEY or not secrets.compare_digest(provided_key.strip(), API_KEY):
        raise HTTPException(status_code=403, detail="Could not validate API Key")
    return provided_key


ai_model = HybridCNNLSTMPINN(input_dim=5, hidden_dim=64, output_dim=2)
weights_path = Path(__file__).parent / "data" / "processed" / "model_weights.pth"

if weights_path.exists():
    ai_model.load_state_dict(torch.load(weights_path, map_location=torch.device("cpu"), weights_only=True))
    print(f"Flood Engine Loaded: {weights_path}")
else:
    print("Warning: model_weights.pth not found in data/processed/")
ai_model.eval()

cachar_service = CacharFloodService()
print("Cachar LSTM and CNN-PINN Service Loaded")


class SimulationRequest(BaseModel):
    station_id: str
    latitude: float
    longitude: float
    rainfall_intensity_mm: float
    brahmaputra_backwater_m: float


class CustomCacharInput(BaseModel):
    current_discharge_m3s: float
    silchar_rain_mm: float
    haflong_rain_mm: float
    jiribam_rain_mm: float
    tipaimukh_rain_mm: float
    reference_date: Optional[str] = None


LOCATIONS = {
    "Tezpur": {"latitude": 26.6338, "longitude": 92.8000},
    "Guwahati": {"latitude": 26.1445, "longitude": 91.7362},
    "Nagaon": {"latitude": 26.3500, "longitude": 92.6833},
    "Dhemaji": {"latitude": 27.4833, "longitude": 94.5833},
    "Dibrugarh": {"latitude": 27.4728, "longitude": 94.9120},
    "Tinsukia": {"latitude": 27.4922, "longitude": 95.3468},
    "Lakhimpur": {"latitude": 27.2352, "longitude": 94.1036},
    "Barpeta": {"latitude": 26.3225, "longitude": 91.0060},
    "Morigaon": {"latitude": 26.2524, "longitude": 92.3420},
    "Dhubri": {"latitude": 26.0207, "longitude": 89.9743},
}

MONITORED_STATIONS = [
    {"id": "JIA_BHARALI_01", "name": "Jia Bharali (Tezpur)", "lat": 26.63, "lng": 92.80, "district": "Sonitpur"},
    {"id": "SILCHAR_BARAK_01", "name": "Barak River (Silchar)", "lat": 24.83, "lng": 92.77, "district": "Cachar"},
    {"id": "BRAM_GUW_01", "name": "Brahmaputra (Guwahati)", "lat": 26.16, "lng": 91.75, "district": "Kamrup Metropolitan"},
    {"id": "BEKI_BAR_01", "name": "Beki River (Barpeta)", "lat": 26.32, "lng": 91.00, "district": "Barpeta"},
    {"id": "DHEMAJI_01", "name": "Subansiri (Dhemaji)", "lat": 27.48, "lng": 94.58, "district": "Dhemaji"},
    {"id": "DIBRUGARH_01", "name": "Brahmaputra (Dibrugarh)", "lat": 27.47, "lng": 94.91, "district": "Dibrugarh"},
    {"id": "NAGAON_01", "name": "Kopili River (Nagaon)", "lat": 26.35, "lng": 92.68, "district": "Nagaon"},
    {"id": "DHUBRI_01", "name": "Brahmaputra (Dhubri)", "lat": 26.02, "lng": 89.97, "district": "Dhubri"},
    {"id": "LAKHIMPUR_01", "name": "Ranganadi (Lakhimpur)", "lat": 27.23, "lng": 94.10, "district": "Lakhimpur"},
    {"id": "JORHAT_01", "name": "Brahmaputra (Nimati Ghat)", "lat": 26.75, "lng": 94.21, "district": "Jorhat"},
    {"id": "SIVASAGAR_01", "name": "Disang River (Sivasagar)", "lat": 26.98, "lng": 94.64, "district": "Sivasagar"},
    {"id": "TINSUKIA_01", "name": "Brahmaputra (Saikhowa)", "lat": 27.49, "lng": 95.34, "district": "Tinsukia"},
    {"id": "GOALPARA_01", "name": "Brahmaputra (Goalpara)", "lat": 26.17, "lng": 90.62, "district": "Goalpara"},
    {"id": "NALBARI_01", "name": "Puthimari (Nalbari)", "lat": 26.44, "lng": 91.44, "district": "Nalbari"},
    {"id": "BAKSA_01", "name": "Bhabananda (Baksa)", "lat": 26.68, "lng": 91.37, "district": "Baksa"},
    {"id": "CHIRANG_01", "name": "Aie River (Chirang)", "lat": 26.49, "lng": 90.53, "district": "Chirang"},
    {"id": "KOKRAJHAR_01", "name": "Sankosh (Kokrajhar)", "lat": 26.40, "lng": 90.26, "district": "Kokrajhar"},
    {"id": "UDALGURI_01", "name": "Dhansiri (Udalguri)", "lat": 26.74, "lng": 92.11, "district": "Udalguri"},
    {"id": "MORIGAON_01", "name": "Kopili (Morigaon)", "lat": 26.25, "lng": 92.34, "district": "Morigaon"},
    {"id": "KARIMGANJ_01", "name": "Kushiyara (Karimganj)", "lat": 24.86, "lng": 92.35, "district": "Karimganj"},
    {"id": "HAILAKANDI_01", "name": "Katakhal (Hailakandi)", "lat": 24.68, "lng": 92.55, "district": "Hailakandi"},
    {"id": "KARBI_ANGLONG_01", "name": "Dhansiri (Karbi Anglong)", "lat": 26.18, "lng": 93.43, "district": "Karbi Anglong"},
    {"id": "DIMA_HASAO_01", "name": "Barak Headwaters (Haflong)", "lat": 25.17, "lng": 93.60, "district": "Dima Hasao"},
]

_WEATHER_CACHE = {}
CACHE_TTL_SECONDS = 900


@app.get("/")
def home():
    return {"message": "Assam Flood Intelligence System API is running", "status": "online"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}


@app.get("/api/locations")
def get_locations():
    return {"total_locations": len(LOCATIONS), "locations": LOCATIONS}


@app.get("/api/river/stations")
def get_river_stations():
    return {
        "status": "success",
        "total": len(MONITORED_STATIONS),
        "stations": MONITORED_STATIONS,
    }


@app.get("/api/river/levels")
def get_river_levels(hours: int = 24):
    levels_data = []
    for station in MONITORED_STATIONS:
        level = round(45.0 + (hash(station["id"]) % 25) + 0.4, 2)
        warning = 76.0 if "JIA" in station["id"] else 50.0
        danger = 77.0 if "JIA" in station["id"] else 51.0

        status = "Normal"
        if level >= danger:
            status = "Danger"
        elif level >= warning:
            status = "Warning"

        levels_data.append({
            "station": station["name"],
            "station_id": station["id"],
            "district": station["district"],
            "river": station["name"].split("(")[0].strip(),
            "water_level": level,
            "water_level_m": level,
            "current_level_m": level,
            "warning_level": warning,
            "danger_level": danger,
            "status": status,
            "trend": "rising" if (hash(station["id"]) % 2 == 0) else "stable",
        })

    return {
        "status": "success",
        "timeframe_hours": hours,
        "data": levels_data,
    }


@app.get("/api/districts")
def get_districts():
    districts = list(set([s["district"] for s in MONITORED_STATIONS]))
    return {
        "status": "success",
        "total_districts": len(districts),
        "districts": districts,
    }


@app.get("/api/overview/stats")
def get_overview_stats():
    return {
        "status": "success",
        "active_stations": len(MONITORED_STATIONS),
        "monitored_districts": 23,
        "high_risk_zones": 3,
        "system_status": "Operational",
    }


@app.get("/api/flood/zones")
def get_flood_zones():
    zones = []
    for station in MONITORED_STATIONS:
        risk = "High" if "BRAM" in station["id"] or "JIA" in station["id"] else "Moderate"
        zones.append({
            "district": station["district"],
            "station_name": station["name"],
            "risk_level": risk,
            "latitude": station["lat"],
            "longitude": station["lng"],
        })
    return {
        "status": "success",
        "zones": zones,
    }


@app.get("/api/weather/forecast")
def get_weather_forecast(location: str = "Tezpur"):
    selected_location = next((name for name in LOCATIONS if name.lower() == location.lower()), None)
    if selected_location is None:
        raise HTTPException(status_code=404, detail="Location not found.")

    now = time.time()
    cached_entry = _WEATHER_CACHE.get(selected_location)
    if cached_entry is not None:
        cached_payload, cached_at = cached_entry
        if now - cached_at < CACHE_TTL_SECONDS:
            return cached_payload

    coordinates = LOCATIONS[selected_location]
    url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": coordinates["latitude"],
        "longitude": coordinates["longitude"],
        "current": ["temperature_2m", "relative_humidity_2m", "precipitation", "wind_speed_10m"],
        "hourly": ["precipitation", "relative_humidity_2m", "precipitation_probability"],
        "daily": ["precipitation_sum", "precipitation_probability_max"],
        "timezone": "Asia/Kolkata",
    }

    try:
        response = requests.get(url, params=params, timeout=8)
        response.raise_for_status()
        payload = {
            "source": "Open-Meteo",
            "location": selected_location,
            "coordinates": coordinates,
            "weather": response.json(),
        }
        _WEATHER_CACHE[selected_location] = (payload, now)
        return payload
    except requests.exceptions.RequestException as error:
        print(f"Weather API timeout. Using fallback data. Error: {error}")
        if cached_entry is not None:
            return cached_entry[0]

        now_dt = datetime.now().replace(minute=0, second=0, microsecond=0)
        hourly_times = [(now_dt + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(72)]
        daily_times = [(now_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
        return {
            "source": "Fallback (Open-Meteo Offline)",
            "location": selected_location,
            "coordinates": coordinates,
            "weather": {
                "current": {
                    "time": now_dt.strftime("%Y-%m-%dT%H:%M"),
                    "temperature_2m": 22.5,
                    "relative_humidity_2m": 78.0,
                    "precipitation": 0.0,
                    "wind_speed_10m": 4.2,
                },
                "hourly": {
                    "time": hourly_times,
                    "precipitation": [0.0] * 72,
                    "relative_humidity_2m": [78.0] * 72,
                    "precipitation_probability": [10] * 72,
                },
                "daily": {
                    "time": daily_times,
                    "precipitation_sum": [0.0] * 7,
                    "precipitation_probability_max": [15] * 7,
                },
            },
        }


@app.post("/api/simulate")
def run_ai_simulation(req: SimulationRequest, api_key: str = Depends(verify_api_key)):
    base_dir = Path(__file__).parent / "data" / "processed"
    dataset_path = base_dir / f"model_ready_{req.station_id.lower()}.csv"

    if not dataset_path.exists():
        dataset_path = base_dir / "model_ready_jhabharali.csv"

    dataset = AssamFloodDataset(str(dataset_path), seq_len=24, pred_len=6)
    last_idx = len(dataset) - 1
    sample_input, _ = dataset[last_idx]

    sample_input[-1, 0] = req.rainfall_intensity_mm
    sample_input[-1, 2] = req.brahmaputra_backwater_m
    sample_input = sample_input.unsqueeze(0)

    for m in ai_model.modules():
        if isinstance(m, nn.Dropout):
            m.train()

    mc_preds = []
    with torch.no_grad():
        for _ in range(30):
            mc_preds.append(ai_model(sample_input).numpy())

    mc_preds = np.array(mc_preds)
    mean_pred = np.mean(mc_preds, axis=0)[0]
    std_pred = np.std(mc_preds, axis=0)[0]

    predicted_stage = float(mean_pred[0])
    predicted_tilt = float(mean_pred[1])
    stage_uncertainty = float(1.96 * std_pred[0])
    breach_prob = min(max(float((predicted_tilt / 1.5) * 100), 0.0), 100.0)

    warning_level = 77.50 if "bharali" in req.station_id.lower() else 49.50
    danger_level = 78.50 if "bharali" in req.station_id.lower() else 50.50

    alert_color = "Green"
    if predicted_stage > warning_level:
        alert_color = "Orange"
    if predicted_stage > danger_level or breach_prob > 75.0:
        alert_color = "Red"

    sat_id = "SEN1A_SAR_IW_28JUN2026_065176_F6AD_ESA_ST0000KTD_DV"
    sat_collection = "Sentinel-1A_SAR-IW_SLC"

    try:
        isro_user = os.getenv("ISRO_USERNAME")
        isro_pass = os.getenv("ISRO_PASSWORD")
        client = BhoonidhiClient(isro_user, isro_pass)
        client.authenticate()
        sat_data = client.search_imagery_by_location(req.latitude, req.longitude)
        if sat_data:
            sat_id = sat_data[0].get("id", sat_id)
            sat_collection = sat_data[0].get("collection", sat_collection)
    except Exception as e:
        print(f"ISRO API Error (Using Cached MVP Data): {e}")

    return {
        "location": {
            "station_id": req.station_id,
            "latitude": req.latitude,
            "longitude": req.longitude,
        },
        "forecast": {
            "horizon": "+6 Hours",
            "water_level_m": round(predicted_stage, 2),
            "uncertainty_m": round(stage_uncertainty, 2),
            "breach_probability_pct": round(breach_prob, 1),
            "alert_status": alert_color,
        },
        "satellite": {
            "latest_image_id": sat_id,
            "collection": sat_collection,
        },
    }


@app.get("/api/cachar/forecast")
def get_cachar_forecast(date: str = None, rain_multiplier: float = 1.0):
    try:
        return {
            "status": "success",
            "data": cachar_service.predict_discharge(
                target_date=date,
                rain_multiplier=rain_multiplier,
            ),
        }
    except Exception as error:
        print(f"Cachar forecast error: {error}")
        raise HTTPException(
            status_code=500,
            detail="Internal forecast error." if IS_PRODUCTION else str(error),
        )


@app.post("/api/cachar/predict-custom")
def predict_cachar_custom(payload: CustomCacharInput):
    try:
        return {
            "status": "success",
            "data": cachar_service.predict_from_custom_data(
                current_discharge_m3s=payload.current_discharge_m3s,
                silchar_rain_mm=payload.silchar_rain_mm,
                haflong_rain_mm=payload.haflong_rain_mm,
                jiribam_rain_mm=payload.jiribam_rain_mm,
                tipaimukh_rain_mm=payload.tipaimukh_rain_mm,
                reference_date=payload.reference_date,
            ),
        }
    except Exception as error:
        print(f"Cachar custom prediction error: {error}")
        raise HTTPException(
            status_code=500,
            detail="Internal forecast error." if IS_PRODUCTION else str(error),
        )


@app.get("/api/cachar/predict-live")
def predict_cachar_live():
    try:
        return {
            "status": "success",
            "data": cachar_service.predict_from_live_open_meteo(),
        }
    except Exception as error:
        print(f"Cachar live prediction error: {error}")
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch live weather data." if IS_PRODUCTION else str(error),
        )


@app.get("/api/cachar/validation-2024")
def get_cachar_2024_validation():
    return {
        "status": "success",
        "series": cachar_service.get_2024_validation_series(),
    }


@app.get("/api/cachar/spatial-layers")
def get_cachar_spatial_layers(refresh: bool = False):
    try:
        return {
            "status": "success",
            "spatial": cachar_service.generate_spatial_overlays(force_refresh=refresh),
        }
    except Exception as error:
        print(f"Cachar spatial layer error: {error}")
        raise HTTPException(
            status_code=500,
            detail="Unable to generate spatial layers." if IS_PRODUCTION else str(error),
        )


@app.get("/api/cachar/overlay/{layer_name}")
def get_cachar_overlay_image(layer_name: str):
    file_map = {
        "dynamic_predicted": "cachar_dynamic_predicted.png",
        "pinn_predicted": "cachar_pinn_predicted.png",
        "sar_2022": "cachar_sar_2022.png",
        "sar_2024": "cachar_sar_2024.png",
    }
    if layer_name not in file_map:
        raise HTTPException(status_code=404, detail="Invalid overlay layer name.")

    if layer_name != "dynamic_predicted":
        cachar_service.generate_spatial_overlays(force_refresh=False)

    png_path = cachar_service.overlay_dir / file_map[layer_name]
    if not png_path.exists():
        raise HTTPException(status_code=404, detail="Overlay PNG not found.")

    return FileResponse(
        str(png_path),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )