<script lang="ts" setup>
import { computed } from 'vue';
import { useLicenseStore } from '../../stores/license';
import Modal from './Modal.vue';
import Icon from '../Icon.vue';

const license = useLicenseStore();
const prompt = computed(() => license.upgradePrompt);

const benefits = [
  '16 active downloads and 16 connections per file',
  'Unlimited queues, priorities and scheduling',
  'Per-download & per-queue speed limits',
  'Custom proxy, host profiles and saved logins',
  'Full video format choice and high resolution',
  'Use on 3 of your Windows devices',
];

function buy() {
  license.openCheckout();
}
function later() {
  license.dismissUpgrade();
}
</script>

<template>
  <Modal v-if="prompt" :title="'Unlock ' + prompt.feature + ' with Pro'" width="480px" @close="later">
    <p class="lead">
      {{ prompt.detail || (prompt.feature + ' is part of Grabify Pro.') }}
      A one-time purchase — no subscription, no account required.
    </p>
    <ul class="benefits">
      <li v-for="b in benefits" :key="b">
        <Icon name="check" :size="15" />
        <span>{{ b }}</span>
      </li>
    </ul>
    <template #footer>
      <button class="ghost" @click="later">Maybe later</button>
      <button class="primary" @click="buy">Get Grabify Pro</button>
    </template>
  </Modal>
</template>

<style scoped>
.lead {
  margin: 4px 0 14px;
  color: var(--text-muted);
  font-size: var(--fs-sm);
  line-height: 1.55;
}
.benefits {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 9px;
}
.benefits li {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: var(--fs-sm);
}
.benefits li :deep(svg) {
  color: var(--accent);
  flex: none;
}
button {
  height: 32px;
  padding: 0 16px;
  border-radius: var(--radius-lg);
  font-weight: 600;
  font-size: var(--fs-sm);
  border: 1px solid transparent;
}
.ghost {
  background: transparent;
  border-color: var(--border-strong);
  color: var(--text);
}
.ghost:hover {
  background: var(--bg-hover-strong);
}
.primary {
  background: var(--accent);
  color: var(--text-on-accent);
}
.primary:hover {
  background: var(--accent-hover);
}
</style>
