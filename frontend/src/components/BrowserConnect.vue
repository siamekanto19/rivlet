<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import Icon from './Icon.vue';
import { integration, type BrowserIntegration } from '../services/integration';

const emit = defineEmits<{ (e: 'close'): void }>();

const info = ref<BrowserIntegration | null>(null);
const connected = ref(false);
const copied = ref(false);
const urlCopied = ref(false);
const selectedBrowser = ref('');
const setupStarted = ref(false);

// The internal address of the selected browser's extensions manager. Used as a
// paste-in fallback in case the browser blocks opening it from the command line
// (some managed/enterprise browsers do).
const EXT_URLS: Record<string, string> = {
  chrome: 'chrome://extensions',
  edge: 'edge://extensions',
  brave: 'brave://extensions',
  vivaldi: 'vivaldi://extensions',
  opera: 'opera://extensions',
};
const extUrl = computed(() => EXT_URLS[selectedBrowser.value] ?? 'chrome://extensions');

onMounted(async () => {
  info.value = await integration.get();
  selectedBrowser.value = info.value.browsers[0]?.id ?? '';
  connected.value = info.value.connected;
  integration.onConnected(() => {
    connected.value = true;
  });
});

function openExtensions(id: string) {
  integration.openExtensions(id);
}
function openFolder() {
  integration.openFolder();
}
async function beginSetup() {
  if (!selectedBrowser.value) return;
  setupStarted.value = true;
  copied.value = true;
  await integration.beginSetup(selectedBrowser.value);
}
async function copyPath() {
  if (!info.value) return;
  try {
    await navigator.clipboard.writeText(info.value.extensionDir);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  } catch {
    /* clipboard blocked — the path is shown on screen anyway */
  }
}
async function copyUrl() {
  try {
    await navigator.clipboard.writeText(extUrl.value);
    urlCopied.value = true;
    setTimeout(() => (urlCopied.value = false), 1600);
  } catch {
    /* clipboard blocked — the address is shown on screen anyway */
  }
}
</script>

<template>
  <div class="overlay" @mousedown.self="emit('close')">
    <div class="dialog" role="dialog" aria-label="Connect your browser">
      <div class="head">
        <span class="badge"><Icon name="link" :size="18" /></span>
        <div class="head-text">
          <h2>Connect Rivlet to your browser</h2>
          <p>Catch downloads straight from your browser.</p>
        </div>
        <button class="x" @click="emit('close')" title="Close" aria-label="Close browser setup"><Icon name="close" :size="16" /></button>
      </div>

      <div class="body">
        <!-- what & why -->
        <p class="lead">
          Rivlet includes a small browser extension. Once it's on, clicking a download
          link — or a supported video — hands it to Rivlet instead of your browser's
          basic downloader, so you get pausing, resuming and faster multi-connection
          transfers.
        </p>
        <div class="privacy">
          <Icon name="check" :size="15" />
          <span>
            It's loaded from a folder on <b>this PC</b> (not a web store), talks only to
            Rivlet on your machine, and sends <b>nothing</b> to the internet. You can
            remove it anytime from your browser's extensions page.
          </span>
        </div>

        <!-- connection status -->
        <div class="status" :class="{ ok: connected }">
          <span class="dot" />
          <span v-if="connected">Connected — your browser is linked to Rivlet. You're all set.</span>
          <span v-else>Waiting for the extension… follow the steps below.</span>
        </div>

        <div v-if="!connected" class="quick-setup">
          <select v-model="selectedBrowser" aria-label="Choose browser">
            <option v-for="b in info?.browsers ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
          <button class="btn primary connect" :disabled="!selectedBrowser" @click="beginSetup">
            <Icon name="link" :size="16" /> {{ setupStarted ? 'Setup opened — finish in browser' : 'Connect browser' }}
          </button>
        </div>

        <!-- step 1: open extensions page -->
        <div class="step">
          <span class="num">1</span>
          <div class="step-body">
            <div class="step-title">Open your browser's extensions page</div>
            <div class="hint" style="margin-bottom: 7px">
              “Connect browser” opens it for you. If it doesn't appear (some
              managed browsers block this), paste this address into the address
              bar and press Enter:
            </div>
            <div class="path-row">
              <span class="mono path" :title="extUrl">{{ extUrl }}</span>
              <button class="btn small" @click="copyUrl">
                <Icon name="copy" :size="14" /> {{ urlCopied ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </div>
        </div>

        <!-- step 2: developer mode -->
        <div class="step">
          <span class="num">2</span>
          <div class="step-body">
            <div class="step-title">Turn on “Developer mode”</div>
            <div class="hint">It's the toggle in the top-right corner of that page.</div>
          </div>
        </div>

        <!-- step 3: load unpacked -->
        <div class="step">
          <span class="num">3</span>
          <div class="step-body">
            <div class="step-title">Click “Load unpacked”, then choose this exact folder</div>
            <div class="hint" style="margin-bottom: 7px">
              Pick the folder below — the one that directly contains
              <span class="mono">manifest.json</span>, not its parent.
            </div>
            <div class="path-row">
              <span class="mono path" :title="info?.extensionDir">{{ info?.extensionDir }}</span>
              <button class="btn small" @click="copyPath">
                <Icon name="copy" :size="14" /> {{ copied ? 'Copied' : 'Copy' }}
              </button>
              <button class="btn small" @click="openFolder">
                <Icon name="folder" :size="14" /> Open
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="footer">
        <button class="btn" @click="emit('close')">Do this later</button>
        <button class="btn primary" @click="emit('close')">{{ connected ? 'Done' : 'Got it' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 7vh;
  z-index: 320;
  animation: overlay-in var(--dur-slow) var(--ease-standard);
}
@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.dialog {
  width: 560px;
  max-width: 92vw;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-dialog);
  overflow: hidden;
  animation: dialog-in var(--dur-slow) var(--ease-decel);
}
@keyframes dialog-in {
  from { opacity: 0; transform: translateY(14px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 12px 16px 18px;
  border-bottom: 1px solid var(--border);
}
.badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(145deg, #6fdc79 0%, #4fbf5f 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
:root[data-theme='dark'] .badge {
  color: rgba(0, 0, 0, 0.82);
}
.head-text {
  flex: 1;
  min-width: 0;
}
.head-text h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.head-text p {
  margin: 2px 0 0;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
.x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}
.x:hover {
  background: var(--bg-hover-strong);
  color: var(--text);
}
.body {
  padding: 16px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.lead {
  margin: 0;
  font-size: var(--fs);
  line-height: 1.5;
  color: var(--text);
}
.privacy {
  display: flex;
  gap: 9px;
  padding: 10px 12px;
  background: var(--st-active-bg);
  border: 1px solid color-mix(in srgb, var(--st-active) 22%, transparent);
  border-radius: var(--radius);
  font-size: var(--fs-sm);
  line-height: 1.45;
  color: var(--text-muted);
}
.privacy :deep(svg) {
  color: var(--st-active);
  flex: none;
  margin-top: 1px;
}
.status {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  border-radius: var(--radius);
  font-size: var(--fs-sm);
  font-weight: 500;
  background: var(--bg-subtle);
  color: var(--text-muted);
}
.status .dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: var(--st-paused);
  animation: pulse 1.2s var(--ease-standard) infinite;
}
.status.ok {
  background: var(--st-active-bg);
  color: var(--st-active);
}
.status.ok .dot {
  background: var(--st-active);
  animation: none;
}
.quick-setup {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) 2fr;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--accent-soft-border);
  border-radius: var(--radius-lg);
  background: var(--accent-soft);
}
.quick-setup select {
  min-width: 0;
}
.quick-setup .connect {
  justify-content: center;
  font-weight: 650;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.step {
  display: flex;
  gap: 12px;
}
.num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-text);
  border: 1px solid var(--accent-soft-border);
  font-size: var(--fs-sm);
  font-weight: 700;
}
.step-body {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}
.step-title {
  font-size: var(--fs);
  font-weight: 600;
  margin-bottom: 7px;
}
.hint {
  font-size: var(--fs-sm);
  color: var(--text-faint);
}
.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.btn.small {
  min-width: 0;
  padding: 5px 12px;
  min-height: 30px;
}
.path-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 6px 10px;
  font-size: var(--fs-sm);
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  background: var(--bg-subtle);
}
</style>
