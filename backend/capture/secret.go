package capture

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
)

func SecretPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Rivlet", "native-secret"), nil
}

func EnsureSecret() (string, error) {
	p, err := SecretPath()
	if err != nil {
		return "", err
	}
	if b, readErr := os.ReadFile(p); readErr == nil && len(strings.TrimSpace(string(b))) >= 32 {
		return strings.TrimSpace(string(b)), nil
	}
	if err = os.MkdirAll(filepath.Dir(p), 0700); err != nil {
		return "", err
	}
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", err
	}
	secret := hex.EncodeToString(b)
	if err = os.WriteFile(p, []byte(secret), 0600); err != nil {
		return "", err
	}
	return secret, nil
}

func ReadSecret() (string, error) {
	p, err := SecretPath()
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(p)
	return strings.TrimSpace(string(b)), err
}
