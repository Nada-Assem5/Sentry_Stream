FROM apache/spark:3.5.1

USER root

WORKDIR /app

COPY preprocess_batch.py /app/preprocess_batch.py
COPY preprocess_stream.py /app/preprocess_stream.py

CMD ["/opt/spark/bin/spark-submit", "--master", "spark://spark-master:7077", "/app/preprocess_batch.py"]
