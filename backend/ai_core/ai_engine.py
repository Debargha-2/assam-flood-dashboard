import torch
import torch.nn as nn
import pandas as pd
import numpy as np
from torch.utils.data import Dataset, DataLoader

class AssamFloodDataset(Dataset):
    def __init__(self, csv_path, seq_len=24, pred_len=6):
        df = pd.read_csv(csv_path)
        df = df.ffill().bfill()
        
        self.features = df[['rainfall_mm', 'river_water_level_m', 'mainstem_brahmaputra_m', 'soil_moisture_pct', 'embankment_tilt_deg']].values
        self.targets = df[['river_water_level_m', 'embankment_tilt_deg']].values
        
        self.seq_len = seq_len
        self.pred_len = pred_len

    def __len__(self):
        return len(self.features) - self.seq_len - self.pred_len + 1

    def __getitem__(self, idx):
        x = self.features[idx : idx + self.seq_len]
        y = self.targets[idx + self.seq_len : idx + self.seq_len + self.pred_len]
        return torch.tensor(x, dtype=torch.float32), torch.tensor(y, dtype=torch.float32)

class HybridCNNLSTMPINN(nn.Module):
    def __init__(self, input_dim=5, hidden_dim=64, output_dim=2):
        super(HybridCNNLSTMPINN, self).__init__()
        self.cnn = nn.Conv1d(in_channels=input_dim, out_channels=32, kernel_size=3, padding=1)
        self.relu = nn.ReLU()
        
        self.lstm = nn.LSTM(input_size=32, hidden_size=hidden_dim, num_layers=2, batch_first=True, dropout=0.2)
        
        self.mc_dropout = nn.Dropout(0.2)
        self.fc = nn.Linear(hidden_dim, output_dim)

    def forward(self, x):
        current_stage = x[:, -1, 1]
        current_tilt = x[:, -1, 4]
        
        feat = x.permute(0, 2, 1)
        feat = self.cnn(feat)
        feat = self.relu(feat)
        
        feat = feat.permute(0, 2, 1)
        out, _ = self.lstm(feat)
        
        out = self.mc_dropout(out[:, -1, :])
        deltas = self.fc(out)
        
        pred_stage = current_stage + deltas[:, 0]
        pred_tilt = torch.clamp(current_tilt + deltas[:, 1], min=0.0)
        return torch.stack([pred_stage, pred_tilt], dim=1)

def physics_informed_loss(preds, targets, inputs):
    data_loss = nn.MSELoss()(preds, targets)
    
    rain = inputs[:, -1, 0]
    water_level = inputs[:, -1, 1]
    mainstem = inputs[:, -1, 2]
    soil_moist = inputs[:, -1, 3]
    
    pred_stage = preds[:, 0]
    pred_tilt = preds[:, 1]
    
    mass_residual = torch.mean(torch.relu(torch.abs(pred_stage - water_level) - (rain * 0.1 + 1.5)))
    backwater_residual = torch.mean(torch.relu((mainstem > 65.0).float() * (water_level - pred_stage)))
    geotechnical_residual = torch.mean((soil_moist > 75.0).float() * torch.relu(0.5 - pred_tilt))
    
    total_loss = data_loss + 0.1 * (mass_residual + backwater_residual + geotechnical_residual)
    return total_loss

if __name__ == "__main__":
    print("AI Engine Module (CNN-LSTM + PINN) Compiled Successfully!")