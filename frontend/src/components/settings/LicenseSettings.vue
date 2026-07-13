<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useLicenseStore } from '../../stores/license';
import Icon from '../Icon.vue';

const license = useLicenseStore();

const keyInput = ref('');
const showRecover = ref(false);
const recoverEmail = ref('');
const recoverSent = ref(false);

const status = computed(() => license.status);
const isPro = computed(() => license.isPro);

const benefits = [
  'Up to 16 active downloads (Free: 3)',
  'Up to 16 connections per download (Free: 4)',
  'Unlimited queues, priorities & scheduling',
  'Per-download and per-queue speed limits',
  'Custom proxy, host profiles, saved logins',
  'Full video format choice & high resolution',
  'Use on 3 of your Windows devices',
];

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

async function activate() {
  const key = keyInput.value.trim();
  if (!key) return;
  if (await license.activate(key)) keyInput.value = '';
}

async function sendRecover() {
  if (await license.recover(recoverEmail.value.trim())) {
    recoverSent.value = true;
  }
}

onMounted(() => {
  if (isPro.value && license.available) void license.loadDevices();
});
</script>

<template>
  <div class="license">
    <div class="section-intro">
      <h2>License &amp; devices</h2>
      <p>Grabify Pro is a one-time purchase. Activate this device, manage where your license is used, or recover a lost key.</p>
    </div>

    <!-- current plan -->
    <div class="plan-card" :class="{ pro: isPro }">
      <div class="plan-head">
        <span class="badge" :class="isPro ? 'badge-pro' : 'badge-free'">
          {{ isPro ? 'Pro Lifetime' : 'Free' }}
        </span>
        <span v-if="isPro && status.deviceLimit" class="devices-count">
          {{ status.deviceName }} · {{ status.deviceLimit }} devices allowed
        </span>
      </div>
      <p v-if="!isPro" class="plan-sub">You're on the free tier. Everything works — Pro lifts the limits and unlocks power features.</p>
    </div>

    <!-- attention banner (grace / expired / revoked) -->
    <div v-if="license.needsAttention && status.message" class="banner" :class="status.health">
      <Icon name="info" :size="16" />
      <span>{{ status.message }}</span>
      <button v-if="license.available" class="link" @click="license.refresh()" :disabled="license.loading">Reconnect now</button>
    </div>

    <p v-if="license.error" class="error">{{ license.error }}</p>

    <!-- FREE: upsell + activation -->
    <template v-if="!isPro">
      <ul class="benefits">
        <li v-for="b in benefits" :key="b"><Icon name="check" :size="15" /><span>{{ b }}</span></li>
      </ul>
      <div class="actions">
        <button class="primary" @click="license.openCheckout()">Get Grabify Pro</button>
      </div>

      <div class="field">
        <label>Already bought? Enter your license key</label>
        <div class="row">
          <input v-model="keyInput" placeholder="GRBFY-XXXX-XXXX-XXXX" spellcheck="false" @keyup.enter="activate" />
          <button class="solid" @click="activate" :disabled="license.loading || !keyInput.trim()">
            {{ license.loading ? 'Activating…' : 'Activate' }}
          </button>
        </div>
      </div>
    </template>

    <!-- PRO: license details + device management -->
    <template v-else>
      <dl class="details">
        <div><dt>Product</dt><dd>{{ status.product || 'Grabify Pro' }} · {{ status.edition || 'lifetime' }}</dd></div>
        <div><dt>License</dt><dd class="mono">{{ status.licenseId || '—' }}</dd></div>
        <div><dt>Covers</dt><dd>Grabify {{ status.versionScope || '1.x' }}</dd></div>
        <div><dt>Validated until</dt><dd>{{ fmtDate(status.refreshBy) }}</dd></div>
      </dl>

      <div class="devices">
        <div class="devices-head">
          <h3>Your devices</h3>
          <button class="link" @click="license.loadDevices()" :disabled="!license.available">Refresh</button>
        </div>
        <ul v-if="license.devices.length" class="device-list">
          <li v-for="d in license.devices" :key="d.deviceId">
            <div class="d-info">
              <span class="d-name">{{ d.name }}<span v-if="d.current" class="you">this device</span></span>
              <span class="d-meta">Activated {{ fmtDate(d.activatedAt) }}</span>
            </div>
            <button class="danger-link" @click="license.deactivate(d.deviceId)" :disabled="license.loading">
              {{ d.current ? 'Deactivate' : 'Remove' }}
            </button>
          </li>
        </ul>
        <p v-else class="muted">No other devices, or device list unavailable offline.</p>
      </div>

      <div class="actions">
        <button class="solid" @click="license.refresh()" :disabled="license.loading || !license.available">Refresh license</button>
      </div>
    </template>

    <!-- recover key -->
    <div class="recover">
      <button class="link" @click="showRecover = !showRecover">Lost your key? Recover it</button>
      <div v-if="showRecover" class="recover-body">
        <p v-if="recoverSent" class="muted">If a license exists for that email, we've sent the key to it.</p>
        <div v-else class="row">
          <input v-model="recoverEmail" type="email" placeholder="you@example.com" spellcheck="false" />
          <button class="solid" @click="sendRecover" :disabled="license.loading || !recoverEmail.trim()">Send</button>
        </div>
      </div>
    </div>

    <p v-if="!license.available" class="muted note">License activation runs in the Grabify desktop app.</p>
  </div>
</template>

<style scoped>
.license { display: flex; flex-direction: column; gap: 16px; }
.plan-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  background: var(--bg-subtle);
}
.plan-card.pro { border-color: var(--accent-soft-border); background: var(--accent-soft); }
.plan-head { display: flex; align-items: center; gap: 12px; }
.badge { font-size: var(--fs-xs); font-weight: 700; padding: 3px 9px; border-radius: 999px; letter-spacing: 0.02em; }
.badge-free { background: var(--bg-hover-strong); color: var(--text-muted); }
.badge-pro { background: var(--accent); color: var(--text-on-accent); }
.devices-count { font-size: var(--fs-sm); color: var(--text-muted); }
.plan-sub { margin: 8px 0 0; font-size: var(--fs-sm); color: var(--text-muted); }
.banner {
  display: flex; align-items: center; gap: 9px;
  padding: 10px 12px; border-radius: var(--radius-lg);
  font-size: var(--fs-sm); background: var(--bg-hover-strong);
}
.banner.grace { background: var(--accent-soft); }
.banner.expired, .banner.revoked { background: color-mix(in srgb, #d64545 14%, transparent); }
.banner .link { margin-left: auto; }
.benefits { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.benefits li { display: flex; align-items: center; gap: 9px; font-size: var(--fs-sm); }
.benefits li :deep(svg) { color: var(--accent); flex: none; }
.details { display: grid; gap: 10px; margin: 0; }
.details > div { display: flex; justify-content: space-between; gap: 12px; font-size: var(--fs-sm); }
.details dt { color: var(--text-muted); margin: 0; }
.details dd { margin: 0; text-align: right; }
.mono { font-family: var(--font-mono, monospace); }
.devices-head { display: flex; align-items: center; justify-content: space-between; }
.devices-head h3 { margin: 0; font-size: 13px; font-weight: 650; }
.device-list { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; }
.device-list li {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-lg);
}
.d-info { display: flex; flex-direction: column; gap: 2px; }
.d-name { font-size: var(--fs-sm); font-weight: 600; display: flex; align-items: center; gap: 8px; }
.you { font-size: var(--fs-xs); font-weight: 600; color: var(--text-on-accent); background: var(--accent); padding: 1px 7px; border-radius: 999px; }
.d-meta { font-size: var(--fs-xs); color: var(--text-muted); }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: var(--fs-sm); color: var(--text-muted); }
.row { display: flex; gap: 8px; }
.row input { flex: 1; height: 32px; padding: 0 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-lg); background: var(--bg-surface); color: var(--text); }
.actions { display: flex; gap: 10px; }
button { height: 32px; padding: 0 15px; border-radius: var(--radius-lg); font-weight: 600; font-size: var(--fs-sm); border: 1px solid transparent; }
.primary, .solid { background: var(--accent); color: var(--text-on-accent); }
.primary:hover, .solid:hover { background: var(--accent-hover); }
.solid:disabled, .primary:disabled { opacity: 0.5; }
.link { background: transparent; border: none; color: var(--accent-text-link, var(--accent)); font-weight: 600; padding: 0; height: auto; cursor: pointer; }
.danger-link { background: transparent; border: none; color: #d64545; font-weight: 600; padding: 0; height: auto; }
.recover-body { margin-top: 8px; }
.muted { color: var(--text-muted); font-size: var(--fs-sm); }
.note { margin: 0; }
.error { color: #d64545; font-size: var(--fs-sm); margin: 0; }
</style>
