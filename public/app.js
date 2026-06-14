import init, { HwpDocument } from './rhwp.js';

// --- [썸네일 매니저 (지연 로딩)] ---
const thumbnailCache = new Map();
const thumbnailQueue = [];
let isProcessingThumbnail = false;
let thumbnailObserver = null;

function initThumbnailObserver() {
  thumbnailObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const path = entry.target.dataset.path;
        if (!path) return;
        
        if (thumbnailCache.has(path)) {
          applyThumbnail(entry.target, thumbnailCache.get(path));
          observer.unobserve(entry.target);
        } else {
          if (!thumbnailQueue.find(item => item.path === path)) {
            thumbnailQueue.push({ el: entry.target, path });
            processThumbnailQueue();
          }
        }
      }
    });
  }, { root: null, rootMargin: '50px', threshold: 0.1 });
}

async function processThumbnailQueue() {
  if (isProcessingThumbnail || thumbnailQueue.length === 0) return;
  isProcessingThumbnail = true;
  
  const item = thumbnailQueue.shift();
  try {
    if (!thumbnailCache.has(item.path)) {
      const wrapper = item.el.querySelector('.hwp-thumbnail-wrapper');
      if (wrapper) wrapper.classList.add('loading');
      
      const res = await fetch(`/api/file?path=${encodeURIComponent(item.path)}`);
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const doc = new HwpDocument(new Uint8Array(arrayBuffer));
        const svg = doc.renderPageSvg(0);
        thumbnailCache.set(item.path, svg);
        applyThumbnail(item.el, svg);
      }
      
      if (thumbnailObserver) thumbnailObserver.unobserve(item.el);
    }
  } catch (err) {
    console.error('썸네일 생성 실패:', item.path, err);
    const wrapper = item.el.querySelector('.hwp-thumbnail-wrapper');
    if (wrapper) {
      wrapper.classList.remove('loading');
      wrapper.innerHTML = `<div style="padding:10px;text-align:center;color:#999;font-size:12px;">미리보기 실패</div>`;
    }
  }
  
  isProcessingThumbnail = false;
  setTimeout(processThumbnailQueue, 50);
}

function applyThumbnail(el, svg) {
  const wrapper = el.querySelector('.hwp-thumbnail-wrapper');
  if (wrapper) {
    wrapper.classList.remove('loading');
    wrapper.innerHTML = svg;
  }
}
// -----------------------------------

// 1. 전역 상태 정의
const state = {
  currentPath: '',          // 현재 중앙 상세 뷰어 경로
  activeFilePath: '',       // 우측 미리보기 한글 파일 경로
  activeFileName: '',
  activeFile: null,         // 현재 선택/로드 중인 한글 파일 객체
  currentDoc: null,         // HwpDocument WASM 인스턴스
  currentPage: 0,           // 0-indexed
  totalPages: 0,
  zoom: 100,                // %단위
  zoomMode: 'fitWidth',     // 'fitWidth' (폭맞춤), 'fitPage' (쪽맞춤), 'custom' (배율지정)
  
  // 탐색기 내비게이션 히스토리 스택
  historyBack: [],
  historyForward: [],
  
  // 중앙 목록 원본 데이터 캐시 (검색/정렬용)
  currentFolders: [],
  currentFiles: [],

  // [신규] 정렬 상태
  sortField: 'name',        // 'name', 'date', 'type', 'size'
  sortOrder: 'asc',         // 'asc', 'desc'
  viewMode: 'content',

  // [신규] 클립보드 상태 (잘라내기/복사/붙여넣기)
  clipboard: {
    action: null, // 'copy' or 'cut'
    path: null,   // 대상 파일/폴더 절대 경로
    type: null    // 'file' or 'folder'
  },
  // [신규] 우클릭 타겟 정보
  contextTarget: {
    path: null,
    type: null,
    name: null,
    size: 0,
    mtime: null
  }
};

// 2. DOM 요소 매핑
const els = {
  // 상단 도구 모음 단추
  btnToggleSidebar: document.getElementById('btnToggleSidebar'),
  btnNew: document.getElementById('btnNew'),
  btnCut: document.getElementById('btnCut'),
  btnCopy: document.getElementById('btnCopy'),
  btnPaste: document.getElementById('btnPaste'),
  btnRename: document.getElementById('btnRename'),
  btnDelete: document.getElementById('btnDelete'),
  btnSort: document.getElementById('btnSort'),
  sortMenu: document.getElementById('sortMenu'),
  btnViewOption: document.getElementById('btnViewOption'),
  viewMenu: document.getElementById('viewMenu'),
  
  // 상단 네비게이션 단추 및 주소/검색
  btnBack: document.getElementById('btnBack'),
  btnForward: document.getElementById('btnForward'),
  btnUp: document.getElementById('btnUp'),
  btnRefresh: document.getElementById('btnRefresh'),
  breadcrumbList: document.getElementById('breadcrumbList'),
  addressInput: document.getElementById('addressInput'),
  searchInput: document.getElementById('searchInput'),
  
  // 왼쪽 패널 3단 영역
  quickAccessHeader: document.getElementById('quickAccessHeader'),
  quickAccessToggle: document.getElementById('quickAccessToggle'),
  quickAccessContainer: document.getElementById('quickAccessContainer'),
  treeContainer: document.getElementById('treeContainer'),
  fileListBody: document.getElementById('fileListBody'),
  itemsCountLabel: document.getElementById('itemsCountLabel'),
  welcomeScreen: document.getElementById('welcomeScreen'),
  viewerContent: document.getElementById('viewerContent'),
  viewerResizer: document.getElementById('viewerResizer'),
  sidebarResizer: document.getElementById('sidebarResizer'),
  viewerArea: document.querySelector('.viewer-area'),
  sidebarTree: document.querySelector('.sidebar-tree'),
  
  // 한글 뷰어 요소
  docName: document.getElementById('docName'),
  docTypeBadge: document.getElementById('docTypeBadge'),
  docPagesBadge: document.getElementById('docPagesBadge'),
  docSizeBadge: document.getElementById('docSizeBadge'),
  docModifiedDate: document.getElementById('docModifiedDate'),
  
  btnPrevPage: document.getElementById('btnPrevPage'),
  btnNextPage: document.getElementById('btnNextPage'),
  lblCurrentPage: document.getElementById('lblCurrentPage'),
  lblTotalPages: document.getElementById('lblTotalPages'),
  
  btnZoomOut: document.getElementById('btnZoomOut'),
  btnZoomIn: document.getElementById('btnZoomIn'),
  btnFitWidth: document.getElementById('btnFitWidth'),
  btnReloadDoc: document.getElementById('btnReloadDoc'),
  lblZoom: document.getElementById('lblZoom'),
  
  viewerViewport: document.getElementById('viewerViewport'),
  svgContainer: document.getElementById('svgContainer'),
  toast: document.getElementById('toast'),

  // [신규] 우클릭 컨텍스트 메뉴 및 툴바 매핑
  contextMenu: document.getElementById('contextMenu'),
  ctxCut: document.getElementById('ctxCut'),
  ctxCopy: document.getElementById('ctxCopy'),
  ctxRename: document.getElementById('ctxRename'),
  ctxDelete: document.getElementById('ctxDelete'),
  ctxOpen: document.getElementById('ctxOpen'),
  ctxPin: document.getElementById('ctxPin'),
  ctxCopyPath: document.getElementById('ctxCopyPath'),
  ctxProperties: document.getElementById('ctxProperties'),
  
  
  
  // [신규] 속성 보기 모달 매핑
  propertiesModal: document.getElementById('propertiesModal'),
  btnCloseProps: document.getElementById('btnCloseProps'),
  btnPropConfirm: document.getElementById('btnPropConfirm'),
  btnPropCancel: document.getElementById('btnPropCancel'),
  propFileName: document.getElementById('propFileName'),
  propFileType: document.getElementById('propFileType'),
  propFilePath: document.getElementById('propFilePath'),
  propFileSize: document.getElementById('propFileSize'),
  propFileMtime: document.getElementById('propFileMtime'),
  propTitleName: document.getElementById('propTitleName')
};

// 3. 텍스트 너비 측정 헬퍼 (rhwp 라이브러리 연동 필수)
globalThis.measureTextWidth = (font, text) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
};

// 4. 알림 (Toast) 유틸리티
function showToast(message, isError = false) {
  if (!els.toast) {
    console.log(`[Toast] ${message} (isError: ${isError})`);
    return;
  }
  els.toast.textContent = message;
  if (isError) {
    els.toast.classList.add('error');
  } else {
    els.toast.classList.remove('error');
  }
  els.toast.classList.remove('hidden');
  
  if (els.toast.timeoutId) clearTimeout(els.toast.timeoutId);
  els.toast.timeoutId = setTimeout(() => {
    els.toast.classList.add('hidden');
  }, 2500);
}

// 5. 파일 용량 포맷팅 헬퍼
function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 6. 날짜 포맷팅 헬퍼
function formatDate(dateString) {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return '-';
  }
}

// 6.2 초기 레이아웃 복원 및 기본 비율 세팅 함수
function initLayout() {
  const savedSidebarWidth = localStorage.getItem('hwplens_sidebar_width');
  const savedViewerWidth = localStorage.getItem('hwplens_viewer_width');
  const savedSidebarCollapsed = localStorage.getItem('hwplens_sidebar_collapsed');

  // 1. 좌측 탐색 창 접힘 상태 복원
  if (savedSidebarCollapsed === 'true') {
    els.sidebarTree.classList.add('collapsed-sidebar');
    els.btnToggleSidebar.classList.remove('active');
  } else {
    els.sidebarTree.classList.remove('collapsed-sidebar');
    els.btnToggleSidebar.classList.add('active');
  }

  // 2. 좌측 탐색 창 너비 설정
  let sidebarWidth = savedSidebarWidth ? parseInt(savedSidebarWidth, 10) : 260;
  if (sidebarWidth < 160) sidebarWidth = 160;
  if (sidebarWidth > 500) sidebarWidth = 500;
  els.sidebarTree.style.width = `${sidebarWidth}px`;

  // 3. 우측 미리보기 창 너비 설정
  let viewerWidth;
  const sidebarActualWidth = (savedSidebarCollapsed === 'true') ? 0 : sidebarWidth;
  if (savedViewerWidth) {
    viewerWidth = parseInt(savedViewerWidth, 10);
  } else {
    // 최초 실행 시 기본값: 화면 너비에서 좌측 창과 중앙 목록(450px)을 제외한 나머지 할당 (미리보기가 제일 크게 함)
    viewerWidth = window.innerWidth - sidebarActualWidth - 450;
  }

  // 중앙 영역 최소 80px 보장을 위한 미리보기 최대 너비 제한
  const maxViewerWidth = window.innerWidth - sidebarActualWidth - 80;
  if (viewerWidth < 0) viewerWidth = 0;
  if (viewerWidth > maxViewerWidth) viewerWidth = maxViewerWidth;

  els.viewerArea.style.width = `${viewerWidth}px`;
}

// 6.3 실제 파일 관리 조작(CRUD), 드래그 앤 드롭 및 윈도우 11 우클릭 기능 연동 함수군
async function deleteFilePhysical(filePath) {
  if (!confirm(`정말로 이 항목을 삭제하시겠습니까?\n실제 파일 시스템에서 영구히 삭제됩니다.\n\n경로: ${filePath}`)) return;
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '삭제 실패');
    }
    showToast('삭제 완료되었습니다.');
    explorePath(state.currentPath);
    refreshParentTreeNode(filePath);
    
    // 만약 지운 파일이 현재 뷰어에 열려 있던 파일이면 뷰어 리셋
    if (state.activeFilePath === filePath) {
      state.activeFile = null;
      state.activeFilePath = '';
      state.activeFileName = '';
      if (state.currentDoc) {
        try { state.currentDoc.free(); } catch(e) {}
        state.currentDoc = null;
      }
      els.viewerContent.classList.add('hidden');
      els.welcomeScreen.classList.remove('hidden');
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

async function openFileInSystem(filePath, appName = null) {
  try {
    const res = await fetch('/api/open-system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, app: appName })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '실행 실패');
    }
    if (appName) {
      showToast(`${appName === 'code' ? 'VS Code' : '메모장'}을 호출하였습니다.`);
    } else {
      showToast('한글 프로그램을 호출하였습니다.');
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

async function pasteFilePhysical(srcPath, destDir, action) {
  if (!srcPath || !destDir) return;
  const isCopy = action === 'copy';
  const apiUrl = isCopy ? '/api/copy' : '/api/move';
  const bodyData = isCopy ? { src: srcPath, destDir } : { src: srcPath, dest: destDir };
  
  try {
    showToast(isCopy ? '복사 중...' : '이동 중...');
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '작업 실패');
    }
    
    showToast(isCopy ? '복사 완료되었습니다.' : '이동 완료되었습니다.');
    
    if (!isCopy) {
      state.clipboard = { action: null, path: null, type: null };
      updateToolbarClipboardButtons();
    }
    
    explorePath(state.currentPath);
    refreshParentTreeNode(srcPath);
    refreshParentTreeNode(destDir);
  } catch (err) {
    showToast(err.message, true);
  }
}

function refreshParentTreeNode(targetPath) {
  if (!targetPath || targetPath === 'drives') return;
  const parentPath = targetPath.substring(0, targetPath.lastIndexOf('\\')) || 'drives';
  
  const parentNode = document.querySelector(`.tree-node[data-path="${CSS.escape(parentPath)}"]`);
  if (parentNode) {
    parentNode.setAttribute('data-loaded', 'false');
    const childrenContainer = parentNode.nextElementSibling;
    if (childrenContainer && !childrenContainer.classList.contains('hidden')) {
      toggleFolderNode(parentNode, childrenContainer, parentPath);
    }
  }
}

// 클립보드에 복사/잘라내기 적용 헬퍼
function setClipboard(action, path, type) {
  state.clipboard = { action, path, type };
  updateToolbarClipboardButtons();
  showToast(action === 'copy' ? '항목을 복사했습니다.' : '항목을 잘라냈습니다.');
}

function updateToolbarClipboardButtons() {
  const hasItem = !!state.clipboard.path;
  if (hasItem) {
    els.btnPaste.classList.remove('disabled');
  } else {
    els.btnPaste.classList.add('disabled');
  }
}

function showPropertiesModal(targetInfo) {
  if (!targetInfo || targetInfo.type === 'none') return;
  
  const isFile = targetInfo.type === 'file';
  els.propTitleName.textContent = isFile ? '파일' : '폴더';
  els.propFileName.value = targetInfo.name || '';
  
  let extension = '';
  if (isFile) {
    extension = targetInfo.name.split('.').pop().toUpperCase();
    els.propFileType.textContent = `한글 문서 (.${extension.toLowerCase()})`;
    els.propFileApp.innerHTML = `<i data-lucide="external-link" class="inline-icon"></i> 한글 (${extension}) 프로그램`;
  } else {
    els.propFileType.textContent = '파일 폴더';
    els.propFileApp.innerHTML = `<i data-lucide="external-link" class="inline-icon"></i> Windows 탐색기`;
  }
  
  els.propFilePath.textContent = targetInfo.path || '';
  els.propFileSize.textContent = formatBytes(targetInfo.size || 0) + ` (${targetInfo.size || 0} Bytes)`;
  els.propFileMtime.textContent = formatDate(targetInfo.mtime) || '-';
  
  els.propertiesModal.classList.remove('hidden');
  lucide.createIcons();
}

function startInlineRename(rowEl, oldPath, oldName) {
  const nameCell = rowEl.querySelector('.file-name-txt');
  if (!nameCell) return;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-rename-input';
  input.value = oldName;
  
  nameCell.style.display = 'none';
  nameCell.parentNode.appendChild(input);
  input.focus();
  
  const dotIndex = oldName.lastIndexOf('.');
  if (dotIndex > 0) {
    input.setSelectionRange(0, dotIndex);
  } else {
    input.select();
  }
  
  let isSubmitted = false;
  const submitRename = async () => {
    if (isSubmitted) return;
    isSubmitted = true;
    
    const newName = input.value.trim();
    input.remove();
    nameCell.style.display = '';
    
    if (!newName || newName === oldName) return;
    
    const parentDir = oldPath.substring(0, oldPath.lastIndexOf('\\'));
    const newPath = parentDir + (parentDir.endsWith('\\') ? '' : '\\') + newName;
    
    try {
      const res = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: oldPath, dest: newPath })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '이름 변경 실패');
      }
      
      showToast('이름이 변경되었습니다.');
      explorePath(state.currentPath);
      refreshParentTreeNode(oldPath);
    } catch (err) {
      showToast(err.message, true);
    }
  };
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitRename();
    } else if (e.key === 'Escape') {
      isSubmitted = true;
      input.remove();
      nameCell.style.display = '';
    }
  });
  
  input.addEventListener('blur', submitRename);
}

function showContextMenu(e, targetInfo) {
  e.preventDefault();
  state.contextTarget = targetInfo;
  
  const isFile = targetInfo.type === 'file';
  const isFolder = targetInfo.type === 'folder';
  const isNone = targetInfo.type === 'none';
  
  // 가로 버튼 제어
  document.getElementById('ctxCut').classList.toggle('disabled', isNone);
  document.getElementById('ctxCopy').classList.toggle('disabled', isNone);
  document.getElementById('ctxRename').classList.toggle('disabled', isNone);
  document.getElementById('ctxDelete').classList.toggle('disabled', isNone);
  
  // 세로 목록 메뉴 제어
  els.ctxOpen.classList.toggle('disabled', isNone);
  els.ctxPin.classList.toggle('disabled', !isFolder);
  els.ctxCopyPath.classList.toggle('disabled', isNone);
  els.ctxProperties.classList.toggle('disabled', isNone);
  
  
  
  
  const menuWidth = 260;
  const menuHeight = 390;
  let posX = e.clientX;
  let posY = e.clientY;
  
  if (posX + menuWidth > window.innerWidth) posX = window.innerWidth - menuWidth - 10;
  if (posY + menuHeight > window.innerHeight) posY = window.innerHeight - menuHeight - 10;
  
  els.contextMenu.style.left = `${posX}px`;
  els.contextMenu.style.top = `${posY}px`;
  els.contextMenu.classList.remove('hidden');
  
  lucide.createIcons();
}

// 6.5 즐겨찾기 (Quick Access) 및 기본 폴더 바로가기 동적 생성 함수
function buildQuickAccess(homePath, homeFolders = [], onedrives = []) {
  const container = els.quickAccessContainer;
  if (!container) return;
  container.innerHTML = '';
  
  // 사용자 홈 폴더를 조상으로 삼는 표준 윈도우 절대 경로 조립
  const paths = {
    home: homePath,
    gallery: `${homePath}\\Pictures`,
    desktop: `${homePath}\\Desktop`,
    downloads: `${homePath}\\Downloads`,
    documents: `${homePath}\\Documents`,
    pictures: `${homePath}\\Pictures`,
    music: `${homePath}\\Music`,
    videos: `${homePath}\\Videos`
  };

  // [1구역] 홈, 갤러리
  createQuickAccessNode(container, { name: '홈', path: paths.home, icon: 'home', iconClass: 'home-icon' });
  createQuickAccessNode(container, { name: '갤러리', path: paths.gallery, icon: 'image', iconClass: 'gallery-icon' });
  
  const addedPaths = new Set();
  
  // 1순위: OS 환경 변수에서 감지된 실제 원드라이브 경로 바인딩 (다른 드라이브에 있더라도 매칭 가능)
  if (Array.isArray(onedrives) && onedrives.length > 0) {
    onedrives.forEach(od => {
      addedPaths.add(od.path.toLowerCase());
      createQuickAccessTreeLink(container, od.name, od.path, 'cloud', 'cloud-icon');
    });
  }
  
  // 2순위: 홈 디렉토리 내에 실제로 존재하는 OneDrive 폴더들 감지하여 백업 연동
  const onedriveFolders = homeFolders.filter(f => f.name.toLowerCase().startsWith('onedrive') || f.name.includes('OneDrive'));
  onedriveFolders.forEach(od => {
    if (!addedPaths.has(od.path.toLowerCase())) {
      addedPaths.add(od.path.toLowerCase());
      let displayName = od.name;
      if (od.name === 'OneDrive') {
        displayName = 'OneDrive - 개인';
      }
      createQuickAccessTreeLink(container, displayName, od.path, 'cloud', 'cloud-icon');
    }
  });

  // 구분선
  const divider = document.createElement('div');
  divider.className = 'sidebar-divider-h';
  container.appendChild(divider);

  // [2구역] 고정 즐겨찾기 폴더 리스트
  const pinItems = [
    { name: '바탕 화면', path: paths.desktop, icon: 'monitor', iconClass: 'desktop-icon' },
    { name: '다운로드', path: paths.downloads, icon: 'download', iconClass: 'downloads-icon' },
    { name: '문서', path: paths.documents, icon: 'file-text', iconClass: 'documents-icon' },
    { name: '사진', path: paths.pictures, icon: 'image', iconClass: 'pictures-icon' },
    { name: '음악', path: paths.music, icon: 'music', iconClass: 'music-icon' },
    { name: '동영상', path: paths.videos, icon: 'film', iconClass: 'videos-icon' }
  ];

  pinItems.forEach(item => {
    createQuickAccessNode(container, item);
  });
}

function createQuickAccessNode(parent, item) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'tree-node';
  nodeEl.setAttribute('data-path', item.path);
  
  // 화살표 대신 윈도우 스타일 줄맞춤을 위한 보이지 않는 영역 스페이서
  const dummyArrow = document.createElement('span');
  dummyArrow.className = 'tree-toggle-arrow hidden-arrow';
  dummyArrow.innerHTML = '<i data-lucide="chevron-right"></i>';
  
  const iconEl = document.createElement('span');
  iconEl.className = `node-icon ${item.iconClass || ''}`;
  iconEl.innerHTML = `<i data-lucide="${item.icon}"></i>`;
  
  const textEl = document.createElement('span');
  textEl.className = 'node-text';
  textEl.textContent = item.name;
  
  nodeEl.appendChild(dummyArrow);
  nodeEl.appendChild(iconEl);
  nodeEl.appendChild(textEl);
  
  nodeEl.addEventListener('click', () => {
    document.querySelectorAll('.tree-node').forEach(el => el.classList.remove('active-path'));
    nodeEl.classList.add('active-path');
    explorePath(item.path);
  });

  // [신규] 우클릭 컨텍스트 메뉴
  nodeEl.addEventListener('contextmenu', (e) => {
    e.stopPropagation();
    showContextMenu(e, {
      type: 'folder',
      path: item.path,
      name: item.name,
      size: 0,
      mtime: null
    });
  });

  // [신규] 드래그 앤 드롭 수신
  nodeEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    nodeEl.classList.add('drag-over');
    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
  });

  nodeEl.addEventListener('dragleave', () => {
    nodeEl.classList.remove('drag-over');
  });

  nodeEl.addEventListener('drop', (e) => {
    e.preventDefault();
    nodeEl.classList.remove('drag-over');
    const srcPath = e.dataTransfer.getData('text/plain');
    const action = e.ctrlKey ? 'copy' : 'move';
    pasteFilePhysical(srcPath, item.path, action);
  });
  
  parent.appendChild(nodeEl);
}

function createQuickAccessTreeLink(parent, name, path, icon, iconClass) {
  const nodeFrame = document.createElement('div');
  nodeFrame.className = 'tree-node-frame';

  const nodeEl = document.createElement('div');
  nodeEl.className = 'tree-node';
  nodeEl.setAttribute('data-path', path);
  nodeEl.setAttribute('data-loaded', 'false');
  nodeEl.setAttribute('data-open', 'false');

  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'tree-toggle-arrow';
  arrowSpan.innerHTML = '<i data-lucide="chevron-right"></i>';

  const iconEl = document.createElement('span');
  iconEl.className = `node-icon ${iconClass || ''}`;
  iconEl.innerHTML = `<i data-lucide="${icon}"></i>`;

  const textSpan = document.createElement('span');
  textSpan.className = 'node-text';
  textSpan.textContent = name;

  nodeEl.appendChild(arrowSpan);
  nodeEl.appendChild(iconEl);
  nodeEl.appendChild(textSpan);
  nodeFrame.appendChild(nodeEl);

  const childrenContainer = document.createElement('div');
  childrenContainer.className = 'tree-children-container hidden';
  nodeFrame.appendChild(childrenContainer);

  arrowSpan.addEventListener('click', async (e) => {
    e.stopPropagation();
    await toggleFolderNode(nodeEl, childrenContainer, path);
  });

  nodeEl.addEventListener('click', async () => {
    document.querySelectorAll('.tree-node').forEach(el => el.classList.remove('active-path'));
    nodeEl.classList.add('active-path');
    explorePath(path);
    await toggleFolderNode(nodeEl, childrenContainer, path);
  });

  // [신규] 우클릭 컨텍스트 메뉴
  nodeEl.addEventListener('contextmenu', (e) => {
    e.stopPropagation();
    showContextMenu(e, {
      type: 'folder',
      path: path,
      name: name,
      size: 0,
      mtime: null
    });
  });

  // [신규] 드래그 앤 드롭 수신
  nodeEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    nodeEl.classList.add('drag-over');
    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
  });

  nodeEl.addEventListener('dragleave', () => {
    nodeEl.classList.remove('drag-over');
  });

  nodeEl.addEventListener('drop', (e) => {
    e.preventDefault();
    nodeEl.classList.remove('drag-over');
    const srcPath = e.dataTransfer.getData('text/plain');
    const action = e.ctrlKey ? 'copy' : 'move';
    pasteFilePhysical(srcPath, path, action);
  });

  parent.appendChild(nodeFrame);
}

// 7. 계층 트리 생성 및 제어 로직
async function initDriveTree() {
  els.treeContainer.innerHTML = '';
  try {
    // 윈도우 드라이브 리스트 API 호출
    const res = await fetch('/api/explore?path=drives');
    if (!res.ok) throw new Error('드라이브를 조회하지 못했습니다.');
    
    const data = await res.json();
    
    data.folders.forEach(drive => {
      createTreeNode(els.treeContainer, drive.name, drive.path, true);
    });
  } catch (err) {
    console.error(err);
    els.treeContainer.innerHTML = `<div class="tree-loading" style="color:#ef4444;">드라이브 목록 로딩 오류</div>`;
  }
}

/**
 * 트리 노드 엘리먼트 동적 생성 함수
 */
function createTreeNode(parentContainer, name, path, isDrive = false) {
  // 노드 프레임 컨테이너
  const nodeFrame = document.createElement('div');
  nodeFrame.className = 'tree-node-frame';
  
  // 노드 헤더 (화살표, 아이콘, 텍스트)
  const nodeEl = document.createElement('div');
  nodeEl.className = 'tree-node';
  nodeEl.setAttribute('data-path', path);
  nodeEl.setAttribute('data-loaded', 'false');
  nodeEl.setAttribute('data-open', 'false');
  
  // 화살표 (초기 닫힘 상태: chevron-right)
  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'tree-toggle-arrow';
  arrowSpan.innerHTML = '<i data-lucide="chevron-right"></i>';
  
  // 아이콘
  const iconName = isDrive ? 'hard-drive' : 'folder';
  const iconClass = isDrive ? 'node-icon drive-icon' : 'node-icon';
  const iconEl = document.createElement('span');
  iconEl.className = iconClass;
  iconEl.innerHTML = `<i data-lucide="${iconName}"></i>`;
  
  // 텍스트 (아이콘과 더 띄우기 위해 마진 적용 가능)
  const textSpan = document.createElement('span');
  textSpan.className = 'node-text';
  textSpan.textContent = name;
  textSpan.title = name;
  
  nodeEl.appendChild(arrowSpan);
  nodeEl.appendChild(iconEl);
  nodeEl.appendChild(textSpan);
  nodeFrame.appendChild(nodeEl);
  
  // 하위 자식 노드들을 담을 컨테이너
  const childrenContainer = document.createElement('div');
  childrenContainer.className = 'tree-children-container hidden';
  nodeFrame.appendChild(childrenContainer);
  
  // [이벤트 1] 화살표 클릭 시: 폴더 트리 열고 닫기 (동적 자식 렌더링 포함)
  arrowSpan.addEventListener('click', async (e) => {
    e.stopPropagation(); // 노드 클릭 이벤트 전파 차단
    await toggleFolderNode(nodeEl, childrenContainer, path);
  });
  
  // [이벤트 2] 노드 자체 클릭 시: 중앙 목록 뷰 갱신 및 내비게이션 + 열고 닫기 토글 연동
  nodeEl.addEventListener('click', async () => {
    // 트리 포커스 이동
    document.querySelectorAll('.tree-node').forEach(el => el.classList.remove('active-path'));
    nodeEl.classList.add('active-path');
    
    // 중앙 리스트 갱신
    explorePath(path);
    
    // 트리 계층 토글
    await toggleFolderNode(nodeEl, childrenContainer, path);
  });

  // [신규 이벤트] 우클릭 컨텍스트 메뉴
  nodeEl.addEventListener('contextmenu', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.tree-node').forEach(el => el.classList.remove('active-path'));
    nodeEl.classList.add('active-path');
    showContextMenu(e, {
      type: isDrive ? 'drive' : 'folder',
      path: path,
      name: name,
      size: 0,
      mtime: null
    });
  });

  // [신규 이벤트] 드래그 앤 드롭 수신
  nodeEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    nodeEl.classList.add('drag-over');
    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
  });

  nodeEl.addEventListener('dragleave', () => {
    nodeEl.classList.remove('drag-over');
  });

  nodeEl.addEventListener('drop', (e) => {
    e.preventDefault();
    nodeEl.classList.remove('drag-over');
    const srcPath = e.dataTransfer.getData('text/plain');
    const action = e.ctrlKey ? 'copy' : 'move';
    pasteFilePhysical(srcPath, path, action);
  });
  
  parentContainer.appendChild(nodeFrame);
  lucide.createIcons({ attrs: { 'data-lucide': true } });
}

/**
 * 특정 트리 노드 확장/축소 토글
 */
async function toggleFolderNode(nodeEl, childrenContainer, path) {
  const isLoaded = nodeEl.getAttribute('data-loaded') === 'true';
  const isOpen = nodeEl.getAttribute('data-open') === 'true';
  const arrow = nodeEl.querySelector('.tree-toggle-arrow');
  
  if (isOpen) {
    // 닫기
    childrenContainer.classList.add('hidden');
    nodeEl.setAttribute('data-open', 'false');
    arrow.innerHTML = '<i data-lucide="chevron-right"></i>';
    lucide.createIcons({ attrs: { 'data-lucide': true } });
  } else {
    // 열기
    if (!isLoaded) {
      childrenContainer.innerHTML = `
        <div class="tree-loading">
          <div class="small-spinner"></div>
          <span>불러오는 중...</span>
        </div>
      `;
      childrenContainer.classList.remove('hidden');
      nodeEl.setAttribute('data-open', 'true');
      arrow.innerHTML = '<i data-lucide="chevron-down"></i>';
      lucide.createIcons({ attrs: { 'data-lucide': true } });
      
      try {
        const url = `/api/explore?path=${encodeURIComponent(path)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        
        const data = await res.json();
        childrenContainer.innerHTML = '';
        
        if (data.folders.length === 0) {
          // 하위 폴더가 없으면 화살표 숨김 처리
          arrow.classList.add('hidden-arrow');
        } else {
          data.folders.forEach(subFolder => {
            createTreeNode(childrenContainer, subFolder.name, subFolder.path, false);
          });
        }
        nodeEl.setAttribute('data-loaded', 'true');
      } catch (err) {
        childrenContainer.innerHTML = `<div class="tree-loading" style="color:#ef4444;">조회 실패</div>`;
        nodeEl.setAttribute('data-open', 'false');
        arrow.innerHTML = '<i data-lucide="chevron-right"></i>';
        lucide.createIcons({ attrs: { 'data-lucide': true } });
      }
    } else {
      childrenContainer.classList.remove('hidden');
      nodeEl.setAttribute('data-open', 'true');
      arrow.innerHTML = '<i data-lucide="chevron-down"></i>';
      lucide.createIcons({ attrs: { 'data-lucide': true } });
    }
  }
}

// 8. 중앙 리스트 탐색 및 상태 동기화 함수
async function explorePath(targetPath = '', isHistoryAction = false) {
  // 히스토리 트래킹
  if (!isHistoryAction && state.currentPath) {
    state.historyBack.push(state.currentPath);
    state.historyForward = []; // 새 탐색 발생 시 포워드 히스토리 초기화
  }
  
  els.fileListBody.innerHTML = `
    <tr>
      <td colspan="1" class="table-empty-message">
        <div class="small-spinner" style="display:inline-block; margin-right:8px; vertical-align:middle;"></div>
        파일 및 폴더 읽는 중...
      </td>
    </tr>
  `;
  
  try {
    const url = `/api/explore?path=${encodeURIComponent(targetPath)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || '폴더 정보를 불러오지 못했습니다.');
    }
    
    const data = await res.json();
    state.currentPath = data.currentPath;
    
    // 캐시 저장
    state.currentFolders = data.folders;
    state.currentFiles = data.files;
    
    // 네비게이션 버튼 활성화 체크
    updateNavigationButtons();
    
    // 브레드크럼 주소 업데이트
    renderBreadcrumb(data.currentPath);
    
    // 상세 테이블 데이터 출력
    renderFileListTable(sortItems(state.currentFolders), sortItems(state.currentFiles));
    
    // 좌측 트리 뷰 활성화 상태 동기화 (트리에 노드가 있다면)
    syncTreeActiveState(data.currentPath);
    
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
    els.fileListBody.innerHTML = `
      <tr>
        <td colspan="1" class="table-empty-message" style="color:#ef4444;">
          <i data-lucide="alert-circle" style="vertical-align:middle; margin-right:6px;"></i>
          오류: ${err.message}
        </td>
      </tr>
    `;
    lucide.createIcons();
  }
}

/**
 * 네비게이션 버튼들의 활성 상태 갱신
 */
function updateNavigationButtons() {
  // 뒤로가기
  if (state.historyBack.length > 0) {
    els.btnBack.classList.remove('disabled');
  } else {
    els.btnBack.classList.add('disabled');
  }
  
  // 앞으로가기
  if (state.historyForward.length > 0) {
    els.btnForward.classList.remove('disabled');
  } else {
    els.btnForward.classList.add('disabled');
  }
  
  // 상위 폴더 단추
  if (!state.currentPath || state.currentPath === 'drives') {
    els.btnUp.classList.add('disabled');
  } else {
    els.btnUp.classList.remove('disabled');
  }
}

/**
 * 윈도우 11 스타일 브레드크럼(주소창) 렌더링
 */
function renderBreadcrumb(pathString) {
  els.breadcrumbList.innerHTML = '';
  
  // 루트 (내 PC)
  const rootItem = document.createElement('span');
  rootItem.className = 'breadcrumb-item';
  rootItem.textContent = '내 PC';
  rootItem.addEventListener('click', () => explorePath('drives'));
  els.breadcrumbList.appendChild(rootItem);
  
  if (!pathString || pathString === 'drives') {
    els.addressInput.value = '내 PC';
    return;
  }
  
  els.addressInput.value = pathString;
  
  // 경로 슬라이싱 (윈도우 기준 백슬래시 분리)
  const parts = pathString.split('\\').filter(p => p !== '');
  
  parts.forEach((part, index) => {
    // 구분선 삽입
    const separator = document.createElement('span');
    separator.className = 'breadcrumb-separator';
    separator.innerHTML = '<i data-lucide="chevron-right"></i>';
    els.breadcrumbList.appendChild(separator);
    
    // 경로 조각 이름 파싱 (드라이브 명칭 보완)
    let displayName = part;
    if (index === 0 && part.endsWith(':')) {
      displayName = `로컬 디스크 (${part})`;
    }
    
    const item = document.createElement('span');
    item.className = 'breadcrumb-item';
    item.textContent = displayName;
    
    // 해당 시점까지의 조각 경로 조립
    const targetPath = parts.slice(0, index + 1).join('\\') + (index === 0 ? '\\' : '');
    item.addEventListener('click', () => explorePath(targetPath));
    
    els.breadcrumbList.appendChild(item);
  });
  
  lucide.createIcons({ attrs: { 'data-lucide': true } });
}

/**
 * 좌측 트리의 활성 액티브 상태 및 경로 매칭 동기화
 */
function syncTreeActiveState(pathString) {
  document.querySelectorAll('.tree-node').forEach(node => {
    if (node.getAttribute('data-path') === pathString) {
      node.classList.add('active-path');
      
      // 조상 트리 노드들을 전부 보이도록 펼침
      let parentFrame = node.closest('.tree-node-frame')?.parentElement?.closest('.tree-node-frame');
      while (parentFrame) {
        const parentNode = parentFrame.querySelector('.tree-node');
        const parentChildren = parentFrame.querySelector('.tree-children-container');
        if (parentNode && parentChildren && parentChildren.classList.contains('hidden')) {
          parentChildren.classList.remove('hidden');
          parentNode.setAttribute('data-open', 'true');
          const parentArrow = parentNode.querySelector('.tree-toggle-arrow');
          if (parentArrow) {
            parentArrow.innerHTML = '<i data-lucide="chevron-down"></i>';
          }
        }
        parentFrame = parentFrame.parentElement?.closest('.tree-node-frame');
      }
      lucide.createIcons({ attrs: { 'data-lucide': true } });
    } else {
      node.classList.remove('active-path');
    }
  });
}

// [신규] 정렬 헬퍼 함수
function sortItems(items) {
  return items.slice().sort((a, b) => {
    let valA, valB;
    if (state.sortField === 'name') {
      valA = (a.name || '').toLowerCase();
      valB = (b.name || '').toLowerCase();
    } else if (state.sortField === 'date') {
      valA = new Date(a.mtime || 0).getTime();
      valB = new Date(b.mtime || 0).getTime();
    } else if (state.sortField === 'size') {
      valA = a.size || 0;
      valB = b.size || 0;
    } else if (state.sortField === 'type') {
      valA = a.type === 'folder' ? 0 : 1;
      valB = b.type === 'folder' ? 0 : 1;
      if (valA === valB) {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      }
    }
    
    if (valA < valB) return state.sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return state.sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
}

// 9. 중앙 상세 정보 테이블 데이터 렌더링
function renderFileListTable(folders, files) {
  // 기존 동적 그리드 컨테이너 정리
  const tableEl = document.querySelector('.explorer-table');
  const wrapperEl = document.querySelector('.list-table-wrapper');
  let gridEl = document.getElementById('fileListGrid');
  
  if (state.viewMode === 'details') {
    // 테이블 뷰 활성화
    if (gridEl) gridEl.remove();
    tableEl.classList.remove('hidden');
    els.fileListBody.innerHTML = '';
  } else {
    // 그리드 뷰 활성화
    tableEl.classList.add('hidden');
    if (!gridEl) {
      gridEl = document.createElement('div');
      gridEl.id = 'fileListGrid';
      wrapperEl.appendChild(gridEl);
    }
    gridEl.className = `explorer-grid view-${state.viewMode}`;
    gridEl.innerHTML = '';
  }

  const totalCount = folders.length + files.length;
  els.itemsCountLabel.textContent = `${totalCount}개 항목`;
  
  if (totalCount === 0) {
    if (state.viewMode === 'details') {
      els.fileListBody.innerHTML = `
        <tr>
          <td colspan="1" class="table-empty-message">
            폴더가 비어 있습니다.
          </td>
        </tr>
      `;
    } else {
      gridEl.innerHTML = `
        <div class="table-empty-message" style="width: 100%;">
          폴더가 비어 있습니다.
        </div>
      `;
    }
    return;
  }
  
  // [1] 폴더 렌더링
  folders.forEach(folder => {
    let el;
    if (state.viewMode === 'details') {
      el = document.createElement('tr');
      el.setAttribute('data-type', 'folder');
      el.setAttribute('data-path', folder.path);
      el.draggable = true;
      el.innerHTML = `
        <td class="col-name">
          <div class="name-cell-content">
            <span class="folder-icon"><i data-lucide="folder"></i></span>
            <span class="file-name-txt">${folder.name}</span>
          </div>
        </td>
      `;
    } else {
      el = document.createElement('div');
      el.className = 'grid-item';
      el.setAttribute('data-type', 'folder');
      el.setAttribute('data-path', folder.path);
      el.draggable = true;
      
      if (state.viewMode === 'tile') {
        el.innerHTML = `
          <span class="folder-icon" style="color: #ffb020;"><i data-lucide="folder"></i></span>
          <div class="tile-info-block">
            <span class="file-name-txt" title="${folder.name}">${folder.name}</span>
            <span class="tile-sub-txt">파일 폴더</span>
          </div>
        `;
      } else if (state.viewMode === 'content') {
        el.innerHTML = `
          <span class="folder-icon" style="color: #ffb020;"><i data-lucide="folder"></i></span>
          <div class="content-info-block">
            <span class="file-name-txt" title="${folder.name}">${folder.name}</span>
            <div class="content-sub-row">
              <span>유형: 파일 폴더</span>
            </div>
          </div>
        `;
      } else {
        el.innerHTML = `
          <span class="folder-icon" style="color: #ffb020;"><i data-lucide="folder"></i></span>
          <span class="file-name-txt" title="${folder.name}">${folder.name}</span>
        `;
      }
    }
    
    // 폴더 이벤트 바인딩
    el.addEventListener('click', () => {
      setSelectedRow(el);
    });
    
    el.addEventListener('dblclick', () => {
      explorePath(folder.path);
    });
    
    el.addEventListener('contextmenu', (e) => {
      e.stopPropagation();
      setSelectedRow(el);
      showContextMenu(e, {
        type: 'folder',
        path: folder.path,
        name: folder.name,
        size: 0,
        mtime: null
      });
    });

    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', folder.path);
      e.dataTransfer.setData('item-type', 'folder');
      e.dataTransfer.effectAllowed = 'copyMove';
    });

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
      e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag-over');
      const srcPath = e.dataTransfer.getData('text/plain');
      const action = e.ctrlKey ? 'copy' : 'move';
      pasteFilePhysical(srcPath, folder.path, action);
    });
    
    if (state.viewMode === 'details') {
      els.fileListBody.appendChild(el);
    } else {
      gridEl.appendChild(el);
    }
  });
  
  // [2] 파일 렌더링
  files.forEach(file => {
    let el;
    const extension = file.name.split('.').pop().toUpperCase();
    
    if (state.viewMode === 'details') {
      el = document.createElement('tr');
      el.setAttribute('data-type', 'file');
      el.setAttribute('data-path', file.path);
      el.draggable = true;
      el.innerHTML = `
        <td class="col-name">
          <div class="name-cell-content">
            <span class="hwp-icon" style="display:flex; align-items:center;">
              <svg viewBox="0 0 24 24" style="width: 22px; height: 22px; flex-shrink: 0;" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 2C4 1.44772 4.44772 1 5 1H15L20 6V22C20 22.5523 19.5523 23 19 23H5C4.44772 23 4 22.5523 4 22V2Z" fill="#00A8FF"/>
                <path d="M15 1L20 6H16C15.4477 6 15 5.55228 15 5V1Z" fill="#B3E5FC"/>
                <text x="11.5" y="16.5" fill="white" font-size="11" font-family="'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" font-weight="bold" text-anchor="middle">한</text>
              </svg>
            </span>
            <span class="file-name-txt">${file.name}</span>
          </div>
        </td>
      `;
    } else {
      el = document.createElement('div');
      el.className = 'grid-item';
      el.setAttribute('data-type', 'file');
      el.setAttribute('data-path', file.path);
      el.draggable = true;
      
      const hwpSvg = `
        <span class="hwp-icon" style="display:flex; align-items:center; flex-shrink:0;">
          <svg viewBox="0 0 24 24" style="width:100%; height:100%;" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 2C4 1.44772 4.44772 1 5 1H15L20 6V22C20 22.5523 19.5523 23 19 23H5C4.44772 23 4 22.5523 4 22V2Z" fill="#00A8FF"/>
            <path d="M15 1L20 6H16C15.4477 6 15 5.55228 15 5V1Z" fill="#B3E5FC"/>
            <text x="11.5" y="16.5" fill="white" font-size="11" font-family="'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" font-weight="bold" text-anchor="middle">한</text>
          </svg>
        </span>
      `;
      
      if (state.viewMode === 'tile') {
        el.innerHTML = `
          ${hwpSvg}
          <div class="tile-info-block">
            <span class="file-name-txt" title="${file.name}">${file.name}</span>
            <span class="tile-sub-txt">${extension} 문서 - ${formatBytes(file.size)}</span>
          </div>
        `;
      } else if (state.viewMode === 'content') {
        el.innerHTML = `
          ${hwpSvg}
          <div class="content-info-block">
            <span class="file-name-txt" title="${file.name}">${file.name}</span>
            <div class="content-sub-row">
              <span>유형: ${extension} 문서</span>
              <span>수정일: ${formatDate(file.mtime)}</span>
              <span>크기: ${formatBytes(file.size)}</span>
            </div>
          </div>
        `;
      } else {
        let iconHtml = hwpSvg;
        let isThumbnailMode = (state.viewMode === 'extra-large' || state.viewMode === 'large');
        
        if (isThumbnailMode && (extension === 'HWP' || extension === 'HWPX')) {
          iconHtml = `<div class="hwp-thumbnail-wrapper loading"></div>`;
        }
        
        el.innerHTML = `
          ${iconHtml}
          <span class="file-name-txt" title="${file.name}">${file.name}</span>
        `;
        
        if (thumbnailObserver && isThumbnailMode && (extension === 'HWP' || extension === 'HWPX')) {
          thumbnailObserver.observe(el);
        }
      }
    }
    
    // 파일 이벤트 바인딩
    el.addEventListener('click', () => {
      setSelectedRow(el);
      openHwpFile(file);
    });
    
    el.addEventListener('dblclick', () => {
      openFileInSystem(file.path);
    });
    
    el.addEventListener('contextmenu', (e) => {
      e.stopPropagation();
      setSelectedRow(el);
      showContextMenu(e, {
        type: 'file',
        path: file.path,
        name: file.name,
        size: file.size,
        mtime: file.mtime
      });
    });

    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', file.path);
      e.dataTransfer.setData('item-type', 'file');
      e.dataTransfer.effectAllowed = 'copyMove';
    });
    
    if (state.viewMode === 'details') {
      els.fileListBody.appendChild(el);
    } else {
      gridEl.appendChild(el);
    }
  });
  
  lucide.createIcons({ attrs: { 'data-lucide': true } });
}

function setSelectedRow(rowEl) {
  document.querySelectorAll('.explorer-table tbody tr, .grid-item').forEach(r => r.classList.remove('active-row'));
  rowEl.classList.add('active-row');
  
  // 툴바 명령어 단추 가상 활성화 (기능 설명 토스트를 띄우기 위함)
  const isSelected = true;
  if (isSelected) {
    els.btnCut.classList.remove('disabled');
    els.btnCopy.classList.remove('disabled');
    els.btnRename.classList.remove('disabled');
    els.btnDelete.classList.remove('disabled');
  }
}

// 10. 우측 한글 문서 미리보기 렌더링
function renderErrorState(errorMessage) {
  els.svgContainer.innerHTML = `
    <div style="padding: 40px 24px; text-align: center; color: #dc2626; background: #fff5f5; border: 1px solid #ffc9c9; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); max-width: 340px; margin: 30px auto; display: flex; flex-direction: column; align-items: center; gap: 12px;">
      <i data-lucide="alert-triangle" style="width: 36px; height: 36px; color: #fa5252;"></i>
      <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #c92a2a;">문서 로드 실패</h4>
      <p style="margin: 0; font-size: 12px; color: #495057; line-height: 1.5; word-break: break-all;">${errorMessage}</p>
      <p style="margin: 0; font-size: 11px; color: #868e96; line-height: 1.4;">파일이 손상되었거나 일시적인 파싱 오류가 발생했을 수 있습니다.</p>
    </div>
  `;
  lucide.createIcons();
}

// 10. 우측 한글 문서 미리보기 렌더링
async function openHwpFile(fileInfo) {
  state.activeFile = fileInfo;
  state.activeFilePath = fileInfo.path;
  state.activeFileName = fileInfo.name;
  
  showToast('문서 파싱 중...');
  
  try {
    const url = `/api/file?path=${encodeURIComponent(fileInfo.path)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || '파일 스트림 읽기에 실패했습니다.');
    }
    
    const arrayBuffer = await res.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // 기존 문서 인스턴스 소멸자 호출 (예외 우회 및 무효 포인터 방지)
    if (state.currentDoc) {
      try {
        state.currentDoc.free();
      } catch (e) {
        console.warn('이전 문서 인스턴스 해제 중 예외 발생 (무시됨):', e);
      }
      state.currentDoc = null;
    }
    
    try {
      state.currentDoc = new HwpDocument(uint8Array);
    } catch (createErr) {
      state.currentDoc = null;
      let errMsg = createErr.message || String(createErr);
      const lowerErr = errMsg.toLowerCase();
      if (lowerErr.includes('password') || lowerErr.includes('encrypt') || errMsg.includes('암호') || lowerErr.includes('decrypt') || lowerErr.includes('cipher')) {
        throw new Error('비밀번호가 설정된 암호화 문서입니다. 웹 미리보기를 지원하지 않으므로, 문서를 더블클릭하여 데스크톱 한글 프로그램에서 직접 확인해 주십시오.');
      }
      throw (createErr instanceof Error) ? createErr : new Error(errMsg);
    }
    state.currentPage = 0;
    
    // 메타데이터 분석
    const extension = fileInfo.name.split('.').pop().toUpperCase();
    let pageCount = 1;
    try {
      if (state.currentDoc.pageCount) {
        pageCount = state.currentDoc.pageCount();
      } else if (state.currentDoc.getPageCount) {
        pageCount = state.currentDoc.getPageCount();
      }
    } catch (e) {
      console.error('페이지 수 획득 실패:', e);
      pageCount = 1;
    }
    state.totalPages = pageCount || 1;
    
    // 화면 구성 전환
    els.welcomeScreen.classList.add('hidden');
    els.viewerContent.classList.remove('hidden');
    
    els.docName.textContent = fileInfo.name;
    els.docName.title = fileInfo.name;
    els.docTypeBadge.textContent = `${extension} 문서`;
    els.docPagesBadge.textContent = `${state.totalPages} 쪽`;
    els.docSizeBadge.textContent = formatBytes(fileInfo.size);
    els.docModifiedDate.textContent = formatDate(fileInfo.mtime);
    
    els.lblTotalPages.textContent = state.totalPages;
    
    // 미리보기 페이지 렌더링
    renderPage();
    showToast('미리보기가 갱신되었습니다.');
  } catch (err) {
    console.error(err);
    const displayMsg = err.message || String(err) || '알 수 없는 오류가 발생했습니다.';
    showToast(`로딩 실패: ${displayMsg}`, true);
    
    // 에러 발생 시에도 뷰어 영역을 보여주고 에러 화면을 노출
    els.welcomeScreen.classList.add('hidden');
    els.viewerContent.classList.remove('hidden');
    
    els.docName.textContent = fileInfo.name;
    els.docName.title = fileInfo.name;
    els.docTypeBadge.textContent = `${fileInfo.name.split('.').pop().toUpperCase()} 문서`;
    els.docPagesBadge.textContent = '0 쪽';
    els.docSizeBadge.textContent = formatBytes(fileInfo.size);
    els.docModifiedDate.textContent = formatDate(fileInfo.mtime);
    els.lblTotalPages.textContent = 1;
    els.lblCurrentPage.textContent = 1;
    
    renderErrorState(displayMsg);
  }
}

function updatePageIndicatorAndButtons() {
  els.lblCurrentPage.textContent = state.currentPage + 1;
  els.btnPrevPage.disabled = state.currentPage === 0;
  els.btnNextPage.disabled = state.currentPage >= state.totalPages - 1;
}

function renderPage() {
  if (!state.currentDoc) return;
  
  try {
    els.svgContainer.innerHTML = '';
    
    // 전체 페이지를 나열하여 세로 스크롤 미리보기 지원
    for (let i = 0; i < state.totalPages; i++) {
      let svgContent = '';
      if (state.currentDoc.renderPageSvg) {
        svgContent = state.currentDoc.renderPageSvg(i);
      } else {
        throw new Error('WASM 모듈에서 renderPageSvg API를 지원하지 않습니다.');
      }
      
      const pageCard = document.createElement('div');
      pageCard.className = 'hwp-page-card';
      pageCard.setAttribute('data-page-index', i);
      pageCard.innerHTML = svgContent;
      
      els.svgContainer.appendChild(pageCard);
    }
    
    // 첫 화면 스크롤 설정 및 버튼 상태 초기화
    state.currentPage = 0;
    updatePageIndicatorAndButtons();
    
    // 배율(Zoom) / 맞춤 적용
    applyZoom();
    
  } catch (err) {
    console.error(err);
    renderErrorState(err.message);
  }
}

function applyZoom() {
  if (!state.currentDoc) return;
  
  const pageCards = els.svgContainer.querySelectorAll('.hwp-page-card');
  if (pageCards.length === 0) return;
  
  // 뷰포트 크기
  const viewportWidth = els.viewerViewport.clientWidth - 32; // 패딩 여유
  const viewportHeight = els.viewerViewport.clientHeight - 32;
  
  // 첫 페이지의 원본 비율 구하기
  const firstSvg = pageCards[0].querySelector('svg');
  if (!firstSvg) return;
  
  let ratio = 1.414;
  if (firstSvg.viewBox && firstSvg.viewBox.baseVal) {
    const vb = firstSvg.viewBox.baseVal;
    if (vb.width > 0 && vb.height > 0) {
      ratio = vb.height / vb.width;
    }
  } else {
    const attrW = parseFloat(firstSvg.getAttribute('width'));
    const attrH = parseFloat(firstSvg.getAttribute('height'));
    if (attrW > 0 && attrH > 0) {
      ratio = attrH / attrW;
    }
  }
  
  let targetWidth = 380; // 기본값
  
  if (state.zoomMode === 'fitWidth') {
    targetWidth = viewportWidth;
    state.zoom = Math.round((targetWidth / 794) * 100); // 기준 A4 너비 794px 대비 비율 계산
    els.lblZoom.textContent = '폭 맞춤';
    els.btnFitWidth.classList.add('active');
  } else if (state.zoomMode === 'fitPage') {
    // 쪽맞춤: 페이지 한 장의 높이가 뷰포트에 맞게 계산
    const targetHeight = viewportHeight;
    targetWidth = targetHeight / ratio;
    
    // 단, 가로가 뷰포트 너비를 넘어가면 안 되므로 제한
    if (targetWidth > viewportWidth) {
      targetWidth = viewportWidth;
    }
    
    state.zoom = Math.round((targetWidth / 794) * 100);
    els.lblZoom.textContent = '쪽 맞춤';
    els.btnFitWidth.classList.remove('active'); // active 표시 토글
  } else {
    // 커스텀 배율 (30% ~ 200%)
    const baseWidth = 650; // 기준폭
    targetWidth = (baseWidth * state.zoom) / 100;
    els.lblZoom.textContent = `${state.zoom}%`;
    els.btnFitWidth.classList.remove('active');
  }
  
  // 모든 페이지 카드에 동일한 가로/세로 픽셀 크기 강제 설정
  pageCards.forEach(card => {
    card.style.width = `${targetWidth}px`;
    card.style.height = `${targetWidth * ratio}px`;
  });
}

// 11. 이벤트 리스너 바인딩
function initEvents() {
  // [신규] 즐겨찾기 그룹 아코디언 토글
  if (els.quickAccessHeader && els.quickAccessToggle && els.quickAccessContainer) {
    els.quickAccessHeader.addEventListener('click', () => {
      const isHidden = els.quickAccessContainer.classList.contains('hidden');
      if (isHidden) {
        els.quickAccessContainer.classList.remove('hidden');
        els.quickAccessToggle.classList.add('open');
        els.quickAccessToggle.innerHTML = '<i data-lucide="chevron-down" style="width: 14px; height: 14px; color: #6b7280;"></i>';
      } else {
        els.quickAccessContainer.classList.add('hidden');
        els.quickAccessToggle.classList.remove('open');
        els.quickAccessToggle.innerHTML = '<i data-lucide="chevron-right" style="width: 14px; height: 14px; color: #6b7280;"></i>';
      }
      lucide.createIcons({ attrs: { 'data-lucide': true } });
    });
  }

  const goBack = () => {
    if (state.historyBack.length > 0) {
      const prev = state.historyBack.pop();
      state.historyForward.push(state.currentPath);
      explorePath(prev, true);
    }
  };
  
  const goForward = () => {
    if (state.historyForward.length > 0) {
      const next = state.historyForward.pop();
      state.historyBack.push(state.currentPath);
      explorePath(next, true);
    }
  };

  // 뒤로 가기
  els.btnBack.addEventListener('click', goBack);
  
  // 앞으로 가기
  els.btnForward.addEventListener('click', goForward);

  // 마우스 뒤로 가기 / 앞으로 가기 측면 버튼 연동 (Mouse 4 & Mouse 5)
  window.addEventListener('mousedown', (e) => {
    if (e.button === 3) { // 마우스 4번 버튼 (뒤로 가기)
      e.preventDefault();
      goBack();
    } else if (e.button === 4) { // 마우스 5번 버튼 (앞으로 가기)
      e.preventDefault();
      goForward();
    }
  });

  // 키보드 내비게이션 단축키 (Alt + 좌/우 화살표, Backspace) 연동
  window.addEventListener('keydown', (e) => {
    const isInputActive = document.activeElement && 
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
      
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack();
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      goForward();
    } else if (e.key === 'Backspace' && !isInputActive) {
      e.preventDefault();
      goBack();
    }
  });
  
  // 상위 폴더로 이동
  els.btnUp.addEventListener('click', () => {
    if (!state.currentPath || state.currentPath === 'drives') return;
    const parent = state.currentPath.substring(0, state.currentPath.lastIndexOf('\\'));
    explorePath(parent || 'drives');
  });
  
  // 새로고침
  els.btnRefresh.addEventListener('click', () => {
    explorePath(state.currentPath);
  });
  
  // 주소창 클릭 시 텍스트 입력창 모드로 전환
  els.breadcrumbList.addEventListener('click', (e) => {
    // 브레드크럼 아이템 자체가 아닐 때만 텍스트 모드 전환
    if (e.target.classList.contains('breadcrumb-item') || e.target.closest('.breadcrumb-item')) return;
    
    els.breadcrumbList.classList.add('hidden');
    els.addressInput.classList.remove('hidden');
    els.addressInput.focus();
    els.addressInput.select();
  });
  
  // 주소 입력 완료 시 이동
  els.addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const target = els.addressInput.value.trim();
      els.addressInput.classList.add('hidden');
      els.breadcrumbList.classList.remove('hidden');
      if (target.toLowerCase() === '내 pc' || target === 'drives') {
        explorePath('drives');
      } else {
        explorePath(target);
      }
    }
  });
  
  els.addressInput.addEventListener('blur', () => {
    setTimeout(() => {
      els.addressInput.classList.add('hidden');
      els.breadcrumbList.classList.remove('hidden');
    }, 150);
  });
  
  // 검색 기능 (클라이언트단 실시간 필터)
  els.searchInput.addEventListener('input', () => {
    const query = els.searchInput.value.toLowerCase().trim();
    if (!query) {
      renderFileListTable(state.currentFolders, state.currentFiles);
      return;
    }
    
    const filteredFolders = state.currentFolders.filter(f => f.name.toLowerCase().includes(query));
    const filteredFiles = state.currentFiles.filter(f => f.name.toLowerCase().includes(query));
    renderFileListTable(filteredFolders, filteredFiles);
  });
  
  // [신규] 선택된 행의 정보 획득 헬퍼
  function getSelectedRowInfo() {
    const activeRow = document.querySelector('.explorer-table tbody tr.active-row');
    if (!activeRow) return null;
    const path = activeRow.getAttribute('data-path');
    const type = activeRow.getAttribute('data-type');
    const nameEl = activeRow.querySelector('.file-name-txt');
    const name = nameEl ? nameEl.textContent : '';
    return { path, type, name, element: activeRow };
  }

  // [신규] 클립보드 및 파일 액션 연동
  const onCut = () => {
    const info = getSelectedRowInfo() || (state.contextTarget.type && state.contextTarget.type !== 'none' ? state.contextTarget : null);
    if (info && info.type !== 'drive') {
      setClipboard('cut', info.path, info.type);
    }
    els.contextMenu.classList.add('hidden');
  };

  const onCopy = () => {
    const info = getSelectedRowInfo() || (state.contextTarget.type && state.contextTarget.type !== 'none' ? state.contextTarget : null);
    if (info) {
      setClipboard('copy', info.path, info.type);
    }
    els.contextMenu.classList.add('hidden');
  };

  const onPaste = () => {
    if (!state.clipboard.path) return;
    pasteFilePhysical(state.clipboard.path, state.currentPath, state.clipboard.action);
    els.contextMenu.classList.add('hidden');
  };

  const onRename = () => {
    const info = getSelectedRowInfo() || (state.contextTarget.type && state.contextTarget.type !== 'none' ? state.contextTarget : null);
    if (info && info.type !== 'drive') {
      const rowEl = document.querySelector(`.explorer-table tbody tr[data-path="${CSS.escape(info.path)}"]`);
      if (rowEl) {
        startInlineRename(rowEl, info.path, info.name);
      } else {
        const newName = prompt('새 이름을 입력하십시오:', info.name);
        if (newName && newName !== info.name) {
          const parentDir = info.path.substring(0, info.path.lastIndexOf('\\'));
          const newPath = parentDir + (parentDir.endsWith('\\') ? '' : '\\') + newName;
          fetch('/api/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ src: info.path, dest: newPath })
          }).then(res => {
            if (res.ok) {
              showToast('이름이 변경되었습니다.');
              explorePath(state.currentPath);
              refreshParentTreeNode(info.path);
            } else {
              res.json().then(err => showToast(err.error || '이름 변경 실패', true));
            }
          });
        }
      }
    }
    els.contextMenu.classList.add('hidden');
  };

  const onDelete = () => {
    const info = getSelectedRowInfo() || (state.contextTarget.type && state.contextTarget.type !== 'none' ? state.contextTarget : null);
    if (info && info.type !== 'drive') {
      deleteFilePhysical(info.path);
    }
    els.contextMenu.classList.add('hidden');
  };

  const onOpen = () => {
    const info = getSelectedRowInfo() || (state.contextTarget.type && state.contextTarget.type !== 'none' ? state.contextTarget : null);
    if (info) {
      if (info.type === 'folder' || info.type === 'drive') {
        explorePath(info.path);
      } else {
        openFileInSystem(info.path);
      }
    }
    els.contextMenu.classList.add('hidden');
  };

  const onCopyPath = () => {
    const info = getSelectedRowInfo() || (state.contextTarget.type && state.contextTarget.type !== 'none' ? state.contextTarget : null);
    if (info) {
      navigator.clipboard.writeText(info.path).then(() => {
        showToast('경로가 클립보드에 복사되었습니다.');
      }).catch(() => {
        showToast('경로 복사 실패', true);
      });
    }
    els.contextMenu.classList.add('hidden');
  };

  const onShowProperties = () => {
    const info = getSelectedRowInfo() || (state.contextTarget.type && state.contextTarget.type !== 'none' ? state.contextTarget : null);
    if (info) {
      if (info.size === undefined || info.size === 0) {
        const fileObj = state.currentFiles.find(f => f.path === info.path) || 
                        state.currentFolders.find(f => f.path === info.path);
        if (fileObj) {
          info.size = fileObj.size || 0;
          info.mtime = fileObj.mtime || null;
        }
      }
      showPropertiesModal(info);
    }
    els.contextMenu.classList.add('hidden');
  };

  // 상단 툴바 버튼 이벤트 바인딩
  els.btnCut.addEventListener('click', onCut);
  els.btnCopy.addEventListener('click', onCopy);
  els.btnPaste.addEventListener('click', onPaste);
  els.btnRename.addEventListener('click', onRename);
  els.btnDelete.addEventListener('click', onDelete);
  
  els.btnNew.addEventListener('click', () => {
    showToast('새 항목 기능은 탐색 창 상위 메뉴를 이용해 주십시오.');
  });

  // 우클릭 컨텍스트 메뉴 항목 클릭 이벤트 바인딩
  els.ctxCut.addEventListener('click', onCut);
  els.ctxCopy.addEventListener('click', onCopy);
  els.ctxRename.addEventListener('click', onRename);
  els.ctxDelete.addEventListener('click', onDelete);
  els.ctxOpen.addEventListener('click', onOpen);
  els.ctxCopyPath.addEventListener('click', onCopyPath);
  els.ctxProperties.addEventListener('click', onShowProperties);
  
  

  

  // 우클릭 컨텍스트 외부 클릭 시 닫기
  document.addEventListener('click', (e) => {
    if (els.contextMenu && !els.contextMenu.contains(e.target)) {
      els.contextMenu.classList.add('hidden');
    }
    // 정렬 메뉴 외부 클릭 시 닫기
    if (els.sortMenu && !els.sortMenu.contains(e.target) && e.target !== els.btnSort && !els.btnSort.contains(e.target)) {
      els.sortMenu.classList.add('hidden');
    }
    // 보기 메뉴 외부 클릭 시 닫기
    if (els.viewMenu && !els.viewMenu.contains(e.target) && e.target !== els.btnViewOption && !els.btnViewOption.contains(e.target)) {
      els.viewMenu.classList.add('hidden');
    }
  });

  // [신규] 정렬 메뉴 열기/닫기
  if (els.btnSort) {
    els.btnSort.addEventListener('click', (e) => {
      e.stopPropagation();
      els.sortMenu.classList.toggle('hidden');
      if (!els.sortMenu.classList.contains('hidden')) {
        const rect = els.btnSort.getBoundingClientRect();
        els.sortMenu.style.left = `${rect.left}px`;
        els.sortMenu.style.top = `${rect.bottom + 5}px`;
        
        // 정렬 상태 업데이트
        document.querySelectorAll('.sort-field-item').forEach(el => {
          el.querySelector('.sort-check').innerHTML = (el.dataset.field === state.sortField) ? '&bull;' : '';
        });
        document.querySelectorAll('.sort-order-item').forEach(el => {
          el.querySelector('.sort-check').innerHTML = (el.dataset.order === state.sortOrder) ? '&bull;' : '';
        });
      }
    });
  }

  // [신규] 정렬 메뉴 항목 클릭
  document.querySelectorAll('.sort-field-item').forEach(item => {
    item.addEventListener('click', () => {
      state.sortField = item.dataset.field;
      els.sortMenu.classList.add('hidden');
      renderFileListTable(sortItems(state.currentFolders), sortItems(state.currentFiles));
    });
  });

  document.querySelectorAll('.sort-order-item').forEach(item => {
    item.addEventListener('click', () => {
      state.sortOrder = item.dataset.order;
      els.sortMenu.classList.add('hidden');
      renderFileListTable(sortItems(state.currentFolders), sortItems(state.currentFiles));
    });
  });

  // 속성 모달 버튼 이벤트 바인딩
  els.btnCloseProps.addEventListener('click', () => els.propertiesModal.classList.add('hidden'));
  els.btnPropCancel.addEventListener('click', () => els.propertiesModal.classList.add('hidden'));
  
  // 속성 창 이름 바꾸기 확인 단추 클릭 시
  els.btnPropConfirm.addEventListener('click', async () => {
    const oldPath = els.propFilePath.textContent;
    const oldName = oldPath.split('\\').pop();
    const newName = els.propFileName.value.trim();
    
    els.propertiesModal.classList.add('hidden');
    
    if (!newName || newName === oldName) return;
    
    const parentDir = oldPath.substring(0, oldPath.lastIndexOf('\\'));
    const newPath = parentDir + (parentDir.endsWith('\\') ? '' : '\\') + newName;
    
    try {
      const res = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: oldPath, dest: newPath })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '이름 변경 실패');
      }
      
      showToast('이름이 변경되었습니다.');
      explorePath(state.currentPath);
      refreshParentTreeNode(oldPath);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // 키보드 단축키 추가 연동
  window.addEventListener('keydown', (e) => {
    const isInputActive = document.activeElement && 
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
      
    if (isInputActive) return; // 포커스가 입력창에 있으면 단축키 차단
    
    // F2: 이름 바꾸기
    if (e.key === 'F2') {
      e.preventDefault();
      onRename();
    }
    // Delete: 삭제
    else if (e.key === 'Delete') {
      e.preventDefault();
      onDelete();
    }
    // Enter: 열기
    else if (e.key === 'Enter') {
      e.preventDefault();
      onOpen();
    }
    // Alt + Enter: 속성 보기
    else if (e.altKey && e.key === 'Enter') {
      e.preventDefault();
      onShowProperties();
    }
    // Ctrl + C: 복사
    else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      onCopy();
    }
    // Ctrl + X: 잘라내기
    else if (e.ctrlKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      onCut();
    }
    // Ctrl + V: 붙여넣기
    else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      onPaste();
    }
    // Ctrl + Shift + C: 경로 복사
    else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      onCopyPath();
    }
  });
  

  
  // [신규] 보기 메뉴 열기/닫기
  if (els.btnViewOption) {
    els.btnViewOption.addEventListener('click', (e) => {
      e.stopPropagation();
      els.viewMenu.classList.toggle('hidden');
      if (!els.viewMenu.classList.contains('hidden')) {
        const rect = els.btnViewOption.getBoundingClientRect();
        els.viewMenu.style.left = `${rect.left}px`;
        els.viewMenu.style.top = `${rect.bottom + 5}px`;
        
        // 보기 상태 업데이트
        document.querySelectorAll('.view-option-item').forEach(el => {
          el.querySelector('.sort-check').innerHTML = (el.dataset.view === state.viewMode) ? '&bull;' : '';
        });
      }
    });
  }

  // [신규] 보기 메뉴 항목 클릭
  document.querySelectorAll('.view-option-item').forEach(item => {
    item.addEventListener('click', () => {
      state.viewMode = item.dataset.view;
      els.viewMenu.classList.add('hidden');
      renderFileListTable(sortItems(state.currentFolders), sortItems(state.currentFiles));
      showToast(`현재 "${item.querySelector('.ctx-text').textContent}" 보기 모드입니다.`);
    });
  });
  
  // 뷰어 페이지 스위칭 (지정된 페이지로 부드럽게 스크롤)
  const scrollToPage = (index) => {
    const pageCards = els.svgContainer.querySelectorAll('.hwp-page-card');
    if (pageCards[index]) {
      pageCards[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
      state.currentPage = index;
      updatePageIndicatorAndButtons();
    }
  };

  els.btnPrevPage.addEventListener('click', () => {
    if (state.currentPage > 0) {
      scrollToPage(state.currentPage - 1);
    }
  });
  
  els.btnNextPage.addEventListener('click', () => {
    if (state.currentPage < state.totalPages - 1) {
      scrollToPage(state.currentPage + 1);
    }
  });
  
  // 뷰어 배율 조절
  els.btnZoomOut.addEventListener('click', () => {
    state.zoomMode = 'custom';
    if (state.zoom > 30) {
      state.zoom = Math.max(30, state.zoom - 10);
      applyZoom();
    }
  });
  
  els.btnZoomIn.addEventListener('click', () => {
    state.zoomMode = 'custom';
    if (state.zoom < 200) {
      state.zoom = Math.min(200, state.zoom + 10);
      applyZoom();
    }
  });
  
  els.btnFitWidth.addEventListener('click', () => {
    if (state.zoomMode === 'fitWidth') {
      state.zoomMode = 'fitPage';
    } else {
      state.zoomMode = 'fitWidth';
    }
    applyZoom();
  });

  // 문서 새로고침
  els.btnReloadDoc.addEventListener('click', () => {
    if (state.activeFile) {
      openHwpFile(state.activeFile);
    } else {
      showToast('새로고침할 문서가 선택되지 않았습니다.');
    }
  });

  // 뷰포트 스크롤 이벤트를 감지하여 현재 화면 중앙에 들어온 페이지 트래킹
  els.viewerViewport.addEventListener('scroll', () => {
    if (!state.currentDoc) return;
    
    const pageCards = els.svgContainer.querySelectorAll('.hwp-page-card');
    if (pageCards.length === 0) return;
    
    const viewportRect = els.viewerViewport.getBoundingClientRect();
    const viewportCenter = viewportRect.top + viewportRect.height / 2;
    
    let closestPageIndex = 0;
    let minDistance = Infinity;
    
    pageCards.forEach((card, idx) => {
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestPageIndex = idx;
      }
    });
    
    if (state.currentPage !== closestPageIndex) {
      state.currentPage = closestPageIndex;
      updatePageIndicatorAndButtons();
    }
  });

  // 윈도우 창 크기 변경 시에도 쪽맞춤/폭맞춤 배율 갱신 및 중앙 최소 80px 영역 확보
  window.addEventListener('resize', () => {
    const sidebarActualWidth = els.sidebarTree.classList.contains('collapsed-sidebar') ? 0 : els.sidebarTree.offsetWidth;
    const maxViewerWidth = window.innerWidth - sidebarActualWidth - 80;
    
    if (els.viewerArea.offsetWidth > maxViewerWidth) {
      let newViewerWidth = Math.max(0, maxViewerWidth);
      els.viewerArea.style.width = `${newViewerWidth}px`;
    }
    
    if (state.currentDoc) {
      applyZoom();
    }
  });
  
  // 우측 미리보기 창 폭 드래그 조절 (스플리터 로직)
  let isResizing = false;
  let isSidebarResizing = false;
  
  els.viewerResizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    els.viewerResizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  
  els.sidebarResizer.addEventListener('mousedown', (e) => {
    isSidebarResizing = true;
    els.sidebarResizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isResizing) {
      // 뷰포트 우측 끝 기준 너비 계산
      let newWidth = window.innerWidth - e.clientX;
      
      // 좌측 탐색기 실제 너비 계산 (탐색 창이 닫혀 있으면 0px)
      const sidebarWidth = els.sidebarTree.classList.contains('collapsed-sidebar') ? 0 : els.sidebarTree.offsetWidth;
      
      // 중앙 폴더 목록이 최소 80px은 확보할 수 있는 상한선 설정
      const maxViewerWidth = window.innerWidth - sidebarWidth - 80;
      
      // 최소/최대값 제약 (0px ~ maxViewerWidth)
      if (newWidth < 0) newWidth = 0;
      if (newWidth > maxViewerWidth) newWidth = maxViewerWidth;
      
      els.viewerArea.style.width = `${newWidth}px`;
      
      // 미리보기 배율 실시간 갱신 (쪽 맞춤 리플로우)
      if (state.currentDoc) {
        applyZoom();
      }
    } else if (isSidebarResizing) {
      // 마우스 X 위치를 기준으로 좌측 탐색 창 너비 계산
      let newWidth = e.clientX;
      
      // 최소/최대값 제약 (160px ~ 500px)
      if (newWidth < 160) newWidth = 160;
      if (newWidth > 500) newWidth = 500;
      
      els.sidebarTree.style.width = `${newWidth}px`;
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      els.viewerResizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      // 조정한 너비 로컬 스토리지에 저장
      localStorage.setItem('hwplens_viewer_width', els.viewerArea.offsetWidth);
    }
    if (isSidebarResizing) {
      isSidebarResizing = false;
      els.sidebarResizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      // 조정한 너비 로컬 스토리지에 저장
      localStorage.setItem('hwplens_sidebar_width', els.sidebarTree.offsetWidth);
      
      // 좌측 창이 조절되었을 때도 중앙 영역 최소 80px 보장을 만족하도록 우측 창 제약 다시 계산 및 강제 조정
      const currentSidebarWidth = els.sidebarTree.offsetWidth;
      const currentViewerWidth = els.viewerArea.offsetWidth;
      const maxViewerWidth = window.innerWidth - currentSidebarWidth - 80;
      if (currentViewerWidth > maxViewerWidth) {
        let newViewerWidth = Math.max(0, maxViewerWidth);
        els.viewerArea.style.width = `${newViewerWidth}px`;
        localStorage.setItem('hwplens_viewer_width', newViewerWidth);
        if (state.currentDoc) applyZoom();
      }
    }
  });

  // 탐색 창 열고 닫기 토글
  els.btnToggleSidebar.addEventListener('click', () => {
    const isCollapsed = els.sidebarTree.classList.toggle('collapsed-sidebar');
    localStorage.setItem('hwplens_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    
    if (isCollapsed) {
      els.btnToggleSidebar.classList.remove('active');
      showToast('탐색 창을 닫았습니다.');
    } else {
      els.btnToggleSidebar.classList.add('active');
      showToast('탐색 창을 열었습니다.');
    }
    
    // 접힘 상태 전환 시 중앙 영역 최소 80px 보장을 만족하도록 미리보기 너비 상한 강제 조정
    const sidebarActualWidth = isCollapsed ? 0 : els.sidebarTree.offsetWidth;
    const maxViewerWidth = window.innerWidth - sidebarActualWidth - 80;
    if (els.viewerArea.offsetWidth > maxViewerWidth) {
      let newViewerWidth = Math.max(0, maxViewerWidth);
      els.viewerArea.style.width = `${newViewerWidth}px`;
      localStorage.setItem('hwplens_viewer_width', newViewerWidth);
    }
    
    if (state.currentDoc) {
      applyZoom();
    }
  });

  // 중앙 목록 테이블 컬럼 폭 드래그 조절 (컬럼 리사이저)
  const table = document.querySelector('.explorer-table');
  const thElements = document.querySelectorAll('.explorer-table th');
  
  thElements.forEach(th => {
    const resizer = th.querySelector('.col-resizer');
    if (!resizer) return;
    
    let startX, startWidth, tableStartWidth, siblingWidths = [];
    
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation(); // 부모 헤더 요소의 정렬 클릭 등의 전파 방지
      
      startX = e.clientX;
      startWidth = th.offsetWidth;
      tableStartWidth = table.offsetWidth;
      
      // 드래그 시작 시점의 모든 th 너비를 기록하여 픽셀로 고정
      const allThs = table.querySelectorAll('thead th');
      siblingWidths = Array.from(allThs).map(header => header.offsetWidth);
      
      // 테이블과 모든 th의 너비를 명시적 px로 강제 설정 (100% 해제)
      allThs.forEach((header, i) => {
        header.style.width = `${siblingWidths[i]}px`;
      });
      table.style.width = `${tableStartWidth}px`;
      
      const onMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        let newWidth = startWidth + dx;
        if (newWidth < 60) newWidth = 60; // 최소 가로폭 60px 제한
        
        // 현재 컬럼의 신규 너비 적용
        th.style.width = `${newWidth}px`;
        
        // 테이블 전체의 신규 너비 적용 (현재 컬럼의 변화량만큼 테이블 너비 증감)
        const widthDiff = newWidth - startWidth;
        table.style.width = `${tableStartWidth + widthDiff}px`;
      };
      
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });

  // [신규] 중앙 목록 빈 영역 드래그 앤 드롭 수신
  const middleList = document.querySelector('.middle-list');
  middleList.addEventListener('dragover', (e) => {
    e.preventDefault();
    middleList.classList.add('drag-over');
    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
  });
  middleList.addEventListener('dragleave', () => {
    middleList.classList.remove('drag-over');
  });
  middleList.addEventListener('drop', (e) => {
    e.preventDefault();
    middleList.classList.remove('drag-over');
    const srcPath = e.dataTransfer.getData('text/plain');
    if (srcPath && srcPath !== state.currentPath) {
      const action = e.ctrlKey ? 'copy' : 'move';
      pasteFilePhysical(srcPath, state.currentPath, action);
    }
  });
}

// 12. 어플리케이션 초기화 부트스트랩
async function bootstrap() {
  initThumbnailObserver();
  initLayout();
  initEvents();
  
  try {
    showToast('WASM 코어 라이브러리 준비 중...');
    await init({ module_or_path: '/rhwp_bg.wasm' });
    showToast('HwpLens 파일 탐색기 연동 완료.');
    
    // 사용자 홈 경로 조회하여 즐겨찾기(Quick Access) 구성
    try {
      const res = await fetch('/api/explore');
      if (res.ok) {
        const homeData = await res.json();
        buildQuickAccess(homeData.currentPath, homeData.folders, homeData.onedrives);
      }
    } catch (e) {
      console.error('바로가기 경로 생성 실패:', e);
    }
    
    // 좌측 트리 및 중앙 탐색 초기화
    await initDriveTree();
    explorePath('drives');
  } catch (err) {
    console.error('Bootstrap failed:', err);
    showToast('코어 모듈 구동 실패. 새로고침 후 다시 실행해 주십시오.', true);
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
