/**
 * 🔍 Service: Search API 
 */

function searchMasterData(keyword) {
  // 1. ตรวจสอบ Keyword
  if (!keyword || keyword.trim() === "") return [];
  var rawKey = keyword.trim().toLowerCase();
  var searchKey = normalizeText(keyword); // ใช้ฟังก์ชันตัดคำฟุ่มเฟือยช่วย

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ----------------------------------------------------
  // ส่วนที่ 1: โหลดข้อมูล Alias จาก NameMapping (ชีตที่ 2 ที่ท่านระบุ)
  // ----------------------------------------------------
  var mapSheet = ss.getSheetByName(CONFIG.MAPPING_SHEET); // "NameMapping"
  var aliasMap = {}; // เก็บว่า Master Name นี้ มีชื่อเล่นอะไรบ้าง
  
  if (mapSheet) {
    var lastRowMap = mapSheet.getLastRow();
    if (lastRowMap > 1) {
      // อ่าน Col A (Alias) และ Col B (Master Name)
      var mapData = mapSheet.getRange(2, 1, lastRowMap - 1, 2).getValues();
      
      mapData.forEach(function(row) {
        var alias = row[0];
        var master = row[1];
        if (alias && master) {
          var cleanMaster = normalizeText(master);
          var cleanAlias = normalizeText(alias);
          
          // เก็บข้อมูลแบบ: { "ชื่อจริง": "ชื่อเล่น1 ชื่อเล่น2 ..." }
          if (!aliasMap[cleanMaster]) {
            aliasMap[cleanMaster] = cleanAlias;
          } else {
            aliasMap[cleanMaster] += " " + cleanAlias;
          }
          
          // เก็บแบบ Raw Text ด้วยเผื่อค้นหาตรงๆ
          aliasMap[cleanMaster] += " " + alias.toString().toLowerCase();
        }
      });
    }
  }

  // ----------------------------------------------------
  // ส่วนที่ 2: ค้นหาใน Database (ชีตหลัก)
  // ----------------------------------------------------
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME); // "Database"
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // อ่านข้อมูล Col A-Q
  var data = sheet.getRange(2, 1, lastRow - 1, 17).getValues(); 
  var results = [];
  var limit = 100;

  for (var i = 0; i < data.length; i++) {
    if (results.length >= limit) break;

    var row = data[i];
    var name = row[CONFIG.COL_NAME - 1];      // ชื่อลูกค้า (Master)
    var address = row[CONFIG.COL_ADDR_GOOG - 1] || row[CONFIG.COL_SYS_ADDR - 1];
    var lat = row[CONFIG.COL_LAT - 1];
    var lng = row[CONFIG.COL_LNG - 1];
    var uuid = row[CONFIG.COL_UUID - 1];

    if (!name) continue;

    // เตรียมข้อมูลสำหรับตรวจสอบ
    var normName = normalizeText(name);
    var normAddr = address ? normalizeText(address) : "";
    var rawName = name.toString().toLowerCase();
    
    // ดึงชื่อเล่นจาก NameMapping (ถ้ามี)
    var aliases = aliasMap[normName] || "";

    // ----------------------------------------------------
    // 🎯 Logic การค้นหาแบบฉลาด (Smart Search)
    // 1. ตรงกับชื่อจริง (ใน Database)
    // 2. ตรงกับที่อยู่
    // 3. ตรงกับชื่อเล่น/ชื่อย่อ (ใน NameMapping) -> อันนี้คือสิ่งที่ท่านต้องการ
    // ----------------------------------------------------
    if (
      normName.includes(searchKey) || 
      rawName.includes(rawKey) ||
      normAddr.includes(searchKey) || 
      aliases.includes(searchKey) || // ค้นเจอในชื่อเล่น
      aliases.includes(rawKey)
    ) {
      results.push({
        name: name,
        address: address,
        lat: lat,
        lng: lng,
        // ลิงก์นำทางทันที
        mapLink: (lat && lng) ? "https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lng : "",
        uuid: uuid,
        // ส่ง Alias กลับไปโชว์ด้วย (Optional) หรือจะโชว์แค่ชื่อจริงก็ได้
        matchType: aliases.includes(searchKey) ? "เจอจากชื่อเล่น" : "เจอจากชื่อหลัก"
      });
    }
  }

  return results;
}
