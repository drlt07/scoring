const fs = require('fs');

const content = fs.readFileSync('d:/FanRoc-Scoring/FanRoc-Scoring/src/App.tsx', 'utf8');

// Add state variables after the existing useState hooks
const stateVariables = `
  // State cho modal bốc thăm
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [drawIcon, setDrawIcon] = useState('🎲');
  const [drawTitle, setDrawTitle] = useState('Đang bốc thăm lịch thi đấu...');
  const [drawStatus, setDrawStatus] = useState('Hệ thống đang xử lý');
`;

// Insert after the last useState hook
const stateRegex = /(const \[matches, setMatches\] = useState<Match>\(\[\]\);)/;
const replaced = content.replace(stateRegex, `$1${stateVariables}`);

fs.writeFileSync('d:/FanRoc-Scoring/FanRoc-Scoring/src/App.tsx', replaced);
console.log('State variables added successfully!');
