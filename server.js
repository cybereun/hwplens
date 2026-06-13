const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 8800;

// 정적 파일 서빙 (public 폴더 - 브라우저 캐시 금지 적용)
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filepath) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
app.use(express.json());

// 기본 시작 디렉토리 (사용자 홈 디렉토리)

const DEFAULT_START_DIR = os.homedir();

const { execSync, exec, spawn } = require('child_process');

// 윈도우 드라이브 볼륨 라벨 및 유형 획득 헬퍼 (메모리 캐싱 및 타임아웃 세팅 보강)
let driveLabelsCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 30000; // 30초 캐시 유효

function getWindowsDriveLabels() {
  const now = Date.now();
  if (driveLabelsCache && (now - lastCacheTime < CACHE_TTL)) {
    return driveLabelsCache;
  }
  
  const labels = {};
  try {
    // powershell 조회 지연을 방지하기 위해 2초 타임아웃을 강제함
    const output = execSync('powershell -Command "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, VolumeName, DriveType | ConvertTo-Json"', { encoding: 'utf8', timeout: 2000 });
    if (output.trim()) {
      const list = JSON.parse(output);
      const items = Array.isArray(list) ? list : [list];
      items.forEach(item => {
        if (item && item.DeviceID) {
          const letter = item.DeviceID.toUpperCase(); // 예: "C:"
          labels[letter] = {
            volumeName: item.VolumeName || '',
            driveType: item.DriveType
          };
        }
      });
    }
    driveLabelsCache = labels;
    lastCacheTime = now;
  } catch (e) {
    console.warn('PowerShell 드라이브 라벨 수집 실패/시간초과 (캐시 대체 작동):', e.message);
    if (driveLabelsCache) return driveLabelsCache;
  }
  return labels;
}

// 윈도우 드라이브 리스트 획득 헬퍼
function getWindowsDrives() {
  const drives = [];
  const labels = getWindowsDriveLabels();
  
  // powershell에서 수집한 드라이브 목록만 사용 (A-Z 스캔시 네트워크 드라이브 행 걸림 방지)
  const validLetters = Object.keys(labels).sort();
  
  for (const letter of validLetters) {
    const drivePath = letter + '\\';
    try {
      const info = labels[letter] || { volumeName: '', driveType: 3 };
      let name = info.volumeName;
      
      if (!name) {
        if (letter === 'C:') name = '로컬 디스크';
        else if (info.driveType === 5) name = 'CD 드라이브';
        else name = '로컬 디스크';
      }
      
      const formattedName = `${name} (${letter})`;
      drives.push({
        name: formattedName,
        path: drivePath,
        isDrive: true
      });
    } catch (e) {
      // 권한 문제 등 예외 디렉토리는 건너뜀
    }
  }
  
  if (drives.length === 0) {
    drives.push({
      name: '로컬 디스크 (C:)',
      path: 'C:\\',
      isDrive: true
    });
  }
  return drives;
}

// 1. 디렉토리 탐색 API
app.get('/api/explore', (req, res) => {
  let targetPath = req.query.path || DEFAULT_START_DIR;

  targetPath = path.normalize(targetPath);

  // 드라이브 목록 요청 처리 (path가 'drives'일 때)
  if (targetPath.toLowerCase() === 'drives') {
    const drives = getWindowsDrives();
    return res.json({
      currentPath: 'drives',
      parentPath: null,
      folders: drives,
      files: []
    });
  }

  try {
    // 디렉토리 존재 확인
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: '경로가 존재하지 않습니다.' });
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: '지정된 경로는 디렉토리가 아닙니다.' });
    }

    const parentPath = path.dirname(targetPath) === targetPath ? 'drives' : path.dirname(targetPath);
    const dirContents = fs.readdirSync(targetPath, { withFileTypes: true });

    const folders = [];
    const files = [];

    for (const entry of dirContents) {
      const entryPath = path.join(targetPath, entry.name);

      try {
        // 숨김 파일/폴더는 스킵 (윈도우에서 이름이 .으로 시작하는 파일 포함)
        if (entry.name.startsWith('.')) continue;

        if (entry.isDirectory()) {
          folders.push({
            name: entry.name,
            path: entryPath
          });
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === '.hwp' || ext === '.hwpx') {
            const fileStat = fs.statSync(entryPath);
            files.push({
              name: entry.name,
              path: entryPath,
              size: fileStat.size,
              birthtime: fileStat.birthtime || fileStat.ctime,
              mtime: fileStat.mtime
            });
          }
        }
      } catch (err) {
        // 특정 권한 없는 폴더나 깨진 링크 파일 등 읽기 실패 시 무시하고 진행
      }
    }

    // 이름순으로 정렬
    folders.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    files.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    // 윈도우 OneDrive 환경 변수 분석을 통한 실제 드라이브 경로 수집
    const onedrives = [];
    const envKeys = ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial'];
    const addedPaths = new Set();
    
    envKeys.forEach(key => {
      const odPath = process.env[key];
      if (odPath && fs.existsSync(odPath) && !addedPaths.has(odPath)) {
        addedPaths.add(odPath);
        const name = path.basename(odPath);
        onedrives.push({
          name: name === 'OneDrive' ? 'OneDrive - 개인' : name,
          path: odPath
        });
      }
    });

    res.json({
      currentPath: targetPath,
      parentPath,
      folders,
      files,
      onedrives
    });
  } catch (err) {
    console.error(`Failed to read path: ${targetPath}`, err);
    res.status(500).json({ error: '디렉토리를 읽지 못했습니다. 권한이 없거나 다른 프로세스에서 사용 중일 수 있습니다.' });
  }
});

// 2. 한글 파일 다운로드/스트림 API (파일 Lock 우회를 위해 fs.readFile 사용)
app.get('/api/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: '파일 경로가 필요합니다.' });
  }

  const normalizedPath = path.normalize(filePath);

  try {
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    const stat = fs.statSync(normalizedPath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: '지정된 경로는 파일이 아닙니다.' });
    }

    const ext = path.extname(normalizedPath).toLowerCase();
    if (ext !== '.hwp' && ext !== '.hwpx') {
      return res.status(400).json({ error: '한글 문서(.hwp, .hwpx) 파일만 읽을 수 있습니다.' });
    }

    // 파일 이름 인코딩 처리
    const safeName = path.basename(normalizedPath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    
    // 스트림 대신 완전히 파일을 다 읽은 후 즉시 닫아 윈도우 파일 락 예방
    fs.readFile(normalizedPath, (err, data) => {
      if (err) {
        console.error(`Failed to read file: ${normalizedPath}`, err);
        return res.status(500).json({ error: '파일을 읽어오지 못했습니다.' });
      }
      res.send(data);
    });
  } catch (err) {
    console.error(`Failed to stream file: ${normalizedPath}`, err);
    res.status(500).json({ error: '파일을 스트리밍하지 못했습니다.' });
  }
});

// 3. OS 시스템 오픈 API (한글 프로그램 연동 및 연결 앱 지정 지원 - hwp.exe 직접 경로 실행 지원)
// 윈도우 레지스트리에서 한글 프로그램(Hwp.exe) 경로를 찾는 헬퍼 함수
function findHwpExecutablePath() {
  const regPaths = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Hwp.exe',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Hwp.exe',
    'HKLM\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Hwp.exe',
    'HKCU\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Hwp.exe'
  ];

  for (const regPath of regPaths) {
    try {
      const regQuery = `reg query "${regPath}" /ve`;
      const output = execSync(regQuery, { encoding: 'utf8', timeout: 1000 });
      const match = output.match(/REG_SZ\s+(.+)/);
      if (match && match[1]) {
        const hwpPath = match[1].trim();
        if (fs.existsSync(hwpPath)) {
          return hwpPath;
        }
      }
    } catch (e) {
      // 개별 레지스트리 조회 실패 시 건너뜀
    }
  }

  // 표준 디렉토리 후보군 직접 탐색 (한글 2026, 2024, 2022, 2020, 2018, NEO(2016), 2014 및 구버전)
  const candidates = [
    'C:\\Program Files\\HNC\\Office 2026\\HOffice140\\Bin\\Hwp.exe',
    'C:\\Program Files\\HNC\\Office 2024\\HOffice130\\Bin\\Hwp.exe',
    'C:\\Program Files\\HNC\\Office 2022\\HOffice120\\Bin\\Hwp.exe',
    'C:\\Program Files\\HNC\\Office 2020\\HOffice110\\Bin\\Hwp.exe',
    'C:\\Program Files\\HNC\\Office 2018\\HOffice100\\Bin\\Hwp.exe',
    'C:\\Program Files\\HNC\\Office 2016\\HOffice96\\Bin\\Hwp.exe',
    'C:\\Program Files\\HNC\\Office 2014\\HOffice90\\Bin\\Hwp.exe',
    'C:\\Program Files (x86)\\HNC\\Office 2026\\HOffice140\\Bin\\Hwp.exe',
    'C:\\Program Files (x86)\\HNC\\Office 2024\\HOffice130\\Bin\\Hwp.exe',
    'C:\\Program Files (x86)\\HNC\\Office 2022\\HOffice120\\Bin\\Hwp.exe',
    'C:\\Program Files (x86)\\HNC\\Office 2020\\HOffice110\\Bin\\Hwp.exe',
    'C:\\Program Files (x86)\\HNC\\Office 2018\\HOffice100\\Bin\\Hwp.exe',
    'C:\\Program Files (x86)\\HNC\\Office 2016\\HOffice96\\Bin\\Hwp.exe',
    'C:\\Program Files (x86)\\HNC\\Office 2014\\HOffice90\\Bin\\Hwp.exe',
    'C:\\Program Files (x86)\\HNC\\Hwp80\\Hwp.exe'
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

app.post('/api/open-system', (req, res) => {
  const filePath = req.body.path;
  const targetApp = req.body.app; // 'notepad' or 'code' 등
  if (!filePath) {
    return res.status(400).json({ error: '파일 경로가 필요합니다.' });
  }
  
  const normalized = path.normalize(filePath);
  try {
    if (!fs.existsSync(normalized)) {
      return res.status(404).json({ error: '파일이 존재하지 않습니다.' });
    }
    
    const ext = path.extname(normalized).toLowerCase();
    
    // 일반 실행(더블클릭) 시 기본 연결 프로그램으로 우회 실행
    // Session 0 격리 및 백그라운드 멈춤 방지를 위해 cmd /c start 사용
    if (!targetApp) {
      console.log(`[System Start] Launching file via cmd start: ${normalized}`);
      try {
        const child = spawn('cmd.exe', ['/c', 'start', '""', normalized], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
        return res.json({ success: true, method: 'cmd_start' });
      } catch (err) {
        console.error('실행 실패:', err);
        return res.status(500).json({ error: '프로그램을 실행하지 못했습니다.' });
      }
    }
    
    let command = '';
    if (targetApp === 'notepad') {
      command = `notepad "${normalized}"`;
    } else if (targetApp === 'code') {
      command = `code "${normalized}"`;
    }
      // 텍스트 편집기(메모장, VS Code) 호출 시에도 비동기 spawn 활용
      const appCmd = targetApp === 'notepad' ? 'notepad.exe' : 'code';
      try {
        const child = spawn(appCmd, [normalized], {
          detached: true,
          stdio: 'ignore',
          shell: true
        });
        child.unref();
        res.json({ success: true, method: `${targetApp}_spawn` });
      } catch (err) {
        console.error(`${targetApp} 실행 실패 (spawn폴백):`, err);
        exec(command, (execErr) => {
          if (execErr) {
            return res.status(500).json({ error: `${targetApp} 프로그램으로 파일을 열지 못했습니다.` });
          }
          res.json({ success: true, method: `${targetApp}_exec` });
        });
      }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. 물리 파일 삭제 API
app.delete('/api/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: '파일 경로가 필요합니다.' });
  }
  
  const normalized = path.normalize(filePath);
  try {
    if (!fs.existsSync(normalized)) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
    
    const stat = fs.statSync(normalized);
    if (stat.isDirectory()) {
      fs.rmSync(normalized, { recursive: true, force: true });
    } else {
      fs.unlinkSync(normalized);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('파일 삭제 실패:', err);
    res.status(500).json({ error: '파일을 삭제하지 못했습니다. 권한이 없거나 사용 중일 수 있습니다.' });
  }
});

// 5. 물리 파일 복사 API
app.post('/api/copy', (req, res) => {
  const { src, destDir } = req.body;
  if (!src || !destDir) {
    return res.status(400).json({ error: '소스 경로와 목적지 폴더가 필요합니다.' });
  }
  
  const srcNormalized = path.normalize(src);
  const destDirNormalized = path.normalize(destDir);
  
  try {
    if (!fs.existsSync(srcNormalized)) {
      return res.status(404).json({ error: '복사할 소스 파일을 찾을 수 없습니다.' });
    }
    if (!fs.existsSync(destDirNormalized)) {
      return res.status(404).json({ error: '목적지 디렉토리가 존재하지 않습니다.' });
    }
    
    const baseName = path.basename(srcNormalized);
    let destPath = path.join(destDirNormalized, baseName);
    
    // 파일명 충돌 회피 (윈도우 복사본 네이밍 매핑)
    if (fs.existsSync(destPath)) {
      const ext = path.extname(baseName);
      const nameWithoutExt = path.basename(baseName, ext);
      let counter = 1;
      let candidateName = `${nameWithoutExt} - 복사본${ext}`;
      let candidatePath = path.join(destDirNormalized, candidateName);
      
      while (fs.existsSync(candidatePath)) {
        counter++;
        candidateName = `${nameWithoutExt} - 복사본 (${counter})${ext}`;
        candidatePath = path.join(destDirNormalized, candidateName);
      }
      destPath = candidatePath;
    }
    
    const stat = fs.statSync(srcNormalized);
    if (stat.isDirectory()) {
      if (fs.cpSync) {
        fs.cpSync(srcNormalized, destPath, { recursive: true });
      } else {
        return res.status(500).json({ error: '해당 환경은 디렉토리 복사를 지원하지 않습니다.' });
      }
    } else {
      fs.copyFileSync(srcNormalized, destPath);
    }
    
    res.json({ success: true, newPath: destPath });
  } catch (err) {
    console.error('파일 복사 실패:', err);
    res.status(500).json({ error: '파일 복사에 실패했습니다.' });
  }
});

// 6. 물리 파일 이동 및 이름 바꾸기 API
app.post('/api/move', (req, res) => {
  const { src, dest } = req.body;
  if (!src || !dest) {
    return res.status(400).json({ error: '소스 경로와 목적지 경로가 필요합니다.' });
  }
  
  const srcNormalized = path.normalize(src);
  let destNormalized = path.normalize(dest);
  
  try {
    if (!fs.existsSync(srcNormalized)) {
      return res.status(404).json({ error: '이동할 파일을 찾을 수 없습니다.' });
    }
    
    // dest가 존재하는 디렉토리이면 디렉토리 안으로 이동
    if (fs.existsSync(destNormalized) && fs.statSync(destNormalized).isDirectory()) {
      destNormalized = path.join(destNormalized, path.basename(srcNormalized));
    }
    
    if (srcNormalized === destNormalized) {
      return res.status(400).json({ error: '동일한 경로로는 이동할 수 없습니다.' });
    }
    
    if (fs.existsSync(destNormalized)) {
      return res.status(400).json({ error: '해당 경로에 동일한 이름의 파일이나 폴더가 이미 존재합니다.' });
    }
    
    try {
      fs.renameSync(srcNormalized, destNormalized);
    } catch (renameErr) {
      if (renameErr.code === 'EXDEV') {
        fs.cpSync(srcNormalized, destNormalized, { recursive: true });
        fs.rmSync(srcNormalized, { recursive: true, force: true });
      } else {
        throw renameErr;
      }
    }
    res.json({ success: true, newPath: destNormalized });
  } catch (err) {
    console.error('파일 이동 실패:', err);
    res.status(500).json({ error: '파일 이동 및 이름 바꾸기에 실패했습니다.' });
  }
});

// 서버 기동
app.listen(PORT, () => {
  console.log(`HwpLens Web Server running at http://localhost:${PORT}`);
});
