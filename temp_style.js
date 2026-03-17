// temp_style.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'index.css');
let content = fs.readFileSync(filePath, 'utf8');

// Thêm style tạm để đảm bảo modal hiển thị
content += `\n\n/* DEBUG TEMP STYLE */\n.draw-overlay {\n  background: rgba(0, 0, 0, 0.9) !important;\n  z-index: 99999 !important;\n}\n.draw-container {\n  background: #00ff00 !important;\n  padding: 30px !important;\n  color: #000 !important;\n}\n`;

fs.writeFileSync(filePath, content);
console.log('Đã thêm style debug tạm thời');