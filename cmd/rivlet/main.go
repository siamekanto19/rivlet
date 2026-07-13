package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"rivlet/backend"
)

func usage() {
	fmt.Fprintln(os.Stderr, "Usage: rivlet <list|add|pause|resume|retry|remove|diagnostics> [options]")
	os.Exit(2)
}
func fatal(err error) { fmt.Fprintln(os.Stderr, "rivlet:", err); os.Exit(1) }
func output(v any) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fatal(err)
	}
	fmt.Println(string(b))
}
func requireID(id string) {
	if id == "" {
		fatal(fmt.Errorf("--id is required"))
	}
}
func openManager(state string) *backend.Manager {
	if state == "" {
		base, _ := os.UserConfigDir()
		state = filepath.Join(base, "Rivlet")
	}
	m, err := backend.NewManager(state, nil)
	if err != nil {
		fatal(err)
	}
	return m
}

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	command := os.Args[1]
	fs := flag.NewFlagSet(command, flag.ExitOnError)
	state := fs.String("state-dir", "", "Rivlet state directory")
	id := fs.String("id", "", "download ID")
	rawURL := fs.String("url", "", "download URL")
	dest := fs.String("destination", "", "destination folder")
	name := fs.String("filename", "", "output filename")
	queue := fs.String("queue", "default", "queue ID")
	wait := fs.Bool("wait", false, "wait until the added download finishes")
	deleteFile := fs.Bool("delete-file", false, "also delete the downloaded file")
	out := fs.String("output", "rivlet-diagnostics.json", "output path")
	_ = fs.Parse(os.Args[2:])
	m := openManager(*state)
	defer m.Close()
	switch command {
	case "list":
		output(m.List())
	case "add":
		if *rawURL == "" {
			fatal(fmt.Errorf("--url is required"))
		}
		d, err := m.Add(backend.AddRequest{URL: *rawURL, DestinationPath: *dest, Filename: *name, QueueID: *queue})
		if err != nil {
			fatal(err)
		}
		if *wait {
			for {
				time.Sleep(250 * time.Millisecond)
				for _, current := range m.List() {
					if current.ID == d.ID && (current.State == backend.Completed || current.State == backend.Error || current.State == backend.Canceled) {
						output(current)
						if current.State != backend.Completed {
							os.Exit(1)
						}
						return
					}
				}
			}
		}
		output(d)
	case "pause":
		requireID(*id)
		m.Pause(*id)
	case "resume":
		requireID(*id)
		m.Resume(*id)
	case "retry":
		requireID(*id)
		m.Retry(*id)
	case "remove":
		requireID(*id)
		if err := m.Remove(*id, *deleteFile); err != nil {
			fatal(err)
		}
	case "diagnostics":
		if err := m.ExportDiagnostics(*out); err != nil {
			fatal(err)
		}
		fmt.Println(*out)
	default:
		usage()
	}
}
