package capture

import (
	"bytes"
	"encoding/binary"
	"strings"
	"testing"
)

func TestFramedProtocolRoundTrip(t *testing.T) {
	want := Envelope{Version: Version, ID: "12345678-abcd", Action: "health"}
	var buffer bytes.Buffer
	if err := Write(&buffer, want); err != nil {
		t.Fatal(err)
	}
	var got Envelope
	if err := Read(&buffer, &got); err != nil {
		t.Fatal(err)
	}
	if got.ID != want.ID || got.Action != want.Action {
		t.Fatalf("got %+v", got)
	}
}

func TestRejectsOversizedFrame(t *testing.T) {
	var buffer bytes.Buffer
	var header [4]byte
	binary.LittleEndian.PutUint32(header[:], MaxMessageSize+1)
	buffer.Write(header[:])
	if err := Read(&buffer, &Envelope{}); err == nil {
		t.Fatal("expected size rejection")
	}
}

func TestURLSchemeAllowlist(t *testing.T) {
	for _, raw := range []string{"javascript:alert(1)", "file:///secret", "data:text/plain,x"} {
		if err := ValidateHTTPURL(raw); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	if err := ValidateHTTPURL("https://example.test/file.zip"); err != nil {
		t.Fatal(err)
	}
}

func TestWriteRejectsLargeMessage(t *testing.T) {
	err := Write(&bytes.Buffer{}, map[string]string{"value": strings.Repeat("x", MaxMessageSize)})
	if err == nil {
		t.Fatal("expected oversized write rejection")
	}
}
