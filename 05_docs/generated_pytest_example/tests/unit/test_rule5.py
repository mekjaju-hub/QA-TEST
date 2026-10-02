"""Tests for module RULE5 — generated from APPROVED test cases only."""
import pytest
from decimal import Decimal

from app.services import rule_service
from app.validators.input_validator import parse_amount, ValidationError, InvalidDataTypeError


# TC-CAM-RULE5-001 v1 | REQ-CAM-RULE5-001 | Positive: ฟิลด์ Customer ID เป็นฟิลด์บังคับ ระบบต้องแสดงข้อความ "กรุณาระบุ Customer ID" เม
# Given: เมื่อผู้ใช้ไม่กรอก หากค่าว่างให้แสดงข้อความเดียวกัน และ ผู้ใช้ ผู้ใช้ที่มีสิทธิ์ (ตาม Clarification/Assumption) เข้าสู่ระบบ และมีข้อมูลทดสอบ
# When: ระบุ/ประมวลผล ฟิลด์ Customer ID เป็นฟิลด์บังคับ ระบบต้องแสดงข้อความ "กรุณาระบุ Customer ID" เมื่อผู
# Then: แสดงข้อความ "กรุณาระบุ Customer ID" เมื่อผู้ใช้ไม่กรอก หากค่าว่างให้แสดงข้อความเดียวกัน
@pytest.mark.testcase("TC-CAM-RULE5-001")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Positive test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE5-001")
def test_tc_cam_rule5_001_positive(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: ผู้ใช้ที่มีสิทธิ์ (ตาม Clarification/Assumption); Cust | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ระบุ/ประมวลผล ฟิลด์ Customer ID เป็นฟิลด์บังคับ ระบบต้องแสดงข้อความ "กรุณาระบุ Customer ID" เมื่อผู | Data: ข้อมูล Synthetic ที่เข้าเงื่อนไข | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ แสดงข้อความ "กรุณาระบุ Customer ID" เมื่อผู้ใช้ไม่กรอก หากค่าว่างให้แสดงข้อความเดียวกัน | Data: - | Expected: แสดงข้อความ "กรุณาระบุ Customer ID" เมื่อผู้ใช้ไม่กรอก หากค่าว่างให้แสดงข้อความเ
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE5-002 v1 | REQ-CAM-RULE5-001 | Negative: ฟิลด์ Customer ID เป็นฟิลด์บังคับ ระบบต้องแสดงข้อความ "กรุณาระบุ Customer ID" เม
# Given: เมื่อผู้ใช้ไม่กรอก หากค่าว่างให้แสดงข้อความเดียวกัน และ ผู้ใช้ ผู้ใช้ที่มีสิทธิ์ (ตาม Clarification/Assumption) เข้าสู่ระบบ และมีข้อมูลทดสอบ
# When: ส่งข้อมูลที่ Required field ว่างหรือรูปแบบไม่ถูกต้อง
# Then: ระบบต้องแสดง Validation Error
@pytest.mark.testcase("TC-CAM-RULE5-002")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Negative test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE5-002")
def test_tc_cam_rule5_002_negative(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: ผู้ใช้ที่มีสิทธิ์ (ตาม Clarification/Assumption); Cust | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ส่งข้อมูลที่ Required field ว่างหรือรูปแบบไม่ถูกต้อง | Data: ข้อมูล Synthetic ที่เข้าข่ายกรณี Negative | Expected: ระบบต้องแสดง Validation Error
    # Step 3: ตรวจผลลัพธ์/ข้อมูลที่บันทึก | Data: - | Expected: ไม่มีข้อมูลที่ไม่เข้าเงื่อนไขปรากฏในผลลัพธ์
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE5-003 v1 | REQ-CAM-RULE5-002 | Positive: เจ้าหน้าที่Compliance ต้องกรอกหมายเหตุได้ความยาวไม่เกิน 200 ตัวอักษร และระบบต้อง
# Given: เมื่อเกิน หากค่าว่างให้บันทึกได้ และ ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE5-002
# When: ระบุ/ประมวลผล กรอกหมายเหตุได้ความยาวไม่เกิน 200 ตัวอักษร และระบบต้องแสดงข้อความ "หมายเหตุยาวเกินกำ
# Then: กรอกหมายเหตุได้ความยาวไม่เกิน 200 ตัวอักษร และระบบต้องแสดงข้อความ "หมายเหตุยาวเกินกำหนด" เมื่อเกิน หากค่าว่างให้บันทึกได้
@pytest.mark.testcase("TC-CAM-RULE5-003")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Positive test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE5-003")
def test_tc_cam_rule5_003_positive(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ระบุ/ประมวลผล กรอกหมายเหตุได้ความยาวไม่เกิน 200 ตัวอักษร และระบบต้องแสดงข้อความ "หมายเหตุยาวเกินกำ | Data: 199 | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ แสดงข้อความ "หมายเหตุยาวเกินกำหนด" เมื่อเกิน หากค่าว่างให้บันทึกได้ | Data: - | Expected: กรอกหมายเหตุได้ความยาวไม่เกิน 200 ตัวอักษร และระบบต้องแสดงข้อความ "หมายเหตุยาวเก
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE5-004 v1 | REQ-CAM-RULE5-002 | Boundary: เจ้าหน้าที่Compliance ต้องกรอกหมายเหตุได้ความยาวไม่เกิน 200 ตัวอักษร และระบบต้อง
# Given: เมื่อเกิน หากค่าว่างให้บันทึกได้ และ ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE5-002
# When: ประมวลผลรายการโดยใช้ค่า กรอกหมายเหตุได้ความยาวไม่เกิน 200 ตัวอักษร และระบบต้องแสดงข้อความ "หมายเหตุยาวเกินกำ ตามค่าขอบที่กำหนด
# Then: กรอกหมายเหตุได้ความยาวไม่เกิน 200 ตัวอักษร และระบบต้องแสดงข้อความ "หมายเหตุยาวเกินกำหนด" เมื่อเกิน หากค่าว่างให้บันทึกได้
@pytest.mark.testcase("TC-CAM-RULE5-004")
@pytest.mark.parametrize(
    "raw_value, expected",
    [
        pytest.param("199", True, id="ต่ำกว่า Boundary"),
        pytest.param("200", True, id="เท่ากับ Boundary"),
        pytest.param("201", False, id="สูงกว่า Boundary"),
        pytest.param("0", True, id="ค่าศูนย์"),
        pytest.param("", ValidationError, id="ค่าว่าง [AI RECOMMENDED]"),
        pytest.param("ABC", InvalidDataTypeError, id="ชนิดข้อมูลผิด [AI RECOMMENDED]"),
    ],
)
def test_tc_cam_rule5_004_boundary(raw_value, expected):
    if isinstance(expected, type) and issubclass(expected, Exception):
        with pytest.raises(expected):
            parse_amount(raw_value)
        return
    assert rule_service.meets_req_cam_rule5_002(parse_amount(raw_value)) is expected


# TC-CAM-RULE5-005 v1 | REQ-CAM-RULE5-002 | Negative: เจ้าหน้าที่Compliance ต้องกรอกหมายเหตุได้ความยาวไม่เกิน 200 ตัวอักษร และระบบต้อง
# Given: เมื่อเกิน หากค่าว่างให้บันทึกได้ และ ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE5-002
# When: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ
# Then: ระบบต้องปฏิเสธการทำรายการ
@pytest.mark.testcase("TC-CAM-RULE5-005")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Negative test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE5-005")
def test_tc_cam_rule5_005_negative(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ | Data: ข้อมูล Synthetic ที่เข้าข่ายกรณี Negative | Expected: ระบบต้องปฏิเสธการทำรายการ
    # Step 3: ตรวจผลลัพธ์/ข้อมูลที่บันทึก | Data: - | Expected: ไม่มีข้อมูลที่ไม่เข้าเงื่อนไขปรากฏในผลลัพธ์
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")
