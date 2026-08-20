#!/bin/bash
set -e

echo "Step 1: Starting all storage containers..."
docker compose --profile full up -d

echo "Waiting for Hive to be ready..."
MAX_WAIT=300
WAITED=0
until docker exec sentrystream-hive bash -c "echo > /dev/tcp/localhost/10000" 2>/dev/null; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "Hive did not become ready in time."
    exit 1
  fi
  sleep 10
  WAITED=$((WAITED + 10))
done
echo "Hive is ready."

echo "Step 2: Checking containers are running..."
docker ps --filter "name=sentrystream-"

echo "Step 3: Creating database and tables in Hive..."
docker cp ./sql/setup.sql sentrystream-hive:/tmp/setup.sql
docker exec -it sentrystream-hive beeline \
  -u jdbc:hive2://localhost:10000 \
  -f /tmp/setup.sql

echo "Done."
echo "HDFS:          http://localhost:9870"
echo "HBase:         http://localhost:16010"
echo "Elasticsearch: http://localhost:9200"
echo ""
echo "Note: the full dataset CSV is not loaded by this script (too large for GitHub)."
echo "Load it manually: docker cp <path>\\dataset.csv sentrystream-hive:/tmp/dataset.csv"
echo "Then run: LOAD DATA LOCAL INPATH '/tmp/dataset.csv' INTO TABLE iot_dataset_raw;"
echo ""
echo "Note: iot_predictions_final only fills up once streaming_classification.py"
echo "has run at least one micro-batch — it reads directly from the Spark job's"
echo "HDFS output, it is not populated by this script."
