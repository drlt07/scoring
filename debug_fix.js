// debug_fix.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Thêm debug logs
content = content.replace(
  /const handleGenerateMatches = async \(\) => {\s*\n\s*openDrawModal\(\);\s*\n\s*\n\s*\/\/ Bước 1: Quay xúc xắc 2.5 giây/g,
  "const handleGenerateMatches = async () => {\n  console.log(\"Bắt đầu tạo lịch đấu\");\n  console.log(\"Mở modal...\");\n  openDrawModal();\n  console.log(\"isDrawModalOpen:\", isDrawModalOpen);\n\n  // Bước 1: Quay xúc xắc 2.5 giây"
);

// Tăng z-index của modal
content = content.replace(
  /z-index: 9999;/g,
  "z-index: 10000;"
);

// Thêm !important để đảm bảo hiển thị
content = content.replace(
  /\.draw-overlay \{/g,
  ".draw-overlay {\n  position: fixed !important;\n  inset: 0 !important;"
);

fs.writeFileSync(filePath, content);
console.log('Đã thêm debug và tăng z-index cho modal');