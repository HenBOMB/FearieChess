const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow ()
{
    const win = new BrowserWindow({
        width: 500,
        height: 523,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: true
    });

    win.loadFile('index.html');
    win.resizable = false;
    // win.setMenu(null)
    win.setAlwaysOnTop(true, 'screen');
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});