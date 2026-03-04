# FANROC 2026 – Hệ Thống Chấm Điểm Robotics

Web App chấm điểm real-time cho cuộc thi FANROC – Bảng R (Robotics).

## Yêu Cầu

- **Node.js** >= 18
- **MySQL** >= 5.7 (hoặc MariaDB >= 10.3)

## Cài Đặt Nhanh

```bash
# 1. Clone / mở thư mục project

# 2. Cài dependencies
npm install

# 3. Cấu hình database – chỉnh sửa file .env
#    (mặc định: root / không mật khẩu / database: fanroc_scoring)

# 4. Khởi động (development)
npm run dev
```

Hoặc trên Windows: **bấm đúp `start.bat`**

## Truy Cập

| URL | Mô tả |
|-----|-------|
| `http://localhost:5173` | Frontend (dev – có hot reload) |
| `http://localhost:3000` | Backend API |

## Tài Khoản Mặc Định

| Vai trò | Email | Mật khẩu | Chức năng |
|---------|-------|-----------|-----------|
| Admin | admin@fanroc.com | admin | Quản lý hệ thống |
| Trọng tài 1 | gk1@fanroc.com | gk1 | Nhập điểm sân 1 |
| Trọng tài 2 | gk2@fanroc.com | gk2 | Nhập điểm sân 2 |
| Trọng tài 3 | gk3@fanroc.com | gk3 | Nhập điểm sân 3 |
| Khán giả | — | **fanroc2026** | Xem bảng xếp hạng |

## Triển Khai Production

```bash
# Build frontend
npm run build

# Chạy server (phục vụ cả frontend)
npm start
```

Server sẽ phục vụ frontend (thư mục `dist/`) và API trên cùng cổng (mặc định 3000).

## Cấu Trúc Thư Mục

```
FanRoc-Scoring/
├── server/             # Backend (Express + Socket.IO)
│   ├── index.js        # Entry point
│   ├── database.js     # MySQL connection & init
│   ├── socket.js       # Socket.IO handler
│   └── routes/         # REST API routes
├── src/                # Frontend (React + TypeScript)
│   ├── App.tsx         # Main component
│   ├── types.ts        # Type definitions
│   ├── scoringLogic.ts # Scoring calculations
│   ├── api.ts          # REST API client
│   └── socket.ts       # Socket.IO client
├── database/
│   └── schema.sql      # MySQL schema
├── .env                # Environment config
├── package.json
└── vite.config.ts      # Vite + proxy config
```

## Luật Tính Điểm

```
Điểm = (Sinh học + Rào cản) × Hệ số cân bằng + End Game − Penalty

- Sinh học:    Vàng × 3 + Trắng × 1
- Rào cản:     Đẩy được +10, không đẩy → hệ số −0.2
- Hệ số:       Lệch 0-1 bóng: ×2.0 | 2-3: ×1.5 | ≥4: ×1.3
- End Game:    Partial +5, Full +10, cả 2 Full bonus +10
- Penalty:     Mỗi lỗi −5, Thẻ vàng −10, Thẻ đỏ → 0đ toàn trận
```

## Deploy Với Tên Miền

1. Build: `npm run build`
2. Đặt sau reverse proxy (Nginx / Caddy)
3. Trỏ domain về server
4. Bật HTTPS (Let's Encrypt)

Ví dụ Nginx:
```nginx
server {
    listen 80;
    server_name scoring.fanroc.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```
