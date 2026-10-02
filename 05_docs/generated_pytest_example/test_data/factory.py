"""Synthetic test data factory — never use real customer data."""
from dataclasses import dataclass, field
from decimal import Decimal
from itertools import count

_seq = count(1)


@dataclass
class Customer:
    customer_id: str = field(default_factory=lambda: f"CUST-TEST-{next(_seq):04d}")
    name: str = "Synthetic Customer"


@dataclass
class Transaction:
    customer: Customer
    amount: Decimal
    product: str = "GENERAL"


def make_transaction(amount, product: str = "GENERAL") -> Transaction:
    return Transaction(customer=Customer(), amount=Decimal(str(amount)), product=product)
