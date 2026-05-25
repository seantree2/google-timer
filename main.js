const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 420,
    minHeight: 420,
    backgroundColor: '#E8F0FE',
    titleBarStyle: 'hiddenInset',
    title: 'Timer',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', false);
  });
}

ipcMain.handle('toggle-fullscreen', () => {
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('is-fullscreen', () => mainWindow.isFullScreen());

app.whenReady().then(() => {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Full Screen',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
          click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen())
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
