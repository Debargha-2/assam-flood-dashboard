import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import assamDistricts from "../data/assam-districts.json";

function CesiumGlobe({ targetLocation }) {
  const globeRef = useRef(null);
  const viewerRef = useRef(null);
  const selectionEntitiesRef = useRef([]);

  useEffect(() => {
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (token) {
      Cesium.Ion.defaultAccessToken = token;
    }

    const viewer = new Cesium.Viewer(globeRef.current, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
    });

    viewerRef.current = viewer;

    /* Turn off solar night-side shading so Assam stays brightly visible at night */
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#1e3a5f");

    /* Load reliable satellite imagery directly without depending on default Ion tokens */
    try {
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          maximumLevel: 18,
        })
      );
    } catch (imgError) {
      console.error("Satellite imagery layer failed to initialize:", imgError);
    }

    Cesium.GeoJsonDataSource.load(assamDistricts, {
      stroke: Cesium.Color.CYAN,
      strokeWidth: 2,
      fill: Cesium.Color.CYAN.withAlpha(0.08),
    })
      .then((dataSource) => {
        if (viewer.isDestroyed()) return;
        viewer.dataSources.add(dataSource);

        dataSource.entities.values.forEach((entity) => {
          const districtName = entity.properties?.district?.getValue();
          if (districtName) {
            entity.name = districtName;
          }
          if (districtName && entity.position) {
            entity.label = new Cesium.LabelGraphics({
              text: districtName,
              font: "12px sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              scaleByDistance: new Cesium.NearFarScalar(100000, 1.0, 1000000, 0.0),
            });
          }
        });
      })
      .catch((error) => console.error("District GeoJSON loading failed:", error));

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(92.5, 27.2, 450000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-35),
        roll: 0,
      },
      duration: 2.0,
    });

    return () => {
      selectionEntitiesRef.current = [];
      viewerRef.current = null;
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    selectionEntitiesRef.current.forEach((entity) => {
      viewer.entities.remove(entity);
    });
    selectionEntitiesRef.current = [];

    if (!targetLocation) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(92.5, 27.2, 450000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-35),
          roll: 0,
        },
        duration: 1.8,
      });
      return;
    }

    const lat = Number(targetLocation.lat);
    const lng = Number(targetLocation.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    const halfSpanLat = targetLocation.halfSpanLat || 0.055;
    const halfSpanLng = targetLocation.halfSpanLng || 0.075;

    const west = lng - halfSpanLng;
    const south = lat - halfSpanLat;
    const east = lng + halfSpanLng;
    const north = lat + halfSpanLat;

    const labelName = targetLocation.name || "Selected Location";
    const districtLabel = targetLocation.district || "Assam";
    const stationCode = targetLocation.stationId || "N/A";
    const cyanColor = Cesium.Color.fromCssColorString("#38bdf8");

    /* 1. Translucent filled rectangular selection box */
    const rectFillEntity = viewer.entities.add({
      name: labelName,
      description:
        "<table class='cesium-infoBox-defaultTable'><tbody>" +
        "<tr><th>Station</th><td>" + labelName + "</td></tr>" +
        "<tr><th>Station ID</th><td>" + stationCode + "</td></tr>" +
        "<tr><th>District</th><td>" + districtLabel + "</td></tr>" +
        "<tr><th>Center</th><td>" + lat.toFixed(4) + ", " + lng.toFixed(4) + "</td></tr>" +
        "</tbody></table>",
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
        height: 20,
        material: cyanColor.withAlpha(0.22),
        outline: true,
        outlineColor: cyanColor,
      },
    });

    /* 2. Solid rectangular border polyline */
    const rectBorderEntity = viewer.entities.add({
      name: labelName + " Boundary",
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          west, south, 60,
          east, south, 60,
          east, north, 60,
          west, north, 60,
          west, south, 60,
        ]),
        width: 3,
        material: cyanColor,
      },
    });

    /* 3. Center station marker and label */
    const pinEntity = viewer.entities.add({
      name: labelName,
      position: Cesium.Cartesian3.fromDegrees(lng, lat, 120),
      point: {
        pixelSize: 11,
        color: cyanColor,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: labelName,
        font: "600 13px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString("#0f172a"),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
      },
    });

    selectionEntitiesRef.current = [rectFillEntity, rectBorderEntity, pinEntity];

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        lng,
        lat - 0.14,
        targetLocation.height || 24000
      ),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-48),
        roll: 0,
      },
      duration: 2.0,
    });
  }, [targetLocation]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "600px",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div
        ref={globeRef}
        style={{
          width: "100%",
          height: "100%",
        }}
      />

      {targetLocation && (
        <div
          style={{
            position: "absolute",
            top: "14px",
            left: "14px",
            zIndex: 10,
            background: "rgba(15, 28, 46, 0.9)",
            border: "1px solid #38bdf8",
            borderRadius: "8px",
            padding: "10px 14px",
            color: "#f8fafc",
            fontSize: "12px",
            minWidth: "215px",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              color: "#38bdf8",
              fontWeight: 700,
              marginBottom: "6px",
              paddingBottom: "4px",
              borderBottom: "1px solid #293e59",
            }}
          >
            Selected Zone: {targetLocation.name || "Target Station"}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "2px" }}>
            <span style={{ color: "#94a3b8" }}>District:</span>
            <strong>{targetLocation.district || "Assam"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "2px" }}>
            <span style={{ color: "#94a3b8" }}>Station ID:</span>
            <strong>{targetLocation.stationId || "N/A"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ color: "#94a3b8" }}>Coordinates:</span>
            <strong>
              {Number(targetLocation.lat).toFixed(3)}, {Number(targetLocation.lng).toFixed(3)}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}

export default CesiumGlobe;