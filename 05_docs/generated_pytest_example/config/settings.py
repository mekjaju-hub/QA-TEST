import os
from dotenv import load_dotenv

load_dotenv()
ENV = os.getenv("TEST_ENV", "sit")
BASE_URL = os.getenv("BASE_URL", "")
