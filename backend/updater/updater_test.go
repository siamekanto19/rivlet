package updater

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"testing"
)

func TestManifestSignature(t *testing.T){pub,priv,err:=ed25519.GenerateKey(rand.Reader);if err!=nil{t.Fatal(err)};m:=Manifest{Version:"1.2.3",URL:"https://updates.example/yt-dlp.exe",SHA256:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"};m.Signature=base64.StdEncoding.EncodeToString(ed25519.Sign(priv,[]byte(m.Version+"\n"+m.URL+"\n"+m.SHA256)));u:=Updater{PublicKey:pub};if err=u.VerifyManifest(m);err!=nil{t.Fatal(err)};m.URL="https://attacker.example/tool";if err=u.VerifyManifest(m);err==nil{t.Fatal("tampered manifest was accepted")}}
