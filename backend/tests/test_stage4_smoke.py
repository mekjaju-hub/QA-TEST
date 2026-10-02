def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_demo_processing(client, qam, project, demo_doc):
    doc = demo_doc["document"]
    pr = client.get(f"/api/documents/{doc['id']}/progress", headers=qam).json()
    assert pr["job"]["status"] == "READY_FOR_REVIEW", pr["log_tail"]
    reqs = client.get(f"/api/projects/{project['id']}/requirements", headers=qam).json()["items"]
    print([ (r["req_id"], r["status"]) for r in reqs])
    assert len(reqs) == 9
