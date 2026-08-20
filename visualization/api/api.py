def decode_row(row: dict) -> dict:
    return {k.decode(): v.decode() for k, v in row.items()}


@app.get("/api/devices")
def get_all_devices():
    """One forward scan; later rows overwrite earlier ones per device,
    so by the end of the scan each device's entry is its latest event
    (row keys sort by device#timestamp, so this works without a reverse scan)."""
    conn = hbase_conn()
    table = conn.table("sentrystream_predictions")

    latest_by_device = {}
    for key, row in table.scan(columns=[b"cf"]):
        r = decode_row(row)
        device = r["cf:device_name"]
        latest_by_device[device] = {
            "name": device,
            "prediction": int(r["cf:prediction"]),   # 0 = Attack, 1 = Normal
            "attack": r.get("cf:attack"),
            "attack_subtype": r.get("cf:attack_subtype"),
            "last_seen": r.get("cf:event_time"),
        }
    conn.close()
    return list(latest_by_device.values())


@app.get("/api/alerts")
def get_recent_alerts(limit: int = 10):
    result = es.search(
        index=ES_INDEX,
        query={"term": {"prediction": 0}},   # 0 = Attack
        sort=[{"event_time": {"order": "desc"}}],
        size=limit,
    )
    return [hit["_source"] for hit in result["hits"]["hits"]]