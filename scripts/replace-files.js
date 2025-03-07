// scripts/replace-files.js - Script to replace corrupted files with fixed versions

const fs = require('fs');
const path = require('path');

// Files to replace
const filesToReplace = [
  'fix-python-path.js',
  'fix-redis-connection.js',
  'fix-memory-issues.js',
  'quick-diagnose.js'
];

// Main function
async function main() {
  console.log('Replacing corrupted script files with fixed versions...');
  
  for (const file of filesToReplace) {
    const originalPath = path.join(process.cwd(), 'scripts', file);
    const newPath = path.join(process.cwd(), 'scripts', `${file}.new`);
    const backupPath = path.join(process.cwd(), 'scripts', `${file}.bak`);
    
    try {
      // Check if new file exists
      if (!fs.existsSync(newPath)) {
        console.log(`Error: New file ${newPath} does not exist. Skipping.`);
        continue;
      }
      
      // Create backup of original file if it exists
      if (fs.existsSync(originalPath)) {
        console.log(`Creating backup of ${file} at ${backupPath}`);
        fs.copyFileSync(originalPath, backupPath);
      }
      
      // Replace original file with new file
      console.log(`Replacing ${file} with fixed version`);
      fs.copyFileSync(newPath, originalPath);
      
      // Remove new file
      fs.unlinkSync(newPath);
      
      console.log(`Successfully replaced ${file}`);
    } catch (error) {
      console.error(`Error replacing ${file}: ${error.message}`);
    }
  }
  
  console.log('File replacement completed.');
}

// Run the main function
main().catch(error => {
  console.error(`Error in replace-files.js: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});