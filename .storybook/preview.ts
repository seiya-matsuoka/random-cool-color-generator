import type { Preview } from '@storybook/react-vite';
import '../src/index.css';

/** CSS と確認用 viewport を共通化する。保存 hook や実データの読み込みは追加しない。 */
const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    // Story ごとの明示的な action() でイベント名と引数を確認する。play 関数は使用しない。
    viewport: {
      options: {
        desktop: {
          name: 'Desktop 1280',
          styles: { width: '1280px', height: '900px' },
          type: 'desktop',
        },
        mobile: { name: 'Mobile 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
        narrow: { name: 'Narrow 320', styles: { width: '320px', height: '800px' }, type: 'mobile' },
      },
    },
  },
};

export default preview;
