//go:build !windows

package backend

import "errors"

func storeCredential(target, user, secret string) error {
	return errors.New("secure credential storage is only available on Windows")
}
func readCredential(target string) (string, string, error) {
	return "", "", errors.New("secure credential storage is only available on Windows")
}
func deleteCredential(target string) error {
	return errors.New("secure credential storage is only available on Windows")
}
