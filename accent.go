package main

// AccentPalette mirrors the Windows system accent ramp (Settings →
// Personalisation → Colours). Each field is a "#rrggbb" string. The frontend
// derives its accent CSS variables from these so the app tracks whatever
// colour the user picked in Windows.
type AccentPalette struct {
	Accent string `json:"accent"` // base (SystemAccentColor)
	Light1 string `json:"light1"`
	Light2 string `json:"light2"`
	Light3 string `json:"light3"`
	Dark1  string `json:"dark1"`
	Dark2  string `json:"dark2"`
	Dark3  string `json:"dark3"`
}

// GetSystemAccent returns the current Windows accent palette, or null when it
// can't be read (non-Windows, or the registry value is missing) — in which
// case the frontend keeps its built-in accent.
func (a *App) GetSystemAccent() *AccentPalette {
	return readAccentPalette()
}
