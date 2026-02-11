/**
 * 🤖 Service: Auto Pilot 
 */

/**
 * ▶️ ฟังก์ชันเปิดระบบ Auto-Pilot
 * ตั้งเวลาให้ทำงานทุกๆ 10 นาที
 */
function START_AUTO_PILOT() {
  // 1. ลบ Trigger เดิมก่อนเพื่อป้องกันการซ้ำซ้อน
  STOP_AUTO_PILOT();
  
  // 2. สร้าง Trigger ใหม่
  ScriptApp.newTrigger("autoPilotRoutine")
    .timeBased()
    .everyMinutes(10)
    .create();
    
  // 3. แจ้งเตือนผู้ใช้
  var ui = SpreadsheetApp.getUi();
  ui.alert("✅ เปิดระบบ Auto-Pilot เรียบร้อย\nระบบจะตรวจสอบข้อมูลทุกๆ 10 นาทีครับ");
}

/**
 * ⏹️ ฟังก์ชันปิดระบบ Auto-Pilot
 * ลบ Trigger ทั้งหมดที่เกี่ยวข้อง
 */
function STOP_AUTO_PILOT() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "autoPilotRoutine") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // เช็คว่าถูกเรียกจากเมนูหรือไม่ (ถ้าเรียกจาก START จะไม่โชว์ Alert นี้)
  try {
     var caller = arguments.callee.caller;
     if (!caller || caller.name !== "START_AUTO_PILOT") {
        SpreadsheetApp.getUi().alert("⏹️ ปิดระบบ Auto-Pilot แล้ว");
     }
  } catch(e) {}
}

/**
 * ⚙️ Routine Function (ทำงานเบื้องหลัง)
 * ห้ามเปลี่ยนชื่อฟังก์ชันนี้ เพราะ Trigger ผูกไว้กับชื่อนี้
 */
function autoPilotRoutine() {
  // ---------------------------------------------------------
  // ภารกิจที่ 1: ตรวจสอบและเติม UUID ใน Database ถ้าขาดหายไป
  // ---------------------------------------------------------
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dbSheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    
    if (dbSheet) {
      var lastRow = dbSheet.getLastRow();
      if (lastRow > 1) {
         // อ่านเฉพาะคอลัมน์ UUID (K)
         var range = dbSheet.getRange(2, CONFIG.COL_UUID, lastRow - 1, 1);
         var values = range.getValues();
         var changed = false;
         
         for(var i = 0; i < values.length; i++) {
           // ถ้าเจอช่องว่าง ให้สร้าง UUID ใหม่ใส่เข้าไป
           if(!values[i][0] || values[i][0] === "") { 
             values[i][0] = Utilities.getUuid(); 
             changed = true; 
           }
         }
         
         // บันทึกกลับเฉพาะเมื่อมีการเปลี่ยนแปลง
         if(changed) {
           range.setValues(values);
           console.log("AutoPilot: Generated missing UUIDs.");
         }
      }
    }
  } catch (e) {
    console.error("AutoPilot Error (UUID): " + e.message);
  }
  
  // ---------------------------------------------------------
  // ภารกิจที่ 2: อัปเดตพิกัด/อีเมล ในงานประจำวัน (SCG Data)
  // เรียกใช้ฟังก์ชันจาก Service_SCG.gs
  // ---------------------------------------------------------
  try {
     // ตรวจสอบว่ามีชีต Data และมีข้อมูลอยู่หรือไม่
     var ss = SpreadsheetApp.getActiveSpreadsheet();
     var dataSheet = ss.getSheetByName(SCG_CONFIG.SHEET_DATA);
     if (dataSheet && dataSheet.getLastRow() > 1) {
        applyMasterCoordinatesToDailyJob();
        console.log("AutoPilot: Updated SCG Coordinates.");
     }
  } catch(e) {
    console.error("AutoPilot Error (SCG): " + e.message);
  }
}

