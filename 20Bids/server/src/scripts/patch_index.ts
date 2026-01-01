
import fs from 'fs';
import path from 'path';

const indexPath = path.resolve(__dirname, '../index.ts');
let content = fs.readFileSync(indexPath, 'utf-8');

// The block to remove (approximate start, we will use regex or substring)
const startMarker = `        if (recs.length > 0) {
            console.log(\`[Admin] Starting refresh for \${recs.length} records...\`);`;

const endMarker = `            console.log(\`[Admin] Refreshed \${updatedCount} records.\`);
        }

        res.json({ success: true, count: recs.length, message: 'Refresh process triggered in background (awaited).' });`;

// Find start index
const startIndex = content.indexOf('        if (recs.length > 0) {');
if (startIndex === -1) {
    console.error('Start marker not found');
    process.exit(1);
}

// Find end index (search after start)
const endIndexSearch = content.indexOf('background (awaited).\' });', startIndex);
if (endIndexSearch === -1) {
    console.error('End marker not found');
    process.exit(1);
}

const endIndex = endIndexSearch + 'background (awaited).\' });'.length;

console.log(`Found block from ${startIndex} to ${endIndex}`);

const newBlock = `        const count = await refreshDailyData(dateStr);
        res.json({ success: true, count, message: 'Refresh process completed.' });`;

const newContent = content.substring(0, startIndex) + newBlock + content.substring(endIndex);

fs.writeFileSync(indexPath, newContent, 'utf-8');
console.log('Successfully patched index.ts');
