<template>
  <div class="form-section">
    <div class="form-group">
      <label class="form-label">Match by URL contains (takes priority)</label>
      <input
        class="form-input"
        v-model="(node as any).config.frame.urlContains"
        placeholder="String the frame URL should contain"
      />
    </div>
    <div class="form-group">
      <label class="form-label">Match by index (0-based, sub-frames only)</label>
      <input
        class="form-input"
        v-model="(node as any).config.frame.index"
        placeholder="Index number"
      />
    </div>
    <div class="text-xs text-slate-500" style="padding: 0 20px"
      >Same-origin/injectable frames only; leave empty to return to the top-level page</div
    >
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import type { NodeBase } from '@/entrypoints/background/record-replay/types';
defineProps<{ node: NodeBase }>();
</script>

<style scoped></style>
