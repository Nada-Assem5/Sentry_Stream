-- ============================================================
-- SentryStream Project - HDFS/Hive Setup
-- Part: Storage & Analytics Layer (HDFS + Hive)
-- ============================================================

-- ----------------------------------------------------------
-- STEP 1: Create the project database
-- ----------------------------------------------------------
CREATE DATABASE IF NOT EXISTS sentrystream;
USE sentrystream;


-- ----------------------------------------------------------
-- STEP 2: Initial test table with dummy data
-- Purpose: verify Hive + HDFS are working end-to-end
-- before loading real data
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS iot_predictions (
    device_id STRING,
    event_time TIMESTAMP,
    feature_sample DOUBLE,
    prediction INT,   -- 0 = attack, 1 = normal
    label STRING      -- "Attack" or "Normal"
)
ROW FORMAT DELIMITED
FIELDS TERMINATED BY ','
STORED AS TEXTFILE;

INSERT INTO iot_predictions VALUES
('device_01', '2026-08-14 10:00:00', 0.45, 1, 'Normal'),
('device_02', '2026-08-14 10:00:10', 0.92, 0, 'Attack'),
('device_03', '2026-08-14 10:00:20', 0.31, 1, 'Normal'),
('device_01', '2026-08-14 10:00:30', 0.88, 0, 'Attack');

-- Verification queries
SELECT * FROM iot_predictions;

SELECT label, COUNT(*) AS total
FROM iot_predictions
GROUP BY label;

SELECT device_id, COUNT(*) AS attack_count
FROM iot_predictions
WHERE label = 'Attack'
GROUP BY device_id
ORDER BY attack_count DESC;


-- ----------------------------------------------------------
-- STEP 3: Real dataset table (BoTNeTIoT-L01)
-- This table holds the actual N-BaIoT dataset (23 features
-- + device_name + attack + attack_subtype + label)
-- Loaded from a cleaned/deduplicated CSV (~6.4M rows, 2.5GB)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS iot_dataset_raw (
    MI_dir_L0_1_weight DOUBLE,
    MI_dir_L0_1_mean DOUBLE,
    MI_dir_L0_1_variance DOUBLE,
    H_L0_1_weight DOUBLE,
    H_L0_1_mean DOUBLE,
    H_L0_1_variance DOUBLE,
    HH_L0_1_weight DOUBLE,
    HH_L0_1_mean DOUBLE,
    HH_L0_1_std DOUBLE,
    HH_L0_1_magnitude DOUBLE,
    HH_L0_1_radius DOUBLE,
    HH_L0_1_covariance DOUBLE,
    HH_L0_1_pcc DOUBLE,
    HH_jit_L0_1_weight DOUBLE,
    HH_jit_L0_1_mean DOUBLE,
    HH_jit_L0_1_variance DOUBLE,
    HpHp_L0_1_weight DOUBLE,
    HpHp_L0_1_mean DOUBLE,
    HpHp_L0_1_std DOUBLE,
    HpHp_L0_1_magnitude DOUBLE,
    HpHp_L0_1_radius DOUBLE,
    HpHp_L0_1_covariance DOUBLE,
    HpHp_L0_1_pcc DOUBLE,
    device_name STRING,
    attack STRING,
    attack_subtype STRING,
    label INT
)
ROW FORMAT DELIMITED
FIELDS TERMINATED BY ','
STORED AS TEXTFILE
TBLPROPERTIES ("skip.header.line.count"="1");

-- Note: the CSV file must first be copied into the hive-server
-- container before this LOAD DATA command works:
--   docker cp "<local_path>\BoTNeTIoT_cleaned.csv" sentrystream-hive:/tmp/BoTNeTIoT_cleaned.csv
LOAD DATA LOCAL INPATH '/tmp/BoTNeTIoT_cleaned.csv'
INTO TABLE iot_dataset_raw;

-- Verification: row count (must match `(Get-Content file | Measure-Object -Line).Lines - 1`)
SELECT COUNT(*) FROM iot_dataset_raw;

-- Sample check
SELECT device_name, attack, label
FROM iot_dataset_raw
LIMIT 5;

-- Analytical query: attack vs normal counts per device
SELECT device_name, COUNT(*) AS total_records,
       SUM(CASE WHEN label = 0 THEN 1 ELSE 0 END) AS attack_count,
       SUM(CASE WHEN label = 1 THEN 1 ELSE 0 END) AS normal_count
FROM iot_dataset_raw
GROUP BY device_name;


-- ----------------------------------------------------------
-- STEP 4: Live predictions table — points directly at what
-- streaming_classification.py actually writes to HDFS.
--
-- This MUST be an EXTERNAL table with a LOCATION matching
-- HDFS_ARCHIVE_PATH in streaming_classification.py, and its
-- columns/format must match that job's output exactly
-- (Parquet, not delimited text) — otherwise Hive will query
-- an empty, disconnected table.
--
-- Because it is unpartitioned, Hive picks up any new Parquet
-- file Spark writes under this path automatically on the next
-- query — no MSCK REPAIR TABLE needed.
-- ----------------------------------------------------------
DROP TABLE IF EXISTS iot_predictions_final;

CREATE EXTERNAL TABLE iot_predictions_final (
    kafka_timestamp   TIMESTAMP,
    row_hash          STRING,
    device_name       STRING,
    pred_label        INT,
    pred_confidence   DOUBLE,
    attack       STRING
)
STORED AS PARQUET
LOCATION 'hdfs://namenode:9000/user/sentrystream/classified_events';

-- Verification once the classification job has run at least one batch:
SELECT * FROM iot_predictions_final LIMIT 10;

SELECT attack_type, COUNT(*) AS total
FROM iot_predictions_final
GROUP BY attack_type
ORDER BY total DESC;

SELECT device_name, COUNT(*) AS alert_count
FROM iot_predictions_final
WHERE attack_type != 'Normal'
GROUP BY device_name
ORDER BY alert_count DESC;
