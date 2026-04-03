/**
 * 50 unique worker characters — each sub-agent gets assigned one
 * so parallel workers are visually distinguishable at a glance.
 *
 * Avatar: generated via DiceBear Notionists style using name as seed.
 * Assignment: random pick from unused pool, no duplicates within a swarm.
 */

import { createAvatar } from "@dicebear/core";
import { notionists } from "@dicebear/collection";

export interface WorkerCharacter {
  name: string;
  color: string; // accent color for left-border and status badge
}

export const WORKER_CHARACTERS: WorkerCharacter[] = [
  // ── Scientists & Thinkers ──
  { name: "Curie", color: "#8B5CF6" },
  { name: "Galileo", color: "#3B82F6" },
  { name: "Ada", color: "#0EA5E9" },
  { name: "Euclid", color: "#6366F1" },
  { name: "Edison", color: "#F59E0B" },
  { name: "Tesla", color: "#7C3AED" },
  { name: "Hubble", color: "#4F46E5" },
  { name: "Darwin", color: "#10B981" },
  { name: "Bayes", color: "#0891B2" },
  { name: "Bohr", color: "#6D28D9" },

  // ── Explorers ──
  { name: "Marco", color: "#D97706" },
  { name: "Drake", color: "#2563EB" },
  { name: "Atlas", color: "#059669" },
  { name: "Shackleton", color: "#475569" },
  { name: "Verne", color: "#0284C7" },

  // ── Artists & Writers ──
  { name: "Monet", color: "#EC4899" },
  { name: "Frida", color: "#78716C" },
  { name: "Borges", color: "#92400E" },
  { name: "Wilde", color: "#BE185D" },
  { name: "Bach", color: "#7C2D12" },

  // ── Friendly Names ──
  { name: "Toby", color: "#EA580C" },
  { name: "Milo", color: "#F97316" },
  { name: "Hazel", color: "#A3A3A3" },
  { name: "Bruno", color: "#78716C" },
  { name: "Reed", color: "#525252" },
  { name: "Sage", color: "#854D0E" },
  { name: "Rio", color: "#DC2626" },
  { name: "Finn", color: "#0EA5E9" },
  { name: "Luna", color: "#A855F7" },
  { name: "Buzz", color: "#CA8A04" },

  // ── Mythic ──
  { name: "Thor", color: "#FACC15" },
  { name: "Ember", color: "#EF4444" },
  { name: "Frost", color: "#38BDF8" },
  { name: "Flora", color: "#F472B6" },
  { name: "Shadow", color: "#334155" },
  { name: "Nova", color: "#6366F1" },
  { name: "Gem", color: "#06B6D4" },
  { name: "Ivy", color: "#22C55E" },
  { name: "Nimbus", color: "#94A3B8" },
  { name: "Vulcan", color: "#B91C1C" },

  // ── Abstract ──
  { name: "Oracle", color: "#7E22CE" },
  { name: "Cog", color: "#64748B" },
  { name: "Dart", color: "#E11D48" },
  { name: "Pixel", color: "#8B5CF6" },
  { name: "Chance", color: "#16A34A" },
  { name: "Cipher", color: "#B45309" },
  { name: "Signal", color: "#0369A1" },
  { name: "Scope", color: "#4338CA" },
  { name: "Ward", color: "#475569" },
  { name: "Epoch", color: "#A16207" },
];

/** Generate a Notion-style avatar data URI from a character name. */
export function getWorkerAvatar(name: string): string {
  const avatar = createAvatar(notionists, { seed: name, size: 64 });
  return avatar.toDataUri();
}

/**
 * Randomly pick a character that hasn't been used yet.
 * Pass in the set of indices already assigned to other workers in the same swarm.
 * Returns { index, character } — store the index so you can pass it back next time.
 */
export function pickWorkerCharacter(usedIndices: Set<number>): {
  index: number;
  character: WorkerCharacter;
} {
  const available: number[] = [];
  for (let i = 0; i < WORKER_CHARACTERS.length; i++) {
    if (!usedIndices.has(i)) available.push(i);
  }

  // All 50 exhausted — just pick any random one
  if (available.length === 0) {
    const idx = Math.floor(Math.random() * WORKER_CHARACTERS.length);
    return { index: idx, character: WORKER_CHARACTERS[idx] };
  }

  const idx = available[Math.floor(Math.random() * available.length)];
  return { index: idx, character: WORKER_CHARACTERS[idx] };
}
