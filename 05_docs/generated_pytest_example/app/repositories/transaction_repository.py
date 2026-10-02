"""Repository pattern: all DB access goes through here (read-only by default).
NEEDS_CONFIGURATION: table/column names are placeholders until confirmed by BA/DBA.
"""
TRANSACTION_TABLE = "{{table_transaction}}"  # AI ASSUMPTION - NOT FOUND IN BRS


def select_by_customer_sql() -> str:
    return f"SELECT * FROM {TRANSACTION_TABLE} WHERE customer_id = %s AND txn_date BETWEEN %s AND %s"
