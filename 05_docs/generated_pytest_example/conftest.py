import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from test_data.factory import make_transaction  # noqa: E402


@pytest.fixture
def synthetic_transaction():
    """Shared synthetic transaction (no real customer data)."""
    return make_transaction("1000.00")
