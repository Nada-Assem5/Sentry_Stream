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

# Enable CORS for React/Vite communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- In-Memory State Store (Simulating HBase / Elasticsearch state) ---
DEVICES_STATE = {
    "device_01": {"ip": "192.168.1.101", "name": "device_01", "status": "Normal", "last_seen": str(datetime.now()), "is_connected": True},
    "device_02": {"ip": "192.168.1.102", "name": "device_02", "status": "Under Attack", "last_seen": str(datetime.now()), "is_connected": True},
    "device_03": {"ip": "192.168.1.103", "name": "device_03", "status": "Normal", "last_seen": str(datetime.now()), "is_connected": True},
    "device_04": {"ip": "192.168.1.104", "name": "device_04", "status": "Under Attack", "last_seen": str(datetime.now()), "is_connected": True},
    "device_05": {"ip": "192.168.1.105", "name": "device_05", "status": "Normal", "last_seen": str(datetime.now()), "is_connected": True},
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
    },
    {
        "id": "ALT-1002",
        "device_name": "device_04",
        "device_ip": "192.168.1.104",
        "attack_type": "Botnet Activity",
        "subtype": "mirai",
        "confidence": 0.94,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "severity": "CRITICAL"
    }
]

# --- Pydantic Data Models ---
class IngestAlertSchema(BaseModel):
    device_name: str
    device_ip: str
    attack: str
    attack_subtype: str
    prediction: int  # 0 = Attack, 1 = Normal
    confidence: float = 0.95

# --- API Endpoints ---

@app.get("/")
def root():
    """Health check endpoint."""
    return {"message": "SentryStream Real-Time SOC API is online"}

@app.get("/api/stats")
def get_system_stats():
    """Retrieve global system statistics for the top metrics bar."""
    total_devices = len(DEVICES_STATE)
    active_threats = sum(1 for d in DEVICES_STATE.values() if d["status"] == "Under Attack" and d["is_connected"])
    total_alerts = len(ALERTS_LOG)
    
    return {
        "total_monitored_devices": total_devices,
        "active_threats": active_threats,
        "total_alerts_detected": total_alerts,
        "system_status": "MONITORING_ACTIVE",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/devices")
def get_all_devices():
    """Fetch current status and connectivity state of all IoT devices."""
    return list(DEVICES_STATE.values())

@app.get("/api/alerts")
def get_recent_alerts(limit: int = 10):
    """Retrieve the latest detected security intrusions and alerts."""
    return ALERTS_LOG[-limit:][::-1]

@app.post("/api/devices/{device_name}/disconnect")
def disconnect_compromised_device(device_name: str):
    """Isolate and disconnect a flagged or compromised device."""
    if device_name not in DEVICES_STATE:
        raise HTTPException(status_code=404, detail="Device not found")
    
    DEVICES_STATE[device_name]["is_connected"] = False
    DEVICES_STATE[device_name]["status"] = "ISOLATED"
    return {
        "success": True,
        "message": f"Device {device_name} has been disconnected and isolated successfully.",
        "device": DEVICES_STATE[device_name]
    }

@app.post("/api/ingest-prediction")
def ingest_prediction_from_spark(alert: IngestAlertSchema):
    """Receive live attack classifications from the Spark Streaming job."""
    if alert.prediction == 0:  # 0 represents Attack traffic
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
            DEVICES_STATE[alert.device_name]["last_seen"] = str(datetime.now())
            
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    # Start ASGI server on port 8000
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)