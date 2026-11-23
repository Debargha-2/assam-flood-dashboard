# Assam Flood Intelligence System

A digital twin flood monitoring, telemetry visualization, and hydrological forecasting platform for river basins across Assam, India, built with **FastAPI**, **PyTorch**, and **React (Vite)**.

## Key Features

* **Multi-Station River & Weather Telemetry:** Monitors stations across Assam (including Jia Bharali at Tezpur, Barak River at Silchar, Brahmaputra at Guwahati, and additional district stations) with Open-Meteo weather integration and offline fallback handling.
* **AI Digital Twin & Cachar Basin Forecasting:** Runs PyTorch neural forecasting models (including LSTM and CNN-PINN pipelines) and spatial inundation layers for Assam and the Cachar/Barak basin.
* **Interactive 2D & 3D Geospatial Views:** Combines Leaflet flood risk mapping, time-series charts, and a 3D Cesium viewer (`CesiumGlobe`) highlighting selected station zones and Assam district boundaries.
* **API Key & CORS Protection:** Protects simulation endpoints with `X-API-Key` header verification and configurable CORS origins.

## Project Structure

* `backend/` — FastAPI server (`backend/main.py`), hydrological/ML inference modules (`backend/ai_core/`), telemetry CSVs/PDFs, and spatial overlay data.
* `frontend/` — React + Vite dashboard (`frontend/src/`) with Leaflet maps, Cesium 3D globe viewer, and forecast/analytics panels.
* `ml_pipeline/` — Data preprocessing scripts (`preprocess_timeseries.py`, `preprocess_rasters.py`), model training scripts (`train_lstm.py`, `train_cnn_pinn.py`), trained weights, and spatial stacks.
* `requirements.txt` — Core Python dependencies for the backend.

## Local Setup

### 1. Backend (FastAPI)

1. Copy `backend/.env.example` to `backend/.env` and fill in your `DASHBOARD_API_KEY`, `ALLOWED_ORIGINS`, and ISRO Bhoonidhi credentials.
2. Install dependencies from `requirements.txt`:
   ```bash
   pip install -r requirements.txt
