import logging

import pytest

from app.config import Settings, check_network_sharing_safety


def _settings(**env) -> Settings:
    return Settings(**env)


def test_local_only_allows_single_user_mode():
    check_network_sharing_safety(_settings(ALLOW_NETWORK_SHARING=False, SINGLE_USER_MODE=True))


def test_sharing_with_single_user_mode_is_refused():
    with pytest.raises(RuntimeError, match="SINGLE_USER_MODE"):
        check_network_sharing_safety(_settings(ALLOW_NETWORK_SHARING=True, SINGLE_USER_MODE=True))


def test_sharing_with_default_seed_password_warns(caplog):
    with caplog.at_level(logging.WARNING):
        check_network_sharing_safety(_settings(ALLOW_NETWORK_SHARING=True, SINGLE_USER_MODE=False,
                                               SEED_ADMIN_PASSWORD="Admin@12345"))
    assert "SEED_ADMIN_PASSWORD" in caplog.text


def test_sharing_with_custom_password_is_quiet(caplog):
    with caplog.at_level(logging.WARNING):
        check_network_sharing_safety(_settings(ALLOW_NETWORK_SHARING=True, SINGLE_USER_MODE=False,
                                               SEED_ADMIN_PASSWORD="Xy9!longer-pass"))
    assert caplog.text == ""
