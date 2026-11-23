from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import numpy as np
import torch
import torch.nn as nn
import os
from ai_engine import HybridCNNLSTMPINN, AssamFloodDataset
from bhoonidhi_client import BhoonidhiClient

app = FastAPI(title="Dynamic Digital Twin API", version="2.0")

# Enable CORS for your Node.js and CSS Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the AI Model and Load Trained Weights
model = HybridCNNLSTMPINN(input_dim=5, hidden_dim=64, output_dim=2)
weights_path = "processed/model_weights.pth"
if os.path.exists(weights_path):
    model.load_state_dict(torch.load(weights_path, weights_only=True))
model.eval()

class SimulationRequest(BaseModel):
    station_id: str         # e.g., "JIA_BHARALI_01" or "SILCHAR_02"
    latitude: float         # e.g., 26.63
    longitude: float        # e.g., 92.85
    rainfall_intensity_mm: float
    brahmaputra_backwater_m: float

@app.post("/api/simulate")
def run_simulation(req: SimulationRequest):
    # 1. Dynamically load dataset based on location requested
    dataset_path = f"processed/model_ready_{req.station_id.lower()}.csv"
    
    # MVP Safety Fallback: If specific station CSV doesn't exist yet, use base data
    if not os.path.exists(dataset_path):
        dataset_path = "processed/model_ready_jhabharali.csv"

    dataset = AssamFloodDataset(dataset_path, seq_len=24, pred_len=6)
    last_idx = len(dataset) - 1
    sample_input, _ = dataset[last_idx] 
    
    sample_input[-1, 0] = req.rainfall_intensity_mm
    sample_input[-1, 2] = req.brahmaputra_backwater_m
    sample_input = sample_input.unsqueeze(0) 
    
    for m in model.modules():
        if isinstance(m, nn.Dropout):
            m.train()
            
    mc_preds = []
    with torch.no_grad():
        for _ in range(30):
            mc_preds.append(model(sample_input).numpy())
            
    mc_preds = np.array(mc_preds)
    mean_pred = np.mean(mc_preds, axis=0)[0]
    std_pred = np.std(mc_preds, axis=0)[0]
    
    predicted_stage = float(mean_pred[0])
    predicted_tilt = float(mean_pred[1])
    stage_uncertainty = float(1.96 * std_pred[0])
    
    breach_prob = min(max(float((predicted_tilt / 1.5) * 100), 0.0), 100.0)
    
    # 2. Dynamic Thresholds based on River ID
    warning_level = 77.50 if "jhabharali" in req.station_id.lower() else 49.50
    danger_level = 78.50 if "jhabharali" in req.station_id.lower() else 50.50
    
    alert_color = "Green"
    if predicted_stage > warning_level:
        alert_color = "Orange"
    if predicted_stage > danger_level or breach_prob > 75.0:
        alert_color = "Red"
        
    # 3. Dynamic ISRO Satellite Pull
    sat_id, sat_collection = "Not Available", "Not Available"
    try:
        client = BhoonidhiClient("deba_meb24", "meb@24062") 
        client.authenticate()
        sat_data = client.search_imagery_by_location(req.latitude, req.longitude)
        if sat_data:
            sat_id = sat_data[0].get("id", sat_id)
            sat_collection = sat_data[0].get("collection", sat_collection)
    except Exception as e:
        print("ISRO API Error:", e)

    # 4. Return Full Location-Aware Payload
    return {
        "location": {
            "station_id": req.station_id,
            "latitude": req.latitude,
            "longitude": req.longitude
        },
        "forecast": {
            "horizon": "+6 Hours",
            "water_level_m": round(predicted_stage, 2),
            "uncertainty_m": round(stage_uncertainty, 2),
            "breach_probability_pct": round(breach_prob, 1),
            "alert_status": alert_color
        },
        "satellite": {
            "latest_image_id": sat_id,
            "collection": sat_collection
        }
    }

if __name__ == "__main__":
    print("Starting Dynamic Digital Twin API Server...")
    uvicorn.run(app, host="0.0.0.0", port=8000)