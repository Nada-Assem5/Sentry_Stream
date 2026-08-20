import json
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

spark = SparkSession.builder.appName("SentryStreamPreprocessingStreaming").getOrCreate()

with open("/output/preprocessing_stats.json") as f:
    stats = json.load(f)

HIGH_SKEW_COLS = stats["high_skew_cols"]
LOG_SHIFTS = stats["log_shifts"]
FEATURE_COLS = stats["feature_cols"]
IQR_BOUNDS = stats["iqr_bounds"]

# Underscore names, matching the renaming the batch job applies before it
# writes preprocessing_stats.json — the loops below index into that file by name.
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

raw = (
    spark.readStream
    .format("kafka")
    .option("kafka.bootstrap.servers", "kafka:29092")
    .option("subscribe", "network-traffic")
    .option("startingOffsets", "earliest")
    .load()
)

split_cols = F.split(F.col("value").cast("string"), ",")

df = raw.select(
    F.col("timestamp").alias("kafka_timestamp"),
    # Hash the raw Kafka payload: that is the whole record, so this matches the
    # batch job's dropDuplicates() over every column, and it keeps the streaming
    # state store to one short string per key instead of all 27 values.
    F.sha2(F.col("value").cast("string"), 256).alias("row_hash"),
    *[split_cols.getItem(i).alias(name) for i, name in enumerate(CSV_COLUMNS)]
)

# Dedup on raw values, before the transforms — same ordering as the batch job.
# dropDuplicatesWithinWatermark, not plain dropDuplicates: the dedup key is
# row_hash, not the event-time column, so plain dropDuplicates has no way to
# expire state by the watermark and would grow it without bound.
df = (
    df.withWatermark("kafka_timestamp", "10 minutes")
      .dropDuplicatesWithinWatermark(["row_hash"])
)

for c in NUMERIC_COLUMNS:
    df = df.withColumn(c, F.col(c).cast("double"))
df = df.withColumn("label", F.col("label").cast("int"))

for c in HIGH_SKEW_COLS:
    df = df.withColumn(c, F.log1p(F.col(c) + F.lit(LOG_SHIFTS[c])))

# Iterate IQR_BOUNDS, not FEATURE_COLS: the batch job omits zero-IQR columns
# from the bounds, so this skips exactly the same columns it left uncapped.
for c, bounds in IQR_BOUNDS.items():
    df = df.withColumn(
        c,
        F.when(F.col(c) < bounds["lower"], bounds["lower"])
         .when(F.col(c) > bounds["upper"], bounds["upper"])
         .otherwise(F.col(c))
    )

training_stream = df.drop("Attack", "Attack_subType", "row_hash")

query = (
    training_stream.writeStream
    .format("parquet")
    .option("path", "/output/streaming_training_ready")
    .option("checkpointLocation", "/output/checkpoints/training")
    .outputMode("append")
    .start()
)

query.awaitTermination()
