from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

# AI ASSUMPTION - NOT FOUND IN BRS: timezone = Asia/Bangkok unless BA confirms otherwise
TZ = ZoneInfo("Asia/Bangkok")


def today() -> date:
    return datetime.now(TZ).date()


def days_back_range(days: int, end: date | None = None, inclusive: bool = True) -> tuple[date, date]:
    """Return (start, end) for a look-back window of 'days' calendar days."""
    end = end or today()
    start = end - timedelta(days=days - 1 if inclusive else days)
    return start, end


def in_range(d: date, start: date, end: date) -> bool:
    return start <= d <= end
