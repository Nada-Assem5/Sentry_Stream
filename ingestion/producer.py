from kafka import KafkaProducer
import time

producer = KafkaProducer(
    bootstrap_servers='kafka:29092'
)

file_path = "/data/BoTNeTIoT-L01-v2.csv"

batch_size = 1000
max_rows = 100000
total = 0

with open(file_path, "rb") as f:
    next(f)
    batch = []

    for line in f:
        batch.append(line)

        if len(batch) == batch_size:
            for row in batch:
                producer.send("network-traffic", row)

            producer.flush()
            total += len(batch)
            print("Sent:", total, "rows")
            batch = []
            time.sleep(1)

        if total >= max_rows:
            break

producer.close()
print("Finished:", total)