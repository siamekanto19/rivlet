package backend

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/metainfo"
)

// torrentDisplayName produces a friendly initial filename for a torrent before
// its metadata arrives: the magnet's display name, or the .torrent file's base.
func torrentDisplayName(src string) string {
	src = strings.TrimSpace(src)
	if strings.HasPrefix(src, "magnet:") {
		if u, err := url.Parse(src); err == nil {
			if dn := u.Query().Get("dn"); dn != "" {
				return dn
			}
		}
		return "Torrent download"
	}
	base := filepath.Base(src)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	if base == "" || base == "." {
		return "Torrent download"
	}
	return base
}

// AddTorrentFile imports a .torrent file: it validates it, copies it into
// Grabby's state directory (so resume works even if the original moves), and
// queues it like any other download.
func (m *Manager) AddTorrentFile(path string) (Download, error) {
	mi, err := metainfo.LoadFromFile(path)
	if err != nil {
		return Download{}, fmt.Errorf("not a valid .torrent file: %w", err)
	}
	info, err := mi.UnmarshalInfo()
	if err != nil {
		return Download{}, fmt.Errorf("could not read torrent: %w", err)
	}

	dir := filepath.Join(filepath.Dir(m.statePath), "torrents")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Download{}, err
	}
	dest := filepath.Join(dir, fmt.Sprintf("dl-%d.torrent", time.Now().UnixNano()))
	if err := copyFile(path, dest); err != nil {
		return Download{}, err
	}

	name := info.Name
	if name == "" {
		name = torrentDisplayName(path)
	}
	return m.Add(AddRequest{URL: dest, Kind: "torrent", Filename: name})
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

// downloadTorrent fetches a magnet or .torrent using a BitTorrent client. It
// mirrors the other download paths: it flips the row to Active and keeps
// DownloadedBytes / SizeBytes / Torrent stats current; the progress emitter
// derives speed + ETA and broadcasts. Cancelling the context (pause/cancel)
// returns context.Canceled, which the caller treats as "not an error".
func (m *Manager) downloadTorrent(ctx context.Context, id string) error {
	m.mu.RLock()
	d := clone(*m.downloads[id])
	dest := d.DestinationPath
	if dest == "" {
		dest = m.settings.DownloadDir
	}
	m.mu.RUnlock()

	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}

	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = dest
	cfg.ListenPort = 0 // ephemeral, so concurrent torrents don't collide
	cfg.Seed = false   // don't keep seeding after completion
	cfg.NoUpload = false

	client, err := torrent.NewClient(cfg)
	if err != nil {
		return fmt.Errorf("torrent engine unavailable: %w", err)
	}
	defer client.Close()

	src := strings.TrimSpace(d.URL)
	var t *torrent.Torrent
	if strings.HasPrefix(src, "magnet:") {
		t, err = client.AddMagnet(src)
	} else {
		t, err = client.AddTorrentFromFile(src)
	}
	if err != nil {
		return fmt.Errorf("could not open torrent: %w", err)
	}

	// Magnets fetch their metadata from peers; wait for it (bounded).
	select {
	case <-t.GotInfo():
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(120 * time.Second):
		return errors.New("timed out finding peers for this torrent")
	}

	length := t.Length()
	name := t.Name()
	m.mu.Lock()
	if dd := m.downloads[id]; dd != nil {
		if name != "" {
			dd.Filename = name
		}
		l := length
		dd.SizeBytes = &l
		dd.State = Active
		if dd.Torrent == nil {
			dd.Torrent = &TorrentInfo{}
		}
	}
	m.mu.Unlock()
	m.emitState(id)

	t.DownloadAll()

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			done := t.BytesCompleted()
			stats := t.Stats()
			m.mu.Lock()
			dd := m.downloads[id]
			if dd != nil {
				dd.DownloadedBytes = done
				if length > 0 {
					dd.ProgressPct = float64(done) * 100 / float64(length)
				}
				if dd.Torrent == nil {
					dd.Torrent = &TorrentInfo{}
				}
				dd.Torrent.Peers = stats.ActivePeers
				dd.Torrent.Seeders = stats.ConnectedSeeders
			}
			m.mu.Unlock()
			if length > 0 && done >= length {
				return nil
			}
		}
	}
}
