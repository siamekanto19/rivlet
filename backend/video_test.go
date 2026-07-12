package backend

import "testing"

func TestVideoProgressParsing(t *testing.T){m:=&Manager{downloads:map[string]*Download{"v":{ID:"v"}}};m.applyVideoProgress("v","250|1000|NA|125|6");d:=m.downloads["v"];if d.DownloadedBytes!=250||d.ProgressPct!=25||d.SpeedBps!=125||d.ETASeconds==nil||*d.ETASeconds!=6{t.Fatalf("unexpected progress: %+v",d)}}
func TestToolErrorIsBounded(t *testing.T){value:=sanitizeToolError(string(make([]byte,800)));if len(value)!=500{t.Fatalf("got %d chars",len(value))}}
