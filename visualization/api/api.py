from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime
import random

app = FastAPI(
    title="SentryStream SOC API",
    description="Real-Time Intrusion Detection API for IoT Networks",
    version="1.0.0"
)

# Fix: Enable CORS for React Frontend (Port 3000 / 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-Memory State Store
DEVICES_STATE = {
    "device_01": {"ip": "192.168.1.101", "name": "device_01", "status": "Normal", "is_connected": True},
    "device_02": {"ip": "192.168.1.102", "name": "device_02", "status": "Under Attack", "is_connected": True},
    "device_03": {"ip": "192.168.1.103", "name": "device_03", "status": "Normal", "is_connected": True},
    "device_04": {"ip": "192.168.1.104", "name": "device_04", "status": "Under Attack", "is_connected": True},
    "device_05": {"ip": "192.168.1.105", "name": "device_05", "status": "Normal", "is_connected": True},
}

ALERTS_LOG = [
    {
        "id": "ALT-1001",
        "device_name": "device_02",
        "device_ip": "192.168.1.102",
        "attack_type": "DDoS Flood",
        "subtype": "udp",
        "confidence": 0.98,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "severity": "HIGH"
    }
]

class IngestAlertSchema(BaseModel):
    device_name: str
    device_ip: str
    attack: str
    attack_subtype: str
    prediction: int
    confidence: float = 0.95

@app.get("/")
def root():
    return {"message": "SentryStream Real-Time SOC API is online"}

@app.get("/api/stats")
def get_system_stats():
    total_devices = len(DEVICES_STATE)
    active_threats = sum(1 for d in DEVICES_STATE.values() if d["status"] == "Under Attack" and d["is_connected"])
    return {
        "total_monitored_devices": total_devices,
        "active_threats": active_threats,
        "total_alerts_detected": len(ALERTS_LOG),
        "system_status": "MONITORING_ACTIVE"
    }

@app.get("/api/devices")
def get_devices():
    return list(DEVICES_STATE.values())

@app.get("/api/alerts")
def get_alerts(limit: int = 10):
    return ALERTS_LOG[-limit:][::-1]

@app.post("/api/devices/{device_name}/disconnect")
def disconnect_device(device_name: str):
    if device_name not in DEVICES_STATE:
        raise HTTPException(status_code=404, detail="Device not found")
    DEVICES_STATE[device_name]["is_connected"] = False
    DEVICES_STATE[device_name]["status"] = "ISOLATED"
    return {"success": True, "device": DEVICES_STATE[device_name]}

@app.post("/api/ingest-prediction")
def ingest_prediction(alert: IngestAlertSchema):
    if alert.prediction == 0:
        new_alert = {
            "id": f"ALT-{random.randint(2000, 9999)}",
            "device_name": alert.device_name,
            "device_ip": alert.device_ip,
            "attack_type": alert.attack,
            "subtype": alert.attack_subtype,
            "confidence": alert.confidence,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "severity": "HIGH"
        }
        ALERTS_LOG.append(new_alert)
        if alert.device_name in DEVICES_STATE:
            DEVICES_STATE[alert.device_name]["status"] = "Under Attack"
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="[IP_ADDRESS]", port=8080, reload=True)