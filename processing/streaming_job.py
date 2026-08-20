"""
SentryStream — real-time classification job.

Extends the existing preprocessing pipeline (same dedup / log-transform /
IQR-capping logic) with:
  1. A trained-model classification step (pandas UDF, sklearn-style model)
  2. Three sinks per micro-batch via foreachBatch:
       - HDFS   : durable append-only archive of every classified event
       - HBase  : per-device latest status + a row per alert
       - Elasticsearch: searchable index of every classified event

Run this as its own long-running job (separate container/profile from the
preprocessing job, or replace it once training data collection is done).
"""

import json
import joblib

from pyspark.sql import SparkSession, functions as F, types as T
from pyspark.sql.functions import pandas_udf
import pandas as pd

import happybase
from elasticsearch import Elasticsearch, helpers

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------
KAFKA_BOOTSTRAP = "kafka:29092"
KAFKA_TOPIC = "network-traffic"

STATS_PATH = "/models/preprocessing_stats.json"
MODEL_PATH = "/models/random_forest.joblib"      # sklearn-style model, has .predict_proba
LABEL_MAP_PATH = "/models/label_map.json"          # {"0": "Normal", "1": "Port Scan", ...}

HDFS_ARCHIVE_PATH = "hdfs://namenode:9000/user/sentrystream/classified_events"
CHECKPOINT_PATH = "/output/checkpoints/classification"

HBASE_HOST = "hbase"
HBASE_PORT = 9090
HBASE_STATUS_TABLE = "device_status"        
HBASE_ALERTS_TABLE = "device_alerts"

ES_HOST = "http://elasticsearch:9200"
ES_INDEX = "sentrystream-events"

CSV_COLUMNS = [
    "MI_dir_L0_1_weight", "MI_dir_L0_1_mean", "MI_dir_L0_1_variance",
    "H_L0_1_weight", "H_L0_1_mean", "H_L0_1_variance",
    "HH_L0_1_weight", "HH_L0_1_mean", "HH_L0_1_std", "HH_L0_1_magnitude",
    "HH_L0_1_radius", "HH_L0_1_covariance", "HH_L0_1_pcc",
    "HH_jit_L0_1_weight", "HH_jit_L0_1_mean", "HH_jit_L0_1_variance",
    "HpHp_L0_1_weight", "HpHp_L0_1_mean", "HpHp_L0_1_std", "HpHp_L0_1_magnitude",
    "HpHp_L0_1_radius", "HpHp_L0_1_covariance", "HpHp_L0_1_pcc",
    "Device_Name", "Attack", "Attack_subType", "label",
]
NUMERIC_COLUMNS = [c for c in CSV_COLUMNS if c not in ("Device_Name", "Attack", "Attack_subType", "label")]

# --------------------------------------------------------------------------
# Spark session + shared state loaded once on the driver
# --------------------------------------------------------------------------
spark = SparkSession.builder.appName("SentryStreamClassification").getOrCreate()

with open(STATS_PATH) as f:
    stats = json.load(f)
HIGH_SKEW_COLS = stats["high_skew_cols"]
LOG_SHIFTS = stats["log_shifts"]
FEATURE_COLS = stats["feature_cols"]
IQR_BOUNDS = stats["iqr_bounds"]

with open(LABEL_MAP_PATH) as f:
    LABEL_MAP = {int(k): v for k, v in json.load(f).items()}

# --------------------------------------------------------------------------
# Kafka read + same transform pipeline as the preprocessing job
# --------------------------------------------------------------------------
raw = (
    spark.readStream
    .format("kafka")
    .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP)
    .option("subscribe", KAFKA_TOPIC)
    .option("startingOffsets", "earliest")
    .load()
)

split_cols = F.split(F.col("value").cast("string"), ",")

df = raw.select(
    F.col("timestamp").alias("kafka_timestamp"),
    F.sha2(F.col("value").cast("string"), 256).alias("row_hash"),
    *[split_cols.getItem(i).alias(name) for i, name in enumerate(CSV_COLUMNS)]
)

df = (
    df.withWatermark("kafka_timestamp", "10 minutes")
      .dropDuplicatesWithinWatermark(["row_hash"])
)

for c in NUMERIC_COLUMNS:
    df = df.withColumn(c, F.col(c).cast("double"))
df = df.withColumn("label", F.col("label").cast("int"))

for c in HIGH_SKEW_COLS:
    df = df.withColumn(c, F.log1p(F.col(c) + F.lit(LOG_SHIFTS[c])))

for c, bounds in IQR_BOUNDS.items():
    df = df.withColumn(
        c,
        F.when(F.col(c) < bounds["lower"], bounds["lower"])
         .when(F.col(c) > bounds["upper"], bounds["upper"])
         .otherwise(F.col(c))
    )

feature_df = df.select(
    "kafka_timestamp", "row_hash", "Device_Name",
    "Attack", "Attack_subType", "label",
    *FEATURE_COLS
)

# --------------------------------------------------------------------------
# Classification (pandas UDF — loads the pickled model once per executor)
# --------------------------------------------------------------------------
PRED_SCHEMA = T.StructType([
    T.StructField("pred_label", T.IntegerType()),
    T.StructField("pred_confidence", T.DoubleType()),
])


@pandas_udf(PRED_SCHEMA)
def classify(*cols: pd.Series) -> pd.DataFrame:
    global _model
    try:
        _model
    except NameError:
        with open(MODEL_PATH, "rb") as fh:
            _model = joblib.load(MODEL_PATH)

    X = pd.concat(cols, axis=1)
    X.columns = FEATURE_COLS
    proba = _model.predict_proba(X)
    return pd.DataFrame({
        "pred_label": proba.argmax(axis=1),
        "pred_confidence": proba.max(axis=1),
    })


classified = feature_df.withColumn(
    "prediction", classify(*[F.col(c) for c in FEATURE_COLS])
).select(
    "kafka_timestamp", "row_hash", "Device_Name", "Attack", "Attack_subType", "label",
    *FEATURE_COLS,
    F.col("prediction.pred_label").alias("pred_label"),
    F.col("prediction.pred_confidence").alias("pred_confidence"),
)

label_udf = F.udf(lambda i: LABEL_MAP.get(i, "Unknown"), T.StringType())

NORMAL_LABEL_INDEX = [k for k, v in LABEL_MAP.items() if v == "Normal"][0]

classified = classified.withColumn(
    "prediction_binary",
    F.when(F.col("pred_label") == NORMAL_LABEL_INDEX, 1).otherwise(0)
)

# --------------------------------------------------------------------------
# Per-micro-batch sinks: HDFS archive, HBase state, Elasticsearch index
# --------------------------------------------------------------------------
def write_batch(batch_df, batch_id):
    if batch_df.rdd.isEmpty():
        return
    batch_df.persist()

    (batch_df.write.mode("append").parquet(HDFS_ARCHIVE_PATH))

    rows = [r.asDict() for r in batch_df.collect()]

    conn = happybase.Connection(host=HBASE_HOST, port=HBASE_PORT)
    table = conn.table("sentrystream_predictions")

    with table.batch(batch_size=500) as batch:
        for r in rows:
            row_key = f"{r['Device_Name']}#{r['kafka_timestamp']}#{r['row_hash'][:8]}".encode()
            cf_data = {
                b"cf:device_name": r["Device_Name"].encode(),
                b"cf:attack": (r.get("Attack") or "").encode(),
                b"cf:attack_subtype": (r.get("Attack_subType") or "").encode(),
                b"cf:original_label": str(r.get("label", "")).encode(),
                b"cf:event_time": str(r["kafka_timestamp"]).encode(),
                b"cf:prediction": str(r["prediction_binary"]).encode(),
            }
            for col in FEATURE_COLS:
                cf_data[f"features:{col}".encode()] = str(r[col]).encode()
            batch.put(row_key, cf_data)
    conn.close()

    es = Elasticsearch(ES_HOST)
    actions = [
        {
            "_index": ES_INDEX,
            "_id": f"{r['Device_Name']}_{r['row_hash']}",
            "_source": {
                "device_name": r["Device_Name"],
                "attack": r.get("Attack"),
                "attack_subtype": r.get("Attack_subType"),
                "prediction": r["prediction_binary"],
                "confidence": r["pred_confidence"],
                "event_time": str(r["kafka_timestamp"]),
            },
        }
        for r in rows
    ]
    helpers.bulk(es, actions)

    batch_df.unpersist()

query = (
    classified.writeStream
    .foreachBatch(write_batch)
    .option("checkpointLocation", CHECKPOINT_PATH)
    .start()
)

query.awaitTermination()
