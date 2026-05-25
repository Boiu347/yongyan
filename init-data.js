/**
 * Startup script: ensures data/projects.json exists with valid seed data.
 * Runs before the NestJS server starts.
 */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'projects.json');

// Check if current data is valid (has our project with many VOCs)
let needsRestore = true;
try {
  if (fs.existsSync(dataFile)) {
    const raw = fs.readFileSync(dataFile, 'utf-8');
    const projects = JSON.parse(raw);
    if (Array.isArray(projects) && projects.length > 0 && projects[0].parsedVOCs && projects[0].parsedVOCs.length > 10) {
      console.log(`[init-data] Data OK: ${projects.length} projects, ${projects[0].parsedVOCs.length} VOCs`);
      needsRestore = false;
    }
  }
} catch (e) {
  // ignore
}

if (needsRestore) {
  // Try multiple possible locations for seed file
  const seedPaths = [
    path.join(process.cwd(), 'server', 'seed-data', 'projects.seed.json'),
    path.join(process.cwd(), 'dist', 'server', 'seed-data', 'projects.seed.json'),
    path.join(process.cwd(), 'seed-data', 'projects.seed.json'),
    path.join(__dirname, 'server', 'seed-data', 'projects.seed.json'),
    path.join(__dirname, 'dist', 'server', 'seed-data', 'projects.seed.json'),
    path.join(__dirname, 'seed-data', 'projects.seed.json'),
  ];

  let restored = false;
  for (const seedPath of seedPaths) {
    if (fs.existsSync(seedPath)) {
      console.log(`[init-data] Restoring from: ${seedPath}`);
      fs.mkdirSync(dataDir, { recursive: true });
      fs.copyFileSync(seedPath, dataFile);
      console.log(`[init-data] Data restored successfully`);
      restored = true;
      break;
    }
  }

  if (!restored) {
    console.warn(`[init-data] WARNING: No seed file found! Tried:`);
    seedPaths.forEach(p => console.warn(`  - ${p} (exists: ${fs.existsSync(p)})`));
    console.warn(`[init-data] CWD: ${process.cwd()}`);
    console.warn(`[init-data] __dirname: ${__dirname}`);
    // List what's in cwd
    try {
      const files = fs.readdirSync(process.cwd());
      console.warn(`[init-data] Files in CWD: ${files.join(', ')}`);
    } catch(e) {}
  }
}
