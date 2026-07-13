import { defineStore } from 'pinia';
import {
  licenseService,
  FREE_STATUS,
  type LicenseStatus,
  type LicenseDevice,
} from '../services/license';

interface UpgradePrompt {
  feature: string;
  detail: string;
}

interface State {
  status: LicenseStatus;
  devices: LicenseDevice[];
  loading: boolean;
  error: string;
  initialized: boolean;
  // When set, a global dialog invites the user to upgrade. Populated by
  // promptUpgrade() the moment a Free user invokes a Pro feature or hits a limit.
  upgradePrompt: UpgradePrompt | null;
}

export const useLicenseStore = defineStore('license', {
  state: (): State => ({
    status: FREE_STATUS,
    devices: [],
    loading: false,
    error: '',
    initialized: false,
    upgradePrompt: null,
  }),
  getters: {
    isPro: (s) => s.status.tier === 'pro',
    policy: (s) => s.status.policy,
    health: (s) => s.status.health,
    /** Pro is active but the certificate needs a reconnect, or was revoked. */
    needsAttention: (s) => s.status.health === 'grace' || s.status.health === 'expired' || s.status.health === 'revoked',
    /** Running inside the desktop app (licensing actions are possible). */
    available: () => licenseService.available(),
  },
  actions: {
    async init() {
      if (this.initialized) return;
      this.initialized = true;
      this.status = await licenseService.status();
      licenseService.onChanged((s) => {
        this.status = s;
      });
    },
    async activate(key: string) {
      this.loading = true;
      this.error = '';
      try {
        this.status = await licenseService.activate(key);
        this.upgradePrompt = null;
        return true;
      } catch (e) {
        this.error = String(e instanceof Error ? e.message : e);
        return false;
      } finally {
        this.loading = false;
      }
    },
    async refresh() {
      this.loading = true;
      this.error = '';
      try {
        this.status = await licenseService.refresh();
        return true;
      } catch (e) {
        this.error = String(e instanceof Error ? e.message : e);
        return false;
      } finally {
        this.loading = false;
      }
    },
    async loadDevices() {
      this.error = '';
      try {
        this.devices = await licenseService.devices();
      } catch (e) {
        this.error = String(e instanceof Error ? e.message : e);
      }
    },
    async deactivate(targetDeviceId = '') {
      this.loading = true;
      this.error = '';
      try {
        this.status = await licenseService.deactivate(targetDeviceId);
        await this.loadDevices();
        return true;
      } catch (e) {
        this.error = String(e instanceof Error ? e.message : e);
        return false;
      } finally {
        this.loading = false;
      }
    },
    async recover(email: string) {
      this.loading = true;
      this.error = '';
      try {
        await licenseService.recover(email);
        return true;
      } catch (e) {
        this.error = String(e instanceof Error ? e.message : e);
        return false;
      } finally {
        this.loading = false;
      }
    },
    /**
     * Invite the user to upgrade. Call this the moment a Free user reaches for a
     * Pro-only feature or hits a Free limit — never proactively. A no-op for Pro.
     */
    promptUpgrade(feature: string, detail = '') {
      if (this.isPro) return;
      this.upgradePrompt = { feature, detail };
    },
    dismissUpgrade() {
      this.upgradePrompt = null;
    },
    openCheckout() {
      licenseService.openUpgrade();
    },
  },
});
