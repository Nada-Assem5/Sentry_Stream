FROM apache/spark:3.5.1

USER root

WORKDIR /app

COPY streaming_job.py .
COPY models/ ./models/

CMD ["/opt/spark/bin/spark-submit", "--master", "spark://spark-master:7077", "/app/streaming_job.py"]
