"""The optional log shipper in the production overlay: opt-in, read-only, no credentials in the repo."""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
COMPOSE = (REPO / "deploy" / "compose.prod.yaml").read_text()
ALLOY = (REPO / "deploy" / "logs" / "config.alloy").read_text()
SERVICE = COMPOSE.split("\n  alloy:\n", 1)[1].split("\nvolumes:\n", 1)[0]


def test_shipper_is_opt_in_and_cannot_control_the_host():
    assert "profiles: [logs]" in SERVICE
    assert "docker.sock" not in COMPOSE
    assert "/var/lib/docker/containers:/var/lib/docker/containers:ro" in SERVICE
    assert "cap_drop: [ALL]" in SERVICE and "no-new-privileges:true" in SERVICE
    assert re.search(r"image: grafana/alloy:v\d+\.\d+\.\d+\n", SERVICE), "pin the image to a version"


def test_credentials_come_from_the_environment_only():
    for name in ("GRAFANA_LOKI_URL", "GRAFANA_LOKI_USER", "GRAFANA_LOKI_TOKEN"):
        assert f'sys.env("{name}")' in ALLOY
        assert f"{name}: ${{{name}:-}}" in SERVICE


def test_only_lines_tagged_with_a_compose_service_are_shipped():
    assert 'labels: "com.docker.compose.service"' in COMPOSE
    assert 'attrs.\\"com.docker.compose.service\\"' in ALLOY
    assert re.search(r'stage\.match \{\s+selector = "\{service=\\"\\"\}"\s+action\s+= "drop"', ALLOY)
