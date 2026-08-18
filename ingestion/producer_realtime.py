from kafka import KafkaProducer
import time

producer = KafkaProducer(
    bootstrap_servers='kafka:29092',
    api_version=(0, 10)
)

file_path = "/data/BoTNeTIoT-L01-v2.csv"

with open(file_path, "r") as f:
    next(f)

    for line in f:
        producer.send("network-traffic", line.strip().encode())
        producer.flush()
        print("Sent 1 row")
        time.sleep(5)

producer.close()