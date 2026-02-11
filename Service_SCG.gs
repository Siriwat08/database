/**
 * 📦 Service: SCG Operation 
 *   
 * -------------------------------------------------------
 */

function fetchDataFromSCGJWD() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    const inputSheet = ss.getSheetByName(SCG_CONFIG.SHEET_INPUT);
    const dataSheet = ss.getSheetByName(SCG_CONFIG.SHEET_DATA);

    if (!inputSheet || !dataSheet) throw new Error("ไม่พบชีต Input หรือ Data");

    const cookie = inputSheet.getRange(SCG_CONFIG.COOKIE_CELL).getValue();
    if (!cookie) throw new Error("ไม่พบ Cookie");

    const lastRow = inputSheet.getLastRow();
    if (lastRow < SCG_CONFIG.INPUT_START_ROW) throw new Error("ไม่พบ Shipment No.");

    const shipmentNumbers = inputSheet
      .getRange(SCG_CONFIG.INPUT_START_ROW, 1, lastRow - SCG_CONFIG.INPUT_START_ROW + 1, 1)
      .getValues().flat().filter(String);

    const shipmentString = shipmentNumbers.join(',');
    if (!shipmentString) throw new Error("Shipment No. ว่าง");

    inputSheet.getRange(SCG_CONFIG.SHIPMENT_STRING_CELL)
      .setValue(shipmentString)
      .setHorizontalAlignment("left");

    const payload = {
      DeliveryDateFrom: '',
      DeliveryDateTo: '',
      TenderDateFrom: '',
      TenderDateTo: '',
      CarrierCode: '',
      CustomerCode: '',
      OriginCodes: '',
      ShipmentNos: shipmentString
    };

    const options = {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true,
      headers: { cookie: cookie }
    };

    ss.toast("กำลังดึงข้อมูลและวิเคราะห์ E-POD...", "System Status", 60);
    const response = UrlFetchApp.fetch(SCG_CONFIG.API_URL, options);
    if (response.getResponseCode() !== 200) throw new Error(response.getContentText());

    const shipments = JSON.parse(response.getContentText()).data;
    if (!shipments || shipments.length === 0) throw new Error("ไม่พบข้อมูลจาก API");

    const allFlatData = [];
    let runningRow = 2;

    // ===============================
    // Phase 1: Flatten Data
    // ===============================
    shipments.forEach(shipment => {
      const destSet = new Set();
      (shipment.DeliveryNotes || []).forEach(n => {
        if (n.ShipToName) destSet.add(n.ShipToName);
      });

      const totalDestCount = destSet.size;
      const destListStr = Array.from(destSet).join(", ");

      (shipment.DeliveryNotes || []).forEach(note => {
        (note.Items || []).forEach(item => {
          const planDeliveryDate = note.PlanDelivery ? new Date(note.PlanDelivery) : null;
          const dailyJobId = note.PurchaseOrder + "-" + runningRow;

          const row = [
            dailyJobId,                         // 0
            planDeliveryDate,                   // 1
            String(note.PurchaseOrder),         // 2 Invoice
            String(shipment.ShipmentNo),        // 3 Shipment
            shipment.DriverName,                // 4
            shipment.TruckLicense,              // 5
            String(shipment.CarrierCode),       // 6
            shipment.CarrierName,               // 7
            String(note.SoldToCode),            // 8
            note.SoldToName,                    // 9 Owner
            note.ShipToName,                    // 10 Shop
            note.ShipToAddress,                 // 11
            note.ShipToLatitude + ", " + note.ShipToLongitude, // 12 SCG LatLong
            item.MaterialName,                  // 13
            item.ItemQuantity,                  // 14
            item.QuantityUnit,                  // 15
            item.ItemWeight,                    // 16
            String(note.DeliveryNo),            // 17
            totalDestCount,                     // 18
            destListStr,                        // 19
            "รอสแกน",                           // 20
            "ยังไม่ได้ส่ง",                       // 21
            "",                                 // 22 Email
            0,                                  // 23 Qty Sum
            0,                                  // 24 Weight Sum
            0,                                  // 25 Scan Invoice
            "",                                 // 26 LatLong_Actual
            "",                                 // 27 Display Text
            ""                                  // 28 ShopKey (เติมทีหลัง)
          ];

          allFlatData.push(row);
          runningRow++;
        });
      });
    });

    // ===============================
    // Phase 2: Grouping + E-POD
    // ===============================
    const shopAgg = {};

    allFlatData.forEach(r => {
      const shipmentNo = r[3];
      const shopName = r[10];
      const ownerName = r[9];
      const invoiceNo = r[2];
      const qty = Number(r[14]) || 0;
      const weight = Number(r[16]) || 0;

      const key = shipmentNo + "|" + shopName;

      if (!shopAgg[key]) {
        shopAgg[key] = {
          totalQty: 0,
          totalWeight: 0,
          allInvoices: new Set(),
          epodInvoices: new Set()
        };
      }

      const isEPOD = checkIsEPOD(ownerName, invoiceNo);

      shopAgg[key].totalQty += qty;
      shopAgg[key].totalWeight += weight;
      shopAgg[key].allInvoices.add(invoiceNo);
      if (isEPOD) shopAgg[key].epodInvoices.add(invoiceNo);
    });

    // ===============================
    // Phase 3: Write Aggregation
    // ===============================
    allFlatData.forEach(r => {
      const key = r[3] + "|" + r[10];
      const agg = shopAgg[key];

      const scanInv = agg.allInvoices.size - agg.epodInvoices.size;

      r[23] = agg.totalQty;
      r[24] = Number(agg.totalWeight.toFixed(2));
      r[25] = scanInv;
      r[27] = `${r[9]} / รวม ${scanInv} บิล`;
      r[28] = key;
    });

    // ===============================
    // Phase 4: Write Sheet
    // ===============================
    const headers = [
      "ID_งานประจำวัน",
      "PlanDelivery",
      "InvoiceNo",
      "ShipmentNo",
      "DriverName",
      "TruckLicense",
      "CarrierCode",
      "CarrierName",
      "SoldToCode",
      "SoldToName",
      "ShipToName",
      "ShipToAddress",
      "LatLong_SCG",
      "MaterialName",
      "ItemQuantity",
      "QuantityUnit",
      "ItemWeight",
      "DeliveryNo",
      "จำนวนปลายทาง_System",
      "รายชื่อปลายทาง_System",
      "ScanStatus",
      "DeliveryStatus",
      "Email พนักงาน",
      "จำนวนสินค้ารวมของร้านนี้",
      "น้ำหนักสินค้ารวมของร้านนี้",
      "จำนวน_Invoice_ที่ต้องสแกน",
      "LatLong_Actual",
      "ชื่อเจ้าของสินค้า_Invoice_ที่ต้องสแกน",
      "ShopKey"
    ];

    dataSheet.clear();
    dataSheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold");

    if (allFlatData.length > 0) {
      dataSheet.getRange(2, 1, allFlatData.length, headers.length)
        .setValues(allFlatData);
      dataSheet.getRange(2, 2, allFlatData.length, 1)
        .setNumberFormat("dd/mm/yyyy");
      dataSheet.getRange(2, 3, allFlatData.length, 1)
        .setNumberFormat("@");
      dataSheet.autoResizeColumns(1, headers.length);
    }

    ss.toast("โหลดข้อมูลเสร็จสิ้น", "System Status", 5);
    applyMasterCoordinatesToDailyJob();
    ui.alert(`ดึงข้อมูลสำเร็จ ${allFlatData.length} แถว`);

  } catch (e) {
    SpreadsheetApp.getUi().alert("เกิดข้อผิดพลาด: " + e.message);
  }
}

/**
 * 🧠 E-POD Logic
 */
function checkIsEPOD(ownerName, invoiceNo) {
  if (!ownerName || !invoiceNo) return false;

  const owner = ownerName.toUpperCase();
  const inv = invoiceNo.toUpperCase();

  const whitelist = ["SCG EXPRESS", "BETTERBE", "JWD TRANSPORT"];
  if (whitelist.some(w => owner.includes(w))) return true;

  if (["_DOC", "-DOC", "FFF", "EOP", "แก้เอกสาร"].some(k => inv.includes(k))) return false;
  if (inv.startsWith("N3")) return false;

  if (owner.includes("DENSO") || owner.includes("เด็นโซ่") || /^(78|79)/.test(inv)) return true;

  return false;
}


/**
 * 🛰️ ฟังก์ชันจับคู่พิกัดและอีเมลพนักงาน (V1.2 Original Logic)
 */
function applyMasterCoordinatesToDailyJob() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName(SCG_CONFIG.SHEET_DATA);
  const dbSheet = ss.getSheetByName(SCG_CONFIG.SHEET_MASTER_DB);
  const mapSheet = ss.getSheetByName(SCG_CONFIG.SHEET_MAPPING);
  const empSheet = ss.getSheetByName(SCG_CONFIG.SHEET_EMPLOYEE);

  if (!dataSheet || !dbSheet || !empSheet) return;

  const lastRow = dataSheet.getLastRow();
  if (lastRow < 2) return;

  // โหลด Master DB
  const masterCoords = {};
  if (dbSheet.getLastRow() > 1) {
    dbSheet.getRange(2, 1, dbSheet.getLastRow() - 1, 3).getValues().forEach(r => {
      if (r[0] && r[1] && r[2]) masterCoords[normalizeText(r[0])] = r[1] + ", " + r[2];
    });
  }

  // โหลด Name Mapping
  const aliasMap = {};
  if (mapSheet && mapSheet.getLastRow() > 1) {
    mapSheet.getRange(2, 1, mapSheet.getLastRow() - 1, 2).getValues().forEach(r => {
      if (r[0] && r[1]) aliasMap[normalizeText(r[0])] = normalizeText(r[1]);
    });
  }

  // โหลดข้อมูลพนักงาน (เพื่อ Map Email)
  const empMap = {};
  empSheet.getRange(2, 1, empSheet.getLastRow() - 1, 8).getValues().forEach(r => {
    // Col B(1) = ชื่อคนขับ, Col G(6) = Email
    if (r[1] && r[6]) empMap[normalizeText(r[1])] = r[6];
  });

  const values = dataSheet.getRange(2, 1, lastRow - 1, 28).getValues();

  const coordUpdates = [];
  const backgrounds = [];
  const emailUpdates = [];

  values.forEach(r => {
    let newGeo = "";
    let bg = null;

    // Logic Map พิกัด
    if (r[10]) { // ShipToName
      let name = normalizeText(r[10]);
      if (aliasMap[name]) name = aliasMap[name];
      if (masterCoords[name]) {
        newGeo = masterCoords[name];
        bg = "#b6d7a8";
      } else {
        const byBranch = findMasterByBranchLogic(r[10], masterCoords);
        if (byBranch) {
          newGeo = byBranch;
          bg = "#b6d7a8";
        }
      }
    }
    coordUpdates.push([newGeo]);
    backgrounds.push([bg]);

    // Logic Map Email
    // r[4] = DriverName -> Map ไปหา Email
    // ถ้าไม่เจอใน EmpMap ให้ใช้ค่าเดิมใน r[22] (เผื่อมีคนกรอกมือ)
    emailUpdates.push([empMap[normalizeText(r[4])] || r[22]]);
  });

  // บันทึกผลลัพธ์ลงชีต
  dataSheet.getRange(2, 27, coordUpdates.length, 1).setValues(coordUpdates); // Col 27: LatLong_Actual
  dataSheet.getRange(2, 27, backgrounds.length, 1).setBackgrounds(backgrounds);
  dataSheet.getRange(2, 23, emailUpdates.length, 1).setValues(emailUpdates); // Col 23: Email พนักงาน
}

function findMasterByBranchLogic(inputName, masterCoords) {
  const m = inputName.match(/(?:สาขา|Branch|Code)\s*(?:ที่)?\s*(\d+)/i);
  if (!m) return null;
  
  const padded = ("00000" + m[1]).slice(-5);
  const brand = normalizeText(inputName.split(/(?:สาขา|Branch|Code)/i)[0]);
  
  for (const k in masterCoords) {
    if (k.includes(brand) && k.includes(padded)) return masterCoords[k];
  }
  return null;
}

function clearDataSheet() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SCG_CONFIG.SHEET_DATA);
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).setBackground(null);
  }
}

function clearInputSheet() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SCG_CONFIG.SHEET_INPUT);
  if (!sheet) return;
  sheet.getRange(SCG_CONFIG.COOKIE_CELL).clearContent();
  sheet.getRange(SCG_CONFIG.SHIPMENT_STRING_CELL).clearContent();
  if (sheet.getLastRow() >= SCG_CONFIG.INPUT_START_ROW) {
    sheet.getRange(SCG_CONFIG.INPUT_START_ROW, 1, sheet.getLastRow() - SCG_CONFIG.INPUT_START_ROW + 1, 1).clearContent();
  }
}

function clearAllSCGSheets() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('ยืนยันการล้างข้อมูล', 'คุณต้องการล้างข้อมูลทั้งชีต Input และ Data หรือไม่?', ui.ButtonSet.YES_NO);
  
  if (response == ui.Button.YES) {
    clearInputSheet();
    clearDataSheet();
    ui.alert('✅ ล้างข้อมูลเรียบร้อยแล้วครับ');
  }
}


