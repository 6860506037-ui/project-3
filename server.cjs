const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'CINEMA_SUPER_SECRET_KEY';

app.use(cors());
app.use(express.json());

let db;

async function initDatabase() {
  db = await open({
    filename: './backend/cinema.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      passwordHash TEXT,
      role TEXT
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      rating TEXT,
      genre TEXT,
      duration TEXT,
      image TEXT
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      movieTitle TEXT,
      seatNumber TEXT,
      totalAmount REAL,
      status TEXT
    )
  `);

  const userCheck = await db.get('SELECT COUNT(*) as count FROM users');
  if (userCheck.count === 0) {
    await db.run('INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)', 'customer1', bcrypt.hashSync('123456', 10), 'candidate');
    await db.run('INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)', 'staff1', bcrypt.hashSync('123456', 10), 'judge');
    await db.run('INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)', 'manager1', bcrypt.hashSync('123456', 10), 'manager');
  }

  const movieCheck = await db.get('SELECT COUNT(*) as count FROM movies');
  if (movieCheck.count === 0) {
    await db.run('INSERT INTO movies (title, rating, genre, duration, image) VALUES (?, ?, ?, ?, ?)', "That Time I Got Reincarnated as a Slime", "G", "อนิเมะสไลม์", "120 min", "/slime.jpg");
    await db.run('INSERT INTO movies (title, rating, genre, duration, image) VALUES (?, ?, ?, ?, ?)', "Demon Slayer: To the Swordsmith Village", "PG", "ดาบพิฆาตอสูร", "120 min", "/demonslayer.jpg");
    await db.run('INSERT INTO movies (title, rating, genre, duration, image) VALUES (?, ?, ?, ?, ?)', "Spy x Family Code: White", "G", "สปาย x แฟมิลี่", "110 min", "/spyxfamily.jpg");
    await db.run('INSERT INTO movies (title, rating, genre, duration, image) VALUES (?, ?, ?, ?, ?)', "มหาเวทย์ผนึกมาร", "15+", "มหาเวทย์ผนึกมาร", "105 min", "/jujutsu.jpg");
  }

  console.log("🎲 SQL Database Connected & Ready!");
}

initDatabase();

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token ไม่ถูกต้อง' });
    req.user = user;
    next();
  });
};

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.get('SELECT * FROM users WHERE username = ?', username);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(400).json({ message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, role: user.role, username: user.username });
});

app.get('/api/movies', async (req, res) => {
  const allMovies = await db.all('SELECT * FROM movies');
  res.json(allMovies);
});

app.get('/api/reserved-seats', async (req, res) => {
  const { movieTitle } = req.query;
  const rows = await db.all('SELECT seatNumber FROM bookings WHERE movieTitle = ? AND status = "approved"', movieTitle);
  const seats = rows.map(r => r.seatNumber);
  res.json(seats);
});

app.post('/api/bookings', authenticateToken, async (req, res) => {
  if (req.user.role !== 'candidate') return res.status(403).json({ message: 'ไม่มีสิทธิ์จองตั๋ว' });
  const { movieTitle, seats, totalAmount } = req.body;

  for (let seat of seats) {
    await db.run(
      'INSERT INTO bookings (username, movieTitle, seatNumber, totalAmount, status) VALUES (?, ?, ?, ?, ?)',
      req.user.username, movieTitle, seat, totalAmount, 'pending'
    );
  }
  res.status(201).json({ message: 'ส่งข้อมูลการจองตั๋วสำเร็จแล้ว! รอพนักงานตรวจสอบสลิป' });
});

app.get('/api/judge/bookings', authenticateToken, async (req, res) => {
  if (req.user.role !== 'judge' && req.user.role !== 'manager') return res.status(403).json({ message: 'ปฏิเสธเข้าถึง' });
  
  const rows = await db.all('SELECT id, username, movieTitle, totalAmount, status, GROUP_CONCAT(seatNumber) as seats FROM bookings GROUP BY username, movieTitle, status, totalAmount');
  const formattedBookings = rows.map(r => ({
    id: r.id,
    username: r.username,
    movieTitle: r.movieTitle,
    seats: r.seats.split(','),
    totalAmount: r.totalAmount,
    status: r.status
  }));
  res.json(formattedBookings);
});

// 🌟 ปรับปรุง API: ให้สามารถเปลี่ยนใจอัปเดตสถานะจาก approved เป็น rejected ได้ตลอดเวลา
app.patch('/api/judge/bookings/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'judge') return res.status(403).json({ message: 'เฉพาะพนักงานเท่านั้น' });
  const { id } = req.params;
  const { status } = req.body;

  const currentBooking = await db.get('SELECT username, movieTitle, status, totalAmount FROM bookings WHERE id = ?', id);
  if (currentBooking) {
    // อัปเดตทุกที่นั่งที่อยู่ในบิลกลุ่มเดียวกัน ให้เปลี่ยนสถานะตามที่พนักงานเลือกใหม่
    await db.run(
      'UPDATE bookings SET status = ? WHERE username = ? AND movieTitle = ? AND totalAmount = ?', 
      status, currentBooking.username, currentBooking.movieTitle, currentBooking.totalAmount
    );
  }
  
  res.json({ message: `อัปเดตสถานะคิวจองตั๋วเป็น [${status}] สำเร็จ!` });
});

app.post('/api/manager/movies', authenticateToken, async (req, res) => {
  if (req.user.role !== 'manager') return res.status(403).json({ message: 'เฉพาะผู้จัดการเท่านั้น' });
  const { title, rating, genre, duration, image } = req.body;

  await db.run(
    'INSERT INTO movies (title, rating, genre, duration, image) VALUES (?, ?, ?, ?, ?)',
    title, rating, genre, duration, image || '/slime.jpg'
  );
  res.status(201).json({ message: 'เพิ่มภาพยนตร์เรื่องใหม่เข้าฐานข้อมูล SQL สำเร็จ!' });
});

app.listen(PORT, () => {
  console.log(`Backend Server running on: http://localhost:${PORT}`);
});