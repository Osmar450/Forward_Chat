import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.forwardtecno.forwardchat",
  appName: "Forward_Chat",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    Keyboard: {
      // El teclado redimensiona el body: el composer queda siempre visible
      resize: "body",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#0d0b1a",
    },
  },
};

export default config;
