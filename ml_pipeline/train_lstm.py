import os
import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score


class BarakFloodLSTM(nn.Module):
    def __init__(self, input_size, hidden_size=64, num_layers=2, forecast_horizon=3):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.2,
        )
        self.fc = nn.Linear(hidden_size, forecast_horizon)

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])


def create_sequences(X_data, y_data, lookback=14, horizon=3):
    X_seq, y_seq = [], []
    for i in range(len(X_data) - lookback - horizon + 1):
        X_seq.append(X_data[i : i + lookback])
        y_seq.append(y_data[i + lookback : i + lookback + horizon, 0])
    return np.array(X_seq, dtype=np.float32), np.array(y_seq, dtype=np.float32)


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_path = os.path.join(base_dir, "ml_pipeline", "processed_data", "cachar_master_timeseries.csv")
    model_dir = os.path.join(base_dir, "ml_pipeline", "models")
    os.makedirs(model_dir, exist_ok=True)

    df = pd.read_csv(data_path)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    feature_cols = [
        "river_discharge_m3s",
        "discharge_3d_avg",
        "discharge_7d_avg",
        "precipitation",
        "soil_moisture_0_to_7cm",
        "soil_moisture_7_to_28cm",
        "upstream_total_precip_mm",
        "upstream_precip_lag1",
        "upstream_precip_lag2",
    ]
    target_col = ["river_discharge_m3s"]

    ''' Chronological split: Train on 2020-2023, Test on 2024 '''
    train_df = df[df["date"].dt.year <= 2023].reset_index(drop=True)
    test_df = df[df["date"].dt.year == 2024].reset_index(drop=True)

    x_scaler = MinMaxScaler()
    y_scaler = MinMaxScaler()

    X_train_scaled = x_scaler.fit_transform(train_df[feature_cols])
    y_train_scaled = y_scaler.fit_transform(train_df[target_col])

    X_test_scaled = x_scaler.transform(test_df[feature_cols])
    y_test_scaled = y_scaler.transform(test_df[target_col])

    lookback = 14
    horizon = 3

    X_train, y_train = create_sequences(X_train_scaled, y_train_scaled, lookback, horizon)
    X_test, y_test = create_sequences(X_test_scaled, y_test_scaled, lookback, horizon)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training LSTM on device: {device}")
    print(f"Train sequences: {len(X_train)} | Test sequences (2024): {len(X_test)}")

    train_loader = DataLoader(
        TensorDataset(torch.tensor(X_train), torch.tensor(y_train)),
        batch_size=32,
        shuffle=True,
    )

    model = BarakFloodLSTM(
        input_size=len(feature_cols),
        hidden_size=64,
        num_layers=2,
        forecast_horizon=horizon,
    ).to(device)

    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

    epochs = 60
    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        for bx, by in train_loader:
            bx, by = bx.to(device), by.to(device)
            optimizer.zero_grad()
            preds = model(bx)
            loss = criterion(preds, by)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        if epoch % 15 == 0 or epoch == 1:
            avg_loss = total_loss / len(train_loader)
            print(f"Epoch {epoch}/{epochs} | Train MSE Loss: {avg_loss:.6f}")

    ''' Evaluate on 2024 unseen flood year '''
    model.eval()
    with torch.no_grad():
        test_preds_scaled = model(torch.tensor(X_test).to(device)).cpu().numpy()

    preds_m3s = y_scaler.inverse_transform(test_preds_scaled)
    actual_m3s = y_scaler.inverse_transform(y_test)

    print("\n--- 2024 Test Set Performance ---")
    for day in range(horizon):
        rmse = np.sqrt(mean_squared_error(actual_m3s[:, day], preds_m3s[:, day]))
        mae = mean_absolute_error(actual_m3s[:, day], preds_m3s[:, day])
        r2 = r2_score(actual_m3s[:, day], preds_m3s[:, day])
        print(f"Day +{day + 1} Forecast | RMSE: {rmse:.2f} m3/s | MAE: {mae:.2f} m3/s | R2: {r2:.4f}")

    ''' Save trained model weights and scalers for backend inference '''
    model_path = os.path.join(model_dir, "lstm_barak_forecaster.pt")
    scaler_path = os.path.join(model_dir, "lstm_scalers.pkl")

    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "input_size": len(feature_cols),
            "hidden_size": 64,
            "num_layers": 2,
            "forecast_horizon": horizon,
            "lookback": lookback,
            "feature_cols": feature_cols,
        },
        model_path,
    )
    joblib.dump({"x_scaler": x_scaler, "y_scaler": y_scaler}, scaler_path)

    ''' Save 2024 actual vs Day+1 predicted CSV for dashboard verification '''
    test_dates = test_df["date"].iloc[lookback : lookback + len(preds_m3s)].values
    results_df = pd.DataFrame({
        "date": test_dates,
        "actual_day1_m3s": actual_m3s[:, 0],
        "predicted_day1_m3s": preds_m3s[:, 0],
        "predicted_day2_m3s": preds_m3s[:, 1],
        "predicted_day3_m3s": preds_m3s[:, 2],
    })
    results_csv = os.path.join(model_dir, "lstm_test_predictions_2024.csv")
    results_df.to_csv(results_csv, index=False)

    print(f"\nSaved LSTM model to: {model_path}")
    print(f"Saved scalers to: {scaler_path}")
    print(f"Saved 2024 test predictions to: {results_csv}")


if __name__ == "__main__":
    main()