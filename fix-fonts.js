const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInDir(fullPath);
    } else if (fullPath.endsWith('.tsx') && !fullPath.includes('AppText') && !fullPath.includes('Themed') && !fullPath.includes('_layout')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // If the file imports Text from react-native
      if (content.includes("from 'react-native'") && content.includes("Text")) {
          // Remove Text, from the import list
          content = content.replace(/Text,\s*/g, '');
          content = content.replace(/,\s*Text\s*/g, '');
          content = content.replace(/\{\s*Text\s*\}/g, '{}'); // If only Text was imported
          
          // Remove empty imports 
          content = content.replace(/import\s*\{\s*\}\s*from\s*'react-native';?\n/g, '');
          
          // Add the AppText import right before the react-native import, since we use absolute alias @/components/ui/AppText
          const importAppText = `import { AppText as Text } from '@/components/ui/AppText';\n`;
          content = importAppText + content;

          fs.writeFileSync(fullPath, content, 'utf8');
          console.log(`Updated ${fullPath}`);
      }
    }
  }
}

replaceInDir('./app');
replaceInDir('./components');
