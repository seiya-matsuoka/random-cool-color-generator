import { useState } from 'react';
import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import type { Confirmation } from './ConfirmDialog';
import { GeneratorScreen } from './GeneratorScreen';
import {
  confirmations,
  duplicateRecord,
  fullFavorites,
  fullHistory,
  generatedAtLabel,
  historyRecords,
  knownRecord,
  unregisteredRecord,
} from './story-fixtures';

/** 画面内の確認要求をダイアログへつなぐ Story 専用の UI。実データの更新は行わない。 */
function ScreenPreview(args: ComponentProps<typeof GeneratorScreen>) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  return (
    <GeneratorScreen
      {...args}
      confirmation={confirmation}
      onClearHistory={() => {
        args.onClearHistory();
        setConfirmation(
          args.historyStorage === 'unavailable' ? confirmations.clearTab : confirmations.clear,
        );
      }}
      onRemoveFavorite={(hex) => {
        args.onRemoveFavorite(hex);
        setConfirmation({ ...confirmations.remove, targetHex: hex });
      }}
      onReset={(target) => {
        args.onReset(target);
        setConfirmation(
          target === 'history' ? confirmations.resetHistory : confirmations.resetFavorites,
        );
      }}
      onConfirm={() => {
        args.onConfirm();
        setConfirmation(null);
      }}
      onCancel={() => {
        args.onCancel();
        setConfirmation(null);
      }}
    />
  );
}

const meta = {
  title: 'Screens/GeneratorScreen',
  component: GeneratorScreen,
  render: ScreenPreview,
  args: {
    record: knownRecord,
    generatedAtLabel,
    history: historyRecords,
    favorites: [],
    isGenerating: false,
    historyStorage: 'ready',
    favoriteStorage: 'ready',
    notification: null,
    confirmation: null,
    // 通常の関数から action を呼ぶ。args の action 自動 spy 化と手動ログの重複を避ける。
    // 引数の型は Meta の props から検査する。ログ API の戻り値は使わず、void の要求として扱う。
    onGenerate: () => {
      action('generate-requested')();
    },
    onCopy: (format, text) => {
      action('copy-requested')(format, text);
    },
    onSelect: (record) => {
      action('select-record-requested')(record);
    },
    onAddFavorite: (record) => {
      action('add-favorite-requested')(record);
    },
    onRemoveFavorite: (hex) => {
      action('remove-favorite-requested')(hex);
    },
    onClearHistory: () => {
      action('clear-history-requested')();
    },
    onReset: (target) => {
      action('reset-requested')(target);
    },
    onConfirm: () => {
      action('confirmation-accepted')();
    },
    onCancel: () => {
      action('confirmation-cancelled')();
    },
  },
  argTypes: {
    historyStorage: { control: 'select', options: ['ready', 'unavailable', 'protected'] },
    favoriteStorage: { control: 'select', options: ['ready', 'unavailable', 'protected'] },
    confirmation: { control: false },
    onGenerate: { control: false },
    onCopy: { control: false },
    onSelect: { control: false },
    onAddFavorite: { control: false },
    onRemoveFavorite: { control: false },
    onClearHistory: { control: false },
    onReset: { control: false },
    onConfirm: { control: false },
    onCancel: { control: false },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '画面設計の組み合わせを固定データで確認する。Generate / Copy / 一覧選択 / お気に入り操作は Actions へ要求を記録する。削除・解除・Reset は確認 UI だけを開閉し、保存・配列更新は実行しない。Controls で props を変えても Details と一覧の開閉は保持する。',
      },
    },
  },
} satisfies Meta<typeof GeneratorScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Regular: Story = {};
export const Empty: Story = { args: { record: null, history: [] } };
export const InitialGenerating: Story = { args: { record: null, isGenerating: true } };
export const Generating: Story = { args: { isGenerating: true, favorites: [knownRecord] } };
export const InitialFailure: Story = {
  args: {
    record: null,
    notification: { tone: 'error', message: 'Could not generate a color. Please try again.' },
  },
};
export const GenerationFailure: Story = {
  args: {
    notification: { tone: 'error', message: 'Could not generate a color. Please try again.' },
  },
};
// 同じ 20 色でも、未登録色の追加と登録済み色の解除で操作可否が異なる。
export const Full: Story = {
  args: { record: unregisteredRecord, history: fullHistory, favorites: fullFavorites },
};
export const FullButRemovable: Story = { args: { history: fullHistory, favorites: fullFavorites } };
export const SameHexDifferentRecords: Story = {
  args: {
    record: duplicateRecord,
    // 別記録は 123 ms 後の固定値なので、表示日時もその記録に対応させる。
    generatedAtLabel: '2026-10-19 00:00:00.123 UTC+09:00',
    favorites: [knownRecord],
  },
};
export const HistoryUnavailable: Story = {
  args: { historyStorage: 'unavailable', favorites: [knownRecord] },
};
export const FavoritesUnavailable: Story = {
  args: { favoriteStorage: 'unavailable', favorites: [knownRecord] },
};
export const ProtectedHistory: Story = {
  args: { historyStorage: 'protected', favorites: [knownRecord] },
};
export const ProtectedFavorites: Story = { args: { favoriteStorage: 'protected' } };
export const BothProtected: Story = {
  args: { historyStorage: 'protected', favoriteStorage: 'protected' },
};
export const CopySuccess: Story = {
  args: { notification: { tone: 'success', message: 'HEX copied.' } },
};
export const CopyFailure: Story = {
  args: {
    notification: {
      tone: 'error',
      message: 'Could not copy. Select the code and copy it manually.',
    },
  },
};
export const SomeEntriesInvalid: Story = {
  args: {
    notification: { tone: 'warning', message: 'Some saved history entries could not be loaded.' },
  },
};
export const LongMessage: Story = {
  args: {
    notification: {
      tone: 'warning',
      message:
        'Saved history could not be loaded. Check your browser settings or reload. Display-only wrapping sample: verylongunbrokendisplaytextverylongunbrokendisplaytextverylongunbrokendisplaytext.',
    },
  },
};
