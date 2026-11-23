import requests
import os
from datetime import datetime, timedelta, timezone

class BhoonidhiClient:
    def __init__(self, user_id, password):
        self.user_id = user_id
        self.password = password
        self.base_url = "https://bhoonidhi-api.nrsc.gov.in"
        self.access_token = None

    def authenticate(self):
        print("Authenticating with Bhoonidhi API...")
        url = f"{self.base_url}/auth/token"
        payload = {
            "userId": self.user_id,
            "password": self.password,
            "grant_type": "password"
        }
        
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            self.access_token = response.json().get("access_token")
            print("Authentication successful! Token acquired.")
        else:
            print(f"Auth Failed: {response.status_code} - {response.text}")
            raise Exception("Authentication failed. Check your credentials.")

    def search_imagery_by_location(self, lat, lon, buffer_deg=0.2, days_back=365):
        """Creates a dynamic bounding box around any given coordinate"""
        print(f"\nSearching satellite passes for Lat: {lat}, Lon: {lon}...")
        
        # Calculate dynamic bounding box: [minLon, minLat, maxLon, maxLat]
        bbox_dynamic = [
            str(round(lon - buffer_deg, 2)), 
            str(round(lat - buffer_deg, 2)), 
            str(round(lon + buffer_deg, 2)), 
            str(round(lat + buffer_deg, 2))
        ]
        
        url = f"{self.base_url}/data/search"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days_back)
        time_window = f"{start_date.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end_date.strftime('%Y-%m-%dT%H:%M:%SZ')}"

        payload = {
            "collections": ["EOS-04_SAR-MRS_L2A", "Sentinel-1A_SAR-IW_SLC"],
            "bbox": bbox_dynamic,
            "datetime": time_window,
            "limit": 5
        }

        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code == 200:
            return response.json().get("features", [])
        else:
            print(f"Search Failed: {response.status_code} - {response.text}")
            return []