import json
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

spark = SparkSession.builder.appName("SentryStreamPreprocessingBatch").getOrCreate()

df = spark.read.csv("/data/*.csv", header=True, inferSchema=True)
df = df.toDF(*[c.replace(".", "_") for c in df.columns])

before = df.count()
print(f"Initial row count: {before}")

# Dedup on the raw values, across every column. This has to happen before the
# transforms below: IQR-capping is many-to-one, so capping first would clamp
# distinct rows onto identical values and delete them as false duplicates.
df = df.dropDuplicates()
after = df.count()
print(f"Deduplicated: {before} -> {after} rows ({before - after} removed).")

FEATURE_COLS = [c for c in df.columns if c not in ("Device_Name", "Attack", "Attack_subType", "label")]

HIGH_SKEW_COLS = [
    "HH_L0_1_std", "HH_L0_1_radius", "HH_L0_1_covariance", "HH_L0_1_pcc",
    "HH_jit_L0_1_variance", "HpHp_L0_1_weight", "HpHp_L0_1_std",
    "HpHp_L0_1_radius", "HpHp_L0_1_covariance", "HpHp_L0_1_pcc",
]

min_vals = df.select([F.min(F.col(c)).alias(c) for c in HIGH_SKEW_COLS]).collect()[0].asDict()
shifts = {c: (-min_vals[c] + 1 if min_vals[c] <= 0 else 0) for c in HIGH_SKEW_COLS}

for col in HIGH_SKEW_COLS:
    df = df.withColumn(col, F.log1p(F.col(col) + F.lit(shifts[col])))

print(f"Log-transformed {len(HIGH_SKEW_COLS)} columns.")

quantiles = df.approxQuantile(FEATURE_COLS, [0.25, 0.75], 0.01)
iqr_bounds = {}
skipped_zero_iqr = []
for col, (q1, q3) in zip(FEATURE_COLS, quantiles):
    iqr = q3 - q1
    if iqr == 0:
        # Zero-inflated column: over half the rows share one value, so Q1 == Q3
        # and the bounds collapse to a single point. Capping here would clamp
        # every row to that value and leave the column constant — no information.
        skipped_zero_iqr.append(col)
        continue
    lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    iqr_bounds[col] = {"lower": lower, "upper": upper}
    df = df.withColumn(
        col,
        F.when(F.col(col) < lower, lower)
         .when(F.col(col) > upper, upper)
         .otherwise(F.col(col))
    )

print(f"IQR-capped {len(iqr_bounds)} feature columns.")
if skipped_zero_iqr:
    print(f"Left {len(skipped_zero_iqr)} zero-IQR columns uncapped: {skipped_zero_iqr}")

stats = {
    "high_skew_cols": HIGH_SKEW_COLS,
    "log_shifts": shifts,
    "feature_cols": FEATURE_COLS,
    "iqr_bounds": iqr_bounds,
}
with open("/output/preprocessing_stats.json", "w") as f:
    json.dump(stats, f, indent=2)
print("Wrote preprocessing_stats.json")

df.cache()


def write_full_to_hdfs(df, path="/output/cleaned_full"):
    df.write.mode("overwrite").parquet(path)
    print(f"Full cleaned dataset written to {path}")


def get_training_features(df):
    return df.drop("Attack", "Attack_subType")


write_full_to_hdfs(df)

training_df = get_training_features(df)
training_df.write.mode("overwrite").parquet("/output/training_ready")
print("Leakage-free training dataset written to /output/training_ready")
print(f"Training dataset columns: {training_df.columns}")

spark.stop()
