const fs = require('fs');
const path = require('path');

// 대상 정적 서빙 폴더 생성
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

// node_modules/@rhwp/core 폴더 탐색
const coreDir = path.join(__dirname, 'node_modules', '@rhwp', 'core');
if (!fs.existsSync(coreDir)) {
  console.error('Error: @rhwp/core is not installed in node_modules!');
  process.exit(1);
}

// 복사할 대상 자산 정의 (WASM 및 JS 파일)
const filesToCopy = [
  'rhwp.js',
  'rhwp_bg.wasm'
];

let successCount = 0;

for (const fileName of filesToCopy) {
  // 후보 경로 설정: coreDir root, coreDir/dist 등
  const pathsToTry = [
    path.join(coreDir, fileName),
    path.join(coreDir, 'dist', fileName)
  ];
  
  let copied = false;
  for (const srcPath of pathsToTry) {
    if (fs.existsSync(srcPath)) {
      const destPath = path.join(publicDir, fileName);
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied ${fileName} from ${srcPath} to ${destPath}`);
      copied = true;
      successCount++;
      break;
    }
  }
  
  if (!copied) {
    console.warn(`Warning: Could not find ${fileName} in @rhwp/core paths.`);
  }
}

if (successCount === filesToCopy.length) {
  console.log('Setup successfully completed! All core assets are in public/.');
} else {
  console.warn('Setup completed with warnings. Some files might be missing.');
}
