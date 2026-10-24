import type { Meta, StoryObj } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { RecordList } from './RecordList';
import { fullFavorites, fullHistory, historyRecords, knownRecord } from './story-fixtures';

const meta = {
  title: 'Components/RecordList',
  component: RecordList,
  args: {
    kind: 'history',
    records: historyRecords,
    selectedRecordId: knownRecord.id,
    favoriteHexes: [knownRecord.hex],
    isGenerating: false,
    historyStorage: 'ready',
    favoriteStorage: 'ready',
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
  },
  argTypes: {
    kind: { control: 'select', options: ['history', 'favorites'] },
    historyStorage: { control: 'select', options: ['ready', 'unavailable', 'protected'] },
    favoriteStorage: { control: 'select', options: ['ready', 'unavailable', 'protected'] },
    headingRef: { control: false },
    onSelect: { control: false },
    onAddFavorite: { control: false },
    onRemoveFavorite: { control: false },
    onClearHistory: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          '見出しを開いて一覧を確認する。既知色の 2 記録は同じ HEX だが、Current record は ID が一致する 1 行だけに表示する。Actions は操作要求のみで、配列の変更・並べ替えは行わない。',
      },
    },
  },
} satisfies Meta<typeof RecordList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const History: Story = {};
export const EmptyHistory: Story = { args: { records: [] } };
export const TwentyHistory: Story = { args: { records: fullHistory } };
// 通常 Story 自体に同じ HEX の別記録を含め、ID と HEX の異なる役割を確認する。
export const Generating: Story = { args: { isGenerating: true } };
export const TabOnlyHistory: Story = { args: { historyStorage: 'unavailable' } };
export const ProtectedHistory: Story = { args: { historyStorage: 'protected' } };
export const EmptyFavorites: Story = {
  args: { kind: 'favorites', records: [], favoriteHexes: [] },
};
export const Favorites: Story = { args: { kind: 'favorites', records: [knownRecord] } };
export const TwentyFavorites: Story = {
  args: {
    kind: 'favorites',
    records: fullFavorites,
    favoriteHexes: fullFavorites.map((record) => record.hex),
  },
};
export const FavoritesUnavailable: Story = {
  args: { kind: 'favorites', records: [knownRecord], favoriteStorage: 'unavailable' },
};
export const FavoritesProtected: Story = {
  args: { kind: 'favorites', records: [knownRecord], favoriteStorage: 'protected' },
};
