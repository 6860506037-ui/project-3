const express = require('express');
const mariadb = require('mariadb');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

// สร้าง Connection Pool
const pool = mariadb.createPool({
    host: 'localhost',
    user: 'root',
    password: 'your_secure_password',
    database: 'cinestream_db',
    connectionLimit: 10
});

// ตรวจสอบไดเรกทอรีสำหรับเก็บใบเสร็จ
const receiptsDir = path.join(__dirname, 'receipts');
if (!fs.existsSync(receiptsDir)) {
    fs.mkdirSync(receiptsDir);
}

// API จองตั๋วภาพยนตร์
app.post('/api/reserve', async (req, res) => {
    const { seats, total_price, discount_code } = req.body;

    if (!seats || !Array.isArray(seats) || seats.length === 0) {
        return res.status(400).json({ error: 'ไม่พบที่นั่งที่ระบุ' });
    }

    let conn;
    try {
        // เริ่มต้นเชื่อมต่อเพื่อทำ Transaction แบบเข้มงวด
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // 1. แปลงรายการที่นั่งเป็น Format string ของ SQL เช่น ('A-1', 'A-2')
        const formattedSeats = seats.map(seat => `'${seat}'`).join(',');

        // 2. ใช้คำสั่ง SELECT ... FOR UPDATE เพื่อล็อกแถวดังกล่าวใน DB ชั่วคราวป้องกันการจองชนกัน (Race Condition)
        const checkQuery = `
            SELECT seat_number, status 
            FROM seats 
            WHERE seat_number IN (${formattedSeats}) 
            FOR UPDATE
        `;
        const seatStatuses = await conn.query(checkQuery);

        // ตรวจเช็คว่ามีสถานะจองแล้ว (Reserved) หรือไม่
        const alreadyReserved = seatStatuses.some(seat => seat.status === 'reserved');

        if (alreadyReserved) {
            // หากมีที่นั่งไม่ว่างแม้แต่ที่เดียว ให้สั่ง Rollback คืนค่าสภาพเดิม
            await conn.rollback();
            // ตอบกลับสถานะ 422 Unprocessable Entity
            return res.status(422).json({ error: 'เกิดข้อผิดพลาด: มีบางที่นั่งถูกทำรายการจองไปแล้วก่อนหน้านี้' });
        }

        // 3. ปรับปรุงข้อมูลสถานะให้เป็น Reserved
        const updateQuery = `
            UPDATE seats 
            SET status = 'reserved' 
            WHERE seat_number IN (${formattedSeats})
        `;
        await conn.query(updateQuery);

        // 4. บันทึกประวัติรายการใบจองหลัก
        const insertOrderQuery = `
            INSERT INTO bookings_order (total_price, discount_code, order_time) 
            VALUES (?, ?, NOW())
        `;
        const orderResult = await conn.query(insertOrderQuery, [total_price, discount_code]);
        const orderId = Number(orderResult.insertId);

        // 5. ทำการบันทึกเมื่อธุรกรรมเสร็จสมบูรณ์ร้อยเปอร์เซ็นต์
        await conn.commit();

        // 6. ดำเนินการออกใบเสร็จจำลองสำหรับระบบใบเสร็จความร้อน (Thermal Receipt Export)
        const receiptContent = `
========================================
        CINESTREAM RECEIPT
========================================
รหัสรายการจอง: CS-${orderId}
เวลาทำรายการ: ${new Date().toLocaleString('th-TH')}
----------------------------------------
ที่นั่งที่จอง: ${seats.join(', ')}
ยอดรวมสุทธิ: ${total_price} บาท
โค้ดที่ใช้งาน: ${discount_code || 'ไม่ได้ระบุ'}
----------------------------------------
ขอบคุณที่ใช้บริการโรงภาพยนตร์ในเครือของเรา
========================================
`;

        const receiptPath = path.join(receiptsDir, `receipt-CS-${orderId}.txt`);
        fs.writeFileSync(receiptPath, receiptContent, 'utf8');

        // ส่งสัญญาณตอบกลับยืนยันสำเร็จ
        res.status(200).json({ 
            success: true, 
            message: 'ดำเนินการทำรายการจองและสร้างใบเสร็จจำลองสำเร็จ',
            bookingId: orderId
        });

    } catch (err) {
        // หากเกิดข้อผิดพลาดทางเทคนิคภายนอก ให้คืนสิทธิ์ทันทีเพื่อรักษาความเสถียรข้อมูล
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'ระบบทำงานผิดพลาดเนื่องจากเงื่อนไขความขัดแย้งเชิงเซิร์ฟเวอร์' });
    } finally {
        if (conn) conn.release();
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`CineStream Server running on port ${PORT}`));
