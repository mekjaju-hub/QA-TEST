from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from ..engine.text import NF


def slug(s: object) -> str:
    return re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", str(s).lower()))


def py_str(s: object) -> str:
    """JSON string literal is also a valid Python literal (JS pyStr)."""
    return json.dumps("" if s is None else str(s), ensure_ascii=False)


def one_line(s: object, n: int) -> str:
    return str(s or "").replace("\n", " ")[:n]


@dataclass
class GenTC:
    """A test case as seen by generators: tc_id, version, data snapshot + its requirement (engine dict)."""
    id: str
    tc_id: str
    version: int
    status: str
    data: dict
    req: dict | None = None
    extra: dict = field(default_factory=dict)

    @property
    def f(self) -> dict:
        return self.req["fields"] if self.req else {"threshold_op": NF, "threshold_value": NF, "unit": NF}

    @property
    def req_id(self) -> str:
        return self.req["req_id"] if self.req else "-"


def tip(code, purpose, input_, output, why, explain, tc, caution, fix) -> dict:
    return {"code": code, "purpose": purpose, "input": input_, "output": output, "why": why, "explain": explain, "tc": tc,
            "caution": caution, "fix": fix}
