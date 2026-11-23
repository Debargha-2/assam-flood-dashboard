import os
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset


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


def soft_dice_loss(probs, targets, smooth=1.0):
    intersection = (probs * targets).sum(dim=(1, 2, 3))
    union = probs.sum(dim=(1, 2, 3)) + targets.sum(dim=(1, 2, 3))
    dice = (2.0 * intersection + smooth) / (union + smooth)
    return 1.0 - dice.mean()


def physics_informed_loss(logits, targets, inputs, pos_weight, lambda_elev=0.05, lambda_slope=0.03):
    bce = nn.functional.binary_cross_entropy_with_logits(
        logits, targets, pos_weight=pos_weight
    )
    probs = torch.sigmoid(logits)
    dice = soft_dice_loss(probs, targets)

    ''' Channel 0 is normalized DEM elevation, Channel 1 is normalized slope '''
    elev_norm = inputs[:, 0:1, :, :]
    slope_norm = inputs[:, 1:2, :, :]

    ''' Penalize predicting floodwater on high elevation or steep hills '''
    high_elev_penalty = torch.mean(probs * torch.relu(elev_norm - 0.35))
    steep_slope_penalty = torch.mean(probs * torch.relu(slope_norm - 0.30))

    return (0.5 * bce) + (0.5 * dice) + (lambda_elev * high_elev_penalty) + (lambda_slope * steep_slope_penalty)


def extract_patches(features, mask, patch_size=64, stride=64, balance_training=False):
    _, h, w = features.shape
    X_patches, y_patches = [], []
    dry_counter = 0

    for r in range(0, h - patch_size + 1, stride):
        for c in range(0, w - patch_size + 1, stride):
            x_p = features[:, r : r + patch_size, c : c + patch_size]
            y_p = mask[r : r + patch_size, c : c + patch_size]

            if balance_training and y_p.sum() == 0:
                dry_counter += 1
                if dry_counter not in (1, 5, 9, 13, 17):
                    if dry_counter >= 20:
                        dry_counter = 0
                    continue
                if dry_counter >= 20:
                    dry_counter = 0

            X_patches.append(x_p)
            y_patches.append(y_p[np.newaxis, :, :])

    return np.array(X_patches, dtype=np.float32), np.array(y_patches, dtype=np.float32)


def normalize_channel(arr):
    p1, p99 = np.percentile(arr, [1, 99])
    clipped = np.clip(arr, p1, p99)
    denom = (p99 - p1) if (p99 - p1) > 1e-6 else 1.0
    norm = (clipped - p1) / denom
    return norm.astype(np.float32), float(p1), float(p99)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = (
        os.path.dirname(script_dir)
        if os.path.basename(script_dir) == "ml_pipeline"
        else script_dir
    )
    npz_path = os.path.join(base_dir, "ml_pipeline", "processed_data", "cachar_spatial_stack.npz")
    model_dir = os.path.join(base_dir, "ml_pipeline", "models")
    os.makedirs(model_dir, exist_ok=True)

    print("Loading aligned Cachar spatial stack...")
    data = np.load(npz_path)

    dem_norm, dem_min, dem_max = normalize_channel(data["dem"])
    slope_norm, slope_min, slope_max = normalize_channel(data["slope"])
    ndvi_norm, ndvi_min, ndvi_max = normalize_channel(data["ndvi"])
    ndwi_norm, ndwi_min, ndwi_max = normalize_channel(data["ndwi"])

    features = np.stack([dem_norm, slope_norm, ndvi_norm, ndwi_norm], axis=0)
    mask_2022 = data["mask_2022"].astype(np.float32)
    mask_2024 = data["mask_2024"].astype(np.float32)

    print("Extracting balanced 64x64 spatial patches...")
    X_train, y_train = extract_patches(
        features, mask_2022, patch_size=64, stride=32, balance_training=True
    )
    X_test, y_test = extract_patches(
        features, mask_2024, patch_size=64, stride=64, balance_training=False
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    pos_pixels = max(float(y_train.sum()), 1.0)
    neg_pixels = float(y_train.size - pos_pixels)
    pos_weight_val = min(neg_pixels / pos_pixels, 8.0)
    pos_weight = torch.tensor([pos_weight_val], dtype=torch.float32, device=device)

    print(f"Training CNN-PINN on device: {device} | Positive class weight: {pos_weight_val:.2f}")
    print(f"Train patches (June 2022): {len(X_train)} | Test patches (June 2024): {len(X_test)}")

    train_loader = DataLoader(
        TensorDataset(torch.tensor(X_train), torch.tensor(y_train)),
        batch_size=32,
        shuffle=True,
    )
    test_loader = DataLoader(
        TensorDataset(torch.tensor(X_test), torch.tensor(y_test)),
        batch_size=32,
        shuffle=False,
    )

    model = FloodCNNPINN(in_channels=4).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

    epochs = 30
    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        for bx, by in train_loader:
            bx, by = bx.to(device), by.to(device)
            optimizer.zero_grad()
            logits = model(bx)
            loss = physics_informed_loss(logits, by, bx, pos_weight)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        if epoch in (1, 5, 10, 15, 20, 25, 30):
            avg_loss = total_loss / len(train_loader)
            print(f"Epoch {epoch}/{epochs} | Train PINN Loss: {avg_loss:.4f}")

    ''' Evaluate across full June 2024 Cachar map '''
    model.eval()
    tp = fp = fn = tn = 0
    with torch.no_grad():
        for bx, by in test_loader:
            bx, by = bx.to(device), by.to(device)
            preds = (torch.sigmoid(model(bx)) >= 0.5).float()
            tp += torch.logical_and(preds == 1, by == 1).sum().item()
            fp += torch.logical_and(preds == 1, by == 0).sum().item()
            fn += torch.logical_and(preds == 0, by == 1).sum().item()
            tn += torch.logical_and(preds == 0, by == 0).sum().item()

    accuracy = (tp + tn) / max(tp + tn + fp + fn, 1)
    iou = tp / max(tp + fp + fn, 1)
    f1 = (2 * tp) / max((2 * tp) + fp + fn, 1)

    print("\n--- June 2024 Unseen Flood Spatial Test Performance ---")
    print(f"Pixel Accuracy: {accuracy:.4f}")
    print(f"Flood IoU:      {iou:.4f}")
    print(f"Flood F1-Score: {f1:.4f}")

    ''' Save updated CNN-PINN weights and normalization bounds for backend '''
    model_path = os.path.join(model_dir, "cnn_pinn_flood.pt")
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "in_channels": 4,
            "patch_size": 64,
            "norm_stats": {
                "dem": (dem_min, dem_max),
                "slope": (slope_min, slope_max),
                "ndvi": (ndvi_min, ndvi_max),
                "ndwi": (ndwi_min, ndwi_max),
            },
        },
        model_path,
    )
    print(f"\nSaved updated CNN-PINN model to: {model_path}")


if __name__ == "__main__":
    main()