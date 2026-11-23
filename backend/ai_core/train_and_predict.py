import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from ai_engine import AssamFloodDataset, HybridCNNLSTMPINN, physics_informed_loss
import pandas as pd
import numpy as np
import os

def get_alert_class(stage, tilt):
    breach_prob = min(max((tilt / 1.5) * 100.0, 0.0), 100.0)
    if stage > 78.50 or breach_prob > 75.0:
        return 2
    elif stage > 77.50:
        return 1
    return 0

def train_and_evaluate():
    print("1. Initializing Dataset and DataLoader...")
    dataset = AssamFloodDataset("processed/model_ready_jhabharali.csv", seq_len=24, pred_len=6)
    dataloader = DataLoader(dataset, batch_size=32, shuffle=True)
    
    model = HybridCNNLSTMPINN(input_dim=5, hidden_dim=64, output_dim=2)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    
    print("\n2. Running Training Loop (PINN Loss)...")
    model.train()
    epochs = 3
    for epoch in range(epochs):
        total_loss = 0.0
        batches_run = 0
        for batch_idx, (inputs, targets) in enumerate(dataloader):
            if batch_idx >= 50:
                break
            optimizer.zero_grad()
            preds = model(inputs)
            loss = physics_informed_loss(preds, targets[:, -1, :], inputs)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            batches_run += 1
        print(f"   Epoch {epoch+1}/{epochs} | Average PINN Loss: {total_loss / batches_run:.4f}")
        
    os.makedirs("processed", exist_ok=True)
    weights_path = "processed/model_weights.pth"
    torch.save(model.state_dict(), weights_path)
    print(f"\n3. Saved trained model weights to: {weights_path}")
    
    print("\n4. Calculating Error Matrix on Evaluation Sample (200 windows)...")
    model.eval()
    actuals_list = []
    preds_list = []
    
    eval_size = min(200, len(dataset))
    with torch.no_grad():
        for i in range(len(dataset) - eval_size, len(dataset)):
            x, y = dataset[i]
            pred = model(x.unsqueeze(0)).squeeze(0).numpy()
            actual = y[-1].numpy()
            preds_list.append(pred)
            actuals_list.append(actual)
            
    actuals_arr = np.array(actuals_list)
    preds_arr = np.array(preds_list)
    
    errors = preds_arr - actuals_arr
    mse = np.mean(errors ** 2, axis=0)
    rmse = np.sqrt(mse)
    mae = np.mean(np.abs(errors), axis=0)
    
    print("\n=== REGRESSION ERROR METRICS ===")
    print(f"River Water Level (m) -> RMSE: {rmse[0]:.4f} m | MAE: {mae[0]:.4f} m | MSE: {mse[0]:.4f}")
    print(f"Embankment Tilt (deg) -> RMSE: {rmse[1]:.4f} deg | MAE: {mae[1]:.4f} deg | MSE: {mse[1]:.4f}")
    
    conf_matrix = np.zeros((3, 3), dtype=int)
    for a, p in zip(actuals_arr, preds_arr):
        true_cls = get_alert_class(a[0], a[1])
        pred_cls = get_alert_class(p[0], p[1])
        conf_matrix[true_cls, pred_cls] += 1
        
    labels = ["Green (Normal)", "Orange (Warn)", "Red (Danger)"]
    conf_df = pd.DataFrame(conf_matrix, index=[f"Actual {l}" for l in labels], columns=[f"Pred {l}" for l in labels])
    print("\n=== ALERT STATUS CONFUSION MATRIX ===")
    print(conf_df)
    
    for m in model.modules():
        if isinstance(m, nn.Dropout):
            m.train()
            
    sample_input, _ = dataset[len(dataset) - 1]
    sample_input = sample_input.unsqueeze(0)
    
    mc_preds = []
    with torch.no_grad():
        for _ in range(50):
            mc_preds.append(model(sample_input).numpy())
            
    mc_preds = np.array(mc_preds)
    mean_pred = np.mean(mc_preds, axis=0)[0]
    std_pred = np.std(mc_preds, axis=0)[0]
    
    print("\n=== LATEST AI FORECAST & UNCERTAINTY OUTPUT ===")
    print(f"Predicted River Stage (+6h): {mean_pred[0]:.2f} m (+/- {1.96 * std_pred[0]:.2f} m)")
    print(f"Predicted Embankment Tilt (+6h): {mean_pred[1]:.2f} deg (+/- {1.96 * std_pred[1]:.2f} deg)")

if __name__ == "__main__":
    train_and_evaluate()