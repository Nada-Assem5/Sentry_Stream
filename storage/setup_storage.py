import happybase
from elasticsearch import Elasticsearch

HBASE_HOST = "hbase"
HBASE_PORT = 9090
ES_HOST = "http://elasticsearch:9200"
ES_INDEX = "sentrystream-events"


def setup_hbase():
    conn = happybase.Connection(host=HBASE_HOST, port=HBASE_PORT)
    existing = {t.decode() for t in conn.tables()}

    if "sentrystream_predictions" not in existing:
        conn.create_table("sentrystream_predictions", {
            "cf": dict(),
            "features": dict(),
        })
        print("created HBase table: sentrystream_predictions")
    else:
        print("HBase table already exists: sentrystream_predictions")

    conn.close()


def setup_elasticsearch():
    es = Elasticsearch(ES_HOST)
    if es.indices.exists(index=ES_INDEX):
        print(f"Elasticsearch index already exists: {ES_INDEX}")
        return

    es.indices.create(
        index=ES_INDEX,
        mappings={
            "properties": {
                "device_name": {"type": "keyword"},
                "attack": {"type": "keyword"},
                "attack_subtype": {"type": "keyword"},
                "prediction": {"type": "integer"},
                "confidence": {"type": "float"},
                "event_time": {"type": "date"},
            }
        },
    )
    print(f"created Elasticsearch index: {ES_INDEX}")


if __name__ == "__main__":
    setup_hbase()
    setup_elasticsearch()