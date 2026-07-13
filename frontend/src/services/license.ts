// Bridge to the Go licensing methods on the Wails App. In the browser/dev
// preview (`window.go` absent) it reports Free and rejects actions that require
// the desktop app, so the License UI can still be designed and viewed.

export interface LicensePolicy {
  tier: string;
  maxActiveDownloads: number;
  maxConnectionsPerDownload: number;
  allowCustomQueues: boolean;
  allowScheduling: boolean;
  allowCompletionActions: boolean;
  allowPerScopeBandwidth: boolean;
  allowProxy: boolean;
  allowHostProfiles: boolean;
  allowStoredCredentials: boolean;
  allowVideoFormatChoice: boolean;
  allowConcurrentFragments: boolean;
  maxVideoHeight: number;
  maxDevices: number;
}

export type LicenseHealth = 'none' | 'active' | 'grace' | 'expired' | 'revoked';

export interface LicenseStatus {
  tier: string;
  health: LicenseHealth;
  licensed: boolean;
  licenseId?: string;
  product?: string;
  edition?: string;
  versionScope?: string;
  deviceId: string;
  deviceName: string;
  deviceLimit?: number;
  issuedAt?: string;
  refreshBy?: string;
  policy: LicensePolicy;
  message?: string;
}

export interface LicenseDevice {
  deviceId: string;
  name: string;
  activatedAt: string;
  lastSeenAt?: string;
  current?: boolean;
}

export const FREE_POLICY: LicensePolicy = {
  tier: 'free',
  maxActiveDownloads: 3,
  maxConnectionsPerDownload: 4,
  allowCustomQueues: false,
  allowScheduling: false,
  allowCompletionActions: false,
  allowPerScopeBandwidth: false,
  allowProxy: false,
  allowHostProfiles: false,
  allowStoredCredentials: false,
  allowVideoFormatChoice: false,
  allowConcurrentFragments: false,
  maxVideoHeight: 720,
  maxDevices: 0,
};

export const FREE_STATUS: LicenseStatus = {
  tier: 'free',
  health: 'none',
  licensed: false,
  deviceId: '',
  deviceName: 'This PC',
  policy: FREE_POLICY,
};

interface AppBridge {
  LicenseStatus?: () => Promise<LicenseStatus>;
  ActivateLicense?: (key: string) => Promise<LicenseStatus>;
  RefreshLicense?: () => Promise<LicenseStatus>;
  DeactivateDevice?: (targetDeviceId: string) => Promise<LicenseStatus>;
  ListLicenseDevices?: () => Promise<LicenseDevice[]>;
  RecoverLicense?: (email: string) => Promise<void>;
  OpenUpgradePage?: () => Promise<void>;
}
interface Runtime {
  EventsOn?: (name: string, cb: (...args: unknown[]) => void) => void;
}

function app(): AppBridge | undefined {
  return (window as unknown as { go?: { main?: { App?: AppBridge } } }).go?.main?.App;
}
function rt(): Runtime | undefined {
  return (window as unknown as { runtime?: Runtime }).runtime;
}

const DESKTOP_ONLY = 'Licensing is only available in the Rivlet desktop app.';

export const licenseService = {
  /** True when running inside the packaged app (Go licensing present). */
  available(): boolean {
    return !!app()?.LicenseStatus;
  },
  async status(): Promise<LicenseStatus> {
    const a = app();
    if (a?.LicenseStatus) {
      try {
        return await a.LicenseStatus();
      } catch {
        /* fall through to Free */
      }
    }
    return FREE_STATUS;
  },
  async activate(key: string): Promise<LicenseStatus> {
    const a = app();
    if (!a?.ActivateLicense) throw new Error(DESKTOP_ONLY);
    return a.ActivateLicense(key);
  },
  async refresh(): Promise<LicenseStatus> {
    const a = app();
    if (!a?.RefreshLicense) throw new Error(DESKTOP_ONLY);
    return a.RefreshLicense();
  },
  async deactivate(targetDeviceId = ''): Promise<LicenseStatus> {
    const a = app();
    if (!a?.DeactivateDevice) throw new Error(DESKTOP_ONLY);
    return a.DeactivateDevice(targetDeviceId);
  },
  async devices(): Promise<LicenseDevice[]> {
    const a = app();
    if (!a?.ListLicenseDevices) throw new Error(DESKTOP_ONLY);
    return (await a.ListLicenseDevices()) ?? [];
  },
  async recover(email: string): Promise<void> {
    const a = app();
    if (!a?.RecoverLicense) throw new Error(DESKTOP_ONLY);
    return a.RecoverLicense(email);
  },
  openUpgrade(): void {
    const a = app();
    if (a?.OpenUpgradePage) {
      void a.OpenUpgradePage();
    } else {
      window.open('https://rivlet.pro/#pricing', '_blank');
    }
  },
  /** Fires when the entitlement changes (activation, refresh, revoke). */
  onChanged(cb: (status: LicenseStatus) => void): void {
    rt()?.EventsOn?.('licenseChanged', (s) => cb(s as LicenseStatus));
  },
};
