"""Automation generators (หัวข้อ 18–26) — Python port of 04_source/p4_gen.js (second half).

Each generator returns {"files": {path: content}, "tips": {path: [Tip]}} and only uses test cases
passed in (APPROVED unless Draft mode). Every file carries Test Case / Requirement IDs for traceability.
"""
from .common import GenTC, slug
from .python_gen import gen_python_layer
from .pytest_gen import gen_pytest_layer
from .postman import gen_postman
from .sql import SQL_TYPES, gen_sql
from .playwright import gen_playwright, locators_from_html, locators_from_recording
from .jmeter import gen_jmeter, jmeter_safety
from .github_actions import gen_github_workflow
from .secret_scan import scan_files_for_secrets

__all__ = ["GenTC", "slug", "gen_python_layer", "gen_pytest_layer", "gen_postman", "SQL_TYPES", "gen_sql", "gen_playwright",
           "locators_from_html", "locators_from_recording", "gen_jmeter", "jmeter_safety", "gen_github_workflow", "scan_files_for_secrets"]
