// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
const files = ['Civil Tracker Mobile.dc.html', 'Civil Tracker Admin.dc.html', 'Civil Tracker Super Admin.dc.html', 'Civil Tracker Client Portal.dc.html'];
let css = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
@import 'tailwindcss';\n\n`;
files.forEach(f => {
  const content = fs.readFileSync('d:/Civil Tracker/Civil Tracker Mobile PWA/' + f, 'utf8');
  const styleMatch = content.match(/<style>([\s\S]*?)<\/style>/);
  if(styleMatch) {
    css += `/* Source: ${f} */\n` + styleMatch[1].trim() + '\n\n';
  }
});
fs.writeFileSync('d:/Civil Tracker/app/src/app/globals.css', css);
console.log('CSS Extracted successfully.');
