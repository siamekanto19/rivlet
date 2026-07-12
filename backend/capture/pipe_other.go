//go:build !windows

package capture

import (
	"errors"
	"net"
	"time"
)

func PipeName() string { return "" }
func Listen() (net.Listener, error) {
	return nil, errors.New("Grabby native capture is currently Windows-only")
}
func Dial(time.Duration) (net.Conn, error) {
	return nil, errors.New("Grabby native capture is currently Windows-only")
}
