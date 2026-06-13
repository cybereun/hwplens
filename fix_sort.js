const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

code = code.replace(/currentFolders:\s*\[\],/, "currentFolders: [],\n  sortField: 'name',\n  sortOrder: 'asc',");

code = code.replace(/btnSort:\s*document\.getElementById\('btnSort'\),/, "btnSort: document.getElementById('btnSort'),\n    sortMenu: document.getElementById('sortMenu'),");

const sortItemsFunc = \
function sortItems(items) {
  return items.slice().sort((a, b) => {
    let valA, valB;
    if (state.sortField === 'name') {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (state.sortField === 'date') {
      valA = new Date(a.mtime || 0).getTime();
      valB = new Date(b.mtime || 0).getTime();
    } else if (state.sortField === 'type') {
      valA = a.ext ? a.ext.toLowerCase() : '';
      valB = b.ext ? b.ext.toLowerCase() : '';
      if (valA === valB) {
         valA = a.name.toLowerCase();
         valB = b.name.toLowerCase();
      }
    } else if (state.sortField === 'size') {
      valA = a.size || 0;
      valB = b.size || 0;
    }

    if (valA < valB) return state.sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return state.sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
}
\;

code = code.replace(/(function renderFileListTable\\()/, sortItemsFunc + "\\n");

code = code.replace(/renderFileListTable\\(state\\.currentFolders,\\s*state\\.currentFiles\\);/g, "renderFileListTable(sortItems(state.currentFolders), sortItems(state.currentFiles));");

const btnSortReplacement = \
  // 정렬 메뉴 관련
  function updateSortMenuUI() {
    document.querySelectorAll('.sort-field-item').forEach(el => {
      el.querySelector('.sort-check').innerHTML = (el.dataset.field === state.sortField) ? '&bull;' : '';
    });
    document.querySelectorAll('.sort-order-item').forEach(el => {
      el.querySelector('.sort-check').innerHTML = (el.dataset.order === state.sortOrder) ? '&bull;' : '';
    });
  }

  els.btnSort.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = els.btnSort.getBoundingClientRect();
    els.sortMenu.style.left = \\\\px\\\;
    els.sortMenu.style.top = \\\\px\\\;
    
    updateSortMenuUI();
    els.sortMenu.classList.toggle('hidden');
  });

  document.querySelectorAll('.sort-field-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      state.sortField = el.dataset.field;
      els.sortMenu.classList.add('hidden');
      renderFileListTable(sortItems(state.currentFolders), sortItems(state.currentFiles));
    });
  });

  document.querySelectorAll('.sort-order-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      state.sortOrder = el.dataset.order;
      els.sortMenu.classList.add('hidden');
      renderFileListTable(sortItems(state.currentFolders), sortItems(state.currentFiles));
    });
  });

  document.addEventListener('click', (e) => {
    if (els.contextMenu && !els.contextMenu.contains(e.target)) {
      els.contextMenu.classList.add('hidden');
    }
    if (els.sortMenu && !els.sortMenu.contains(e.target)) {
      els.sortMenu.classList.add('hidden');
    }
  });
\;

code = code.replace(/els\\.btnSort\\.addEventListener\\('click',\\s*\\(\\)\\s*=>\\s*\\{[\\s\\S]*?\\}\\);/, btnSortReplacement);

code = code.replace(/document\\.addEventListener\\('click',\\s*\\(e\\)\\s*=>\\s*\\{\\s*if\\s*\\(els\\.contextMenu\\s*&&\\s*!els\\.contextMenu\\.contains\\(e\\.target\\)\\)\\s*\\{\\s*els\\.contextMenu\\.classList\\.add\\('hidden'\\);\\s*\\}\\s*\\}\\);/, "");

fs.writeFileSync('public/app.js', code, 'utf8');
console.log('Done modifying app.js');
