package backend

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const schemaVersion = 1

func (m *Manager) openStore(path string) error {
	db, err := openSQLite(path)
	if err != nil {
		return err
	}
	var integrity string
	if err = db.QueryRow(`PRAGMA quick_check`).Scan(&integrity); err != nil || integrity != "ok" {
		_ = db.Close()
		corrupt := fmt.Sprintf("%s.corrupt-%d", path, time.Now().Unix())
		if renameErr := os.Rename(path, corrupt); renameErr != nil {
			return fmt.Errorf("database corrupt and could not be quarantined: %w", renameErr)
		}
		if copyErr := copyDatabaseFile(path+".bak", path); copyErr != nil {
			return fmt.Errorf("database corrupt; quarantined at %s but backup recovery failed: %w", corrupt, copyErr)
		}
		db, err = openSQLite(path)
		if err != nil {
			return fmt.Errorf("open recovered database: %w", err)
		}
		if checkErr := db.QueryRow(`PRAGMA quick_check`).Scan(&integrity); checkErr != nil || integrity != "ok" {
			db.Close()
			return fmt.Errorf("recovered database failed integrity check")
		}
	}
	m.dbPath = path
	db.SetMaxOpenConns(1)
	ctx := context.Background()
	for _, pragma := range []string{"PRAGMA journal_mode=WAL", "PRAGMA synchronous=FULL", "PRAGMA foreign_keys=ON", "PRAGMA busy_timeout=5000"} {
		if _, err = db.ExecContext(ctx, pragma); err != nil {
			db.Close()
			return err
		}
	}
	statements := []string{
		`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS downloads(id TEXT PRIMARY KEY, position INTEGER NOT NULL, payload TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS segments(download_id TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE, segment_index INTEGER NOT NULL, range_from INTEGER NOT NULL, range_to INTEGER NOT NULL, done INTEGER NOT NULL, PRIMARY KEY(download_id, segment_index))`,
		`CREATE TABLE IF NOT EXISTS speed_limits(download_id TEXT PRIMARY KEY REFERENCES downloads(id) ON DELETE CASCADE, bytes_per_second INTEGER)`,
		`CREATE TABLE IF NOT EXISTS retry_history(id INTEGER PRIMARY KEY AUTOINCREMENT, download_id TEXT NOT NULL, attempted_at TEXT NOT NULL, category TEXT NOT NULL, status_code INTEGER, message TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS capture_keys(key TEXT PRIMARY KEY, download_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS tool_versions(tool TEXT PRIMARY KEY, version TEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS host_profiles(host TEXT PRIMARY KEY, max_connections INTEGER NOT NULL, ranges_reliable INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS diagnostic_events(id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL, level TEXT NOT NULL, component TEXT NOT NULL, event TEXT NOT NULL, details TEXT NOT NULL)`,
	}
	for _, statement := range statements {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			db.Close()
			return fmt.Errorf("create database schema: %w", err)
		}
	}
	if _, err = db.ExecContext(ctx, `INSERT OR IGNORE INTO schema_migrations(version) VALUES(?)`, schemaVersion); err != nil {
		db.Close()
		return err
	}
	m.db = db
	return nil
}

func openSQLite(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err = db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func (m *Manager) backupStore() error {
	if m.db == nil || m.dbPath == "" {
		return nil
	}
	tmp, backup := m.dbPath+".bak.tmp", m.dbPath+".bak"
	_ = os.Remove(tmp)
	escaped := strings.ReplaceAll(filepath.ToSlash(tmp), "'", "''")
	if _, err := m.db.Exec(`VACUUM INTO '` + escaped + `'`); err != nil {
		return err
	}
	_ = os.Remove(backup)
	return os.Rename(tmp, backup)
}

func copyDatabaseFile(from, to string) error {
	src, err := os.Open(from)
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.OpenFile(to, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(dst, src)
	syncErr := dst.Sync()
	closeErr := dst.Close()
	if copyErr != nil {
		return copyErr
	}
	if syncErr != nil {
		return syncErr
	}
	return closeErr
}

func (m *Manager) saveStore(p persisted) error {
	if m.db == nil {
		return fmt.Errorf("database is not open")
	}
	tx, err := m.db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	settings, err := json.Marshal(p.Settings)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(`INSERT INTO settings(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`, string(settings)); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM downloads`); err != nil {
		return err
	}
	for pos, d := range p.Downloads {
		copy := clone(*d)
		copy.Segments = nil
		payload, marshalErr := json.Marshal(copy)
		if marshalErr != nil {
			return marshalErr
		}
		if _, err = tx.Exec(`INSERT INTO downloads(id,position,payload) VALUES(?,?,?)`, d.ID, pos, string(payload)); err != nil {
			return err
		}
		for _, s := range d.Segments {
			if _, err = tx.Exec(`INSERT INTO segments(download_id,segment_index,range_from,range_to,done) VALUES(?,?,?,?,?)`, d.ID, s.Index, s.From, s.To, s.Done); err != nil {
				return err
			}
		}
		if limit, ok := p.Limits[d.ID]; ok {
			if limit == nil {
				_, err = tx.Exec(`INSERT INTO speed_limits(download_id,bytes_per_second) VALUES(?,NULL)`, d.ID)
			} else {
				_, err = tx.Exec(`INSERT INTO speed_limits(download_id,bytes_per_second) VALUES(?,?)`, d.ID, *limit)
			}
			if err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (m *Manager) loadStore() (persisted, bool, error) {
	var p persisted
	var raw string
	err := m.db.QueryRow(`SELECT payload FROM settings WHERE id=1`).Scan(&raw)
	if err == sql.ErrNoRows {
		return p, false, nil
	}
	if err != nil {
		return p, false, err
	}
	if err = json.Unmarshal([]byte(raw), &p.Settings); err != nil {
		return p, false, fmt.Errorf("read settings: %w", err)
	}
	p.Limits = map[string]*int64{}
	rows, err := m.db.Query(`SELECT id,payload FROM downloads ORDER BY position`)
	if err != nil {
		return p, false, err
	}
	var loaded []Download
	for rows.Next() {
		var id, payload string
		if err = rows.Scan(&id, &payload); err != nil {
			return p, false, err
		}
		var d Download
		if err = json.Unmarshal([]byte(payload), &d); err != nil {
			return p, false, fmt.Errorf("read download %s: %w", id, err)
		}
		loaded = append(loaded, d)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return p, false, err
	}
	rows.Close()
	for i := range loaded {
		d := &loaded[i]
		id := d.ID
		segRows, queryErr := m.db.Query(`SELECT segment_index,range_from,range_to,done FROM segments WHERE download_id=? ORDER BY segment_index`, id)
		if queryErr != nil {
			return p, false, queryErr
		}
		for segRows.Next() {
			var s SegmentProgress
			if queryErr = segRows.Scan(&s.Index, &s.From, &s.To, &s.Done); queryErr != nil {
				segRows.Close()
				return p, false, queryErr
			}
			d.Segments = append(d.Segments, s)
		}
		segRows.Close()
		var limit sql.NullInt64
		if queryErr = m.db.QueryRow(`SELECT bytes_per_second FROM speed_limits WHERE download_id=?`, id).Scan(&limit); queryErr == nil {
			if limit.Valid {
				v := limit.Int64
				p.Limits[id] = &v
			} else {
				p.Limits[id] = nil
			}
		} else if queryErr != sql.ErrNoRows {
			return p, false, queryErr
		}
		p.Downloads = append(p.Downloads, d)
	}
	return p, true, nil
}
