def gen_github_workflow(project: dict) -> str:
    """workflow_dispatch only (no schedule by default); secrets via GitHub Secrets (หัวข้อ 25)."""
    return f"""name: {project['code']} QA Automation (manual)

on:
  workflow_dispatch:
    inputs:
      suite:
        description: "Test suite to run"
        required: true
        default: "unit"
        type: choice
        options: [unit, ui, all]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      BASE_URL: ${{{{ secrets.BASE_URL }}}}
      APP_USERNAME: ${{{{ secrets.APP_USERNAME }}}}
      APP_PASSWORD: ${{{{ secrets.APP_PASSWORD }}}}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - if: ${{{{ inputs.suite != 'unit' }}}}
        run: python -m playwright install --with-deps chromium
      - name: Run pytest
        run: |
          if [ "${{{{ inputs.suite }}}}" = "unit" ]; then pytest tests/unit --html=reports/report.html --self-contained-html; elif [ "${{{{ inputs.suite }}}}" = "ui" ]; then pytest tests/ui --screenshot only-on-failure; else pytest --html=reports/report.html --self-contained-html; fi
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: |
            reports/
            screenshots/
"""
