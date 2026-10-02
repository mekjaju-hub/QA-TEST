from decimal import Decimal, InvalidOperation


class ValidationError(ValueError):
    """Raised when a required value is empty (Validation Error)."""


class InvalidDataTypeError(ValueError):
    """Raised when a value is not numeric (Invalid Data Type)."""


def parse_amount(raw) -> Decimal:
    """Convert raw input to Decimal. Empty -> ValidationError, non-numeric -> InvalidDataTypeError."""
    if raw is None or str(raw).strip() == "":
        raise ValidationError("Validation Error")
    try:
        return Decimal(str(raw).replace(",", ""))
    except InvalidOperation as exc:
        raise InvalidDataTypeError("Invalid Data Type") from exc
