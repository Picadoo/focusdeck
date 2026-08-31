import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.focusdeck.app',
  appName: 'FocusDeck',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    backgroundColor: '#ffffff',
  },
  plugins: {
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      // 不指定 smallIcon 时插件会退回 launcher 图标，而系统只取 alpha 通道，
      // 全不透明的彩色图就渲染成一个纯白方块。
      smallIcon: 'ic_stat_focusdeck',
      iconColor: '#00A76F',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff',
    },
  },
}

export default config
