import json
import os
from datetime import datetime
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import requests
from PIL import Image
import torch
import torch.nn as nn


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


class FloodCNNPINN(nn.Module):
    def __init__(self, in_channels=4):
        super().__init__()
        self.enc1 = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.Conv2d(32, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
        )
        self.pool1 = nn.MaxPool2d(2)

        self.enc2 = nn.Sequential(
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
        )
        self.pool2 = nn.MaxPool2d(2)

        self.bottleneck = nn.Sequential(
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
        )

        self.up2 = nn.ConvTranspose2d(128, 64, kernel_size=2, stride=2)
        self.dec2 = nn.Sequential(
            nn.Conv2d(128, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
        )

        self.up1 = nn.ConvTranspose2d(64, 32, kernel_size=2, stride=2)
        self.dec1 = nn.Sequential(
            nn.Conv2d(64, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
        )

        self.out_conv = nn.Conv2d(32, 1, kernel_size=1)

    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool1(e1))
        b = self.bottleneck(self.pool2(e2))

        d2 = self.up2(b)
        d2 = self.dec2(torch.cat([d2, e2], dim=1))

        d1 = self.up1(d2)
        d1 = self.dec1(torch.cat([d1, e1], dim=1))

        return self.out_conv(d1)


class CacharFloodService:
    def __init__(self):
        self.project_root = Path(__file__).resolve().parents[2]
        self.models_dir = self.project_root / "ml_pipeline" / "models"
        self.data_dir = self.project_root / "ml_pipeline" / "processed_data"
        self.overlay_dir = self.project_root / "backend" / "data" / "cachar_overlays"
        os.makedirs(self.overlay_dir, exist_ok=True)

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.device_label = (
            "PyTorch CUDA Active (" + torch.cuda.get_device_name(0) + ")"
            if torch.cuda.is_available()
            else "PyTorch CPU Active"
        )
        self.cachar_bounds = [[24.50, 92.30], [25.05, 93.10]]
        self.warning_threshold = 650.0
        self.danger_threshold = 850.0
        self.r2_day1 = 0.0
        self.pinn_probs = None

        self._load_lstm()
        self._load_cnn_pinn()

    def _load_lstm(self):
        ckpt_path = self.models_dir / "lstm_barak_forecaster.pt"
        scaler_path = self.models_dir / "lstm_scalers.pkl"
        ts_path = self.data_dir / "cachar_master_timeseries.csv"
        val_path = self.models_dir / "lstm_test_predictions_2024.csv"

        ckpt = torch.load(ckpt_path, map_location=self.device, weights_only=False)
        self.lstm_feature_cols = ckpt["feature_cols"]
        self.lstm_lookback = ckpt["lookback"]

        self.lstm_model = BarakFloodLSTM(
            input_size=ckpt["input_size"],
            hidden_size=ckpt["hidden_size"],
            num_layers=ckpt["num_layers"],
            forecast_horizon=ckpt["forecast_horizon"],
        ).to(self.device)
        self.lstm_model.load_state_dict(ckpt["model_state_dict"])
        self.lstm_model.eval()

        scalers = joblib.load(scaler_path)
        self.x_scaler = scalers["x_scaler"]
        self.y_scaler = scalers["y_scaler"]

        self.ts_df = pd.read_csv(ts_path)
        self.ts_df["date_str"] = pd.to_datetime(self.ts_df["date"]).dt.strftime("%Y-%m-%d")
        self.val_2024_df = pd.read_csv(val_path) if val_path.exists() else pd.DataFrame()

        discharge_series = self.ts_df["river_discharge_m3s"].dropna()
        self.warning_threshold = round(float(np.percentile(discharge_series, 90)), 2)
        self.danger_threshold = round(float(np.percentile(discharge_series, 95)), 2)

        if not self.val_2024_df.empty:
            y_true = self.val_2024_df["actual_day1_m3s"].values.astype(float)
            y_pred = self.val_2024_df["predicted_day1_m3s"].values.astype(float)
            ss_res = float(np.sum((y_true - y_pred) ** 2))
            ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
            self.r2_day1 = round(1.0 - (ss_res / ss_tot), 4) if ss_tot > 0 else 0.0

    def _load_cnn_pinn(self):
        ckpt_path = self.models_dir / "cnn_pinn_flood.pt"
        ckpt = torch.load(ckpt_path, map_location=self.device, weights_only=False)
        self.patch_size = ckpt["patch_size"]
        self.norm_stats = ckpt["norm_stats"]

        self.cnn_model = FloodCNNPINN(in_channels=ckpt["in_channels"]).to(self.device)
        self.cnn_model.load_state_dict(ckpt["model_state_dict"])
        self.cnn_model.eval()

    def _classify_alert(self, discharge_m3s):
        if discharge_m3s >= self.danger_threshold:
            return "Danger"
        if discharge_m3s >= self.warning_threshold:
            return "Warning"
        return "Normal"

    def _save_mask_png(self, mask_2d, out_path, rgba_color):
        h, w = mask_2d.shape
        rgba = np.zeros((h, w, 4), dtype=np.uint8)
        flooded = mask_2d == 1
        rgba[flooded] = rgba_color
        Image.fromarray(rgba, mode="RGBA").save(out_path, optimize=True)

    def _run_full_map_pinn_probs(self, features_4ch):
        _, h, w = features_4ch.shape
        ps = self.patch_size
        rem_h = h - int(h / ps) * ps
        rem_w = w - int(w / ps) * ps
        pad_h = 0 if rem_h == 0 else (ps - rem_h)
        pad_w = 0 if rem_w == 0 else (ps - rem_w)

        padded = np.pad(features_4ch, ((0, 0), (0, pad_h), (0, pad_w)), mode="edge")
        _, ph, pw = padded.shape

        patches = []
        coords = []
        for r in range(0, ph, ps):
            for c in range(0, pw, ps):
                patches.append(padded[:, r : r + ps, c : c + ps])
                coords.append((r, c))

        batch_tensor = torch.tensor(np.array(patches, dtype=np.float32))
        prob_map = np.zeros((ph, pw), dtype=np.float32)

        with torch.no_grad():
            for idx in range(0, len(batch_tensor), 64):
                sub = batch_tensor[idx : idx + 64].to(self.device)
                probs = torch.sigmoid(self.cnn_model(sub)).cpu().numpy()[:, 0, :, :]
                for b_i, (r, c) in enumerate(coords[idx : idx + 64]):
                    prob_map[r : r + ps, c : c + ps] = probs[b_i]

        return prob_map[:h, :w]

    def _ensure_pinn_probs(self, force_refresh=False):
        probs_file = self.overlay_dir / "cachar_pinn_probs.npy"
        if not force_refresh and self.pinn_probs is not None:
            return self.pinn_probs

        if not force_refresh and probs_file.exists():
            self.pinn_probs = np.load(probs_file).astype(np.float32)
            return self.pinn_probs

        stack = np.load(self.data_dir / "cachar_spatial_stack.npz")
        channels = []
        for key in ["dem", "slope", "ndvi", "ndwi"]:
            low, high = self.norm_stats[key]
            clipped = np.clip(stack[key], low, high)
            denom = (high - low) if (high - low) > 1e-6 else 1.0
            channels.append(((clipped - low) / denom).astype(np.float32))

        features_4ch = np.stack(channels, axis=0)
        probs = self._run_full_map_pinn_probs(features_4ch)
        np.save(probs_file, probs.astype(np.float16))
        self.pinn_probs = probs
        return self.pinn_probs

    def _generate_coupled_flood_map(self, peak_discharge_m3s, peak_alert_status):
        ''' Couple LSTM peak discharge directly to the CNN-PINN spatial probability field '''
        probs = self._ensure_pinn_probs(force_refresh=False)
        ratio = float(peak_discharge_m3s) / max(self.danger_threshold, 1.0)
        prob_cutoff = float(np.clip(0.50 + 0.55 * (1.0 - ratio), 0.18, 0.95))

        dynamic_mask = (probs >= prob_cutoff).astype(np.uint8)
        dynamic_png = self.overlay_dir / "cachar_dynamic_predicted.png"

        if peak_alert_status == "Danger":
            color_rgba = (239, 68, 68, 190)
        elif peak_alert_status == "Warning":
            color_rgba = (245, 158, 11, 185)
        else:
            color_rgba = (14, 165, 233, 180)

        self._save_mask_png(dynamic_mask, dynamic_png, color_rgba)

        pixel_km2 = 0.0009
        flooded_pixels = int(dynamic_mask.sum())
        return {
            "label": "Live Coupled LSTM + CNN-PINN Flood Extent",
            "url": "/api/cachar/overlay/dynamic_predicted",
            "peak_predicted_discharge_m3s": round(float(peak_discharge_m3s), 2),
            "peak_alert_status": peak_alert_status,
            "prob_cutoff": round(prob_cutoff, 3),
            "flooded_pixels": flooded_pixels,
            "inundated_area_km2": round(float(flooded_pixels) * pixel_km2, 2),
        }

    def _run_lstm_window(self, window_df, base_date_str, rain_multiplier=1.0, data_source="Historical Dataset", recent_history_df=None):
        scaled_x = self.x_scaler.transform(window_df[self.lstm_feature_cols])
        x_tensor = torch.tensor(scaled_x, dtype=torch.float32).unsqueeze(0).to(self.device)

        with torch.no_grad():
            pred_scaled = self.lstm_model(x_tensor).cpu().numpy()

        pred_m3s = self.y_scaler.inverse_transform(pred_scaled)[0]
        base_date = pd.to_datetime(base_date_str)

        forecast_days = []
        for step in range(3):
            f_date = (base_date + pd.Timedelta(days=step + 1)).strftime("%Y-%m-%d")
            val = max(0.0, round(float(pred_m3s[step]), 2))
            forecast_days.append({
                "horizon_days": step + 1,
                "date": f_date,
                "predicted_discharge_m3s": val,
                "alert_status": self._classify_alert(val),
            })

        latest_row = window_df.iloc[-1]
        current_val = round(float(latest_row["river_discharge_m3s"]), 2)
        peak_pred = max(d["predicted_discharge_m3s"] for d in forecast_days)
        peak_alert = self._classify_alert(peak_pred)

        dynamic_spatial = self._generate_coupled_flood_map(peak_pred, peak_alert)

        hist_source = recent_history_df if recent_history_df is not None else window_df
        recent_history = [
            {
                "date": str(row["date_str"])[:10],
                "actual_discharge_m3s": round(float(row["river_discharge_m3s"]), 2),
                "upstream_rain_mm": round(float(row["upstream_total_precip_mm"]), 2),
            }
            for _, row in hist_source.iterrows()
        ]

        return {
            "station": "Barak River (Silchar, Cachar)",
            "data_source": data_source,
            "reference_date": base_date_str,
            "rain_multiplier": rain_multiplier,
            "current_discharge_m3s": current_val,
            "current_alert_status": self._classify_alert(current_val),
            "thresholds": {
                "warning_m3s": self.warning_threshold,
                "danger_m3s": self.danger_threshold,
            },
            "model_meta": {
                "device_label": self.device_label,
                "r2_day1": self.r2_day1,
                "min_date": str(self.ts_df["date_str"].iloc[self.lstm_lookback]),
                "max_date": str(self.ts_df["date_str"].iloc[-1]),
            },
            "upstream_catchment_rain_mm": {
                "haflong": round(float(latest_row["haflong_precip_mm"]), 2),
                "jiribam": round(float(latest_row["jiribam_precip_mm"]), 2),
                "tipaimukh": round(float(latest_row["tipaimukh_precip_mm"]), 2),
                "total": round(float(latest_row["upstream_total_precip_mm"]), 2),
            },
            "forecast_3day": forecast_days,
            "dynamic_spatial": dynamic_spatial,
            "recent_30d_history": recent_history,
        }

    def predict_discharge(self, target_date=None, rain_multiplier=1.0):
        df = self.ts_df
        if target_date and target_date in set(df["date_str"]):
            end_idx = int(df.index[df["date_str"] == target_date][0])
        else:
            end_idx = len(df) - 1

        end_idx = max(self.lstm_lookback - 1, end_idx)
        start_idx = end_idx - self.lstm_lookback + 1
        window_df = df.iloc[start_idx : end_idx + 1].copy()

        if rain_multiplier != 1.0:
            scale = float(rain_multiplier)
            rain_cols = [
                "precipitation",
                "haflong_precip_mm",
                "jiribam_precip_mm",
                "tipaimukh_precip_mm",
                "upstream_total_precip_mm",
                "upstream_precip_lag1",
                "upstream_precip_lag2",
            ]
            for col in rain_cols:
                if col in window_df.columns:
                    window_df[col] = window_df[col] * scale

        history_slice = df.iloc[max(0, end_idx - 29) : end_idx + 1].copy()
        return self._run_lstm_window(
            window_df=window_df,
            base_date_str=df.iloc[end_idx]["date_str"],
            rain_multiplier=rain_multiplier,
            data_source="Historical Dataset Replay",
            recent_history_df=history_slice,
        )

    def predict_from_custom_data(
        self,
        current_discharge_m3s,
        silchar_rain_mm,
        haflong_rain_mm,
        jiribam_rain_mm,
        tipaimukh_rain_mm,
        reference_date=None,
    ):
        ''' Match closest historical antecedent flow window, append new sensor data, and run LSTM + CNN-PINN '''
        df = self.ts_df
        valid_candidates = df.iloc[self.lstm_lookback :]
        diffs = (valid_candidates["river_discharge_m3s"] - float(current_discharge_m3s)).abs()
        best_idx = int(diffs.idxmin())

        base_slice = df.iloc[best_idx - self.lstm_lookback + 1 : best_idx + 1].copy().reset_index(drop=True)
        shifted_window = base_slice.iloc[1:].copy().reset_index(drop=True)

        new_row = base_slice.iloc[-1].copy()
        ref_date = reference_date if reference_date else datetime.now().strftime("%Y-%m-%d")
        upstream_total = float(haflong_rain_mm) + float(jiribam_rain_mm) + float(tipaimukh_rain_mm)

        new_row["date_str"] = ref_date
        new_row["river_discharge_m3s"] = float(current_discharge_m3s)
        if "precipitation" in new_row.index:
            new_row["precipitation"] = float(silchar_rain_mm)
        if "haflong_precip_mm" in new_row.index:
            new_row["haflong_precip_mm"] = float(haflong_rain_mm)
        if "jiribam_precip_mm" in new_row.index:
            new_row["jiribam_precip_mm"] = float(jiribam_rain_mm)
        if "tipaimukh_precip_mm" in new_row.index:
            new_row["tipaimukh_precip_mm"] = float(tipaimukh_rain_mm)
        if "upstream_total_precip_mm" in new_row.index:
            new_row["upstream_total_precip_mm"] = upstream_total
        if "upstream_precip_lag1" in new_row.index:
            new_row["upstream_precip_lag1"] = float(base_slice.iloc[-1]["upstream_total_precip_mm"])
        if "upstream_precip_lag2" in new_row.index:
            new_row["upstream_precip_lag2"] = float(base_slice.iloc[-2]["upstream_total_precip_mm"])

        window_df = pd.concat([shifted_window, pd.DataFrame([new_row])], ignore_index=True)

        ''' Rebuild sequential dates ending on the user reference date for clean chart display '''
        end_dt = pd.to_datetime(ref_date)
        n_rows = len(window_df)
        window_df["date_str"] = [
            (end_dt - pd.Timedelta(days=(n_rows - 1 - i))).strftime("%Y-%m-%d")
            for i in range(n_rows)
        ]

        return self._run_lstm_window(
            window_df=window_df,
            base_date_str=ref_date,
            rain_multiplier=1.0,
            data_source="Custom New Sensor Input",
            recent_history_df=window_df,
        )

    def _fetch_open_meteo_rain(self, lat, lon, past_days):
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": "precipitation_sum",
            "past_days": past_days,
            "forecast_days": 1,
            "timezone": "Asia/Kolkata",
        }
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        daily = resp.json().get("daily", {})
        return pd.Series(
            data=daily.get("precipitation_sum", []),
            index=daily.get("time", []),
            dtype=float,
        )

    def _fetch_open_meteo_discharge(self, lat, lon, past_days):
        url = "https://flood-api.open-meteo.com/v1/flood"
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": "river_discharge",
            "past_days": past_days,
            "forecast_days": 1,
        }
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        daily = resp.json().get("daily", {})
        return pd.Series(
            data=daily.get("river_discharge", []),
            index=daily.get("time", []),
            dtype=float,
        )

    def predict_from_live_open_meteo(self):
        ''' Fetch real-time rainfall and GloFAS discharge for the Barak catchment up to today '''
        past_days = max(self.lstm_lookback + 5, 25)
        silchar_rain = self._fetch_open_meteo_rain(24.8333, 92.7789, past_days)
        haflong_rain = self._fetch_open_meteo_rain(25.1700, 93.0100, past_days)
        jiribam_rain = self._fetch_open_meteo_rain(24.8000, 93.1200, past_days)
        tipaimukh_rain = self._fetch_open_meteo_rain(24.2300, 93.0200, past_days)
        barak_discharge = self._fetch_open_meteo_discharge(24.8333, 92.7789, past_days)

        live_df = pd.DataFrame({
            "precipitation": silchar_rain,
            "haflong_precip_mm": haflong_rain,
            "jiribam_precip_mm": jiribam_rain,
            "tipaimukh_precip_mm": tipaimukh_rain,
            "river_discharge_m3s": barak_discharge,
        }).sort_index()

        live_df = live_df.ffill().bfill().fillna(0.0)
        live_df["upstream_total_precip_mm"] = (
            live_df["haflong_precip_mm"]
            + live_df["jiribam_precip_mm"]
            + live_df["tipaimukh_precip_mm"]
        )
        live_df["upstream_precip_lag1"] = live_df["upstream_total_precip_mm"].shift(1).bfill()
        live_df["upstream_precip_lag2"] = live_df["upstream_total_precip_mm"].shift(2).bfill()
        live_df = live_df.tail(self.lstm_lookback).copy()
        live_df["date_str"] = live_df.index.astype(str)

        ''' Populate any auxiliary features from a matching template window in ts_df '''
        live_reset = live_df.reset_index(drop=True)
        template_window = self.ts_df.tail(len(live_reset)).copy().reset_index(drop=True)
        for col in live_reset.columns:
            if col in template_window.columns:
                template_window[col] = live_reset[col].values

        ref_date = str(template_window["date_str"].iloc[-1])
        return self._run_lstm_window(
            window_df=template_window,
            base_date_str=ref_date,
            rain_multiplier=1.0,
            data_source="Live Open-Meteo + GloFAS API",
            recent_history_df=template_window,
        )

    def get_2024_validation_series(self):
        if self.val_2024_df.empty:
            return []
        return [
            {
                "date": str(row["date"])[:10],
                "actual_m3s": round(float(row["actual_day1_m3s"]), 2),
                "predicted_day1_m3s": round(float(row["predicted_day1_m3s"]), 2),
                "predicted_day2_m3s": round(float(row["predicted_day2_m3s"]), 2),
                "predicted_day3_m3s": round(float(row["predicted_day3_m3s"]), 2),
            }
            for _, row in self.val_2024_df.iterrows()
        ]

    def generate_spatial_overlays(self, force_refresh=False):
        pinn_png = self.overlay_dir / "cachar_pinn_predicted.png"
        sar_2022_png = self.overlay_dir / "cachar_sar_2022.png"
        sar_2024_png = self.overlay_dir / "cachar_sar_2024.png"
        meta_file = self.overlay_dir / "overlay_stats.json"

        probs = self._ensure_pinn_probs(force_refresh=force_refresh)

        if (
            not force_refresh
            and pinn_png.exists()
            and sar_2022_png.exists()
            and sar_2024_png.exists()
            and meta_file.exists()
        ):
            with open(meta_file, "r", encoding="utf-8") as f:
                return json.load(f)

        stack = np.load(self.data_dir / "cachar_spatial_stack.npz")
        pinn_mask = (probs >= 0.5).astype(np.uint8)
        mask_2022 = stack["mask_2022"].astype(np.uint8)
        mask_2024 = stack["mask_2024"].astype(np.uint8)

        self._save_mask_png(pinn_mask, pinn_png, (14, 165, 233, 185))
        self._save_mask_png(mask_2022, sar_2022_png, (239, 68, 68, 175))
        self._save_mask_png(mask_2024, sar_2024_png, (245, 158, 11, 175))

        pixel_km2 = 0.0009
        stats = {
            "district": "Cachar (Barak Valley)",
            "bounds": self.cachar_bounds,
            "grid_resolution": [int(pinn_mask.shape[0]), int(pinn_mask.shape[1])],
            "layers": {
                "pinn_predicted": {
                    "label": "CNN-PINN Baseline Flood Risk (0.50 Cutoff)",
                    "url": "/api/cachar/overlay/pinn_predicted",
                    "flooded_pixels": int(pinn_mask.sum()),
                    "inundated_area_km2": round(float(pinn_mask.sum()) * pixel_km2, 2),
                },
                "sar_2022": {
                    "label": "June 2022 Peak Flood (EOS-04 SAR)",
                    "url": "/api/cachar/overlay/sar_2022",
                    "flooded_pixels": int(mask_2022.sum()),
                    "inundated_area_km2": round(float(mask_2022.sum()) * pixel_km2, 2),
                },
                "sar_2024": {
                    "label": "June 2024 Peak Flood (EOS-04 SAR)",
                    "url": "/api/cachar/overlay/sar_2024",
                    "flooded_pixels": int(mask_2024.sum()),
                    "inundated_area_km2": round(float(mask_2024.sum()) * pixel_km2, 2),
                },
            },
        }

        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(stats, f, indent=2)

        return stats