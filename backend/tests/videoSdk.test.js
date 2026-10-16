import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// Configure fake credentials BEFORE importing the service so isConfigured()=true.
process.env.VIDEOSDK_API_KEY = 'test-api-key';
process.env.VIDEOSDK_SECRET_KEY = 'test-secret-key';
process.env.VIDEOSDK_API_BASE_URL = 'https://api.test.videosdk';

const svc = await import('../services/videoSdkService.js');
const env = (await import('../config/env.js')).default;

test('VideoSDK token: HS256, apikey + permissions + version 2 claims', () => {
  const token = svc.generateToken({ permissions: svc.PERMS.host, roomId: 'abc-def-ghi', participantId: 'user-1' });
  const decoded = jwt.verify(token, env.VIDEOSDK_SECRET_KEY, { algorithms: ['HS256'] });
  assert.equal(decoded.apikey, 'test-api-key');
  assert.equal(decoded.version, 2);
  assert.equal(decoded.roomId, 'abc-def-ghi');
  assert.equal(decoded.participantId, 'user-1');
  assert.ok(Array.isArray(decoded.permissions));
  assert.ok(decoded.permissions.includes('allow_join'));
  assert.ok(decoded.permissions.includes('allow_mod'));
  // token must be short-lived (expiresIn numeric seconds -> exp present)
  assert.ok(decoded.exp && decoded.iat);
});

test('VideoSDK token: participant perms are least-privilege (no allow_mod)', () => {
  const token = svc.generateToken({ permissions: svc.PERMS.participant });
  const decoded = jwt.verify(token, env.VIDEOSDK_SECRET_KEY, { algorithms: ['HS256'] });
  assert.deepEqual(decoded.permissions, ['allow_join']);
  assert.ok(!decoded.permissions.includes('allow_mod'));
});

test('VideoSDK token: ask_join (gated) permission set', () => {
  const decoded = jwt.verify(svc.generateToken({ permissions: svc.PERMS.gated }), env.VIDEOSDK_SECRET_KEY, { algorithms: ['HS256'] });
  assert.deepEqual(decoded.permissions, ['ask_join']);
});

test('createRoom POSTs to /v2/rooms with prefix-less Authorization and parsed roomId', async () => {
  const calls = [];
  svc.setFetch(async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      status: 200,
      json: async () => ({ roomId: 'Generated-Room-1', customRoomId: 'my-custom', disabled: false, id: '623d49c760a18e699abcc8a4' }),
    };
  });
  const res = await svc.createRoom({ customRoomId: 'my-custom' });
  svc.resetFetch();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.test.videosdk/v2/rooms');
  assert.equal(calls[0].opts.method, 'POST');
  // Authorization must be the raw JWT with NO "Bearer"/"Basic" prefix.
  const auth = calls[0].opts.headers.Authorization;
  assert.ok(typeof auth === 'string' && auth.split('.').length === 3, 'auth is a raw JWT');
  assert.ok(!/^bearer /i.test(auth) && !/^basic /i.test(auth), 'no auth scheme prefix');
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { customRoomId: 'my-custom' });
  assert.equal(res.roomId, 'Generated-Room-1');
});

test('listRooms GETs /v2/rooms with paging query', async () => {
  const calls = [];
  svc.setFetch(async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ pageInfo: { currentPage: 1 }, data: [] }) };
  });
  await svc.listRooms(2, 5);
  svc.resetFetch();
  assert.equal(calls[0].opts.method, 'GET');
  assert.equal(calls[0].url, 'https://api.test.videosdk/v2/rooms?page=2&perPage=5');
});

test('getRoom GETs /v2/rooms/{roomId}', async () => {
  const calls = [];
  svc.setFetch(async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ roomId: 'abc-def-ghi', disabled: false }) };
  });
  await svc.getRoom('abc-def-ghi');
  svc.resetFetch();
  assert.equal(calls[0].url, 'https://api.test.videosdk/v2/rooms/abc-def-ghi');
});

test('deactivateRoom POSTs /v2/rooms/deactivate with roomId body', async () => {
  const calls = [];
  svc.setFetch(async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ disabled: true }) };
  });
  await svc.deactivateRoom('abc-def-ghi');
  svc.resetFetch();
  assert.equal(calls[0].url, 'https://api.test.videosdk/v2/rooms/deactivate');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { roomId: 'abc-def-ghi' });
});

test('provider error surfaces statusCode + VIDEOSDK_ERROR code', async () => {
  svc.setFetch(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Bad room' } }) }));
  await assert.rejects(() => svc.createRoom({ customRoomId: 'x' }), (e) => {
    assert.equal(e.code, 'VIDEOSDK_ERROR');
    assert.equal(e.statusCode, 400);
    assert.match(e.message, /Bad room/);
    return true;
  });
  svc.resetFetch();
});

test('isConfigured reflects credential presence', () => {
  assert.equal(svc.isConfigured(), true);
});
