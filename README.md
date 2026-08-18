# 🛡️ SentryStream - Real-Time IoT Network Intrusion Detection Pipeline

> A real-time big data processing pipeline and interactive security dashboard for IoT network intrusion detection, built for the Huawei HCIA-Big Data training program.

![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-2.12-22B5BF?logo=react&logoColor=white)
![Apache Kafka](https://img.shields.io/badge/Apache_Kafka-4.0-231F20?logo=apachekafka&logoColor=white)
![Apache Spark](https://img.shields.io/badge/Apache_Spark-3.5-E25A1C?logo=apachespark&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

---

## 📌 Overview

Connected smart home and IoT devices (smart cameras, door locks, thermostats, routers) are increasingly targeted by automated network intrusions, botnet infections, and DDoS floods due to limited hardware security layers. **SentryStream** provides an end-to-end real-time intrusion detection pipeline that streams live device telemetry, classifies network flows as **Normal** or **Attack** using Spark Structured Streaming and machine learning, persists audit logs across distributed big data storage layers, and visualizes live threat telemetry on a modern web dashboard equipped with acoustic alerts and per-device isolation controls.

---

## 🏗️ Architecture Diagram

```mermaid
flowchart TD
    subgraph Data Generation
        A[IoT Network Flow Dataset] -->|Simulated Real-Time Streams| B[Python Flow Producer]
    end

    subgraph Messaging & Processing Layer
        B -->|Topic: network-traffic | Port 9092| C[Apache Kafka Broker]
        D[Apache ZooKeeper | Port 2181] <-->|Cluster Management| C
        C -->|Raw Stream Ingestion| E[Apache Spark Master & Worker | Master: 7077, UI: 8080]
        E -->|ML Classification: Normal vs Attack| E
    end

    subgraph Storage & Indexing Fan-Out
        E -->|Raw Audit Logs| F[HDFS / Apache Hive Warehouse | Ports 9870, 9000, 10000]
        E -->|NoSQL Key-Value Lookups| G[Apache HBase | Port 16010]
        E -->|Alert Indexing| H[Elasticsearch | Port 9200]
    end

    subgraph Visualization & Security Operations
        E -->|Real-Time Telemetry & Flow Ticker| I[React Security Web Dashboard | Port 3000]
        I -->|Interactive Telemetry| J[Recharts Safe vs Attack Visualization]
        I -->|Alert Notifications| K[Audio & Visual Threat Banners]
        I -->|Mitigation Action| L[Per-Device Disconnect & Isolation Controls]
    end

    style A fill:#1e293b,stroke:#3b82f6,color:#fff
    style C fill:#1e293b,stroke:#22c55e,color:#fff
    style E fill:#1e293b,stroke:#f97316,color:#fff
    style I fill:#1e293b,stroke:#06b6d4,color:#fff
```

---

## 🛠️ Tech Stack & Roles

| Tool / Technology | Version / Configuration | System Role | Codebase File Location |
| :--- | :--- | :--- | :--- |
| **React** | `^18.3.1` | Single-page security web dashboard UI library | `visualization/package.json` |
| **Recharts** | `^2.12.7` | Interactive real-time visualization ("Traffic Over Time", Safe vs Attack series, breakdowns) | `visualization/sentrystream_dashboard.jsx` |
| **Lucide React** | `^0.435.0` | UI icon set for device types, alert statuses, and chart controls | `visualization/package.json` |
| **Vite** | `^5.4.1` | Fast development server and build bundler (runs default on port `3000`) | `visualization/vite.config.js` |
| **Apache Kafka** | `bitnamilegacy/kafka:4.0.0-debian-12-r10` | Distributed event streaming broker (Port `9092`, Topic `network-traffic`) | `docker/docker-compose.yml`, `docker/.env` |
| **Apache ZooKeeper** | `bitnamilegacy/zookeeper:3.9.3-debian-12-r15` | Centralized service coordination for Kafka broker cluster (Port `2181`) | `docker/docker-compose.yml`, `docker/.env` |
| **Apache Spark** | `bitnamilegacy/spark:3.5.1-debian-12-r15` | Distributed Spark Master (Port `7077`, UI `8080`) & Worker node (`1.5` CPU, `2G` RAM) | `docker/docker-compose.yml`, `docker/.env` |
| **HDFS / Hive** | NameNode `9870`/`9000`, Hive `10000` | Distributed storage & analytical warehouse layer for security audit logs | `docker/.env` |
| **Apache HBase** | UI Port `16010` | NoSQL key-value database for low-latency device status lookups | `docker/.env` |
| **Elasticsearch** | Port `9200` | Real-time indexing engine for security alert search | `docker/.env` |

---

## 📊 Dataset & Real-Time Flow Simulation

- **Dataset**: Based on IoT network intrusion datasets (such as the [N-BAIoT / Botnet Attack Dataset on Kaggle](https://www.kaggle.com/datasets/mk2108/n-baiot-dataset)).
- **Monitored Devices**: Smart Cameras, Smart Thermostats, Front Door Locks, Motion Sensors, Smart Plugs, Baby Monitors, Smart TVs, and Home Routers.
- **Attack Categories**: *DDoS Flood*, *Port Scan*, *Botnet Activity*, *Unauthorized Access Attempt*, and *Data Interception*.
- **Streaming Mode**: Network flow telemetry is **streamed dynamically via a Python producer/simulator** into Kafka topics in real time, simulating live network flow events rather than processing static batch files.

---

## 📋 Prerequisites

Ensure the following tools are installed on your environment before running SentryStream:

- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher
- **Docker Desktop / Docker Engine**: `v24.0.0` or higher (with Docker Compose `v2.0+`)
- **Python**: `v3.10` or higher (for running flow producers)
- **Java JDK**: OpenJDK `8` or `11`/`17` (if running local PySpark jobs outside Docker)

---

## ⚙️ Setup & Installation

Follow these copy-pasteable commands to set up the repository:

```bash
# 1. Clone the repository
git clone https://github.com/your-org/SentryStream.git
cd SentryStream

# 2. Install visualization dashboard dependencies
cd visualization
npm install
cd ..
```

---

## 🚀 Running the Project

Follow the exact service startup sequence below:

### Step 1: Launch Backend Container Infrastructure
Navigate to the `docker/` directory and start ZooKeeper, Kafka, Spark Master, and Spark Worker containers:

```bash
cd docker
docker compose up -d
```

Verify running containers:
```bash
docker compose ps
```

### Step 2: Launch the Real-Time Security Dashboard
Open a new terminal, navigate to `visualization/`, and start the Vite dev server:

```bash
cd visualization
npm run dev
```

Open your browser and navigate to `http://localhost:3000` to interact with the live dashboard.

To stop the backend services when finished:
```bash
cd docker
docker compose down
```

---

## 📂 Project Structure

```
SentryStream/
├── .vscode/
│   └── launch.json                  # VS Code debugging configuration
├── data/                            # Storage folder for raw datasets and PCAP network flow files
├── docker/
│   ├── .env                         # Ports & resource limits (Kafka:9092, ZK:2181, Spark:8080, HDFS:9870)
│   └── docker-compose.yml           # Container orchestration (ZooKeeper 3.9, Kafka 4.0, Spark 3.5 Master/Worker)
├── ingestion/                       # Python Kafka producer scripts & real-time traffic flow simulators
├── models/                          # Trained ML models for intrusion classification (mounted to Spark containers)
├── processing/                      # PySpark & Spark Structured Streaming jobs (mounted to Spark containers)
├── storage/                         # Database schema definitions & SQL table creation scripts (Hive, HBase, Elastic)
├── visualization/
│   ├── index.html                   # HTML entry point with Google Fonts preloads
│   ├── main.jsx                     # React DOM root entry point
│   ├── package.json                 # Node.js dependencies (React 18.3, Recharts 2.12, Lucide React, Vite)
│   ├── package-lock.json            # Exact locked npm dependency tree
│   ├── sentrystream_dashboard.jsx   # Full interactive security dashboard & Recharts visualization
│   └── vite.config.js               # Vite development server configuration
└── README.md                        # Complete project documentation
```

---

## 👥 Team & Component Ownership

Developed as a team capstone project for the **Huawei HCIA-Big Data Training Program**:

| Team Member | Component Ownership | Primary Responsibility |
| :--- | :--- | :--- |
| **Team Member 1** | Ingestion & Telemetry | Kafka topic setup, ZooKeeper config, Python traffic simulator |
| **Team Member 2** | Processing & Machine Learning | Spark Structured Streaming, ML classification pipelines |
| **Team Member 3** | Big Data Storage & Querying | HDFS audit logs, Hive schema setup, HBase lookups, Elastic indexing |
| **Team Member 4** | Visualization & Operations | React Security Dashboard, Recharts visualization, sound alerts, device containment |

---

## ⚠️ Known Limitations & Future Improvements

1. **Production WebSocket Integration**: Currently, the dashboard uses an integrated real-time stream engine in `sentrystream_dashboard.jsx` that can be directly swapped to a live WebSocket / REST endpoint for production cluster telemetry.
2. **Additional Container Definitions**: HDFS, Hive, HBase, and Elasticsearch ports are specified in `docker/.env` and ready for inclusion in `docker-compose.yml` for multi-node deployments.
3. **Automated ML Retraining**: ML classification models are mounted to `/opt/models`; future iterations can automate periodic retraining on new threat signatures.
4. **Automated Container Healthchecks**: Adding native Docker healthcheck directives for Kafka and Spark worker startup dependencies.
