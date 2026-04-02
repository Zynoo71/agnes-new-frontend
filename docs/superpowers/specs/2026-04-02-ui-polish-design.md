# Agnes Frontend UI Polish — Design Spec

**Date:** 2026-04-02
**Goal:** Elevate the Agnes chat frontend from dev-tool aesthetics to consumer-product-grade polish, targeting a visual quality comparable to Claude's web app.
**Style direction:** Bubble + Avatar (confirmed via mockup)

---

## 1. Message Area

### Avatar System
- **Assistant avatar:** 28x28px rounded-square (8px radius), brand orange `#c4642d` background, white "A" letter, placed left of message content.
- **User avatar:** 28x28px circle, `#e0ddd7` background, white "U" letter, placed right of the bubble.
- Both avatars align to `flex-start` (top of message).

### Action Buttons
- Replace current text-link buttons (Copy / Edit / Regenerate) with icon-only buttons.
- Buttons appear on hover of the message row (opacity 0 → 1 transition, 150ms).
- Each button: 28x28px, rounded-lg, transparent bg → `surface-hover` on hover.
- Icons: clipboard (copy), pencil (edit), refresh (regenerate).
- Copy still shows "Copied" checkmark feedback (1.5s).

### Message Animation
- New messages enter with CSS animation: `opacity: 0 → 1`, `translateY: 8px → 0`, `150ms ease-out`.
- Apply via a `.animate-message-in` class added on mount.

### Reasoning Block Transition
- Replace hard show/hide with `max-height` + `opacity` transition (200ms ease).
- Use a wrapper div with `overflow: hidden` and transition on `max-height` (0 ↔ 500px) and `opacity` (0 ↔ 1).

---

## 2. Empty State / Welcome Screen

### Layout (when `messages.length === 0`)
- Vertically centered in the message area.
- Components top-to-bottom:
  1. **Logo:** 48x48px rounded-xl, brand orange bg, white "A", `mb-4`.
  2. **Title:** "Hi, how can I help?" — 20px, font-semibold, `text-primary`.
  3. **Subtitle:** "Ask me anything or try a suggestion below" — 13px, `text-tertiary`, `mb-5`.
  4. **Suggestion chips:** 3 pill-shaped buttons, flex-wrap centered, white bg, `border-border`, rounded-full, 12px text. Clicking a chip calls `sendMessage(chipText)`.
  5. **Input box:** Rendered here (not at page bottom) using the same input component, centered, `max-w-xl`.
- After first message is sent, switch to normal layout (input at bottom, messages scrollable).

### Suggestion Chip Content
- "Search the latest AI news"
- "Summarize a research paper"
- "Help me draft an email"

(These are examples; content is hardcoded for now.)

### Footer Disclaimer
- Below the input (both in welcome and normal mode): centered text, 10px, `text-tertiary`:
  "Agnes may make mistakes. Please verify important information."

---

## 3. Code Block Enhancement

### Syntax Highlighting
- Use `shiki` for code highlighting (lighter than react-syntax-highlighter, better Vite compatibility).
- Load a single theme: `github-dark` (matches existing `console-bg` dark block style).
- Wrap in react-markdown custom `components.code` renderer.
- Lazy-load shiki highlighter to avoid blocking initial render.

### Code Block Chrome
- **Language label:** Top-left corner, 10px, `text-tertiary`, shows detected language (from markdown fence info string).
- **Copy button:** Top-right corner, small icon button, semi-transparent bg, appears on hover of the code block.
- **Container:** Existing dark bg (`#1e1e1e`), 12px rounded corners, 1em padding.

---

## 4. Sidebar

### Visual Hierarchy
- Background color changed from `#ffffff` to `#f0ece7` (slightly darker than main `#f7f5f2`).
- Border-right remains `border-light`.

### Active/Hover States
- **Hover:** Left 3px bar in brand orange appears (via `border-left` or pseudo-element), bg transitions to `surface-hover`.
- **Active (selected):** Left 3px bar permanent, bg `accent/10`.

### Collapse/Expand
- Toggle button at sidebar top-right (chevron icon).
- **Expanded:** 260px width (current).
- **Collapsed:** 56px width, only shows logo icon + conversation items as single-letter avatars (first char of title).
- Width transition: 200ms ease.
- Collapsed state stored in component local state (no persistence needed).

### New Chat Button
- Increase border-radius to `rounded-2xl`.
- Add a `+` SVG icon before "New Chat" text.
- In collapsed mode: show only the `+` icon, centered.

---

## 5. Input Area

### Styling
- Border-radius increased to 20px (`rounded-[20px]`).
- Inner padding increased: `px-5 py-3.5`.
- Placeholder text: "Ask Agnes anything..."

### Attachment Button (Placeholder)
- Paperclip SVG icon, left side of input, `text-tertiary`, `opacity-40`, `cursor-not-allowed`.
- No functionality — visual placeholder for future feature.

### Send Button Enhancement
- When input is empty: low contrast (`bg-text-tertiary/30`, no hover effect).
- When input has content: brand orange (`bg-accent`), hover → `bg-accent-hover`.
- Transition: 150ms on background-color.

---

## 6. Animation & Transitions

### Message Enter Animation
```css
@keyframes message-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-message-in {
  animation: message-in 150ms ease-out;
}
```

### Scroll-to-Bottom Button
- Appears when user scrolls up more than 200px from bottom.
- Positioned: fixed to bottom-center of message area, `mb-4`.
- Style: 36x36px circle, `bg-surface` with `shadow-md` and `border-border`, down-arrow icon.
- Clicking scrolls to bottom with `behavior: "smooth"`.
- Fade in/out with opacity transition.

### Sidebar Width Transition
```css
aside { transition: width 200ms ease; }
```

### Reasoning Block Transition
- Wrapper: `overflow: hidden; transition: max-height 200ms ease, opacity 200ms ease;`
- Closed: `max-height: 0; opacity: 0;`
- Open: `max-height: 500px; opacity: 1;`

---

## 7. Typography

### Font Stack Update
```css
font-family: "Inter", "PingFang SC", "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

This ensures Chinese characters render with PingFang SC (macOS native, high quality) before falling back to Noto Sans SC (cross-platform).

---

## 8. Dark Mode

### Strategy
- Auto-detect via `@media (prefers-color-scheme: dark)`.
- Override CSS custom properties in a media query block.
- No manual toggle — keep it simple.

### Color Mapping
| Token | Light | Dark |
|-------|-------|------|
| `background` | `#f7f5f2` | `#1a1a1a` |
| `surface` | `#ffffff` | `#252525` |
| `surface-hover` | `#f5f3f0` | `#2f2f2f` |
| `surface-alt` | `#faf8f6` | `#202020` |
| `border` | `#e9e5df` | `#3a3a3a` |
| `border-light` | `#f0ece7` | `#333333` |
| `text-primary` | `#1b1b18` | `#e5e5e5` |
| `text-secondary` | `#65635d` | `#a0a0a0` |
| `text-tertiary` | `#a09b93` | `#6a6a6a` |
| `accent` | `#c4642d` | `#c4642d` (unchanged) |
| `accent-hover` | `#b35826` | `#d4743d` (slightly lighter for dark bg) |
| `user-bubble` | `#ece9e3` | `#2f2c28` |
| `console-bg` | `#1e1e1e` | `#161616` |
| `console-text` | `#d4d4d4` | `#d4d4d4` (unchanged) |

### What Doesn't Change
- Brand orange accent stays the same.
- Code block already dark — minimal adjustment.
- Shiki theme `github-dark` works for both modes.

---

## Dependencies to Add
- `shiki` — syntax highlighting

## Files to Modify
- `src/index.css` — dark mode variables, animations, font stack
- `src/components/MessageBubble.tsx` — avatars, action buttons, animations, reasoning transition
- `src/panels/ChatPanel.tsx` — empty state, scroll-to-bottom, input styling, disclaimer
- `src/components/Sidebar.tsx` — bg color, active states, collapse/expand
- `src/components/CodeBlock.tsx` — new component for shiki highlighting + copy

## Files to Create
- `src/components/CodeBlock.tsx` — shiki-powered code block with copy + language label
