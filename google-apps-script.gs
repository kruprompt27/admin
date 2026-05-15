/**
 * ============================================================
 * Google Apps Script - ครูพร้อมสอน™ v4.2
 * Drive Links เป็น Template Message + บันทึกท้ายแผน
 * ============================================================
 *
 * 📋 โครงสร้าง Sheet "Drive Links" (8 คอลัมน์):
 *   A: ชั้น          | B: หลักสูตร       | C: วิชา
 *   D: เวลาเรียน(ชม.) | E: จำนวนแผน        | F: ลิงก์ Drive
 *   G: ข้อความสำหรับลูกค้า | H: บันทึกท้ายแผน
 *
 * 📝 ตัวอย่าง "ข้อความสำหรับลูกค้า" (คอลัมน์ G):
 *   📘 แผนการสอน "ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ ป.6" ตามหลักสูตรใหม่ 2568
 *   👉 จำนวน 100 ชั่วโมง / 72 แผน
 *      📥 ดาวน์โหลดได้ที่:
 *   {LINK}
 *
 * 📝 ตัวอย่าง "บันทึกท้ายแผน" (คอลัมน์ H):
 *   ✅ มีบันทึกหลังการสอนรายแผนครบทุกชั่วโมง
 *   📌 สามารถปรับเวลาตามบริบทห้องเรียนได้
 *
 * ใช้ตัวยึด {LINK} ในข้อความ → ระบบแทนที่ด้วยลิงก์ Drive ที่คลิกได้
 * รองรับ markdown __ตัวหนา__ ในข้อความ
 *
 * ============================================================
 */

const NOTIFY_EMAIL = 'kruprompt@gmail.com';
const SHEET_NAME = 'Orders';
const DASHBOARD_NAME = '📊 Dashboard';
const DRIVE_LINKS_SHEET = '🔗 Drive Links';
const EXAMPLE_LINKS_SHEET = '📂 Example Links';
const PAGE_NAME = 'ครูพร้อมสอน';

// 🆕 URL ของหน้าเว็บลูกค้า (สำหรับใส่ในเมลยืนยัน → ปุ่มอัปโหลดสลิป)
const CUSTOMER_SITE_URL = 'https://kruprompt27.github.io/shop/';

// 🆕 v7: Config ส่วนกลาง (ปรับได้)
const CONFIG = {
  // เมล: ปิดเมลที่ไม่จำเป็นเพื่อประหยัดโควต้า
  SEND_CUSTOMER_CONFIRMATION: false,  // เมลยืนยันสั่งซื้อ (ลูกค้าเห็นใน Facebook อยู่แล้ว)
  SEND_SLIP_EMAIL: false,             // เมลแจ้งสลิป (admin) — ใช้ Telegram แทน
  // เมลที่ยังเปิดอยู่:
  // ✅ เมลส่งแผน (ลูกค้า) — จำเป็น เพราะมีลิงก์ Drive

  // 💬 Telegram Bot (ฟรีไม่จำกัด)
  // สร้าง bot จาก @BotFather ใน Telegram → ได้ Bot Token
  // ส่งข้อความหา bot ตัวเอง → ดึง chat_id จาก https://api.telegram.org/bot<TOKEN>/getUpdates
  // ปล่อยว่าง = ปิดการแจ้งเตือน
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHAT_ID: ''
};

// คอลัมน์ของ Orders (1-indexed)
const COL = {
  TIMESTAMP: 1, ORDER_ID: 2, CUSTOMER_FB: 3, CUSTOMER_EMAIL: 4,
  ITEM_COUNT: 5, ITEMS: 6, SUBTOTAL: 7, DISCOUNT_PERCENT: 8,
  DISCOUNT_PERCENT_VALUE: 9, DISCOUNT_BAHT: 10, NET_TOTAL: 11,
  STATUS: 12, NOTE: 13, SLIP_LINK: 14,
  EMAIL_PER_ITEM: 15  // 🆕 v7.2: JSON เก็บเมลแยกตามวิชา {"subjectKey": "email", ...}
};
const COL_COUNT = 15;

// โฟลเดอร์ใน Drive สำหรับเก็บสลิป (ระบบสร้างให้อัตโนมัติ)
const SLIPS_FOLDER_NAME = 'KruPromSorn_Slips';

// คอลัมน์ของ Drive Links (1-indexed)
const DL_COL = {
  GRADE: 1, CURRICULUM: 2, SUBJECT: 3, HOURS: 4, PLAN_COUNT: 5,
  DRIVE: 6, MESSAGE: 7, POST_NOTE: 8
};
const DL_COL_COUNT = 8;

const STATUSES = {
  PENDING: 'รอชำระเงิน',
  PAID: 'ชำระเงินแล้ว',
  APPROVED: 'อนุมัติส่งแผน',
  COMPLETED: 'ส่งแผนเสร็จสิ้น'
};

const STATUS_COLORS = {
  'รอชำระเงิน':       { bg: '#fef9c3', fg: '#a16207' },
  'ชำระเงินแล้ว':     { bg: '#dbeafe', fg: '#1e40af' },
  'อนุมัติส่งแผน':    { bg: '#ede9fe', fg: '#6b21a8' },
  'ส่งแผนเสร็จสิ้น':  { bg: '#dcfce7', fg: '#15803d' },
  'ยกเลิก':           { bg: '#fee2e2', fg: '#b91c1c' }
};


/**
 * Default rows สำหรับ Drive Links Sheet
 * Format: [ชั้น, หลักสูตร, วิชา, เวลาเรียน(ชม.)]
 * จำนวนแผน, ลิงก์, ข้อความ, บันทึกท้ายแผน - ปล่อยว่าง รอกรอกเอง
 */
const DEFAULT_DRIVE_LINKS_DATA = [
  // ป.1 (68)
  ['ป.1', '68', 'ภาษาไทย', 200],
  ['ป.1', '68', 'ภาษาอังกฤษ', 160],
  ['ป.1', '68', 'ภาษาอังกฤษ', 200],
  ['ป.1', '68', 'คณิตศาสตร์', 200],
  ['ป.1', '68', 'วิทยาศาสตร์และสิ่งแวดล้อม', 40],
  ['ป.1', '68', 'วิทยาศาสตร์และสิ่งแวดล้อม', 80],
  ['ป.1', '68', 'สังคมและความเป็นพลเมือง', 40],
  ['ป.1', '68', 'สังคมและความเป็นพลเมือง', 80],
  ['ป.1', '68', 'ประวัติศาสตร์', 40],
  ['ป.1', '68', 'เศรษฐกิจและการเงิน', 40],
  ['ป.1', '68', 'เศรษฐกิจและการเงิน', 80],
  ['ป.1', '68', 'สุขภาพกายและจิต', 40],
  ['ป.1', '68', 'ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', 40],
  ['ป.1', '68', 'ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', 80],
  ['ป.1', '68', 'การใช้เทคโนโลยีอย่างฉลาดรู้', 40],
  ['ป.1', '68', 'วิทยาการคำนวณ', 40],
  ['ป.1', '68', 'พลศึกษา', 40],
  ['ป.1', '68', 'การงานอาชีพ', 40],
  ['ป.1', '68', 'ดนตรี-นาฏศิลป์', 40],

  // ป.2 (68)
  ['ป.2', '68', 'ภาษาไทย', 200],
  ['ป.2', '68', 'ภาษาอังกฤษ', 160],
  ['ป.2', '68', 'ภาษาอังกฤษ', 200],
  ['ป.2', '68', 'คณิตศาสตร์', 200],
  ['ป.2', '68', 'วิทยาศาสตร์และสิ่งแวดล้อม', 40],
  ['ป.2', '68', 'วิทยาศาสตร์และสิ่งแวดล้อม', 80],
  ['ป.2', '68', 'สังคมและความเป็นพลเมือง', 40],
  ['ป.2', '68', 'สังคมและความเป็นพลเมือง', 80],
  ['ป.2', '68', 'ประวัติศาสตร์', 40],
  ['ป.2', '68', 'เศรษฐกิจและการเงิน', 40],
  ['ป.2', '68', 'เศรษฐกิจและการเงิน', 80],
  ['ป.2', '68', 'สุขภาพกายและจิต', 40],
  ['ป.2', '68', 'สุขภาพกายและจิต', 80],
  ['ป.2', '68', 'ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', 40],
  ['ป.2', '68', 'ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', 80],
  ['ป.2', '68', 'การใช้เทคโนโลยีอย่างฉลาดรู้', 40],
  ['ป.2', '68', 'วิทยาการคำนวณ', 40],
  ['ป.2', '68', 'พลศึกษา', 40],
  ['ป.2', '68', 'การงานอาชีพ', 40],
  ['ป.2', '68', 'ดนตรี-นาฏศิลป์', 40],

  // ป.3 (68)
  ['ป.3', '68', 'ภาษาไทย', 160],
  ['ป.3', '68', 'ภาษาไทย', 200],
  ['ป.3', '68', 'ภาษาอังกฤษ', 160],
  ['ป.3', '68', 'ภาษาอังกฤษ', 200],
  ['ป.3', '68', 'คณิตศาสตร์', 200],
  ['ป.3', '68', 'วิทยาศาสตร์และสิ่งแวดล้อม', 40],
  ['ป.3', '68', 'วิทยาศาสตร์และสิ่งแวดล้อม', 80],
  ['ป.3', '68', 'สังคมและความเป็นพลเมือง', 40],
  ['ป.3', '68', 'สังคมและความเป็นพลเมือง', 80],
  ['ป.3', '68', 'ประวัติศาสตร์', 40],
  ['ป.3', '68', 'เศรษฐกิจและการเงิน', 40],
  ['ป.3', '68', 'เศรษฐกิจและการเงิน', 80],
  ['ป.3', '68', 'สุขภาพกายและจิต', 40],
  ['ป.3', '68', 'สุขภาพกายและจิต', 80],
  ['ป.3', '68', 'ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', 40],
  ['ป.3', '68', 'ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', 80],
  ['ป.3', '68', 'การใช้เทคโนโลยีอย่างฉลาดรู้', 40],
  ['ป.3', '68', 'วิทยาการคำนวณ', 40],
  ['ป.3', '68', 'พลศึกษา', 40],
  ['ป.3', '68', 'การงานอาชีพ', 40],
  ['ป.3', '68', 'ดนตรี-นาฏศิลป์', 40],

  // ป.4 (68)
  ['ป.4', '68', 'ภาษาไทย', 160],
  ['ป.4', '68', 'ภาษาไทย (บูรณาการ)', 40],
  ['ป.4', '68', 'ภาษาอังกฤษ', 80],
  ['ป.4', '68', 'ภาษาอังกฤษ (บูรณาการ)', 40],
  ['ป.4', '68', 'คณิตศาสตร์', 160],
  ['ป.4', '68', 'คณิตศาสตร์ (บูรณาการ)', 40],
  ['ป.4', '68', 'วิทยาศาสตร์และสิ่งแวดล้อม', 80],
  ['ป.4', '68', 'สังคมและความเป็นพลเมือง', 80],
  ['ป.4', '68', 'ประวัติศาสตร์', 40],
  ['ป.4', '68', 'เศรษฐกิจและการเงิน', 40],
  ['ป.4', '68', 'สุขภาพกายและสุขภาวะจิต', 80],
  ['ป.4', '68', 'ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', 40],
  ['ป.4', '68', 'การใช้เทคโนโลยีอย่างฉลาดรู้', 40],

  // ป.4 (51)
  ['ป.4', '51', 'ภาษาไทย (หลักภาษาและการใช้ภาษาไทย)', 80],
  ['ป.4', '51', 'ภาษาไทย (วรรณคดีและวรรณกรรม)', 80],
  ['ป.4', '51', 'ภาษาอังกฤษ Smile', 80],
  ['ป.4', '51', 'สังคมศึกษา ศาสนา และวัฒนธรรม', 80],
  ['ป.4', '51', 'คอมพิวเตอร์', 40],
  ['ป.4', '51', 'วิทยาการคำนวณ', 40],
  ['ป.4', '51', 'การงานอาชีพ', 40],

  // ป.5 (68)
  ['ป.5', '68', 'ภาษาไทย', 120],
  ['ป.5', '68', 'ภาษาไทย (บูรณาการ)', 40],
  ['ป.5', '68', 'ภาษาอังกฤษ', 60],
  ['ป.5', '68', 'ภาษาอังกฤษ (บูรณาการ)', 40],
  ['ป.5', '68', 'คณิตศาสตร์', 120],
  ['ป.5', '68', 'คณิตศาสตร์ (บูรณาการ)', 40],
  ['ป.5', '68', 'วิทยาศาสตร์และสิ่งแวดล้อม', 80],
  ['ป.5', '68', 'สังคมและความเป็นพลเมือง', 80],
  ['ป.5', '68', 'ประวัติศาสตร์', 40],
  ['ป.5', '68', 'เศรษฐกิจและการเงิน', 80],
  ['ป.5', '68', 'สุขภาพกายและสุขภาวะจิต', 80],
  ['ป.5', '68', 'ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', 80],
  ['ป.5', '68', 'การใช้เทคโนโลยีอย่างฉลาดรู้', 40],

  // ป.5 (51)
  ['ป.5', '51', 'ภาษาไทย (หลักภาษาและการใช้ภาษาไทย)', 80],
  ['ป.5', '51', 'ภาษาไทย (วรรณคดีและวรรณกรรม)', 80],
  ['ป.5', '51', 'ภาษาอังกฤษ Smile', 80],
  ['ป.5', '51', 'สังคมศึกษา ศาสนา และวัฒนธรรม', 80],
  ['ป.5', '51', 'คอมพิวเตอร์', 40],
  ['ป.5', '51', 'วิทยาการคำนวณ', 40],
  ['ป.5', '51', 'การงานอาชีพ', 40],

  // ป.6 (68)
  ['ป.6', '68', 'ภาษาไทย', 80],
  ['ป.6', '68', 'ภาษาไทย (บูรณาการ)', 40],
  ['ป.6', '68', 'ภาษาไทย (บูรณาการ)', 80],
  ['ป.6', '68', 'ภาษาอังกฤษ', 40],
  ['ป.6', '68', 'ภาษาอังกฤษ (บูรณาการ)', 40],
  ['ป.6', '68', 'ภาษาอังกฤษ (บูรณาการ)', 80],
  ['ป.6', '68', 'คณิตศาสตร์', 80],
  ['ป.6', '68', 'คณิตศาสตร์ (บูรณาการ)', 40],
  ['ป.6', '68', 'คณิตศาสตร์ (บูรณาการ)', 80],
  ['ป.6', '68', 'วิทยาศาสตร์และสิ่งแวดล้อม', 80],
  ['ป.6', '68', 'สังคมและความเป็นพลเมือง', 80],
  ['ป.6', '68', 'ประวัติศาสตร์', 40],
  ['ป.6', '68', 'เศรษฐกิจและการเงิน', 80],
  ['ป.6', '68', 'สุขภาพกายและสุขภาวะจิต', 80],
  ['ป.6', '68', 'ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', 80],
  ['ป.6', '68', 'การใช้เทคโนโลยีอย่างฉลาดรู้', 40],

  // ป.6 (51)
  ['ป.6', '51', 'ภาษาไทย (หลักภาษาและการใช้ภาษาไทย)', 80],
  ['ป.6', '51', 'ภาษาไทย (วรรณคดีและวรรณกรรม)', 80],
  ['ป.6', '51', 'ภาษาอังกฤษ Smile', 80],
  ['ป.6', '51', 'สังคมศึกษา ศาสนา และวัฒนธรรม', 80],
  ['ป.6', '51', 'คอมพิวเตอร์', 40],
  ['ป.6', '51', 'วิทยาการคำนวณ', 40],
  ['ป.6', '51', 'การงานอาชีพ', 40],

  // ===== บริการเสริม (Extra Services) =====
  ['-', '-', 'สมัครกลุ่ม VIP ป.1-3', 0],
  ['-', '-', 'สมัครกลุ่ม VIP ป.4-6', 0],

  // 🆕 v7.4: ระบบงาน Offline (ทุกระบบ 99 บาท)
  ['-', '-', 'ระบบรายงานผลการเรียน ป.1-3 (Offline)', 0],
  ['-', '-', 'ตาวิเศษ (Offline)', 0],
  ['-', '-', 'ระบบของหายได้คืน (Offline)', 0],
  ['-', '-', 'ระบบเช็คชื่อ (Offline)', 0],
  ['-', '-', 'ระบบตัดคะแนนความประพฤติ (Offline)', 0],
  ['-', '-', 'ระบบบันทึกข้อมูลการมาสาย (Offline)', 0]
];


// ============================================================
// 📥 รับ POST จากหน้าเว็บ
// ============================================================

function doPost(e) {
  try {
    var data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      throw new Error('No data received');
    }

    // ลูกค้าอัปโหลดสลิป (ไม่ต้องล็อกอิน)
    if (data.action === 'uploadSlip') {
      return handleUploadSlip(data);
    }

    // ลูกค้าดูสถานะออเดอร์ของตัวเอง (ไม่ต้องล็อกอิน)
    if (data.action === 'getOrderStatus') {
      return handlePublicGetOrderStatus(data);
    }

    // ลูกค้ายกเลิกออเดอร์ของตัวเอง (เฉพาะสถานะ "รอชำระเงิน")
    if (data.action === 'cancelOrder') {
      return handlePublicCancelOrder(data);
    }

    // ลูกค้าดูรายการ Example Links (ไม่ต้องล็อกอิน)
    if (data.action === 'getExampleLinks') {
      return handlePublicGetExampleLinks();
    }

    // คำสั่งจาก Admin Web App
    if (data.action) {
      return handleAdminAction(data);
    }

    // ไม่มี action = เป็นออเดอร์ใหม่จากหน้าเว็บลูกค้า (เดิม)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    saveOrderToSheet(ss, data);
    updateDashboard(ss);

    // 🆕 v7: ไม่ส่งเมลยืนยันสั่งซื้อให้ลูกค้าแล้ว (ประหยัดโควต้าเมล)
    // ลูกค้าเห็นรหัสออเดอร์ในหน้าเว็บ + บันทึกใน localStorage แล้ว
    // ถ้าต้องการเปิดอีก เปลี่ยน CONFIG.SEND_CUSTOMER_CONFIRMATION = true
    if (CONFIG.SEND_CUSTOMER_CONFIRMATION) {
      try { sendCustomerOrderConfirmation(data); }
      catch (err) { Logger.log('Customer email error: ' + err.toString()); }
    }

    // 🆕 v7: แจ้ง admin ผ่าน Telegram ทุกครั้งที่มีออเดอร์ใหม่ (ฟรี ไม่จำกัด)
    try {
      sendTelegramNotify(
        '🛒 <b>ออเดอร์ใหม่!</b>\n' +
        'รหัส: <code>' + data.orderId + '</code>\n' +
        'ลูกค้า: ' + (data.customerFb || '-') + '\n' +
        'จำนวน: ' + data.itemCount + ' รายการ\n' +
        'ยอด: <b>฿' + (Number(data.netTotal) || 0).toLocaleString() + '</b>'
      );
    } catch (err) {
      Logger.log('Telegram notify error: ' + err.toString());
    }

    return jsonResponse({ success: true, orderId: data.orderId });
  } catch (err) {
    Logger.log('Error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}


/**
 * 🆕 ลูกค้าดูสถานะออเดอร์ของตัวเอง (ไม่ต้องล็อกอิน)
 * รับ orderIds (array) → return สถานะของแต่ละ order
 */
function handlePublicGetOrderStatus(data) {
  try {
    const orderIds = data.orderIds || [];
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return jsonResponse({ success: false, error: 'orderIds required' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) {
      return jsonResponse({ success: true, orders: {} });
    }

    const lastRow = sheet.getLastRow();
    const allData = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
    const orderMap = {};

    // index ทุก row โดย orderId
    for (var i = 0; i < allData.length; i++) {
      const r = allData[i];
      const oid = String(r[COL.ORDER_ID - 1] || '').trim();
      if (!oid) continue;
      if (orderIds.indexOf(oid) === -1) continue;

      orderMap[oid] = {
        status: r[COL.STATUS - 1] || '',
        netTotal: r[COL.NET_TOTAL - 1] || 0,
        slipUrl: r[COL.SLIP_LINK - 1] || '',
        timestamp: r[0] || ''
      };
    }

    return jsonResponse({ success: true, orders: orderMap });
  } catch (err) {
    Logger.log('getOrderStatus error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}


/**
 * 🆕 ลูกค้ายกเลิกออเดอร์ของตัวเอง
 * อนุญาตเฉพาะสถานะ "รอชำระเงิน" เท่านั้น
 */
function handlePublicCancelOrder(data) {
  try {
    const orderId = String(data.orderId || '').trim();
    if (!orderId) {
      return jsonResponse({ success: false, error: 'orderId required' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) {
      return jsonResponse({ success: false, error: 'order not found' });
    }

    const orderIds = sheet.getRange(2, COL.ORDER_ID, sheet.getLastRow() - 1, 1).getValues();
    var targetRow = -1;
    for (var i = 0; i < orderIds.length; i++) {
      if (String(orderIds[i][0]).trim() === orderId) {
        targetRow = i + 2;
        break;
      }
    }
    if (targetRow === -1) {
      return jsonResponse({ success: false, error: 'order not found: ' + orderId });
    }

    // ตรวจสถานะ - อนุญาตยกเลิกเฉพาะ "รอชำระเงิน"
    const currentStatus = String(sheet.getRange(targetRow, COL.STATUS).getValue() || '').trim();
    if (currentStatus !== STATUSES.PENDING) {
      return jsonResponse({
        success: false,
        error: 'ไม่สามารถยกเลิกได้ — สถานะปัจจุบัน: ' + currentStatus
      });
    }

    // ยกเลิก
    sheet.getRange(targetRow, COL.STATUS).setValue('ยกเลิก');
    applyStatusColor(sheet, targetRow, 'ยกเลิก');
    sheet.getRange(targetRow, COL.NOTE).setValue(
      'ลูกค้ายกเลิกเองเมื่อ ' +
      Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm')
    );
    updateDashboard(ss);

    return jsonResponse({ success: true, message: 'ยกเลิกคำสั่งซื้อเรียบร้อยแล้ว' });
  } catch (err) {
    Logger.log('cancelOrder error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}


/**
 * 🆕 ลูกค้าอัปโหลดสลิป - เก็บไฟล์ใน Drive folder + อัปเดตลิงก์ใน Sheet
 */
function handleUploadSlip(data) {
  try {
    const orderId = String(data.orderId || '').trim();
    const slipBase64 = String(data.slipBase64 || '');
    const mimeType = String(data.mimeType || 'image/jpeg');
    const fileName = String(data.fileName || 'slip.jpg');

    if (!orderId || !slipBase64) {
      return jsonResponse({ success: false, error: 'missing orderId or slip' });
    }

    // หาออเดอร์ใน Sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) {
      return jsonResponse({ success: false, error: 'order not found' });
    }

    const orderIds = sheet.getRange(2, COL.ORDER_ID, sheet.getLastRow() - 1, 1).getValues();
    var targetRow = -1;
    for (var i = 0; i < orderIds.length; i++) {
      if (String(orderIds[i][0]).trim() === orderId) {
        targetRow = i + 2;
        break;
      }
    }
    if (targetRow === -1) {
      return jsonResponse({ success: false, error: 'order not found: ' + orderId });
    }

    // หา/สร้าง folder "KruPromSorn_Slips"
    const folder = getOrCreateSlipsFolder();

    // แปลง base64 → blob → Drive file
    const base64Data = slipBase64.replace(/^data:[^;]+;base64,/, '');
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);

    // ตั้งชื่อไฟล์: orderId_timestamp.jpg
    const ts = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd_HHmmss');
    const ext = mimeType.includes('png') ? '.png' : '.jpg';
    blob.setName(orderId + '_' + ts + ext);

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const slipUrl = file.getUrl();

    // อัปเดต Sheet — ใส่ลิงก์สลิป + เปลี่ยนสถานะเป็น "ชำระเงินแล้ว"
    sheet.getRange(targetRow, COL.SLIP_LINK).setValue(slipUrl);
    sheet.getRange(targetRow, COL.STATUS).setValue(STATUSES.PAID);
    applyStatusColor(sheet, targetRow, STATUSES.PAID);

    // 🆕 v7: แจ้งเตือนแอดมินผ่าน Telegram (ฟรีไม่จำกัด)
    try {
      const orderData = sheet.getRange(targetRow, 1, 1, 14).getValues()[0];
      sendTelegramNotify(
        '💵 <b>ลูกค้าโอนเงินแล้ว!</b>\n' +
        'รหัส: <code>' + orderData[COL.ORDER_ID - 1] + '</code>\n' +
        'ลูกค้า: ' + (orderData[COL.CUSTOMER_FB - 1] || '-') + '\n' +
        'ยอด: <b>฿' + (Number(orderData[COL.NET_TOTAL - 1]) || 0).toLocaleString() + '</b>\n' +
        '🔗 <a href="' + slipUrl + '">ดูสลิป</a>'
      );

      // ส่งเมลด้วยถ้าเปิดไว้ (ปิดเป็น default v7)
      if (CONFIG.SEND_SLIP_EMAIL) {
        sendSlipUploadedNotification(orderData, slipUrl);
      }
    } catch (e) {
      Logger.log('Slip notification failed: ' + e.toString());
    }

    updateDashboard(ss);

    return jsonResponse({
      success: true,
      message: 'อัปโหลดสลิปสำเร็จ! ทีมงานจะตรวจสอบและส่งแผนให้ภายใน 10 นาทีค่ะ',
      slipUrl: slipUrl
    });
  } catch (err) {
    Logger.log('uploadSlip error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}


/**
 * หา / สร้าง Drive folder สำหรับเก็บสลิป
 */
function getOrCreateSlipsFolder() {
  const folders = DriveApp.getFoldersByName(SLIPS_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(SLIPS_FOLDER_NAME);
}


/**
 * 🆕 ส่งเมลยืนยันการสั่งซื้อให้ลูกค้า (พร้อมลิงก์อัปโหลดสลิป)
 * เรียกตอนลูกค้ากดยืนยันสั่งซื้อ
 */
function sendCustomerOrderConfirmation(data) {
  const customerEmail = String(data.customerEmail || '').trim();
  if (!customerEmail || !customerEmail.includes('@')) {
    Logger.log('No valid customer email - skip confirmation');
    return;
  }

  try { if (MailApp.getRemainingDailyQuota() <= 0) return; } catch (e) { return; }

  const orderId = data.orderId;
  // ลองอ่าน items จาก rawItems (JSON array) ก่อน → ถ้าไม่มี ใช้ข้อความจาก items
  var items = [];
  if (data.rawItems) {
    try {
      const parsed = typeof data.rawItems === 'string' ? JSON.parse(data.rawItems) : data.rawItems;
      if (Array.isArray(parsed)) items = parsed;
    } catch (e) {
      Logger.log('Cannot parse rawItems: ' + e);
    }
  }
  if (items.length === 0 && Array.isArray(data.items)) {
    items = data.items;
  }
  const subtotal = Number(data.subtotal) || 0;
  const discountPercent = Number(data.discountPercent) || 0;
  const discountValue = Number(data.discountPercentValue) || 0;
  const netTotal = Number(data.netTotal) || 0;
  const customerFb = String(data.customerFb || '');

  // สร้าง URL สำหรับอัปสลิป (ลูกค้ากดแล้วเปิดหน้าเว็บพร้อม orderId)
  const uploadSlipUrl = CUSTOMER_SITE_URL +
    (CUSTOMER_SITE_URL.indexOf('?') === -1 ? '?' : '&') +
    'order=' + encodeURIComponent(orderId);

  const subject = '✅ ยืนยันคำสั่งซื้อ #' + orderId + ' - ' + PAGE_NAME;

  // สร้าง HTML รายการสินค้า
  const itemsHtml = items.map(item => {
    const subjectName = String(item.subject || '');
    const grade = String(item.grade || '');
    // ลองตีความหลักสูตรจาก grade (เช่น "p4_68" → "68") หรือใช้ field ตรงๆ
    var curriculum = String(item.curriculum || '');
    if (!curriculum && grade.indexOf('_') !== -1) {
      curriculum = grade.split('_')[1] || '';
    }
    const hours = item.hours || '';
    const planCount = item.planCount || '';
    const price = Number(item.price) || 0;
    // ถ้า id มี vip- หรือ report- = isExtra
    const isExtra = !!item.isExtra ||
                    String(item.id || '').indexOf('vip-') === 0 ||
                    String(item.id || '').indexOf('report-') === 0 ||
                    String(grade).toUpperCase() === 'VIP';

    const meta = [];
    if (curriculum && curriculum !== '-') meta.push('หลักสูตร ' + curriculum);
    if (hours && Number(hours) > 0) meta.push(hours + ' ชม.');
    if (planCount) meta.push(planCount + ' แผน');

    // ทำ display name - ถ้า grade มี p4_68 → แสดง "ป.4"
    var displayGrade = grade;
    if (grade.indexOf('p') === 0 && grade.indexOf('_') !== -1) {
      const num = grade.match(/p(\d)/);
      if (num) displayGrade = 'ป.' + num[1];
    }

    const displayName = isExtra ? subjectName :
      subjectName + (displayGrade && displayGrade !== '-' && displayGrade.toUpperCase() !== 'VIP' ? ' ' + displayGrade : '');

    return '' +
      '<tr>' +
      '<td style="padding:12px 14px; border-bottom:1px solid #f0e9ff;">' +
        '<div style="font-weight:600; color:#1f2937; margin-bottom:2px;">' + escapeHtml(displayName) + '</div>' +
        (meta.length > 0 ? '<div style="font-size:12px; color:#6b7280;">' + escapeHtml(meta.join(' • ')) + '</div>' : '') +
      '</td>' +
      '<td style="padding:12px 14px; border-bottom:1px solid #f0e9ff; text-align:right; font-weight:600; color:#5b21b6; white-space:nowrap;">' +
        '฿' + price.toLocaleString() +
      '</td>' +
      '</tr>';
  }).join('');

  // ถ้าไม่มี items array → fallback ใช้ data.items (text)
  var finalItemsHtml = itemsHtml;
  if (!itemsHtml && data.items) {
    const itemsText = String(data.items).split('\n').filter(s => s.trim()).map(line =>
      '<tr><td colspan="2" style="padding:10px 14px; border-bottom:1px solid #f0e9ff; color:#1f2937;">' +
      escapeHtml(line) + '</td></tr>'
    ).join('');
    finalItemsHtml = itemsText;
  }

  const html =
'<!DOCTYPE html>' +
'<html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
'<body style="margin:0; padding:0; font-family:\'Helvetica Neue\',Arial,sans-serif; background:#f5f3ff;">' +

'<div style="max-width:600px; margin:0 auto; background:white;">' +

// Header
'<div style="background:linear-gradient(135deg,#818cf8 0%,#a78bfa 50%,#f0abfc 100%); padding:32px 24px; text-align:center; color:white;">' +
'<div style="font-size:32px; margin-bottom:8px;">🎓</div>' +
'<div style="font-size:22px; font-weight:700; margin-bottom:4px;">' + PAGE_NAME + '</div>' +
'<div style="font-size:14px; opacity:0.95;">ยืนยันคำสั่งซื้อสำเร็จ</div>' +
'</div>' +

// Body
'<div style="padding:28px 24px;">' +

'<div style="font-size:16px; color:#1f2937; margin-bottom:8px;">สวัสดีค่ะ คุณ ' + escapeHtml(customerFb) + ' 👋</div>' +
'<div style="font-size:14px; color:#4b5563; line-height:1.7; margin-bottom:24px;">ขอบคุณที่สั่งซื้อแผนการสอนกับ <strong>' + PAGE_NAME + '</strong> ค่ะ — ระบบได้รับคำสั่งซื้อของคุณเรียบร้อยแล้ว 🎉</div>' +

// Order ID Card
'<div style="background:linear-gradient(135deg,#f5f3ff,#fdf4ff); border-radius:12px; padding:18px; margin-bottom:24px; border-left:4px solid #a78bfa;">' +
'<div style="font-size:12px; color:#6b7280; margin-bottom:4px;">หมายเลขคำสั่งซื้อ</div>' +
'<div style="font-size:18px; font-weight:700; color:#5b21b6; letter-spacing:1px;">' + escapeHtml(orderId) + '</div>' +
'</div>' +

// Items Table
'<div style="font-size:15px; font-weight:700; color:#1f2937; margin-bottom:12px;">📋 รายการที่สั่งซื้อ</div>' +
'<table style="width:100%; border-collapse:collapse; background:white; border:1px solid #f0e9ff; border-radius:10px; overflow:hidden; margin-bottom:20px;">' +
finalItemsHtml +
'</table>' +

// Price Summary
'<div style="background:#fafafa; border-radius:10px; padding:16px; margin-bottom:24px;">' +
'<div style="display:flex; justify-content:space-between; padding:6px 0; font-size:14px; color:#4b5563;">' +
'<span>ราคารวม</span><span>' + subtotal.toLocaleString() + ' บาท</span>' +
'</div>' +
(discountValue > 0 ?
'<div style="display:flex; justify-content:space-between; padding:6px 0; font-size:14px; color:#10b981;">' +
'<span>ส่วนลด ' + discountPercent + '%</span><span>- ' + discountValue.toLocaleString() + ' บาท</span>' +
'</div>' : '') +
'<div style="border-top:2px dashed #d1d5db; margin-top:8px; padding-top:12px;">' +
'<div style="display:flex; justify-content:space-between; align-items:center;">' +
'<span style="font-size:15px; font-weight:600; color:#1f2937;">ยอดสุทธิ</span>' +
'<span style="font-size:24px; font-weight:800; color:#5b21b6;">฿' + netTotal.toLocaleString() + '</span>' +
'</div></div></div>' +

// Payment Instructions
'<div style="background:#fef3c7; border-radius:10px; padding:18px; margin-bottom:20px; border-left:4px solid #f59e0b;">' +
'<div style="font-size:15px; font-weight:700; color:#92400e; margin-bottom:8px;">💰 ขั้นตอนถัดไป: ชำระเงิน</div>' +
'<div style="font-size:13px; color:#78350f; line-height:1.7;">' +
'1. โอนเงิน <strong>' + netTotal.toLocaleString() + ' บาท</strong> ผ่าน QR Code ในหน้าเว็บ<br>' +
'2. กดปุ่มด้านล่าง <strong>"📷 อัปโหลดสลิป"</strong> เพื่อยืนยันการชำระเงิน<br>' +
'3. ทีมงานจะส่งแผนการสอนให้ทางอีเมลนี้ <strong>ภายใน 10 นาที</strong> หลังตรวจสลิป' +
'</div></div>' +

// Big CTA Button
'<div style="text-align:center; margin:28px 0;">' +
'<a href="' + escapeHtml(uploadSlipUrl) + '" style="display:inline-block; background:linear-gradient(135deg,#818cf8,#a78bfa); color:white; padding:16px 36px; border-radius:12px; text-decoration:none; font-size:16px; font-weight:700; box-shadow:0 4px 14px rgba(129,140,248,0.4);">' +
'📷 อัปโหลดสลิปการโอนเงิน' +
'</a>' +
'<div style="font-size:12px; color:#9ca3af; margin-top:10px;">' +
'หรือคัดลอกลิงก์: <a href="' + escapeHtml(uploadSlipUrl) + '" style="color:#a78bfa; word-break:break-all;">' + escapeHtml(uploadSlipUrl) + '</a>' +
'</div>' +
'</div>' +

// Important Note
'<div style="background:#dcfce7; border-radius:8px; padding:14px; margin-bottom:20px; border-left:4px solid #16a34a;">' +
'<div style="font-size:13px; color:#14532d; line-height:1.7;">' +
'✨ <strong>สำคัญ:</strong> กรุณาอัปโหลดสลิปผ่านลิงก์ด้านบนเท่านั้น<br>' +
'🚫 <strong>ไม่ต้องส่งสลิปผ่าน Messenger</strong> — ระบบจะตรวจและส่งแผนให้อัตโนมัติ' +
'</div></div>' +

// Footer
'<div style="border-top:1px solid #e5e7eb; padding-top:20px; margin-top:24px; text-align:center; color:#9ca3af; font-size:12px;">' +
'มีคำถาม? ติดต่อเราผ่าน <a href="https://www.facebook.com/KruPromSorn/" style="color:#a78bfa; text-decoration:none;">Facebook: ' + PAGE_NAME + '</a><br>' +
'อีเมลนี้ส่งโดยอัตโนมัติ — กรุณาอย่าตอบกลับ<br><br>' +
'© ' + PAGE_NAME + '™' +
'</div>' +

'</div>' + // body padding
'</div>' + // container

'</body></html>';

  try {
    MailApp.sendEmail({
      to: customerEmail,
      subject: subject,
      htmlBody: html,
      name: PAGE_NAME
    });
    Logger.log('✅ Customer confirmation sent to: ' + customerEmail);
  } catch (err) {
    Logger.log('❌ Failed to send customer confirmation: ' + err.toString());
  }
}


/**
 * แจ้งแอดมินเมื่อมีลูกค้าอัปสลิป
 */
function sendSlipUploadedNotification(orderData, slipUrl) {
  if (!NOTIFY_EMAIL || NOTIFY_EMAIL === 'your-email@gmail.com') return;
  try { if (MailApp.getRemainingDailyQuota() <= 0) return; } catch (e) { return; }

  const orderId = orderData[COL.ORDER_ID - 1];
  const customerFb = orderData[COL.CUSTOMER_FB - 1];
  const customerEmail = orderData[COL.CUSTOMER_EMAIL - 1];
  const netTotal = orderData[COL.NET_TOTAL - 1];

  const subject = '💳 ลูกค้าส่งสลิปแล้ว #' + orderId + ' - ' + formatCurrency(netTotal) + ' บาท';

  const html =
'<!DOCTYPE html><html><body style="font-family: Sarabun, Arial, sans-serif; background:#f9fafb; padding:20px;">' +
'<div style="max-width:580px; margin:0 auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.08);">' +
'<div style="background:linear-gradient(135deg,#60a5fa,#3b82f6); padding:24px; color:white; text-align:center;">' +
'<div style="font-size:32px; margin-bottom:6px;">💳</div>' +
'<h1 style="margin:0; font-size:20px;">ลูกค้าส่งสลิปแล้ว</h1>' +
'<p style="margin:8px 0 0; opacity:0.9; font-size:13px;">' + escapeHtml(PAGE_NAME) + '™ — รอตรวจสอบ</p>' +
'</div>' +
'<div style="padding:24px;">' +
'<table style="width:100%; font-size:14px;">' +
'<tr><td style="padding:6px 0; color:#6b7280; width:120px;">รหัสคำสั่งซื้อ:</td><td style="font-weight:600; color:#5b21b6;">#' + escapeHtml(orderId) + '</td></tr>' +
'<tr><td style="padding:6px 0; color:#6b7280;">📘 Facebook:</td><td>' + escapeHtml(customerFb) + '</td></tr>' +
'<tr><td style="padding:6px 0; color:#6b7280;">📧 Gmail:</td><td>' + escapeHtml(customerEmail) + '</td></tr>' +
'<tr><td style="padding:6px 0; color:#6b7280;">ยอดสุทธิ:</td><td style="font-weight:bold; font-size:16px; color:#15803d;">' + formatCurrency(netTotal) + ' บาท</td></tr>' +
'</table>' +
'<div style="margin-top:20px; text-align:center;">' +
'<a href="' + escapeHtml(slipUrl) + '" style="display:inline-block; background:linear-gradient(135deg,#818cf8,#a78bfa); color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">📷 ดูสลิปการโอน</a>' +
'</div>' +
'<div style="margin-top:18px; background:#fef9c3; border:1px solid #fde68a; border-radius:8px; padding:12px; font-size:13px; color:#854d0e;">' +
'⏰ <strong>ขั้นตอนถัดไป:</strong> ตรวจสลิป → เปิด Admin Web App → กด "✅ ส่งแผนทันที"' +
'</div>' +
'</div>' +
'<div style="background:#f9fafb; padding:14px; text-align:center; font-size:12px; color:#9ca3af;">© ' + escapeHtml(PAGE_NAME) + '™</div>' +
'</div></body></html>';

  MailApp.sendEmail({
    to: NOTIFY_EMAIL, subject: subject, htmlBody: html,
    name: PAGE_NAME + '™ - แจ้งเตือน'
  });
}


function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// 🔐 Admin Web App - API Endpoints
// ============================================================

// ⚠️ แก้ user/password ตรงนี้! (ห้ามใช้ค่า default)
// role: 'owner' = เจ้าของ (เห็นทั้งหมด), 'staff' = พนักงาน (เห็นเฉพาะ tab รอ/ชำระ/ส่งวันนี้)
const ADMIN_USERS = [
  { username: 'yui', password: '12123', role: 'owner' },
  { username: 'pinky', password: '270766yp', role: 'staff' }
];

// อายุ session 7 วัน
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;


/**
 * Wrapper สำหรับให้ HTML เรียกผ่าน google.script.run
 * Return เป็น string (parse เป็น JSON ทั้ง 2 ฝั่ง)
 */
function handleAdminActionFromHtml(data) {
  const response = handleAdminAction(data);
  return response.getContent(); // ดึง JSON string จาก ContentService output
}


/**
 * จัดการคำสั่งจาก Admin Web App
 */
function handleAdminAction(data) {
  const action = data.action;

  // login ไม่ต้องตรวจ token
  if (action === 'login') {
    return handleLogin(data);
  }

  // action อื่นๆ ต้องมี token ที่ valid
  const sessionUser = validateToken(data.token);
  if (!sessionUser) {
    return jsonResponse({ success: false, error: 'unauthorized', message: 'กรุณาล็อกอินใหม่' });
  }

  switch (action) {
    case 'listOrders':       return handleListOrders(data, sessionUser);
    case 'getOrderDetail':   return handleGetOrderDetail(data);
    case 'getDriveLinks':    return handleGetDriveLinksAPI();
    case 'updateStatus':     return handleUpdateStatus(data, sessionUser);
    case 'approveOrder':     return handleApproveOrder(data, sessionUser);
    // 🆕 v7.5
    case 'listCustomers':    return handleListCustomers(data);
    case 'getCustomerHistory': return handleGetCustomerHistory(data);
    case 'getTopSubjectsToday': return handleGetTopSubjectsToday(data);
    default:
      return jsonResponse({ success: false, error: 'unknown action: ' + action });
  }
}

// ============================================================
// 🆕 v7.5: Customer & Top Subjects API
// ============================================================

/**
 * รายชื่อลูกค้าทั้งหมด (เรียง A-Z, ก-ฮ) พร้อมจำนวนออเดอร์และยอดรวม
 */
function handleListCustomers(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ success: true, customers: [] });
  }

  const lastRow = sheet.getLastRow();
  const data2D = sheet.getRange(2, 1, lastRow - 1, COL_COUNT).getValues();

  // จัดกลุ่มตาม customer (ใช้ชื่อ FB เป็น key)
  const map = {};
  data2D.forEach(row => {
    const fb = String(row[COL.CUSTOMER_FB - 1] || '').trim();
    if (!fb) return;
    const email = String(row[COL.CUSTOMER_EMAIL - 1] || '').trim();
    const status = String(row[COL.STATUS - 1] || '').trim();
    if (status === STATUSES.CANCELLED) return;  // ข้ามที่ยกเลิก

    if (!map[fb]) {
      map[fb] = {
        name: fb,
        email: email,
        orderCount: 0,
        totalAmount: 0,
        lastOrderTimestamp: ''
      };
    }
    map[fb].orderCount++;
    map[fb].totalAmount += Number(row[COL.NET_TOTAL - 1]) || 0;
    const ts = String(row[COL.TIMESTAMP - 1] || '');
    if (ts > map[fb].lastOrderTimestamp) {
      map[fb].lastOrderTimestamp = ts;
    }
  });

  // แปลงเป็น array + เรียง: ภาษาอังกฤษก่อน (A-Z) แล้วค่อยภาษาไทย (ก-ฮ)
  const customers = Object.values(map).sort((a, b) => {
    const aIsThai = /^[\u0E00-\u0E7F]/.test(a.name);
    const bIsThai = /^[\u0E00-\u0E7F]/.test(b.name);
    if (aIsThai && !bIsThai) return 1;   // ไทยอยู่หลัง
    if (!aIsThai && bIsThai) return -1;  // อังกฤษอยู่หน้า
    return a.name.localeCompare(b.name, aIsThai ? 'th' : 'en');
  });

  return jsonResponse({ success: true, customers: customers });
}

/**
 * ประวัติคำสั่งซื้อของลูกค้าคนเดียว (เรียงล่าสุดก่อน)
 */
function handleGetCustomerHistory(data) {
  const customerName = String(data.customerName || '').trim();
  if (!customerName) {
    return jsonResponse({ success: false, error: 'missing customerName' });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ success: true, history: [], summary: { totalOrders: 0, totalAmount: 0 } });
  }

  const lastRow = sheet.getLastRow();
  const data2D = sheet.getRange(2, 1, lastRow - 1, COL_COUNT).getValues();

  const history = [];
  var totalAmount = 0;

  data2D.forEach(row => {
    const fb = String(row[COL.CUSTOMER_FB - 1] || '').trim();
    if (fb !== customerName) return;

    const status = String(row[COL.STATUS - 1] || '').trim();
    const amount = Number(row[COL.NET_TOTAL - 1]) || 0;
    if (status !== STATUSES.CANCELLED) totalAmount += amount;

    history.push({
      timestamp: String(row[COL.TIMESTAMP - 1] || ''),
      orderId: String(row[COL.ORDER_ID - 1] || ''),
      email: String(row[COL.CUSTOMER_EMAIL - 1] || ''),
      itemCount: Number(row[COL.ITEM_COUNT - 1]) || 0,
      items: String(row[COL.ITEMS - 1] || ''),
      subtotal: Number(row[COL.SUBTOTAL - 1]) || 0,
      discount: (Number(row[COL.DISCOUNT_PERCENT_VALUE - 1]) || 0) + (Number(row[COL.DISCOUNT_BAHT - 1]) || 0),
      netTotal: amount,
      status: status
    });
  });

  // เรียงล่าสุดก่อน (timestamp ใน sheet เป็น string "dd/MM/yyyy HH:mm:ss" — เรียงแบบ string ก็ใช้ได้)
  history.sort((a, b) => parseThaiTimestamp(b.timestamp) - parseThaiTimestamp(a.timestamp));

  return jsonResponse({
    success: true,
    history: history,
    summary: {
      totalOrders: history.filter(h => h.status !== STATUSES.CANCELLED).length,
      totalAmount: totalAmount,
      customerName: customerName
    }
  });
}

// แปลง "dd/MM/yyyy HH:mm:ss" → epoch ms
function parseThaiTimestamp(ts) {
  if (!ts) return 0;
  const m = String(ts).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2}):(\d{1,2}):(\d{1,2})?/);
  if (!m) return 0;
  return new Date(
    parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]),
    parseInt(m[4]), parseInt(m[5]), parseInt(m[6] || '0')
  ).getTime();
}

/**
 * Top 5 วิชาขายดีของวันนี้ (นับจาก orderที่ status ≠ ยกเลิก)
 */
function handleGetTopSubjectsToday(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ success: true, topSubjects: [] });
  }

  const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy');
  const lastRow = sheet.getLastRow();
  const data2D = sheet.getRange(2, 1, lastRow - 1, COL_COUNT).getValues();

  // นับ subject ทั่วทั้งวัน
  const subjectCounts = {};
  data2D.forEach(row => {
    const ts = String(row[COL.TIMESTAMP - 1] || '');
    if (ts.indexOf(today) !== 0) return;  // ไม่ใช่วันนี้
    const status = String(row[COL.STATUS - 1] || '').trim();
    if (status === STATUSES.CANCELLED) return;

    const items = String(row[COL.ITEMS - 1] || '');
    const parsed = parseOrderItems(items);
    parsed.forEach(item => {
      // ใช้ subject (ตัด " ป.X (XX)" ออก เพื่อรวมทุกชั้น/หลักสูตร)
      const baseSubject = item.subject;
      if (!subjectCounts[baseSubject]) {
        subjectCounts[baseSubject] = { name: baseSubject, count: 0, isExtra: item.isExtra };
      }
      subjectCounts[baseSubject].count++;
    });
  });

  // เรียงและเอา top 5
  const top = Object.values(subjectCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return jsonResponse({ success: true, topSubjects: top, date: today });
}


function handleLogin(data) {
  const username = String(data.username || '').trim();
  const password = String(data.password || '');

  const user = ADMIN_USERS.find(u =>
    u.username === username && u.password === password
  );

  if (!user) {
    return jsonResponse({ success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  // สร้าง token (encoded payload)
  const token = createToken(username);
  return jsonResponse({
    success: true,
    token: token,
    username: username,
    role: user.role || 'owner'  // 🆕 ส่ง role กลับให้ HTML
  });
}


function createToken(username) {
  const payload = {
    u: username,
    e: new Date().getTime() + SESSION_DURATION_MS
  };
  return Utilities.base64EncodeWebSafe(JSON.stringify(payload));
}


function validateToken(token) {
  if (!token) return null;
  try {
    const json = Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString();
    const payload = JSON.parse(json);
    if (!payload.u || !payload.e) return null;
    if (new Date().getTime() > payload.e) return null;
    const user = ADMIN_USERS.find(u => u.username === payload.u);
    if (!user) return null;
    // 🆕 คืน user object (มี role) แทนที่จะคืนแค่ username
    return { username: user.username, role: user.role || 'owner' };
  } catch (e) {
    return null;
  }
}


/**
 * GET รายการออเดอร์ทั้งหมด (เรียงล่าสุดก่อน)
 */
function handleListOrders(data, sessionUser) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ success: true, orders: [] });
  }

  const filter = data.filter || 'all'; // all, pending, paid, completed
  const lastRow = sheet.getLastRow();
  const rawData = sheet.getRange(2, 1, lastRow - 1, 13).getValues();

  // 🆕 ตรวจ role ของ user เพื่อกรองข้อมูล
  var userRole = 'owner';
  if (sessionUser && sessionUser.role) {
    userRole = sessionUser.role;
  }

  // 🆕 v7.1: ถ้าเป็น staff → completed orders ต้องเป็นของวันนี้เสมอ
  // (ไม่ว่า filter จะเป็น 'all', 'completed' หรืออะไรก็ตาม)
  // ใช้ "วันที่ส่งแผน" จาก NOTE column รูปแบบ: "ส่งโดย {user} เมื่อ dd/MM/yyyy HH:mm"
  var todayStr = null;
  if (userRole === 'staff') {
    todayStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy');
  }

  const orders = [];
  for (var i = 0; i < rawData.length; i++) {
    const r = rawData[i];
    if (!r[0] && !r[1]) continue;

    const status = String(r[COL.STATUS - 1] || '').trim();

    // กรองตาม filter
    if (filter === 'pending' && status !== STATUSES.PENDING) continue;
    if (filter === 'paid' && status !== STATUSES.PAID) continue;
    if (filter === 'approved' && status !== STATUSES.APPROVED) continue;
    if (filter === 'completed' && status !== STATUSES.COMPLETED) continue;

    // 🆕 staff: ถ้าเป็นออเดอร์ completed → ต้องส่งวันนี้เท่านั้น
    // เข้มงวด: ถ้าไม่มี NOTE บันทึกวันที่ส่ง → ไม่แสดง (ทั้งใน filter all และ completed)
    if (todayStr && status === STATUSES.COMPLETED) {
      const note = String(r[COL.NOTE - 1] || '');
      const completedDate = parseCompletedDateFromNote(note);
      if (!completedDate) continue;
      if (completedDate !== todayStr) continue;
    }

    orders.push({
      row: i + 2, // sheet row number
      timestamp: r[0],
      orderId: r[COL.ORDER_ID - 1],
      customerFb: r[COL.CUSTOMER_FB - 1],
      customerEmail: r[COL.CUSTOMER_EMAIL - 1],
      itemCount: r[COL.ITEM_COUNT - 1],
      netTotal: r[COL.NET_TOTAL - 1],
      status: status
    });
  }

  // เรียงล่าสุดก่อน
  orders.reverse();

  // 🆕 v7: คำนวณ mini stats จาก rawData ทั้งหมด (ไม่ขึ้นกับ filter)
  // เพื่อให้ Mini Dashboard ใน admin app แสดงได้ถูกต้อง
  const miniStats = calculateMiniStats(rawData);

  return jsonResponse({ success: true, orders: orders, miniStats: miniStats });
}


/**
 * 🆕 v7: คำนวณ stats สำหรับ Mini Dashboard (วันนี้ + เดือนนี้)
 * นับเฉพาะออเดอร์ที่ "ชำระแล้ว" ขึ้นไป (ไม่นับ pending/cancelled)
 */
function calculateMiniStats(rawData) {
  const tz = 'Asia/Bangkok';
  const now = new Date();
  const todayStr = Utilities.formatDate(now, tz, 'dd/MM/yyyy');
  const monthStr = Utilities.formatDate(now, tz, 'MM/yyyy');
  const validStatuses = [STATUSES.PAID, STATUSES.APPROVED, STATUSES.COMPLETED];

  var todayTotal = 0, todayCount = 0;
  var monthTotal = 0, monthCount = 0;

  for (var i = 0; i < rawData.length; i++) {
    const r = rawData[i];
    if (!r[0] && !r[1]) continue;
    const status = String(r[COL.STATUS - 1] || '').trim();
    if (validStatuses.indexOf(status) === -1) continue;

    const ts = r[0];
    var tsDate = '', tsMonth = '';
    if (ts instanceof Date) {
      tsDate = Utilities.formatDate(ts, tz, 'dd/MM/yyyy');
      tsMonth = Utilities.formatDate(ts, tz, 'MM/yyyy');
    } else if (typeof ts === 'string') {
      const parts = ts.split(' ')[0];
      tsDate = parts;
      if (parts.length >= 10) tsMonth = parts.substring(3);
    }

    const net = Number(r[COL.NET_TOTAL - 1]) || 0;
    if (tsDate === todayStr) { todayTotal += net; todayCount++; }
    if (tsMonth === monthStr) { monthTotal += net; monthCount++; }
  }

  return {
    todayTotal: todayTotal, todayCount: todayCount,
    monthTotal: monthTotal, monthCount: monthCount
  };
}


/**
 * 🆕 ดึงวันที่ส่งแผนจากข้อความใน NOTE
 * รูปแบบที่รองรับ: "ส่งโดย xxx เมื่อ dd/MM/yyyy HH:mm" หรือ "ส่งโดย xxx เมื่อ dd/MM/yyyy"
 * คืน "dd/MM/yyyy" ถ้าเจอ, null ถ้าไม่เจอ
 */
function parseCompletedDateFromNote(note) {
  if (!note) return null;
  // หา pattern dd/MM/yyyy
  const match = String(note).match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (!match) return null;
  // pad zero ให้รูปแบบเป็น dd/MM/yyyy เสมอ
  const parts = match[1].split('/');
  if (parts.length !== 3) return null;
  const dd = parts[0].padStart(2, '0');
  const mm = parts[1].padStart(2, '0');
  return dd + '/' + mm + '/' + parts[2];
}


/**
 * 🆕 ดึงเฉพาะส่วน dd/MM/yyyy จาก timestamp (อาจเป็น Date หรือ string)
 */
function formatOrderDateOnly(ts) {
  if (!ts) return '';
  if (ts instanceof Date) {
    return Utilities.formatDate(ts, 'Asia/Bangkok', 'dd/MM/yyyy');
  }
  // ถ้าเป็น string คาดว่ารูปแบบ "dd/MM/yyyy HH:mm:ss"
  const s = String(ts);
  const match = s.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (!match) return '';
  const parts = match[1].split('/');
  return parts[0].padStart(2, '0') + '/' + parts[1].padStart(2, '0') + '/' + parts[2];
}


/**
 * GET รายละเอียดออเดอร์ + รายการวิชา + ลิงก์ Drive
 */
function handleGetOrderDetail(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const row = parseInt(data.row);

  if (!row || row < 2 || row > sheet.getLastRow()) {
    return jsonResponse({ success: false, error: 'invalid row' });
  }

  // ดึง 15 คอลัมน์ (รวม emailPerItem)
  const r = sheet.getRange(row, 1, 1, COL_COUNT).getValues()[0];
  const items = r[COL.ITEMS - 1];
  const orderItems = parseOrderItems(items);
  const driveLinks = getDriveLinks();

  // 🆕 v7.2: parse emailPerItem JSON
  var emailPerItem = {};
  try {
    const json = String(r[COL.EMAIL_PER_ITEM - 1] || '');
    if (json) emailPerItem = JSON.parse(json);
  } catch (e) {
    Logger.log('Failed to parse emailPerItem: ' + e.toString());
  }
  const customerEmail = r[COL.CUSTOMER_EMAIL - 1];

  const subjectInfo = orderItems.map(function(item) {
    const key = item.grade + '|' + item.curriculum + '|' + item.subject + '|' + (item.hours || '');
    var link = driveLinks[key];

    // Fallback: Extra items ลอง match ด้วยชื่อ subject
    if (!link && item.isExtra) {
      const fallbackKeys = Object.keys(driveLinks);
      for (var fk = 0; fk < fallbackKeys.length; fk++) {
        if (fallbackKeys[fk].indexOf(item.subject) !== -1) {
          link = driveLinks[fallbackKeys[fk]];
          break;
        }
      }
    }

    // 🆕 v7.2: หาเมลปลายทางของวิชานี้
    const targetEmail = emailPerItem[key] || emailPerItem[item.subject] || customerEmail;

    return {
      grade: item.grade,
      curriculum: item.curriculum,
      subject: item.subject,
      hours: item.hours,
      isExtra: !!item.isExtra,
      planCount: link ? link.planCount : '',
      drive: link ? link.drive : '',
      message: link ? link.message : '',
      postNote: link ? link.postNote : '',
      hasLink: !!(link && link.drive),
      hasMessage: !!(link && link.message),
      targetEmail: targetEmail,  // 🆕 v7.2
      isCustomEmail: targetEmail !== customerEmail  // 🆕 บอกว่าเมลนี้ต่างจาก default
    };
  });

  // แปลง Drive URL → preview URL สำหรับใช้ embed (ถ้ามี)
  const slipUrl = String(r[COL.SLIP_LINK - 1] || '').trim();
  var slipPreviewUrl = '';
  if (slipUrl) {
    const m = slipUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) slipPreviewUrl = 'https://drive.google.com/uc?export=view&id=' + m[1];
  }

  return jsonResponse({
    success: true,
    order: {
      row: row,
      timestamp: r[0],
      orderId: r[COL.ORDER_ID - 1],
      customerFb: r[COL.CUSTOMER_FB - 1],
      customerEmail: r[COL.CUSTOMER_EMAIL - 1],
      itemCount: r[COL.ITEM_COUNT - 1],
      itemsText: items,
      subtotal: r[COL.SUBTOTAL - 1],
      discountPercent: r[COL.DISCOUNT_PERCENT - 1],
      discountPercentValue: r[COL.DISCOUNT_PERCENT_VALUE - 1],
      netTotal: r[COL.NET_TOTAL - 1],
      status: r[COL.STATUS - 1],
      note: r[COL.NOTE - 1],
      slipUrl: slipUrl,
      slipPreviewUrl: slipPreviewUrl,
      subjects: subjectInfo
    }
  });
}


function handleGetDriveLinksAPI() {
  return jsonResponse({ success: true, links: getDriveLinks() });
}


/**
 * อัปเดตสถานะอย่างเดียว (เช่น "ชำระเงินแล้ว", "ยกเลิก")
 */
function handleUpdateStatus(data, sessionUser) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const row = parseInt(data.row);
  const newStatus = String(data.status || '').trim();

  // รองรับทั้ง object {username, role} และ string (backward compat)
  const username = (sessionUser && sessionUser.username) ? sessionUser.username : String(sessionUser || 'unknown');

  if (!STATUS_COLORS[newStatus]) {
    return jsonResponse({ success: false, error: 'invalid status' });
  }

  sheet.getRange(row, COL.STATUS).setValue(newStatus);
  applyStatusValidation(sheet, row);
  applyStatusColor(sheet, row, newStatus);

  // 🆕 ถ้าเปลี่ยนเป็น "ส่งแผนเสร็จสิ้น" → บันทึกวันที่ส่งใน NOTE
  // เพื่อให้ระบบกรอง "ส่งวันนี้" (สำหรับ staff) ทำงานถูกต้อง
  if (newStatus === STATUSES.COMPLETED) {
    const existingNote = String(sheet.getRange(row, COL.NOTE).getValue() || '');
    // ถ้ายังไม่มี note หรือไม่มี pattern "ส่งโดย ... เมื่อ" → เพิ่มเข้าไป
    if (!/ส่งโดย.*เมื่อ\s*\d{1,2}\/\d{1,2}\/\d{4}/.test(existingNote)) {
      const stamp = 'ส่งโดย ' + username + ' เมื่อ ' +
        Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');
      const newNote = existingNote ? existingNote + ' | ' + stamp : stamp;
      sheet.getRange(row, COL.NOTE).setValue(newNote);
    }
  }

  updateDashboard(ss);

  Logger.log('Status updated by ' + username + ' for row ' + row + ' → ' + newStatus);
  return jsonResponse({ success: true, status: newStatus });
}


/**
 * อนุมัติส่งแผน - แชร์ Drive ทุกวิชา + ส่งเมล + อัปเดตสถานะ
 */
function handleApproveOrder(data, sessionUser) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const row = parseInt(data.row);
  const customerEmail = String(data.customerEmail || '').trim();
  const customerFb = String(data.customerFb || '').trim();
  const selectedSubjects = data.subjects || [];

  // รองรับทั้ง object {username, role} และ string (backward compat)
  const username = (sessionUser && sessionUser.username) ? sessionUser.username : String(sessionUser || 'unknown');

  if (!customerEmail || selectedSubjects.length === 0) {
    return jsonResponse({ success: false, error: 'missing data' });
  }

  // ใช้ฟังก์ชัน executeApproval เดิม
  const result = executeApproval(row, customerEmail, customerFb, selectedSubjects);

  // ✅ ถ้าแชร์ Drive สำเร็จ → เปลี่ยนสถานะเป็น "ส่งแผนเสร็จสิ้น"
  // แม้ว่าเมลจะส่งไม่ได้ (quota หมด / email ผิด) ก็ยังถือว่า "ส่งแผนเสร็จ"
  // เพราะลูกค้าเข้าถึง Drive ได้แล้ว — แจ้งทาง Facebook แทนได้
  if (result.shared.length > 0) {
    sheet.getRange(row, COL.STATUS).setValue(STATUSES.COMPLETED);
    applyStatusColor(sheet, row, STATUSES.COMPLETED);
    const notePrefix = result.emailSent ? 'ส่งโดย ' : 'ส่งโดย (เมลล้มเหลว) ';
    sheet.getRange(row, COL.NOTE).setValue(notePrefix + username + ' เมื่อ ' +
      Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'));
    updateDashboard(ss);
  }

  return jsonResponse({ success: true, result: result });
}


// ============================================================
// 🎯 Triggers
// ============================================================

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    if (e.range.getRow() === 1 && e.range.getLastRow() === 1) return;

    if (e.range.getColumn() === COL.STATUS) {
      handleStatusChange(sheet, e.range.getRow(), e.value, e.oldValue);
    }

    updateDashboard(SpreadsheetApp.getActiveSpreadsheet());
  } catch (err) {
    Logger.log('onEdit error: ' + err.toString());
  }
}

function onChange(e) {
  try {
    if (!e) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName(SHEET_NAME)) return;
    updateDashboard(ss);
  } catch (err) {
    Logger.log('onChange error: ' + err.toString());
  }
}


// ============================================================
// 🎬 Status Change Handler
// ============================================================

function handleStatusChange(sheet, row, newStatus, oldStatus) {
  Logger.log('=== Status Change ===');
  Logger.log('Row: ' + row + ' | Old: ' + oldStatus + ' → New: ' + newStatus);

  applyStatusColor(sheet, row, newStatus);
  if (newStatus === STATUSES.APPROVED && oldStatus !== STATUSES.APPROVED) {
    Logger.log('Triggering approval dialog for row ' + row);
    try {
      showApprovalDialog(sheet, row);
    } catch (err) {
      Logger.log('❌ showApprovalDialog ERROR: ' + err.toString());
      try {
        SpreadsheetApp.getUi().alert('❌ เกิดข้อผิดพลาด',
          'ไม่สามารถเปิด Popup อนุมัติได้:\n' + err.toString() +
          '\n\nลองใช้เมนู "🎓 ครูพร้อมสอน → 🔁 ส่งแผนแถวนี้อีกครั้ง" แทน',
          SpreadsheetApp.getUi().ButtonSet.OK);
      } catch (e2) { /* ignore */ }
    }
  }
}


/**
 * Parse รายการสินค้า - ดึงชั้น/วิชา/หลักสูตร/ชั่วโมง
 * Input: "1. ภาษาไทย ป.1 (ป.1 (68), 200 ชม.) - 350 บาท"
 * Output: {grade:'ป.1', subject:'ภาษาไทย', curriculum:'68', hours:200}
 */
function parseOrderItems(itemsText) {
  if (!itemsText) return [];
  const lines = String(itemsText).split('\n').filter(l => l.trim());
  const items = [];

  // 🆕 v7.4: รายการระบบงาน Offline (ทุกระบบ 99 บาท)
  // ตรวจชื่อระบบ → ถือเป็น Extra item (ไม่ต้องมี grade/curriculum/hours)
  const OFFLINE_SYSTEM_NAMES = [
    'ระบบรายงานผลการเรียน ป.1-3',
    'ตาวิเศษ',
    'ระบบของหายได้คืน',
    'ระบบเช็คชื่อ',
    'ระบบตัดคะแนนความประพฤติ',
    'ระบบบันทึกข้อมูลการมาสาย'
  ];

  lines.forEach(line => {
    const cleaned = line.replace(/^\s*\d+\.\s*/, '');

    // ตรวจ extra services ก่อน (ใช้ marker '-' เป็นชั้นสำหรับ matching ใน Drive Links)
    if (/สมัครกลุ่ม\s*VIP\s*ป\.1-3/.test(cleaned)) {
      items.push({ grade: '-', curriculum: '-', subject: 'สมัครกลุ่ม VIP ป.1-3', hours: 0, isExtra: true, original: cleaned });
      return;
    }
    if (/สมัครกลุ่ม\s*VIP\s*ป\.4-6/.test(cleaned)) {
      items.push({ grade: '-', curriculum: '-', subject: 'สมัครกลุ่ม VIP ป.4-6', hours: 0, isExtra: true, original: cleaned });
      return;
    }

    // 🆕 v7.4: ตรวจระบบงาน Offline (รองรับทั้งมี/ไม่มีคำว่า "(Offline)" ต่อท้าย)
    var matchedSystem = null;
    for (var si = 0; si < OFFLINE_SYSTEM_NAMES.length; si++) {
      if (cleaned.indexOf(OFFLINE_SYSTEM_NAMES[si]) !== -1) {
        matchedSystem = OFFLINE_SYSTEM_NAMES[si];
        break;
      }
    }
    if (matchedSystem) {
      // เก็บชื่อแบบมี "(Offline)" เพื่อให้ match กับ Drive Links sheet
      const fullName = cleaned.indexOf('(Offline)') !== -1
        ? matchedSystem + ' (Offline)'
        : matchedSystem;
      items.push({
        grade: '-', curriculum: '-',
        subject: fullName, hours: 0,
        isExtra: true, original: cleaned
      });
      return;
    }

    // ข้ามรายการบันทึกหลังแผน (เลิกขายแล้ว)
    if (/บันทึกหลังแผน|บันทึกหลังการสอน/.test(cleaned)) return;

    const gradeMatch = cleaned.match(/ป\.[1-6]/);
    if (!gradeMatch) return;
    const grade = gradeMatch[0];

    // ดึงหลักสูตรจาก "(68)" หรือ "(51)"
    const currMatch = cleaned.match(/\((\d{2})\)/);
    const curriculum = currMatch ? currMatch[1] : '68';

    const hoursMatch = cleaned.match(/(\d+)\s*ชม\./);
    const hours = hoursMatch ? parseInt(hoursMatch[1]) : null;

    const beforeGrade = cleaned.substring(0, cleaned.indexOf(grade)).trim();
    const subject = beforeGrade.replace(/^วิชา\s*/, '').trim();

    if (subject) {
      items.push({ grade, curriculum, subject, hours, isExtra: false, original: cleaned });
    }
  });

  return items;
}


/**
 * แสดง Dialog ยืนยันการอนุมัติ
 */
function showApprovalDialog(sheet, row) {
  const ui = SpreadsheetApp.getUi();
  // 🆕 v7.2: ดึง 15 columns เพื่อรวม emailPerItem
  const data = sheet.getRange(row, 1, 1, COL_COUNT).getValues()[0];

  const orderId = data[COL.ORDER_ID - 1];
  const customerFb = data[COL.CUSTOMER_FB - 1];
  const customerEmail = data[COL.CUSTOMER_EMAIL - 1];
  const items = data[COL.ITEMS - 1];

  // 🆕 v7.2: parse emailPerItem
  var emailPerItem = {};
  try {
    const json = String(data[COL.EMAIL_PER_ITEM - 1] || '');
    if (json) emailPerItem = JSON.parse(json);
  } catch (e) { Logger.log('parse emailPerItem error: ' + e); }

  const orderItems = parseOrderItems(items);

  if (orderItems.length === 0) {
    ui.alert('⚠️ ไม่พบรายการวิชา',
      'ไม่สามารถแยกวิชาจากรายการได้ กรุณาแชร์ Drive ด้วยตัวเอง',
      ui.ButtonSet.OK);
    return;
  }

  const driveLinks = getDriveLinks();

  const subjectInfo = orderItems.map(function(item) {
    const key = item.grade + '|' + item.curriculum + '|' + item.subject + '|' + (item.hours || '');
    var link = driveLinks[key];

    // Fallback: Extra items ลอง match ด้วยชื่อ subject
    if (!link && item.isExtra) {
      const fallbackKeys = Object.keys(driveLinks);
      for (var fk = 0; fk < fallbackKeys.length; fk++) {
        if (fallbackKeys[fk].indexOf(item.subject) !== -1) {
          link = driveLinks[fallbackKeys[fk]];
          break;
        }
      }
    }

    // 🆕 v7.2: หาเมลปลายทาง
    const targetEmail = emailPerItem[key] || emailPerItem[item.subject] || customerEmail;

    return {
      grade: item.grade,
      curriculum: item.curriculum,
      subject: item.subject,
      hours: item.hours,
      isExtra: !!item.isExtra,
      planCount: link ? link.planCount : '',
      drive: link ? link.drive : '',
      message: link ? link.message : '',
      postNote: link ? link.postNote : '',
      hasLink: link && link.drive ? true : false,
      hasMessage: link && link.message ? true : false,
      targetEmail: targetEmail,
      isCustomEmail: targetEmail !== customerEmail
    };
  });

  const html = buildApprovalHtml({
    orderId, customerFb, customerEmail, subjectInfo, row
  });

  const htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(680).setHeight(740);

  ui.showModalDialog(htmlOutput, '✅ อนุมัติส่งแผน - ' + orderId);
}


/**
 * ทำงานเมื่อกด "ยืนยัน" ใน Popup
 */
function executeApproval(rowNumber, customerEmail, customerFb, selectedSubjects) {
  Logger.log('=== executeApproval START ===');
  Logger.log('Row: ' + rowNumber + ' | Default Email: ' + customerEmail);
  Logger.log('Selected subjects: ' + selectedSubjects.length);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const driveLinks = getDriveLinks();

  // 🆕 v7.2: อ่าน emailPerItem จากคอลัมน์ 15
  var emailPerItem = {};
  try {
    const json = String(sheet.getRange(rowNumber, COL.EMAIL_PER_ITEM).getValue() || '');
    if (json) emailPerItem = JSON.parse(json);
  } catch (e) {
    Logger.log('Failed to parse emailPerItem: ' + e.toString());
  }
  Logger.log('emailPerItem keys: ' + Object.keys(emailPerItem).length);

  Logger.log('Drive links loaded: ' + Object.keys(driveLinks).length + ' rows');

  const results = { shared: [], failed: [], emailSent: false, emailGroups: 0 };

  selectedSubjects.forEach(function(s) {
    const key = s.grade + '|' + s.curriculum + '|' + s.subject + '|' + (s.hours || '');
    Logger.log('Processing: ' + key);

    var link = driveLinks[key];

    // Fallback: Extra items ลอง match ด้วยชื่อ subject
    if (!link && s.isExtra) {
      const fallbackKeys = Object.keys(driveLinks);
      for (var fk = 0; fk < fallbackKeys.length; fk++) {
        if (fallbackKeys[fk].indexOf(s.subject) !== -1) {
          link = driveLinks[fallbackKeys[fk]];
          Logger.log('🔄 Fallback match: "' + key + '" → "' + fallbackKeys[fk] + '"');
          break;
        }
      }
    }

    // 🆕 v7.2: หา email ปลายทางสำหรับวิชานี้
    // ลำดับ: emailPerItem[key] → emailPerItem[subjectName] → customerEmail (default)
    var targetEmail = emailPerItem[key] ||
                      emailPerItem[s.subject] ||
                      customerEmail;
    targetEmail = String(targetEmail).trim().toLowerCase();
    Logger.log('  → Target email: ' + targetEmail);

    // Extra (VIP / Report) - ไม่ต้องมีลิงก์ Drive ขอแค่มีข้อความ
    if (s.isExtra) {
      if (!link || !link.message) {
        Logger.log('  ❌ Extra item missing message: ' + key);
        results.failed.push({
          grade: s.grade, subject: s.subject, hours: s.hours,
          reason: 'ไม่มีข้อความสำหรับลูกค้าใน Sheet'
        });
        return;
      }

      Logger.log('  ✅ Extra item added: ' + s.subject + ' → ' + targetEmail);
      results.shared.push({
        grade: s.grade, curriculum: s.curriculum,
        subject: s.subject, hours: s.hours,
        planCount: link.planCount || '', link: link.drive || '',
        message: link.message, postNote: link.postNote || '',
        folderName: s.subject, isExtra: true,
        targetEmail: targetEmail  // 🆕
      });
      return;
    }

    // วิชาปกติ - ต้องมีลิงก์ Drive
    if (!link || !link.drive) {
      Logger.log('  ❌ No drive link for ' + key);
      results.failed.push({
        grade: s.grade, subject: s.subject, hours: s.hours,
        reason: 'ไม่มีลิงก์ Drive ใน Sheet'
      });
      return;
    }

    Logger.log('  Drive URL: ' + link.drive);

    try {
      const folderId = extractFolderId(link.drive);
      if (!folderId) {
        results.failed.push({
          grade: s.grade, subject: s.subject, hours: s.hours,
          reason: 'ลิงก์ Drive ไม่ถูกต้อง'
        });
        return;
      }

      const folder = DriveApp.getFolderById(folderId);
      // 🆕 v7.2: แชร์กับเมลของวิชานี้โดยเฉพาะ (ไม่ใช่ customerEmail เสมอ)
      folder.addViewer(targetEmail);
      Logger.log('  ✅ Shared with ' + targetEmail);

      results.shared.push({
        grade: s.grade, curriculum: s.curriculum,
        subject: s.subject, hours: s.hours,
        planCount: link.planCount, link: link.drive,
        message: link.message, postNote: link.postNote,
        folderName: folder.getName(), isExtra: false,
        targetEmail: targetEmail  // 🆕
      });
    } catch (err) {
      Logger.log('  ❌ Share error: ' + err.toString());
      results.failed.push({
        grade: s.grade, subject: s.subject, hours: s.hours,
        reason: err.toString().substring(0, 80)
      });
    }
  });

  Logger.log('Shared: ' + results.shared.length + ' | Failed: ' + results.failed.length);

  // 🆕 v7.2: ส่งเมล "กลุ่มตามเมล" — รวมวิชาที่ส่งไปเมลเดียวกัน
  if (results.shared.length > 0) {
    try {
      const quota = MailApp.getRemainingDailyQuota();
      Logger.log('Email quota remaining: ' + quota);
      if (quota <= 0) {
        results.emailError = 'Email quota หมด (รอพรุ่งนี้ลองใหม่)';
        Logger.log('❌ Email quota exhausted');
        return results;
      }

      // จัดกลุ่มวิชาตาม targetEmail
      const groups = {};
      results.shared.forEach(function(s) {
        const em = s.targetEmail || customerEmail;
        if (!groups[em]) groups[em] = [];
        groups[em].push(s);
      });

      const emailList = Object.keys(groups);
      Logger.log('Email groups: ' + emailList.length + ' (' + emailList.join(', ') + ')');

      // เช็คว่า quota พอไหม
      if (quota < emailList.length) {
        results.emailError = 'Email quota ไม่พอ (เหลือ ' + quota + ' ต้องส่ง ' + emailList.length + ')';
        Logger.log('❌ Quota insufficient');
        return results;
      }

      const orderData = sheet.getRange(rowNumber, 1, 1, 13).getValues()[0];
      var sentCount = 0;

      emailList.forEach(function(em) {
        try {
          sendCombinedApprovalEmail(orderData, em, customerFb, groups[em]);
          sentCount++;
          Logger.log('  ✅ Email sent to ' + em + ' (' + groups[em].length + ' วิชา)');
        } catch (e) {
          Logger.log('  ❌ Failed sending to ' + em + ': ' + e.toString());
        }
      });

      results.emailGroups = sentCount;
      results.emailSent = sentCount > 0;
      Logger.log('✅ Sent ' + sentCount + '/' + emailList.length + ' email groups');
    } catch (err) {
      Logger.log('❌ Email failed: ' + err.toString());
      results.emailError = err.toString();
    }
  } else {
    Logger.log('No shared folders, skipping email');
  }

  Logger.log('=== executeApproval END ===');
  return results;
}


/**
 * ส่งเมลรวม - ใช้ message template ของแต่ละวิชา + post note
 */
function sendCombinedApprovalEmail(orderData, customerEmail, customerFb, sharedSubjects) {
  const orderId = orderData[COL.ORDER_ID - 1];
  const subject = '✅ แผนการสอนของคุณพร้อมแล้ว - ' + PAGE_NAME + ' #' + orderId;

  // สร้างบล็อกแต่ละวิชาจาก template message + post note
  const subjectBlocks = sharedSubjects.map(s => {
    const messageHtml = renderMessageWithLink(s.message, s.link, s);
    const postNoteHtml = s.postNote ? renderTextHtml(s.postNote) : '';

    return '' +
'<div style="background:#fafafa; border-radius:10px; padding:18px 20px; margin-bottom:14px; border-left:4px solid #818cf8;">' +
'  <div style="font-size:14px; color:#1f2937; line-height:1.85;">' + messageHtml + '</div>' +
   (postNoteHtml ? '<div style="margin-top:14px; padding-top:14px; border-top:1px dashed #d1d5db; font-size:13px; color:#4b5563; line-height:1.75;">' + postNoteHtml + '</div>' : '') +
'</div>';
  }).join('');

  const html =
'<!DOCTYPE html>' +
'<html><body style="font-family: Sarabun, Arial, sans-serif; background:#f9fafb; padding:20px; margin:0;">' +
'  <div style="max-width:640px; margin:0 auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.08);">' +
'' +
'    <div style="background:linear-gradient(135deg,#818cf8,#a78bfa,#f0abfc); padding:28px 24px; color:white; text-align:center;">' +
'      <div style="font-size:36px; margin-bottom:6px;">✨</div>' +
'      <h1 style="margin:0; font-size:22px;">แอดมินได้รับยอดโอนเรียบร้อยแล้ว</h1>' +
'      <p style="margin:10px 0 0; opacity:0.95; font-size:14px;">🙏 ขอบคุณที่ใช้บริการเพจ' + escapeHtml(PAGE_NAME) + '</p>' +
'    </div>' +
'' +
'    <div style="padding:24px;">' +
'      <p style="font-size:15px; color:#1f2937; margin:0 0 14px;">สวัสดีค่ะ คุณ' + escapeHtml(customerFb) + ' 🌷</p>' +
'      <p style="font-size:14px; color:#4b5563; margin:0 0 18px; line-height:1.7;">' +
'        แอดมินได้แชร์ไฟล์แผนการสอนให้คุณเรียบร้อยแล้วผ่าน <strong>Gmail นี้ (' + escapeHtml(customerEmail) + ')</strong> ค่ะ' +
'      </p>' +
'' +
'      <div style="background:#f8f7ff; border-radius:10px; padding:14px; margin-bottom:24px; border:1px solid #e9d5ff;">' +
'        <div style="font-size:12px; color:#6b7280;">รหัสคำสั่งซื้อ</div>' +
'        <div style="font-size:18px; font-weight:bold; color:#5b21b6;">#' + escapeHtml(orderId) + '</div>' +
'      </div>' +
'' +
'      <h3 style="font-size:16px; color:#1f2937; margin:0 0 14px; padding-bottom:8px; border-bottom:2px solid #ede9fe;">' +
'        📦 รายการแผนการสอนของคุณ (' + sharedSubjects.length + ' วิชา)' +
'      </h3>' +
'' +
       subjectBlocks +
'' +
'      <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:14px; margin-top:18px;">' +
'        <div style="font-size:13px; color:#991b1b; line-height:1.6;">' +
'          🔒 <strong>หมายเหตุ:</strong> กรุณาอย่าเผยแพร่หรือแจกจ่ายต่อโดยไม่ได้รับอนุญาต เพื่อสนับสนุนผู้ผลิตผลงานค่ะ' +
'        </div>' +
'      </div>' +
'' +
'      <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:14px; margin-top:14px;">' +
'        <div style="font-size:13px; color:#065f46; line-height:1.7;">' +
'          ✅ หากเปิดไฟล์ไม่ได้ ตรวจสอบว่าได้ล็อกอิน Gmail ที่แจ้งไว้แล้วค่ะ<br>' +
'          ✅ หากมีคำถามเพิ่มเติม ทักมาได้นะคะ ทาง Facebook Messenger เพจ' + escapeHtml(PAGE_NAME) + ' 😊' +
'        </div>' +
'      </div>' +
'    </div>' +
'' +
'    <div style="background:#f9fafb; padding:18px; text-align:center; font-size:12px; color:#9ca3af; border-top:1px solid #e5e7eb;">' +
'      © ' + escapeHtml(PAGE_NAME) + '™ — ระบบสั่งซื้อแผนการสอน<br>' +
'      <span style="font-size:11px;">เมลฉบับนี้ถูกส่งโดยอัตโนมัติ กรุณาอย่าตอบกลับ</span>' +
'    </div>' +
'  </div>' +
'</body></html>';

  MailApp.sendEmail({
    to: customerEmail,
    subject: subject,
    htmlBody: html,
    name: PAGE_NAME + '™'
  });
}


/**
 * แปลง message template เป็น HTML:
 *  - แทนที่ {LINK} ด้วยปุ่ม Drive ที่คลิกได้
 *  - แปลง __ตัวหนา__ เป็น <strong>
 *  - แปลง URL ตรงๆ เป็นลิงก์
 *  - แปลง newline เป็น <br>
 *
 * ถ้า message ว่าง → สร้าง message default จากข้อมูลวิชา
 */
function renderMessageWithLink(message, driveLink, subjectInfo) {
  var text;
  const isExtra = !!subjectInfo.isExtra;

  if (message && String(message).trim()) {
    text = String(message);
  } else if (isExtra) {
    // Extra item ที่ไม่มี message → ใช้ข้อความง่ายๆ
    text = '✨ ' + subjectInfo.subject + '\n(ดูรายละเอียดเพิ่มเติมได้ในข้อความที่แอดมินส่งให้ทาง Messenger)';
  } else {
    // Default template สำหรับวิชาเรียน ถ้ายังไม่ได้ใส่ message
    const hoursLabel = subjectInfo.hours ? subjectInfo.hours + ' ชั่วโมง' : '';
    const planLabel = subjectInfo.planCount ? subjectInfo.planCount + ' แผน' : '';
    const detail = [hoursLabel, planLabel].filter(s => s).join(' / ');
    text =
      '📘 แผนการสอน "' + subjectInfo.subject + ' ' + subjectInfo.grade + '" ตามหลักสูตร ' + subjectInfo.curriculum + '\n' +
      (detail ? '👉 จำนวน ' + detail + '\n' : '') +
      '   📥 ดาวน์โหลดได้ที่:\n' +
      '{LINK}';
  }

  // แทนที่ {LINK} ด้วย placeholder ที่ไม่ตกหล่นการ escape
  const linkPlaceholder = '___DRIVE_LINK_PLACEHOLDER___';
  text = text.replace(/\{LINK\}/gi, linkPlaceholder);

  // แปลง __ตัวหนา__ เป็น placeholder
  const boldStarts = '___BOLD_START___';
  const boldEnds = '___BOLD_END___';
  text = text.replace(/__([^_]+)__/g, boldStarts + '$1' + boldEnds);

  // Escape HTML
  var html = escapeHtml(text);

  // แทน placeholder กลับเป็น tag จริง
  html = html.split(boldStarts).join('<strong>').split(boldEnds).join('</strong>');

  // แปลง URL ดิบ (ที่ไม่ใช่ {LINK}) เป็นลิงก์
  html = html.replace(/(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#7c7ce0; text-decoration:underline; word-break:break-all;">$1</a>');

  // แปลง newline เป็น <br>
  html = html.replace(/\n/g, '<br>');

  // แทน {LINK} ด้วยปุ่ม Drive (เฉพาะที่มี driveLink)
  if (driveLink) {
    const linkBtn = '<br>' +
      '<a href="' + escapeHtmlAttr(driveLink) + '" style="display:inline-block; background:linear-gradient(135deg,#818cf8,#a78bfa); color:white; padding:10px 18px; border-radius:8px; text-decoration:none; font-size:13px; font-weight:600; margin-top:6px;">' +
      '🔗 เปิด Google Drive' +
      '</a>';
    html = html.split(linkPlaceholder).join(linkBtn);
  } else if (isExtra) {
    // 🆕 กรณี Extra ไม่มีลิงก์ Drive → ลบ placeholder ออก (ลิงก์น่าจะอยู่ในข้อความแล้ว)
    html = html.split(linkPlaceholder).join('');
  } else {
    html = html.split(linkPlaceholder).join('(ไม่มีลิงก์)');
  }

  return html;
}


/**
 * แปลงข้อความธรรมดาเป็น HTML (ใช้กับ post note)
 */
function renderTextHtml(text) {
  if (!text) return '';

  const boldStarts = '___BOLD_START___';
  const boldEnds = '___BOLD_END___';
  var processed = String(text).replace(/__([^_]+)__/g, boldStarts + '$1' + boldEnds);

  var html = escapeHtml(processed);
  html = html.split(boldStarts).join('<strong>').split(boldEnds).join('</strong>');
  html = html.replace(/(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#7c7ce0; text-decoration:underline; word-break:break-all;">$1</a>');
  html = html.replace(/\n/g, '<br>');
  return html;
}


// ============================================================
// 🔗 Drive Links Sheet Management
// ============================================================

function getDriveLinks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DRIVE_LINKS_SHEET);
  if (!sheet) sheet = setupDriveLinksSheet(ss);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  const data = sheet.getRange(2, 1, lastRow - 1, DL_COL_COUNT).getValues();
  const links = {};
  data.forEach(row => {
    const grade = String(row[DL_COL.GRADE - 1] || '').trim();
    const curriculum = String(row[DL_COL.CURRICULUM - 1] || '').trim();
    const subjectName = String(row[DL_COL.SUBJECT - 1] || '').trim();
    // 🆕 normalize hours: ว่าง/null/undefined → 0
    const rawHours = row[DL_COL.HOURS - 1];
    const hours = (rawHours === '' || rawHours === null || rawHours === undefined) ? 0 : rawHours;
    if (grade && subjectName) {
      const key = grade + '|' + curriculum + '|' + subjectName + '|' + (hours || '');
      links[key] = {
        planCount: row[DL_COL.PLAN_COUNT - 1] || '',
        drive: String(row[DL_COL.DRIVE - 1] || '').trim(),
        message: String(row[DL_COL.MESSAGE - 1] || '').trim(),
        postNote: String(row[DL_COL.POST_NOTE - 1] || '').trim()
      };
    }
  });
  return links;
}


function setupDriveLinksSheet(ss) {
  const sheet = ss.insertSheet(DRIVE_LINKS_SHEET);

  // Header
  const headers = [
    'ชั้น', 'หลักสูตร', 'วิชา', 'เวลาเรียน (ชม.)', 'จำนวนแผน',
    'ลิงก์ Google Drive (Folder)', 'ข้อความสำหรับลูกค้า', 'บันทึกท้ายแผน'
  ];
  sheet.getRange(1, 1, 1, DL_COL_COUNT).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#818cf8')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);
  sheet.setFrozenRows(1);

  // ใส่ข้อมูลตั้งต้น (ปล่อยจำนวนแผน, ลิงก์, ข้อความ, บันทึกท้ายแผน เป็นว่าง)
  const rows = DEFAULT_DRIVE_LINKS_DATA.map(d => [
    d[0], d[1], d[2], d[3], '', '', '', ''
  ]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, DL_COL_COUNT).setValues(rows);
  }

  // ปรับความกว้างคอลัมน์
  sheet.setColumnWidth(DL_COL.GRADE, 60);
  sheet.setColumnWidth(DL_COL.CURRICULUM, 80);
  sheet.setColumnWidth(DL_COL.SUBJECT, 280);
  sheet.setColumnWidth(DL_COL.HOURS, 90);
  sheet.setColumnWidth(DL_COL.PLAN_COUNT, 90);
  sheet.setColumnWidth(DL_COL.DRIVE, 280);
  sheet.setColumnWidth(DL_COL.MESSAGE, 380);
  sheet.setColumnWidth(DL_COL.POST_NOTE, 320);

  // ระบายสีแต่ละชั้น (ABC + คอลัมน์ตัวเลข)
  const gradeColors = {
    'ป.1': '#eef2ff', 'ป.2': '#fef9c3', 'ป.3': '#dcfce7',
    'ป.4': '#fce7f3', 'ป.5': '#dbeafe', 'ป.6': '#ede9fe'
  };
  for (var i = 0; i < rows.length; i++) {
    const grade = rows[i][0];
    const color = gradeColors[grade] || '#ffffff';
    sheet.getRange(i + 2, 1, 1, 5).setBackground(color);
    sheet.getRange(i + 2, DL_COL.GRADE).setFontWeight('bold').setHorizontalAlignment('center');
    sheet.getRange(i + 2, DL_COL.CURRICULUM).setFontWeight('bold').setHorizontalAlignment('center');
    sheet.getRange(i + 2, DL_COL.HOURS).setHorizontalAlignment('center');
    sheet.getRange(i + 2, DL_COL.PLAN_COUNT).setHorizontalAlignment('center');
  }

  // Wrap ในคอลัมน์ข้อความ
  sheet.getRange(2, DL_COL.MESSAGE, rows.length, 1).setWrap(true).setVerticalAlignment('top');
  sheet.getRange(2, DL_COL.POST_NOTE, rows.length, 1).setWrap(true).setVerticalAlignment('top');

  // Validation: หลักสูตร = 51/68
  const currRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['68', '51'], true).setAllowInvalid(false).build();
  sheet.getRange(2, DL_COL.CURRICULUM, rows.length, 1).setDataValidation(currRule);

  sheet.setFrozenColumns(3);

  // คำอธิบายท้าย sheet (merge เฉพาะคอลัมน์ที่ไม่ได้ตรึง = D-H = col 4-8)
  const descRow = rows.length + 3;
  sheet.getRange(descRow, 4, 1, 5).merge()
    .setValue('💡 ใส่ลิงก์ Drive Folder, จำนวนแผน, ข้อความสำหรับลูกค้า และบันทึกท้ายแผน (ปล่อยว่างได้ถ้ายังไม่มี)')
    .setFontStyle('italic').setFontColor('#6b7280').setBackground('#f9fafb');

  sheet.getRange(descRow + 1, 4, 1, 5).merge()
    .setValue('📝 ใน "ข้อความสำหรับลูกค้า" ใช้ {LINK} เป็นจุดวางลิงก์ Drive (จะกลายเป็นปุ่มในเมล)  |  ใช้ __ตัวหนา__ ครอบข้อความเพื่อทำตัวหนา')
    .setFontStyle('italic').setFontColor('#6b7280').setBackground('#f9fafb');

  sheet.getRange(descRow + 2, 4, 1, 5).merge()
    .setValue('ตัวอย่างข้อความ: 📘 แผนการสอน "ศิลปะและวัฒนธรรม ป.6" ตามหลักสูตรใหม่ 2568  👉 จำนวน 100 ชั่วโมง / 72 แผน  📥 ดาวน์โหลดได้ที่: {LINK}')
    .setFontStyle('italic').setFontColor('#9ca3af').setFontSize(11);

  return sheet;
}


// ============================================================
// 📂 Example Links Sheet Management
// ============================================================

/**
 * Setup Sheet "📂 Example Links"
 * คอลัมน์ A-E (ชั้น, หลักสูตร, วิชา, เวลาเรียน, จำนวนแผน) → ดึงจาก Drive Links อัตโนมัติด้วยสูตร
 * คอลัมน์ F (Example Links) → ใส่ลิงก์ตัวอย่างเอง
 */
function setupExampleLinksSheet(ss) {
  const sheet = ss.insertSheet(EXAMPLE_LINKS_SHEET);

  // Header
  const headers = [
    'ชั้น', 'หลักสูตร', 'วิชา', 'เวลาเรียน (ชม.)', 'จำนวนแผน',
    'Example Links'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#a78bfa')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);
  sheet.setFrozenRows(1);

  // อ่านข้อมูลจาก Drive Links sheet เพื่อสร้างจำนวนแถวให้พอ
  const driveLinksSheet = ss.getSheetByName(DRIVE_LINKS_SHEET);
  var rowCount = 100; // default
  if (driveLinksSheet && driveLinksSheet.getLastRow() > 1) {
    rowCount = driveLinksSheet.getLastRow() - 1;
  }

  // ใส่สูตร ARRAYFORMULA ใน A2 เพื่อดึงข้อมูล A-E จาก Drive Links อัตโนมัติ
  const formulaRange = sheet.getRange(2, 1);
  const formula =
    "=ARRAYFORMULA(IF(LEN('" + DRIVE_LINKS_SHEET + "'!A2:A), '" + DRIVE_LINKS_SHEET + "'!A2:E, \"\"))";
  formulaRange.setFormula(formula);

  // ปรับความกว้างคอลัมน์
  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(3, 280);
  sheet.setColumnWidth(4, 90);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 380);

  // ระบายสีคอลัมน์ A-E เพื่อบอกว่าเป็นสูตร (ไม่ควรแก้)
  sheet.getRange(2, 1, rowCount, 5).setBackground('#f9fafb');

  // จัดกลางคอลัมน์ตัวเลข + กลางคอลัมน์เลขชั้น/หลักสูตร
  sheet.getRange(2, 1, rowCount, 1).setHorizontalAlignment('center').setFontWeight('bold');
  sheet.getRange(2, 2, rowCount, 1).setHorizontalAlignment('center').setFontWeight('bold');
  sheet.getRange(2, 4, rowCount, 1).setHorizontalAlignment('center');
  sheet.getRange(2, 5, rowCount, 1).setHorizontalAlignment('center');

  sheet.setFrozenColumns(3);

  // คำอธิบายท้าย sheet
  const descRow = rowCount + 4;
  sheet.getRange(descRow, 1, 1, 6).merge()
    .setValue('💡 คอลัมน์ A-E (ชั้น, หลักสูตร, วิชา, เวลาเรียน, จำนวนแผน) ดึงข้อมูลจาก Sheet "🔗 Drive Links" อัตโนมัติ — ห้ามแก้ไข')
    .setFontStyle('italic').setFontColor('#6b7280').setBackground('#fef3c7');

  sheet.getRange(descRow + 1, 1, 1, 6).merge()
    .setValue('📝 ใส่เฉพาะคอลัมน์ F (Example Links) — ลิงก์ Drive ตัวอย่างของแต่ละวิชา (ปล่อยว่างได้ถ้ายังไม่มี)')
    .setFontStyle('italic').setFontColor('#6b7280').setBackground('#f9fafb');

  return sheet;
}


/**
 * อ่านข้อมูล Example Links → return เป็น object พร้อมใช้
 */
function getExampleLinks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EXAMPLE_LINKS_SHEET);
  if (!sheet) sheet = setupExampleLinksSheet(ss);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  // อ่าน 6 คอลัมน์
  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const links = {};
  data.forEach(row => {
    const grade = String(row[0] || '').trim();
    const curriculum = String(row[1] || '').trim();
    const subject = String(row[2] || '').trim();
    const hours = row[3];
    const exampleLink = String(row[5] || '').trim();
    if (grade && subject) {
      const key = grade + '|' + curriculum + '|' + subject + '|' + (hours || '');
      links[key] = {
        planCount: row[4] || '',
        exampleLink: exampleLink
      };
    }
  });
  return links;
}


/**
 * 🆕 ลูกค้า/Public ดูรายการ Example Links (ไม่ต้องล็อกอิน)
 */
function handlePublicGetExampleLinks() {
  try {
    const links = getExampleLinks();
    return jsonResponse({ success: true, links: links });
  } catch (err) {
    Logger.log('getExampleLinks error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}


// ============================================================
// 📝 Order Sheet Management
// ============================================================

function saveOrderToSheet(ss, data) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) setupOrdersHeader(sheet);

  const now = new Date();
  const timestamp = Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');

  // 🆕 v7.2: เก็บเมลแยกตามวิชา (JSON) ในคอลัมน์ 15
  // รูปแบบ: data.emailPerItem = {"itemKey": "email@example.com", ...}
  // itemKey = grade|curriculum|subject|hours (ตรงกับ key ใน Drive Links)
  var emailPerItemJson = '';
  if (data.emailPerItem && typeof data.emailPerItem === 'object') {
    try { emailPerItemJson = JSON.stringify(data.emailPerItem); }
    catch (e) { emailPerItemJson = ''; }
  }

  const row = [
    timestamp, data.orderId || '', data.customerFb || '', data.customerEmail || '',
    data.itemCount || 0, data.items || '',
    data.subtotal || 0, data.discountPercent || 0, data.discountPercentValue || 0,
    data.discountBaht || 0, data.netTotal || 0,
    STATUSES.PENDING, '', '',
    emailPerItemJson  // 🆕 col 15
  ];

  sheet.appendRow(row);
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, COL.ITEMS).setWrap(true);
  sheet.getRange(lastRow, COL.SUBTOTAL, 1, 5).setNumberFormat('#,##0');
  applyStatusValidation(sheet, lastRow);
  applyStatusColor(sheet, lastRow, STATUSES.PENDING);
}


function setupOrdersHeader(sheet) {
  const headers = [
    'วันที่/เวลา', 'รหัสคำสั่งซื้อ', 'ชื่อ Facebook', 'Gmail',
    'จำนวนรายการ', 'รายการสินค้า',
    'ยอดรวม (บาท)', 'ส่วนลด %', 'ส่วนลด % (บาท)', 'ส่วนลดเงินบาท',
    'ยอดสุทธิ (บาท)', 'สถานะ', 'หมายเหตุ', 'สลิป',
    'เมลแยกตามวิชา (JSON)'  // 🆕 col 15
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#818cf8').setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 150); sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(3, 180); sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 80); sheet.setColumnWidth(6, 400);
  sheet.setColumnWidth(11, 120); sheet.setColumnWidth(12, 140);
  sheet.setColumnWidth(14, 200);
  sheet.setColumnWidth(15, 100); // 🆕 ซ่อนหรือเล็กไว้ — ไม่ค่อยได้ดูตาเปล่า
}


function applyStatusValidation(sheet, row) {
  const range = sheet.getRange(row, COL.STATUS);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      STATUSES.PENDING, STATUSES.PAID, STATUSES.APPROVED,
      STATUSES.COMPLETED, 'ยกเลิก'
    ], true).setAllowInvalid(false).build();
  range.setDataValidation(rule);
}


function applyStatusColor(sheet, row, status) {
  const color = STATUS_COLORS[status];
  if (!color) return;
  sheet.getRange(row, COL.STATUS)
    .setBackground(color.bg).setFontColor(color.fg).setFontWeight('bold');
}


function refreshAllStatuses() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;

  for (var row = 2; row <= sheet.getLastRow(); row++) {
    const status = sheet.getRange(row, COL.STATUS).getValue();
    applyStatusValidation(sheet, row);
    if (status) applyStatusColor(sheet, row, status);
  }
  try { SpreadsheetApp.getUi().alert('✅ อัปเดต Dropdown สถานะให้ทุกแถวเรียบร้อย'); }
  catch (e) { Logger.log('Refreshed all statuses'); }
}


function clearAllOrders() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('⚠️ ยืนยันการลบข้อมูล',
    'คุณต้องการลบคำสั่งซื้อทั้งหมดใช่หรือไม่?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้',
    ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
      .clear().clearDataValidations();
  }
  updateDashboard(ss);
  ui.alert('✅ ลบข้อมูลเรียบร้อย', '', ui.ButtonSet.OK);
}


// ============================================================
// 📊 Dashboard
// ============================================================

function updateDashboard(ss) {
  var dash = ss.getSheetByName(DASHBOARD_NAME);
  const ordersSheet = ss.getSheetByName(SHEET_NAME);

  if (!dash) dash = ss.insertSheet(DASHBOARD_NAME, 0);
  else { dash.clear(); dash.clearFormats(); dash.clearConditionalFormatRules();
         // ลบชาร์ตเก่า
         dash.getCharts().forEach(c => dash.removeChart(c)); }

  var data = [];
  if (ordersSheet && ordersSheet.getLastRow() >= 2) {
    const rawData = ordersSheet.getRange(2, 1, ordersSheet.getLastRow() - 1, 13).getValues();
    data = rawData.filter(row => row[0] || row[1]);
  }

  const stats = calculateStats(data);
  const periodStats = calculatePeriodStats(data);    // 🆕 รายวัน/เดือน/ปี
  const topSubjects = calculateTopSubjects(data);    // 🆕 top 10 วิชาขายดี
  const monthlyTrend = calculateMonthlyTrend(data);  // 🆕 12 เดือนล่าสุด

  var row = 1;

  // ============ Header ============
  dash.getRange(row, 1, 1, 8).merge()
    .setValue('📊 Dashboard – ' + PAGE_NAME + '™')
    .setFontSize(20).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#818cf8').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dash.setRowHeight(row, 50);
  row++;

  const updateTime = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
  dash.getRange(row, 1, 1, 8).merge()
    .setValue('อัปเดตล่าสุด: ' + updateTime)
    .setFontSize(11).setFontColor('#6b7280').setBackground('#f9fafb')
    .setHorizontalAlignment('center').setFontStyle('italic');
  dash.setRowHeight(row, 28);
  row += 2;

  // ============ 🆕 SECTION 1: สรุปยอดตามช่วงเวลา (รายวัน/เดือน/ปี) ============
  dash.getRange(row, 1, 1, 8).merge()
    .setValue('📅 สรุปยอดขายตามช่วงเวลา (เฉพาะคำสั่งซื้อที่ชำระเงินแล้ว)')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1f2937')
    .setBackground('#f3f4f6').setHorizontalAlignment('left').setVerticalAlignment('middle');
  dash.setRowHeight(row, 36);
  row++;

  // 3 KPI cards: วันนี้ / เดือนนี้ / ปีนี้
  const periodKpis = [
    { label: 'วันนี้', count: periodStats.today.count, total: periodStats.today.total,
      bg: '#fef3c7', fg: '#b45309', icon: '☀️', sub: periodStats.today.label },
    { label: 'เดือนนี้', count: periodStats.month.count, total: periodStats.month.total,
      bg: '#e0e7ff', fg: '#4338ca', icon: '🗓️', sub: periodStats.month.label },
    { label: 'ปีนี้', count: periodStats.year.count, total: periodStats.year.total,
      bg: '#ccfbf1', fg: '#0f766e', icon: '🎯', sub: periodStats.year.label }
  ];

  // แต่ละการ์ดกว้าง 2 cols (1-2, 3-4, 5-6) ส่วน col 7-8 จะถูกใช้ภายหลัง
  for (var i = 0; i < periodKpis.length; i++) {
    const k = periodKpis[i];
    // คำนวณ col แบบ: i=0→1-2, i=1→3-4, i=2→5-7 (ขยายให้กว้างขึ้น)
    var col, span;
    if (i === 0) { col = 1; span = 2; }
    else if (i === 1) { col = 3; span = 3; }
    else { col = 6; span = 3; }

    // header
    dash.getRange(row, col, 1, span).merge().setValue(k.icon + '  ' + k.label + ' • ' + k.sub)
      .setFontSize(11).setFontColor(k.fg).setFontWeight('bold')
      .setBackground(k.bg).setHorizontalAlignment('center').setVerticalAlignment('middle');
    // ยอดเงิน
    dash.getRange(row + 1, col, 1, span).merge().setValue('฿' + formatNumber(k.total))
      .setFontSize(22).setFontWeight('bold').setFontColor(k.fg)
      .setBackground(k.bg).setHorizontalAlignment('center').setVerticalAlignment('middle');
    // จำนวนรายการ
    dash.getRange(row + 2, col, 1, span).merge().setValue(formatNumber(k.count) + ' รายการ')
      .setFontSize(11).setFontColor(k.fg)
      .setBackground(k.bg).setHorizontalAlignment('center').setVerticalAlignment('middle');
  }
  dash.setRowHeight(row, 30);
  dash.setRowHeight(row + 1, 50);
  dash.setRowHeight(row + 2, 26);
  row += 4;

  // ============ SECTION 2: KPIs สรุปรวม ============
  const kpis = [
    { label: 'คำสั่งซื้อทั้งหมด', value: stats.totalOrders + ' รายการ', bg: '#eef2ff', fg: '#4338ca', icon: '🛒' },
    { label: 'ยอดขายรวม', value: '฿' + formatNumber(stats.totalRevenue), bg: '#f0fdf4', fg: '#15803d', icon: '💰' },
    { label: 'รอชำระเงิน', value: stats.pendingCount + ' รายการ', bg: '#fef9c3', fg: '#a16207', icon: '⏳' },
    { label: 'ส่งแผนเสร็จสิ้น', value: stats.completedCount + ' รายการ', bg: '#dcfce7', fg: '#15803d', icon: '✅' }
  ];

  for (var i = 0; i < kpis.length; i++) {
    const k = kpis[i];
    const col = i * 2 + 1;
    dash.getRange(row, col, 1, 2).merge().setValue(k.icon + '  ' + k.label)
      .setFontSize(12).setFontColor(k.fg).setFontWeight('bold')
      .setBackground(k.bg).setHorizontalAlignment('center').setVerticalAlignment('middle');
    dash.getRange(row + 1, col, 1, 2).merge().setValue(k.value)
      .setFontSize(20).setFontWeight('bold').setFontColor(k.fg)
      .setBackground(k.bg).setHorizontalAlignment('center').setVerticalAlignment('middle');
  }
  dash.setRowHeight(row, 32);
  dash.setRowHeight(row + 1, 50);
  row += 3;

  if (data.length === 0) {
    dash.getRange(row, 1, 1, 8).merge()
      .setValue('📭 ยังไม่มีคำสั่งซื้อในระบบ')
      .setFontSize(14).setFontColor('#9ca3af').setBackground('#f9fafb')
      .setHorizontalAlignment('center').setVerticalAlignment('middle').setFontStyle('italic');
    dash.setRowHeight(row, 60);
    setDashboardColumnWidths(dash);
    dash.setHiddenGridlines(true);
    return;
  }

  row++;

  // ============ 🆕 SECTION 3: TOP 10 วิชาขายดี ============
  dash.getRange(row, 1, 1, 8).merge()
    .setValue('🏆 Top 10 วิชาขายดี (จากคำสั่งซื้อทั้งหมด)')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1f2937')
    .setBackground('#f3f4f6').setHorizontalAlignment('left').setVerticalAlignment('middle');
  dash.setRowHeight(row, 36);
  row++;

  if (topSubjects.length === 0) {
    dash.getRange(row, 1, 1, 8).merge()
      .setValue('— ยังไม่มีข้อมูลวิชา —')
      .setFontSize(12).setFontColor('#9ca3af').setBackground('#fafafa')
      .setHorizontalAlignment('center').setFontStyle('italic');
    dash.setRowHeight(row, 36);
    row += 2;
  } else {
    // headers: อันดับ | วิชา | ชั้น | หลักสูตร | จำนวนชั่วโมง | ครั้งที่ขาย | bar
    const topHeaders = ['อันดับ', 'วิชา', 'ชั้น', 'หลักสูตร', 'จำนวนชม.', 'ขายได้ (ครั้ง)', 'สัดส่วน'];
    dash.getRange(row, 1, 1, 7).setValues([topHeaders])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#f59e0b')
      .setHorizontalAlignment('center');
    dash.setRowHeight(row, 32);
    row++;

    const topMaxCount = topSubjects[0].count;
    topSubjects.forEach((s, idx) => {
      const rank = idx + 1;
      const medalIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : ' ' + rank;
      // สร้าง bar visualization ด้วย unicode block
      const barLength = Math.round((s.count / topMaxCount) * 20);
      const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength) + '  ' + s.count;

      const hoursDisplay = s.hours ? s.hours + ' ชม.' : '-';
      const currDisplay = s.curriculum && s.curriculum !== '-' ? 'หลักสูตร ' + s.curriculum : '-';

      dash.getRange(row, 1, 1, 7).setValues([[
        medalIcon, s.subject, s.grade, currDisplay, hoursDisplay, s.count, bar
      ]]).setVerticalAlignment('middle');

      const bg = idx % 2 === 0 ? '#ffffff' : '#fffbeb';
      dash.getRange(row, 1, 1, 7).setBackground(bg);
      dash.getRange(row, 1).setHorizontalAlignment('center').setFontSize(13).setFontWeight('bold');
      dash.getRange(row, 2).setFontWeight('bold').setFontColor('#92400e');
      dash.getRange(row, 3).setHorizontalAlignment('center');
      dash.getRange(row, 4).setHorizontalAlignment('center').setFontSize(10).setFontColor('#6b7280');
      dash.getRange(row, 5).setHorizontalAlignment('center');
      dash.getRange(row, 6).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#d97706');
      dash.getRange(row, 7).setFontFamily('Courier New').setFontSize(10).setFontColor('#f59e0b');

      // ไฮไลต์ Top 3
      if (rank <= 3) {
        dash.getRange(row, 1, 1, 7).setBackground(rank === 1 ? '#fef3c7' : (rank === 2 ? '#fef9c3' : '#fffbeb'));
      }
      row++;
    });
    row++;
  }

  // ============ 🆕 SECTION 4: กราฟยอดขายรายเดือน (12 เดือนล่าสุด) ============
  dash.getRange(row, 1, 1, 8).merge()
    .setValue('📈 ยอดขายรายเดือน (12 เดือนล่าสุด)')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1f2937')
    .setBackground('#f3f4f6').setHorizontalAlignment('left').setVerticalAlignment('middle');
  dash.setRowHeight(row, 36);
  row++;

  // ตารางข้อมูลสำหรับ chart (เก็บใน range ที่ chart จะใช้)
  const trendStartRow = row;
  dash.getRange(row, 1, 1, 3).setValues([['เดือน', 'ยอดขาย (บาท)', 'จำนวนรายการ']])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#a78bfa').setHorizontalAlignment('center');
  row++;

  monthlyTrend.forEach((m, idx) => {
    dash.getRange(row, 1, 1, 3).setValues([[m.label, m.total, m.count]])
      .setVerticalAlignment('middle');
    dash.getRange(row, 1).setHorizontalAlignment('center');
    dash.getRange(row, 2).setNumberFormat('฿#,##0').setHorizontalAlignment('right').setFontWeight('bold');
    dash.getRange(row, 3).setHorizontalAlignment('center');
    if (idx % 2 === 1) dash.getRange(row, 1, 1, 3).setBackground('#fafafa');
    row++;
  });
  const trendEndRow = row - 1;

  // สร้าง Column Chart จากข้อมูลด้านบน
  if (monthlyTrend.some(m => m.total > 0)) {
    const chartBuilder = dash.newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(dash.getRange(trendStartRow, 1, trendEndRow - trendStartRow + 1, 2))
      .setPosition(trendStartRow, 5, 0, 0)  // วาง chart ที่ col 5
      .setOption('title', 'แนวโน้มยอดขาย 12 เดือนล่าสุด')
      .setOption('titleTextStyle', { fontSize: 13, bold: true, color: '#4338ca' })
      .setOption('width', 540)
      .setOption('height', 280)
      .setOption('legend', { position: 'none' })
      .setOption('colors', ['#818cf8'])
      .setOption('hAxis', { textStyle: { fontSize: 10 }, slantedText: true, slantedTextAngle: 30 })
      .setOption('vAxis', { format: '฿#,##0', textStyle: { fontSize: 10 }, gridlines: { color: '#f3f4f6' } })
      .setOption('backgroundColor', '#ffffff')
      .setOption('chartArea', { left: 70, top: 40, width: '85%', height: '70%' });
    dash.insertChart(chartBuilder.build());
  }

  row++;

  // ============ SECTION 5: คำสั่งซื้อล่าสุด ============
  dash.getRange(row, 1, 1, 8).merge()
    .setValue('🆕 คำสั่งซื้อล่าสุด (สูงสุด 10 รายการ)')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1f2937')
    .setBackground('#f3f4f6').setHorizontalAlignment('left').setVerticalAlignment('middle');
  dash.setRowHeight(row, 36);
  row++;

  const tableHeaders = ['วันที่/เวลา', 'รหัสคำสั่งซื้อ', 'ชื่อ Facebook', 'Gmail', 'จำนวน', 'ยอดสุทธิ', 'สถานะ'];
  dash.getRange(row, 1, 1, 7).setValues([tableHeaders])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#a78bfa')
    .setHorizontalAlignment('center');
  dash.setRowHeight(row, 32);
  row++;

  const recent = data.slice().reverse().slice(0, 10);
  const tableData = recent.map(r => [r[0], r[1], r[2], r[3], r[4], r[10], r[11]]);
  dash.getRange(row, 1, tableData.length, 7).setValues(tableData).setVerticalAlignment('middle');
  dash.getRange(row, 5, tableData.length, 1).setHorizontalAlignment('center');
  dash.getRange(row, 6, tableData.length, 1).setNumberFormat('฿#,##0').setHorizontalAlignment('right').setFontWeight('bold');
  dash.getRange(row, 7, tableData.length, 1).setHorizontalAlignment('center');

  for (var i = 0; i < tableData.length; i++) {
    const r = row + i;
    const bg = i % 2 === 0 ? '#ffffff' : '#fafafa';
    dash.getRange(r, 1, 1, 7).setBackground(bg);
    const status = String(tableData[i][6]);
    const color = STATUS_COLORS[status];
    if (color) dash.getRange(r, 7).setBackground(color.bg).setFontColor(color.fg).setFontWeight('bold');
  }
  row += tableData.length + 2;

  // ============ SECTION 6: สรุปตามสถานะ ============
  dash.getRange(row, 1, 1, 4).merge()
    .setValue('📋 สรุปตามสถานะ')
    .setFontSize(14).setFontWeight('bold').setBackground('#f3f4f6').setHorizontalAlignment('left');
  dash.setRowHeight(row, 36);
  row++;

  const statusHeaders = ['สถานะ', 'จำนวน', 'ยอดรวม (บาท)', '%'];
  dash.getRange(row, 1, 1, 4).setValues([statusHeaders])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#a78bfa').setHorizontalAlignment('center');
  row++;

  const statusList = [
    { label: '⏳ รอชำระเงิน', count: stats.pendingCount, total: stats.pendingRevenue, bg: '#fef9c3' },
    { label: '💵 ชำระเงินแล้ว', count: stats.paidCount, total: stats.paidRevenue, bg: '#dbeafe' },
    { label: '✏️ อนุมัติส่งแผน', count: stats.approvedCount, total: stats.approvedRevenue, bg: '#ede9fe' },
    { label: '✅ ส่งแผนเสร็จสิ้น', count: stats.completedCount, total: stats.completedRevenue, bg: '#dcfce7' },
    { label: '❌ ยกเลิก', count: stats.cancelledCount, total: stats.cancelledRevenue, bg: '#fee2e2' }
  ];

  statusList.forEach(s => {
    const pct = stats.totalOrders > 0 ? (s.count / stats.totalOrders * 100).toFixed(1) + '%' : '0%';
    dash.getRange(row, 1, 1, 4).setValues([[s.label, s.count, s.total, pct]])
      .setBackground(s.bg).setVerticalAlignment('middle');
    dash.getRange(row, 2).setHorizontalAlignment('center');
    dash.getRange(row, 3).setNumberFormat('#,##0').setHorizontalAlignment('right').setFontWeight('bold');
    dash.getRange(row, 4).setHorizontalAlignment('center');
    row++;
  });

  setDashboardColumnWidths(dash);
  dash.setHiddenGridlines(true);
}


/**
 * 🆕 คำนวณยอดขายรายวัน/เดือน/ปี (เฉพาะที่ชำระแล้ว = paid/approved/completed)
 */
function calculatePeriodStats(data) {
  const now = new Date();
  const tz = 'Asia/Bangkok';
  const todayStr = Utilities.formatDate(now, tz, 'dd/MM/yyyy');
  const monthStr = Utilities.formatDate(now, tz, 'MM/yyyy');
  const yearStr = Utilities.formatDate(now, tz, 'yyyy');
  const todayLabel = Utilities.formatDate(now, tz, 'dd MMM yyyy');
  const monthLabel = Utilities.formatDate(now, tz, 'MMMM yyyy');
  const yearLabel = 'พ.ศ. ' + (parseInt(yearStr) + 543);

  const result = {
    today: { count: 0, total: 0, label: todayLabel },
    month: { count: 0, total: 0, label: monthLabel },
    year: { count: 0, total: 0, label: yearLabel }
  };

  // นับเฉพาะคำสั่งซื้อที่ "ชำระเงินแล้ว" หรือดำเนินการต่อ (ไม่รวม pending/cancelled)
  const validStatuses = [STATUSES.PAID, STATUSES.APPROVED, STATUSES.COMPLETED];

  data.forEach(row => {
    const ts = row[0];
    const netTotal = Number(row[10]) || 0;
    const status = String(row[11] || '').trim();

    if (validStatuses.indexOf(status) === -1) return;

    var dateStr, mStr, yStr;
    if (ts instanceof Date) {
      dateStr = Utilities.formatDate(ts, tz, 'dd/MM/yyyy');
      mStr = Utilities.formatDate(ts, tz, 'MM/yyyy');
      yStr = Utilities.formatDate(ts, tz, 'yyyy');
    } else if (typeof ts === 'string' && ts.length >= 10) {
      // คาดว่ารูปแบบ "dd/MM/yyyy HH:mm:ss"
      const parts = ts.split(' ')[0].split('/');
      if (parts.length !== 3) return;
      dateStr = parts[0] + '/' + parts[1] + '/' + parts[2];
      mStr = parts[1] + '/' + parts[2];
      yStr = parts[2];
    } else return;

    if (dateStr === todayStr) {
      result.today.count++;
      result.today.total += netTotal;
    }
    if (mStr === monthStr) {
      result.month.count++;
      result.month.total += netTotal;
    }
    if (yStr === yearStr) {
      result.year.count++;
      result.year.total += netTotal;
    }
  });

  return result;
}


/**
 * 🆕 คำนวณ Top 10 วิชาขายดี (เฉพาะคำสั่งซื้อที่ไม่ถูกยกเลิก)
 */
function calculateTopSubjects(data) {
  const counter = {}; // key = "วิชา|ชั้น|หลักสูตร|ชม." → { subject, grade, curriculum, hours, count }

  data.forEach(row => {
    const status = String(row[11] || '').trim();
    if (status === 'ยกเลิก') return; // ไม่นับยอดยกเลิก

    const itemsText = row[5]; // COL.ITEMS = 6
    if (!itemsText) return;
    const parsed = parseOrderItems(itemsText);

    parsed.forEach(item => {
      // ใช้ key รวมทั้ง subject/grade/curriculum/hours เพื่อแยกความแตกต่าง
      const key = item.subject + '|' + item.grade + '|' + item.curriculum + '|' + (item.hours || 0);
      if (!counter[key]) {
        counter[key] = {
          subject: item.subject,
          grade: item.grade,
          curriculum: item.curriculum,
          hours: item.hours,
          count: 0
        };
      }
      counter[key].count++;
    });
  });

  const list = Object.keys(counter).map(k => counter[k]);
  list.sort((a, b) => b.count - a.count);
  return list.slice(0, 10);
}


/**
 * 🆕 คำนวณยอดขายรายเดือน 12 เดือนล่าสุด (เฉพาะที่ชำระเงินแล้ว)
 */
function calculateMonthlyTrend(data) {
  const tz = 'Asia/Bangkok';
  const now = new Date();
  const validStatuses = [STATUSES.PAID, STATUSES.APPROVED, STATUSES.COMPLETED];

  // สร้างโครง 12 เดือนย้อนหลัง (เก่า → ใหม่)
  const months = [];
  for (var i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = Utilities.formatDate(d, tz, 'MM/yyyy');
    const label = Utilities.formatDate(d, tz, 'MMM yy');
    months.push({ key, label, count: 0, total: 0 });
  }
  const monthMap = {};
  months.forEach(m => { monthMap[m.key] = m; });

  data.forEach(row => {
    const ts = row[0];
    const netTotal = Number(row[10]) || 0;
    const status = String(row[11] || '').trim();
    if (validStatuses.indexOf(status) === -1) return;

    var mKey;
    if (ts instanceof Date) {
      mKey = Utilities.formatDate(ts, tz, 'MM/yyyy');
    } else if (typeof ts === 'string' && ts.length >= 10) {
      const parts = ts.split(' ')[0].split('/');
      if (parts.length !== 3) return;
      mKey = parts[1] + '/' + parts[2];
    } else return;

    if (monthMap[mKey]) {
      monthMap[mKey].count++;
      monthMap[mKey].total += netTotal;
    }
  });

  return months;
}


function setDashboardColumnWidths(dash) {
  dash.setColumnWidth(1, 90);   // อันดับ
  dash.setColumnWidth(2, 200);  // วิชา / รหัส
  dash.setColumnWidth(3, 90);   // ชั้น / ชื่อ FB
  dash.setColumnWidth(4, 110);  // หลักสูตร / Gmail
  dash.setColumnWidth(5, 100);  // ชม. / จำนวน
  dash.setColumnWidth(6, 120);  // ขายได้/ยอดสุทธิ
  dash.setColumnWidth(7, 220);  // bar / สถานะ
  dash.setColumnWidth(8, 80);
}


function calculateStats(data) {
  var totalRevenue = 0;
  var paidCount = 0, paidRevenue = 0;
  var pendingCount = 0, pendingRevenue = 0;
  var approvedCount = 0, approvedRevenue = 0;
  var completedCount = 0, completedRevenue = 0;
  var cancelledCount = 0, cancelledRevenue = 0;

  data.forEach(row => {
    const netTotal = Number(row[10]) || 0;
    const status = String(row[11] || '').trim();
    totalRevenue += netTotal;

    if (status === STATUSES.COMPLETED) { completedCount++; completedRevenue += netTotal; }
    else if (status === STATUSES.APPROVED) { approvedCount++; approvedRevenue += netTotal; }
    else if (status === STATUSES.PAID) { paidCount++; paidRevenue += netTotal; }
    else if (status === 'ยกเลิก') { cancelledCount++; cancelledRevenue += netTotal; }
    else { pendingCount++; pendingRevenue += netTotal; }
  });

  return {
    totalOrders: data.length, totalRevenue,
    avgOrder: data.length > 0 ? totalRevenue / data.length : 0,
    paidCount, paidRevenue, pendingCount, pendingRevenue,
    approvedCount, approvedRevenue, completedCount, completedRevenue,
    cancelledCount, cancelledRevenue
  };
}

function formatNumber(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }


// ============================================================
// 📧 Notification Email (admin)
// ============================================================

function sendNotificationEmail(data, timestamp) {
  if (!NOTIFY_EMAIL || NOTIFY_EMAIL === 'your-email@gmail.com') return;
  try { if (MailApp.getRemainingDailyQuota() <= 0) return; } catch (e) { return; }

  try {
    const subject = '🛒 คำสั่งซื้อใหม่ #' + data.orderId + ' - ' + formatCurrency(data.netTotal) + ' บาท';
    const itemsHtml = String(data.items || '').split('\n')
      .map(line => '<li style="margin-bottom:6px;">' + escapeHtml(line) + '</li>').join('');

    const html =
'<!DOCTYPE html><html><body style="font-family: Sarabun, Arial, sans-serif; background:#f9fafb; padding:20px;">' +
'  <div style="max-width:600px; margin:0 auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.08);">' +
'    <div style="background:linear-gradient(135deg,#818cf8,#a78bfa,#f0abfc); padding:24px; color:white; text-align:center;">' +
'      <h1 style="margin:0; font-size:24px;">🛒 คำสั่งซื้อใหม่</h1>' +
'      <p style="margin:8px 0 0; opacity:0.9; font-size:14px;">' + escapeHtml(PAGE_NAME) + '™</p>' +
'    </div>' +
'    <div style="padding:24px;">' +
'      <div style="background:#f8f7ff; border-radius:10px; padding:16px; margin-bottom:20px;">' +
'        <div style="font-size:12px; color:#6b7280;">รหัสคำสั่งซื้อ</div>' +
'        <div style="font-size:18px; font-weight:bold; color:#5b21b6;">#' + escapeHtml(data.orderId) + '</div>' +
'        <div style="font-size:12px; color:#6b7280; margin-top:8px;">' + escapeHtml(timestamp) + '</div>' +
'      </div>' +
'      <h3 style="font-size:16px; color:#1f2937; margin:0 0 12px;">👤 ข้อมูลลูกค้า</h3>' +
'      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">' +
'        <tr><td style="padding:8px 0; color:#6b7280; font-size:14px; width:120px;">📘 Facebook:</td>' +
'            <td style="padding:8px 0; color:#1f2937; font-weight:500;">' + escapeHtml(data.customerFb) + '</td></tr>' +
'        <tr><td style="padding:8px 0; color:#6b7280; font-size:14px;">📧 Gmail:</td>' +
'            <td style="padding:8px 0; color:#1f2937; font-weight:500;">' +
'              <a href="mailto:' + escapeHtml(data.customerEmail) + '" style="color:#7c7ce0;">' + escapeHtml(data.customerEmail) + '</a></td></tr>' +
'      </table>' +
'      <h3 style="font-size:16px; color:#1f2937; margin:0 0 12px;">📋 รายการสินค้า (' + data.itemCount + ')</h3>' +
'      <ol style="padding-left:20px; margin:0 0 20px; color:#374151; font-size:14px;">' + itemsHtml + '</ol>' +
'      <div style="background:linear-gradient(135deg,#4c4ca8,#6b5bc4); color:white; border-radius:12px; padding:20px;">' +
'        <table style="width:100%; font-size:14px;">' +
'          <tr><td style="padding:4px 0; opacity:0.85;">ราคารวม:</td><td style="padding:4px 0; text-align:right;">' + formatCurrency(data.subtotal) + ' บาท</td></tr>' +
'          <tr><td style="padding:4px 0; opacity:0.85;">ส่วนลด ' + data.discountPercent + '%:</td><td style="padding:4px 0; text-align:right; color:#fbcfe8;">- ' + formatCurrency(data.discountPercentValue) + ' บาท</td></tr>' +
'          <tr><td colspan="2" style="border-top:1px solid rgba(255,255,255,0.2); padding-top:8px;"></td></tr>' +
'          <tr><td style="padding:8px 0; font-size:16px; font-weight:bold;">ยอดสุทธิ:</td><td style="padding:8px 0; text-align:right; font-size:24px; font-weight:bold; color:#fde68a;">' + formatCurrency(data.netTotal) + ' บาท</td></tr>' +
'        </table>' +
'      </div>' +
'    </div>' +
'    <div style="background:#f9fafb; padding:16px; text-align:center; font-size:12px; color:#9ca3af;">© ' + escapeHtml(PAGE_NAME) + '™</div>' +
'  </div></body></html>';

    MailApp.sendEmail({
      to: NOTIFY_EMAIL, subject: subject, htmlBody: html,
      replyTo: data.customerEmail || undefined,
      name: PAGE_NAME + '™ - แจ้งเตือนคำสั่งซื้อ'
    });
  } catch (err) {
    Logger.log('Email error: ' + err.toString());
  }
}


// ============================================================
// 🎨 HTML Dialog
// ============================================================

function buildApprovalHtml(params) {
  const { orderId, customerFb, customerEmail, subjectInfo, row } = params;

  const byGrade = {};
  subjectInfo.forEach(s => {
    if (!byGrade[s.grade]) byGrade[s.grade] = [];
    byGrade[s.grade].push(s);
  });

  var blocks = '';
  Object.keys(byGrade).sort().forEach(grade => {
    blocks += '<div class="grade-section"><div class="grade-title">📚 ' + escapeHtml(grade) + '</div>';
    byGrade[grade].forEach(s => {
      const idxGlobal = subjectInfo.indexOf(s);

      var warnings = [];
      var canCheck = false;

      if (s.isExtra) {
        // 🆕 Extra (VIP/Report): ไม่ต้อง Drive ขอแค่มีข้อความ
        if (s.hasMessage) {
          canCheck = true;
          // ไม่มี warnings
        } else {
          warnings.push('ยังไม่มีข้อความใน Sheet (กรอกคอลัมน์ G)');
        }
      } else {
        // วิชาปกติ
        if (!s.hasLink) warnings.push('ไม่มีลิงก์ Drive');
        if (!s.hasMessage) warnings.push('ไม่มีข้อความ (ระบบจะใช้ template default)');
        canCheck = s.hasLink; // วิชาปกติต้องมี Drive link ถึงจะเลือกได้
      }

      const status = warnings.length === 0
        ? (s.isExtra ? '<span class="ok">✓ ข้อความพร้อมส่ง <span style="color:#9ca3af;">(ไม่ต้องใช้ Drive)</span></span>' : '<span class="ok">✓ ข้อมูลครบ</span>')
        : '<span class="warn">⚠ ' + warnings.join(', ') + '</span>';

      const hoursLabel = s.hours ? ' (' + s.hours + ' ชม.)' : '';
      const planLabel = s.planCount ? ' • ' + s.planCount + ' แผน' : '';
      const currLabel = s.curriculum && s.curriculum !== '-' ? ' [' + s.curriculum + ']' : '';

      // 🆕 v7.2: แสดงเมลแยกเฉพาะถ้าต่างจากเมลหลัก
      var emailTag = '';
      if (s.isCustomEmail && s.targetEmail) {
        emailTag = '<div class="email-tag">📧 ส่งถึง: <b>' + escapeHtml(s.targetEmail) + '</b></div>';
      }

      blocks += '' +
'<div class="subject-row">' +
'  <label class="subj-label">' +
'    <input type="checkbox" class="subj-cb" data-idx="' + idxGlobal + '" ' + (canCheck ? 'checked' : 'disabled') + '>' +
'    <div class="subj-info">' +
'      <div class="subj-name">' + escapeHtml(s.subject) + escapeHtml(hoursLabel) + escapeHtml(planLabel) + '<span class="curr-tag">' + escapeHtml(currLabel) + '</span></div>' +
'      <div class="subj-status">' + status + '</div>' +
       emailTag +
'    </div>' +
'  </label>' +
'</div>';
    });
    blocks += '</div>';
  });

  return '' +
'<!DOCTYPE html><html><head><base target="_top"><style>' +
'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Sarabun, sans-serif; padding: 0; margin: 0; color: #1f2937; }' +
'.container { padding: 18px; }' +
'.header-info { background: linear-gradient(135deg, #f5f3ff, #fdf4ff); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; border: 1px solid #e9d5ff; }' +
'.info-row { display: flex; gap: 8px; font-size: 13px; padding: 2px 0; }' +
'.info-label { color: #6b7280; width: 90px; flex-shrink: 0; }' +
'.info-value { color: #1f2937; font-weight: 500; word-break: break-all; }' +
'.section-title { font-size: 13px; font-weight: 700; color: #4b5563; margin: 14px 0 8px; }' +
'.grade-section { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }' +
'.grade-title { font-size: 13px; font-weight: 700; color: #6b21a8; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e9d5ff; }' +
'.subject-row { padding: 6px 0; }' +
'.subject-row + .subject-row { border-top: 1px dashed #e5e7eb; }' +
'.subj-label { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }' +
'.subj-label input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; flex-shrink: 0; margin-top: 2px; }' +
'.subj-label input[type="checkbox"]:disabled { cursor: not-allowed; }' +
'.subj-info { flex: 1; min-width: 0; }' +
'.subj-name { font-size: 13px; font-weight: 500; color: #1f2937; }' +
'.curr-tag { color: #9ca3af; font-weight: 400; font-size: 12px; }' +
'.subj-status { font-size: 11px; margin-top: 2px; }' +
'.email-tag { font-size: 11px; margin-top: 4px; color: #4338ca; background: #eef2ff; padding: 3px 8px; border-radius: 6px; display: inline-block; border: 1px solid #c7d2fe; }' +
'.ok { color: #15803d; }' +
'.warn { color: #dc2626; }' +
'.warning { background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #713f12; margin-top: 12px; line-height: 1.5; }' +
'.actions { display: flex; gap: 8px; margin-top: 16px; }' +
'.btn { flex: 1; padding: 10px 14px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }' +
'.btn-confirm { background: linear-gradient(135deg, #6ee7b7, #34d399); color: white; }' +
'.btn-confirm:hover { background: linear-gradient(135deg, #34d399, #10b981); }' +
'.btn-cancel { background: white; color: #6b7280; border: 1px solid #d1d5db; }' +
'.btn:disabled { opacity: 0.5; cursor: not-allowed; }' +
'.status-msg { margin-top: 12px; padding: 10px 12px; border-radius: 8px; font-size: 13px; display: none; line-height: 1.6; }' +
'.status-msg.show { display: block; }' +
'.status-msg.success { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }' +
'.status-msg.error { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }' +
'.status-msg.loading { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }' +
'.spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(30, 64, 175, 0.3); border-top-color: #1e40af; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 6px; }' +
'@keyframes spin { to { transform: rotate(360deg); } }' +
'</style></head><body>' +
'<div class="container">' +
'  <div class="header-info">' +
'    <div class="info-row"><span class="info-label">รหัสคำสั่งซื้อ:</span><span class="info-value">#' + escapeHtml(orderId) + '</span></div>' +
'    <div class="info-row"><span class="info-label">ลูกค้า:</span><span class="info-value">' + escapeHtml(customerFb) + '</span></div>' +
'    <div class="info-row"><span class="info-label">Gmail:</span><span class="info-value">' + escapeHtml(customerEmail) + '</span></div>' +
'  </div>' +
'  <div class="section-title">📦 รายการวิชาที่จะแชร์ Drive (เลือกได้)</div>' +
   blocks +
'  <div class="warning">⚠️ เมื่อกดยืนยัน: ระบบจะแชร์ Drive ของแต่ละวิชาให้ Gmail ลูกค้า และส่งเมลรวมพร้อมข้อความ + บันทึกท้ายแผนของแต่ละวิชา</div>' +
'  <div id="statusMsg" class="status-msg"></div>' +
'  <div class="actions">' +
'    <button id="cancelBtn" class="btn btn-cancel" onclick="google.script.host.close()">ยกเลิก</button>' +
'    <button id="confirmBtn" class="btn btn-confirm" onclick="doApprove()">✅ ยืนยันแชร์ Drive + ส่งเมล</button>' +
'  </div>' +
'</div>' +
'<script>' +
'const SUBJECTS = ' + JSON.stringify(subjectInfo) + ';' +
'function doApprove() {' +
'  const checkboxes = document.querySelectorAll(".subj-cb:checked");' +
'  if (checkboxes.length === 0) { showStatus("กรุณาเลือกอย่างน้อย 1 วิชา", "error"); return; }' +
'  const selected = Array.from(checkboxes).map(cb => SUBJECTS[parseInt(cb.dataset.idx)]);' +
'  const cb = document.getElementById("confirmBtn"); const cn = document.getElementById("cancelBtn");' +
'  cb.disabled = true; cn.disabled = true;' +
'  showStatus(\'<span class="spinner"></span> กำลังแชร์ Drive และส่งเมล...\', "loading");' +
'  google.script.run.withSuccessHandler(handleSuccess).withFailureHandler(handleError)' +
'    .executeApproval(' + row + ', ' + JSON.stringify(customerEmail) + ', ' + JSON.stringify(customerFb) + ', selected);' +
'}' +
'function handleSuccess(result) {' +
'  var msg = "";' +
'  if (result.shared.length > 0) msg += "✅ แชร์สำเร็จ " + result.shared.length + " วิชา<br>";' +
'  if (result.failed.length > 0) {' +
'    msg += "⚠️ ล้มเหลว " + result.failed.length + " วิชา:<br>";' +
'    msg += result.failed.map(f => "• " + f.subject + " " + f.grade + " (" + (f.hours||"-") + " ชม.): " + f.reason).join("<br>");' +
'    msg += "<br>";' +
'  }' +
'  if (result.emailSent) msg += "✅ ส่งเมลรวมให้ลูกค้าเรียบร้อย";' +
'  else if (result.emailError) msg += "❌ ส่งเมลล้มเหลว: " + result.emailError;' +
'  if (result.shared.length > 0 && result.failed.length === 0) {' +
'    showStatus(msg, "success");' +
'    setTimeout(() => google.script.host.close(), 2500);' +
'  } else if (result.shared.length > 0) {' +
'    showStatus(msg, "success");' +
'    document.getElementById("cancelBtn").disabled = false;' +
'  } else {' +
'    showStatus(msg, "error");' +
'    document.getElementById("confirmBtn").disabled = false;' +
'    document.getElementById("cancelBtn").disabled = false;' +
'  }' +
'}' +
'function handleError(err) {' +
'  showStatus("❌ " + err.message, "error");' +
'  document.getElementById("confirmBtn").disabled = false;' +
'  document.getElementById("cancelBtn").disabled = false;' +
'}' +
'function showStatus(html, type) { const el = document.getElementById("statusMsg"); el.innerHTML = html; el.className = "status-msg show " + type; }' +
'</script></body></html>';
}


// ============================================================
// 🔧 Helpers
// ============================================================

function extractFolderId(url) {
  if (!url) return null;
  const str = String(url).trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(str)) return str;
  const folderMatch = str.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  return null;
}

function formatCurrency(value) {
  return (parseFloat(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeHtmlAttr(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function doGet(e) {
  // Default → render Admin Web App
  const html = HtmlService.createHtmlOutputFromFile('admin')
    .setTitle('🎓 ' + PAGE_NAME + ' Admin')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}


// ============================================================
// 🎯 Menu & Triggers
// ============================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // 🔧 Submenu: เครื่องมือขั้นสูง (สำหรับ admin/developer)
  const advancedMenu = ui.createMenu('⚙️ เครื่องมือขั้นสูง')
    .addItem('🔄 อัปเดต Dropdown สถานะให้ทุกแถว', 'refreshAllStatuses')
    .addItem('⚙️ ติดตั้ง Trigger (แก้ Popup ไม่เด้ง)', 'installTriggers')
    .addSeparator()
    .addItem('📅 Backfill วันที่ส่ง (ออเดอร์เก่า)', 'backfillCompletedNotes')
    .addItem('🔍 ตรวจสอบ NOTE ของออเดอร์ที่ส่งแล้ว', 'auditCompletedNotes')
    .addSeparator()
    .addItem('🧪 ทดสอบส่งอีเมลแจ้งเตือน (admin)', 'testEmail')
    .addItem('🧪 ทดสอบส่งเมลส่งแผน (ลูกค้า)', 'testApprovalEmail')
    .addItem('🧪 ทดสอบสร้างออเดอร์', 'testFullFlow')
    .addItem('🧪 ทดสอบ Telegram', 'testTelegram')
    .addSeparator()
    .addItem('🔍 ดู Logs', 'showLogs')
    .addSeparator()
    .addItem('🗑️ ลบคำสั่งซื้อทั้งหมด', 'clearAllOrders');

  ui.createMenu('🎓 ' + PAGE_NAME)
    .addItem('🔄 รีเฟรช Dashboard', 'refreshDashboard')
    .addSeparator()
    .addItem('📊 สร้างรายงาน...', 'showReportDialog')
    .addSeparator()
    .addItem('🔁 ส่งแผนแถวนี้อีกครั้ง', 'resendApprovalForCurrentRow')
    .addItem('📧 เช็คโควต้าเมล', 'checkEmailQuota')
    .addSeparator()
    .addItem('🔗 ตั้งค่า Drive Links', 'openDriveLinksSheet')
    .addItem('📂 ตั้งค่า Example Links', 'openExampleLinksSheet')
    .addItem('💬 ตั้งค่า Telegram Bot', 'setupTelegram')
    .addItem('🆘 หา Chat ID (Telegram)', 'getMyTelegramChatId')
    .addSeparator()
    .addItem('🔍 สร้างมุมมองด่วน (Quick Views)', 'createQuickViews')
    .addSeparator()
    .addSubMenu(advancedMenu)
    .addToUi();
}


/**
 * 📊 Dialog เลือกประเภทรายงาน
 */
function showReportDialog() {
  const ui = SpreadsheetApp.getUi();

  const html = HtmlService.createHtmlOutput(
    '<style>' +
    'body { font-family: -apple-system, "Segoe UI", Sarabun, sans-serif; padding: 16px; margin: 0; }' +
    '.title { font-size: 16px; font-weight: 700; color: #1f2937; margin-bottom: 14px; }' +
    '.btn { display: block; width: 100%; padding: 16px; margin-bottom: 10px; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; text-align: left; font-family: inherit; transition: all 0.2s; }' +
    '.btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }' +
    '.btn-icon { font-size: 22px; margin-right: 10px; }' +
    '.btn-day { background: linear-gradient(135deg, #fef3c7, #fde68a); color: #92400e; }' +
    '.btn-month { background: linear-gradient(135deg, #e0e7ff, #c7d2fe); color: #4338ca; }' +
    '.btn-customer { background: linear-gradient(135deg, #d1fae5, #a7f3d0); color: #065f46; }' +
    '.btn-all { background: linear-gradient(135deg, #fbcfe8, #f9a8d4); color: #9d174d; }' +
    '.subtitle { font-size: 11px; color: #6b7280; margin-top: 4px; }' +
    '.cancel { background: white; color: #6b7280; border: 1px solid #d1d5db; margin-top: 8px; padding: 10px; text-align: center; }' +
    '</style>' +
    '<div class="title">📊 เลือกรายงานที่ต้องการสร้าง</div>' +
    '<button class="btn btn-day" onclick="run(\'daily\')">' +
    '<span class="btn-icon">📅</span><b>รายวัน</b> (เดือนนี้)' +
    '<div class="subtitle">สรุปยอดขายแต่ละวันในเดือนปัจจุบัน</div></button>' +
    '<button class="btn btn-month" onclick="run(\'monthly\')">' +
    '<span class="btn-icon">📊</span><b>รายเดือน</b>' +
    '<div class="subtitle">สร้างชีทแยกตามเดือนพร้อม Top 5 วิชา</div></button>' +
    '<button class="btn btn-customer" onclick="run(\'customer\')">' +
    '<span class="btn-icon">👤</span><b>ประวัติลูกค้า</b>' +
    '<div class="subtitle">รายชื่อลูกค้า + วิชาที่สั่งซื้อทั้งหมด</div></button>' +
    '<button class="btn btn-all" onclick="run(\'all\')">' +
    '<span class="btn-icon">📦</span><b>สร้างทั้งหมด</b>' +
    '<div class="subtitle">รายงาน 3 ชนิดในครั้งเดียว</div></button>' +
    '<button class="btn cancel" onclick="google.script.host.close()">ยกเลิก</button>' +
    '<script>' +
    'function run(type){' +
    '  document.body.innerHTML="<div style=\\"text-align:center;padding:30px;\\"><div style=\\"font-size:32px;\\">⏳</div><div style=\\"margin-top:10px;color:#6b7280;\\">กำลังสร้างรายงาน...</div></div>";' +
    '  google.script.run.withSuccessHandler(()=>{google.script.host.close();}).withFailureHandler(e=>{alert("Error: "+e.message);}).runReportType(type);' +
    '}' +
    '</script>'
  ).setWidth(380).setHeight(440);

  ui.showModalDialog(html, '📊 สร้างรายงาน');
}


/**
 * เรียกจาก showReportDialog
 */
function runReportType(type) {
  if (type === 'daily') generateDailyReport();
  else if (type === 'monthly') generateMonthlyReports();
  else if (type === 'customer') generateCustomerReport();
  else if (type === 'all') {
    generateDailyReport(true);
    generateMonthlyReports(true);
    generateCustomerReport(true);
    SpreadsheetApp.getUi().alert('✅ สร้างรายงานทั้ง 3 ชนิดเรียบร้อย');
  }
}


/**
 * 🆕 ตรวจสอบ NOTE ของออเดอร์ที่ส่งแผนเสร็จสิ้น
 * แสดงรายงานว่ามี NOTE pattern "ส่งโดย ... เมื่อ dd/MM/yyyy" หรือไม่
 */
function auditCompletedNotes() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    ui.alert('ไม่มีข้อมูลคำสั่งซื้อ');
    return;
  }

  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();

  var totalCompleted = 0;
  var withDateNote = 0;
  var withoutDateNote = 0;
  const samplesWithout = [];
  const samplesWith = [];

  data.forEach(r => {
    const status = String(r[COL.STATUS - 1] || '').trim();
    if (status !== STATUSES.COMPLETED) return;
    totalCompleted++;
    const note = String(r[COL.NOTE - 1] || '');
    const dateMatch = parseCompletedDateFromNote(note);
    if (dateMatch) {
      withDateNote++;
      if (samplesWith.length < 3) {
        samplesWith.push(r[COL.ORDER_ID - 1] + ' → ' + dateMatch);
      }
    } else {
      withoutDateNote++;
      if (samplesWithout.length < 5) {
        samplesWithout.push(r[COL.ORDER_ID - 1] +
          ' (NOTE: "' + (note.substring(0, 50) || '(ว่าง)') + '")');
      }
    }
  });

  var msg = '📊 รายงานการตรวจสอบ NOTE:\n\n';
  msg += '✅ มีวันที่ส่งใน NOTE: ' + withDateNote + ' รายการ\n';
  msg += '❌ ไม่มีวันที่ส่งใน NOTE: ' + withoutDateNote + ' รายการ\n';
  msg += '📦 รวม "ส่งแผนเสร็จสิ้น": ' + totalCompleted + ' รายการ\n\n';

  if (samplesWith.length > 0) {
    msg += '✅ ตัวอย่างที่มีข้อมูล (3 รายการแรก):\n';
    samplesWith.forEach(s => msg += '  • ' + s + '\n');
    msg += '\n';
  }

  if (samplesWithout.length > 0) {
    msg += '❌ ตัวอย่างที่ขาดข้อมูล (5 รายการแรก):\n';
    samplesWithout.forEach(s => msg += '  • ' + s + '\n');
    msg += '\n';
    msg += '👉 กดเมนู "📅 ตั้งค่าวันที่ส่งให้ออเดอร์เก่า (Backfill)"\n';
    msg += '    เพื่อใช้วันที่ของออเดอร์เป็นวันที่ส่งให้รายการเก่า';
  }

  ui.alert('🔍 ตรวจสอบ NOTE', msg, ui.ButtonSet.OK);
}


/**
 * 🆕 เติมวันที่ส่งให้ออเดอร์เก่าที่ไม่มี NOTE
 * ใช้ timestamp ของออเดอร์เป็นวันที่ส่ง (ประมาณการ)
 * ✅ ทำเฉพาะออเดอร์ที่ status = "ส่งแผนเสร็จสิ้น" และยังไม่มีวันที่ใน NOTE
 */
function backfillCompletedNotes() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    ui.alert('ไม่มีข้อมูลคำสั่งซื้อ');
    return;
  }

  // ยืนยันก่อน
  const confirm = ui.alert(
    '📅 ตั้งค่าวันที่ส่งย้อนหลัง',
    'ระบบจะเติมข้อความ "ส่งโดย system เมื่อ dd/MM/yyyy" ในคอลัมน์ NOTE\n' +
    'ของออเดอร์ที่:\n' +
    '  1. สถานะ = "ส่งแผนเสร็จสิ้น"\n' +
    '  2. ยังไม่มีวันที่ส่งใน NOTE\n\n' +
    '⚠️ จะใช้วันที่ของออเดอร์ (timestamp) เป็นวันที่ส่ง\n' +
    '⚠️ การกระทำนี้จะแก้ไขชีตจริง — ดำเนินการต่อ?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();

  var updated = 0;
  var skippedAlreadyHas = 0;
  var skippedNotCompleted = 0;

  for (var i = 0; i < data.length; i++) {
    const r = data[i];
    const status = String(r[COL.STATUS - 1] || '').trim();
    const sheetRow = i + 2;

    if (status !== STATUSES.COMPLETED) {
      skippedNotCompleted++;
      continue;
    }

    const existingNote = String(r[COL.NOTE - 1] || '');
    if (parseCompletedDateFromNote(existingNote)) {
      skippedAlreadyHas++;
      continue;
    }

    // ใช้ timestamp ของออเดอร์เป็นวันที่ส่ง
    const orderDateStr = formatOrderDateOnly(r[0]);
    if (!orderDateStr) continue;

    const stamp = 'ส่งโดย system เมื่อ ' + orderDateStr + ' 00:00';
    const newNote = existingNote ? existingNote + ' | ' + stamp : stamp;
    sheet.getRange(sheetRow, COL.NOTE).setValue(newNote);
    updated++;
  }

  ui.alert(
    '✅ เสร็จสิ้น',
    'อัปเดตสำเร็จ: ' + updated + ' รายการ\n' +
    'ข้ามเพราะมีวันที่อยู่แล้ว: ' + skippedAlreadyHas + ' รายการ\n' +
    'ข้ามเพราะยังไม่ส่งแผนเสร็จสิ้น: ' + skippedNotCompleted + ' รายการ\n\n' +
    'ตอนนี้พนักงาน (pinky) เห็น tab "ส่งแล้ว (วันนี้)" จะกรองตามวันที่จริงแล้วค่ะ',
    ui.ButtonSet.OK
  );
}


/**
 * 🆕 เปิด Popup อนุมัติส่งแผนสำหรับแถวที่ cursor อยู่ (ใช้กรณี popup ไม่เด้งเอง)
 */
function resendApprovalForCurrentRow() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  if (sheet.getName() !== SHEET_NAME) {
    ui.alert('⚠️ กรุณาเปิดในแท็บ Orders',
      'คลิกที่แถวออเดอร์ใน Sheet "Orders" ที่ต้องการส่ง แล้วกดเมนูนี้อีกครั้ง',
      ui.ButtonSet.OK);
    return;
  }

  const row = sheet.getActiveCell().getRow();
  if (row < 2) {
    ui.alert('⚠️ คลิกที่แถวออเดอร์ก่อน',
      'กรุณาคลิกเซลล์ใดก็ได้ในแถวออเดอร์ที่ต้องการส่ง แล้วกดเมนูนี้อีกครั้ง',
      ui.ButtonSet.OK);
    return;
  }

  // ตรวจว่ามีข้อมูลในแถวนี้
  const orderId = sheet.getRange(row, COL.ORDER_ID).getValue();
  if (!orderId) {
    ui.alert('⚠️ แถวนี้ไม่มีออเดอร์', 'แถวที่เลือกไม่มีรหัสคำสั่งซื้อ', ui.ButtonSet.OK);
    return;
  }

  showApprovalDialog(sheet, row);
}


/**
 * 🆕 แสดง Logs ในรูปแบบ Modal เพื่อวินิจฉัยปัญหา
 */
/**
 * 📧 เช็คโควต้าเมลที่เหลือวันนี้
 */
// ============================================================
// 💬 Telegram Bot (ส่งข้อความแจ้งเตือนผ่าน Telegram — ฟรีไม่จำกัด)
// ============================================================

/**
 * ส่งข้อความผ่าน Telegram Bot
 * @param {string} message - ข้อความ (รองรับ HTML tags เช่น <b>...</b>)
 * @return {boolean}
 */
function sendTelegramNotify(message) {
  const config = getTelegramConfig();
  if (!config.token || !config.chatId) {
    Logger.log('⚠️ Telegram: ไม่ได้ตั้งค่า Token หรือ Chat ID');
    return false;
  }

  try {
    const url = 'https://api.telegram.org/bot' + config.token + '/sendMessage';
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      }),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code === 200) {
      Logger.log('✅ Telegram sent');
      return true;
    } else {
      Logger.log('❌ Telegram failed: ' + code + ' ' + res.getContentText());
      return false;
    }
  } catch (err) {
    Logger.log('Telegram error: ' + err.toString());
    return false;
  }
}


/**
 * ดึง Telegram config (token + chat_id)
 */
function getTelegramConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    token: props.getProperty('TELEGRAM_BOT_TOKEN') || CONFIG.TELEGRAM_BOT_TOKEN || '',
    chatId: props.getProperty('TELEGRAM_CHAT_ID') || CONFIG.TELEGRAM_CHAT_ID || ''
  };
}


// ============================================================
// 🔍 Quick Views (มุมมองด่วน) — สร้างชีทที่ใช้ QUERY formula
// ============================================================

/**
 * สร้างชีท "🔍 มุมมองด่วน" ที่มีหลาย QUERY ทำงานแบบ real-time
 * ลูกค้าและออเดอร์อัปเดตอัตโนมัติเมื่อข้อมูลใน Orders sheet เปลี่ยน
 */
function createQuickViews() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { ui.alert('ไม่พบชีท Orders'); return; }

  const sheetName = '🔍 มุมมองด่วน';
  var existing = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);
  const s = ss.insertSheet(sheetName);

  // 'Orders' sheet ref
  const ordersRef = "'" + SHEET_NAME + "'!A:N";

  const tz = 'Asia/Bangkok';
  const today = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
  const thisMonth = Utilities.formatDate(new Date(), tz, 'MM/yyyy');

  var row = 1;

  // ============ Header หลัก ============
  s.getRange(row, 1, 1, 11).merge()
    .setValue('🔍 มุมมองด่วน — ดูง่าย ไม่ต้อง filter เอง')
    .setFontSize(16).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#818cf8').setHorizontalAlignment('center');
  s.setRowHeight(row, 44);
  row++;

  s.getRange(row, 1, 1, 11).merge()
    .setValue('📌 ข้อมูลอัปเดตอัตโนมัติจากชีต Orders — ห้ามแก้ไขในนี้โดยตรง')
    .setFontSize(10).setFontColor('#6b7280').setBackground('#fef9c3')
    .setHorizontalAlignment('center').setFontStyle('italic');
  row += 2;

  // ============ 📅 ออเดอร์วันนี้ ============
  s.getRange(row, 1, 1, 11).merge()
    .setValue('📅 ออเดอร์วันนี้ (' + today + ')')
    .setFontSize(13).setFontWeight('bold').setBackground('#fef3c7').setFontColor('#92400e');
  s.setRowHeight(row, 32);
  row++;

  const todayHeaders = ['เวลา', 'รหัส', 'ชื่อ FB', 'Gmail', 'จำนวน', 'ยอดสุทธิ', 'สถานะ'];
  s.getRange(row, 1, 1, 7).setValues([todayHeaders])
    .setFontWeight('bold').setBackground('#fbbf24').setFontColor('#ffffff').setHorizontalAlignment('center');
  row++;

  // QUERY: วันนี้ (filter โดยใช้ TEXT ของ col A เทียบกับวันที่)
  const todayQuery = '=IFERROR(QUERY(' + ordersRef + ',"select A,B,C,D,E,K,L where ' +
    'A is not null and A starts with \'' + today + '\' order by A desc",0),"— ยังไม่มีออเดอร์วันนี้ —")';
  s.getRange(row, 1).setFormula(todayQuery);
  row += 18; // เผื่อสำหรับวันที่มีออเดอร์หลายรายการ

  // ============ ⏳ รอชำระเงิน ============
  s.getRange(row, 1, 1, 11).merge()
    .setValue('⏳ รอชำระเงิน (ต้องตามลูกค้า!)')
    .setFontSize(13).setFontWeight('bold').setBackground('#fef9c3').setFontColor('#a16207');
  s.setRowHeight(row, 32);
  row++;

  s.getRange(row, 1, 1, 7).setValues([todayHeaders])
    .setFontWeight('bold').setBackground('#facc15').setFontColor('#ffffff').setHorizontalAlignment('center');
  row++;

  const pendingQuery = '=IFERROR(QUERY(' + ordersRef + ',"select A,B,C,D,E,K,L where ' +
    'L = \'' + STATUSES.PENDING + '\' order by A desc",0),"— ไม่มีออเดอร์รอชำระ —")';
  s.getRange(row, 1).setFormula(pendingQuery);
  row += 22;

  // ============ 💵 ชำระแล้ว (รอส่งแผน) ============
  s.getRange(row, 1, 1, 11).merge()
    .setValue('💵 ชำระแล้ว — รอส่งแผน!')
    .setFontSize(13).setFontWeight('bold').setBackground('#dbeafe').setFontColor('#1e40af');
  s.setRowHeight(row, 32);
  row++;

  s.getRange(row, 1, 1, 7).setValues([todayHeaders])
    .setFontWeight('bold').setBackground('#60a5fa').setFontColor('#ffffff').setHorizontalAlignment('center');
  row++;

  const paidQuery = '=IFERROR(QUERY(' + ordersRef + ',"select A,B,C,D,E,K,L where ' +
    'L = \'' + STATUSES.PAID + '\' order by A desc",0),"— ไม่มีออเดอร์รอส่งแผน —")';
  s.getRange(row, 1).setFormula(paidQuery);
  row += 22;

  // ============ 🔄 ลูกค้าซื้อซ้ำ (Top 20) ============
  s.getRange(row, 1, 1, 11).merge()
    .setValue('🔄 ลูกค้าซื้อซ้ำ (เรียงตามจำนวนครั้ง)')
    .setFontSize(13).setFontWeight('bold').setBackground('#d1fae5').setFontColor('#065f46');
  s.setRowHeight(row, 32);
  row++;

  s.getRange(row, 1, 1, 4).setValues([['ชื่อ FB', 'Gmail', 'จำนวนครั้ง', 'ยอดรวม (บาท)']])
    .setFontWeight('bold').setBackground('#34d399').setFontColor('#ffffff').setHorizontalAlignment('center');
  row++;

  // นับ + รวมยอด group by email
  const repeatQuery = '=IFERROR(QUERY(' + ordersRef + ',"select C,D,count(B),sum(K) where ' +
    'D is not null and L <> \'ยกเลิก\' group by C,D having count(B) > 1 order by count(B) desc label count(B) \'\', sum(K) \'\'",0),"— ไม่พบลูกค้าซื้อซ้ำ —")';
  s.getRange(row, 1).setFormula(repeatQuery);
  row += 25;

  // ============ 📆 เดือนนี้ ============
  s.getRange(row, 1, 1, 11).merge()
    .setValue('📆 ออเดอร์เดือนนี้ (' + thisMonth + ')')
    .setFontSize(13).setFontWeight('bold').setBackground('#ede9fe').setFontColor('#6b21a8');
  s.setRowHeight(row, 32);
  row++;

  s.getRange(row, 1, 1, 7).setValues([todayHeaders])
    .setFontWeight('bold').setBackground('#a78bfa').setFontColor('#ffffff').setHorizontalAlignment('center');
  row++;

  // เดือนนี้ — filter จาก col A ที่มี "/MM/YYYY"
  const monthQuery = '=IFERROR(QUERY(' + ordersRef + ',"select A,B,C,D,E,K,L where ' +
    'A contains \'/' + thisMonth + '\' order by A desc",0),"— ไม่มีออเดอร์เดือนนี้ —")';
  s.getRange(row, 1).setFormula(monthQuery);

  // Column widths
  s.setColumnWidth(1, 140);
  s.setColumnWidth(2, 160);
  s.setColumnWidth(3, 160);
  s.setColumnWidth(4, 200);
  s.setColumnWidth(5, 70);
  s.setColumnWidth(6, 100);
  s.setColumnWidth(7, 130);

  s.setHiddenGridlines(true);

  // เปิดชีตนี้
  ss.setActiveSheet(s);

  ui.alert('✅ สร้าง "มุมมองด่วน" เรียบร้อย!\n\n' +
    'มี 5 มุมมอง:\n' +
    '  • 📅 ออเดอร์วันนี้\n' +
    '  • ⏳ รอชำระเงิน\n' +
    '  • 💵 รอส่งแผน\n' +
    '  • 🔄 ลูกค้าซื้อซ้ำ\n' +
    '  • 📆 เดือนนี้\n\n' +
    '📌 ข้อมูลอัปเดตอัตโนมัติ ไม่ต้อง refresh\n' +
    '⚠️ ถ้าวันเปลี่ยน ให้กดเมนูนี้อีกครั้งเพื่ออัปเดตวันที่');
}


/**
 * 💬 เมนู: ตั้งค่า Telegram Bot
 */
function setupTelegram() {
  const ui = SpreadsheetApp.getUi();
  const current = getTelegramConfig();
  const tokenMasked = current.token ? current.token.substring(0, 10) + '...' + current.token.substring(current.token.length - 4) : '(ยังไม่ได้ตั้ง)';
  const chatMasked = current.chatId || '(ยังไม่ได้ตั้ง)';

  // ขั้นตอน 1: ขอ Bot Token
  const tokenResult = ui.prompt(
    '💬 ตั้งค่า Telegram (1/2): Bot Token',
    '📱 ขั้นตอนใน Telegram app:\n' +
    '1. เปิด Telegram → ค้นหา @BotFather\n' +
    '2. พิมพ์ /newbot → ตั้งชื่อ bot (เช่น "ครูพร้อมสอน Bot")\n' +
    '3. ตั้ง username (ต้องลงท้ายด้วย _bot เช่น kruprompt_alerts_bot)\n' +
    '4. BotFather จะให้ Bot Token ยาวๆ — คัดลอกมา\n\n' +
    'Token ปัจจุบัน: ' + tokenMasked + '\n\n' +
    'วาง Bot Token:',
    ui.ButtonSet.OK_CANCEL
  );
  if (tokenResult.getSelectedButton() !== ui.Button.OK) return;
  var token = tokenResult.getResponseText().trim();
  if (!token) token = current.token;
  if (!token) { ui.alert('❌ ยกเลิก — ไม่มี Token'); return; }

  // บันทึก token ก่อน
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_BOT_TOKEN', token);

  // ขั้นตอน 2: ขอ Chat ID
  const chatResult = ui.prompt(
    '💬 ตั้งค่า Telegram (2/2): Chat ID',
    '🔍 วิธีหา Chat ID ที่ง่ายที่สุด:\n\n' +
    '1. เปิด Telegram → ค้น bot ของคุณ\n' +
    '   (ตามชื่อ username ที่ตั้งไว้)\n' +
    '2. กด Start → พิมพ์ "hello" ส่งไปหา bot\n' +
    '3. กดปุ่ม Cancel ด้านล่าง\n' +
    '4. กดเมนู "🆘 หา Chat ID อัตโนมัติ"\n' +
    '   ระบบจะหาให้และบันทึกอัตโนมัติ\n\n' +
    'หรือถ้ารู้ Chat ID อยู่แล้ว วางได้เลย:\n\n' +
    'Chat ID ปัจจุบัน: ' + chatMasked,
    ui.ButtonSet.OK_CANCEL
  );
  if (chatResult.getSelectedButton() !== ui.Button.OK) {
    ui.alert('💡 ขั้นตอนต่อไป', 'บันทึก Token แล้ว!\nกดเมนู "🆘 หา Chat ID อัตโนมัติ" เพื่อหา Chat ID', ui.ButtonSet.OK);
    return;
  }
  var chatId = chatResult.getResponseText().trim();
  if (!chatId) {
    ui.alert('💡 ขั้นตอนต่อไป', 'บันทึก Token แล้ว!\nกดเมนู "🆘 หา Chat ID อัตโนมัติ" เพื่อหา Chat ID', ui.ButtonSet.OK);
    return;
  }

  PropertiesService.getScriptProperties().setProperty('TELEGRAM_CHAT_ID', chatId);

  // ทดสอบส่ง
  const sent = sendTelegramNotify(
    '✅ <b>ทดสอบ Telegram Bot</b>\n' +
    'ระบบ ครูพร้อมสอน™ พร้อมแจ้งเตือนแล้ว!\n\n' +
    'จะแจ้งเมื่อ:\n' +
    '🛒 มีออเดอร์ใหม่\n' +
    '💵 ลูกค้าโอนเงิน\n\n' +
    '⏰ ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm')
  );

  if (sent) {
    ui.alert('✅ ตั้งค่าสำเร็จ!', 'เช็คใน Telegram — ควรได้รับข้อความทดสอบแล้ว', ui.ButtonSet.OK);
  } else {
    ui.alert('⚠️ ตั้งค่าแล้ว แต่ส่งทดสอบไม่ผ่าน', 'ลองเช็ค Token + Chat ID อีกครั้ง\nหรือใช้เมนู "🆘 หา Chat ID อัตโนมัติ"', ui.ButtonSet.OK);
  }
}


/**
 * 🆘 หา Chat ID อัตโนมัติ
 */
function getMyTelegramChatId() {
  const ui = SpreadsheetApp.getUi();
  const config = getTelegramConfig();
  if (!config.token) {
    ui.alert('⚠️ ยังไม่ได้ตั้ง Bot Token', 'กดเมนู "💬 ตั้งค่า Telegram" ก่อน', ui.ButtonSet.OK);
    return;
  }

  try {
    const url = 'https://api.telegram.org/bot' + config.token + '/getUpdates';
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());

    if (!json.ok) {
      ui.alert('❌ Bot Token ไม่ถูกต้อง', json.description || 'ตรวจสอบ Token อีกครั้ง', ui.ButtonSet.OK);
      return;
    }

    if (!json.result || json.result.length === 0) {
      ui.alert(
        '⚠️ ไม่พบข้อความ',
        '👉 ขั้นตอน:\n' +
        '1. ไปที่ Telegram\n' +
        '2. ค้น bot ของคุณ (ตาม username)\n' +
        '3. กด Start แล้วพิมพ์อะไรก็ได้ส่งไปหา\n' +
        '4. กลับมากดเมนูนี้อีกครั้ง',
        ui.ButtonSet.OK
      );
      return;
    }

    // หา chat IDs ที่ unique
    const chatIds = {};
    json.result.forEach(u => {
      if (u.message && u.message.chat) {
        const id = u.message.chat.id;
        const name = (u.message.chat.first_name || '') + ' ' + (u.message.chat.last_name || '');
        chatIds[id] = name.trim() || u.message.chat.username || '(ไม่มีชื่อ)';
      }
    });

    const ids = Object.keys(chatIds);
    if (ids.length === 1) {
      // บันทึกอัตโนมัติ
      PropertiesService.getScriptProperties().setProperty('TELEGRAM_CHAT_ID', ids[0]);
      const sent = sendTelegramNotify('✅ <b>บันทึก Chat ID เรียบร้อย!</b>\nระบบพร้อมส่งแจ้งเตือนแล้ว 🎉');
      ui.alert('✅ บันทึก Chat ID อัตโนมัติ',
        'Chat ID: ' + ids[0] + '\nผู้รับ: ' + chatIds[ids[0]] + '\n\n' +
        (sent ? '✅ ส่งข้อความทดสอบแล้ว — เช็คใน Telegram' : '⚠️ บันทึกแล้ว แต่ส่งทดสอบไม่ผ่าน'),
        ui.ButtonSet.OK);
    } else {
      const list = ids.map(id => '  • ' + id + ' → ' + chatIds[id]).join('\n');
      ui.alert('📋 พบ Chat IDs หลายอัน',
        'กรุณาเลือก Chat ID ที่ต้องการ:\n\n' + list +
        '\n\nไปที่เมนู "💬 ตั้งค่า Telegram" แล้วใส่ Chat ID ที่เลือก',
        ui.ButtonSet.OK);
    }
  } catch (err) {
    ui.alert('❌ Error', err.toString(), ui.ButtonSet.OK);
  }
}


/**
 * 🧪 ทดสอบ Telegram
 */
function testTelegram() {
  const ui = SpreadsheetApp.getUi();
  const config = getTelegramConfig();
  if (!config.token || !config.chatId) {
    ui.alert('⚠️ ยังไม่ได้ตั้งค่า', 'กดเมนู "💬 ตั้งค่า Telegram" ก่อน', ui.ButtonSet.OK);
    return;
  }
  const sent = sendTelegramNotify(
    '🧪 <b>ทดสอบส่งข้อความ</b>\n' +
    'เวลา: ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss')
  );
  ui.alert(sent ? '✅ ส่งสำเร็จ! เช็คใน Telegram' : '❌ ส่งล้มเหลว — ดู Log');
}


/**
 * 🔧 ทดสอบ Telegram จาก Apps Script Editor (ไม่ใช้ UI)
 * ⚠️ ฟังก์ชันนี้ใช้สำหรับขอสิทธิ์ UrlFetchApp ครั้งแรก
 * รันใน Editor → ดู Log → ใน Telegram ควรได้รับข้อความ
 */
function testTelegramFromEditor() {
  const config = getTelegramConfig();
  if (!config.token || !config.chatId) {
    Logger.log('⚠️ ยังไม่ได้ตั้งค่า Token หรือ Chat ID');
    Logger.log('Token: ' + (config.token ? 'OK' : '❌ ว่าง'));
    Logger.log('Chat ID: ' + (config.chatId ? 'OK' : '❌ ว่าง'));
    Logger.log('👉 ไปที่ Google Sheet → เมนู "💬 ตั้งค่า Telegram Bot" ก่อน');
    return;
  }

  const sent = sendTelegramNotify(
    '🔧 <b>ทดสอบจาก Editor</b>\n' +
    'เวลา: ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss')
  );
  Logger.log(sent ? '✅ ส่งสำเร็จ! เช็คใน Telegram' : '❌ ส่งล้มเหลว');
}


function checkEmailQuota() {
  const ui = SpreadsheetApp.getUi();
  const quota = MailApp.getRemainingDailyQuota();
  const level = quota === 0 ? '🔴 หมดแล้ว!' : (quota < 10 ? '🟡 เหลือน้อย' : '🟢 ปกติ');

  ui.alert('📧 สถานะโควต้าเมล',
    level + '\n\n' +
    '📧 โควต้าที่เหลือวันนี้: ' + quota + ' ฉบับ\n\n' +
    '📌 บัญชี Gmail ฟรี = 100 ฉบับ/วัน\n' +
    '📌 Google Workspace = 1,500 ฉบับ/วัน\n\n' +
    (quota === 0
      ? '⚠️ โควต้าจะรีเซ็ตตอนเที่ยงคืน (Pacific Time = ประมาณ 14:00-15:00 ไทย)\n' +
        '💡 ระหว่างนี้แชร์ Drive ยังทำได้ปกติ แต่เมลจะยังส่งไม่ได้\n' +
        '💡 ส่งลิงก์ Drive ให้ลูกค้าทาง Facebook Messenger แทนได้'
      : '✅ ยังส่งเมลได้อีก ' + quota + ' ฉบับ'),
    ui.ButtonSet.OK
  );
}


function showLogs() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('🔍 วิธีดู Logs',
    'ขั้นตอน:\n' +
    '1. กลับไปที่ Apps Script Editor (เมนู Extensions → Apps Script)\n' +
    '2. ทางซ้ายกดไอคอน "Executions" (รูปวงกลมขีด)\n' +
    '3. คลิก execution ล่าสุด → ดูรายละเอียด Log\n\n' +
    'หรือเปิดเมนู View → Logs ใน Apps Script Editor',
    ui.ButtonSet.OK);
}


function openDriveLinksSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DRIVE_LINKS_SHEET);
  if (!sheet) sheet = setupDriveLinksSheet(ss);
  ss.setActiveSheet(sheet);
}


function openExampleLinksSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EXAMPLE_LINKS_SHEET);
  if (!sheet) {
    // ตรวจว่ามี Drive Links sheet ก่อน
    if (!ss.getSheetByName(DRIVE_LINKS_SHEET)) {
      SpreadsheetApp.getUi().alert(
        '⚠️ กรุณาสร้าง Drive Links ก่อน',
        'ระบบ Example Links ดึงข้อมูลจาก "🔗 Drive Links"\nกรุณาตั้งค่า Drive Links ก่อน',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }
    sheet = setupExampleLinksSheet(ss);
  }
  ss.setActiveSheet(sheet);
}


function installTriggers() {
  // ลบ trigger เก่าทั้งหมดก่อน (ทั้ง onEdit และ onChange ที่เคยติดตั้งไว้)
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === 'onChange' || fn === 'onEdit' || fn === 'onEditInstallable') {
      ScriptApp.deleteTrigger(t);
    }
  });

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ติดตั้ง onEdit แบบ installable เพื่อให้เปิด Popup ได้
  ScriptApp.newTrigger('onEditInstallable').forSpreadsheet(ss).onEdit().create();

  // ติดตั้ง onChange เพื่อจับการลบแถว
  ScriptApp.newTrigger('onChange').forSpreadsheet(ss).onChange().create();

  SpreadsheetApp.getUi().alert('✅ ติดตั้งสำเร็จ',
    'ตอนนี้ Popup อนุมัติจะเปิดได้แล้ว และ Dashboard จะอัปเดตอัตโนมัติเมื่อมีการแก้ไข/ลบข้อมูล',
    SpreadsheetApp.getUi().ButtonSet.OK);
}


/**
 * 🆕 Installable onEdit - ทำงานแทน simple onEdit เมื่อมี trigger ติดตั้งไว้
 * จำเป็นต้องใช้เพราะ simple onEdit ไม่มีสิทธิ์เปิด showModalDialog
 */
function onEditInstallable(e) {
  onEdit(e);
}


// ============================================================
// 🧪 Test Functions
// ============================================================

function testEmail() {
  const testData = {
    orderId: 'KPS-TEST-EMAIL', customerFb: 'ทดสอบ ระบบ',
    customerEmail: 'test@example.com',
    items: '1. ภาษาไทย ป.1 (ป.1 (68), 200 ชม.) - 350 บาท',
    itemCount: 1, subtotal: 350, discountPercent: 0,
    discountPercentValue: 0, discountBaht: 0, netTotal: 350
  };
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
  sendNotificationEmail(testData, timestamp);
  Logger.log('Test email sent. Check ' + NOTIFY_EMAIL);
}

function testApprovalEmail() {
  const sample = [Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss'),
    'KPS-TEST-APPROVE', 'ทดสอบ ระบบ', NOTIFY_EMAIL,
    2, '', 700, 0, 0, 0, 700, STATUSES.APPROVED, ''];

  const sharedSubjects = [
    {
      grade: 'ป.6', curriculum: '68', subject: 'ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ',
      hours: 100, planCount: 72,
      link: 'https://drive.google.com/drive/folders/EXAMPLE1',
      message: '📘 แผนการสอน "ศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ ป.6" ตามหลักสูตรใหม่ 2568\n👉 จำนวน 100 ชั่วโมง / 72 แผน\n   📥 ดาวน์โหลดได้ที่:\n{LINK}',
      postNote: '✅ มีบันทึกหลังการสอนรายแผนครบทุกชั่วโมง\n📌 สามารถปรับเวลาตามบริบทห้องเรียนได้',
      folderName: 'ศิลปะ ป.6'
    },
    {
      grade: 'ป.6', curriculum: '68', subject: 'สุขภาพกายและสุขภาวะจิต',
      hours: 80, planCount: 60,
      link: 'https://drive.google.com/drive/folders/EXAMPLE2',
      message: '📘 แผนการสอน "สุขภาพกายและสุขภาวะจิต ป.6" ตามหลักสูตรใหม่ 2568\n👉 จำนวน 80 ชั่วโมง / 60 แผน\n   📥 ดาวน์โหลดได้ที่:\n{LINK}',
      postNote: '',
      folderName: 'สุขภาวะ ป.6'
    }
  ];
  sendCombinedApprovalEmail(sample, NOTIFY_EMAIL, 'ทดสอบ ระบบ', sharedSubjects);
  Logger.log('Test approval email sent to ' + NOTIFY_EMAIL);
}


/**
 * 🧪 ทดสอบส่งเมลยืนยันสั่งซื้อ (ส่งให้ตัวเอง = NOTIFY_EMAIL)
 */
function testCustomerConfirmation() {
  const testData = {
    orderId: 'KPS-TEST-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmm'),
    customerFb: 'ครูทดสอบ',
    customerEmail: NOTIFY_EMAIL,
    itemCount: 3,
    items: '1. ภาษาไทย ป.4 (หลักสูตร 68) 160 ชม. - 350 บาท\n2. คณิตศาสตร์ ป.4 (หลักสูตร 68) 160 ชม. - 350 บาท\n3. สมัครกลุ่ม VIP ป.4-6 - 100 บาท',
    rawItems: JSON.stringify([
      { id: 'item-1', subject: 'ภาษาไทย', grade: 'p4_68', hours: 160, price: 350 },
      { id: 'item-2', subject: 'คณิตศาสตร์', grade: 'p4_68', hours: 160, price: 350 },
      { id: 'vip-46-item', subject: 'สมัครกลุ่ม VIP ป.4-6', grade: 'VIP', hours: 0, price: 100 }
    ]),
    subtotal: 800,
    discountPercent: 5,
    discountPercentValue: 35,
    discountBaht: 0,
    netTotal: 765
  };
  sendCustomerOrderConfirmation(testData);
  SpreadsheetApp.getUi().alert(
    '✅ ส่งเมลทดสอบแล้ว',
    'ส่งไปที่: ' + NOTIFY_EMAIL + '\n\nเช็คอีเมลของคุณค่ะ',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}


// ============================================================
// 📊 รายงานรายเดือน
// ============================================================

/**
 * ชื่อเดือนไทย
 */
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];


/**
 * สร้างรายงานรายเดือน — แยกชีทใหม่สำหรับทุกเดือนที่มีข้อมูล
 * เรียกจากเมนู: 📊 สร้างรายงานรายเดือน
 */
function generateMonthlyReports(silent) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 2) {
    if (!silent) ui.alert('ไม่มีข้อมูลคำสั่งซื้อ');
    return;
  }

  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
  const tz = 'Asia/Bangkok';

  // 1. จัดกลุ่มตามเดือน
  const monthGroups = {}; // key: "yyyy-MM" → { label, orders[] }

  data.forEach(row => {
    if (!row[0] && !row[1]) return;
    const ts = row[0];
    var yStr, mStr;
    if (ts instanceof Date) {
      yStr = Utilities.formatDate(ts, tz, 'yyyy');
      mStr = Utilities.formatDate(ts, tz, 'MM');
    } else if (typeof ts === 'string' && ts.length >= 10) {
      const parts = ts.split(' ')[0].split('/');
      if (parts.length !== 3) return;
      yStr = parts[2];
      mStr = parts[1];
    } else return;

    const key = yStr + '-' + mStr;
    if (!monthGroups[key]) {
      const monthIdx = parseInt(mStr) - 1;
      const buddhistYear = parseInt(yStr) + 543;
      monthGroups[key] = {
        label: THAI_MONTHS[monthIdx] + ' ' + buddhistYear,
        shortLabel: mStr + '-' + buddhistYear,
        orders: []
      };
    }
    monthGroups[key].orders.push(row);
  });

  const months = Object.keys(monthGroups).sort();
  if (months.length === 0) {
    if (!silent) ui.alert('ไม่พบข้อมูลคำสั่งซื้อที่มีวันที่');
    return;
  }

  // ยืนยัน (เฉพาะตอนเรียกตรง ไม่ใช่ silent)
  if (!silent) {
    const confirm = ui.alert(
      '📊 สร้างรายงานรายเดือน',
      'ระบบจะสร้าง ' + months.length + ' ชีท:\n' +
      months.map(k => '  • 📋 ' + monthGroups[k].label +
        ' (' + monthGroups[k].orders.length + ' รายการ)').join('\n') +
      '\n\n(ชีทเดิมที่ชื่อซ้ำจะถูกแทนที่)\n\nดำเนินการ?',
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  // 2. สร้างชีทสำหรับแต่ละเดือน
  var created = 0;
  months.forEach(key => {
    const g = monthGroups[key];
    createMonthlySheet(ss, g.label, g.orders);
    created++;
  });

  if (!silent) {
    ui.alert('✅ เสร็จสิ้น',
      'สร้างรายงานรายเดือนสำเร็จ ' + created + ' ชีท\n' +
      'ดูที่แท็บด้านล่างของ Spreadsheet',
      ui.ButtonSet.OK);
  }
}


/**
 * สร้างชีทรายงาน 1 เดือน
 * @param {Spreadsheet} ss
 * @param {string} monthLabel - เช่น "พฤษภาคม 2569"
 * @param {Array[]} orders - array of row data (14 cols)
 */
function createMonthlySheet(ss, monthLabel, orders) {
  const sheetName = '📋 ' + monthLabel;

  // ลบชีทเก่าถ้ามี
  var existing = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);

  const s = ss.insertSheet(sheetName);

  // ============ Header ============
  var row = 1;
  s.getRange(row, 1, 1, 10).merge()
    .setValue('📋 รายงานคำสั่งซื้อ — ' + monthLabel)
    .setFontSize(16).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#818cf8').setHorizontalAlignment('center').setVerticalAlignment('middle');
  s.setRowHeight(row, 44);
  row++;

  const genTime = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
  s.getRange(row, 1, 1, 10).merge()
    .setValue('สร้างเมื่อ: ' + genTime + '  |  จำนวน: ' + orders.length + ' รายการ')
    .setFontSize(10).setFontColor('#6b7280').setBackground('#f9fafb')
    .setHorizontalAlignment('center').setFontStyle('italic');
  s.setRowHeight(row, 24);
  row += 2;

  // ============ สรุปยอดเดือนนี้ (KPI) ============
  var paidTotal = 0, paidCount = 0;
  var pendingTotal = 0, pendingCount = 0;
  var completedTotal = 0, completedCount = 0;
  var cancelledTotal = 0, cancelledCount = 0;
  var allTotal = 0;

  orders.forEach(r => {
    const net = Number(r[COL.NET_TOTAL - 1]) || 0;
    const status = String(r[COL.STATUS - 1] || '').trim();
    allTotal += net;
    if (status === STATUSES.PENDING) { pendingCount++; pendingTotal += net; }
    else if (status === STATUSES.PAID || status === STATUSES.APPROVED) { paidCount++; paidTotal += net; }
    else if (status === STATUSES.COMPLETED) { completedCount++; completedTotal += net; }
    else if (status === 'ยกเลิก') { cancelledCount++; cancelledTotal += net; }
  });

  const revenueTotal = paidTotal + completedTotal; // ยอดขายที่ชำระแล้ว

  // KPI boxes
  const kpis = [
    { label: '💰 ยอดขาย', value: '฿' + formatNumber(revenueTotal), bg: '#f0fdf4', fg: '#15803d' },
    { label: '🛒 ทั้งหมด', value: orders.length + ' รายการ', bg: '#eef2ff', fg: '#4338ca' },
    { label: '✅ ส่งแล้ว', value: completedCount + ' รายการ', bg: '#dcfce7', fg: '#15803d' },
    { label: '⏳ รอ/ชำระ', value: (pendingCount + paidCount) + ' รายการ', bg: '#fef9c3', fg: '#a16207' },
    { label: '❌ ยกเลิก', value: cancelledCount + ' รายการ', bg: '#fee2e2', fg: '#b91c1c' }
  ];

  for (var i = 0; i < kpis.length; i++) {
    const k = kpis[i];
    const col = i * 2 + 1;
    s.getRange(row, col, 1, 2).merge().setValue(k.label)
      .setFontSize(11).setFontWeight('bold').setFontColor(k.fg)
      .setBackground(k.bg).setHorizontalAlignment('center').setVerticalAlignment('middle');
    s.getRange(row + 1, col, 1, 2).merge().setValue(k.value)
      .setFontSize(16).setFontWeight('bold').setFontColor(k.fg)
      .setBackground(k.bg).setHorizontalAlignment('center').setVerticalAlignment('middle');
  }
  s.setRowHeight(row, 28);
  s.setRowHeight(row + 1, 40);
  row += 3;

  // ============ ตารางรายละเอียด ============
  const headers = ['#', 'วันที่/เวลา', 'รหัสคำสั่งซื้อ', 'ชื่อ Facebook', 'Gmail',
    'จำนวน', 'รายการสินค้า', 'ยอดรวม', 'ส่วนลด (บาท)', 'ยอดสุทธิ', 'สถานะ'];
  s.getRange(row, 1, 1, 11).setValues([headers])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#6366f1')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  s.setRowHeight(row, 32);
  // Freeze header
  s.setFrozenRows(row);
  row++;

  const dataStartRow = row;

  orders.forEach((r, idx) => {
    const discountBaht = (Number(r[COL.DISCOUNT_PERCENT_VALUE - 1]) || 0) +
      (Number(r[COL.DISCOUNT_BAHT - 1]) || 0);

    const rowData = [
      idx + 1,
      r[COL.TIMESTAMP - 1],
      r[COL.ORDER_ID - 1],
      r[COL.CUSTOMER_FB - 1],
      r[COL.CUSTOMER_EMAIL - 1],
      r[COL.ITEM_COUNT - 1],
      r[COL.ITEMS - 1],
      r[COL.SUBTOTAL - 1],
      discountBaht,
      r[COL.NET_TOTAL - 1],
      r[COL.STATUS - 1]
    ];

    s.getRange(row, 1, 1, 11).setValues([rowData]).setVerticalAlignment('top');

    // zebra striping
    const bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
    s.getRange(row, 1, 1, 11).setBackground(bg);

    // สีสถานะ
    const status = String(r[COL.STATUS - 1] || '');
    const color = STATUS_COLORS[status];
    if (color) {
      s.getRange(row, 11).setBackground(color.bg).setFontColor(color.fg).setFontWeight('bold');
    }

    row++;
  });

  const dataEndRow = row - 1;

  // ============ แถวสรุป ============
  row++;
  s.getRange(row, 1, 1, 7).merge()
    .setValue('📊 สรุปเดือน ' + monthLabel)
    .setFontSize(13).setFontWeight('bold').setFontColor('#4338ca')
    .setBackground('#eef2ff').setHorizontalAlignment('right');
  s.getRange(row, 8).setValue(allTotal)
    .setNumberFormat('฿#,##0').setFontWeight('bold').setBackground('#eef2ff');
  s.getRange(row, 9).setValue('')
    .setBackground('#eef2ff');
  s.getRange(row, 10).setValue(revenueTotal)
    .setNumberFormat('฿#,##0').setFontWeight('bold').setFontColor('#15803d').setBackground('#f0fdf4');
  s.getRange(row, 11).setValue(orders.length + ' รายการ')
    .setFontWeight('bold').setBackground('#eef2ff').setHorizontalAlignment('center');
  s.setRowHeight(row, 36);

  // ============ สรุปตามสถานะ ============
  row += 2;
  s.getRange(row, 1, 1, 4).merge()
    .setValue('📋 สรุปตามสถานะ')
    .setFontSize(12).setFontWeight('bold').setBackground('#f3f4f6');
  row++;
  s.getRange(row, 1, 1, 3).setValues([['สถานะ', 'จำนวน', 'ยอดรวม']])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#a78bfa').setHorizontalAlignment('center');
  row++;

  const statusRows = [
    ['⏳ รอชำระเงิน', pendingCount, pendingTotal, '#fef9c3'],
    ['💵 ชำระเงินแล้ว', paidCount, paidTotal, '#dbeafe'],
    ['✅ ส่งแผนเสร็จสิ้น', completedCount, completedTotal, '#dcfce7'],
    ['❌ ยกเลิก', cancelledCount, cancelledTotal, '#fee2e2']
  ];
  statusRows.forEach(sr => {
    s.getRange(row, 1, 1, 3).setValues([[sr[0], sr[1], sr[2]]])
      .setBackground(sr[3]).setVerticalAlignment('middle');
    s.getRange(row, 2).setHorizontalAlignment('center');
    s.getRange(row, 3).setNumberFormat('฿#,##0').setHorizontalAlignment('right').setFontWeight('bold');
    row++;
  });

  // ============ Top 5 วิชาขายดีของเดือน ============
  row += 1;
  s.getRange(row, 1, 1, 4).merge()
    .setValue('🏆 Top 5 วิชาขายดีในเดือนนี้')
    .setFontSize(12).setFontWeight('bold').setBackground('#f3f4f6');
  row++;

  // นับวิชาจาก items
  const subjectCount = {};
  orders.forEach(r => {
    const status = String(r[COL.STATUS - 1] || '').trim();
    if (status === 'ยกเลิก') return;
    const items = r[COL.ITEMS - 1];
    if (!items) return;
    const parsed = parseOrderItems(items);
    parsed.forEach(item => {
      const key = item.subject + ' ' + item.grade;
      subjectCount[key] = (subjectCount[key] || 0) + 1;
    });
  });

  const topList = Object.keys(subjectCount)
    .map(k => ({ name: k, count: subjectCount[k] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (topList.length > 0) {
    s.getRange(row, 1, 1, 3).setValues([['อันดับ', 'วิชา', 'จำนวนครั้ง']])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#f59e0b').setHorizontalAlignment('center');
    row++;
    topList.forEach((item, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1);
      s.getRange(row, 1, 1, 3).setValues([[medal, item.name, item.count]])
        .setBackground(idx % 2 === 0 ? '#fffbeb' : '#ffffff');
      s.getRange(row, 1).setHorizontalAlignment('center').setFontSize(12);
      s.getRange(row, 2).setFontWeight('bold').setFontColor('#92400e');
      s.getRange(row, 3).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#d97706');
      row++;
    });
  } else {
    s.getRange(row, 1, 1, 3).merge().setValue('— ไม่มีข้อมูล —')
      .setFontColor('#9ca3af').setHorizontalAlignment('center').setFontStyle('italic');
    row++;
  }

  // ============ Column widths ============
  s.setColumnWidth(1, 50);    // #
  s.setColumnWidth(2, 140);   // วันที่
  s.setColumnWidth(3, 160);   // รหัส
  s.setColumnWidth(4, 160);   // FB
  s.setColumnWidth(5, 180);   // Gmail
  s.setColumnWidth(6, 70);    // จำนวน
  s.setColumnWidth(7, 400);   // รายการ
  s.setColumnWidth(8, 100);   // ยอดรวม
  s.setColumnWidth(9, 100);   // ส่วนลด
  s.setColumnWidth(10, 110);  // ยอดสุทธิ
  s.setColumnWidth(11, 130);  // สถานะ

  // Number formatting
  if (orders.length > 0) {
    s.getRange(dataStartRow, 8, orders.length, 1).setNumberFormat('฿#,##0');
    s.getRange(dataStartRow, 9, orders.length, 1).setNumberFormat('฿#,##0');
    s.getRange(dataStartRow, 10, orders.length, 1).setNumberFormat('฿#,##0').setFontWeight('bold');
    s.getRange(dataStartRow, 6, orders.length, 1).setHorizontalAlignment('center');
    s.getRange(dataStartRow, 11, orders.length, 1).setHorizontalAlignment('center');
    // Wrap text for items column
    s.getRange(dataStartRow, 7, orders.length, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  }

  s.setHiddenGridlines(true);
}


// ============================================================
// 📅 รายงานรายวัน (เดือนนี้)
// ============================================================

function generateDailyReport(silent) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) { if (!silent) ui.alert('ไม่มีข้อมูล'); return; }

  const tz = 'Asia/Bangkok';
  const now = new Date();
  const currentMonth = Utilities.formatDate(now, tz, 'MM');
  const currentYear = Utilities.formatDate(now, tz, 'yyyy');
  const buddhistYear = parseInt(currentYear) + 543;
  const monthName = THAI_MONTHS[parseInt(currentMonth) - 1];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
  const validStatuses = [STATUSES.PAID, STATUSES.APPROVED, STATUSES.COMPLETED];

  // จัดกลุ่มตามวัน
  const dayGroups = {}; // key: "dd" → { orders, totalPaid, totalAll }

  data.forEach(r => {
    if (!r[0] && !r[1]) return;
    const ts = r[0];
    var dd, mm, yy;
    if (ts instanceof Date) {
      dd = Utilities.formatDate(ts, tz, 'dd');
      mm = Utilities.formatDate(ts, tz, 'MM');
      yy = Utilities.formatDate(ts, tz, 'yyyy');
    } else if (typeof ts === 'string') {
      const parts = ts.split(' ')[0].split('/');
      if (parts.length !== 3) return;
      dd = parts[0]; mm = parts[1]; yy = parts[2];
    } else return;

    if (mm !== currentMonth || yy !== currentYear) return;

    if (!dayGroups[dd]) dayGroups[dd] = { orders: 0, paidTotal: 0, allTotal: 0, completed: 0, pending: 0, cancelled: 0 };
    const g = dayGroups[dd];
    const net = Number(r[COL.NET_TOTAL - 1]) || 0;
    const status = String(r[COL.STATUS - 1] || '').trim();
    g.orders++;
    g.allTotal += net;
    if (validStatuses.indexOf(status) !== -1) g.paidTotal += net;
    if (status === STATUSES.COMPLETED) g.completed++;
    if (status === STATUSES.PENDING) g.pending++;
    if (status === 'ยกเลิก') g.cancelled++;
  });

  const days = Object.keys(dayGroups).sort();
  if (days.length === 0) { if (!silent) ui.alert('ไม่พบข้อมูลเดือนนี้'); return; }

  const sheetName = '📅 รายวัน ' + monthName + ' ' + buddhistYear;
  var existing = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);
  const s = ss.insertSheet(sheetName);

  var row = 1;
  s.getRange(row, 1, 1, 8).merge()
    .setValue('📅 สรุปยอดขายรายวัน — ' + monthName + ' ' + buddhistYear)
    .setFontSize(16).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#818cf8').setHorizontalAlignment('center');
  s.setRowHeight(row, 44);
  row++;

  s.getRange(row, 1, 1, 8).merge()
    .setValue('สร้างเมื่อ: ' + Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm'))
    .setFontSize(10).setFontColor('#6b7280').setBackground('#f9fafb')
    .setHorizontalAlignment('center').setFontStyle('italic');
  row += 2;

  // Header
  const headers = ['วันที่', 'จำนวนออเดอร์', 'ยอดขาย (ชำระแล้ว)', 'ยอดรวมทั้งหมด', 'ส่งแล้ว', 'รอชำระ', 'ยกเลิก'];
  s.getRange(row, 1, 1, 7).setValues([headers])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#6366f1')
    .setHorizontalAlignment('center');
  s.setRowHeight(row, 32);
  s.setFrozenRows(row);
  row++;

  var grandOrders = 0, grandPaid = 0, grandAll = 0;
  var grandCompleted = 0, grandPending = 0, grandCancelled = 0;

  days.forEach((dd, idx) => {
    const g = dayGroups[dd];
    s.getRange(row, 1, 1, 7).setValues([[
      dd + '/' + currentMonth + '/' + currentYear,
      g.orders, g.paidTotal, g.allTotal, g.completed, g.pending, g.cancelled
    ]]).setVerticalAlignment('middle');

    const bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
    s.getRange(row, 1, 1, 7).setBackground(bg);
    s.getRange(row, 1).setHorizontalAlignment('center').setFontWeight('bold');
    s.getRange(row, 2).setHorizontalAlignment('center');
    s.getRange(row, 3).setNumberFormat('฿#,##0').setHorizontalAlignment('right').setFontWeight('bold').setFontColor('#15803d');
    s.getRange(row, 4).setNumberFormat('฿#,##0').setHorizontalAlignment('right');
    s.getRange(row, 5).setHorizontalAlignment('center').setFontColor('#15803d');
    s.getRange(row, 6).setHorizontalAlignment('center').setFontColor('#a16207');
    s.getRange(row, 7).setHorizontalAlignment('center').setFontColor('#b91c1c');

    // ไฮไลต์วันนี้
    const todayDD = Utilities.formatDate(now, tz, 'dd');
    if (dd === todayDD) {
      s.getRange(row, 1, 1, 7).setBackground('#fef3c7');
      s.getRange(row, 1).setValue('⭐ ' + dd + '/' + currentMonth + '/' + currentYear + ' (วันนี้)');
    }

    grandOrders += g.orders;
    grandPaid += g.paidTotal;
    grandAll += g.allTotal;
    grandCompleted += g.completed;
    grandPending += g.pending;
    grandCancelled += g.cancelled;
    row++;
  });

  // Total row
  row++;
  s.getRange(row, 1, 1, 7).setValues([['📊 รวมทั้งเดือน', grandOrders, grandPaid, grandAll, grandCompleted, grandPending, grandCancelled]])
    .setFontWeight('bold').setBackground('#eef2ff');
  s.getRange(row, 1).setHorizontalAlignment('center').setFontSize(12);
  s.getRange(row, 2).setHorizontalAlignment('center');
  s.getRange(row, 3).setNumberFormat('฿#,##0').setHorizontalAlignment('right').setFontColor('#15803d');
  s.getRange(row, 4).setNumberFormat('฿#,##0').setHorizontalAlignment('right');
  s.getRange(row, 5).setHorizontalAlignment('center');
  s.getRange(row, 6).setHorizontalAlignment('center');
  s.getRange(row, 7).setHorizontalAlignment('center');

  s.setColumnWidth(1, 200);
  s.setColumnWidth(2, 120);
  s.setColumnWidth(3, 160);
  s.setColumnWidth(4, 160);
  s.setColumnWidth(5, 80);
  s.setColumnWidth(6, 80);
  s.setColumnWidth(7, 80);
  s.setHiddenGridlines(true);

  if (!silent) ui.alert('✅ สร้างรายงานรายวัน "' + sheetName + '" เรียบร้อย!');
}


// ============================================================
// 👤 รายงานประวัติลูกค้า
// ============================================================

function generateCustomerReport(silent) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) { if (!silent) ui.alert('ไม่มีข้อมูล'); return; }

  const tz = 'Asia/Bangkok';
  const now = new Date();
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();

  // จัดกลุ่มตาม Gmail ลูกค้า (ใช้ email เป็น key หลัก, fallback ใช้ FB name)
  const customers = {}; // key: email → { name, email, orders: [{orderId, date, items, total, status}] }

  data.forEach(r => {
    if (!r[0] && !r[1]) return;
    const email = String(r[COL.CUSTOMER_EMAIL - 1] || '').trim().toLowerCase();
    const fb = String(r[COL.CUSTOMER_FB - 1] || '').trim();
    const status = String(r[COL.STATUS - 1] || '').trim();
    if (status === 'ยกเลิก') return; // ไม่นับออเดอร์ที่ยกเลิก

    const key = email || fb || 'unknown';
    if (!customers[key]) {
      customers[key] = { name: fb, email: email, orders: [], totalSpent: 0, subjectSet: {} };
    }
    const c = customers[key];
    if (!c.name && fb) c.name = fb;

    const ts = r[0];
    var dateStr = '';
    if (ts instanceof Date) dateStr = Utilities.formatDate(ts, tz, 'dd/MM/yyyy');
    else if (typeof ts === 'string') dateStr = ts.split(' ')[0];

    const net = Number(r[COL.NET_TOTAL - 1]) || 0;
    const items = String(r[COL.ITEMS - 1] || '');

    c.orders.push({
      orderId: r[COL.ORDER_ID - 1],
      date: dateStr,
      items: items,
      total: net,
      status: status
    });
    c.totalSpent += net;

    // สรุปวิชาที่สั่ง
    const parsed = parseOrderItems(items);
    parsed.forEach(item => {
      const subKey = item.subject + (item.grade !== '-' ? ' ' + item.grade : '');
      c.subjectSet[subKey] = (c.subjectSet[subKey] || 0) + 1;
    });
  });

  // เรียงตามยอดซื้อรวม (มาก → น้อย)
  const sorted = Object.keys(customers)
    .map(k => customers[k])
    .sort((a, b) => b.totalSpent - a.totalSpent);

  if (sorted.length === 0) { if (!silent) ui.alert('ไม่พบข้อมูลลูกค้า'); return; }

  const sheetName = '👤 ประวัติลูกค้า';
  var existing = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);
  const s = ss.insertSheet(sheetName);

  var row = 1;
  s.getRange(row, 1, 1, 8).merge()
    .setValue('👤 ประวัติลูกค้า — ' + PAGE_NAME + '™')
    .setFontSize(16).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#818cf8').setHorizontalAlignment('center');
  s.setRowHeight(row, 44);
  row++;

  s.getRange(row, 1, 1, 8).merge()
    .setValue('ลูกค้าทั้งหมด: ' + sorted.length + ' คน  |  สร้างเมื่อ: ' + Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm'))
    .setFontSize(10).setFontColor('#6b7280').setBackground('#f9fafb')
    .setHorizontalAlignment('center').setFontStyle('italic');
  row += 2;

  // KPI
  const totalCustomers = sorted.length;
  const repeatCustomers = sorted.filter(c => c.orders.length > 1).length;
  const topSpender = sorted[0];

  const kpis = [
    { label: '👤 ลูกค้าทั้งหมด', value: totalCustomers + ' คน', bg: '#eef2ff', fg: '#4338ca' },
    { label: '🔄 ลูกค้าซื้อซ้ำ', value: repeatCustomers + ' คน (' + (totalCustomers > 0 ? Math.round(repeatCustomers / totalCustomers * 100) : 0) + '%)', bg: '#f0fdf4', fg: '#15803d' },
    { label: '🏆 ลูกค้ายอดซื้อสูงสุด', value: (topSpender ? topSpender.name : '-'), bg: '#fef3c7', fg: '#b45309' },
    { label: '💰 ยอดสูงสุด', value: '฿' + formatNumber(topSpender ? topSpender.totalSpent : 0), bg: '#fef3c7', fg: '#b45309' }
  ];

  for (var i = 0; i < kpis.length; i++) {
    const k = kpis[i];
    const col = i * 2 + 1;
    s.getRange(row, col, 1, 2).merge().setValue(k.label)
      .setFontSize(11).setFontWeight('bold').setFontColor(k.fg)
      .setBackground(k.bg).setHorizontalAlignment('center');
    s.getRange(row + 1, col, 1, 2).merge().setValue(k.value)
      .setFontSize(14).setFontWeight('bold').setFontColor(k.fg)
      .setBackground(k.bg).setHorizontalAlignment('center');
  }
  s.setRowHeight(row, 28);
  s.setRowHeight(row + 1, 36);
  row += 3;

  // ตารางลูกค้า
  const headers = ['#', 'ชื่อ Facebook', 'Gmail', 'จำนวนครั้ง', 'ยอดซื้อรวม', 'ออเดอร์ทั้งหมด', 'วิชาที่สั่งซื้อ', 'ครั้งล่าสุด'];
  s.getRange(row, 1, 1, 8).setValues([headers])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#6366f1')
    .setHorizontalAlignment('center');
  s.setRowHeight(row, 32);
  s.setFrozenRows(row);
  row++;

  sorted.forEach((c, idx) => {
    const subjectList = Object.keys(c.subjectSet)
      .map(k => k + (c.subjectSet[k] > 1 ? ' (x' + c.subjectSet[k] + ')' : ''))
      .join(', ');
    const orderIds = c.orders.map(o => o.orderId).join(', ');
    const lastDate = c.orders.length > 0 ? c.orders[c.orders.length - 1].date : '-';

    s.getRange(row, 1, 1, 8).setValues([[
      idx + 1, c.name, c.email, c.orders.length, c.totalSpent,
      orderIds, subjectList, lastDate
    ]]).setVerticalAlignment('top');

    const bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
    s.getRange(row, 1, 1, 8).setBackground(bg);
    s.getRange(row, 1).setHorizontalAlignment('center');
    s.getRange(row, 4).setHorizontalAlignment('center').setFontWeight('bold');
    s.getRange(row, 5).setNumberFormat('฿#,##0').setHorizontalAlignment('right').setFontWeight('bold').setFontColor('#15803d');

    // ไฮไลต์ลูกค้าซื้อซ้ำ
    if (c.orders.length > 1) {
      s.getRange(row, 4).setFontColor('#d97706').setBackground('#fef3c7');
    }

    row++;
  });

  s.setColumnWidth(1, 50);
  s.setColumnWidth(2, 180);
  s.setColumnWidth(3, 200);
  s.setColumnWidth(4, 100);
  s.setColumnWidth(5, 120);
  s.setColumnWidth(6, 300);
  s.setColumnWidth(7, 400);
  s.setColumnWidth(8, 110);

  // Wrap text
  if (sorted.length > 0) {
    const dataStart = row - sorted.length;
    s.getRange(dataStart, 6, sorted.length, 2).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  }

  s.setHiddenGridlines(true);

  if (!silent) {
    ui.alert('✅ สร้างรายงานประวัติลูกค้าเรียบร้อย!\n\n' +
      '👤 ลูกค้าทั้งหมด: ' + totalCustomers + ' คน\n' +
      '🔄 ลูกค้าซื้อซ้ำ: ' + repeatCustomers + ' คน');
  }
}


function refreshDashboard() {
  updateDashboard(SpreadsheetApp.getActiveSpreadsheet());
  try { SpreadsheetApp.getUi().alert('✅ รีเฟรช Dashboard เรียบร้อย'); }
  catch (e) { Logger.log('Dashboard refreshed'); }
}

function testFullFlow() {
  const testData = {
    orderId: 'KPS-TEST-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    customerFb: 'ทดสอบ ระบบ', customerEmail: 'test@example.com',
    items: '1. ภาษาไทย ป.1 (ป.1 (68), 200 ชม.) - 350 บาท\n2. คณิตศาสตร์ ป.1 (ป.1 (68), 200 ชม.) - 350 บาท',
    itemCount: 2, subtotal: 700, discountPercent: 0,
    discountPercentValue: 0, discountBaht: 0, netTotal: 700
  };
  Logger.log(doPost({ postData: { contents: JSON.stringify(testData) } }).getContent());
}
