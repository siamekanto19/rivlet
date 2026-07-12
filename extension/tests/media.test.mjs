import test from 'node:test';
import assert from 'node:assert/strict';
import { currentCandidates, isMediaURL, isSiteDisabled } from '../.test/media.mjs';

test('recognises supported HTTP media candidates only',()=>{
  assert.equal(isMediaURL('https://cdn.test/video.m3u8?token=1'),true);
  assert.equal(isMediaURL('https://cdn.test/video.mp4'),true);
  assert.equal(isMediaURL('blob:https://site.test/id'),false);
  assert.equal(isMediaURL('javascript:alert(1)'),false);
});

test('site exclusions include subdomains but not suffix attacks',()=>{
  assert.equal(isSiteDisabled('media.example.com',['example.com']),true);
  assert.equal(isSiteDisabled('badexample.com',['example.com']),false);
});

test('candidate TTL removes stale observations and strips timestamps',()=>{
  assert.deepEqual(currentCandidates([{url:'https://a/v.mp4',seenAt:950},{url:'https://a/old.mpd',seenAt:1}],1000),[
    {url:'https://a/v.mp4',kind:undefined},{url:'https://a/old.mpd',kind:undefined},
  ]);
  assert.deepEqual(currentCandidates([{url:'https://a/old.mpd',seenAt:1}],200_002),[]);
});
