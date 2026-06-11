export type Theme =
  | "dark"
  | "light"
  | "monokai"
  | "solarized"
  | "candy"
  | "dracula"
  | "oneDark"
  | "redWhite"
  | "redDark";

export type ThemeTokens = {
  name: string;
  isLight?: boolean;
  bg: string;
  panel: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentText: string;
  accentRing: string;
  accentHex: string;
  mineBubble: string;
  otherBubble: string;
  text: string;
  textMuted: string;
  onlineText: string;
  onlineDot: string;
  inputBg: string;
  iconBtn: string;
  danger: string;
  preview: { bg: string; bubbleA: string; bubbleB: string; bubbleC: string };
};

export const themes: Record<Theme, ThemeTokens> = {
  dark: {
    name: "Oscuro",
    bg: "bg-[#0d0b1a]",
    panel: "bg-[#13102a]/90",
    border: "border-[#2a2152]",
    borderStrong: "border-[#7c5cff]",
    accent: "bg-[#7c5cff]",
    accentHover: "hover:bg-[#9277ff]",
    accentSoft: "bg-[#7c5cff]/20",
    accentText: "text-[#a78bfa]",
    accentRing: "ring-[#7c5cff]",
    accentHex: "#7c5cff",
    mineBubble: "bg-[#7c5cff]",
    otherBubble: "bg-[#1c1838] border border-[#2a2152]",
    text: "text-slate-100",
    textMuted: "text-slate-400",
    onlineText: "text-[#34d399]",
    onlineDot: "bg-[#34d399]",
    inputBg: "bg-[#1c1838]",
    iconBtn: "bg-[#1c1838] hover:bg-[#251f44] border border-[#2a2152]",
    danger: "bg-[#ef4444] hover:bg-[#f87171]",
    preview: { bg: "bg-gradient-to-br from-[#13102a] to-[#0d0b1a]", bubbleA: "bg-[#7c5cff]", bubbleB: "bg-[#2a2152]", bubbleC: "bg-[#a78bfa]" },
  },
  light: {
    name: "Claro",
    isLight: true,
    bg: "bg-[#f4f4f7]",
    panel: "bg-white/95",
    border: "border-[#e2e2ea]",
    borderStrong: "border-[#7c5cff]",
    accent: "bg-[#7c5cff]",
    accentHover: "hover:bg-[#6b4dff]",
    accentSoft: "bg-[#7c5cff]/15",
    accentText: "text-[#7c5cff]",
    accentRing: "ring-[#7c5cff]",
    accentHex: "#7c5cff",
    mineBubble: "bg-[#7c5cff]",
    otherBubble: "bg-white border border-[#e2e2ea]",
    text: "text-[#1a1530]",
    textMuted: "text-[#6b6880]",
    onlineText: "text-[#10b981]",
    onlineDot: "bg-[#10b981]",
    inputBg: "bg-white",
    iconBtn: "bg-white hover:bg-[#f4f4f7] border border-[#e2e2ea] text-[#1a1530]",
    danger: "bg-[#ef4444] hover:bg-[#dc2626]",
    preview: { bg: "bg-gradient-to-br from-white to-[#f4f4f7]", bubbleA: "bg-[#7c5cff]", bubbleB: "bg-[#e2e2ea]", bubbleC: "bg-[#c4b5fd]" },
  },
  monokai: {
    name: "Monokai",
    bg: "bg-[#1e1f1c]",
    panel: "bg-[#272822]/95",
    border: "border-[#3e3d32]",
    borderStrong: "border-[#a6e22e]",
    accent: "bg-[#a6e22e]",
    accentHover: "hover:bg-[#b6f23e]",
    accentSoft: "bg-[#a6e22e]/20",
    accentText: "text-[#a6e22e]",
    accentRing: "ring-[#a6e22e]",
    accentHex: "#a6e22e",
    mineBubble: "bg-[#f92672]",
    otherBubble: "bg-[#3e3d32] border border-[#49483e]",
    text: "text-[#f8f8f2]",
    textMuted: "text-[#75715e]",
    onlineText: "text-[#a6e22e]",
    onlineDot: "bg-[#a6e22e]",
    inputBg: "bg-[#3e3d32]",
    iconBtn: "bg-[#3e3d32] hover:bg-[#49483e] border border-[#49483e]",
    danger: "bg-[#f92672] hover:bg-[#fb4b8d]",
    preview: { bg: "bg-[#272822]", bubbleA: "bg-[#a6e22e]", bubbleB: "bg-[#f92672]", bubbleC: "bg-[#66d9ef]" },
  },
  solarized: {
    name: "Solarized",
    bg: "bg-[#002b36]",
    panel: "bg-[#073642]/95",
    border: "border-[#0d4a5a]",
    borderStrong: "border-[#268bd2]",
    accent: "bg-[#268bd2]",
    accentHover: "hover:bg-[#3a9fe6]",
    accentSoft: "bg-[#268bd2]/20",
    accentText: "text-[#268bd2]",
    accentRing: "ring-[#268bd2]",
    accentHex: "#268bd2",
    mineBubble: "bg-[#268bd2]",
    otherBubble: "bg-[#073642] border border-[#0d4a5a]",
    text: "text-[#fdf6e3]",
    textMuted: "text-[#93a1a1]",
    onlineText: "text-[#859900]",
    onlineDot: "bg-[#859900]",
    inputBg: "bg-[#073642]",
    iconBtn: "bg-[#073642] hover:bg-[#0d4a5a] border border-[#0d4a5a]",
    danger: "bg-[#dc322f] hover:bg-[#e74c4c]",
    preview: { bg: "bg-[#073642]", bubbleA: "bg-[#268bd2]", bubbleB: "bg-[#2aa198]", bubbleC: "bg-[#859900]" },
  },
  dracula: {
    name: "Dracula",
    bg: "bg-[#282a36]",
    panel: "bg-[#21222c]/95",
    border: "border-[#44475a]",
    borderStrong: "border-[#bd93f9]",
    accent: "bg-[#bd93f9]",
    accentHover: "hover:bg-[#caa6fa]",
    accentSoft: "bg-[#bd93f9]/20",
    accentText: "text-[#bd93f9]",
    accentRing: "ring-[#bd93f9]",
    accentHex: "#bd93f9",
    mineBubble: "bg-[#bd93f9]",
    otherBubble: "bg-[#44475a] border border-[#6272a4]",
    text: "text-[#f8f8f2]",
    textMuted: "text-[#6272a4]",
    onlineText: "text-[#50fa7b]",
    onlineDot: "bg-[#50fa7b]",
    inputBg: "bg-[#21222c]",
    iconBtn: "bg-[#44475a] hover:bg-[#525569] border border-[#6272a4]",
    danger: "bg-[#ff5555] hover:bg-[#ff7777]",
    preview: { bg: "bg-[#282a36]", bubbleA: "bg-[#bd93f9]", bubbleB: "bg-[#ff79c6]", bubbleC: "bg-[#50fa7b]" },
  },
  oneDark: {
    name: "One Dark",
    bg: "bg-[#282c34]",
    panel: "bg-[#21252b]/95",
    border: "border-[#3e4451]",
    borderStrong: "border-[#61afef]",
    accent: "bg-[#61afef]",
    accentHover: "hover:bg-[#7bbef2]",
    accentSoft: "bg-[#61afef]/20",
    accentText: "text-[#61afef]",
    accentRing: "ring-[#61afef]",
    accentHex: "#61afef",
    mineBubble: "bg-[#61afef]",
    otherBubble: "bg-[#3e4451] border border-[#4b5263]",
    text: "text-[#abb2bf]",
    textMuted: "text-[#5c6370]",
    onlineText: "text-[#98c379]",
    onlineDot: "bg-[#98c379]",
    inputBg: "bg-[#21252b]",
    iconBtn: "bg-[#3e4451] hover:bg-[#4b5263] border border-[#4b5263]",
    danger: "bg-[#e06c75] hover:bg-[#ec8189]",
    preview: { bg: "bg-[#282c34]", bubbleA: "bg-[#61afef]", bubbleB: "bg-[#c678dd]", bubbleC: "bg-[#e06c75]" },
  },
  redWhite: {
    name: "Carmesí",
    isLight: true,
    bg: "bg-[#fafafa]",
    panel: "bg-white/95",
    border: "border-[#fecaca]",
    borderStrong: "border-[#dc2626]",
    accent: "bg-[#dc2626]",
    accentHover: "hover:bg-[#ef4444]",
    accentSoft: "bg-[#dc2626]/15",
    accentText: "text-[#dc2626]",
    accentRing: "ring-[#dc2626]",
    accentHex: "#dc2626",
    mineBubble: "bg-[#dc2626]",
    otherBubble: "bg-white border border-[#fecaca]",
    text: "text-[#1f0a0a]",
    textMuted: "text-[#7f1d1d]/60",
    onlineText: "text-[#16a34a]",
    onlineDot: "bg-[#16a34a]",
    inputBg: "bg-white",
    iconBtn: "bg-white hover:bg-[#fef2f2] border border-[#fecaca] text-[#7f1d1d]",
    danger: "bg-[#dc2626] hover:bg-[#b91c1c]",
    preview: { bg: "bg-gradient-to-br from-white to-[#fef2f2]", bubbleA: "bg-[#dc2626]", bubbleB: "bg-[#fecaca]", bubbleC: "bg-[#f87171]" },
  },
  redDark: {
    name: "Carmesí Noche",
    bg: "bg-[#0a0303]",
    panel: "bg-[#150707]/95",
    border: "border-[#3a0d0d]",
    borderStrong: "border-[#dc2626]",
    accent: "bg-[#dc2626]",
    accentHover: "hover:bg-[#ef4444]",
    accentSoft: "bg-[#dc2626]/20",
    accentText: "text-[#f87171]",
    accentRing: "ring-[#dc2626]",
    accentHex: "#dc2626",
    mineBubble: "bg-[#dc2626]",
    otherBubble: "bg-[#1f0808] border border-[#3a0d0d]",
    text: "text-[#fee2e2]",
    textMuted: "text-[#fca5a5]/60",
    onlineText: "text-[#4ade80]",
    onlineDot: "bg-[#4ade80]",
    inputBg: "bg-[#1f0808]",
    iconBtn: "bg-[#1f0808] hover:bg-[#2a0c0c] border border-[#3a0d0d]",
    danger: "bg-[#ef4444] hover:bg-[#f87171]",
    preview: { bg: "bg-gradient-to-br from-[#1f0808] to-[#0a0303]", bubbleA: "bg-[#dc2626]", bubbleB: "bg-[#3a0d0d]", bubbleC: "bg-[#f87171]" },
  },
  candy: {
    name: "Candy Pop",
    isLight: true,
    bg: "bg-[#fff5f8]",
    panel: "bg-white/90",
    border: "border-[#fbcfe8]",
    borderStrong: "border-[#ec4899]",
    accent: "bg-[#ec4899]",
    accentHover: "hover:bg-[#f472b6]",
    accentSoft: "bg-[#ec4899]/20",
    accentText: "text-[#ec4899]",
    accentRing: "ring-[#ec4899]",
    accentHex: "#ec4899",
    mineBubble: "bg-[#ec4899]",
    otherBubble: "bg-white border border-[#fbcfe8]",
    text: "text-[#831843]",
    textMuted: "text-[#9d174d]/60",
    onlineText: "text-[#16a34a]",
    onlineDot: "bg-[#16a34a]",
    inputBg: "bg-white",
    iconBtn: "bg-white hover:bg-[#fce7f3] border border-[#fbcfe8] text-[#831843]",
    danger: "bg-[#ec4899] hover:bg-[#db2777]",
    preview: { bg: "bg-gradient-to-br from-[#fce7f3] to-[#fff5f8]", bubbleA: "bg-[#ec4899]", bubbleB: "bg-[#fbcfe8]", bubbleC: "bg-[#f9a8d4]" },
  },
};

export function getThemeBgColor(t: ThemeTokens): string {
  const m = t.bg.match(/#[0-9a-fA-F]{3,8}/);
  if (m) return m[0];
  if (t.bg.includes("white")) return "#ffffff";
  return "#000000";
}
