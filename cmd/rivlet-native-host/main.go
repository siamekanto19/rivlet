package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	"rivlet/backend/capture"
)

func main() {
	for {
		var request capture.Envelope
		if err := capture.Read(os.Stdin, &request); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				return
			}
			_ = capture.Write(os.Stdout, capture.Response{Version: capture.Version, OK: false, Error: err.Error()})
			return
		}
		response := forward(request)
		if err := capture.Write(os.Stdout, response); err != nil {
			return
		}
	}
}

func forward(request capture.Envelope) capture.Response {
	if err := request.Validate(); err != nil {
		return failed(request.ID, err)
	}
	secret, err := capture.ReadSecret()
	if err != nil {
		if launchErr := launchRivlet(); launchErr != nil {
			return failed(request.ID, fmt.Errorf("Rivlet is not installed: %w", launchErr))
		}
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			secret, err = capture.ReadSecret()
			if err == nil {
				break
			}
			time.Sleep(125 * time.Millisecond)
		}
		if err != nil {
			return failed(request.ID, errors.New("Rivlet did not initialise browser integration"))
		}
	}
	request.Secret = secret
	conn, err := capture.Dial(350 * time.Millisecond)
	if err != nil {
		if launchErr := launchRivlet(); launchErr != nil {
			return failed(request.ID, launchErr)
		}
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			conn, err = capture.Dial(300 * time.Millisecond)
			if err == nil {
				break
			}
			time.Sleep(125 * time.Millisecond)
		}
	}
	if err != nil {
		return failed(request.ID, fmt.Errorf("could not connect to Rivlet: %w", err))
	}
	defer conn.Close()
	if err = capture.Write(conn, request); err != nil {
		return failed(request.ID, err)
	}
	var response capture.Response
	if err = capture.Read(conn, &response); err != nil {
		return failed(request.ID, err)
	}
	return response
}

func failed(id string, err error) capture.Response {
	return capture.Response{Version: capture.Version, ID: id, OK: false, Error: err.Error()}
}
