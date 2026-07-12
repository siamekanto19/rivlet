//go:build windows

package capture

import (
	"fmt"
	"net"
	"os/user"
	"strings"
	"time"

	"github.com/Microsoft/go-winio"
)

func PipeName() string {
	u, err := user.Current()
	if err != nil {
		return `\\.\pipe\Grabby.Native.default`
	}
	sid := strings.NewReplacer("\\", "_", "/", "_", ":", "_").Replace(u.Uid)
	return `\\.\pipe\Grabby.Native.` + sid
}

func Listen() (net.Listener, error) {
	u, err := user.Current()
	if err != nil {
		return nil, err
	}
	sddl := fmt.Sprintf("D:P(A;;GA;;;%s)", u.Uid)
	return winio.ListenPipe(PipeName(), &winio.PipeConfig{SecurityDescriptor: sddl, MessageMode: false, InputBufferSize: MaxMessageSize, OutputBufferSize: MaxMessageSize})
}

func Dial(timeout time.Duration) (net.Conn, error) { return winio.DialPipe(PipeName(), &timeout) }
