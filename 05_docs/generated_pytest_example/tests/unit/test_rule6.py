"""Tests for module RULE6 — generated from APPROVED test cases only."""
import pytest
from decimal import Decimal

from app.services import rule_service
from app.validators.input_validator import parse_amount, ValidationError, InvalidDataTypeError


# TC-CAM-RULE6-001 v1 | REQ-CAM-RULE6-001 | Positive: เมื่อเรียก API GET /customers/{id}/transactions ด้วย Customer ID ที่มีอยู่ ระบบต
# Given: เมื่อเรียก API GET /customers/{id}/transactions ด้วย Customer ID ที่มีอยู่ ระบบต้องตอบกลับ HTTP 200 พร้อมรายการธุรกรรมในรูปแบ และ ผู้ใช้ เจ้
# When: ระบุ/ประมวลผล transactions ด้วย Customer ID ที่มีอยู่ ระบบต้องตอบกลับ HTTP 200 พร้อมรายการธุรกรรมในรูปแบบ
# Then: ตอบกลับ HTTP 200 พร้อมรายการธุรกรรมในรูปแบบ JSON ให้เจ้าหน้าที่Compliance
@pytest.mark.testcase("TC-CAM-RULE6-001")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Positive test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE6-001")
def test_tc_cam_rule6_001_positive(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ระบุ/ประมวลผล transactions ด้วย Customer ID ที่มีอยู่ ระบบต้องตอบกลับ HTTP 200 พร้อมรายการธุรกรรมในร | Data: ข้อมูล Synthetic ที่เข้าเงื่อนไข | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ ผลลัพธ์ | Data: - | Expected: ตอบกลับ HTTP 200 พร้อมรายการธุรกรรมในรูปแบบ JSON ให้เจ้าหน้าที่Compliance
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE6-002 v1 | REQ-CAM-RULE6-001 | Negative: เมื่อเรียก API GET /customers/{id}/transactions ด้วย Customer ID ที่มีอยู่ ระบบต
# Given: เมื่อเรียก API GET /customers/{id}/transactions ด้วย Customer ID ที่มีอยู่ ระบบต้องตอบกลับ HTTP 200 พร้อมรายการธุรกรรมในรูปแบ และ ผู้ใช้ เจ้
# When: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ
# Then: ระบบต้องปฏิเสธการทำรายการ
@pytest.mark.testcase("TC-CAM-RULE6-002")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Negative test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE6-002")
def test_tc_cam_rule6_002_negative(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ | Data: ข้อมูล Synthetic ที่เข้าข่ายกรณี Negative | Expected: ระบบต้องปฏิเสธการทำรายการ
    # Step 3: ตรวจผลลัพธ์/ข้อมูลที่บันทึก | Data: - | Expected: ไม่มีข้อมูลที่ไม่เข้าเงื่อนไขปรากฏในผลลัพธ์
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE6-003 v1 | REQ-CAM-RULE6-001 | API: เมื่อเรียก API GET /customers/{id}/transactions ด้วย Customer ID ที่มีอยู่ ระบบต้องตอ
# Given: เมื่อเรียก API GET /customers/{id}/transactions ด้วย Customer ID ที่มีอยู่ ระบบต้องตอบกลับ HTTP 200 พร้อมรายการธุรกรรมในรูปแบ และ ผู้ใช้ เจ้
# When: ระบุ/ประมวลผล transactions ด้วย Customer ID ที่มีอยู่ ระบบต้องตอบกลับ HTTP 200 พร้อมรายการธุรกรรมในรูปแบบ
# Then: ตอบกลับ HTTP 200 พร้อมรายการธุรกรรมในรูปแบบ JSON ให้เจ้าหน้าที่Compliance
@pytest.mark.testcase("TC-CAM-RULE6-003")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: API test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE6-003")
def test_tc_cam_rule6_003_api(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ระบุ/ประมวลผล transactions ด้วย Customer ID ที่มีอยู่ ระบบต้องตอบกลับ HTTP 200 พร้อมรายการธุรกรรมในร | Data: ข้อมูล Synthetic ที่เข้าเงื่อนไข | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ ผลลัพธ์ | Data: - | Expected: ตอบกลับ HTTP 200 พร้อมรายการธุรกรรมในรูปแบบ JSON ให้เจ้าหน้าที่Compliance
    # Step 4: ตรวจ Status Code และ Response Body | Data: Endpoint: {{endpoint}} (NEEDS_CONFIGURATION) | Expected: Response ตรงตาม Contract
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")
