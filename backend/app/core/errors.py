"""Error model (หัวข้อ 38): Error Code, User Message, Technical Detail (Admin), Timestamp,
Retryable, Suggested Action, Correlation ID."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from .masking import mask


class AppError(Exception):
    def __init__(self, code: str, user_message: str, *, status: int = 400, technical: str = "",
                 retryable: bool = False, action: str = "") -> None:
        super().__init__(user_message)
        self.code = code
        self.user_message = user_message
        self.status = status
        self.technical = mask(technical)
        self.retryable = retryable
        self.action = action
        self.correlation_id = uuid.uuid4().hex[:8]
        self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self, include_technical: bool = False) -> dict:
        d = {
            "code": self.code,
            "user_message": self.user_message,
            "timestamp": self.timestamp,
            "retryable": self.retryable,
            "suggested_action": self.action,
            "correlation_id": self.correlation_id,
        }
        if include_technical:
            d["technical"] = self.technical
        return d


def not_found(what: str) -> AppError:
    return AppError("NOT_FOUND", f"ไม่พบ {what}", status=404)


def forbidden(perm: str) -> AppError:
    return AppError("FORBIDDEN", f"คุณไม่มีสิทธิ์ทำรายการนี้ ({perm})", status=403)
