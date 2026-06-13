
const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

// 1. Add sortField, sortOrder
code = code.replace('currentFiles: [],', 'currentFiles: [],\n  sortField: \'name\',\n  sortOrder: \'asc\',');

// 2. Add sortMenu
code = code.replace('btnSort: document.getElementById(\'btnSort\'),', 'btnSort: document.getElementById(\'btnSort\'),\n  sortMenu: document.getElementById(\'sortMenu\'),');

// 3. Add sortItems and update renderFileListTable
const renderTableOld = 'function renderFileListTable(folders, files) {';
const sortItemsStr = \
function sortItems(items) {
  return items.slice().sort((a, b) => {
    let valA, valB;
    if (state.sortField === 'name') {
      valA = (a.name || '').toLowerCase();
      valB = (b.name || '').toLowerCase();
    } else if (state.sortField === 'date') {
      valA = new Date(a.mtime || 0).getTime();
      valB = new Date(b.mtime || 0).getTime();
    } else if (state.sortField === 'type') {
      valA = (a.ext || '').toLowerCase();
      valB = (b.ext || '').toLowerCase();
      if (valA === valB) {
         valA = (a.name || '').toLowerCase();
         valB = (b.name || '').toLowerCase();
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

function renderFileListTable(folders, files) {\;
code = code.replace(renderTableOld, sortItemsStr);

// 4. Update explorePath and search to use sortItems
code = code.replace(/renderFileListTable\((state\.currentFolders),\s*(state\.currentFiles)\)/g, 'renderFileListTable(sortItems(), sortItems())');
code = code.replace(/renderFileListTable\((filteredFolders),\s*(filteredFiles)\)/g, 'renderFileListTable(sortItems(), sortItems())');

// 5. Replace btnSort click listener
const btnSortOld = /els\.btnSort\.addEventListener\('click', \(\) => \{[\s\S]*?\}\);/;
const btnSortNew = \
  function updateSortMenuUI() {
    if (!els.sortMenu) return;
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
    els.sortMenu.style.left = rect.left + 'px';
    els.sortMenu.style.top = (rect.bottom + 5) + 'px';
    
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
\;
code = code.replace(btnSortOld, btnSortNew);

// 6. Add sortMenu click hide
const documentClickOld = /document\.addEventListener\('click',\s*\(e\)\s*=>\s*\{\s*if\s*\(els\.contextMenu\s*&&\s*!els\.contextMenu\.contains\(e\.target\)\)\s*\{\s*els\.contextMenu\.classList\.add\('hidden'\);\s*\}\s*\}\);/;
const documentClickNew = \document.addEventListener('click', (e) => {
    if (els.contextMenu && !els.contextMenu.contains(e.target)) {
      els.contextMenu.classList.add('hidden');
    }
    if (els.sortMenu && !els.sortMenu.contains(e.target)) {
      els.sortMenu.classList.add('hidden');
    }
  });\;
code = code.replace(documentClickOld, documentClickNew);

fs.writeFileSync('public/app.js', code, 'utf8');

