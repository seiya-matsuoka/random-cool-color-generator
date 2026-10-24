import type { Meta, StoryObj } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { Notice } from './Notice';

const meta = {
  title: 'Components/Notice',
  component: Notice,
  args: {
    tone: 'success',
    message: 'HEX copied.',
    onAction: () => {
      action('recovery-requested')();
    },
  },
  argTypes: {
    tone: { control: 'select', options: ['success', 'error', 'warning'] },
    live: { control: 'select', options: ['polite', 'assertive', 'off'] },
    onAction: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          '成功通知は穏やかな status、エラーは alert。保存障害は消去タイマーを持たず、復旧操作が必要な間は表示する。Story は API の失敗を起こさず、通知の props を固定する。',
      },
    },
  },
} satisfies Meta<typeof Notice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CopySuccess: Story = {};
export const CopyFailure: Story = {
  args: { tone: 'error', message: 'Could not copy. Select the code and copy it manually.' },
};
export const GenerationFailure: Story = {
  args: { tone: 'error', message: 'Could not generate a color. Please try again.' },
};
export const HistoryUnavailable: Story = {
  args: {
    tone: 'warning',
    message: 'History could not be saved. New history is available in this tab until you reload.',
  },
};
export const FavoritesUnavailable: Story = {
  args: { tone: 'warning', message: 'Could not save favorites. Your favorites were not changed.' },
};
export const SomeEntriesInvalid: Story = {
  args: { tone: 'warning', message: 'Some saved history entries could not be loaded.' },
};
export const ProtectedHistory: Story = {
  args: {
    tone: 'warning',
    message: 'Saved history could not be read. Reset it to enable saving again.',
    actionLabel: 'Reset history',
  },
};
export const ProtectedFavorites: Story = {
  args: {
    tone: 'warning',
    message: 'Saved favorites could not be read. Reset them to enable saving again.',
    actionLabel: 'Reset favorites',
  },
};
// 長い単語も折り返すことを確認するための表示データ。実際の例外全文を UI に流す用途ではない。
export const LongMessage: Story = {
  args: {
    tone: 'warning',
    message:
      'Saved history could not be loaded. Check your browser settings or reload. Display-only wrapping sample: verylongunbrokendisplaytextverylongunbrokendisplaytextverylongunbrokendisplaytext.',
  },
};
