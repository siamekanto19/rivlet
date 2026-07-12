//go:build windows

package backend

import (
	"fmt"
	"golang.org/x/sys/windows"
	"unsafe"
)

type winCredential struct {
	Flags, Type             uint32
	TargetName, Comment     *uint16
	LastWritten             windows.Filetime
	BlobSize                uint32
	Blob                    *byte
	Persist, AttributeCount uint32
	Attributes              uintptr
	TargetAlias, UserName   *uint16
}

var advapi = windows.NewLazySystemDLL("advapi32.dll")
var credWrite = advapi.NewProc("CredWriteW")
var credRead = advapi.NewProc("CredReadW")
var credDelete = advapi.NewProc("CredDeleteW")
var credFree = advapi.NewProc("CredFree")

func storeCredential(target, user, secret string) error {
	t, _ := windows.UTF16PtrFromString(target)
	u, _ := windows.UTF16PtrFromString(user)
	blob := []byte(secret)
	c := winCredential{Type: 1, TargetName: t, UserName: u, Persist: 2, BlobSize: uint32(len(blob))}
	if len(blob) > 0 {
		c.Blob = &blob[0]
	}
	r, _, e := credWrite.Call(uintptr(unsafe.Pointer(&c)), 0)
	if r == 0 {
		return fmt.Errorf("store Windows credential: %w", e)
	}
	return nil
}
func readCredential(target string) (string, string, error) {
	t, _ := windows.UTF16PtrFromString(target)
	var c *winCredential
	r, _, e := credRead.Call(uintptr(unsafe.Pointer(t)), 1, 0, uintptr(unsafe.Pointer(&c)))
	if r == 0 {
		return "", "", fmt.Errorf("read Windows credential: %w", e)
	}
	defer credFree.Call(uintptr(unsafe.Pointer(c)))
	user := ""
	if c.UserName != nil {
		user = windows.UTF16PtrToString(c.UserName)
	}
	secret := ""
	if c.BlobSize > 0 {
		secret = string(unsafe.Slice(c.Blob, c.BlobSize))
	}
	return user, secret, nil
}
func deleteCredential(target string) error {
	t, _ := windows.UTF16PtrFromString(target)
	r, _, e := credDelete.Call(uintptr(unsafe.Pointer(t)), 1, 0)
	if r == 0 {
		return fmt.Errorf("delete Windows credential: %w", e)
	}
	return nil
}
