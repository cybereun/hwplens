const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'public/icons/favicon.ico'),
    autoHideMenuBar: true
  });

  // Give the internal Express server a brief moment to bind to the port
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:8800').catch(err => {
      console.error('Failed to load local server URL:', err);
      // Retry once after 1 second if it failed
      setTimeout(() => {
        mainWindow.loadURL('http://localhost:8800');
      }, 1000);
    });
  }, 300);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  require('./server.js'); // Only start the server if we are the primary instance
  
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
      if (mainWindow === null) createWindow();
    });
  });

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
  });
}
