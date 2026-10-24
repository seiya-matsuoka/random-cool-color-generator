import type { Meta, StoryObj } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { ColorDisplay } from './ColorDisplay';
import { generatedAtLabel, knownRecord } from './story-fixtures';

const meta = {
  title: 'Components/ColorDisplay',
  component: ColorDisplay,
  args: {
    record: knownRecord,
    generatedAtLabel,
    isGenerating: false,
    isFavorite: false,
    favoriteCount: 0,
    favoriteStorage: 'ready',
    onGenerate: () => {
      action('generate-requested')();
    },
    onCopy: (format, text) => {
      action('copy-requested')(format, text);
    },
    onAddFavorite: (record) => {
      action('add-favorite-requested')(record);
    },
    onRemoveFavorite: (hex) => {
      action('remove-favorite-requested')(hex);
    },
  },
  argTypes: {
    favoriteStorage: { control: 'select', options: ['ready', 'unavailable', 'protected'] },
    favoriteCount: { control: { type: 'number', min: 0, max: 20 } },
    onGenerate: { control: false },
    onCopy: { control: false },
    onAddFavorite: { control: false },
    onRemoveFavorite: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Details は初期状態で閉じる。開いてから Controls の生成中状態を変えると、表示の保持とコピー可否を確認できる。日時・色・ハッシュは固定値。',
      },
    },
  },
} satisfies Meta<typeof ColorDisplay>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FixedColor: Story = {};
export const NoColor: Story = { args: { record: null } };
export const InitialGenerating: Story = { args: { record: null, isGenerating: true } };
// 生成中も直前のコードと 64 桁のハッシュを閲覧できる。コピー要求も Actions に残る。
export const Generating: Story = { args: { isGenerating: true } };
export const Favorite: Story = { args: { isFavorite: true, favoriteCount: 1 } };
export const FavoritesFull: Story = { args: { favoriteCount: 20 } };
export const FullButRemovable: Story = { args: { isFavorite: true, favoriteCount: 20 } };
export const FavoritesUnavailable: Story = {
  args: { isFavorite: true, favoriteCount: 1, favoriteStorage: 'unavailable' },
};
export const FavoritesProtected: Story = { args: { favoriteStorage: 'protected' } };
