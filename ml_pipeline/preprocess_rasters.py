import os
import numpy as np
import rioxarray


def resize_2d_nearest(arr, target_h, target_w):
    row_idx = np.linspace(0, arr.shape[0] - 1, target_h).astype(int)
    col_idx = np.linspace(0, arr.shape[1] - 1, target_w).astype(int)
    return arr[np.ix_(row_idx, col_idx)].astype(np.float32)


def find_sar_hh(geotiff_dir, date_tag):
    for fname in os.listdir(geotiff_dir):
        if date_tag in fname and fname.endswith("imagery_HH.tif"):
            return os.path.join(geotiff_dir, fname)
    return None


def align_sar_and_mask(sar_path, ref_dem):
    with rioxarray.open_rasterio(sar_path) as sar_src:
        sar_aligned = sar_src.rio.reproject_match(ref_dem).squeeze().values.astype(np.float32)

    valid = np.isfinite(sar_aligned) & (sar_aligned > 0)
    flood_mask = np.zeros_like(sar_aligned, dtype=np.uint8)

    if np.any(valid):
        ''' Low radar backscatter indicates smooth standing floodwater '''
        threshold = np.percentile(sar_aligned[valid], 15)
        flood_mask[valid & (sar_aligned <= threshold)] = 1

    sar_clean = np.where(valid, sar_aligned, 0.0)
    return sar_clean, flood_mask


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    geotiff_dir = os.path.join(base_dir, "collection", "geotiff")
    npy_dir = os.path.join(base_dir, "collection", "npy")
    out_dir = os.path.join(base_dir, "ml_pipeline", "processed_data")
    os.makedirs(out_dir, exist_ok=True)

    ''' 1. Load 30m DEM as the master spatial reference grid '''
    dem_path = os.path.join(geotiff_dir, "cachar_dem_30m.tif")
    with rioxarray.open_rasterio(dem_path) as dem_da:
        dem_ref = dem_da.load()
        dem_arr = dem_ref.squeeze().values.astype(np.float32)

    dem_arr = np.nan_to_num(dem_arr, nan=0.0)
    target_h, target_w = dem_arr.shape
    print(f"Master DEM grid shape: {target_h} x {target_w}")

    ''' 2. Compute terrain slope (physical feature for PINN) '''
    dy, dx = np.gradient(dem_arr, 30.0)
    slope_arr = np.sqrt(dx ** 2 + dy ** 2).astype(np.float32)

    ''' 3. Align Sentinel-2 NDVI and NDWI arrays to the DEM grid '''
    ndvi_raw = np.load(os.path.join(npy_dir, "cachar_ndvi_roughness.npy"))
    ndwi_raw = np.load(os.path.join(npy_dir, "cachar_ndwi_baseline.npy"))
    ndvi_arr = np.nan_to_num(resize_2d_nearest(ndvi_raw, target_h, target_w), nan=0.0)
    ndwi_arr = np.nan_to_num(resize_2d_nearest(ndwi_raw, target_h, target_w), nan=0.0)

    ''' 4. Align peak June 2022 and June 2024 SAR scenes and build flood masks '''
    sar_2022_path = find_sar_hh(geotiff_dir, "24JUN2022")
    sar_2024_path = find_sar_hh(geotiff_dir, "28JUN2024")

    if not sar_2022_path or not sar_2024_path:
        raise FileNotFoundError("Could not find 24JUN2022 or 28JUN2024 imagery_HH.tif in collection/geotiff.")

    print("Aligning June 2022 peak SAR scene...")
    sar_2022, mask_2022 = align_sar_and_mask(sar_2022_path, dem_ref)

    print("Aligning June 2024 peak SAR scene...")
    sar_2024, mask_2024 = align_sar_and_mask(sar_2024_path, dem_ref)

    ''' 5. Save aligned spatial stack as compressed NPZ '''
    out_npz = os.path.join(out_dir, "cachar_spatial_stack.npz")
    np.savez_compressed(
        out_npz,
        dem=dem_arr,
        slope=slope_arr,
        ndvi=ndvi_arr,
        ndwi=ndwi_arr,
        sar_2022=sar_2022,
        mask_2022=mask_2022,
        sar_2024=sar_2024,
        mask_2024=mask_2024,
    )

    size_mb = os.path.getsize(out_npz) / (1024 * 1024)
    print(f"\nSaved aligned spatial stack: {out_npz} ({size_mb:.2f} MB)")
    print(f"Flooded pixels (June 2022): {int(mask_2022.sum())}")
    print(f"Flooded pixels (June 2024): {int(mask_2024.sum())}")


if __name__ == "__main__":
    main()