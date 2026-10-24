import type { StorybookConfig } from '@storybook/react-vite';

/** 自動初期化を使わず、画面状態の独立確認に必要な機能だけを有効にする。 */
const config: StorybookConfig = {
  framework: { name: '@storybook/react-vite', options: { strictMode: true } },
  stories: ['../src/components/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs'],
  // 今回使わないツール向け manifest・変更追跡・レビュー機能は有効にしない。
  features: {
    componentsManifest: false,
    experimentalDocgenServer: false,
    experimentalReview: false,
    changeDetection: false,
  },
  core: {
    // 設定読込前の boot イベントは、起動スクリプトと CI の環境変数で先に抑止する。
    disableTelemetry: true,
    enableCrashReports: false,
    disableWhatsNewNotifications: true,
  },
  typescript: { reactDocgen: 'react-docgen' },
  async viteFinal(viteConfig, { configType }) {
    const { mergeConfig } = await import('vite');
    // 既存の React / Tailwind プラグインを再利用する。アプリ用の Pages サブパスだけ上書きする。
    // Storybook の静的成果物は相対パスで参照し、アプリの vite.config.ts は変更しない。
    return mergeConfig(viteConfig, { base: configType === 'PRODUCTION' ? './' : '/' });
  },
};

export default config;
