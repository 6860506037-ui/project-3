import React, { useState } from 'react';
import './App.css';

export default function App() {
  // สถานะการจองภาพยนตร์ และการเลือกที่นั่ง
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [discountCode, setDiscountCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState(false);
  const [bookingMessage, setBookingMessage] = useState('');

  // 1. จำลองข้อมูลภาพยนตร์พร้อมเรตติ้งเพื่อแสดงสี Badges ที่แตกต่างกัน
  const movies = [
    { id: 1, title: 'สตาร์ วอร์ส ยุคจักรวรรดิ', rating: 'G', color: '#2ecc71' },
    { id: 2, title: 'เดอะ แบทแมน ล่าปริศนา', rating: 'PG', color: '#f1c40f' },
    { id: 3, title: 'คนล่ามรณะวิบัติภัย', rating: 'R', color: '#e74c3c' }
  ];

  // 2. การกำหนดราคาสดบนหน้าจอ แถวธรรมดา A-F ราคา 160 บาท, แถวพรีเมียม G-H ราคา 200 บาท
  const getSeatPrice = (rowLabel) => {
    return ['G', 'H'].includes(rowLabel) ? 200 : 160;
  };

  // 3. ฟังก์ชันการคลิกเปลี่ยนสถานะเลือกที่นั่ง
  const handleSeatClick = (seatCode) => {
    if (selectedSeats.includes(seatCode)) {
      setSelectedSeats(selectedSeats.filter(seat => seat !== seatCode));
    } else {
      setSelectedSeats([...selectedSeats, seatCode]);
    }
  };

  // 4. คำนวณราคาก่อนและหลังส่วนลด
  const calculateTotal = () => {
    const rawTotal = selectedSeats.reduce((sum, seat) => {
      const row = seat.charAt(0);
      return sum + getSeatPrice(row);
    }, 0);
    
    return discountApplied ? rawTotal * 0.9 : rawTotal;
  };

  // 5. ระบบตรวจสอบโค้ดลดราคา client-side
  const applyDiscount = () => {
    if (discountCode.trim() === 'WS2026') {
      setDiscountApplied(true);
      alert('ยินดีด้วย! คุณได้รับส่วนลด 10% เรียบร้อยแล้ว');
    } else {
      alert('รหัสส่วนลดไม่ถูกต้อง');
    }
  };

  // 6. ส่งคำร้องไปยัง Backend API
  const handleReserve = async () => {
    if (selectedSeats.length === 0) {
       alert('กรุณาเลือกที่นั่งอย่างน้อย 1 ที่นั่งก่อนชำระเงิน');
       return;
    }

    try {
      const response = await fetch('/api/reserve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          seats: selectedSeats,
          total_price: calculateTotal(),
          discount_code: discountApplied ? 'WS2026' : null
        })
      });

      if (response.ok) {
        const data = await response.json();
        setBookingMessage(`จองตั๋วภาพยนตร์สำเร็จ! ตั๋วของคุณอยู่ในคิวพิมพ์ใบเสร็จเรียบร้อย`);
        setSelectedSeats([]);
        setDiscountApplied(false);
        setDiscountCode('');
      } else if (response.status === 422) {
        setBookingMessage('ข้อผิดพลาด: มีบางที่นั่งถูกจองแล้วระหว่างรอประมวลผล กรุณาเลือกที่นั่งใหม่');
      } else {
        setBookingMessage('เกิดข้อผิดพลาดในการทำรายการบนเซิร์ฟเวอร์');
      }
    } catch (err) {
      setBookingMessage('ไม่สามารถเชื่อมต่อระบบหลังบ้านได้');
    }
  };

  // โครงสร้างแผงที่นั่ง 8x8 (A-H, 1-8)
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const columns = Array.from({ length: 8 }, (_, i) => i + 1);

  return (
    <div className="cinestream-app">
      {/* วิดีโอพื้นหลังพรีเมียม (Video Hero Background) */}
      <section className="hero-section">
        <video className="hero-video" autoPlay muted loop playsInline>
          <source src="https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4" type="video/mp4" />
        </video>
        <div className="hero-overlay">
          <h1>CINESTREAM</h1>
          <p>สัมผัสโลกแห่งภาพยนตร์ชั้นนำ ด้วยระบบการซื้อตั๋วสุดลื่นไหล</p>
        </div>
      </section>

      <div className="container">
        {/* รายการภาพยนตร์แสดงเรตติ้ง (Movie Catalog with Rating Badges) */}
        <section className="catalog-section">
          <h2>ภาพยนตร์ที่กำลังฉาย</h2>
          <div className="movie-list">
            {movies.map(movie => (
              <div key={movie.id} className="movie-card">
                <h3>{movie.title}</h3>
                <span 
                  className="rating-badge" 
                  style={{ backgroundColor: movie.color }}
                >
                  เรต: {movie.rating}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ผังการเลือกที่นั่งอัจฉริยะ 8x8 แถว */}
        <section className="seating-section">
          <h2>โปรดเลือกที่นั่งของคุณ</h2>
          <div className="screen-indicator">หน้าจอฉายภาพยนตร์</div>
          
          <div className="seat-grid">
            {rows.map(row => (
              <div className="seat-row" key={row}>
                <span className="row-label">{row}</span>
                {columns.map(col => {
                  const seatCode = `${row}-${col}`;
                  const isSelected = selectedSeats.includes(seatCode);
                  const isPremium = ['G', 'H'].includes(row);
                  return (
                    <button
                      key={seatCode}
                      className={`seat ${isSelected ? 'selected' : ''} ${isPremium ? 'premium' : ''}`}
                      onClick={() => handleSeatClick(seatCode)}
                      title={`ที่นั่ง ${seatCode} (${isPremium ? '200' : '160'} บาท)`}
                    >
                      {col}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="legend">
            <div><span className="legend-box available-box"></span> ทั่วไป (160฿)</div>
            <div><span className="legend-box premium-box"></span> พรีเมียม (200฿)</div>
            <div><span className="legend-box selected-box"></span> กำลังเลือก</div>
          </div>
        </section>

        {/* ระบบ Checkout และคำนวณส่วนลด */}
        <section className="checkout-section">
          <h2>สรุปรายละเอียดและชำระเงิน</h2>
          <div className="booking-summary">
            <p><strong>ที่นั่งที่เลือก:</strong> {selectedSeats.length > 0 ? selectedSeats.join(', ') : 'ยังไม่ได้เลือกที่นั่ง'}</p>
            <p><strong>ราคารวมทั้งสิ้น:</strong> {calculateTotal().toLocaleString()} บาท</p>
          </div>

          <div className="promo-wrapper">
            <input 
              type="text" 
              placeholder="กรอกรหัสส่วนลด" 
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value)}
              disabled={discountApplied}
            />
            <button onClick={applyDiscount} disabled={discountApplied}>ใช้โค้ดลด</button>
          </div>
          {discountApplied && <span className="discount-success">ใช้โค้ดสำเร็จ! ลดราคารวมแล้ว 10%</span>}

          <button className="pay-btn" onClick={handleReserve}>ยืนยันสิทธิ์จองภาพยนตร์</button>
          
          {bookingMessage && <p className="alert-message">{bookingMessage}</p>}
        </section>
      </div>
    </div>
  );
}
