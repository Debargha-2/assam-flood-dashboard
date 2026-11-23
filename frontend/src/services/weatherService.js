
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Fetch supported Assam locations
export const getLocations = async () => {
    const response = await axios.get(
        `${API_BASE_URL}/api/locations`
    );

    return response.data;
};

// Fetch weather forecast for a selected location
export const getWeatherForecast = async (location) => {
    const response = await axios.get(
        `${API_BASE_URL}/api/weather/forecast`,
        {
            params: { location }
        }
    );

    return response.data;
};
