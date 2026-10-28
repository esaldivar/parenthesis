import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Api } from './api';

describe('Api (Milestone 2 endpoints)', () => {
  let api: Api;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(Api);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  interface Case {
    readonly name: string;
    readonly call: (a: Api) => Promise<unknown>;
    readonly method: string;
    readonly url: string;
    readonly body?: unknown;
  }

  const cases: Case[] = [
    {
      name: 'invite',
      call: (a) => a.invite('f1', 'mom@example.test'),
      method: 'POST',
      url: '/api/families/f1/invitations',
      body: { email: 'mom@example.test' },
    },
    {
      name: 'accept',
      call: (a) => a.acceptInvitation('t0k3n'),
      method: 'POST',
      url: '/api/invitations/accept',
      body: { token: 't0k3n', confirmSeparateFamily: false },
    },
    { name: 'revoke', call: (a) => a.revokeInvitation('f1', 'i1'), method: 'DELETE', url: '/api/families/f1/invitations/i1' },
    {
      name: 'add child',
      call: (a) => a.addChild('f1', 'Kai'),
      method: 'POST',
      url: '/api/families/f1/children',
      body: { firstName: 'Kai' },
    },
    { name: 'approvals', call: (a) => a.approvals('f1'), method: 'GET', url: '/api/families/f1/approvals' },
    { name: 'approve', call: (a) => a.approve('f1', 'r1'), method: 'POST', url: '/api/families/f1/approvals/r1/approve' },
    { name: 'reject', call: (a) => a.reject('f1', 'r1'), method: 'POST', url: '/api/families/f1/approvals/r1/reject' },
    {
      name: 'set PIN',
      call: (a) => a.setChildPin('f1', 'c1', '2580'),
      method: 'PUT',
      url: '/api/families/f1/children/c1/pin',
      body: { pin: '2580' },
    },
    {
      name: 'pairing code',
      call: (a) => a.pairingCode('f1', 'c1'),
      method: 'POST',
      url: '/api/families/f1/children/c1/pairing-code',
    },
    {
      name: 'set up shared device',
      call: (a) => a.setUpSharedDevice('f1', 'Kitchen iPad', '583920'),
      method: 'POST',
      url: '/api/families/f1/devices/household',
      body: { name: 'Kitchen iPad', pin: '583920' },
    },
    { name: 'parent PIN status', call: (a) => a.parentPinStatus('f1'), method: 'GET', url: '/api/families/f1/parent-pin' },
    {
      name: 'set parent PIN',
      call: (a) => a.setParentPin('f1', 'secret password', '583920'),
      method: 'PUT',
      url: '/api/families/f1/parent-pin',
      body: { currentPassword: 'secret password', pin: '583920' },
    },
    {
      name: 'parent PIN sign-in',
      call: (a) => a.parentPinSignIn('m1', '583920'),
      method: 'POST',
      url: '/api/device/parent-session',
      body: { membershipId: 'm1', pin: '583920' },
    },
    { name: 'switch profile', call: (a) => a.switchProfile(), method: 'POST', url: '/api/device/switch' },
    { name: 'remove device', call: (a) => a.removeDevice('f1', 'd1'), method: 'DELETE', url: '/api/families/f1/devices/d1' },
    { name: 'profiles', call: (a) => a.deviceProfiles(), method: 'GET', url: '/api/device/profiles' },
    {
      name: 'child sign-in',
      call: (a) => a.childSignIn('c1', '2580'),
      method: 'POST',
      url: '/api/device/child-session',
      body: { childId: 'c1', pin: '2580' },
    },
    {
      name: 'pair',
      call: (a) => a.pairDevice('K7QM-3RXA', 'Tablet'),
      method: 'POST',
      url: '/api/device/pair',
      body: { code: 'K7QM-3RXA', deviceName: 'Tablet' },
    },
    { name: 'child session', call: (a) => a.childSession(), method: 'GET', url: '/api/session/child' },
    {
      name: 'create event',
      call: (a) => a.createEvent('f1', { category: 'Activity', title: 'Soccer', startsAt: 's', endsAt: 'e' }),
      method: 'POST',
      url: '/api/families/f1/calendar/events',
      body: { category: 'Activity', title: 'Soccer', startsAt: 's', endsAt: 'e' },
    },
    {
      name: 'swap',
      call: (a) => a.updateEvent('f1', 'e1', { caregiverMembershipId: 'm2' }),
      method: 'PATCH',
      url: '/api/families/f1/calendar/events/e1',
      body: { caregiverMembershipId: 'm2' },
    },
    { name: 'cancel event', call: (a) => a.cancelEvent('f1', 'e1'), method: 'DELETE', url: '/api/families/f1/calendar/events/e1' },
  ];

  for (const c of cases) {
    it(`${c.name}: ${c.method} ${c.url}`, async () => {
      const pending = c.call(api);
      const request = http.expectOne(c.url);

      expect(request.request.method).toBe(c.method);
      if (c.body !== undefined) {
        expect(request.request.body).toEqual(c.body);
      }
      request.flush(null);
      await pending;
    });
  }
});
