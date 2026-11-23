import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
import os

def create_presentation_chart():
    os.makedirs("visualizations", exist_ok=True)
    
    # 1. Generate realistic simulated hydrograph data for the presentation
    time_series = pd.date_range(start="2026-07-01", periods=72, freq="H")
    
    # Simulate a flood wave rising
    base_level = 74.0
    storm_surge = np.linspace(0, 5.2, 72) + np.random.normal(0, 0.2, 72)
    water_levels = base_level + storm_surge
    
    # AI Prediction (last 6 hours)
    ai_prediction = water_levels[-6:] + np.random.normal(0, 0.1, 6)
    ai_time = time_series[-6:]
    
    # 2. Plotting setup
    plt.figure(figsize=(12, 6))
    plt.style.use('dark_background') # Looks great on presentation slides
    
    # Plot real telemetry
    plt.plot(time_series[:-6], water_levels[:-6], color='cyan', linewidth=2.5, label='IoT Sensor Telemetry (Past)')
    
    # Plot AI Prediction
    plt.plot(ai_time, ai_prediction, color='yellow', linestyle='--', linewidth=2.5, marker='o', label='PINN Forecast (+6h)')
    
    # Uncertainty shading
    plt.fill_between(ai_time, ai_prediction - 0.3, ai_prediction + 0.3, color='yellow', alpha=0.2, label='AI Uncertainty (Monte Carlo)')
    
    # Threshold Lines
    plt.axhline(y=77.5, color='orange', linestyle='-', linewidth=2, label='Warning Level (77.5m)')
    plt.axhline(y=78.5, color='red', linestyle='-', linewidth=2, label='Danger Level (78.5m)')
    
    # Formatting
    plt.title('Digital Twin: Jia Bharali River Flood Forecast (AI vs Thresholds)', fontsize=16, pad=15)
    plt.xlabel('Timeline', fontsize=12)
    plt.ylabel('Stage Height (Meters)', fontsize=12)
    plt.grid(True, alpha=0.2)
    plt.legend(loc='upper left', fontsize=10)
    plt.tight_layout()
    
    # Save the chart
    save_path = "visualizations/flood_forecast_slide.png"
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    print(f"Chart successfully generated and saved to: {save_path}")

if __name__ == "__main__":
    create_presentation_chart()