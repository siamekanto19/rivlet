package updater

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const maxToolSize = 150 << 20

type Manifest struct { Version string `json:"version"`; URL string `json:"url"`; SHA256 string `json:"sha256"`; Signature string `json:"signature"` }
type Updater struct { Client *http.Client; PublicKey ed25519.PublicKey }

func (u Updater) FetchManifest(ctx context.Context, rawURL string) (Manifest, error) {
	if !strings.HasPrefix(rawURL,"https://") { return Manifest{}, errors.New("update manifest must use HTTPS") }
	req,_:=http.NewRequestWithContext(ctx,http.MethodGet,rawURL,nil);resp,err:=u.client().Do(req);if err!=nil{return Manifest{},err};defer resp.Body.Close();if resp.StatusCode!=http.StatusOK{return Manifest{},fmt.Errorf("manifest returned %s",resp.Status)}
	var m Manifest;if err=json.NewDecoder(io.LimitReader(resp.Body,1<<20)).Decode(&m);err!=nil{return Manifest{},err};if err=u.VerifyManifest(m);err!=nil{return Manifest{},err};return m,nil
}
func (u Updater) VerifyManifest(m Manifest) error {
	if len(u.PublicKey)!=ed25519.PublicKeySize{return errors.New("updater public key is not configured")}
	if !strings.HasPrefix(m.URL,"https://")||m.Version==""||len(m.SHA256)!=64{return errors.New("invalid update manifest")}
	sig,err:=base64.StdEncoding.DecodeString(m.Signature);if err!=nil{return err};message:=[]byte(m.Version+"\n"+m.URL+"\n"+strings.ToLower(m.SHA256));if !ed25519.Verify(u.PublicKey,message,sig){return errors.New("update manifest signature is invalid")};return nil
}
func (u Updater) Install(ctx context.Context,m Manifest,target string) error {
	if err:=u.VerifyManifest(m);err!=nil{return err};req,_:=http.NewRequestWithContext(ctx,http.MethodGet,m.URL,nil);resp,err:=u.client().Do(req);if err!=nil{return err};defer resp.Body.Close();if resp.StatusCode!=http.StatusOK{return fmt.Errorf("tool download returned %s",resp.Status)}
	if err=os.MkdirAll(filepath.Dir(target),0755);err!=nil{return err};stage:=target+".new";file,err:=os.OpenFile(stage,os.O_CREATE|os.O_TRUNC|os.O_WRONLY,0755);if err!=nil{return err};hash:=sha256.New();written,copyErr:=io.Copy(io.MultiWriter(file,hash),io.LimitReader(resp.Body,maxToolSize+1));closeErr:=file.Close();if copyErr!=nil{return copyErr};if closeErr!=nil{return closeErr};if written>maxToolSize{_ = os.Remove(stage);return errors.New("tool update exceeds size limit")};if hex.EncodeToString(hash.Sum(nil))!=strings.ToLower(m.SHA256){_ = os.Remove(stage);return errors.New("tool update hash mismatch")}
	if output,runErr:=exec.CommandContext(ctx,stage,"--version").CombinedOutput();runErr!=nil||len(output)==0{_ = os.Remove(stage);return errors.New("updated tool failed self-check")}
	backup:=target+".previous";_ = os.Remove(backup);if _,err=os.Stat(target);err==nil{if err=os.Rename(target,backup);err!=nil{return err}};if err=os.Rename(stage,target);err!=nil{_ = os.Rename(backup,target);return err};return nil
}
func Rollback(target string) error { backup:=target+".previous";if _,err:=os.Stat(backup);err!=nil{return errors.New("no previous tool version is available")};failed:=target+".failed";_ = os.Remove(failed);_ = os.Rename(target,failed);if err:=os.Rename(backup,target);err!=nil{_ = os.Rename(failed,target);return err};return nil }
func (u Updater) client()*http.Client{if u.Client!=nil{return u.Client};return http.DefaultClient}
