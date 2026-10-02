"""Tests for module RULE3 — generated from APPROVED test cases only."""
import pytest
from decimal import Decimal

from app.services import rule_service
from app.validators.input_validator import parse_amount, ValidationError, InvalidDataTypeError


# TC-CAM-RULE3-001 v1 | REQ-CAM-RULE3-001 | Positive: ระบบต้องแสดงรายการลูกค้าที่มียอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200,000 บาท ย้อนหลั
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE3-001
# When: ระบุ/ประมวลผล ยอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200 แล้วรวมธุรกรรมมากกว่าหรือเท่ากับ 200
# Then: แสดงรายการลูกค้าที่มียอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200,000 บาท ย้อนหลัง 14 วัน ในรายงาน High Value Alert
@pytest.mark.testcase("TC-CAM-RULE3-001")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Positive test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE3-001")
def test_tc_cam_rule3_001_positive(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ระบุ/ประมวลผล ยอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200 แล้วรวมธุรกรรมมากกว่าหรือเท่ากับ 200 | Data: 201,000.00 | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ แสดงรายการลูกค้าที่มียอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200 | Data: - | Expected: แสดงรายการลูกค้าที่มียอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200,000 บาท ย้อนหลัง 14 วัน
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE3-002 v1 | REQ-CAM-RULE3-001 | Boundary: ระบบต้องแสดงรายการลูกค้าที่มียอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200,000 บาท ย้อนหลั
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE3-001
# When: ประมวลผลรายการโดยใช้ค่า ยอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200 ตามค่าขอบที่กำหนด
# Then: แสดงรายการลูกค้าที่มียอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200,000 บาท ย้อนหลัง 14 วัน ในรายงาน High Value Alert
@pytest.mark.testcase("TC-CAM-RULE3-002")
@pytest.mark.parametrize(
    "raw_value, expected",
    [
        pytest.param("199999.99", False, id="ต่ำกว่า Boundary"),
        pytest.param("200000", True, id="เท่ากับ Boundary"),
        pytest.param("200000.01", True, id="สูงกว่า Boundary"),
        pytest.param("0", False, id="ค่าศูนย์"),
        pytest.param("", ValidationError, id="ค่าว่าง [AI RECOMMENDED]"),
        pytest.param("ABC", InvalidDataTypeError, id="ชนิดข้อมูลผิด [AI RECOMMENDED]"),
    ],
)
def test_tc_cam_rule3_002_boundary(raw_value, expected):
    if isinstance(expected, type) and issubclass(expected, Exception):
        with pytest.raises(expected):
            parse_amount(raw_value)
        return
    assert rule_service.meets_req_cam_rule3_001(parse_amount(raw_value)) is expected


# TC-CAM-RULE3-003 v1 | REQ-CAM-RULE3-001 | Negative: ระบบต้องแสดงรายการลูกค้าที่มียอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200,000 บาท ย้อนหลั
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE3-001
# When: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ
# Then: ระบบต้องปฏิเสธการทำรายการ
@pytest.mark.testcase("TC-CAM-RULE3-003")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Negative test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE3-003")
def test_tc_cam_rule3_003_negative(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ | Data: ข้อมูล Synthetic ที่เข้าข่ายกรณี Negative | Expected: ระบบต้องปฏิเสธการทำรายการ
    # Step 3: ตรวจผลลัพธ์/ข้อมูลที่บันทึก | Data: - | Expected: ไม่มีข้อมูลที่ไม่เข้าเงื่อนไขปรากฏในผลลัพธ์
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE3-004 v1 | REQ-CAM-RULE3-001 | Data: ระบบต้องแสดงรายการลูกค้าที่มียอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200,000 บาท ย้อนหลัง 14
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE3-001
# When: ระบุ/ประมวลผล ยอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200 แล้วรวมธุรกรรมมากกว่าหรือเท่ากับ 200
# Then: แสดงรายการลูกค้าที่มียอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200,000 บาท ย้อนหลัง 14 วัน ในรายงาน High Value Alert
@pytest.mark.testcase("TC-CAM-RULE3-004")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Data test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE3-004")
def test_tc_cam_rule3_004_data(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ระบุ/ประมวลผล ยอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200 แล้วรวมธุรกรรมมากกว่าหรือเท่ากับ 200 | Data: 201,000.00 | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ แสดงรายการลูกค้าที่มียอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200 | Data: - | Expected: แสดงรายการลูกค้าที่มียอดรวมธุรกรรมมากกว่าหรือเท่ากับ 200,000 บาท ย้อนหลัง 14 วัน
    # Step 4: Query ข้อมูลที่บันทึกด้วย SQL Template | Data: SQL Template (Read-only) | Expected: ข้อมูลใน Database ตรงกับผลลัพธ์บนหน้าจอ/API
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE3-005 v1 | REQ-CAM-RULE3-002 | Positive: ระบบต้องไม่นำรายการกองทุน PVD มารวมในการคำนวณยอดรวมธุรกรรมของรายงาน High Value A
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE3-002
# When: ระบุ/ประมวลผล ยอดรวมธุรกรรมของรายงาน High Value Alert แล้วรวมในการคำนวณยอดรวมธุรกรรมของรายงาน High Value Alert
# Then: ไม่นำรายการกองทุน PVD มารวมในการคำนวณยอดรวมธุรกรรมของรายงาน High Value Alert
@pytest.mark.testcase("TC-CAM-RULE3-005")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Positive test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE3-005")
def test_tc_cam_rule3_005_positive(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ระบุ/ประมวลผล ยอดรวมธุรกรรมของรายงาน High Value Alert แล้วรวมในการคำนวณยอดรวมธุรกรรมของรายงาน High V | Data: ข้อมูล Synthetic ที่เข้าเงื่อนไข | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ รายงาน High Value Alert | Data: - | Expected: ไม่นำรายการกองทุน PVD มารวมในการคำนวณยอดรวมธุรกรรมของรายงาน High Value Alert
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE3-006 v1 | REQ-CAM-RULE3-002 | Negative: ระบบต้องไม่นำรายการกองทุน PVD มารวมในการคำนวณยอดรวมธุรกรรมของรายงาน High Value A
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE3-002
# When: ประมวลผลข้อมูลที่เข้าข่ายข้อยกเว้น: ไม่นำรายการกองทุน PVD มารวมในการคำนวณยอดรวมธุรกรรมของรายงาน High Value Alert
# Then: ระบบต้องไม่นำข้อมูลดังกล่าวมาประมวลผล (ไม่นำรายการกองทุน PVD มารวมในการคำนวณยอดรวมธุรกรรมของรายงาน High Value Alert)
@pytest.mark.testcase("TC-CAM-RULE3-006")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Negative test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE3-006")
def test_tc_cam_rule3_006_negative(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ประมวลผลข้อมูลที่เข้าข่ายข้อยกเว้น: ไม่นำรายการกองทุน PVD มารวมในการคำนวณยอดรวมธุรกรรมของรายงาน High | Data: ข้อมูล Synthetic ที่เข้าข่ายกรณี Negative | Expected: ระบบต้องไม่นำข้อมูลดังกล่าวมาประมวลผล (ไม่นำรายการกองทุน PVD มารวมในการคำนวณยอดร
    # Step 3: ตรวจผลลัพธ์/ข้อมูลที่บันทึก | Data: - | Expected: ไม่มีข้อมูลที่ไม่เข้าเงื่อนไขปรากฏในผลลัพธ์
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE3-007 v1 | REQ-CAM-RULE3-002 | Data: ระบบต้องไม่นำรายการกองทุน PVD มารวมในการคำนวณยอดรวมธุรกรรมของรายงาน High Value Alert
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE3-002
# When: ระบุ/ประมวลผล ยอดรวมธุรกรรมของรายงาน High Value Alert แล้วรวมในการคำนวณยอดรวมธุรกรรมของรายงาน High Value Alert
# Then: ไม่นำรายการกองทุน PVD มารวมในการคำนวณยอดรวมธุรกรรมของรายงาน High Value Alert
@pytest.mark.testcase("TC-CAM-RULE3-007")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Data test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE3-007")
def test_tc_cam_rule3_007_data(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ระบุ/ประมวลผล ยอดรวมธุรกรรมของรายงาน High Value Alert แล้วรวมในการคำนวณยอดรวมธุรกรรมของรายงาน High V | Data: ข้อมูล Synthetic ที่เข้าเงื่อนไข | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ รายงาน High Value Alert | Data: - | Expected: ไม่นำรายการกองทุน PVD มารวมในการคำนวณยอดรวมธุรกรรมของรายงาน High Value Alert
    # Step 4: Query ข้อมูลที่บันทึกด้วย SQL Template | Data: SQL Template (Read-only) | Expected: ข้อมูลใน Database ตรงกับผลลัพธ์บนหน้าจอ/API
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE3-008 v1 | REQ-CAM-RULE3-003 | Positive: เจ้าหน้าที่Compliance ต้องสามารถ Export รายงาน High Value Alert เป็นไฟล์ CSV
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE3-003
# When: ดำเนินการตาม Requirement
# Then: สามารถ Export รายงาน High Value Alert เป็นไฟล์ CSV
@pytest.mark.testcase("TC-CAM-RULE3-008")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Positive test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE3-008")
def test_tc_cam_rule3_008_positive(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ดำเนินการตาม Requirement | Data: ข้อมูล Synthetic ที่เข้าเงื่อนไข | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ Export รายงาน High Value Alert เป็นไฟล์ CSV | Data: - | Expected: สามารถ Export รายงาน High Value Alert เป็นไฟล์ CSV
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE3-009 v1 | REQ-CAM-RULE3-003 | Negative: เจ้าหน้าที่Compliance ต้องสามารถ Export รายงาน High Value Alert เป็นไฟล์ CSV
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE3-003
# When: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ
# Then: ระบบต้องปฏิเสธการทำรายการ
@pytest.mark.testcase("TC-CAM-RULE3-009")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Negative test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE3-009")
def test_tc_cam_rule3_009_negative(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ผู้ใช้ที่ไม่ใช่ เจ้าหน้าที่Compliance พยายามทำรายการ | Data: ข้อมูล Synthetic ที่เข้าข่ายกรณี Negative | Expected: ระบบต้องปฏิเสธการทำรายการ
    # Step 3: ตรวจผลลัพธ์/ข้อมูลที่บันทึก | Data: - | Expected: ไม่มีข้อมูลที่ไม่เข้าเงื่อนไขปรากฏในผลลัพธ์
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")


# TC-CAM-RULE3-010 v1 | REQ-CAM-RULE3-003 | Data: เจ้าหน้าที่Compliance ต้องสามารถ Export รายงาน High Value Alert เป็นไฟล์ CSV
# Given:  ผู้ใช้ เจ้าหน้าที่Compliance เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม REQ-CAM-RULE3-003
# When: ดำเนินการตาม Requirement
# Then: สามารถ Export รายงาน High Value Alert เป็นไฟล์ CSV
@pytest.mark.testcase("TC-CAM-RULE3-010")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: Data test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน TC-CAM-RULE3-010")
def test_tc_cam_rule3_010_data(synthetic_transaction):
    # Step 1: เตรียมข้อมูลทดสอบและเข้าสู่ระบบ | Data: Role: เจ้าหน้าที่Compliance; Customer ID: CUST-TEST-0001 (Sy | Expected: เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ
    # Step 2: ดำเนินการตาม Requirement | Data: ข้อมูล Synthetic ที่เข้าเงื่อนไข | Expected: ระบบรับข้อมูลได้
    # Step 3: ตรวจสอบ Export รายงาน High Value Alert เป็นไฟล์ CSV | Data: - | Expected: สามารถ Export รายงาน High Value Alert เป็นไฟล์ CSV
    # Step 4: Query ข้อมูลที่บันทึกด้วย SQL Template | Data: SQL Template (Read-only) | Expected: ข้อมูลใน Database ตรงกับผลลัพธ์บนหน้าจอ/API
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")
