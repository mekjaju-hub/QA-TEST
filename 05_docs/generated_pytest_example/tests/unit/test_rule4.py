"""Tests for module RULE4 — generated from APPROVED test cases only."""
import pytest
from decimal import Decimal

from app.services import rule_service
from app.validators.input_validator import parse_amount, ValidationError, InvalidDataTypeError


# TC-CAM-RULE4-001 v1 | REQ-CAM-RULE4-002 | Positive: ระบบต้องคำนวณยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดงใน Customer Transaction Mont
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE4-002
# When: ระบุ/ประมวลผล ยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดงใน Customer Transaction Monthly Report แล้วคำนวณยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดง
# Then: คำนวณยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดงใน Customer Transaction Monthly Report
@pytest.mark.testcase("TC-CAM-RULE4-001")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Positive test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE4-001")
def test_tc_cam_rule4_001_positive(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ระบุ/ประมวลผล ยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดงใน Customer Transaction Monthly Report แล้วคำนว | Data: ข้อมูล Synthetic ที่เข้าเงื่อนไข | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ แสดงใน Customer Transaction Monthly Report | Data: - | Expected: คำนวณยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดงใน Customer Transaction Monthly Repo
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE4-002 v1 | REQ-CAM-RULE4-002 | Negative: ระบบต้องคำนวณยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดงใน Customer Transaction Mont
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE4-002
# When: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ
# Then: ระบบต้องปฏิเสธการทำรายการ
@pytest.mark.testcase("TC-CAM-RULE4-002")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Negative test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE4-002")
def test_tc_cam_rule4_002_negative(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ | Data: ข้อมูล Synthetic ที่เข้าข่ายกรณี Negative | Expected: ระบบต้องปฏิเสธการทำรายการ
    # Step 3: ตรวจผลลัพธ์/ข้อมูลที่บันทึก | Data: - | Expected: ไม่มีข้อมูลที่ไม่เข้าเงื่อนไขปรากฏในผลลัพธ์
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE4-003 v1 | REQ-CAM-RULE4-002 | Data: ระบบต้องคำนวณยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดงใน Customer Transaction Monthly 
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE4-002
# When: ระบุ/ประมวลผล ยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดงใน Customer Transaction Monthly Report แล้วคำนวณยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดง
# Then: คำนวณยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดงใน Customer Transaction Monthly Report
@pytest.mark.testcase("TC-CAM-RULE4-003")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Data test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE4-003")
def test_tc_cam_rule4_003_data(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ระบุ/ประมวลผล ยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดงใน Customer Transaction Monthly Report แล้วคำนว | Data: ข้อมูล Synthetic ที่เข้าเงื่อนไข | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ แสดงใน Customer Transaction Monthly Report | Data: - | Expected: คำนวณยอดรวมรายเดือนของลูกค้าแต่ละราย และแสดงใน Customer Transaction Monthly Repo
    # Step 4: Query ข้อมูลที่บันทึกด้วย SQL Template | Data: SQL Template (Read-only) | Expected: ข้อมูลใน Database ตรงกับผลลัพธ์บนหน้าจอ/API
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE4-004 v1 | REQ-CAM-RULE4-003 | Positive: ระบบต้องประมวลผลรายงานอย่างรวดเร็วและเหมาะสม
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE4-003
# When: ดำเนินการตาม Requirement
# Then: เจ้าหน้าที่Compliance
@pytest.mark.testcase("TC-CAM-RULE4-004")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Positive test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE4-004")
def test_tc_cam_rule4_004_positive(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ดำเนินการตาม Requirement | Data: ข้อมูล Synthetic ที่เข้าเงื่อนไข | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ รายงานอย่างรวดเร็วและเหมาะสม | Data: - | Expected: เจ้าหน้าที่Compliance
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE4-005 v1 | REQ-CAM-RULE4-003 | Negative: ระบบต้องประมวลผลรายงานอย่างรวดเร็วและเหมาะสม
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE4-003
# When: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ
# Then: ระบบต้องปฏิเสธการทำรายการ
@pytest.mark.testcase("TC-CAM-RULE4-005")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Negative test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE4-005")
def test_tc_cam_rule4_005_negative(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ | Data: ข้อมูล Synthetic ที่เข้าข่ายกรณี Negative | Expected: ระบบต้องปฏิเสธการทำรายการ
    # Step 3: ตรวจผลลัพธ์/ข้อมูลที่บันทึก | Data: - | Expected: ไม่มีข้อมูลที่ไม่เข้าเงื่อนไขปรากฏในผลลัพธ์
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE4-006 v1 | REQ-CAM-RULE4-003 | Data: ระบบต้องประมวลผลรายงานอย่างรวดเร็วและเหมาะสม
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE4-003
# When: ดำเนินการตาม Requirement
# Then: เจ้าหน้าที่Compliance
@pytest.mark.testcase("TC-CAM-RULE4-006")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Data test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE4-006")
def test_tc_cam_rule4_006_data(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ดำเนินการตาม Requirement | Data: ข้อมูล Synthetic ที่เข้าเงื่อนไข | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ รายงานอย่างรวดเร็วและเหมาะสม | Data: - | Expected: เจ้าหน้าที่Compliance
    # Step 4: Query ข้อมูลที่บันทึกด้วย SQL Template | Data: SQL Template (Read-only) | Expected: ข้อมูลใน Database ตรงกับผลลัพธ์บนหน้าจอ/API
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")
