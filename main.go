package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

// trayIcon is the Grabby system-tray icon (Windows .ico). Embedded so it ships
// inside the binary and is available the moment the tray initialises.
//
//go:embed build/graby_tray.ico
var trayIcon []byte

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "Grabify",
		Width:     1180,
		Height:    720,
		MinWidth:  900,
		MinHeight: 520,
		// Frameless so the app draws its own title bar (see TitleBar.vue).
		Frameless: true,
		// Closing the window hides it to the system tray and keeps Grabby
		// running (native close paths, e.g. Alt+F4). The custom title-bar
		// close button routes through runtime.Quit -> OnBeforeClose, which
		// applies the same policy. A true quit only happens from the tray menu.
		HideWindowOnClose: true,
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "3f4ffdc2-892d-4c72-953e-7f1d14ad573e",
			OnSecondInstanceLaunch: func(options.SecondInstanceData) { app.showWindow() },
		},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 238, G: 241, B: 245, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		OnBeforeClose:    app.beforeClose,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
